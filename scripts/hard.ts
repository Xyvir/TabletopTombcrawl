/**
 * Are the corpus deals winnable on a smaller track?
 *
 * The corpus is med: three free cells, and every seed in it was found there. Hard is two cells, which is
 * not the same game — a free cell is storage and a heart both — so a party's med seed says nothing about
 * its hard one. This takes the existing deals and asks the same solver for the same goal on hard; a win
 * is written as a hard row and merges into the corpus beside the med one.
 *
 *   SHARD/SHARDS, BUDGET=<states>, TIME=<ms>, GOAL=boss|clear, DIFFICULTY=hard, SKIP=<n>, OUT=<path>
 */
import { writeFileSync } from 'node:fs';
import corpus from '../public/corpus.json';
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

const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 300_000);
const time = Number(process.env.TIME ?? 30_000);
const goal = (process.env.GOAL ?? 'boss') as 'boss' | 'clear';
const difficulty = (process.env.DIFFICULTY ?? 'hard') as Difficulty;
const skip = Math.max(1, Number(process.env.SKIP ?? 1));
const out = process.env.OUT ?? `corpus/scan-hard-${shard}.json`;

// The med deals only: a party that already has a hard row is not asked again.
const hard = new Set((corpus.entries as Entry[]).filter((entry) => entry.difficulty === difficulty).map((entry) => entry.loadout));
const mine = (corpus.entries as Entry[])
	.filter((entry) => (entry.difficulty ?? 'med') === 'med' && !hard.has(entry.loadout))
	.filter((_, index) => index % skip === 0)
	.filter((_, index) => index % shards === shard);

const rows: Entry[] = [];
let wins = 0;
for (const entry of mine) {
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty]);
	const result = solveTomb({ state, goal, strategy: 'best', nodes: budget, timeBudgetMs: time });
	if (!result.solved) {
		console.log(`hard miss ${entry.loadout} seed ${entry.seed} · ${goal} at ${budget}`);
		continue;
	}
	wins += 1;
	rows.push({
		loadout: entry.loadout,
		boss: state.bossSuit,
		seed: entry.seed,
		moves: result.steps.length,
		difficulty,
		goal,
		party: [...state.draft]
			.sort((a, b) => a.cell - b.cell)
			.map((draft) => ({ role: draft.role, name: draft.name, suit: draft.suit })),
		at: new Date().toISOString(),
	});
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	console.log(`hard ${entry.loadout} seed ${entry.seed} · ${goal} ${result.steps.length}mv`);
}
console.log(`hard shard ${shard}: ${wins} wins of ${mine.length} med deals tried at ${difficulty}`);
