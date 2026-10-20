# Tagafinity

Suggests tags for the current note based on how its content relates to the rest of your vault, and helps keep your tag taxonomy tidy. Desktop only: all vault access goes through the official [Obsidian CLI](https://obsidian.md/help/cli).

## How it works

1. **Index** – every note is embedded locally (transformers.js, `all-MiniLM-L6-v2` by default). Only changed notes are re-embedded.
2. **Suggest** – the notes most similar to the active note vote on their tags. Existing tags are preferred; if too few qualify, new tags are proposed from the note's keywords (TF-IDF against the vault).
3. **Clean up** – the tag taxonomy is derived from the index: near-duplicate tags (spelling, abbreviations, semantic overlap), tags that could be nested under a broader tag, and rarely used tags. Merge/rename/remove rewrites both frontmatter and inline tags, always with a line-level preview, and can be undone.

## Commands

- Suggest tags for current note
- Review tag cleanup
- Update tag index
- Undo last tag change

## Requirements

- Obsidian 1.12.7 or newer with the CLI enabled (Settings → General → Command line interface). The plugin looks for `obsidian` on your `PATH` and in the location the CLI registers itself in; set a custom path in the plugin settings if needed.
- The first suggestion downloads the embedding model once; after that inference is fully local.

## Safety

Writes are verified by reading each note back; if the CLI did not store exactly what was intended, the original is restored. The originals of the last change are kept for the undo command.

### Limitations

- Notes are written back through `obsidian create … overwrite`, whose content argument treats `\n` and `\t` as escapes. Notes containing a backslash (for example LaTeX) are therefore never rewritten and are reported as skipped.
- Very large notes exceed the command-line length limit (about 30,000 characters on Windows, 120,000 elsewhere) and are skipped the same way.
- Line endings of rewritten notes are normalised to `\n`.

## Development

```bash
just setup   # install
just dev     # watch build
just check   # lint + test + build
just install # copy into $OBSIDIAN_VAULT
```
