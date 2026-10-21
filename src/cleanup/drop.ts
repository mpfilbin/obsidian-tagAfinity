import { mergeAction, moveAction, type ActionResult } from './tag-actions';

/**
 * What dropping `dragged` onto `target` means. `target` is a tag path, or null for the top-level drop zone.
 * A plain drop nests the tag under the target; with the merge modifier it is folded into the target instead.
 */
export function resolveDrop(dragged: string, target: string | null, merge: boolean): ActionResult {
	if (merge) {
		if (target === null) return { ok: false, error: 'A merge needs a target tag.' };
		return mergeAction(dragged, target);
	}
	return moveAction(dragged, target ?? '');
}
