import type { VaultGateway } from '../cli/gateway';
import { diffLines, type LineChange } from '../diff';
import { transformTags, type TagMapper } from '../tags/transform';

export interface FilePlan {
	path: string;
	before: string;
	after: string;
	changes: LineChange[];
}

export interface ChangePlan {
	description: string;
	files: FilePlan[];
}

/** Reads each candidate note and keeps those the mapper actually changes. Nothing is written. */
export async function planTagChange(
	description: string,
	paths: string[],
	gateway: VaultGateway,
	mapper: TagMapper,
): Promise<ChangePlan> {
	const files: FilePlan[] = [];
	for (const path of paths) {
		const before = await gateway.readNote(path);
		const after = transformTags(before, mapper);
		if (after !== before) files.push({ path, before, after, changes: diffLines(before, after) });
	}
	return { description, files };
}

/** The same plan limited to the chosen notes. */
export function restrictPlan(plan: ChangePlan, paths: Set<string>): ChangePlan {
	return { ...plan, files: plan.files.filter((file) => paths.has(file.path)) };
}

export interface ApplyResult {
	applied: string[];
	failed: { path: string; reason: string }[];
	/** Original content of every note that was written, for undo. */
	originals: Record<string, string>;
}

const sameText = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n').trimEnd() === b.replace(/\r\n/g, '\n').trimEnd();

/**
 * Writes the plan through the CLI. Each write is verified by reading the note back; on any mismatch the
 * original content is restored, so a misbehaving CLI cannot leave a corrupted note behind.
 */
export async function applyPlan(
	plan: ChangePlan,
	gateway: VaultGateway,
	onProgress?: (done: number, total: number) => void,
	/** Called with the original content of every note in the plan before the first write, so undo data survives a crash. */
	beforeApply?: (originals: Record<string, string>) => Promise<void>,
): Promise<ApplyResult> {
	await beforeApply?.(Object.fromEntries(plan.files.map((file) => [file.path, file.before])));
	const result: ApplyResult = { applied: [], failed: [], originals: {} };
	let done = 0;
	for (const file of plan.files) {
		try {
			const current = await gateway.readNote(file.path);
			if (!sameText(current, file.before)) {
				result.failed.push({ path: file.path, reason: 'note changed since the preview' });
			} else {
				await gateway.writeNote(file.path, file.after);
				const written = await gateway.readNote(file.path);
				if (sameText(written, file.after)) {
					result.applied.push(file.path);
					result.originals[file.path] = file.before;
				} else {
					await gateway.writeNote(file.path, file.before);
					result.failed.push({ path: file.path, reason: 'write verification failed; original restored' });
				}
			}
		} catch (error) {
			result.failed.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) });
		}
		onProgress?.(++done, plan.files.length);
	}
	return result;
}

/** Restores originals captured by a previous apply. */
export async function restoreOriginals(originals: Record<string, string>, gateway: VaultGateway): Promise<number> {
	let restored = 0;
	for (const [path, content] of Object.entries(originals)) {
		await gateway.writeNote(path, content);
		restored++;
	}
	return restored;
}
