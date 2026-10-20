import { describe, it, expect } from 'vitest';
import { CliVaultGateway, encodeContent } from '../../src/cli/gateway';
import type { CommandRunner } from '../../src/cli/runner';

class RecordingRunner implements CommandRunner {
	calls: string[][] = [];
	constructor(private readonly output = '') {}
	run(args: string[]) {
		this.calls.push(args);
		return Promise.resolve(this.output);
	}
}

describe('CliVaultGateway', () => {
	describe('listNotes', () => {
		it('returns markdown paths one per line', async () => {
			const gateway = new CliVaultGateway(new RecordingRunner('a.md\nsub/b.md\nimage.png\n'));
			expect(await gateway.listNotes()).toEqual(['a.md', 'sub/b.md']);
		});
	});

	describe('when a vault name is configured', () => {
		it('passes it before the command', async () => {
			const runner = new RecordingRunner('');
			await new CliVaultGateway(runner, { vaultName: 'Main' }).readNote('a.md');
			expect(runner.calls[0]).toEqual(['vault=Main', 'read', 'path=a.md']);
		});
	});

	describe('when no vault name is configured', () => {
		it('starts with the command', async () => {
			const runner = new RecordingRunner('');
			await new CliVaultGateway(runner).readNote('a.md');
			expect(runner.calls[0]).toEqual(['read', 'path=a.md']);
		});
	});

	describe('writeNote', () => {
		it('overwrites with escaped content', async () => {
			const runner = new RecordingRunner('');
			await new CliVaultGateway(runner).writeNote('a.md', 'x\ny');
			expect(runner.calls[0]).toEqual(['create', 'path=a.md', 'content=x\\ny', 'overwrite']);
		});
	});
});

describe('encodeContent', () => {
	it('escapes newlines and tabs', () => {
		expect(encodeContent('a\r\nb\tc')).toBe('a\\nb\\tc');
	});
});

describe('CliVaultGateway safety', () => {
	describe('when the CLI prints an error with a success exit code', () => {
		it('rejects instead of returning the message as note content', async () => {
			const gateway = new CliVaultGateway(new RecordingRunner('Error: File "x.md" not found.'));
			await expect(gateway.readNote('x.md')).rejects.toThrow('not found');
		});
	});

	describe('when writing a note that contains a backslash', () => {
		it('refuses, because the CLI treats backslash sequences as escapes', async () => {
			const runner = new RecordingRunner('');
			await expect(new CliVaultGateway(runner).writeNote('a.md', 'math \\theta')).rejects.toThrow('backslash');
		});

		it('does not call the CLI', async () => {
			const runner = new RecordingRunner('');
			await new CliVaultGateway(runner).writeNote('a.md', 'math \\theta').catch(() => undefined);
			expect(runner.calls).toEqual([]);
		});
	});

	describe('when the note exceeds the command line limit', () => {
		it('refuses with a size message', async () => {
			const gateway = new CliVaultGateway(new RecordingRunner(''), { maxContentLength: 10 });
			await expect(gateway.writeNote('a.md', 'x'.repeat(11))).rejects.toThrow('too large');
		});
	});

	describe('notesWithTag', () => {
		it('asks the CLI for the tag without a hash', async () => {
			const runner = new RecordingRunner('');
			await new CliVaultGateway(runner).notesWithTag('#ml');
			expect(runner.calls[0]).toEqual(['tag', 'name=ml', 'verbose']);
		});

		it('returns the markdown paths in the output', async () => {
			const gateway = new CliVaultGateway(new RecordingRunner('#ml\t2\n\ta.md\n\tsub/b.md\n'));
			expect(await gateway.notesWithTag('ml')).toEqual(['a.md', 'sub/b.md']);
		});
	});
});

describe('CliVaultGateway version', () => {
	it('runs the version command against the configured vault', async () => {
		const runner = new RecordingRunner('1.14.4');
		await new CliVaultGateway(runner, { vaultName: 'Main' }).version();
		expect(runner.calls[0]).toEqual(['vault=Main', 'version']);
	});
});
