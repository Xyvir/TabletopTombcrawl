/**
 * A fixed benchmark, so a solver change can be priced instead of argued about.
 *
 * The corpus cannot serve as one on its own: every row in it is a deal the solver already wins, so a
 * change that quietly gives up on the hard half would look like a triumph. This builds the other half.
 * A run of `MODE=build` plays a block of fresh seeds with the shipped policy at one budget and records
 * what happened to each — the wins as `win` rows, the deals it could not finish as `hard` rows carrying
 * the budget they survived. Scoring a candidate config later asks two questions of the same file: did it
 * keep the wins, and did it crack anything the reference could not.
 *
 * "Hard" is not "unwinnable". Nothing here proves a deal cannot be cleared; a `hard` row only says the
 * reference policy failed at `reference.nodes`, which is the bar a candidate has to beat.
 *
 *   MODE=build FROM=<seed> COUNT=<n> [GOAL=boss] [BUDGET=300000] [TIME=30000] [DIFFICULTY=med]
 *   MODE=score [FILE=bench/bench.json] [STRATEGY=best] [BEAM=300] [BUDGET=300000] [TIME=30000]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState, type Difficulty } from '../src/tombcrawl';
import { SCORE_WEIGHTS, solveTomb, type Goal } from '../src/solver';

interface Row {
	seed: number;
	loadout: string;
	goal: Goal;
	difficulty: string;
	/** `win`: the reference policy finished it. `hard`: it did not, at the reference budget. */
	status: 'win' | 'hard';
	moves: number | null;
	nodes: number;
	ms: number;
	at: string;
}

interface Bench {
	reference: { goal: Goal; strategy: string; nodes: number; timeBudgetMs: number; difficulty: string };
	rows: Row[];
}

const mode = process.env.MODE ?? 'build';
const file = process.env.FILE ?? 'bench/bench.json';
const goal = (process.env.GOAL ?? 'boss') as Goal;
const difficulty = (process.env.DIFFICULTY ?? 'med') as Difficulty;
const budget = Number(process.env.BUDGET ?? 300_000);
const time = Number(process.env.TIME ?? 30_000);
const strategy = (process.env.STRATEGY ?? 'best') as 'best' | 'beam' | 'dfs' | 'hybrid';
const beam = Number(process.env.BEAM ?? 300);

const loadoutOf = (state: ReturnType<typeof createTombState>) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

if (mode === 'build') {
	const from = Number(process.env.FROM ?? 70_001);
	const count = Number(process.env.COUNT ?? 60);
	const rows: Row[] = [];
	if (!existsSync('bench')) mkdirSync('bench');
	for (let seed = from; seed < from + count; seed++) {
		const state = createTombState(seed, FREE_CELL_COUNT[difficulty]);
		const result = solveTomb({ state, goal, strategy, beamWidth: beam, nodes: budget, timeBudgetMs: time });
		rows.push({
			seed,
			loadout: loadoutOf(state),
			goal,
			difficulty,
			status: result.solved ? 'win' : 'hard',
			moves: result.solved ? result.steps.length : null,
			nodes: result.nodes,
			ms: result.elapsedMs,
			at: new Date().toISOString(),
		});
		writeFileSync(file, JSON.stringify({ reference: { goal, strategy, nodes: budget, timeBudgetMs: time, difficulty }, rows }, null, '\t'));
		console.log(`${seed} ${loadoutOf(state)} ${result.solved ? `win ${result.steps.length}` : 'hard'} · ${result.nodes} states`);
	}
	const wins = rows.filter((row) => row.status === 'win').length;
	console.log(`bench build ${from}-${from + count - 1}: ${wins} win · ${rows.length - wins} hard → ${file}`);
}

if (mode === 'score') {
	const bench = JSON.parse(readFileSync(file, 'utf8')) as Bench;
	const kept: string[] = [];
	const lost: string[] = [];
	const cracked: string[] = [];
	let winStates = 0;
	let hardStates = 0;
	for (const row of bench.rows) {
		const state = createTombState(row.seed, FREE_CELL_COUNT[difficulty]);
		const result = solveTomb({ state, goal: row.goal, strategy, beamWidth: beam, nodes: budget, timeBudgetMs: time });
		const tag = `${row.loadout} ${row.seed}`;
		if (row.status === 'win') {
			winStates += result.nodes;
			if (result.solved) kept.push(tag);
			else lost.push(tag);
		} else {
			hardStates += result.nodes;
			if (result.solved) cracked.push(tag);
		}
	}
	const wins = bench.rows.filter((row) => row.status === 'win').length;
	console.log(
		`${JSON.stringify({ strategy, beam, nodes: budget })} · win rows ${kept.length}/${wins} kept (${lost.length} lost) · hard rows cracked ${cracked.length}/${bench.rows.length - wins}`
	);
	console.log(`states spent: ${winStates} on known wins, ${hardStates} on hard deals · weights ${JSON.stringify(SCORE_WEIGHTS)}`);
	if (lost.length) console.log(`lost: ${lost.join(', ')}`);
	if (cracked.length) console.log(`cracked: ${cracked.join(', ')}`);
}
