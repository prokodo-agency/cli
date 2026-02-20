<p align="center">
  <a href="https://www.prokodo.com" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.prokodo.com/prokodo_logo_1a3bb7867c/prokodo_logo_1a3bb7867c.webp" alt="prokodo – Digital innovation & automation" height="58" />
  </a>
</p>

<h1 align="center">prokodo – CLI</h1>
<h2 align="center">Official Developer CLI for prokodo</h2>

<p align="center">
  <a href="https://github.com/prokodo-agency/cli/pkgs/npm/cli" target="_blank" rel="noopener noreferrer">
    <img alt="GitHub Packages" src="https://img.shields.io/badge/github%20packages-%40prokodo--agency%2Fcli-blue?logo=github" />
  </a>
  <a href="https://github.com/prokodo-agency/cli/actions/workflows/ci.yml" target="_blank" rel="noopener noreferrer">
    <img alt="CI" src="https://github.com/prokodo-agency/cli/actions/workflows/ci.yml/badge.svg" />
  </a>
  <a href="./LICENSE" target="_blank" rel="noopener noreferrer">
    <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg" />
  </a>
  <img alt="Node ≥ 22" src="https://img.shields.io/badge/node-%E2%89%A522-brightgreen" />
</p>

> Official developer CLI for [prokodo](https://www.prokodo.com) — verify deployments, inspect credit usage, and manage project configuration from any terminal or CI pipeline.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
  - [npm / pnpm / yarn](#npm--pnpm--yarn)
  - [Homebrew](#homebrew)
  - [Docker](#docker)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Commands](#commands)
  - [auth](#auth)
  - [init](#init)
  - [verify](#verify)
  - [credits](#credits)
  - [doctor](#doctor)
- [Global Flags & Environment Variables](#global-flags--environment-variables)
- [Config File](#config-file)
- [Exit Codes](#exit-codes)
- [Credentials Storage](#credentials-storage)
- [CI / CD Integration](#ci--cd-integration)
- [JSON Output Mode](#json-output-mode)
- [Contributing & Development](#contributing--development)
- [License](#license)

---

## Requirements

| Requirement | Version |
| ----------- | ------- |
| Node.js     | ≥ 22    |

No other runtime dependencies — `dist/cli.js` is a fully self-contained bundle.

---

## Installation

### npm / pnpm / yarn

Packages are published to **GitHub Packages**. Add the registry scope once, then
install globally:

```bash
# Tell npm/pnpm to resolve @prokodo/* from GitHub Packages
npm config set @prokodo:registry https://npm.pkg.github.com

# npm
npm install -g @prokodo/cli

# pnpm
pnpm config set @prokodo:registry https://npm.pkg.github.com
pnpm add -g @prokodo/cli

# yarn
yarn config set npmScopes.prokodo.npmRegistryServer https://npm.pkg.github.com
yarn global add @prokodo/cli
```

Verify the installation:

```bash
prokodo --version
prokodo doctor
```

### Homebrew

```bash
brew tap prokodo/tap
brew install prokodo-cli
```

### Docker

```bash
# Run any command without a global install
docker run --rm ghcr.io/prokodo-agency/prokodo-cli:latest --help

# Verify a local project (mount the working directory)
docker run --rm \
  -e PROKODO_API_KEY=pk_live_... \
  -v "$PWD":/workspace -w /workspace \
  ghcr.io/prokodo-agency/prokodo-cli:latest verify
```

---

## Quick Start

```bash
# 1. Log in with your API key
prokodo auth login --key pk_live_...

# 2. Scaffold a config inside your project
cd my-project
prokodo init --slug my-project

# 3. Run a verification
prokodo verify

# 4. Check environment health at any time
prokodo doctor
```

---

## Authentication

The CLI supports three ways to supply an API key, in priority order:

| Priority | Method                          | Example                                |
| -------- | ------------------------------- | -------------------------------------- |
| 1        | `--api-key` flag (per command)  | `prokodo verify --api-key pk_live_...` |
| 2        | `PROKODO_API_KEY` env variable  | `export PROKODO_API_KEY=pk_live_...`   |
| 3        | Credentials file (stored login) | `prokodo auth login --key pk_live_...` |

The credentials file is created automatically by `prokodo auth login` and stored at the [platform-specific path](#credentials-storage).

---

## Commands

### auth

```
prokodo auth <subcommand>
```

| Subcommand                       | Description                                           |
| -------------------------------- | ----------------------------------------------------- |
| `prokodo auth login --key <key>` | Validate and store an API key to the credentials file |
| `prokodo auth logout`            | Remove the stored credentials file                    |
| `prokodo auth whoami`            | Print the source and masked value of the active key   |

**Examples**

```bash
prokodo auth login --key pk_live_abc123
prokodo auth whoami
prokodo auth logout
```

---

### init

Scaffolds `.prokodo/config.json` in the current directory.

```
prokodo init [options]
```

| Flag            | Description                                        | Default  |
| --------------- | -------------------------------------------------- | -------- |
| `--slug <slug>` | Project slug (required unless `--defaults` is set) | prompted |
| `--defaults`    | Accept all defaults without prompting              | `false`  |
| `--force`       | Overwrite an existing config                       | `false`  |
| `--json`        | Output result as JSON                              | `false`  |

**Example**

```bash
prokodo init --slug my-shop --defaults
```

Generated `.prokodo/config.json`:

```json
{
  "projectSlug": "my-shop",
  "verifyGlobs": ["src/**/*", "!node_modules/**"],
  "timeout": 300
}
```

---

### verify

Triggers a cloud verification run and streams the result.

```
prokodo verify [options]
```

| Flag               | Description                      | Default |
| ------------------ | -------------------------------- | ------- |
| `--ref <ref>`      | Git ref / commit SHA to verify   | `HEAD`  |
| `--timeout <secs>` | Override the per-project timeout | config  |
| `--no-logs`        | Suppress streaming log output    | `false` |
| `--json`           | Output final result as JSON      | `false` |

**Examples**

```bash
# Standard run
prokodo verify

# Pin to a specific commit
prokodo verify --ref abc1234

# CI-friendly (JSON result, no streaming)
prokodo verify --json --no-logs
```

---

### credits

Displays the current credit balance for your account.

```
prokodo credits [--json]
```

---

### doctor

Runs a series of local environment checks and reports any problems.

```
prokodo doctor [--json]
```

| Check              | What it verifies                            |
| ------------------ | ------------------------------------------- |
| Node version       | Node ≥ 22 is installed                      |
| API key configured | A key is available from any source          |
| Config file        | `.prokodo/config.json` exists and is valid  |
| API reachability   | Can reach `https://marketplace.prokodo.com` |

Exit code `0` = all checks passed. Exit code `1` = one or more checks failed.

---

## Global Flags & Environment Variables

| Flag              | Env variable           | Default                           |
| ----------------- | ---------------------- | --------------------------------- |
| `--api-url <url>` | `PROKODO_API_BASE_URL` | `https://marketplace.prokodo.com` |
| `--api-key <key>` | `PROKODO_API_KEY`      | credentials file                  |
| `--json`          | —                      | `false`                           |
| `--no-color`      | `NO_COLOR`             | `false`                           |
| `--verbose`       | `PROKODO_VERBOSE`      | `false`                           |

---

## Config File

`.prokodo/config.json` is the per-project configuration file created by `prokodo init`.

```json
{
  "projectSlug": "my-project",
  "verifyGlobs": ["src/**/*", "!node_modules/**"],
  "timeout": 300
}
```

| Field         | Type       | Description                                          |
| ------------- | ---------- | ---------------------------------------------------- |
| `projectSlug` | `string`   | Unique project identifier in prokodo                 |
| `verifyGlobs` | `string[]` | Glob patterns for files included in the verification |
| `timeout`     | `number`   | Maximum poll duration in seconds (must be > 0)       |

---

## Exit Codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Success                                                     |
| `1`  | Runtime / API / network error                               |
| `2`  | Usage error — bad arguments, missing config, no credentials |

---

## Credentials Storage

| Platform      | Path                                 |
| ------------- | ------------------------------------ |
| Linux / macOS | `~/.config/prokodo/credentials.json` |
| Windows       | `%APPDATA%\prokodo\credentials.json` |

The file is written with permissions `0600` on Linux/macOS (owner read/write only). On Windows the file is created but `chmod` is silently skipped.

---

## CI / CD Integration

### GitHub Actions

```yaml
- name: Configure GitHub Packages registry
  run: npm config set @prokodo:registry https://npm.pkg.github.com

- name: Install prokodo CLI
  run: npm install -g @prokodo/cli

- name: Verify deployment
  env:
    PROKODO_API_KEY: ${{ secrets.PROKODO_API_KEY }}
  run: prokodo verify --json --no-logs
```

### GitLab CI

```yaml
verify:
  image: node:22-alpine
  script:
    - npm config set @prokodo:registry https://npm.pkg.github.com
    - npm install -g @prokodo/cli
    - prokodo verify --json --no-logs
  variables:
    PROKODO_API_KEY: $PROKODO_API_KEY
```

### Docker-based CI (no global install)

```yaml
- name: Verify with Docker
  run: |
    docker run --rm \
      -e PROKODO_API_KEY=${{ secrets.PROKODO_API_KEY }} \
      -v "${{ github.workspace }}":/workspace -w /workspace \
      ghcr.io/prokodo-agency/prokodo-cli:latest verify --json
```

---

## JSON Output Mode

Every command supports `--json` for machine-readable output. Errors are written to **stderr** as plain text; structured results go to **stdout**.

```bash
prokodo doctor --json
```

```json
{
  "passed": true,
  "checks": [
    { "name": "Node version", "passed": true, "detail": "22.18.0 (required ≥ 22)" },
    { "name": "API key configured", "passed": true, "detail": "Source: env" },
    { "name": ".prokodo/config.json", "passed": true, "detail": "my-project" },
    {
      "name": "API reachability",
      "passed": true,
      "detail": "https://marketplace.prokodo.com → 200 OK"
    }
  ]
}
```

---

## Contributing & Development

```bash
# Clone and install
git clone https://github.com/prokodo-agency/cli.git
cd cli/prokodo-cli
pnpm install

# Develop with watch mode
pnpm dev

# Run the full quality suite
pnpm lint          # tsc + eslint
pnpm format:check  # prettier
pnpm test          # jest (110 tests)
pnpm test:coverage # with coverage report

# Build
pnpm build         # → dist/cli.js (self-contained bundle)

# Try it locally
node dist/cli.js --help
```

### Project Structure

```
src/
├── cli.ts                  Entry point — registers all commands
├── commands/
│   ├── auth.ts             login / logout / whoami
│   ├── credits.ts          credit balance
│   ├── doctor.ts           environment health checks
│   ├── init.ts             project scaffolding
│   └── verify.ts           cloud verification runner
└── lib/
    ├── apiClient.ts        HTTP client with retry / backoff
    ├── auth.ts             key resolution, shape validation
    ├── config.ts           .prokodo/config.json load / save / validate
    ├── credentials.ts      credentials file management
    ├── logger.ts           coloured output + JSON mode
    ├── platform.ts         OS paths, CI detection
    └── poll.ts             async polling with timeout
```

### Publishing a release

```bash
# Bump version in package.json, then:
git tag v0.2.0
git push origin v0.2.0
# → triggers the release workflow: CI → npm publish → GHCR → GitHub Release
```

---

## License

[MIT](./LICENSE) © 2026 [prokodo agency](https://www.prokodo.com)
