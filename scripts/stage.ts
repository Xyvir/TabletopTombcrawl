/**
 * The relay: win the boss first, then carry on from the board that won it and look for a clear.
 *
 * A boss kill and a clear are the same run played to different ends, and the boss is much the cheaper
 * target — one king home rather than every card. The board that wins it is therefore a snapshot of a
 * run already sixty to a hundred and fifty plies deep, and a clear search started there is not asked
 * to find that grind a second time: it inherits it, with the hearts, levels and cleared cells the boss
 * line paid for already banked.
 *
 * Measured over 47 corpus deals at 150k a stage (`_stage.ts`, 2026-11-13): a relay found 6 clears where
 * a direct clear search on the same deal at twice the budget also found 6, and the two sets shared
 * exactly one deal. The relay is not a better search, it is a *different* one — which is what a
 * portfolio wants.
 *
 *   SHARD=<i> SHARDS=<n> ONLY=<loadout,...> BOSS=<states> CLEAR=<states> TIME=<ms a stage> OUT=<path>
 *
 * `MODE=missing` turns the relay loose on the keys the corpus has never filled, which is the other way
 * round: a boss win is the cheaper target, so a key that resists a clear might still fall to the relay.
 *
 *   MODE=missing FROM=<seed> SPAN=<n> [PER_KEY=3] ...
 *
 * Writes shard rows next to the corpus plan, so `MODE=merge node scripts/run.mjs scripts/corpus.ts`
 * folds them in like any other scan.
 */
import { writeFileSync } from 'node:fs';
import corpus from '../public/corpus.json';
import { FREE_CELL_COUNT, createTombState, type Difficulty, type TombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Entry {
	loadout: string;
	boss: string | null;
	seed: number;
	moves: number;
	difficulty: string;
	goal: string;
	party: { role: string; name: string; suit: string }[];
	at: string | null;
}

const mode = process.env.MODE ?? 'relay';
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const bossBudget = Number(process.env.BOSS ?? 150_000);
const clearBudget = Number(process.env.CLEAR ?? 150_000);
const stageTime = Number(process.env.TIME ?? 30_000);
const out = process.env.OUT ?? `corpus/scan-stage-${shard}.json`;
const only = (process.env.ONLY ?? '')
	.split(',')
	.map((key) => key.trim())
	.filter(Boolean);

const difficulty = (process.env.DIFFICULTY ?? 'med') as Difficulty;

const loadoutOf = (state: TombState) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

const rowFor = (state: TombState, seed: number, moves: number, goal: 'boss' | 'clear'): Entry => ({
	loadout: loadoutOf(state),
	boss: state.bossSuit,
	seed,
	moves,
	difficulty,
	goal,
	party: [...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((draft) => ({ role: draft.role, name: draft.name, suit: draft.suit })),
	at: new Date().toISOString(),
});

// Only boss rows: a key that already cleared has nothing to gain from a relay.
const mine = mode === 'missing' ? [] : (corpus.entries as Entry[])
	.filter((entry) => entry.goal === 'boss')
	.filter((entry) => !only.length || only.includes(entry.loadout))
	.filter((_, index) => index % shards === shard);

const rows: Entry[] = [];
for (const entry of mine) {
	const difficulty = entry.difficulty as Difficulty;
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
	const boss = solveTomb({
		state,
		goal: 'boss',
		strategy: 'best',
		nodes: bossBudget,
		timeBudgetMs: stageTime,
	});
	if (!boss.solved) {
		console.log(`miss ${entry.loadout} seed ${entry.seed} · boss not won at ${bossBudget}`);
		continue;
	}
	// The snapshot is the last board of the boss line: the rules built it, so nothing is re-invented.
	const middle = boss.steps[boss.steps.length - 1].state;
	const clear = solveTomb({
		state: middle,
		goal: 'clear',
		strategy: 'best',
		nodes: clearBudget,
		timeBudgetMs: stageTime,
	});
	if (!clear.solved) {
		console.log(`hold ${entry.loadout} seed ${entry.seed} · boss ${boss.steps.length}, no clear in ${clearBudget}`);
		continue;
	}
	rows.push(rowFor(state, entry.seed, boss.steps.length + clear.steps.length, 'clear'));
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	console.log(`clear ${entry.loadout} seed ${entry.seed} ${rows[rows.length - 1].moves}mv · ${boss.steps.length}+${clear.steps.length}`);
}
console.log(`stage shard ${shard}: ${rows.length} clears of ${mine.length} relays tried`);

/**
 * The same relay aimed at keys the corpus has never filled. A boss win is a far cheaper target than a
 * clear, so a key that has resisted every clear search may still fall to a boss line — and once the
 * key is filled, the relay's second stage is the free shot at turning it into a clear.
 */
if (mode === 'missing') {
	const from = Number(process.env.FROM ?? 70_001);
	const span = Number(process.env.SPAN ?? 4_000);
	const perKey = Number(process.env.PER_KEY ?? 3);
	const targets = (corpus.missing as string[]).filter((_, index) => index % shards === shard);
	for (const key of targets) {
		let tried = 0;
		let filled = false;
		for (let seed = from + shard * span; seed < from + (shard + 1) * span && tried < perKey && !filled; seed++) {
			const state = createTombState(seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
			if (loadoutOf(state) !== key) continue;
			tried += 1;
			const boss = solveTomb({ state, goal: 'boss', strategy: 'best', nodes: bossBudget, timeBudgetMs: stageTime });
			if (!boss.solved) {
				console.log(`${key} ${seed} no boss at ${bossBudget}`);
				continue;
			}
			// A boss win alone fills the key, so bank it before spending on the second stage.
			rows.push(rowFor(state, seed, boss.steps.length, 'boss'));
			writeFileSync(out, JSON.stringify(rows, null, '\t'));
			filled = true;
			const middle = boss.steps[boss.steps.length - 1].state;
			const clear = solveTomb({ state: middle, goal: 'clear', strategy: 'best', nodes: clearBudget, timeBudgetMs: stageTime });
			if (clear.solved) {
				rows.push(rowFor(state, seed, boss.steps.length + clear.steps.length, 'clear'));
				writeFileSync(out, JSON.stringify(rows, null, '\t'));
				console.log(`CLEAR ${key} ${seed} ${boss.steps.length + clear.steps.length}mv · ${boss.steps.length}+${clear.steps.length}`);
			} else {
				console.log(`boss ${key} ${seed} ${boss.steps.length}mv · no clear in ${clearBudget}`);
			}
		}
		if (!filled) console.log(`${key} held (${tried} deals)`);
	}
	console.log(`missing stage shard ${shard}: ${targets.length} keys · ${rows.length} rows`);
}
