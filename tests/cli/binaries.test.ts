import { describe, it, expect } from 'vitest';
import { candidateBinaries, sanitizedEnv } from '../../src/cli/runner';

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
		it('asks for the terminal redirector rather than the GUI executable', () => {
			expect(candidateBinaries('obsidian', 'win32', 'C:\\Users\\u', 'C:\\Users\\u\\AppData\\Local')[0]).toBe('obsidian.com');
		});

		it('falls back to the per-user install location', () => {
			expect(candidateBinaries('obsidian', 'win32', 'C:\\Users\\u', 'C:\\Users\\u\\AppData\\Local')).toContain(
				'C:\\Users\\u\\AppData\\Local\\Programs\\Obsidian\\Obsidian.com',
			);
		});
	});

	describe('when the default name is used on windows without LOCALAPPDATA', () => {
		it('uses the redirector name alone', () => {
			expect(candidateBinaries('obsidian', 'win32', 'C:\\Users\\u', '')).toEqual(['obsidian.com']);
		});
	});
});

describe('candidateBinaries next to the running Obsidian', () => {
	describe('on Windows', () => {
		it('tries Obsidian.com beside Obsidian.exe first', () => {
			expect(
				candidateBinaries('', 'win32', 'C:\\Users\\u', 'C:\\Users\\u\\AppData\\Local', 'D:\\Apps\\Obsidian\\Obsidian.exe')[0],
			).toBe('D:\\Apps\\Obsidian\\Obsidian.com');
		});
	});

	describe('on macOS', () => {
		it('tries obsidian-cli beside the app binary first', () => {
			expect(candidateBinaries('', 'darwin', '/Users/u', '', '/Applications/Obsidian.app/Contents/MacOS/Obsidian')[0]).toBe(
				'/Applications/Obsidian.app/Contents/MacOS/obsidian-cli',
			);
		});
	});

	describe('on Linux', () => {
		it('tries obsidian-cli beside the app binary first', () => {
			expect(candidateBinaries('', 'linux', '/home/u', '', '/opt/Obsidian/obsidian')[0]).toBe('/opt/Obsidian/obsidian-cli');
		});

		it('still falls back to the name on PATH', () => {
			expect(candidateBinaries('', 'linux', '/home/u', '', '/opt/Obsidian/obsidian')).toContain('obsidian');
		});
	});

	describe('when the setting is empty', () => {
		it('behaves like the default name', () => {
			expect(candidateBinaries('', 'linux', '/home/u')).toEqual(candidateBinaries('obsidian', 'linux', '/home/u'));
		});
	});

	describe('when the app path is unknown', () => {
		it('uses the other candidates only', () => {
			expect(candidateBinaries('', 'win32', 'C:\\Users\\u', '', '')).toEqual(['obsidian.com']);
		});
	});

	describe('when a custom path is configured', () => {
		it('uses only that path', () => {
			expect(candidateBinaries('/opt/custom', 'linux', '/home/u', '', '/opt/Obsidian/obsidian')).toEqual(['/opt/custom']);
		});
	});
});

describe('sanitizedEnv', () => {
	describe('when the environment has ELECTRON_ variables', () => {
		it('removes them so the CLI starts as a fresh app', () => {
			expect(Object.keys(sanitizedEnv({ ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1', PATH: 'x' }))).toEqual(['PATH']);
		});
	});

	describe('when the environment has other variables', () => {
		it('keeps them', () => {
			expect(sanitizedEnv({ PATH: 'x', HOME: 'y' })).toEqual({ PATH: 'x', HOME: 'y' });
		});
	});
});
