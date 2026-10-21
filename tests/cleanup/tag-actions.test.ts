import { describe, it, expect } from 'vitest';
import {
	affectedNotes,
	isSameOrDescendant,
	mergeAction,
	moveAction,
	removeAction,
	renameAction,
	validateTagName,
} from '../../src/cleanup/tag-actions';
import { collectTagStats } from '../../src/taxonomy/build';
import { transformTags } from '../../src/tags/transform';
import { indexOf } from '../helpers';

const stats = (tagsByNote: Record<string, string[]>) =>
	collectTagStats(indexOf(Object.fromEntries(Object.entries(tagsByNote).map(([p, tags]) => [p, { vector: [1], tags }]))), { centroids: false });

describe('validateTagName', () => {
	it('accepts letters, digits, underscores, hyphens and slashes', () => {
		expect(validateTagName('area/sub-topic_2')).toBeNull();
	});

	describe('when the name is empty', () => {
		it('is rejected', () => {
			expect(validateTagName('  ')).toMatch(/empty/i);
		});
	});

	describe('when the name contains a space', () => {
		it('is rejected', () => {
			expect(validateTagName('two words')).toMatch(/space/i);
		});
	});

	describe('when the name has only digits', () => {
		it('is rejected, because Obsidian would not treat it as a tag', () => {
			expect(validateTagName('2026')).toMatch(/digit/i);
		});
	});

	describe('when the name has other symbols', () => {
		it('is rejected', () => {
			expect(validateTagName('a,b')).toMatch(/letters/i);
		});
	});

	describe('when the name begins or ends with a slash', () => {
		it('is rejected', () => {
			expect(validateTagName('/a')).toMatch(/slash/i);
		});
	});

	describe('when the name has a leading hash', () => {
		it('is accepted, since the hash is stripped', () => {
			expect(validateTagName('#bread')).toBeNull();
		});
	});
});

describe('isSameOrDescendant', () => {
	it('is true for the same tag', () => {
		expect(isSameOrDescendant('a/b', 'a/b')).toBe(true);
	});

	it('is true for a nested tag', () => {
		expect(isSameOrDescendant('a/b/c', 'a/b')).toBe(true);
	});

	it('is false for a tag that only shares a prefix', () => {
		expect(isSameOrDescendant('a/bc', 'a/b')).toBe(false);
	});

	it('ignores case', () => {
		expect(isSameOrDescendant('A/B', 'a')).toBe(true);
	});
});

describe('renameAction', () => {
	it('keeps the tag in its place and changes only the last part', () => {
		const result = renameAction('area/old', 'new');
		expect(result.ok && transformTags('#area/old', result.action.mapper)).toBe('#area/new');
	});

	it('renames nested tags with it', () => {
		const result = renameAction('area/old', 'new');
		expect(result.ok && transformTags('#area/old/child', result.action.mapper)).toBe('#area/new/child');
	});

	it('describes the change', () => {
		const result = renameAction('area/old', 'new');
		expect(result.ok && result.action.description).toBe('Rename #area/old to #area/new');
	});

	describe('when the name is invalid', () => {
		it('reports why', () => {
			expect(renameAction('a', 'bad name')).toEqual({ ok: false, error: expect.stringMatching(/space/i) });
		});
	});

	describe('when the name is unchanged', () => {
		it('reports that nothing would change', () => {
			expect(renameAction('a', 'a')).toEqual({ ok: false, error: expect.stringMatching(/same/i) });
		});
	});
});

describe('action targets', () => {
	it('a rename reports the resulting tag', () => {
		const result = renameAction('area/old', 'new');
		expect(result.ok && result.action.target).toBe('area/new');
	});

	it('a move reports the resulting tag', () => {
		const result = moveAction('bread', 'cooking');
		expect(result.ok && result.action.target).toBe('cooking/bread');
	});

	it('every action reports where it starts', () => {
		const result = mergeAction('ml', 'machine-learning');
		expect(result.ok && result.action.source).toBe('ml');
	});
});

describe('moveAction', () => {
	it('nests a tag under another', () => {
		const result = moveAction('bread', 'cooking');
		expect(result.ok && transformTags('#bread', result.action.mapper)).toBe('#cooking/bread');
	});

	it('keeps the last part of a nested tag when moving it', () => {
		const result = moveAction('old/bread', 'cooking');
		expect(result.ok && transformTags('#old/bread', result.action.mapper)).toBe('#cooking/bread');
	});

	it('moves nested tags along', () => {
		const result = moveAction('bread', 'cooking');
		expect(result.ok && transformTags('#bread/sourdough', result.action.mapper)).toBe('#cooking/bread/sourdough');
	});

	describe('when the new parent is the top level', () => {
		it('removes the parent part', () => {
			const result = moveAction('cooking/bread', '');
			expect(result.ok && transformTags('#cooking/bread', result.action.mapper)).toBe('#bread');
		});

		it('describes it', () => {
			const result = moveAction('cooking/bread', '');
			expect(result.ok && result.action.description).toBe('Move #cooking/bread to the top level');
		});
	});

	describe('when the new parent is the tag itself or inside it', () => {
		it('is rejected', () => {
			expect(moveAction('a', 'a/b')).toEqual({ ok: false, error: expect.stringMatching(/inside itself/i) });
		});
	});

	describe('when the tag is already there', () => {
		it('is rejected', () => {
			expect(moveAction('cooking/bread', 'cooking')).toEqual({ ok: false, error: expect.stringMatching(/already/i) });
		});
	});

	describe('when the new parent is not a valid tag', () => {
		it('is rejected', () => {
			expect(moveAction('a', 'bad parent')).toEqual({ ok: false, error: expect.stringMatching(/space/i) });
		});
	});
});

describe('mergeAction', () => {
	it('renames the tag into the target', () => {
		const result = mergeAction('ml', 'machine-learning');
		expect(result.ok && transformTags('#ml', result.action.mapper)).toBe('#machine-learning');
	});

	describe('when merging a tag into itself', () => {
		it('is rejected', () => {
			expect(mergeAction('a', 'a')).toEqual({ ok: false, error: expect.stringMatching(/itself/i) });
		});
	});

	describe('when merging a tag into one of its own nested tags', () => {
		it('is rejected', () => {
			expect(mergeAction('a', 'a/b')).toEqual({ ok: false, error: expect.stringMatching(/itself/i) });
		});
	});
});

describe('removeAction', () => {
	it('removes only the exact tag by default', () => {
		const result = removeAction('a', false);
		expect(result.action.mapper('a/b')).toBe('a/b');
	});

	it('can remove nested tags too', () => {
		expect(removeAction('a', true).action.mapper('a/b')).toBeNull();
	});

	it('describes the scope', () => {
		expect(removeAction('a', true).action.description).toBe('Remove #a and nested tags');
	});
});

describe('affectedNotes', () => {
	const all = stats({
		'1.md': ['bread', 'cooking'],
		'2.md': ['bread/sourdough'],
		'3.md': ['soup'],
		'4.md': ['old-name'],
	});

	it('lists notes that carry a changed tag', () => {
		const result = moveAction('bread', 'cooking');
		expect(result.ok && affectedNotes(all, result.action.mapper).sort()).toEqual(['1.md', '2.md']);
	});

	it('ignores notes the change does not touch', () => {
		const result = moveAction('bread', 'cooking');
		expect(result.ok && affectedNotes(all, result.action.mapper)).not.toContain('3.md');
	});

	describe('when changes are chained', () => {
		it('finds notes that only the second change touches', () => {
			const first = renameAction('old-name', 'new-name');
			const second = moveAction('new-name', 'archive');
			if (!first.ok || !second.ok) throw new Error('setup');
			const chained = (tag: string) => {
				const mid = first.action.mapper(tag);
				return mid === null ? null : second.action.mapper(mid);
			};
			expect(affectedNotes(all, chained)).toEqual(['4.md']);
		});
	});
});
