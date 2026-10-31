import type { TagNode } from '../taxonomy/build';
import { isTaxonomyExport, renderTaxonomyMarkdown } from '../taxonomy/export';
import type { VaultGateway } from '../vault/gateway';

export type ExportResult = { status: 'created' | 'updated' } | { status: 'refused'; reason: string };

/**
 * Writes the taxonomy to a note. An existing file is replaced only when it is an earlier export, so a mistyped
 * path can never overwrite one of the user's own notes.
 */
export async function writeTaxonomyExport(
	gateway: VaultGateway,
	path: string,
	tree: TagNode[],
	generatedAt: Date,
): Promise<ExportResult> {
	if (!path.toLowerCase().endsWith('.md')) return { status: 'refused', reason: `${path} is not a markdown file. Use a path ending in .md.` };
	const markdown = renderTaxonomyMarkdown(tree, { generatedAt });
	if (!(await gateway.noteExists(path))) {
		await gateway.createNote(path, markdown);
		return { status: 'created' };
	}
	if (!isTaxonomyExport(await gateway.readNote(path))) {
		return { status: 'refused', reason: `${path} already exists and is not a Tagafinity export. Choose another path in the plugin settings.` };
	}
	await gateway.writeNote(path, markdown);
	return { status: 'updated' };
}
