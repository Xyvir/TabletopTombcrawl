/**
 * Re-proves the published corpus under the current rules.
 *
 * A corpus entry is a claim: this seed, dealt to this party, is winnable. A rule change can quietly
 * retire that claim — Weakness now charges a heart for parking a bandit, where it used to charge
 * nothing — and the artifact carries no record of which run found it, so the entries cannot be told
 * apart by age. This re-solves the whole set instead, and reports anything it cannot re-prove rather
 * than trusting it.
 *
 * SHARD=<i> SHARDS=<n> BUDGET=<states> OUT=<path>
 *
 * A miss here is not proof the deal is lost: a search that finds nothing is a lower bound. Anything it
 * misses gets a second, wider pass before it is dropped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState, type Difficulty } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';
import { writeSolution } from './solution';

interface Entry {
	loadout: string;
	boss: string | null;
	seed: number;
	moves: number;
	difficulty: string;
	goal: string;
	party?: { role: string; name: string; suit: string }[];
}

interface Row {
	loadout: string;
	dealt: string;
	seed: number;
	boss: string | null;
	was: number;
	now: number | null;
	ms: number;
}

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { entries: Entry[] };
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 600_000);
/**
 * Which policy to re-prove with. The corpus was largely found by best-first, and hybrid splits its budget
 * across a beam pass first, so a hybrid sweep misses rows that are still winnable and reads them as lost.
 */
const strategy = (process.env.STRATEGY ?? 'hybrid') as 'best' | 'beam' | 'dfs' | 'hybrid';
const out = process.env.OUT ?? `corpus/verify-${shard}.json`;

// The party is dealt from the seed, so check that first: a seed that no longer deals this party makes
// the stored line meaningless even if the deal is still winnable by someone else.
const loadoutOf = (state: ReturnType<typeof createTombState>) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

/** Only one track, e.g. DIFFICULTY=hard to re-prove the hard rows after a hard-only rule change. */
const only = process.env.DIFFICULTY ?? '';
/** Only these squares, `track:loadout` — a second, wider pass over what a first run missed. */
const onlyKeys = (process.env.ONLY ?? '').split(',').filter(Boolean);
const rows: Row[] = [];
const mine = corpus.entries
	.filter((entry) => !only || entry.difficulty === only)
	.filter((entry) => !onlyKeys.length || onlyKeys.includes(`${entry.difficulty}:${entry.loadout}`))
	.filter((_, index) => index % shards === shard);
for (const entry of mine) {
	const difficulty = entry.difficulty as Difficulty;
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
	const dealt = loadoutOf(state);
	const result = solveTomb({
		state,
		// The corpus bar is the boss kill, so a clear-goal entry is only asked for the weaker claim.
		goal: 'boss',
		strategy,
		beamWidth: 300,
		depth: 300,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	const row: Row = {
		loadout: entry.loadout,
		dealt,
		seed: entry.seed,
		boss: entry.boss,
		was: entry.moves,
		now: result.solved ? result.steps.length : null,
		ms: Math.round(result.elapsedMs),
	};
	rows.push(row);
	writeFileSync(out, JSON.stringify(rows, null, '\t'));
	// The winning line is kept whether or not this row's budget was the widest one: a proof is a proof.
	if (result.solved && !process.env.NO_SOLUTIONS) {
		// A win is the only thing worth keeping: an unsolved search has no line to cache.
		writeSolution({
			seed: entry.seed,
			difficulty,
			goal: 'boss',
			loadout: entry.loadout,
			moves: row.now ?? 0,
			party: entry.party ?? [],
			// The labels pad their verb so a printed line reads as a column: the transcript format is one space.
			lines: result.steps.map((step) => step.label.replace(/\s+/g, ' ').trim()),
			actions: result.steps.map((step) => step.action),
			nodes: result.nodes,
			note: 're-proved best-first by scripts/verify.ts',
		});
	}
	const mark = dealt === entry.loadout ? (row.now === null ? 'MISS' : 'ok  ') : 'DEAL';
	console.log(
		`${mark} ${entry.loadout} seed ${entry.seed} boss ${entry.boss ?? 'hidden'} · was ${entry.moves} · now ${row.now ?? '—'} · ${(row.ms / 1000).toFixed(1)}s`
	);
}
const missed = rows.filter((row) => row.now === null).length;
console.log(`shard ${shard}: ${rows.length} re-solved · ${missed} missed`);
