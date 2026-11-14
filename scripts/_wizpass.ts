/**
 * A second pass over the parties that have a Wizard and no seed: fresh deals, four times the sweep's
 * budget. The plan only ever held two to six candidate deals per key, so a key could be missing for
 * want of tries rather than for want of a winnable deal.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { missing?: string[] };
const targets = (corpus.missing ?? []).filter((key) => key[1] === 'c');
const budget = Number(process.env.BUDGET ?? 800_000);
const seconds = Number(process.env.TIME ?? 45);
const perKey = Number(process.env.PER_KEY ?? 4);
const from = Number(process.env.FROM ?? 60_001);
const span = Number(process.env.SPAN ?? 60_000);
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 3);
const out = process.env.OUT ?? `corpus/scan-wizpass-${shard}.json`;

const mine = targets.filter((_, index) => index % shards === shard);
const wanted = new Set(mine);
const candidates = new Map<string, number[]>();
// Keep scanning until every key has its fill, not just until every key has one: stopping at the first
// candidate left most keys with the same two deals to try.
const short = () => mine.some((key) => (candidates.get(key)?.length ?? 0) < perKey);
for (let seed = from; seed < from + span && short(); seed++) {
	const state = createTombState(seed, FREE_CELL_COUNT.med);
	const key = [...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');
	if (!wanted.has(key)) continue;
	const list = candidates.get(key) ?? [];
	if (list.length >= perKey) continue;
	list.push(seed);
	candidates.set(key, list);
}
console.log(`shard ${shard}: ${mine.length} wizard keys, ${candidates.size} with fresh deals`);

const entries: unknown[] = [];
for (const key of mine) {
	const seeds = candidates.get(key) ?? [];
	if (!seeds.length) {
		console.log(`${key} no fresh deals in ${from}..${from + span - 1}`);
		continue;
	}
	let solved = false;
	for (const seed of seeds) {
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
		if (!result.solved) {
			console.log(`${key} ${seed} none ${((Date.now() - started) / 1000).toFixed(0)}s`);
			continue;
		}
		solved = true;
		entries.push({
			loadout: key,
			boss: state.bossSuit,
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
		console.log(`${key} ${seed} solved ${result.steps.length} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
		break;
	}
	if (!solved) console.log(`${key} held`);
}
console.log(`wizpass shard ${shard}: ${mine.length} keys · ${entries.length} wins`);
