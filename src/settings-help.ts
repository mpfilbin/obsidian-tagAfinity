/** The suggestion settings that have a slider. */
export type SuggestionSettingKey = 'neighbors' | 'minSimilarity' | 'minScore' | 'maxSuggestions' | 'maxNewTags';

export interface SettingHelp {
	/** What the setting controls. */
	what: string;
	/** What happens to the suggestions when the value goes down. */
	lower: string;
	/** What happens to the suggestions when the value goes up. */
	higher: string;
}

/** How a suggestion is made, in order; shown above the sliders. */
export const SUGGESTION_OVERVIEW: string[] = [
	'The notes whose content is most similar to the current note (compared by meaning, using the embeddings in the index) are its neighbors.',
	'Each neighbor votes for the tags it has. A closer neighbor’s vote counts for more.',
	'A tag’s score is its share of the votes, lowered a little for tags that are on a large part of your vault, so very common tags do not always win. Tags the note already has are never suggested.',
	'Tags with a high enough score are suggested. Only when fewer than three existing tags qualify are new tags proposed, from the note’s most distinctive keywords.',
];

export const SUGGESTION_SETTING_HELP: Record<SuggestionSettingKey, SettingHelp> = {
	neighbors: {
		what: 'How many of the most similar notes get to vote on tags.',
		lower: 'Suggestions follow only the closest few notes: more precise, but one odd neighbor can sway them.',
		higher: 'More notes vote, so suggestions reflect the wider topic, but each tag’s share of the votes shrinks and fewer reach the minimum tag score.',
	},
	minSimilarity: {
		what: 'How similar another note must be (0 to 1) before it counts as a neighbor at all.',
		lower: 'Loosely related notes can vote, which finds more tags but adds off-topic ones.',
		higher: 'Only strongly related notes vote. If none qualify, no existing tags are suggested and the plugin falls back to keywords.',
	},
	minScore: {
		what: 'How much of the neighbors’ vote a tag needs to be suggested (0 to 1).',
		lower: 'Tags that only one or two neighbors have are shown too: a longer, more speculative list.',
		higher: 'Only tags most of the close neighbors agree on are shown: a shorter, safer list, which can come back empty.',
	},
	maxSuggestions: {
		what: 'The most tags the suggestion window lists, existing and new together.',
		lower: 'A short list of only the best-scoring tags.',
		higher: 'A longer list that reaches further down the ranking. It never adds tags that fail the minimum score.',
	},
	maxNewTags: {
		what: 'The most brand-new tags (from the note’s keywords) that may be proposed. Applies only when “Suggest new tags” is on.',
		lower: 'Fewer invented tags: the vocabulary stays closer to what you already use.',
		higher: 'More new tags can appear, which grows your taxonomy faster.',
	},
};

/** "Default: 10" for a setting, so the text cannot drift from the real default. */
export function formatDefault(key: SuggestionSettingKey, defaults: Record<SuggestionSettingKey, number>): string {
	return `Default: ${defaults[key]}`;
}
