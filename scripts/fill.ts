/**
 * Placeholders: a crawl that matches a loadout but has no win yet still earns a square in the trellis,
 * marked with the best score the solver reached on it. A later crawl with a higher score replaces it, and
 * a win replaces it outright — which is why this script never records a win: `scripts/corpus.ts` owns
 * those, and a merge drops any placeholder whose square has since been won.
 *
 * FROM/TO       seed range to walk. Every seed is dealt (cheap); only seeds whose party has no win and
 *               whose crawl is this worker's are searched.
 * SHARD/SHARDS  split the range between workers, so six workers do not search the same deals.
 * BUDGET        states per search, the same gate the corpus uses so the scores read the same anywhere.
 * DIFFICULTY    med by default; a hard placeholder is a separate claim.
 * PER_KEY       seeds to try per party before leaving it alone (default 3).
 * OUT           corpus/fill-<shard>.json
 *
 * The score is the board's own: PAR_TOTAL - tombPar, the number the HUD counts up to 500.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
	FREE_CELL_COUNT,
	PAR_TOTAL,
	createTombState,
	tombPar,
	type Difficulty,
	type TombState,
} from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Row {
	loadout: string;
	difficulty: string;
	seed: number;
	score: number;
	moves: number;
	at: string;
}

const from = Number(process.env.FROM ?? 1);
const to = Number(process.env.TO ?? 2000);
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 150_000);
const perKey = Number(process.env.PER_KEY ?? 3);
const difficulty = (process.env.DIFFICULTY ?? 'med') as Difficulty;
const strategy = (process.env.STRATEGY ?? 'hybrid') as 'best' | 'beam' | 'dfs' | 'hybrid';
const out = process.env.OUT ?? `corpus/fill-${shard}.json`;
/** A win found on the way to a placeholder is a corpus entry, not a placeholder: it goes to a shard. */
const winOut = process.env.WIN_OUT ?? `corpus/shard-fill-${shard}.json`;
mkdirSync('corpus', { recursive: true });

const loadoutOf = (state: TombState) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

const readJson = (path: string): any => {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
};

/** Squares that already have a win, on any track: a placeholder there would be a lie. */
const won = new Set<string>();
const published = readJson('public/corpus.json');
for (const [loadout, tracks] of Object.entries<any>(published?.found ?? {})) {
	for (const level of Object.keys(tracks ?? {})) won.add(`${level}:${loadout}`);
}
for (const entry of published?.entries ?? []) {
	if (typeof entry?.loadout === 'string') won.add(`${entry.difficulty ?? 'med'}:${entry.loadout}`);
}

/** The best placeholder each square holds so far, kept across runs and across workers. */
const held = new Map<string, Row>();
const keep = (row: Row) => {
	const key = `${row.difficulty}:${row.loadout}`;
	const known = held.get(key);
	if (known && known.score >= row.score) return false;
	held.set(key, row);
	return true;
};
for (const [loadout, tracks] of Object.entries<any>(published?.placeholders ?? {})) {
	for (const [level, row] of Object.entries<any>(tracks ?? {})) {
		if (typeof row?.seed !== 'number' || typeof row?.score !== 'number') continue;
		keep({ loadout, difficulty: level, seed: row.seed, score: row.score, moves: row.moves ?? 0, at: row.at ?? '' });
	}
}
if (existsSync('corpus')) {
	for (const name of readdirSync('corpus')) {
		if (!name.startsWith('fill-') && !name.startsWith('shard-fill-')) continue;
		const rows = readJson(`corpus/${name}`);
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (typeof row?.loadout !== 'string' || typeof row?.score !== 'number') continue;
			keep(row as Row);
		}
	}
}

const rowsOfMine = () => [...held.values()].filter((row) => row.difficulty === difficulty);

const attempts = new Map<string, number>();
let searched = 0;
let fresh = 0;
let wins = 0;

for (let seed = from; seed <= to; seed++) {
	if (seed % shards !== shard) continue;
	const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
	const loadout = loadoutOf(state);
	const key = `${difficulty}:${loadout}`;
	if (won.has(key)) continue;
	if ((attempts.get(key) ?? 0) >= perKey) continue;
	attempts.set(key, (attempts.get(key) ?? 0) + 1);
	searched += 1;

	const result = solveTomb({
		state,
		goal: 'boss',
		strategy,
		beamWidth: 300,
		depth: 300,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	if (result.solved) {
		wins += 1;
		won.add(key);
		// A win beats any placeholder, so it is written where `corpus.ts` reads entries rather than here.
		const known: any[] = Array.isArray(readJson(winOut)) ? readJson(winOut) : [];
		if (!known.some((row) => row?.seed === seed && row?.loadout === loadout)) {
			known.push({
				loadout,
				boss: state.bossSuit,
				seed,
				moves: result.steps.length,
				difficulty,
				goal: 'boss',
				party: [...state.draft]
					.sort((a, b) => a.cell - b.cell)
					.map((entry) => ({ role: entry.role, name: entry.name, suit: entry.suit })),
				at: new Date().toISOString(),
			});
			writeFileSync(winOut, JSON.stringify(known, null, '\t'));
		}
		console.log(`seed ${seed} ${loadout} win ${result.steps.length}mv — recorded as an entry`);
		continue;
	}
	const score = PAR_TOTAL - tombPar(result.best);
	const row: Row = {
		loadout,
		difficulty,
		seed,
		score,
		moves: result.bestSteps.length,
		at: new Date().toISOString(),
	};
	if (keep(row)) {
		fresh += 1;
		writeFileSync(out, JSON.stringify(rowsOfMine().sort((a, b) => (a.loadout < b.loadout ? -1 : 1)), null, '\t'));
		console.log(`seed ${seed} ${loadout} best ${score}/500 · ${held.size} squares held`);
	} else {
		console.log(`seed ${seed} ${loadout} best ${score}/500 — held already`);
	}
}

console.log(
	`fill ${from}-${to} shard ${shard}/${shards}: ${searched} crawls searched · ${fresh} placeholders improved · ${wins} wins · ${held.size} squares held → ${out}`
);
