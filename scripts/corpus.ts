/**
 * Builds the reference corpus: one winnable deal for each of the 256 loadouts under the current
 * rules, where a loadout is the suit of each drafted role in draw order (kin, class, glyph,
 * consumable — 4^4 assignments, because the roles are independent and suits may repeat).
 *
 * The corpus is boss-agnostic for now: the boss a deal happens to show is recorded, but it is not
 * part of the key, so whichever boss appears makes that loadout covered.
 *
 * MODE=plan  scan deals, bucket candidate seeds per key (no solving)
 * MODE=solve take every SHARDSth key, try its candidates until one clears
 * MODE=merge fold the shard files into one corpus
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DRAFT_CELL_COUNT, FREE_CELL_COUNT, createTombState, type Difficulty, type TombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

type Boss = string | null;
interface Candidate { key: string; loadout: string; boss: Boss; seeds: number[] }
interface Entry {
	loadout: string;
	boss: Boss;
	seed: number;
	moves: number;
	difficulty: string;
	goal: string;
	party: { role: string; name: string; suit: string }[];
}

const mode = process.env.MODE ?? 'plan';
const difficulty = (process.env.DIFFICULTY ?? 'med') as Difficulty;
/** A boss kill is the bar for the first corpus; a full clear is a bonus it may turn up on the way. */
const goal = (process.env.GOAL ?? 'boss') as 'boss' | 'clear';
/**
 * Best-first is the cheaper policy under a state budget: the hybrid's beam spends 60% of the budget
 * before best-first starts, and a boss kill is usually found by the grind, not the survey.
 */
const strategy = (process.env.STRATEGY ?? 'best') as 'best' | 'beam' | 'dfs' | 'hybrid';
const planPath = process.env.PLAN ?? 'corpus/plan.json';
/** Shard files sit beside the plan, so a merge is one directory read and no path can go astray. */
const shardDir = process.env.DIR ?? 'corpus';
if (mode !== 'merge') mkdirSync(shardDir, { recursive: true });

const loadoutOf = (state: TombState) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');
const keyOf = (state: TombState) => loadoutOf(state);

/** Every key the corpus is meant to cover: a suit for each of the four roles, repeats allowed. */
const ALL_KEYS = (() => {
	const suits = ['hearts', 'clubs', 'diamonds', 'spades'];
	let keys = [''];
	for (let i = 0; i < DRAFT_CELL_COUNT; i++) {
		keys = keys.flatMap((prefix) => suits.map((suit) => prefix + suit[0]));
	}
	return keys;
})();

/** A shard may be missing, empty, half-written or written by an older schema: none of those break a run. */
const readEntries = (path: string): Entry[] => {
	if (!existsSync(path)) return [];
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

if (mode === 'plan') {
	const to = Number(process.env.TO ?? 20_000);
	const perKey = Number(process.env.PER_KEY ?? 6);
	const buckets = new Map<string, Candidate>();
	for (let seed = 1; seed <= to; seed++) {
		const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
		const key = keyOf(state);
		const bucket = buckets.get(key) ?? { key, loadout: loadoutOf(state), boss: state.bossSuit, seeds: [] };
		if (bucket.seeds.length < perKey) bucket.seeds.push(seed);
		buckets.set(key, bucket);
	}
	const plan = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
	writeFileSync(planPath, JSON.stringify(plan));
	console.log(`scanned ${to} seeds · ${plan.length} keys · ${plan.filter((c) => c.boss === null).length} with a hidden boss`);
	for (const candidate of plan) console.log(`  ${candidate.key.padEnd(8)} ${candidate.seeds.join(',')}`);
}

if (mode === 'solve') {
	const plan: Candidate[] = JSON.parse(readFileSync(planPath, 'utf8'));
	const shard = Number(process.env.SHARD ?? 0);
	const shards = Number(process.env.SHARDS ?? 1);
	// A state gate, not a clock: two workers fighting over one CPU must not change what counts as
	// winnable, and the same seed has to read the same on any machine. TIME is only a stuck-job guard.
	const budget = Number(process.env.BUDGET ?? 200_000);
	const seconds = Number(process.env.TIME ?? 0);
	const out = process.env.OUT ?? `${shardDir}/shard-${shard}.json`;
	const entries = readEntries(out);
	const done = new Set(entries.map((entry) => entry.loadout));
	const mine = plan.filter((_, index) => index % shards === shard);
	for (const candidate of mine) {
		if (done.has(candidate.key)) continue;
		for (const seed of candidate.seeds) {
			const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
			const result = solveTomb({
				state,
				goal,
				strategy,
				beamWidth: 300,
				depth: 300,
				nodes: budget,
				timeBudgetMs: seconds > 0 ? seconds * 1000 : Number.POSITIVE_INFINITY,
			});
			if (!result.solved) {
				console.log(`${candidate.key} ${seed} none`);
				continue;
			}
			entries.push({
				loadout: candidate.loadout,
				boss: candidate.boss,
				seed,
				moves: result.steps.length,
				difficulty,
				goal,
				party: [...state.draft]
					.sort((a, b) => a.cell - b.cell)
					.map((entry) => ({ role: entry.role, name: entry.name, suit: entry.suit })),
			});
			done.add(candidate.key);
			writeFileSync(out, JSON.stringify(entries, null, '\t'));
			console.log(`${candidate.key} ${seed} solved ${result.steps.length}`);
			break;
		}
	}
	console.log(`shard ${shard}: ${entries.length} entries`);
}

/**
 * The cheap way to fill the corpus: walk a seed range once, solve each deal at a real budget, and keep
 * the first win for each key. A key already filled is skipped, so a rerun only costs the scan.
 */
if (mode === 'scan') {
	const from = Number(process.env.FROM ?? 1);
	const to = Number(process.env.TO ?? 50);
	const budget = Number(process.env.BUDGET ?? 200_000);
	// No clock by default: the corpus has to read the same on any machine, and across rule variants.
	const seconds = Number(process.env.TIME ?? 0);
	const out = process.env.OUT ?? `${shardDir}/scan-${from}.json`;
	const entries = readEntries(out);
	const done = new Set(entries.map((entry) => entry.loadout));
	for (let seed = from; seed <= to; seed++) {
		const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
		const key = keyOf(state);
		if (done.has(key)) continue;
		const result = solveTomb({
			state,
			goal,
			strategy,
			beamWidth: 300,
			depth: 300,
			nodes: budget,
			timeBudgetMs: seconds > 0 ? seconds * 1000 : Number.POSITIVE_INFINITY,
		});
		if (!result.solved) continue;
		entries.push({
			loadout: loadoutOf(state),
			boss: state.bossSuit,
			seed,
			moves: result.steps.length,
			difficulty,
			goal,
			party: [...state.draft]
				.sort((a, b) => a.cell - b.cell)
				.map((entry) => ({ role: entry.role, name: entry.name, suit: entry.suit })),
		});
		done.add(key);
		writeFileSync(out, JSON.stringify(entries, null, '\t'));
		console.log(`seed ${seed} ${key} solved ${result.steps.length} · ${done.size} keys`);
	}
	console.log(`scan ${from}-${to}: ${entries.length} entries`);
}

if (mode === 'merge') {
	const all: Entry[] = [];
	if (existsSync(shardDir)) {
		for (const name of readdirSync(shardDir)) {
			if (!name.endsWith('.json')) continue;
			try {
				const parsed = JSON.parse(readFileSync(`${shardDir}/${name}`, 'utf8'));
				if (!Array.isArray(parsed)) continue;
				// the plan sits in here too and its rows are not entries: only entries carry a seed
				for (const entry of parsed) {
					if (typeof entry?.seed !== 'number') continue;
					// rows written before the corpus recorded its goal came from clear-goal runs
					all.push({ ...entry, goal: entry.goal ?? 'clear' });
				}
			} catch {
				// a half-written shard is skipped, and the next merge picks it up
			}
		}
	}
	for (const name of (process.env.EXTRA ?? '').split(',').filter(Boolean)) {
		if (existsSync(name)) all.push(...JSON.parse(readFileSync(name, 'utf8')));
	}
	// The published artifact is a source too: a merge with no shards to hand must not throw away what
	// the last merge published.
	if (existsSync('public/corpus.json')) {
		try {
			const parsed = JSON.parse(readFileSync('public/corpus.json', 'utf8'));
			if (Array.isArray(parsed?.entries)) all.push(...parsed.entries);
		} catch {
			// an unreadable artifact simply contributes nothing
		}
	}
	// One entry per key, and the stronger result wins: a 100% clear is also a boss kill, so it beats a
	// boss-only entry for the same key, and a shorter line beats a longer one.
	const rank = (entry: Entry) => (entry.goal === 'clear' ? 0 : 1);
	const unique = new Map<string, Entry>();
	for (const entry of all) {
		const key = entry.loadout;
		const held = unique.get(key);
		if (!held || rank(entry) < rank(held) || (rank(entry) === rank(held) && entry.moves < held.moves)) {
			unique.set(key, entry);
		}
	}
	// What the solver has proved for each party, and the shortest line it found for each goal. A boss
	// kill and a bare tomb are different claims, so the trellis keeps both rather than one per party.
	const found: Record<string, Partial<Record<'boss' | 'clear', { seed: number; moves: number }>>> = {};
	for (const entry of all) {
		const achieved = entry.goal === 'clear' ? 'clear' : 'boss';
		const held = found[entry.loadout]?.[achieved];
		if (held && held.moves <= entry.moves) continue;
		found[entry.loadout] = { ...found[entry.loadout], [achieved]: { seed: entry.seed, moves: entry.moves } };
	}
	const entries = [...unique.values()].sort((a, b) => (a.loadout < b.loadout ? -1 : 1));
	const missing = ALL_KEYS.filter((key) => !unique.has(key));
	const target = existsSync('public') ? 'public/corpus.json' : `${shardDir}/corpus.json`;
	writeFileSync(
		target,
		JSON.stringify(
			{ difficulty, goal, rules: 'draft-any-suit', keys: ALL_KEYS.length, entries, found, missing },
			null,
			'\t'
		)
	);
	console.log(`${entries.length}/${ALL_KEYS.length} keys covered · ${missing.length} still to find → ${target}`);
}
