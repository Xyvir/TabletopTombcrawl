/**
 * Two engines, one deal at a time: the flat search and the two-phase driver ran over the same seeds at the same node
 * budget, so a difference in the table is the driver and nothing else.
 *
 *   SEEDS=154116,2769,12,4 BUDGET=150000 node scripts/run.mjs scripts/compare-engines.ts
 *   SEEDS=154116 SPLIT=0.6 BUDGET=300000 node scripts/run.mjs scripts/compare-engines.ts
 *
 * `lost par N` is the best board the pass reached, so two losses can still be compared: the smaller par is the one
 * that got further. States and seconds are the whole spend of the pass, both phases included.
 */
import { FREE_CELL_COUNT, createTombState, hp, tombPar, type Difficulty } from '../src/tombcrawl';
import { ORGANIZE_WEIGHTS, solveTomb, type Goal, type SolverEngine } from '../src/solver';

const seeds = (process.env.SEEDS ?? '154116,2769,12,4')
	.split(',')
	.map((seed) => Number(seed.trim()))
	.filter((seed) => Number.isFinite(seed));
const budget = Number(process.env.BUDGET ?? 150_000);
const goal = (process.env.GOAL ?? 'clear') as Goal;
const difficulty = (process.env.DIFFICULTY ?? 'med') as Difficulty;
const split = process.env.SPLIT ? Number(process.env.SPLIT) : undefined;
const engines = (process.env.ENGINES ?? 'flat,two-phase,fallback').split(',') as SolverEngine[];
// The organizing pass's two prices are what a two-phase run is really being asked about, so they can be swept here.
if (process.env.HEARTS) ORGANIZE_WEIGHTS.hearts = Number(process.env.HEARTS);
if (process.env.CASH) ORGANIZE_WEIGHTS.cash = Number(process.env.CASH);
if (process.env.FOG) ORGANIZE_WEIGHTS.fog = Number(process.env.FOG);
if (process.env.DECAY) ORGANIZE_WEIGHTS.decay = Number(process.env.DECAY);
if (process.env.READY) ORGANIZE_WEIGHTS.ready = Number(process.env.READY);

const total: Record<string, { wins: number; moves: number; nodes: number; seconds: number; tested: number }> = {};

for (const seed of seeds) {
	const line: string[] = [`seed ${seed}`];
	for (const engine of engines) {
		const began = Date.now();
		const result = solveTomb({
			state: createTombState(seed, FREE_CELL_COUNT[difficulty]),
			goal,
			engine,
			phaseSplit: engine === 'two-phase' ? split : undefined,
			nodes: budget,
		});
		const seconds = (Date.now() - began) / 1000;
		const spend = total[engine] ?? (total[engine] = { wins: 0, moves: 0, nodes: 0, seconds: 0, tested: 0 });
		spend.tested += 1;
		spend.nodes += result.nodes;
		spend.seconds += seconds;
		if (result.solved) {
			spend.wins += 1;
			spend.moves += result.steps.length;
		}
		line.push(
			`${engine} ${result.solved ? `win ${result.steps.length} moves` : `lost par ${tombPar(result.best)} hp ${hp(result.best)}`}` +
				` · ${(result.nodes / 1000).toFixed(0)}k states · ${seconds.toFixed(1)}s`
		);
	}
	console.log(line.join('   |   '));
}

console.log(`\n=== ${goal} on ${difficulty}, ${budget / 1000}k states a pass`);
for (const engine of engines) {
	const spend = total[engine];
	if (!spend) continue;
	const mean = spend.wins ? (spend.moves / spend.wins).toFixed(1) : '—';
	console.log(
		`${engine.padEnd(10)} ${spend.wins}/${spend.tested} solved · mean ${mean} moves · ` +
			`${(spend.nodes / 1000).toFixed(0)}k states · ${spend.seconds.toFixed(1)}s`,
	);
}
