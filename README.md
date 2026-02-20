# @prokodo/cli

Prokodo developer CLI — verify, inspect, and manage your Prokodo projects.

## Requirements

- Node ≥ 22
- pnpm ≥ 9

## Installation

```bash
npm install -g @prokodo/cli
# or
pnpm add -g @prokodo/cli
```

## Quick Start

```bash
# 1. Authenticate
prokodo auth login --key pk_live_...

# 2. Scaffold a config in your project
cd my-project
prokodo init

# 3. Run a verification
prokodo verify

# 4. Machine-readable output for CI
prokodo verify --json
```

## Commands

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `prokodo auth login`  | Store an API key                |
| `prokodo auth logout` | Remove stored credentials       |
| `prokodo credits`     | Show current credit balance     |
| `prokodo init`        | Scaffold `.prokodo/config.json` |
| `prokodo verify`      | Run a cloud verification        |
| `prokodo doctor`      | Check environment health        |

## Global Options

| Flag              | Env var                | Default                           |
| ----------------- | ---------------------- | --------------------------------- |
| `--api-url <url>` | `PROKODO_API_BASE_URL` | `https://marketplace.prokodo.com` |
| `--api-key <key>` | `PROKODO_API_KEY`      | credentials file                  |
| `--json`          | —                      | false                             |
| `--no-color`      | `NO_COLOR`             | false                             |
| `--verbose`       | `PROKODO_VERBOSE`      | false                             |

## Exit Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Success                                                |
| `1`  | Runtime / API / auth error                             |
| `2`  | Usage error (bad args, missing config, no credentials) |

## Credentials Storage

| Platform      | Path                                 |
| ------------- | ------------------------------------ |
| Linux / macOS | `~/.config/prokodo/credentials.json` |
| Windows       | `%APPDATA%\prokodo\credentials.json` |

The file is created with mode `0600` on Linux/macOS.

## CI Usage

```yaml
- name: Verify with Prokodo
  env:
    PROKODO_API_KEY: ${{ secrets.PROKODO_API_KEY }}
  run: prokodo verify --json
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```
