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
