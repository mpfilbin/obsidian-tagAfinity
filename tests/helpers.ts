import type { VaultGateway } from '../src/cli/gateway';
import type { IndexData } from '../src/index/store';
import { extractTags } from '../src/tags/parse';
import { normalize } from '../src/vector';

export class FakeGateway implements VaultGateway {
	writes: string[] = [];
	reads: string[] = [];
	constructor(public files: Record<string, string>, private readonly corruptWrites = false) {}
	listNotes() {
		return Promise.resolve(Object.keys(this.files));
	}
	readNote(path: string) {
		this.reads.push(path);
		return Promise.resolve(this.files[path] ?? '');
	}
	notesWithTag(tag: string) {
		const wanted = tag.replace(/^#/, '').toLowerCase();
		return Promise.resolve(
			Object.entries(this.files)
				.filter(([, content]) => extractTags(content).all.some((t) => t.toLowerCase() === wanted))
				.map(([path]) => path),
		);
	}
	writeNote(path: string, content: string) {
		this.writes.push(path);
		this.files[path] = this.corruptWrites ? content + 'X' : content;
		return Promise.resolve();
	}
}

export function indexOf(notes: Record<string, { vector: number[]; tags: string[] }>): IndexData {
	const out: IndexData = { version: 1, model: 'test', notes: {}, docCount: Object.keys(notes).length, docFreq: {} };
	for (const [path, note] of Object.entries(notes)) {
		out.notes[path] = { hash: path, vector: normalize(note.vector), tags: note.tags };
	}
	return out;
}
