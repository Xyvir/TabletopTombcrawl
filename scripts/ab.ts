/**
 * Does a proposed simplification cost anything?
 *
 * A rule change is only worth arguing about if you can price it. This runs every published seed twice
 * — once with the rules as shipped, once with a variant's clauses switched off — at the same budget
 * and the same search, and reports what the variant loses, gains, and costs in moves. Seeds are the
 * corpus's own: each one is a deal we already know is winnable, so a seed the variant can no longer
 * win is the price of the rule, measured in keys.
 *
 * A miss is a lower bound, not a proof: a variant can lose a seed to the search rather than to the
 * rule, so anything it drops is worth a second, wider pass before it is believed.
 *
 * VARIANTS=variants/one-cap.json[,more] SHARD=<i> SHARDS=<n> BUDGET=<states> SKEY=<kin letter> OUT=<path>
 *
 * A variant file is `{ "clauses": { "dwarfCourt": false }, "rules": { "levelUpHeal": 2 } }`; every
 * name comes from CLAUSES in src/tombcrawl.ts and every knob from TOMB_RULES beside it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CLAUSES, TOMB_RULES, FREE_CELL_COUNT, createTombState, type ClauseName, type Difficulty } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Entry {
	loadout: string;
	seed: number;
	moves: number;
	difficulty: string;
}

interface Variant {
	name: string;
	clauses?: Partial<Record<ClauseName, boolean>>;
	rules?: Partial<typeof TOMB_RULES>;
}

interface Arm {
	solved: boolean;
	moves: number | null;
}

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { entries: Entry[] };
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 200_000);
const keyFilter = process.env.SKEY ?? '';
const out = process.env.OUT ?? 'corpus/ab.json';

const variants: Variant[] = (process.env.VARIANTS ?? '')
	.split(',')
	.filter(Boolean)
	.map((path) => ({ name: path.replace(/^variants\//, '').replace(/\.json$/, ''), ...JSON.parse(readFileSync(path, 'utf8')) }));

if (!variants.length) {
	console.error('VARIANTS is empty: name at least one file in variants/');
	process.exit(1);
}

const mine = corpus.entries
	.filter((entry) => !keyFilter || entry.loadout.startsWith(keyFilter))
	.filter((_, index) => index % shards === shard);

/** One solve, with whatever the clauses currently say. */
function play(entry: Entry): Arm {
	const difficulty = entry.difficulty as Difficulty;
	const state = createTombState(entry.seed, FREE_CELL_COUNT[difficulty] ?? FREE_CELL_COUNT.med);
	const result = solveTomb({
		state,
		goal: 'boss',
		strategy: 'hybrid',
		beamWidth: 300,
		depth: 300,
		nodes: budget,
		timeBudgetMs: Number.POSITIVE_INFINITY,
	});
	return { solved: result.solved, moves: result.solved ? result.steps.length : null };
}

const rows: {
	entry: Entry;
	baseline: Arm;
	arms: Record<string, Arm>;
}[] = [];

for (const entry of mine) {
	const baseline = play(entry);
	const arms: Record<string, Arm> = {};
	for (const variant of variants) {
		const clauseSnapshot = { ...CLAUSES };
		const ruleSnapshot = { ...TOMB_RULES };
		Object.assign(CLAUSES, variant.clauses ?? {});
		Object.assign(TOMB_RULES, variant.rules ?? {});
		arms[variant.name] = play(entry);
		Object.assign(CLAUSES, clauseSnapshot);
		Object.assign(TOMB_RULES, ruleSnapshot);
	}
	rows.push({ entry, baseline, arms });
	const cells = variants
		.map((variant) => `${variant.name}:${arms[variant.name].solved ? `${arms[variant.name].moves}mv` : 'lost'}`)
		.join('  ');
	console.log(`${entry.loadout} seed ${entry.seed} base:${baseline.solved ? `${baseline.moves}mv` : 'lost'}  ${cells}`);
}

console.log('\n=== summary');
for (const variant of variants) {
	const kept = rows.filter((row) => row.arms[variant.name].solved);
	const lost = rows.filter((row) => !row.arms[variant.name].solved);
	const gained = rows.filter((row) => row.arms[variant.name].solved && !row.baseline.solved);
	const both = rows.filter((row) => row.arms[variant.name].solved && row.baseline.solved);
	const meanBase = both.length ? both.reduce((sum, row) => sum + (row.baseline.moves ?? 0), 0) / both.length : 0;
	const meanArm = both.length ? both.reduce((sum, row) => sum + (row.arms[variant.name].moves ?? 0), 0) / both.length : 0;
	const perKin: Record<string, string> = {};
	for (const kin of ['h', 'c', 'd', 's']) {
		const kinRows = rows.filter((row) => row.entry.loadout.startsWith(kin));
		if (!kinRows.length) continue;
		const held = kinRows.filter((row) => row.arms[variant.name].solved).length;
		perKin[kin] = `${held}/${kinRows.length}`;
	}
	console.log(
		`${variant.name}: ${kept.length}/${rows.length} kept  ${JSON.stringify(perKin)}  lost: ${lost
			.map((row) => row.entry.loadout)
			.join(' ') || '(none)'}  gained: ${gained.map((row) => row.entry.loadout).join(' ') || '(none)'}  moves ${meanBase.toFixed(1)} -> ${meanArm.toFixed(1)}`
	);
}

writeFileSync(out, JSON.stringify({ variants: variants.map((variant) => variant.name), rows }, null, '\t'));
console.log(`\nwrote ${out}`);
