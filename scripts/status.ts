/**
 * A status board for a running corpus search: what is covered, what each worker is doing, and which
 * parties it has just won. It reads only the files the workers already write, so it can be started
 * or stopped at any time without disturbing a search.
 *
 *   node scripts/run.mjs scripts/status.ts          draw every two seconds
 *   ONCE=1 node scripts/run.mjs scripts/status.ts    print one frame and exit
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
}
interface Corpus {
	keys: number;
	entries: Entry[];
	found?: Record<string, { boss?: Found; clear?: Found }>;
}

const DIR = process.env.DIR ?? 'corpus';
const CORPUS = process.env.CORPUS ?? 'public/corpus.json';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 2000);
/** A worker that has written nothing for this long is shown as quiet rather than running. */
const QUIET_MS = 5 * 60_000;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const readJson = <T>(path: string, fallback: T): T => {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
};

const since = (stamp: number): string => {
	const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
};

const bar = (done: number, total: number, width = 36): string => {
	const filled = total ? Math.round(Math.min(1, done / total) * width) : 0;
	return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
};

/** The last line a worker logged about a win, if it has won anything yet. */
const lastWin = (path: string): string => {
	if (!existsSync(path)) return '';
	try {
		const lines = readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line.includes('solved'));
		const last = lines[lines.length - 1] ?? '';
		return last.replace(/^seed /, '').trim();
	} catch {
		return '';
	}
};

interface Worker {
	from: number;
	keys: number;
	updated: number;
	live: boolean;
	win: string;
}

const workers = (): Worker[] => {
	if (!existsSync(DIR)) return [];
	const rows: Worker[] = [];
	for (const name of readdirSync(DIR)) {
		const match = /^scan-(\d+)\.json$/.exec(name);
		if (!match) continue;
		const from = Number(match[1]);
		const path = `${DIR}/scan-${from}.json`;
		let updated = 0;
		try {
			updated = statSync(path).mtimeMs;
		} catch {
			continue;
		}
		const win = lastWin(`${DIR}/bosslog-${from}.txt`) || lastWin(`${DIR}/log-${from}.txt`);
		rows.push({ from, keys: readJson<Entry[]>(path, []).length, updated, live: Date.now() - updated < QUIET_MS, win });
	}
	return rows.sort((a, b) => a.from - b.from);
};

function frame(): string {
	const corpus = readJson<Corpus>(CORPUS, { keys: 256, entries: [] });
	const rows = workers();
	const live = rows.filter((row) => row.live).length;
	const merged = new Set(corpus.entries.map((entry) => entry.loadout));
	const onDisk = new Set<string>();
	let finds = 0;
	for (const row of rows) {
		for (const entry of readJson<Entry[]>(`${DIR}/scan-${row.from}.json`, [])) {
			onDisk.add(entry.loadout);
			finds++;
		}
	}
	const pending = [...onDisk].filter((loadout) => !merged.has(loadout)).length;
	const pct = ((corpus.entries.length / Math.max(1, corpus.keys)) * 100).toFixed(1);
	const recent = [...corpus.entries]
		.slice(-5)
		.reverse()
		.map((entry) => `  ${entry.loadout}  seed ${String(entry.seed).padStart(5)}  ${String(entry.moves).padStart(3)} moves`);
	const lines = [
		` ${SPINNER[Math.floor(Date.now() / 200) % SPINNER.length]}  CORPUS SEARCH   ${new Date().toLocaleTimeString()}   ${DIR}/`,
		'',
		`  coverage   ${bar(corpus.entries.length, corpus.keys)}  ${corpus.entries.length}/${corpus.keys}  ${pct}%`,
		`  workers    ${rows.length} shards · ${live} writing within 5m · ${finds} finds on disk · ${pending} waiting to merge`,
		'',
		'  start   keys   state        updated   last win',
		...rows.map(
			(row) =>
				`  ${String(row.from).padEnd(6)}  ${String(row.keys).padEnd(5)}  ${
					row.live ? 'live      ' : 'quiet     '
				}  ${since(row.updated).padStart(6)}    ${row.win || '—'}`
		),
		'',
		'  latest in the corpus',
		...(recent.length ? recent : ['  (nothing merged yet)']),
		'',
		'  Ctrl+C to close · the search keeps running without this board',
	];
	return lines.join('\n');
}

const draw = () => {
	process.stdout.write(`\x1b[H\x1b[2J${frame()}\n`);
};

if (process.env.ONCE) {
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
