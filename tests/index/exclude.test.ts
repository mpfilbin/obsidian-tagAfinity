import { describe, it, expect } from 'vitest';
import { isExcluded, parseExcludePatterns } from '../../src/index/exclude';

describe('isExcluded', () => {
	describe('when a pattern starts with a wildcard', () => {
		it('matches by file name suffix', () => {
			expect(isExcluded('Drawings/Map.excalidraw.md', ['*.excalidraw.md'])).toBe(true);
		});
	});

	describe('when a pattern names a folder', () => {
		it('matches notes inside it at any depth', () => {
			expect(isExcluded('Calendar/_templates/Daily/{{date}}.md', ['Calendar/_templates'])).toBe(true);
		});
	});

	describe('when a folder pattern only shares a prefix', () => {
		it('does not match a sibling folder', () => {
			expect(isExcluded('Templater2/a.md', ['Templater'])).toBe(false);
		});
	});

	describe('when no pattern matches', () => {
		it('keeps the note', () => {
			expect(isExcluded('AI/Note.md', ['*.excalidraw.md', 'Templater'])).toBe(false);
		});
	});

	describe('when comparing case', () => {
		it('ignores it', () => {
			expect(isExcluded('templater/a.md', ['Templater'])).toBe(true);
		});
	});
});

describe('parseExcludePatterns', () => {
	it('splits lines, trims, and drops blanks', () => {
		expect(parseExcludePatterns(' a \n\n b/ \n')).toEqual(['a', 'b']);
	});
});
