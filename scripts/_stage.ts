import corpus from '../public/corpus.json';
import { createTombState, FREE_CELL_COUNT } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

/**
 * Two-stage relay: win the boss, then carry on from the board that won it and look for a clear.
 * The middle board is the last state of the boss line, so no rule is re-invented to get there.
 */
type Entry = { seed: number; loadout: string; goal: 'clear' | 'boss'; difficulty: keyof typeof FREE_CELL_COUNT };
const entries = (corpus.entries as Entry[]).filter((entry) => entry.goal === 'boss').filter((_, index) => index % 5 === 0);
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 4);
const slice = entries.filter((_, index) => index % shards === shard);

let bossWins = 0;
let relayWins = 0;
let directWins = 0;
for (const entry of slice) {
	const state = createTombState(entry.seed, FREE_CELL_COUNT[entry.difficulty]);
	const boss = solveTomb({ state, goal: 'boss', strategy: 'best', nodes: 150_000, timeBudgetMs: 15_000 });
	const direct = solveTomb({ state, goal: 'clear', strategy: 'best', nodes: 300_000, timeBudgetMs: 30_000 });
	let relay: { solved: boolean; steps: number } | null = null;
	if (boss.solved) {
		bossWins += 1;
		const mid = boss.steps[boss.steps.length - 1].state;
		const second = solveTomb({ state: mid, goal: 'clear', strategy: 'best', nodes: 150_000, timeBudgetMs: 15_000 });
		relay = { solved: second.solved, steps: second.solved ? boss.steps.length + second.steps.length : 0 };
		if (second.solved) relayWins += 1;
	}
	if (direct.solved) directWins += 1;
	console.log(
		`${entry.loadout} ${entry.seed} · boss ${boss.solved ? `win ${boss.steps.length}` : 'no'} · relay ${relay ? (relay.solved ? `CLEAR ${relay.steps}` : 'no') : '-'} · direct ${direct.solved ? `win ${direct.steps.length}` : 'no'}`
	);
}
console.log(`shard ${shard}: ${slice.length} deals · boss ${bossWins} · relay clear ${relayWins} · direct clear ${directWins}`);
