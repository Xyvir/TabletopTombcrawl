import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Candidate { key: string; loadout: string; boss: string | null; seeds: number[] }
const plan = JSON.parse(readFileSync('corpus/plan.json', 'utf8')) as Candidate[];
const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { missing?: string[] };
const missing = new Set(corpus.missing ?? []);
const budget = Number(process.env.BUDGET ?? 800_000);
const seconds = Number(process.env.TIME ?? 60);
const perKey = Number(process.env.PER_KEY ?? 1);
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const out = process.env.OUT ?? `corpus/scan-wiz-retest-${shard}.json`;
const targets = plan
	.filter((c) => missing.has(c.key) && (c.key.startsWith('dc') || c.key.startsWith('sc')))
	.filter((_, index) => index % shards === shard);
const entries: unknown[] = [];
let tried = 0;
let wins = 0;
for (const candidate of targets) {
	let solved = false;
	for (const seed of candidate.seeds.slice(0, perKey)) {
		const state = createTombState(seed, FREE_CELL_COUNT.med);
		const started = Date.now();
		const result = solveTomb({
			state,
			goal: 'boss',
			strategy: 'best',
			beamWidth: 300,
			depth: 300,
			nodes: budget,
			timeBudgetMs: seconds * 1000,
		});
		tried += 1;
		if (!result.solved) {
			console.log(`${candidate.key} ${seed} none ${((Date.now() - started) / 1000).toFixed(0)}s`);
			continue;
		}
		wins += 1;
		solved = true;
		entries.push({
			loadout: candidate.loadout,
			boss: candidate.boss,
			seed,
			moves: result.steps.length,
			difficulty: 'med',
			goal: 'boss',
			party: [...state.draft]
				.sort((a, b) => a.cell - b.cell)
				.map((entry) => ({ role: entry.role, name: entry.name, suit: entry.suit })),
			at: new Date().toISOString(),
		});
		writeFileSync(out, JSON.stringify(entries, null, '\t'));
		console.log(`${candidate.key} ${seed} solved ${result.steps.length} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
		break;
	}
	if (!solved) console.log(`${candidate.key} held`);
}
console.log(`retest ${targets.length} keys · ${tried} deals · ${wins} wins`);
