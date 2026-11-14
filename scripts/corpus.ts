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
import { writeSolution } from './solution';

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
	/**
	 * When the solver proved this deal, so a rule change can be told apart from an old result. Entries
	 * recorded before the corpus kept dates carry null rather than a guess.
	 */
	at: string | null;
	/**
	 * Where the line came from, when that is worth knowing: `human` marks a crawl a player beat by hand,
	 * kept as a baseline the solver can be measured against rather than a result it produced.
	 */
	source?: 'human';
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

/**
 * The rows a rule change has demoted, as `track|loadout|seed`.
 *
 * Retirement is a claim about a *seed*, not about a party: the old seed's line needed a rule that no longer
 * exists, but another seed may still deal that party and win honestly. Keying it by party alone went wrong
 * twice in one night — a fresh scan skipped the very parties it existed to refill (242 of 256 deals skipped,
 * 14 searched), and the first merge threw away 113 new wins because their party was on the list.
 */
const demotedRows = (() => {
	const path = process.env.RETIRED ?? 'corpus/retired.json';
	if (!existsSync(path)) return [] as { difficulty?: string; loadout: string; seed?: number }[];
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
})();
const demotedSeed = (row: { difficulty?: string; loadout: string; seed?: number }) =>
	`${row.difficulty ?? 'med'}|${row.loadout}|${row.seed}`;
const demotedSeeds = new Set(demotedRows.filter((row) => typeof row.seed === 'number').map(demotedSeed));

/**
 * Every party any worker has already won, across the published corpus and every shard on disk. A seed
 * whose party is in here costs a deal scan and no search at all.
 */
const foundAnywhere = (): string[] => {
	const found = new Set(publishedLoadouts());
	if (existsSync(shardDir)) {
		for (const name of readdirSync(shardDir)) {
			if (!name.endsWith('.json')) continue;
			// Only real shards. The plan file sits in the same directory and holds a row for every key it
			// scanned, so reading it as a shard made every deal look already won and each range skipped
			// itself in silence.
			if (!name.startsWith('scan-') && !name.startsWith('shard-')) continue;
			for (const entry of readEntries(`${shardDir}/${name}`)) {
				if (typeof entry.loadout !== 'string') continue;
				// A demoted seed is not a win; a win on another seed of the same party is.
				if (demotedSeeds.has(demotedSeed(entry))) continue;
				found.add(entry.loadout);
			}
		}
	}
	return [...found];
};

/** Parties the published corpus already has a seed for, so parallel workers do not chase them twice. */
const publishedLoadouts = (): string[] => {
	if (!existsSync('public/corpus.json')) return [];
	try {
		const parsed = JSON.parse(readFileSync('public/corpus.json', 'utf8'));
		return Array.isArray(parsed?.entries) ? parsed.entries.map((entry: Entry) => entry.loadout) : [];
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
				at: new Date().toISOString(),
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
	/**
	 * Target a subset of kin by suit initial, e.g. `KIN=s,c` for the Orc and Elf alone. A run over
	 * freshly changed abilities wants its whole budget on those parties rather than two thirds of it on
	 * the kin that were never in doubt; every other deal costs a scan and no search.
	 */
	const kin = (process.env.KIN ?? '')
		.split(',')
		.map((letter) => letter.trim())
		.filter(Boolean);
	// No clock by default: the corpus has to read the same on any machine, and across rule variants.
	const seconds = Number(process.env.TIME ?? 0);
	const out = process.env.OUT ?? `${shardDir}/scan-${from}.json`;
	const heartbeat = `${shardDir}/heartbeat-${from}.json`;
	const entries = readEntries(out);
	// Parallel workers share no shard file, so each also skips whatever the published corpus has
	// already found: without this, six workers chase the same parties and six times the seeds.
	const done = new Set([...entries.map((entry) => entry.loadout), ...publishedLoadouts()]);
	// Counted so the log says how much searching a range actually did: a run that skipped every deal
	// and a run that searched them all and found nothing otherwise read exactly the same.
	let searched = 0;
	for (let seed = from; seed <= to; seed++) {
		if ((seed - from) % 5 === 0) {
			// Workers win parties while this one is running, so the skip list is refreshed as it goes:
			// without this, each worker only skips what was covered when it started. A long deal writes
			// nothing either, so this same beat is what tells the status board a worker is still alive.
			for (const loadout of foundAnywhere()) done.add(loadout);
			writeFileSync(heartbeat, JSON.stringify({ from, to, seed, finds: entries.length, at: Date.now() }));
		}
		const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
		const key = keyOf(state);
		if (done.has(key)) continue;
		if (kin.length && !kin.includes(key[0])) continue;
		searched += 1;
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
		const party = [...state.draft]
			.sort((a, b) => a.cell - b.cell)
			.map((entry) => ({ role: entry.role, name: entry.name, suit: entry.suit }));
		entries.push({
			loadout: loadoutOf(state),
			boss: state.bossSuit,
			seed,
			moves: result.steps.length,
			difficulty,
			goal,
			party,
			at: new Date().toISOString(),
		});
		// Only a win is worth a file, and only a win for a party nothing had won yet gets here at all: a
		// corpus row without its line is what cost this sweep a night of search to answer a later question.
		writeSolution({
			seed,
			difficulty,
			goal,
			loadout: key,
			moves: result.steps.length,
			party,
			lines: result.steps.map((step) => step.label.replace(/\s+/g, ' ').trim()),
			actions: result.steps.map((step) => step.action),
			nodes: result.nodes,
			note: `scan ${from}-${to}, ${strategy}`,
		});
		done.add(key);
		writeFileSync(out, JSON.stringify(entries, null, '\t'));
		console.log(`seed ${seed} ${key} solved ${result.steps.length} · ${done.size} keys`);
	}
	console.log(
		`scan ${from}-${to}: ${entries.length} entries · ${searched} deals searched${kin.length ? ` · kin ${kin.join('')}` : ''}`
	);
}

if (mode === 'merge') {
	const all: Entry[] = [];
	if (existsSync(shardDir)) {
		for (const name of readdirSync(shardDir)) {
			if (!name.endsWith('.json')) continue;
			// Only real shards, for the same reason the skip list reads only real shards: the plan and
			// the verification rows sit in this directory too, and a row with a seed but no move count
			// would be published as an entry — and as a `clear` one, which outbids the real entry for
			// the key it landed on.
			if (!name.startsWith('scan-') && !name.startsWith('shard-')) continue;
			try {
				const parsed = JSON.parse(readFileSync(`${shardDir}/${name}`, 'utf8'));
				if (!Array.isArray(parsed)) continue;
				// the plan sits in here too and its rows are not entries: only entries carry a seed
				for (const entry of parsed) {
					if (typeof entry?.seed !== 'number') continue;
					// rows written before the corpus recorded its goal came from clear-goal runs, and rows
					// written before it kept a date stay undated rather than being given a guessed one
					all.push({ ...entry, goal: entry.goal ?? 'clear', at: entry.at ?? null });
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
			// Same normalising as the shards: an artifact written before a column existed has to gain
			// it here, or the published entries stay the odd ones out in their own file.
			if (Array.isArray(parsed?.entries))
				all.push(...parsed.entries.map((entry: Entry) => ({ ...entry, goal: entry.goal ?? 'clear', at: entry.at ?? null })));
		} catch {
			// an unreadable artifact simply contributes nothing
		}
	}
	// One entry per key, and the stronger result wins: a 100% clear is also a boss kill, so it beats a
	// boss-only entry for the same key, and a shorter line beats a longer one.
	const rank = (entry: Entry) => (entry.goal === 'clear' ? 0 : 1);
	// A party is one key per track: its med seed says nothing about its hard one, so the two sit side by side.
	const keyOf = (entry: Entry) => `${entry.difficulty ?? 'med'}|${entry.loadout}`;
	/**
	 * Rows a rule change has retired. A sweep that cannot re-prove a win has not proved it lost, so the seed
	 * stays on the square as a placeholder — the party is dealt and playable — while the claim goes away. The
	 * list lives in `corpus/retired.json` so the shard files that produced those rows stay untouched.
	 */
	const retiredRows = (() => {
		const path = process.env.RETIRED ?? 'corpus/retired.json';
		if (!existsSync(path)) return [] as { difficulty?: string; loadout: string }[];
		try {
			const parsed = JSON.parse(readFileSync(path, 'utf8'));
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	})();
	const retired = new Map(retiredRows.map((row) => [`${row.difficulty ?? 'med'}|${row.loadout}`, row]));
	// Only the demoted seed goes: a win on any other seed of that party is fresh evidence and stays live.
	const live = all.filter((entry) => !demotedSeeds.has(demotedSeed(entry)));
	// A demoted square keeps the seed it was demoted on, so the placeholder is the same deal with no claim.
	const retiredSeeds = new Map<string, Entry>();
	for (const entry of all) if (demotedSeeds.has(demotedSeed(entry))) retiredSeeds.set(keyOf(entry), entry);
	const unique = new Map<string, Entry>();
	for (const entry of live) {
		const key = keyOf(entry);
		const held = unique.get(key);
		if (!held || rank(entry) < rank(held) || (rank(entry) === rank(held) && entry.moves < held.moves)) {
			unique.set(key, entry);
		}
	}
	// What the solver has proved for each party, and the shortest line it found for each goal. A boss
	// kill and a bare tomb are different claims, so the trellis keeps both rather than one per party.
	type Proofs = Partial<Record<'boss' | 'clear', { seed: number; moves: number }>>;
	const found: Record<string, Partial<Record<string, Proofs>>> = {};
	for (const entry of live) {
		const level = entry.difficulty ?? 'med';
		const achieved = entry.goal === 'clear' ? 'clear' : 'boss';
		const held = found[entry.loadout]?.[level]?.[achieved];
		if (held && held.moves <= entry.moves) continue;
		found[entry.loadout] = {
			...found[entry.loadout],
			[level]: { ...found[entry.loadout]?.[level], [achieved]: { seed: entry.seed, moves: entry.moves } },
		};
	}
	// Placeholders: a square whose crawl matches the loadout but has no win, held by the best score
	// reached on it. Same rule as a proof — the best result holds the square — and a win on that track
	// deletes the placeholder outright, since a square with a win is not waiting for one.
	type Placeholder = { seed: number; score: number | null; at: string | null };
	const placeholders: Record<string, Partial<Record<string, Placeholder>>> = {};
	/** A retired row has no score to show: nobody has filed one since the claim went. */
	const scoreOf = (row: Placeholder) => row.score ?? -1;
	const hold = (loadout: string, level: string, row: Placeholder) => {
		if (found[loadout]?.[level]) return;
		const known = placeholders[loadout]?.[level];
		if (known && scoreOf(known) >= scoreOf(row)) return;
		placeholders[loadout] = { ...placeholders[loadout], [level]: row };
	};
	const artifact = (() => {
		if (!existsSync('public/corpus.json')) return null;
		try {
			return JSON.parse(readFileSync('public/corpus.json', 'utf8'));
		} catch {
			return null;
		}
	})();
	for (const [loadout, tracks] of Object.entries<any>(artifact?.placeholders ?? {})) {
		for (const [level, row] of Object.entries<any>(tracks ?? {})) {
			if (typeof row?.seed !== 'number') continue;
			hold(loadout, level, { seed: row.seed, score: typeof row.score === 'number' ? row.score : null, at: row.at ?? null });
		}
	}
	// Retired rows come last of the seeds: a real score from a sweep outbids the unknown one they carry.
	for (const [key, entry] of retiredSeeds) {
		const level = key.slice(0, key.indexOf('|'));
		hold(entry.loadout, level, { seed: entry.seed, score: null, at: entry.at ?? null });
	}
	if (existsSync(shardDir)) {
		for (const name of readdirSync(shardDir)) {
			if (!name.startsWith('fill-') && !name.startsWith('shard-fill-')) continue;
			try {
				const rows = JSON.parse(readFileSync(`${shardDir}/${name}`, 'utf8'));
				if (!Array.isArray(rows)) continue;
				for (const row of rows) {
					if (typeof row?.loadout !== 'string' || typeof row?.score !== 'number') continue;
					hold(row.loadout, row.difficulty ?? 'med', { seed: row.seed, score: row.score, at: row.at ?? null });
				}
			} catch {
				// a half-written fill file is skipped, and the next merge picks it up
			}
		}
	}
	const entries = [...unique.values()].sort((a, b) =>
		`${a.loadout}${a.difficulty ?? 'med'}` < `${b.loadout}${b.difficulty ?? 'med'}` ? -1 : 1
	);
	// The headline count stays the med one: that is the corpus the status board and the first sweep built.
	const missing = ALL_KEYS.filter((key) => !unique.has(`med|${key}`));
	const target = existsSync('public') ? 'public/corpus.json' : `${shardDir}/corpus.json`;
	writeFileSync(
		target,
		JSON.stringify(
			{ difficulty, goal, rules: 'draft-any-suit', keys: ALL_KEYS.length, entries, found, placeholders, missing },
			null,
			'\t'
		)
	);
	const medCount = entries.filter((entry) => (entry.difficulty ?? 'med') === 'med').length;
	const hardCount = entries.length - medCount;
	console.log(
		`${medCount}/${ALL_KEYS.length} keys covered at med · ${hardCount} hard rows · ${Object.keys(placeholders).length} placeholders · ${missing.length} still to find → ${target}`
	);
}
