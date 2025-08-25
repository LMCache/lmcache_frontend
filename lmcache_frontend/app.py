# SPDX-License-Identifier: Apache-2.0
import argparse
import json
import os
from urllib.parse import unquote

import httpx
import pkg_resources  # type: ignore
import uvicorn
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse, PlainTextResponse

# Create router
router = APIRouter()

# Global variable to store target nodes
target_nodes = []


# Load configuration file
def load_config(config_path=None):
    global target_nodes
    try:
        # Prioritize user-specified configuration file
        if config_path:
            with open(config_path, "r") as f:
                target_nodes = json.load(f)
            print(
                f"Loaded {len(target_nodes)} target nodes from specified path: {config_path}"
            )
        else:
            # Use package resource path as default configuration
            default_config_path = pkg_resources.resource_filename(
                "lmcache_frontend", "config.json"
            )
            with open(default_config_path, "r") as f:
                target_nodes = json.load(f)
            print(f"Loaded default configuration with {len(target_nodes)} target nodes")
    except Exception as e:
        print(f"Failed to load configuration file: {e}")
        target_nodes = []


def validate_node(node):
    """Validate a single node configuration"""
    if not isinstance(node, dict):
        return False

    required_keys = {"name", "host", "port"}
    if not required_keys.issubset(node.keys()):
        return False
    return True


def validate_nodes(nodes):
    """Validate list of nodes"""
    if not isinstance(nodes, list):
        return False

    return all(validate_node(node) for node in nodes)


@router.get("/api/nodes")
async def get_nodes():
    """Get all target nodes"""
    return {"nodes": target_nodes}


@router.api_route(
    "/proxy/{target_host}/{target_port_or_socket}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_request(
    request: Request, target_host: str, target_port_or_socket: str, path: str
):
    """Proxy requests to the specified target host and port or socket path"""
    target_port_or_socket = unquote(target_port_or_socket)
    # Check if target_port_or_socket is a socket path (contains '/')
    is_socket_path = "/" in target_port_or_socket

    if is_socket_path:
        # For socket paths, use UDS transport
        socket_path = target_port_or_socket
        target_url = f"http://localhost/{path}"

        # Create UDS transport
        transport = httpx.AsyncHTTPTransport(uds=socket_path)
    else:
        port = int(target_port_or_socket)
        target_url = f"http://{target_host}:{port}/{path}"
        transport = None  # Use default transport

    headers = {}
    for key, value in request.headers.items():
        if key.lower() in [
            "host",
            "content-length",
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailers",
            "transfer-encoding",
            "upgrade",
        ]:
            continue
        headers[key] = value

    body = await request.body()

    # Create client with appropriate transport
    async with httpx.AsyncClient(transport=transport) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
                timeout=60.0,
            )

            response_headers = {}
            for key, value in response.headers.items():
                if key.lower() in [
                    "connection",
                    "keep-alive",
                    "proxy-authenticate",
                    "proxy-authorization",
                    "the",
                    "trailers",
                    "transfer-encoding",
                    "upgrade",
                ]:
                    continue
                response_headers[key] = value

            return PlainTextResponse(
                content=response.content,
                headers=response_headers,
                media_type=response.headers.get("content-type", "text/plain"),
                status_code=response.status_code,
            )

        except httpx.ConnectError as e:
            if is_socket_path:
                detail = f"Failed to connect to socket: {socket_path}"
            else:
                detail = f"Failed to connect to target service {target_host}:{port}"
            raise HTTPException(status_code=502, detail=detail) from e
        except httpx.TimeoutException as e:
            if is_socket_path:
                detail = f"Connection to socket {socket_path} timed out"
            else:
                detail = f"Connection to target service {target_host}:{port} timed out"
            raise HTTPException(status_code=504, detail=detail) from e
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Error communicating with target service: {str(e)}",
            ) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}") from e


@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "lmcache-monitor"}


@router.get("/")
async def serve_frontend():
    """Return the frontend homepage"""
    try:
        # Use package resource path
        index_path = pkg_resources.resource_filename(
            "lmcache_frontend", "static/index.html"
        )
        return FileResponse(index_path)
    except Exception:
        # Development environment uses local files
        return FileResponse("static/index.html")


def create_app():
    """Create and configure FastAPI application"""
    app = FastAPI(
        title="Flexible Proxy Server",
        description="HTTP proxy service supporting specified target hosts and ports",
    )
    app.include_router(router)

    # Get static file path (prefer package resources)
    try:
        static_path = pkg_resources.resource_filename("lmcache_frontend", "static")
    except Exception:
        static_path = os.path.join(os.path.dirname(__file__), "static")

    # Mount static file service
    app.mount("/static", StaticFiles(directory=static_path), name="static")

    return app


def main():
    parser = argparse.ArgumentParser(description="LMCache Cluster Monitoring Tool")
    parser.add_argument(
        "--port", type=int, default=8000, help="Service port, default 8000"
    )
    parser.add_argument(
        "--host", type=str, default="0.0.0.0", help="Bind host address, default 0.0.0.0"
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Specify configuration file path, default uses internal config.json",
    )
    parser.add_argument(
        "--nodes",
        type=str,
        default=None,
        help="Directly specify target nodes as a JSON string. "
        'Example: \'[{"name":"node1","host":"127.0.0.1","port":8001}]\'',
    )

    args = parser.parse_args()

    global target_nodes

    if args.nodes:
        try:
            nodes = json.loads(args.nodes)
            if validate_nodes(nodes):
                target_nodes = nodes
                print(
                    f"Loaded {len(target_nodes)} target nodes from command line argument"
                )
            else:
                print("Invalid nodes format. Please check your input.")
                exit(1)
        except json.JSONDecodeError:
            print("Failed to parse nodes JSON. Please check your input format.")
            exit(1)
    if args.config:
        load_config(args.config)

    app = create_app()
    print(f"Monitoring service running at http://{args.host}:{args.port}")
    print(f"Node management: http://{args.host}:{args.port}/static/index.html")

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
