/**
 * Measures how often each kin can be solved, on identical deals at an identical state budget.
 *
 * Unlike the corpus scan this has no skip list: every seed in the window is searched whether or not
 * its party is already covered, so the four kin get honest and comparable denominators. That is the
 * only way to ask "is the Orc stronger than the Elf" — a scan stops searching a party the moment the
 * corpus has it, which is exactly the party a strong kin has most of.
 *
 * FROM=<first seed> TO=<last seed> SHARD=<i> SHARDS=<n> BUDGET=<states> OUT=<path>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Row {
	seed: number;
	kin: string;
	solved: boolean;
	moves: number | null;
	ms: number;
}

const from = Number(process.env.FROM ?? 1);
const to = Number(process.env.TO ?? 100);
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 300_000);
const out = process.env.OUT ?? `corpus/kinrate-${from}-${shard}.json`;

const rows: Row[] = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as Row[]) : [];
const done = new Set(rows.map((row) => row.seed));

for (let seed = from; seed <= to; seed++) {
	if ((seed - from) % shards !== shard || done.has(seed)) continue;
	const state = createTombState(seed, FREE_CELL_COUNT.med);
	const kin = [...state.draft].sort((a, b) => a.cell - b.cell)[0].suit[0];
	// No clock: the state budget is the only limit, so every kin is measured by the same effort.
	const result = solveTomb({
		state,
		goal: 'boss',
		strategy: 'hybrid',
		beamWidth: 300,
		depth: 300,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	rows.push({
		seed,
		kin,
		solved: result.solved,
		moves: result.solved ? result.steps.length : null,
		ms: Math.round(result.elapsedMs),
	});
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	if (result.solved) console.log(`seed ${seed} ${kin} solved ${result.steps.length}`);
}

const tally: Record<string, { deals: number; wins: number }> = {};
for (const row of rows) {
	const held = (tally[row.kin] ??= { deals: 0, wins: 0 });
	held.deals += 1;
	if (row.solved) held.wins += 1;
}
console.log(`shard ${shard}: ${rows.length} deals ${JSON.stringify(tally)}`);
