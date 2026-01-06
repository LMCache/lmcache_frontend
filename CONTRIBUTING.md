# Contributing to LMCache Frontend

Thanks for your interest in contributing to LMCache Frontend!
This document describes how to set up the project locally and what we expect from pull requests.

## Development setup

### Requirements
- Python 3.8+
- pip

### Install locally
```bash
git clone https://github.com/<your-user>/lmcache_frontend.git
cd lmcache_frontend
pip install -e .

#  Pre-commit

This project uses pre-commit hooks to ensure code quality.

-pip install pre-commit
-pre-commit install
-pre-commit run --all-files

Please make sure all pre-commit checks pass before opening a PR.

#  Pull Request guidelines

- Keep PRs focused on a single logical change
- Link related issues when applicable
- Update documentation if behavior or configuration changes
- Prefer small, incremental PRs over large changes

#  Testing expectations

At minimum, please ensure:

- The project installs successfully
- The service can start locally if applicable
- Pre-commit checks pass

##« CI expectations (planned)

The project plans to introduce CI checks for pull requests, including:

- install/build verification
- linting and formatting
- basic smoke tests

This document aims to make CI adoption smoother and more predictable for contributors.

# Questions / Discussions

If you’re unsure about a contribution or have a proposal, feel free to open an issue for discussion before starting implementation.
