/**
 * Can a published line be beaten on length?
 *
 * Nothing here is optimal: the shipped search is a beam followed by best-first, neither of which is
 * charged for moves, and a beam only remembers the boards of the ply it is standing in. A winning line
 * may therefore double back onto a position it has already held — legal, and pure waste. This tool
 * re-searches a published seed with the duplicate check held across the whole search and a depth one
 * short of the recorded line, so anything it finds is strictly shorter. A find is written out as a
 * scan shard; the merge keeps the shortest line per key, so re-merging is how an improvement lands.
 *
 * A miss proves nothing: the beam prunes by score, so a shorter line can exist outside the boards it
 * kept. A miss only says the short line is narrower than the frontier that was searched.
 *
 * SHARD=<i> SHARDS=<n> WIDTH=<boards per ply> BUDGET=<states> SKEY=<kin letter> OUT=<path>
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
const width = Number(process.env.WIDTH ?? 600);
const budget = Number(process.env.BUDGET ?? 400_000);
const keyFilter = process.env.SKEY ?? '';
const out = process.env.OUT ?? `corpus/scan-short-${shard}.json`;

const rows: Entry[] = [];
const mine = corpus.entries
	.filter((entry) => !keyFilter || entry.loadout.startsWith(keyFilter))
	.filter((_, index) => index % shards === shard);

for (const entry of mine) {
	const difficulty = entry.difficulty as Difficulty;
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
	const bound = Math.max(1, entry.moves - 1);
	const result = solveTomb({
		state,
		goal: 'boss',
		strategy: 'beam',
		beamWidth: width,
		dedupe: 'all',
		depth: bound,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	if (!result.solved) {
		console.log(`keep ${entry.loadout} seed ${entry.seed} ${entry.moves}mv`);
		continue;
	}
	rows.push({
		loadout: entry.loadout,
		boss: state.bossSuit,
		seed: entry.seed,
		moves: result.steps.length,
		difficulty: entry.difficulty,
		goal: 'boss',
		party: [...state.draft]
			.sort((a, b) => a.cell - b.cell)
			.map((draft) => ({ role: draft.role, name: draft.name, suit: draft.suit })),
		at: new Date().toISOString(),
	});
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	console.log(`short ${entry.loadout} seed ${entry.seed} ${entry.moves} -> ${result.steps.length}mv`);
}
console.log(`shorten shard ${shard}: ${rows.length} shortened of ${mine.length} tried`);
