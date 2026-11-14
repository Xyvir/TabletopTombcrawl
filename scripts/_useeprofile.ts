import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

const cases: [string, number][] = [
	['dcch', 294],
	['dcdd', 100142],
	['dcsh', 69],
	['hcch', 0],
	['sccc', 53950],
];
for (const [key, seed] of cases) {
	const state = createTombState(seed || 1, FREE_CELL_COUNT.med);
	const started = Date.now();
	const result = solveTomb({ state, goal: 'boss', strategy: 'best', beamWidth: 300, depth: 300, nodes: 800_000, timeBudgetMs: 90_000 });
	if (!result.solved) {
		console.log(`${key} ${seed}: none (${((Date.now() - started) / 1000).toFixed(0)}s)`);
		continue;
	}
	const tally: Record<string, number> = {};
	for (const step of result.steps) {
		const kind = step.label.trim().split(/\s+/)[0];
		tally[kind] = (tally[kind] ?? 0) + 1;
	}
	console.log(`${key} ${seed}: ${result.steps.length} moves in ${((Date.now() - started) / 1000).toFixed(0)}s · ${JSON.stringify(tally)}`);
}
