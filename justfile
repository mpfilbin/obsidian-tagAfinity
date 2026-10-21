set dotenv-load

plugin_id := "tagafinity"
vault_path := env("OBSIDIAN_VAULT", "")

# List available recipes
default:
    @just --list

# Install dependencies
setup:
    npm install

# Compile plugin (development, watch mode)
dev:
    npm run dev

# Compile plugin (production build)
build:
    npm run build

# Run tests
test:
    npx vitest run

# Run tests in watch mode
test-watch:
    npx vitest watch

# Run tests with coverage
test-coverage:
    npx vitest run --coverage

# Lint source code
lint:
    npx eslint src/

# Lint and auto-fix
lint-fix:
    npx eslint src/ --fix

# Run all checks (lint + test + build)
check: lint test build

# Install plugin into target vault (builds first)
install path=vault_path:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{path}}" ]; then
        echo "Error: No vault path specified."
        echo "Set OBSIDIAN_VAULT in .env or pass a path: just install /path/to/vault"
        exit 1
    fi
    bash scripts/install.sh "{{path}}"

# Remove plugin from target vault
uninstall path=vault_path:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{path}}" ]; then
        echo "Error: No vault path specified."
        exit 1
    fi
    bash scripts/uninstall.sh "{{path}}"

# Clean build artifacts
clean:
    rm -f main.js

# Bump the version (major|minor|patch) and commit. Merging that commit to master
# publishes the GitHub release via .github/workflows/release.yml.
release level="patch":
    bash scripts/release.sh {{level}}
