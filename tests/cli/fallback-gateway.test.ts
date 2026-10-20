import { describe, it, expect } from 'vitest';
import { CliVaultGateway, UnsupportedContentError } from '../../src/cli/gateway';
import { FallbackWriteGateway, type NoteWriter } from '../../src/cli/fallback-gateway';
import { CliError, type CommandRunner } from '../../src/cli/runner';
import { FakeGateway } from '../helpers';

class Recorder implements NoteWriter {
	writes: [string, string][] = [];
	writeNote(path: string, content: string) {
		this.writes.push([path, content]);
		return Promise.resolve();
	}
}

class Throwing extends FakeGateway {
	constructor(private readonly error: Error) {
		super({ 'a.md': 'x' });
	}
	writeNote(): Promise<void> {
		return Promise.reject(this.error);
	}
}

describe('CliVaultGateway unsupported content', () => {
	it('signals unsupported content with a dedicated error', async () => {
		const runner: CommandRunner = { run: () => Promise.resolve('') };
		await expect(new CliVaultGateway(runner).writeNote('a.md', 'x \\ y')).rejects.toBeInstanceOf(UnsupportedContentError);
	});
});

describe('FallbackWriteGateway', () => {
	describe('when the CLI can write the note', () => {
		it('writes through the CLI', async () => {
			const primary = new FakeGateway({ 'a.md': 'old' });
			await new FallbackWriteGateway(primary, new Recorder()).writeNote('a.md', 'new');
			expect(primary.files['a.md']).toBe('new');
		});

		it('does not touch the fallback', async () => {
			const fallback = new Recorder();
			await new FallbackWriteGateway(new FakeGateway({ 'a.md': 'old' }), fallback).writeNote('a.md', 'new');
			expect(fallback.writes).toEqual([]);
		});
	});

	describe('when the CLI cannot represent the content', () => {
		it('writes through the fallback instead', async () => {
			const fallback = new Recorder();
			await new FallbackWriteGateway(new Throwing(new UnsupportedContentError('has a backslash')), fallback).writeNote('a.md', 'new \\ text');
			expect(fallback.writes).toEqual([['a.md', 'new \\ text']]);
		});
	});

	describe('when the CLI fails for another reason', () => {
		it('does not fall back', async () => {
			const fallback = new Recorder();
			const gateway = new FallbackWriteGateway(new Throwing(new CliError('app not running')), fallback);
			await expect(gateway.writeNote('a.md', 'new')).rejects.toThrow('app not running');
		});
	});

	describe('reads and listings', () => {
		it('use the CLI', async () => {
			const gateway = new FallbackWriteGateway(new FakeGateway({ 'a.md': 'hello' }), new Recorder());
			expect(await gateway.readNote('a.md')).toBe('hello');
		});
	});
});
