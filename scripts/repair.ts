/**
 * Re-proves the published corpus in place.
 *
 * Rules move: a kin can take a different suit, an ability can be reworked, and a rule can be tightened.
 * The old seeds are still worth a second look, because the corpus is not a random sample of deals — a
 * scan spends its budget until a deal falls, so what it keeps is biased towards tableaux that give way
 * easily. Those are exactly the seeds most likely to fall again under abilities they were not found
 * with, so they get re-solved before the work is thrown away.
 *
 * Anything that re-proves is written out as a normal scan shard, dated now and carrying the party the
 * deal actually deals under today's rules. Anything that does not is simply left out, and the merge
 * drops it — a missed seed is a lower bound, not a proof.
 *
 * SHARD=<i> SHARDS=<n> BUDGET=<states> OUT=<path>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState, type Difficulty } from '../src/tombcrawl';
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

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { entries: Entry[] };
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 300_000);
const out = process.env.OUT ?? `corpus/scan-repair-${shard}.json`;

const rows: Entry[] = [];
const mine = corpus.entries.filter((_, index) => index % shards === shard);
for (const entry of mine) {
	const difficulty = entry.difficulty as Difficulty;
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
	const result = solveTomb({
		state,
		goal: 'boss',
		strategy: 'hybrid',
		beamWidth: 300,
		depth: 300,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	if (!result.solved) {
		console.log(`miss ${entry.loadout} seed ${entry.seed} boss ${entry.boss ?? 'hidden'}`);
		continue;
	}
	rows.push({
		loadout: entry.loadout,
		boss: state.bossSuit,
		seed: entry.seed,
		moves: result.steps.length,
		difficulty: entry.difficulty,
		goal: 'boss',
		// the party the same deal deals under the rules in force now, not the names it had before
		party: [...state.draft]
			.sort((a, b) => a.cell - b.cell)
			.map((draft) => ({ role: draft.role, name: draft.name, suit: draft.suit })),
		at: new Date().toISOString(),
	});
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	console.log(`ok   ${entry.loadout} seed ${entry.seed} ${result.steps.length}mv`);
}
console.log(`repair shard ${shard}: ${rows.length}/${mine.length}`);
