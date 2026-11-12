/**
 * Does a proposed simplification cost anything?
 *
 * A rule change is only worth arguing about if it can be priced. This solves every published seed
 * twice — once with the rules as shipped, once with a variant's clauses switched off — at the same
 * budget and with the same search, and sorts the result into four buckets rather than one number:
 *
 *   kept      both arms win: the rule bought nothing but its cost is zero
 *   priced    shipped wins, variant does not: this is the rule's price, in keys
 *   gained    variant wins where shipped does not: the rule was actively getting in the way
 *   untested  neither arm wins: the budget, not the rule, decided here — say nothing
 *
 * A variant can declare where it applies (`applies`), because most clauses live on one part of the
 * party: a Dwarf clause only meets the seeds whose kin is a spade, a Wizard clause only clubs class.
 * Entries outside that scope are skipped, never counted as kept.
 *
 * VARIANTS=variants/one-cap.json[,more] SHARD=<i> SHARDS=<n> BUDGET=<states> LIMIT=<n> OUT=<path>
 *
 * A variant file is `{ "clauses": { "dwarfCourt": false }, "applies": { "kin": "s" } }`; clause names
 * come from CLAUSES in src/tombcrawl.ts, and `applies` takes kin/class/glyph as suit letters and boss
 * as a suit name.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CLAUSES, TOMB_RULES, FREE_CELL_COUNT, createTombState, type ClauseName, type Difficulty } from '../src/tombcrawl';
import { solveTomb } from '../src/solver';

interface Entry {
	loadout: string;
	boss: string | null;
	seed: number;
	moves: number;
	difficulty: string;
}

interface Applies {
	kin?: string;
	class?: string;
	glyph?: string;
	boss?: string;
}

interface Variant {
	name: string;
	clauses?: Partial<Record<ClauseName, boolean>>;
	rules?: Partial<typeof TOMB_RULES>;
	applies?: Applies;
}

interface Arm {
	solved: boolean;
	moves: number | null;
}

const corpus = JSON.parse(readFileSync('public/corpus.json', 'utf8')) as { entries: Entry[] };
/** ONLY=<seed,seed,…> re-tests exactly what an earlier run lost, at a bigger budget. */
const only = (process.env.ONLY ?? '')
	.split(',')
	.map((seed) => Number(seed.trim()))
	.filter((seed) => Number.isFinite(seed));
const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);
const budget = Number(process.env.BUDGET ?? 300_000);
const limit = Number(process.env.LIMIT ?? 0);
const out = process.env.OUT ?? 'corpus/ab.json';

const variants: Variant[] = (process.env.VARIANTS ?? '')
	.split(',')
	.filter(Boolean)
	.map((path) => ({ ...JSON.parse(readFileSync(path, 'utf8')), name: path.replace(/^variants\//, '').replace(/\.json$/, '') }));

if (!variants.length) {
	console.error('VARIANTS is empty: name at least one file in variants/');
	process.exit(1);
}

const applicable = (entry: Entry, applies: Applies = {}) =>
	(!applies.kin || entry.loadout[0] === applies.kin) &&
	(!applies.class || entry.loadout[1] === applies.class) &&
	(!applies.glyph || entry.loadout[2] === applies.glyph) &&
	(!applies.boss || entry.boss === applies.boss);

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

const scoped = corpus.entries.filter(
	(entry) => entry.loadout.length === 4 && (!only.length || only.includes(entry.seed))
);
const slice = scoped.filter((_, index) => index % shards === shard);
// A limit takes every k-th seed rather than the first k: the corpus is ordered by party key, so the
// first N are all one kin, and a rule that changes everyone has to be read across all four.
const step = limit > 0 ? Math.max(1, Math.floor(slice.length / limit)) : 1;
const mine = limit > 0 ? slice.filter((_, index) => index % step === 0).slice(0, limit) : slice;

const rows: { entry: Entry; baseline: Arm; arms: Record<string, Arm> }[] = [];

for (const entry of mine) {
	const armed = variants.filter((variant) => applicable(entry, variant.applies));
	if (!armed.length) continue;
	const baseline = play(entry);
	const arms: Record<string, Arm> = {};
	for (const variant of armed) {
		const clauseSnapshot = { ...CLAUSES };
		const ruleSnapshot = { ...TOMB_RULES };
		Object.assign(CLAUSES, variant.clauses ?? {});
		Object.assign(TOMB_RULES, variant.rules ?? {});
		arms[variant.name] = play(entry);
		Object.assign(CLAUSES, clauseSnapshot);
		Object.assign(TOMB_RULES, ruleSnapshot);
	}
	rows.push({ entry, baseline, arms });
	console.log(
		`${entry.loadout} seed ${entry.seed} shipped:${baseline.solved ? `${baseline.moves}mv` : 'lost'}  ${armed
			.map((variant) => `${variant.name}:${arms[variant.name].solved ? `${arms[variant.name].moves}mv` : 'lost'}`)
			.join('  ')}`
	);
}

console.log('\n=== summary');
for (const variant of variants) {
	const tested = rows.filter((row) => row.arms[variant.name]);
	if (!tested.length) {
		console.log(`${variant.name}: nothing in scope`);
		continue;
	}
	const kept = tested.filter((row) => row.baseline.solved && row.arms[variant.name].solved);
	const priced = tested.filter((row) => row.baseline.solved && !row.arms[variant.name].solved);
	const gained = tested.filter((row) => !row.baseline.solved && row.arms[variant.name].solved);
	const untested = tested.filter((row) => !row.baseline.solved && !row.arms[variant.name].solved);
	const meanBase = kept.length ? kept.reduce((sum, row) => sum + (row.baseline.moves ?? 0), 0) / kept.length : 0;
	const meanArm = kept.length ? kept.reduce((sum, row) => sum + (row.arms[variant.name].moves ?? 0), 0) / kept.length : 0;
	console.log(
		`${variant.name}  in scope ${tested.length}  kept ${kept.length}  priced ${priced.length}  gained ${gained.length}  untested ${untested.length}  moves ${meanBase.toFixed(1)} -> ${meanArm.toFixed(1)}`
	);
	// Per kin, because a rule that changes everyone is read kin by kin: the question is whether the
	// party that was carrying the cap still carries it, and whether the others caught up.
	const perKin = ['h', 'c', 'd', 's']
		.map((kin) => {
			const ofKin = tested.filter((row) => row.entry.loadout.startsWith(kin));
			if (!ofKin.length) return null;
			const held = ofKin.filter((row) => row.arms[variant.name].solved).length;
			const base = ofKin.filter((row) => row.baseline.solved).length;
			return `${kin} ${held}/${ofKin.length} (shipped ${base})`;
		})
		.filter(Boolean)
		.join('  ');
	if (perKin) console.log(`  per kin: ${perKin}`);
	if (priced.length) console.log(`  price: ${priced.map((row) => `${row.entry.loadout}(${row.entry.seed})`).join(' ')}`);
	if (gained.length) console.log(`  gained: ${gained.map((row) => `${row.entry.loadout}(${row.entry.seed})`).join(' ')}`);
	if (untested.length) console.log(`  untested: ${untested.map((row) => row.entry.loadout).join(' ')}`);
}

writeFileSync(out, JSON.stringify({ variants: variants.map((variant) => variant.name), budget, rows }, null, '\t'));
console.log(`\nwrote ${out}`);
