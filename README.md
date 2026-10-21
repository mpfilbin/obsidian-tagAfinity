# Tagafinity

Suggests tags for the current note based on how its content relates to the rest of your vault, and helps keep your tag taxonomy tidy. Desktop only: all vault access goes through the official [Obsidian CLI](https://obsidian.md/help/cli).

## How it works

1. **Index** – every note is embedded locally (transformers.js, `all-MiniLM-L6-v2` by default). The index is updated manually ("Update tag index", or the button in settings); Obsidian's modification times show which notes changed, so an update reads and embeds only those, and does nothing when nothing changed. Settings and "Show tag index status" report when it was last updated and how many notes have changed since. Suggestions keep working while the index is a little behind.
2. **Suggest** – the notes most similar to the active note vote on their tags. Existing tags are preferred; if too few qualify, new tags are proposed from the note's keywords (TF-IDF against the vault).
3. **Clean up** – the tag taxonomy is derived from the index: near-duplicate tags (spelling, abbreviations, semantic overlap), tags that could be nested under a broader tag, and rarely used tags. Merge/rename/remove rewrites both frontmatter and inline tags, always with a line-level preview, and can be undone.

## Commands

- Suggest tags for current note
- Review tag cleanup
- Update tag index
- Rebuild tag index from scratch
- Show tag index status
- Undo last tag change

## Requirements

- Obsidian 1.12.7 or newer with the CLI enabled (Settings → General → Command line interface). The plugin finds the CLI automatically: it ships beside the Obsidian executable, and the plugin also checks `PATH` and the locations the CLI registers itself in. The "CLI executable" setting is only a fallback for unusual installs; leave it empty normally.
- The first suggestion downloads the embedding model once; after that inference is fully local.

## Safety

Writes are verified by reading each note back; if the CLI did not store exactly what was intended, the original is restored. The originals of the last change are kept for the undo command.

### Limitations

- Reading and listing always go through the Obsidian CLI. Writing a note back through it means sending the whole note as a command argument, which has crashed Obsidian's main process on longer notes and cannot carry backslashes or very large notes faithfully, so notes are written through Obsidian's own file API (`Vault.process`). The setting "Write notes through the CLI" switches to CLI-first writes for short notes only (longer ones still use the API).
- Before a change is applied, the original content of every affected note is saved, so "Undo last tag change" works even if Obsidian stops partway.

## Troubleshooting

- **Debug logging** (plugin settings → Troubleshooting) writes timestamped lines to the developer console (Ctrl+Shift+I) for the CLI, indexing, embedding and suggestion flows, and reports any stretch where the plugin blocked the main thread, with what it was doing. "Copy debug log" (settings or command palette) copies the recent lines so they can be shared.
- **Responsiveness:** the embedding model runs in a background web worker. If the worker cannot start, the plugin falls back to the main thread in small batches and says so in the log; the setting "Compute embeddings in the background" turns the worker off.

## Development

```bash
just setup   # install
just dev     # watch build
just check   # lint + test + build
just install # build and copy into $OBSIDIAN_VAULT (or scripts/install.sh / install.ps1 <vault>)
just release patch|minor|major # bump version and commit; merging to master publishes the release
```
