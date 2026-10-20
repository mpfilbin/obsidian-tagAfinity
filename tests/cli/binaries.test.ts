import { describe, it, expect } from 'vitest';
import { candidateBinaries } from '../../src/cli/runner';

describe('candidateBinaries', () => {
	describe('when a custom path is configured', () => {
		it('uses only that path', () => {
			expect(candidateBinaries('/opt/obs', 'linux', '/home/u')).toEqual(['/opt/obs']);
		});
	});

	describe('when the default name is used on linux', () => {
		it('falls back to the registered location in the home directory', () => {
			expect(candidateBinaries('obsidian', 'linux', '/home/u')).toEqual(['obsidian', '/home/u/.local/bin/obsidian']);
		});
	});

	describe('when the default name is used on macOS', () => {
		it('falls back to the registered symlink', () => {
			expect(candidateBinaries('obsidian', 'darwin', '/Users/u')).toEqual(['obsidian', '/usr/local/bin/obsidian']);
		});
	});

	describe('when the default name is used on windows', () => {
		it('relies on PATH alone', () => {
			expect(candidateBinaries('obsidian', 'win32', 'C:\\Users\\u')).toEqual(['obsidian']);
		});
	});
});
