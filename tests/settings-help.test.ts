import { describe, it, expect } from 'vitest';
import { SUGGESTION_OVERVIEW, SUGGESTION_SETTING_HELP, formatDefault, type SuggestionSettingKey } from '../src/settings-help';

const keys: SuggestionSettingKey[] = ['neighbors', 'minSimilarity', 'minScore', 'maxSuggestions', 'maxNewTags'];
const defaults = { neighbors: 10, minSimilarity: 0.35, minScore: 0.25, maxSuggestions: 8, maxNewTags: 2 };

describe('SUGGESTION_SETTING_HELP', () => {
	describe.each(keys)('for %s', (key) => {
		it('explains what the setting does', () => {
			expect(SUGGESTION_SETTING_HELP[key].what.length).toBeGreaterThan(0);
		});

		it('explains what a lower value does', () => {
			expect(SUGGESTION_SETTING_HELP[key].lower.length).toBeGreaterThan(0);
		});

		it('explains what a higher value does', () => {
			expect(SUGGESTION_SETTING_HELP[key].higher.length).toBeGreaterThan(0);
		});
	});
});

describe('SUGGESTION_OVERVIEW', () => {
	it('has several steps', () => {
		expect(SUGGESTION_OVERVIEW.length).toBeGreaterThanOrEqual(3);
	});
});

describe('formatDefault', () => {
	describe('when the default is a whole number', () => {
		it('shows it without decimals', () => {
			expect(formatDefault('neighbors', defaults)).toBe('Default: 10');
		});
	});

	describe('when the default is a fraction', () => {
		it('shows it as stored', () => {
			expect(formatDefault('minSimilarity', defaults)).toBe('Default: 0.35');
		});
	});
});
