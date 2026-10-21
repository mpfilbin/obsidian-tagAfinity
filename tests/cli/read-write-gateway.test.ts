import { describe, it, expect } from 'vitest';
import { ReadWriteGateway } from '../../src/cli/read-write-gateway';
import type { NoteWriter } from '../../src/cli/fallback-gateway';
import { FakeGateway } from '../helpers';

class Recorder implements NoteWriter {
	writes: [string, string][] = [];
	writeNote(path: string, content: string) {
		this.writes.push([path, content]);
		return Promise.resolve();
	}
}

describe('ReadWriteGateway', () => {
	it('reads through the CLI', async () => {
		expect(await new ReadWriteGateway(new FakeGateway({ 'a.md': 'hello' }), new Recorder()).readNote('a.md')).toBe('hello');
	});

	it('lists through the CLI', async () => {
		expect(await new ReadWriteGateway(new FakeGateway({ 'a.md': 'x' }), new Recorder()).listNotes()).toEqual(['a.md']);
	});

	it('finds notes with a tag through the CLI', async () => {
		expect(await new ReadWriteGateway(new FakeGateway({ 'a.md': 'see #ml' }), new Recorder()).notesWithTag('ml')).toEqual(['a.md']);
	});

	describe('when writing', () => {
		it('uses the writer, never the CLI', async () => {
			const cli = new FakeGateway({ 'a.md': 'old' });
			const writer = new Recorder();
			await new ReadWriteGateway(cli, writer).writeNote('a.md', 'new');
			expect([writer.writes, cli.writes]).toEqual([[['a.md', 'new']], []]);
		});
	});
});
