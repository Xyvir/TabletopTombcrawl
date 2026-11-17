/**
 * Fresh candidates: for every key the corpus still has no win for, bucket a few seeds nobody has tried —
 * dealt strictly above the ranges the fills and scans have already walked — so the next sweep solves new
 * deals instead of re-reading the placeholders. The solve runner skips published loadouts on its own, so a
 * rerun of the same plan keeps chasing only the squares still empty.
 *
 *   node scripts/run.mjs scripts/fresh-plan.ts
 *   MODE=solve ENGINE=plan PLAN=corpus/plan-fresh.json OUT=corpus/shard-fresh-plan.json \
 *     BUDGET=200000 GOAL=clear node scripts/run.mjs scripts/corpus.ts
 *
 * FROM seeds below this have been walked by earlier fills and scans; seeds is per key, not per worker.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';

interface Candidate {
	key: string;
	loadout: string;
	boss: string | null;
	seeds: number[];
}

const from = Number(process.env.FROM ?? 205001);
const hi = Number(process.env.HI ?? 400000);
const perKey = Number(process.env.PER_KEY ?? 2);
const planPath = process.env.PLAN ?? 'corpus/plan-fresh.json';

const keyOf = (loadout: string) => loadout;
const loadoutOf = (state: ReturnType<typeof createTombState>) =>
	[...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as {
	missing?: string[];
	placeholders?: Record<string, { med?: { seed: number } }>;
	entries?: { loadout: string }[];
};
/** Squares with no win: the only keys worth fresh seeds. */
const missing = new Set(corpus.missing ?? []);
/** Placeholder seeds were already searched; dealing them again spends budget learning nothing. */
const tried = new Set<number>();
for (const row of Object.values(corpus.placeholders ?? {})) {
	if (row?.med && typeof row.med.seed === 'number') tried.add(row.med.seed);
}

const buckets = new Map<string, Candidate>();
let pending = missing.size;
for (let seed = from; seed <= hi && pending > 0; seed++) {
	const state = createTombState(seed, FREE_CELL_COUNT.med);
	const key = keyOf(loadoutOf(state));
	if (!missing.has(key)) continue;
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { key, loadout: loadoutOf(state), boss: state.bossSuit, seeds: [] };
		buckets.set(key, bucket);
	}
	if (bucket.seeds.length >= perKey || tried.has(seed)) continue;
	if (bucket.seeds.length === 0) pending -= 1;
	bucket.seeds.push(seed);
}

const plan = [...buckets.values()]
	.filter((candidate) => candidate.seeds.length > 0)
	.sort((a, b) => (a.key < b.key ? -1 : 1));
writeFileSync(planPath, JSON.stringify(plan));
const short = [...buckets.values()].filter((candidate) => candidate.seeds.length === 0).length;
console.log(
	`fresh-plan: seeds ${from}-${hi} · ${plan.length} keys with seeds · ${plan.reduce((n, c) => n + c.seeds.length, 0)} seeds · ${short} keys unfound in range → ${planPath}`,
);
