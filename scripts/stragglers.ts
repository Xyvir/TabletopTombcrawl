/**
 * The straggler list: every key the corpus has no win for, with the seed its square is currently offering, read as the
 * deal reads today. Written as a `MODE=solve` plan so the ordinary runner does the sweeping and the ordinary merge
 * does the promoting.
 *
 *   node scripts/run.mjs corpus/plan-stragglers.ts
 *   MODE=solve ENGINE=two-phase PLAN=corpus/plan-stragglers.json OUT=corpus/shard-twophase.json \
 *     BUDGET=200000 node scripts/run.mjs scripts/corpus.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FREE_CELL_COUNT, createTombState } from '../src/tombcrawl';

interface Corpus {
	missing: string[];
	placeholders: Record<string, { med?: { seed: number; score: number } }>;
}

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as Corpus;
const plan: { key: string; loadout: string; boss: string | null; seeds: number[]; score: number }[] = [];
let stale = 0;
let bare = 0;

for (const key of corpus.missing) {
	const placeholder = corpus.placeholders[key]?.med;
	if (!placeholder) {
		bare += 1;
		continue;
	}
	const state = createTombState(placeholder.seed, FREE_CELL_COUNT.med);
	const loadout = [...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');
	// A placeholder seed that no longer deals its own key is a stale square, not a candidate: solving it would fill
	// whichever party the seed deals now, which the runner records honestly but which is not what was asked for.
	if (loadout !== key) {
		stale += 1;
		continue;
	}
	plan.push({ key, loadout, boss: state.bossSuit, seeds: [placeholder.seed], score: placeholder.score });
}

writeFileSync('corpus/plan-stragglers.json', JSON.stringify(plan, null, '\t'));
console.log(`${plan.length} candidates for ${corpus.missing.length} missing keys · ${stale} stale squares · ${bare} with no placeholder`);
console.log(`furthest-along score: min ${Math.min(...plan.map((row) => row.score))} · max ${Math.max(...plan.map((row) => row.score))}`);
