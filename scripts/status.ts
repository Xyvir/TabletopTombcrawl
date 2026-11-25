/**
 * A status board for a running corpus search: what is covered, how far each worker has walked its
 * seed range, which parties it has just won, and which of those wins a merge could actually publish
 * — a row counts only with its line in `solutions/`. It reads files and nothing else (the workers'
 * shards and heartbeats, that line directory, the published corpus), so it can be started or
 * stopped at any time without disturbing a search.
 *
 *   node scripts/status.ts            print one frame and exit
 *   node scripts/status.ts --follow   draw every two seconds until closed
 *
 * It reads files and imports nothing but node:fs, so plain node runs it: no bundler or alias setup is
 * owed. `--follow` repaints with ANSI escapes, which the classic Windows console host ignores; for a
 * live board there, scripts/watch-corpus.cmd clears the screen from the host between frames instead.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

interface Found {
	seed: number;
	moves: number;
}
interface Entry {
	loadout: string;
	seed: number;
	moves: number;
	goal: string;
	boss: string | null;
	difficulty?: string;
	/** an ISO stamp, or null on entries merged in from a corpus written before it kept dates */
	at?: string | null;
}
interface Corpus {
	keys: number;
	entries: Entry[];
	found?: Record<string, { boss?: Found; clear?: Found }>;
}
/** What a worker leaves behind between deals, so a long grind is not mistaken for a dead process. */
interface Beat {
	from: number;
	to: number;
	seed: number;
	finds: number;
	at: number;
}

const DIR = process.env.DIR ?? 'corpus';
const CORPUS = process.env.CORPUS ?? 'public/corpus.json';
/** Where a win's line is kept: a merge publishes a row only when this holds med-<seed>.json. */
const LINES = process.env.LINES ?? 'solutions';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 2000);
/** A worker beats every five seeds; a deal can take minutes, so this leaves room for a slow one. */
const QUIET_MS = 10 * 60_000;
/** A shard nobody has touched for this long is history: it still counts in the totals, not the table. */
const STALE_MS = 24 * 60 * 60_000;
/** Braille reads as boxes in the console fonts that ship with Windows, so the spinner is plain ASCII. */
const SPINNER = ['|', '/', '-', '\\'];

const readJson = <T>(path: string, fallback: T): T => {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
};

/** The seeds a merge can publish: the ones with a line on the published track. */
const linedSeeds = (): Set<number> => {
	const seeds = new Set<number>();
	if (!existsSync(LINES)) return seeds;
	for (const name of readdirSync(LINES)) {
		const found = /^med-(\d+)\.json$/.exec(name);
		if (found) seeds.add(Number(found[1]));
	}
	return seeds;
};

/**
 * Every live line on disk, keyed the way a shard row names its deal: `<track>|<seed>`. Archived lines
 * moved to `solutions/archive/`, so what is left here is what still proves a win under today's rules.
 */
const linedProofs = (): Set<string> => {
	const proofs = new Set<string>();
	if (!existsSync(LINES)) return proofs;
	for (const name of readdirSync(LINES)) {
		const found = /^(med|hard)-(\d+)\.json$/.exec(name);
		if (found) proofs.add(`${found[1]}|${found[2]}`);
	}
	return proofs;
};

/** When a find landed, in the board's own local clock: a date alone hides a run that just finished. */
const stamp = (iso: string): string => {
	const at = new Date(iso);
	if (!Number.isFinite(at.getTime())) return '—';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

const since = (ms: number): string => {
	const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
};

const bar = (done: number, total: number, width = 36): string => {
	const filled = total ? Math.round(Math.min(1, done / total) * width) : 0;
	return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
};

/** The newest win in a worker's own shard: what its log used to be read for, and never was. */
const newestWin = (entries: Entry[]): string => {
	let best: Entry | null = null;
	for (const entry of entries) {
		if (!best || String(entry.at ?? '') > String(best.at ?? '')) best = entry;
	}
	return best ? `${best.loadout} ${best.seed} \u00b7 ${best.moves}` : '';
};

interface Worker {
	from: number;
	keys: number;
	progress: string;
	updated: number;
	live: boolean;
	win: string;
}

const workers = (entries: Entry[]): Worker[] => {
	if (!existsSync(DIR)) return [];
	// A worker that has not won anything yet has no shard file, only a heartbeat, so both count as
	// a worker being there: otherwise a fresh pool shows nothing until its first find.
	const started = new Set<number>();
	for (const name of readdirSync(DIR)) {
		const found = /^(?:scan|heartbeat)-(\d+)\.json$/.exec(name);
		if (found) started.add(Number(found[1]));
	}
	const rows: Worker[] = [];
	for (const from of [...started].sort((a, b) => a - b)) {
		const path = `${DIR}/scan-${from}.json`;
		let written = 0;
		try {
			written = statSync(path).mtimeMs;
		} catch {
			written = 0;
		}
		const beat = readJson<Beat | null>(`${DIR}/heartbeat-${from}.json`, null);
		const updated = Math.max(written, beat?.at ?? 0);
		const span = beat ? beat.to - beat.from + 1 : 0;
		const walked = beat ? beat.seed - beat.from : 0;
		const progress = beat ? `${walked}/${span}` : '—';
		// Wins are matched by seed range, not by file name: a sweep can write its shard under a name of
		// its own (scan-freshb-w0.json), and the deal's own seed is the only thing tying it to a worker.
		const mine = beat ? entries.filter((entry) => entry.seed >= beat.from && entry.seed <= beat.to) : [];
		rows.push({
			from,
			keys: mine.length || (beat?.finds ?? 0),
			progress,
			updated,
			live: Date.now() - updated < QUIET_MS,
			win: newestWin(mine),
		});
	}
	return rows;
};

/** Every win on disk, read once: the worker rows, the merge count and the news all come from it. */
const allEntries = (): Entry[] => {
	const found: Entry[] = [];
	if (!existsSync(DIR)) return found;
	for (const name of readdirSync(DIR)) {
		if (!name.startsWith('scan-') || !name.endsWith('.json')) continue;
		for (const entry of readJson<Entry[]>(`${DIR}/${name}`, [])) {
			if (typeof entry?.loadout === 'string') found.push(entry);
		}
	}
	return found;
};

function frame(): string {
	const corpus = readJson<Corpus>(CORPUS, { keys: 256, entries: [] });
	const entries = allEntries();
	const rows = workers(entries);
	const live = rows.filter((row) => row.live).length;
	const merged = new Set(corpus.entries.map((entry) => entry.loadout));
	const lined = linedSeeds();
	const proofs = linedProofs();
	// A shard row is only a claim: a sweep writes one when it wins, but a rule change archives the
	// line and leaves the row behind. Counting rows made the board read hundreds of wins that no
	// longer replay, so the total is the deals a live line still proves, and nothing else.
	const current = new Set<string>();
	const onDisk = new Set<string>();
	// The row a party's newest win lives in: two sweeps can each hold a win for one key, and the board
	// should show the latest one rather than whichever file it happened to read last.
	const newest = new Map<string, Entry>();
	for (const entry of entries) {
		onDisk.add(entry.loadout);
		if (proofs.has(`${entry.difficulty ?? 'med'}|${entry.seed}`)) {
			current.add(`${entry.difficulty ?? 'med'}|${entry.seed}`);
		}
		const held = newest.get(entry.loadout);
		if (!held || String(entry.at ?? '') > String(held.at ?? '')) newest.set(entry.loadout, entry);
	}
	const pending = [...onDisk].filter((loadout) => !merged.has(loadout));
	// A merge publishes a row only when solutions/ holds its line on the published track. A row written
	// before that rule — or by a run whose line was archived since — cannot move a square however long
	// it sits on disk, so it is counted apart from the wins a merge would actually land.
	const ready = pending.filter((loadout) => {
		const entry = newest.get(loadout);
		return entry?.difficulty === 'med' && lined.has(entry.seed);
	});
	const unlined = pending.length - ready.length;
	const projected = merged.size + ready.length;
	const pct = ((corpus.entries.length / Math.max(1, corpus.keys)) * 100).toFixed(1);
	// Newest first across every shard, with what a merge would do with each. The published rows only
	// change when a merge runs, so they were the stalest thing on the board once sweeps started keeping
	// lines: the news is the lined wins that have not landed yet.
	const fresh = [...newest.values()]
		.filter((entry) => Number.isFinite(Date.parse(entry.at ?? '')))
		.sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))
		.slice(0, 6)
		.map((entry) => {
			const state = merged.has(entry.loadout)
				? 'published'
				: entry.difficulty === 'med' && lined.has(entry.seed)
					? 'lined, unmerged'
					: 'no line';
			return `  ${entry.loadout}  seed ${String(entry.seed).padStart(7)}  ${String(entry.moves).padStart(3)} moves  ${stamp(entry.at ?? '')}  ${entry.goal.padEnd(5)} ${state}`;
		});
	// A working corpus/ keeps every shard a sweep ever wrote — months of them — and a frame tall
	// enough to need its own scrollback moves under the reader on every repaint, however it is drawn.
	// Live shards are always shown in full; the rest are capped, newest first, and the line above
	// still says how many there are.
	const SHOWN = 12;
	const active = rows.filter((row) => row.live || Date.now() - row.updated < STALE_MS);
	const shown = [
		...active.filter((row) => row.live),
		...active.filter((row) => !row.live).sort((a, b) => b.updated - a.updated),
	].slice(0, SHOWN);
	const hidden = rows.length - shown.length;
	const lines = [
		` ${SPINNER[Math.floor(Date.now() / 200) % SPINNER.length]}  CORPUS SEARCH   ${new Date().toLocaleTimeString()}   ${DIR}/`,
		'',
		`  coverage   ${bar(corpus.entries.length, corpus.keys)}  ${corpus.entries.length}/${corpus.keys}  ${pct}%`,
		`  merge      +${ready.length} lined wins -> ${projected}/${corpus.keys}  ·  ${unlined} rows have no line to publish`,
		`  workers    ${rows.length} shards · ${live} live · ${current.size} current wins`,
		'',
		'  start   seed range   finds   beat    newest win',
		...shown.map(
			(row) =>
				`  ${String(row.from).padEnd(6)}  ${row.progress.padEnd(10)}  ${String(row.keys).padEnd(5)}   ${since(row.updated).padStart(5)}   ${row.win || '—'}`
		),
		...(hidden > 0 ? [`  … ${hidden} older shard${hidden === 1 ? '' : 's'} not shown`] : []),
		'',
		'  latest finds',
		...(fresh.length ? fresh : ['  (nothing dated on disk yet)']),
		'',
		'  Ctrl+C to close · the search keeps running without this board',
	];
	return lines.join('\n');
}

const draw = () => {
	process.stdout.write(`\x1b[H\x1b[2J${frame()}\n`);
};

// A single frame is the default: it reads the same in a log, a pipe, and a console that does not
// honour the clear sequences, where a redraw wears the scrollback out instead of holding still.
// FOLLOW=1 does what --follow does, for a launcher that would rather set an environment.
const follow = process.argv.includes('--follow') || /^(1|true|yes)$/i.test(process.env.FOLLOW ?? '');
if (!follow) {
	process.stdout.write(`${frame()}\n`);
} else {
	process.stdout.write('\x1b[?25l');
	draw();
	const timer = setInterval(draw, REFRESH_MS);
	const stop = () => {
		clearInterval(timer);
		process.stdout.write('\x1b[?25h\n');
		process.exit(0);
	};
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}
