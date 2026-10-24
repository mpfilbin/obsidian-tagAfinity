import { describe, it, expect } from 'vitest';
import { proseOf } from '../../src/text/tokenize';

describe('proseOf', () => {
	describe('when a note embeds an SVG', () => {
		it('leaves out its contents', () => {
			expect(proseOf('<svg><text>chart label</text></svg> hello world')).toBe('hello world');
		});
	});

	describe('when a note has an HTML link', () => {
		it('keeps the link text and drops the markup', () => {
			expect(proseOf('<a href="https://example.com/x">link text</a>')).toBe('link text');
		});
	});

	describe('when a note contains a bare URL', () => {
		it('leaves the URL out', () => {
			expect(proseOf('see https://example.com/page#frag for details')).toBe('see for details');
		});
	});
});
