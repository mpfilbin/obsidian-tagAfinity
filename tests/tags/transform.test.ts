import { describe, it, expect } from 'vitest';
import { addTags, composeMappers, removeMapper, renameMapper, transformTags } from '../../src/tags/transform';

describe('transformTags with renameMapper', () => {
	const rename = renameMapper('ml', 'machine-learning');

	describe('when the tag is in a block list', () => {
		it('renames it in frontmatter', () => {
			expect(transformTags('---\ntags:\n  - ml\n  - x\n---\nbody', rename)).toBe(
				'---\ntags:\n  - machine-learning\n  - x\n---\nbody',
			);
		});
	});

	describe('when the tag is inline', () => {
		it('renames it in the body', () => {
			expect(transformTags('about #ml today', rename)).toBe('about #machine-learning today');
		});
	});

	describe('when the tag has nested children', () => {
		it('renames the parent segment', () => {
			expect(transformTags('x #ml/nlp y', rename)).toBe('x #machine-learning/nlp y');
		});
	});

	describe('when the target already exists in frontmatter', () => {
		it('de-duplicates the list', () => {
			expect(transformTags('---\ntags: [ml, machine-learning]\n---\n', rename)).toBe(
				'---\ntags: [machine-learning]\n---\n',
			);
		});
	});

	describe('when a similarly prefixed tag exists', () => {
		it('leaves it alone', () => {
			expect(transformTags('#mlops here', rename)).toBe('#mlops here');
		});
	});

	describe('when the tag is only in a code block', () => {
		it('leaves it alone', () => {
			expect(transformTags('```\n#ml\n```', rename)).toBe('```\n#ml\n```');
		});
	});
});

describe('transformTags with removeMapper', () => {
	describe('when the only frontmatter tag is removed', () => {
		it('drops the property', () => {
			expect(transformTags('---\ntitle: T\ntags: [a]\n---\nb', removeMapper('a'))).toBe('---\ntitle: T\n---\nb');
		});
	});

	describe('when an inline tag is removed', () => {
		it('removes the token and its leading space', () => {
			expect(transformTags('word #a more', removeMapper('a'))).toBe('word more');
		});
	});
});

describe('addTags', () => {
	describe('when the note has no frontmatter', () => {
		it('creates a frontmatter block', () => {
			expect(addTags('body', ['x'], [])).toBe('---\ntags:\n  - x\n---\nbody');
		});
	});

	describe('when the note has a flow list', () => {
		it('appends in the same style', () => {
			expect(addTags('---\ntags: [a]\n---\nb', ['x'], ['a'])).toBe('---\ntags: [a, x]\n---\nb');
		});
	});

	describe('when the tag is already present inline', () => {
		it('does not change the note', () => {
			expect(addTags('see #x', ['x'], ['x'])).toBe('see #x');
		});
	});

	describe('when frontmatter exists without tags', () => {
		it('adds a tags property', () => {
			expect(addTags('---\ntitle: T\n---\nb', ['x'], [])).toBe('---\ntitle: T\ntags:\n  - x\n---\nb');
		});
	});
});

describe('composeMappers', () => {
	describe('when two renames apply to different tags', () => {
		it('applies each to its own tag', () => {
			const mapper = composeMappers(renameMapper('ml', 'machine-learning'), renameMapper('js', 'javascript'));
			expect(transformTags('#ml and #js', mapper)).toBe('#machine-learning and #javascript');
		});
	});

	describe('when a rename is followed by a removal of its result', () => {
		it('applies them in order', () => {
			const mapper = composeMappers(renameMapper('ml', 'old'), removeMapper('old'));
			expect(transformTags('x #ml y', mapper)).toBe('x y');
		});
	});

	describe('when a tag is removed by the first mapper', () => {
		it('does not pass it to the next', () => {
			const mapper = composeMappers(removeMapper('a'), renameMapper('a', 'b'));
			expect(mapper('a')).toBeNull();
		});
	});

	describe('when given no mappers', () => {
		it('leaves tags unchanged', () => {
			expect(composeMappers()('x')).toBe('x');
		});
	});
});
