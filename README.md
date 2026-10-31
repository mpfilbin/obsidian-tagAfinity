# Tagafinity

Suggests tags for the current note based on how its content relates to the rest of your vault, and helps keep your tag taxonomy tidy. Vault access uses Obsidian's own API, so there is nothing else to install or enable.

## How it works

1. **Index** – every note is embedded locally (transformers.js, `all-MiniLM-L6-v2` by default). The index is updated manually ("Update tag index", or the button in settings); Obsidian's modification times show which notes changed, so an update reads and embeds only those, and does nothing when nothing changed. Settings and "Show tag index status" report when it was last updated and how many notes have changed since. Suggestions keep working while the index is a little behind.
2. **Suggest** – the notes most similar to the active note vote on their tags. Existing tags are preferred; if too few qualify, new tags are proposed from the note's keywords (TF-IDF against the vault).
3. **Clean up** – the tag taxonomy is derived from the index: near-duplicate tags (spelling, abbreviations, semantic overlap), tags that could be nested under a broader tag, and rarely used tags. Merge/rename/remove rewrites both frontmatter and inline tags, always with a line-level preview, and can be undone.
4. **Find untagged notes** – "Find notes without tags" opens a sidebar panel listing every indexed note that has no tags at all (neither in properties nor in the text), with a filter box. Click a note to open it (Ctrl/Cmd-click for a new tab), then run "Suggest tags for current note". The list comes from the index and refreshes when the index changes; the panel tells you when the index is behind the vault.

The sliders under **Suggestions** in the plugin settings tune this: each one is explained there, with what a lower or higher value does and its default.

## What counts as a tag

Tags in a note's properties and `#tags` in its text. A `#` is **not** treated as a tag where it means something else: inside code, comments (`%%…%%` and `<!-- -->`), HTML tags and their attributes (colors such as `#fff`, ids, `href="#section"`, `url(#id)`), the contents of `<svg>`, `<style>` and `<script>` elements, links (`[text](page#anchor)`, `[[note#heading]]`, bare URLs and autolinks, reference definitions), and HTML entities such as `&#39;`. The visible text of a link and the text between HTML tags can still contain tags. The same rules decide which tags a rename or merge touches, so a color or anchor that happens to match a tag name is never rewritten.

When these rules change between versions, the index notices and re-derives the stored tags on the next update; notes are not re-embedded.

## Tag tree

"Open tag tree" (or the ribbon icon) shows your tags in the right sidebar as a hierarchy. Counts are distinct notes, so a note is counted once under a parent however many of its nested tags it has; hover a count for the breakdown. Tags that exist only as a parent of nested tags are shown in italics. Use the filter box (several words must all match), the sort button (note count or name), and expand/collapse all. Click a tag to list its notes below the tree and click a note to open it (Ctrl/Cmd-click for a new tab). The tree refreshes when the index changes.

Right-click a tag (or press the menu key) to change it: **Rename…** (the last part of the name; nested tags follow), **Move under…** (pick a parent, a new one by typing it, or the top level), **Merge into…**, **Remove tag**, and **Remove tag and nested tags**; **Copy tag** and **Show notes** are there too. These do not write anything: each choice is added to a **Pending changes** list above the tree, the affected tags are marked, and you can drop individual changes from the list. **Drag and drop** does the same without the menu: drag a tag onto another to stage "move under" it (hold Alt to merge into it instead), or drop a nested tag on the bar under the tree to move it to the top level. The bar also says what the drop would do while you drag, and refuses impossible drops, such as a tag onto itself or its own descendants. Hovering over a collapsed branch for a moment opens it, and the list scrolls near its edges. Dragging only stages a change, exactly like the menu. **Preview** combines all pending changes into one preview where you can untick notes, and applying them is a single step that "Undo last tag change" reverses.

## Exporting the taxonomy

"Export tag taxonomy to markdown" writes your tag hierarchy to a note (default `Tag taxonomy.md` in the vault root; change it under **Export** in the plugin settings). The file is meant to be read by people and by AI agents: it opens with front matter (`type: tag-taxonomy`, generation time, tag and note counts), a short legend, and then every tag as a nested list with its note counts, e.g. `` - `project` — 3 notes (1 direct) `` with `` `project/alpha` `` indented below it. Tags that exist only as the prefix of nested tags are marked `(grouping only)`. Siblings are ordered by name, so repeated exports differ only where your vault does. The export comes from the index, so update the index first if it is behind. Running the command again replaces the note, but only if it is an earlier export; Tagafinity refuses to overwrite any other note.

## Commands

- Suggest tags for current note
- Review tag cleanup
- Find notes without tags
- Open tag tree
- Export tag taxonomy to markdown
- Update tag index
- Rebuild tag index from scratch
- Show tag index status
- Undo last tag change

## Requirements

- Obsidian 1.12.7 or newer (desktop). The first suggestion downloads the embedding model once; after that inference is fully local.

## Safety

- Every change is previewed line by line and applied only to the notes you leave ticked.
- Each write is verified by reading the note back; if it does not match what was intended, the original is restored.
- The original content of every affected note is saved before the first write, so "Undo last tag change" works even if Obsidian stops partway.

## Security

The threat model (STRIDE, with reproducible proofs of concept, security invariants and prioritised recommendations) is in [docs/security/threat-model.md](docs/security/threat-model.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Troubleshooting

- **Debug logging** (plugin settings → Troubleshooting) writes timestamped lines to the developer console (Ctrl+Shift+I) for indexing, embedding, suggestion and cleanup flows, and reports any stretch where the plugin blocked the main thread, with what it was doing. "Copy debug log" (settings or command palette) copies the recent lines so they can be shared.
- **Responsiveness:** the embedding model runs in a background web worker. If the worker cannot start, the plugin falls back to the main thread in small batches and says so in the log; the setting "Compute embeddings in the background" turns the worker off.

## Development

Node 24 is the version CI uses and `.nvmrc` is the single source of truth for it (`package.json` `engines` sets the minimum the toolchain supports, 22.13).

Before changing note-parsing code, anything that writes notes or persisted files, network access or downloads, the build/release workflows, or dependencies, read [docs/security/threat-model.md](docs/security/threat-model.md) and put `Threat model: no impact` or `Threat model: updated (IDs)` in the pull request description.

- **asdf:** add `legacy_version_file = yes` to `~/.asdfrc`, then `asdf install nodejs` in the repo.
- **nvm / fnm / mise:** they read `.nvmrc` directly (`nvm use`, `fnm use`, `mise install`).
- **Windows:** nvm-windows does not read `.nvmrc`, so run `nvm install 24` and `nvm use 24`, or use fnm or mise. `just release` runs a bash script, so run it from Git Bash or WSL; the other recipes and `scripts/install.ps1` work from PowerShell.

```bash
just setup   # install
just dev     # watch build
just check   # lint + test + build
just install # build and copy into $OBSIDIAN_VAULT (or scripts/install.sh / install.ps1 <vault>)
just release patch|minor|major # bump version and commit; merging to master publishes the release
```
