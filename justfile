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

# Install plugin into target vault
install path=vault_path:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{path}}" ]; then
        echo "Error: No vault path specified."
        echo "Set OBSIDIAN_VAULT in .env or pass a path: just install /path/to/vault"
        exit 1
    fi
    mkdir -p "{{path}}/.obsidian/plugins/{{plugin_id}}"
    cp main.js manifest.json "{{path}}/.obsidian/plugins/{{plugin_id}}/"
    [ -f styles.css ] && cp styles.css "{{path}}/.obsidian/plugins/{{plugin_id}}/" || true
    echo "Installed {{plugin_id}} to {{path}}"

# Clean build artifacts
clean:
    rm -f main.js
    rm -f SHA256SUMS.txt

# --- Release targets (used by CI and local release workflow) ---

# Bump version in manifest.json, package.json, and versions.json
version-bump level="patch":
    npm version {{level}} --no-git-tag-version
    node version-bump.mjs

# Generate SHA-256 checksums for release artifacts
checksum:
    #!/usr/bin/env bash
    set -euo pipefail
    FILES="main.js manifest.json"
    [ -f styles.css ] && FILES="$FILES styles.css"
    sha256sum $FILES > SHA256SUMS.txt
    echo "Checksums written to SHA256SUMS.txt"
    cat SHA256SUMS.txt

# Tag the current version in git (reads version from manifest.json)
tag:
    #!/usr/bin/env bash
    set -euo pipefail
    VERSION=$(node -p "require('./manifest.json').version")
    echo "Tagging version $VERSION"
    git tag "$VERSION"
    git push origin "$VERSION"

# Full release pipeline: check, build, checksum
release-build: check
    @echo "Building release artifacts..."
    just build
    just checksum
    @echo "Release artifacts ready."
    @echo "Run 'just tag' to create and push the git tag."
    @echo "The GitHub Action will create the release automatically."
