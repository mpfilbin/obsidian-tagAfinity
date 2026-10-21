# CLAUDE.md — Agent Instructions for Tagafinity

This file defines mandatory development practices for AI agents working on this Obsidian plugin.
These rules are non-negotiable.

## Project Commands

Read the `justfile` for the full list. Key commands:

- `just setup` — Install dependencies
- `just dev` — Compile in watch mode
- `just build` — Production build
- `just test` — Run tests
- `just test-watch` — Run tests in watch mode
- `just lint` — Run ESLint
- `just check` — Full validation (lint + test + build)
- `just install` — Install plugin to vault (set OBSIDIAN_VAULT in .env)

## Test-Driven Development (mandatory)

Every code change must follow the red-green-refactor cycle:

1. **Red** — Write a minimal failing test that describes the next behavior
2. **Green** — Write only enough implementation code to make that test pass
3. **Refactor** — Clean up while keeping tests green

Never write implementation code without a failing test first. Never skip ahead and write
multiple features before testing them.

## Test Structure (mandatory)

Use vitest with `describe`, `it`, and `expect` exclusively. Never use `assert`.

### Rule: One assertion per test

Every `it` block makes exactly one `expect` call. If you need to verify multiple things,
write multiple `it` blocks.

```typescript
// WRONG — multiple assertions
it('processes the file correctly', () => {
    expect(result.wordCount).toBe(42);
    expect(result.lineCount).toBe(10);
});

// CORRECT — one assertion per test
it('counts 42 words', () => {
    expect(result.wordCount).toBe(42);
});

it('counts 10 lines', () => {
    expect(result.lineCount).toBe(10);
});
```

### Rule: Describe blocks mirror code branches

Every conditional branch (`if`, `switch`, ternary) in the code under test gets its own
`describe` block. Nested conditions use nested `describe` blocks.

```typescript
describe('formatDate', () => {
    describe('when the locale is en-US', () => {
        describe('when includeTime is true', () => {
            it('returns date with time in 12-hour format', () => {
                expect(formatDate(date, 'en-US', true)).toBe('1/15/2025, 3:30 PM');
            });
        });

        describe('when includeTime is false', () => {
            it('returns date without time', () => {
                expect(formatDate(date, 'en-US', false)).toBe('1/15/2025');
            });
        });
    });

    describe('when the locale is not provided', () => {
        it('uses the default locale', () => {
            expect(formatDate(date)).toBe('2025-01-15');
        });
    });
});
```

### Rule: Describe blocks use "when" language

Use `describe('when ...')` to express preconditions. Use `it('does something')` to express
the expected outcome. This reads as a specification:

```
formatDate
  when the locale is en-US
    when includeTime is true
      ✓ returns date with time in 12-hour format
    when includeTime is false
      ✓ returns date without time
  when the locale is not provided
    ✓ uses the default locale
```

## Code Organization

- Keep `src/main.ts` focused on plugin lifecycle (`onload`, `onunload`) — delegate to modules
- Settings in `src/settings.ts` — interface, defaults, and SettingTab class
- Commands in `src/commands/` — one file per command or command group
- UI components in `src/ui/` — modals, views, React/Svelte components
- Utility functions in `src/utils/` — pure functions, helpers, constants
- Types in `src/types.ts` — shared TypeScript interfaces

## Obsidian Plugin Rules

- Register all events with `this.registerEvent()` — never bare `.on()`
- Register all intervals with `this.registerInterval()` — never bare `setInterval()`
- Use `Vault.process()` for background file modifications
- Use the `Editor` API for modifications to the active editor
- Use `normalizePath()` for user-provided file paths
- Use `requestUrl()` instead of `fetch()`
- No `console.log` in `onload()` or `onunload()`
- Never create `<link>` or `<style>` elements — use `styles.css`
- Scope all CSS to plugin-specific classes

## Version Management

Never edit the version in `manifest.json`, `package.json` or `versions.json` by hand. Use:

```bash
just release patch   # 0.1.0 → 0.1.1
just release minor   # 0.1.0 → 0.2.0
just release major   # 0.1.0 → 1.0.0
```

This runs `scripts/release.sh`, which bumps `package.json`, syncs `manifest.json` and `versions.json` via
`version-bump.mjs`, refreshes `package-lock.json` and commits. Merging that commit to `master` triggers
`.github/workflows/release.yml`, which builds and publishes the GitHub release for the version in `manifest.json`.
