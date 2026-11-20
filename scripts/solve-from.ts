/**
 * Solve from a board a player already reached: replay their log, then hand its last board to the search.
 *
 *   SEED=1803 node scripts/run.mjs scripts/solve-from.ts corpus/1803.log
 *   SEED=1803 GOAL=boss ENGINE=plan BUDGET=300000 node scripts/run.mjs scripts/solve-from.ts corpus/1803.log
 *
 * The log is the game's own table: only the numbered action rows are read, and each row's fog, hp,
 * level and par are checked against the rules as it replays. So the search only ever starts from the
 * board the log really reaches — a transcription slip stops the run instead of quietly solving a
 * different board.
 *
 * Logs recorded before the notation fix carry a lossy line: a tomb's affliction can lift fog on a park
 * or a build, and the recorder printed that as a `dig`, dropping the card that moved. When a `dig` line
 * does not replay, this walks the legal moves that lift exactly that card and match the row's numbers,
 * so the board is recovered and proved against every row rather than guessed.
 *
 *   DIFFICULTY  med|hard (default med)
 *   GOAL        clear|boss (default clear)
 *   ENGINE      flat|two-phase|fallback|plan|modes (default flat)
 *   BUDGET      states to examine (default 200000)
 *   TIME        seconds before giving up (default 120; 0 = states only)
 *   BOARD=1     print the boardstring for the log's last board and stop, so the position can be
 *               pasted into the crawl box and played on
 */
import { readFileSync } from 'node:fs';
import {
	FREE_CELL_COUNT,
	createTombState,
	currentLevel,
	foundationTopRank,
	hp,
	tombPar,
	type TombState,
} from '../src/tombcrawl';
import { applyAction, boardSummary, generateMoves, solveTomb, type Goal, type SolverEngine } from '../src/solver';
import { shorthandCard } from '../src/game/card/card';
import { encodeBoard } from '../src/boardstate';
import { tryStep } from './replay';

interface Row {
	n: number;
	action: string;
	fog: number;
	hp: string;
	lvl: number;
	par: number;
}

const file = process.argv[2];
if (!file) {
	console.log('usage: SEED=1803 node scripts/run.mjs scripts/solve-from.ts corpus/1803.log');
	process.exit(1);
}

const seed = Number(process.env.SEED ?? 1);
const difficulty = process.env.DIFFICULTY === 'hard' ? 'hard' : 'med';
const goal: Goal = process.env.GOAL === 'boss' ? 'boss' : 'clear';
const engine = (process.env.ENGINE ?? 'flat') as SolverEngine;
const nodes = Number(process.env.BUDGET ?? 200_000);
const seconds = Number(process.env.TIME ?? 120);

const rows: Row[] = [];
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
	const row = /^\s*(\d+)\s{2,}(.+?)\s{2,}fog\s+(\d+)\s+hp\s+(\S+)\s+lvl\s+(\d+)\s+par\s+(\d+)/.exec(line);
	if (!row) continue;
	rows.push({
		n: Number(row[1]),
		action: row[2].replace(/\s+/g, ' ').trim(),
		fog: Number(row[3]),
		hp: row[4],
		lvl: Number(row[5]),
		par: Number(row[6]),
	});
}
if (!rows.length) {
	console.log(`${file} holds no action rows`);
	process.exit(1);
}

const matches = (state: TombState, row: Row) =>
	state.hidden.length === row.fog &&
	`${hp(state)}/${state.game.cells.length}` === row.hp &&
	currentLevel(state) === row.lvl &&
	tombPar(state) === row.par;

const start = createTombState(seed, FREE_CELL_COUNT[difficulty]);
let nodesVisited = 0;
let rebuilt = 0;
let deepest = 0;

/** The board at the end of the log, or null if some row cannot be reproduced. */
function walk(index: number, state: TombState): TombState | null {
	nodesVisited += 1;
	deepest = Math.max(deepest, index);
	if (index === rows.length) return state;
	const row = rows[index];

	const direct = tryStep(state, row.action);
	if (direct && matches(direct, row)) {
		const found = walk(index + 1, direct);
		if (found) return found;
	}

	// A `dig` the recorder wrote for a move that lifted fog: find the moves that reproduce it. The
	// stats are the proof, so a branch only survives if the row reads the same after it.
	const named = /^dig (\w+) col \d+ row \d+$/.exec(row.action);
	if (!named || !state.hidden.includes(named[1])) return null;
	rebuilt += 1;
	for (const move of generateMoves(state)) {
		if (move.action.kind === 'dig') continue;
		const next = applyAction(state, move.action);
		if (!next || next.hidden.includes(named[1]) || !matches(next, row)) continue;
		const found = walk(index + 1, next);
		if (found) return found;
	}
	return null;
}

const state = walk(0, start);
if (!state) {
	console.log(`row ${rows[deepest].n} cannot be reproduced from the log (${nodesVisited} boards tried)`);
	process.exit(1);
}

const party = state.draft
	.slice()
	.sort((a, b) => a.cell - b.cell)
	.map((entry) => `${entry.id} ${entry.name}`)
	.join(' · ');
console.log(
	`${rows.length} moves replay · ${rebuilt ? `${rebuilt} rows rebuilt from a lossy dig · ` : ''}seed ${seed} ${difficulty} · ${boardSummary(state)}`
);
console.log(`  party: ${party}`);
state.game.tableau.forEach((pile, index) =>
	console.log(
		`  col ${index + 1}: ${pile.map((card) => (state.hidden.includes(shorthandCard(card)) ? `(${shorthandCard(card)})` : shorthandCard(card))).join(' ')}`
	)
);
console.log(`  cells: ${state.game.cells.map((card) => (card ? shorthandCard(card) : '.')).join(' ')}`);
console.log(
	`  graves: ${(['spades', 'hearts', 'clubs', 'diamonds'] as const)
		.map((suit) => `${suit} ${foundationTopRank(state, suit)}`)
		.join(' · ')}`
);
console.log(`  board: ${encodeBoard(state)}`);
if (process.env.BOARD) process.exit(0);

const began = Date.now();
const result = solveTomb({
	state,
	goal,
	engine,
	nodes,
	timeBudgetMs: seconds > 0 ? seconds * 1000 : Number.POSITIVE_INFINITY,
	onProgress: (info) => {
		process.stdout.write(
			`\r  nodes ${info.nodes.toLocaleString('en-US')} best ${info.best} ${((Date.now() - began) / 1000).toFixed(1)}s   `
		);
	},
});
process.stdout.write('\r' + ' '.repeat(64) + '\r');

const spent = `${(result.elapsedMs / 1000).toFixed(1)}s · ${result.nodes.toLocaleString('en-US')} states`;
if (result.solved) {
	const final = result.steps[result.steps.length - 1].state;
	console.log(
		`solved: ${goal === 'boss' ? 'boss slain' : '100% clear'} in ${result.steps.length} more moves · par ${tombPar(final)} · ${spent}`
	);
	result.steps.forEach((step, index) => console.log(`${String(index + 1).padStart(3)}  ${step.label}`));
} else {
	console.log(`no line from here in ${spent}${result.timedOut ? ' (ran out of time)' : ''}`);
	console.log(`furthest board: ${boardSummary(result.best)} · after ${result.bestSteps.length} moves`);
}
