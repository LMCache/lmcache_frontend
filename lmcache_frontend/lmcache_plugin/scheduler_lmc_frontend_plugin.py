#!/opt/venv/bin/python
# SPDX-License-Identifier: Apache-2.0
"""Example plugin for LMCache system
This plugin runs continuously and exits when parent process terminates"""

# Standard
import json
import os
import signal
import sys

# First Party
try:
    from lmcache.integration.vllm.utils import (
        lmcache_get_or_create_config as get_config,
    )
except ImportError:
    from lmcache.integration.vllm.utils import lmcache_get_config as get_config

from lmcache.v1.config import LMCacheEngineConfig
from lmcache.v1.internal_api_server.utils import get_all_server_infos

try:
    from lmcache_frontend import app
except ImportError:
    from .lmcache_frontend import app  # type: ignore


# Graceful exit handler
def handle_exit(signum, frame):
    print("Received termination signal, exiting...")
    exit(0)


signal.signal(signal.SIGTERM, handle_exit)

worker_id = os.getenv("LMCACHE_PLUGIN_WORKER_ID")
worker_count = int(os.getenv("LMCACHE_PLUGIN_WORKER_COUNT", "0"))
role = os.getenv("LMCACHE_PLUGIN_ROLE")
config_str = os.getenv("LMCACHE_PLUGIN_CONFIG")
try:
    config = LMCacheEngineConfig.from_json(config_str)
except Exception as e:
    print(f"Error parsing LMCACHE_PLUGIN_CONFIG: {e}")
    config = get_config()

print(f"Python plugin running with role: {role}")
print(f"Config: {config}")

nodes = get_all_server_infos(config, worker_count)
port = config.extra_config.get(
    "plugin.frontend.port", os.getenv("LMCACHE_FRONTEND_PORT")
)

sys.argv = [
    sys.argv[0],
    "--port",
    str(int(port)) if port is not None else "8000",
    "--host",
    "0.0.0.0",
]

for key, value in config.extra_config.items():
    if key.startswith("plugin.frontend."):
        arg_name = "--" + key.replace("plugin.frontend.", "")
        sys.argv.extend([arg_name, str(value)])
if nodes:
    if isinstance(nodes, (list, dict)):
        nodes = json.dumps(nodes)
    sys.argv.extend(["--nodes", nodes])

app.main()
