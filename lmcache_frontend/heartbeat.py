# SPDX-License-Identifier: Apache-2.0
"""Heartbeat service module for periodic health reporting"""

import asyncio
import json
import os
import socket
import threading
from datetime import datetime

import httpx


class HeartbeatService:
    """Periodic heartbeat service to report system status"""

    def __init__(self):
        self.thread = None
        self.stop_event = threading.Event()
        self.startup_time = datetime.now()
        self.app_host = "0.0.0.0"
        self.app_port = 8000
        self.target_nodes = []

    def get_local_ip(self):
        """
        Get the local IP address of the machine.
        """
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # "Connect" to a public IP — just to determine local IP
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except Exception:
            print("Failed to get local IP address. Falling back to loopback address.")
            return "127.0.0.1"  # Fallback to loopback
        finally:
            s.close()

    def set_app_config(self, host: str, port: int, target_nodes: list):
        """Set application configuration for heartbeat reporting"""
        self.app_host = host
        self.app_port = port
        self.target_nodes = target_nodes

    async def send_heartbeat(self, heartbeat_url: str):
        """Send heartbeat request"""
        try:
            api_address = f"http://{self.get_local_ip()}:{self.app_port}"
            version = await self._get_version_from_nodes()
            if version:
                print(f"Got version from target nodes: {version}")

            # Calculate total children nodes across all proxies
            total_children = sum(
                len(proxy_node["nodes"]) for proxy_node in self.target_nodes
            )
            params = {
                "pid": os.getpid(),
                "api_address": api_address,
                "version": version or "1.0.0",
                "other_info": json.dumps(
                    {
                        "startup_time": self.startup_time.isoformat(),
                        "nodes_count": total_children,
                    }
                ),
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(heartbeat_url, params=params)
                response.raise_for_status()
                print(
                    f"Heartbeat sent successfully: "
                    f"{heartbeat_url} - Status: {response.status_code}"
                )
                return True
        except Exception as e:
            print(f"Heartbeat send failed: {heartbeat_url} - Error: {str(e)}")
            return False

    async def _get_version_from_nodes(self):
        """Get version from target nodes"""
        if not self.target_nodes:
            return None

        for proxy_node in self.target_nodes:
            for node in proxy_node["nodes"]:
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        response = await client.get(
                            f"http://localhost:{self.app_port}/proxy2/{proxy_node['name']}/proxy2/{node['name']}/version"
                        )

                    if response.status_code == 200 and response.content:
                        content = response.content.decode("utf-8").strip()
                        # Try to remove surrounding quotes
                        if (content.startswith('"') and content.endswith('"')) or (
                            content.startswith("'") and content.endswith("'")
                        ):
                            content = content[1:-1]
                        return content

                except Exception as e:
                    print(f"Failed to get version from node {node['name']}: {str(e)}")
                    continue

        return None

    def worker(self, heartbeat_url: str, initial_delay: int, interval: int):
        """Heartbeat background thread worker function"""
        local_ip = self.get_local_ip()
        print(
            f"Heartbeat thread started - Local IP: {local_ip}, "
            f"Service URL: {heartbeat_url}"
        )
        print(f"Initial delay: {initial_delay}s, Interval: {interval}s")

        if initial_delay > 0:
            print(f"Waiting initial delay {initial_delay}s...")
            if self.stop_event.wait(initial_delay):
                print("Heartbeat thread stopped during initial delay")
                return

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            while not self.stop_event.is_set():
                try:
                    loop.run_until_complete(self.send_heartbeat(heartbeat_url))
                except Exception as e:
                    print(f"Heartbeat send exception: {str(e)}")

                if self.stop_event.wait(interval):
                    break
        finally:
            loop.close()
            print("Heartbeat thread stopped")

    def start(self, heartbeat_url: str, initial_delay: int = 0, interval: int = 30):
        """Start heartbeat thread"""
        if self.thread and self.thread.is_alive():
            print("Heartbeat thread is already running")
            return

        self.stop_event.clear()
        self.thread = threading.Thread(
            target=self.worker,
            args=(heartbeat_url, initial_delay, interval),
            daemon=True,
        )
        self.thread.start()
        print("Heartbeat thread started")

    def stop(self):
        """Stop heartbeat thread"""
        if self.thread and self.thread.is_alive():
            print("Stopping heartbeat thread...")
            self.stop_event.set()
            self.thread.join(timeout=5)
            if self.thread.is_alive():
                print("Warning: Heartbeat thread didn't stop within 5 seconds")
            else:
                print("Heartbeat thread stopped successfully")
        else:
            print("Heartbeat thread is not running")

    def status(self):
        """Get current heartbeat status"""
        is_running = self.thread and self.thread.is_alive()
        return {
            "running": is_running,
            "local_ip": self.get_local_ip(),
            "startup_time": self.startup_time.isoformat(),
            "current_time": datetime.now().isoformat(),
        }
