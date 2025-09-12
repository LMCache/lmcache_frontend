"""Heartbeat service module for periodic health reporting"""

import socket
import threading
import asyncio
import os
from datetime import datetime
import httpx
from starlette.requests import Request
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
        """Get local IP address"""
        try:
            # First try to get IP by connecting to external address
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                if ip and ip != "127.0.0.1" and not ip.startswith("192.168."):
                    return ip
            
            # If above method fails, try getting IP from hostname
            hostname = socket.gethostname()
            ip = socket.gethostbyname(hostname)
            if ip and ip != "127.0.0.1" and not ip.startswith("192.168."):
                return ip
                
            # Finally try to get IP from all network interfaces
            import subprocess
            import re
            
            # Use ifconfig on macOS/Linux to get IP
            try:
                result = subprocess.run(['ifconfig'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    # Search for IP addresses
                    ip_pattern = r'inet (\d+\.\d+\.\d+\.\d+)'
                    matches = re.findall(ip_pattern, result.stdout)
                    for match in matches:
                        if match != '127.0.0.1' and not match.startswith('169.254.'):
                            return match
            except:
                pass
                
            return "127.0.0.1"
            
        except Exception as e:
            print(f"Error getting local IP: {str(e)}")
            return "127.0.0.1"
    
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
            
            params = {
                "pid": os.getpid(),
                "api_address": api_address,
                "version": version or "1.0.0",
                "other_info": f"startup_time:{self.startup_time.isoformat()},target_nodes_count:{len(self.target_nodes)}"
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    heartbeat_url,
                    params=params
                )
                response.raise_for_status()
                print(f"Heartbeat sent successfully: {heartbeat_url} - Status: {response.status_code}")
                return True
        except Exception as e:
            print(f"Heartbeat send failed: {heartbeat_url} - Error: {str(e)}")
            return False

    async def _get_version_from_nodes(self):
        """Get version from target nodes"""
        if not self.target_nodes:
            return None
            
        for node in self.target_nodes:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(
                        f"http://localhost:{self.app_port}/proxy2/{node['name']}/version"
                    )
                
                if response.status_code == 200 and response.content:
                    content = response.content.decode("utf-8").strip()
                    # Try to remove surrounding quotes
                    if (content.startswith('"') and content.endswith('"')) or \
                       (content.startswith("'") and content.endswith("'")):
                        content = content[1:-1]
                    return content
                    
            except Exception as e:
                print(f"Failed to get version from node {node['name']}: {str(e)}")
                continue
                
        return None
    
    def worker(self, heartbeat_url: str, initial_delay: int, interval: int):
        """Heartbeat background thread worker function"""
        local_ip = self.get_local_ip()
        print(f"Heartbeat thread started - Local IP: {local_ip}, Service URL: {heartbeat_url}")
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
            daemon=True
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
            "current_time": datetime.now().isoformat()
        }
