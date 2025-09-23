# SPDX-License-Identifier: Apache-2.0
import os

from setuptools import find_packages, setup


# Collect static file paths
def package_files(directory):
    paths = []
    for path, directories, filenames in os.walk(directory):
        for filename in filenames:
            paths.append(os.path.join("..", path, filename))
    return paths


# Static file paths
static_files = package_files("lmcache_frontend/")

setup(
    name="lmcache_frontend",
    version="0.1.8",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        "lmcache_frontend": static_files,
    },
    install_requires=[
        "Flask",
        "setuptools>=77.0.3",
        "packaging>=24.2",
        "setuptools_scm>=8",
        "wheel",
        "fastapi==0.104.1",
        "uvicorn[standard]==0.24.0",
        "httpx==0.25.2",
        "starlette==0.27.0",
    ],
    entry_points={"console_scripts": ["lmcache-frontend=lmcache_frontend.app:main"]},
)
