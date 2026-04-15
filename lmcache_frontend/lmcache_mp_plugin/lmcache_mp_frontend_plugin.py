#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""MP mode frontend plugin for LMCache multiprocess server.

Launched by MPRuntimePluginLauncher via ``--runtime-plugin-locations``.
Reads the aggregated config from ``LMCACHE_RUNTIME_PLUGIN_CONFIG``,
builds argv for the frontend app, and calls ``app.main()``.

Config JSON structure (MP mode)::

    {
      "mp_config": { ... },
      "storage_manager_config": { ... },
      "obs_config": { ... },
      "http_frontend_config": {
        "http_host": "0.0.0.0",
        "http_port": 8085,
        "http_socket_path": null
      },
      "runtime_plugin_extra_config": {
        "plugin.frontend.heartbeat_url": "http://...",
        ...
      }
    }

The ``http_frontend_config`` is forwarded by ``server.py`` so the
plugin can automatically derive the LMCache HTTP port without any
extra flags.
"""

# Standard
import json
import os
import signal
import sys

# Ensure the project root is on sys.path so ``lmcache_frontend`` can be
# imported regardless of how this plugin script is launched (e.g. via
# importlib exec without a package context).
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(os.path.dirname(_PLUGIN_DIR))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Third Party
from lmcache_frontend import app  # noqa: E402

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------


def _handle_exit(signum, frame):
    print("[mp_frontend] Received termination signal, exiting...")
    sys.exit(0)


signal.signal(signal.SIGTERM, _handle_exit)
signal.signal(signal.SIGINT, _handle_exit)


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _parse_mp_config() -> dict:
    raw = os.getenv("LMCACHE_RUNTIME_PLUGIN_CONFIG", "")
    if not raw:
        print("[mp_frontend] WARNING: LMCACHE_RUNTIME_PLUGIN_CONFIG is empty")
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        print("[mp_frontend] ERROR: failed to parse config: %s" % exc)
        return {}


def _extra_cfg(config: dict) -> dict:
    """Return ``plugin.frontend.*`` extra config dict.

    Reads ``runtime_plugin_extra_config`` from the top-level of the
    aggregated ``LMCACHE_RUNTIME_PLUGIN_CONFIG`` JSON::

        {
          "runtime_plugin_extra_config": {   <- this dict
            "plugin.frontend.heartbeat_url": "...",
            ...
          }
        }
    """
    return config.get("runtime_plugin_extra_config") or {}


# ---------------------------------------------------------------------------
# Build argv and run
# ---------------------------------------------------------------------------

config = _parse_mp_config()
extra = _extra_cfg(config)
http_cfg = config.get("http_frontend_config", {})

print("[mp_frontend] config keys: %s" % list(config.keys()))
print("[mp_frontend] extra_cfg: %s" % json.dumps(extra, default=str))

sys.argv = [sys.argv[0]]

# Forward all plugin.frontend.* keys as CLI args to app.main().
for key, value in extra.items():
    if key.startswith("plugin.frontend."):
        arg_name = "--" + key.replace("plugin.frontend.", "").replace("_", "-")
        sys.argv.extend([arg_name, str(value)])

# Build the lmcache server node entry so the frontend can proxy to it.
# http_frontend_config is forwarded by server.py via MPRuntimePluginLauncher.
socket_path = http_cfg.get("http_socket_path")
if socket_path:
    lmc_node = {"name": "lmcache_server", "host": "localhost", "port": socket_path}
else:
    lmc_host = http_cfg.get("http_host", "localhost")
    # 0.0.0.0 is a listen address, not a connectable address
    if lmc_host in ("0.0.0.0", "::"):
        lmc_host = "localhost"
    lmc_port = http_cfg.get("http_port", 8080)
    lmc_node = {"name": "lmcache_server", "host": lmc_host, "port": str(lmc_port)}

sys.argv.extend(["--nodes", json.dumps([lmc_node])])

# --port is used by heartbeat to build api_address; set it to the
# lmcache HTTP port so the reported address is correct.
_lmcache_port = http_cfg.get("http_port")
if _lmcache_port:
    sys.argv.extend(["--port", str(_lmcache_port)])

sys.argv.append("--no-http")

print("[mp_frontend] Starting frontend application...")
print("[mp_frontend] argv: %s" % sys.argv)

app.main()
