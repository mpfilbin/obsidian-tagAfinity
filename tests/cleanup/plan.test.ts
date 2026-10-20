import { describe, it, expect } from 'vitest';
import { applyPlan, planTagChange, restoreOriginals } from '../../src/cleanup/plan';
import { renameMapper } from '../../src/tags/transform';
import { FakeGateway } from '../helpers';

const files = () => ({ 'a.md': 'about #ml', 'b.md': 'nothing here', 'c.md': '---\ntags: [ml]\n---\n' });

describe('planTagChange', () => {
	it('includes only notes that change', async () => {
		const plan = await planTagChange('rename', ['a.md', 'b.md', 'c.md'], new FakeGateway(files()), renameMapper('ml', 'machine-learning'));
		expect(plan.files.map((f) => f.path)).toEqual(['a.md', 'c.md']);
	});

	it('does not write anything', async () => {
		const gateway = new FakeGateway(files());
		await planTagChange('rename', ['a.md'], gateway, renameMapper('ml', 'x'));
		expect(gateway.writes).toEqual([]);
	});

	it('records line changes for the preview', async () => {
		const plan = await planTagChange('rename', ['a.md'], new FakeGateway(files()), renameMapper('ml', 'x'));
		expect(plan.files[0]!.changes).toEqual([
			{ type: '-', line: 1, text: 'about #ml' },
			{ type: '+', line: 1, text: 'about #x' },
		]);
	});
});

describe('applyPlan', () => {
	describe('when writes succeed', () => {
		it('updates the notes', async () => {
			const gateway = new FakeGateway(files());
			const plan = await planTagChange('r', ['a.md'], gateway, renameMapper('ml', 'x'));
			await applyPlan(plan, gateway);
			expect(gateway.files['a.md']).toBe('about #x');
		});

		it('captures originals for undo', async () => {
			const gateway = new FakeGateway(files());
			const plan = await planTagChange('r', ['a.md'], gateway, renameMapper('ml', 'x'));
			expect((await applyPlan(plan, gateway)).originals).toEqual({ 'a.md': 'about #ml' });
		});
	});

	describe('when the note changed after the preview', () => {
		it('skips it', async () => {
			const gateway = new FakeGateway(files());
			const plan = await planTagChange('r', ['a.md'], gateway, renameMapper('ml', 'x'));
			gateway.files['a.md'] = 'edited meanwhile #ml';
			const result = await applyPlan(plan, gateway);
			expect(result.failed.map((f) => f.reason)).toEqual(['note changed since the preview']);
		});
	});

	describe('when the CLI corrupts the written content', () => {
		it('restores the original note', async () => {
			const healthy = new FakeGateway(files());
			const plan = await planTagChange('r', ['a.md'], healthy, renameMapper('ml', 'x'));
			const flaky = new FakeGateway(files(), true);
			await applyPlan(plan, flaky);
			expect(flaky.files['a.md']).toBe('about #mlX');
		});
	});
});

describe('restoreOriginals', () => {
	it('writes every original back', async () => {
		const gateway = new FakeGateway({ 'a.md': 'new' });
		await restoreOriginals({ 'a.md': 'old' }, gateway);
		expect(gateway.files['a.md']).toBe('old');
	});
});
