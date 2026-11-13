import { FREE_CELL_COUNT, ROLE_WORD, TOMB_RULES, createTombState, type Difficulty, type TombState } from '../src/tombcrawl';
import { SCORE_WEIGHTS, boardSummary, solveTomb, type Goal, type SolveResult } from '../src/solver';

interface Options {
	seed: number | null;
	seeds: [number, number] | null;
	difficulty: Difficulty;
	goal: Goal;
	nodes: number;
	depth: number;
	beamWidth: number;
	strategy: 'best' | 'beam' | 'dfs' | 'hybrid';
	heal: number;
	cap: number;
	glyphBoss: boolean;
	seconds: number;
	limit: number | null;
	quiet: boolean;
}

function parse(argv: string[]): Options {
	const options: Options = {
		seed: null,
		seeds: null,
		difficulty: 'med',
		goal: 'clear',
		nodes: 2_000_000,
		depth: 300,
		beamWidth: 300,
		strategy: 'hybrid',
		heal: 1,
		cap: 0,
		glyphBoss: true,
		seconds: 120,
		limit: null,
		quiet: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = argv[i + 1];
		switch (arg) {
			case '--seed':
				options.seed = Number(value);
				i++;
				break;
			case '--seeds': {
				const [from, to] = String(value).split(/[-.]+/).map(Number);
				options.seeds = [from, to ?? from];
				i++;
				break;
			}
			case '--difficulty':
				options.difficulty = (value as Difficulty) ?? 'med';
				i++;
				break;
			case '--goal':
				options.goal = value === 'boss' ? 'boss' : 'clear';
				i++;
				break;
			case '--nodes':
				options.nodes = Number(value);
				i++;
				break;
			case '--beam':
				options.beamWidth = Number(value);
				i++;
				break;
			case '--heal':
				options.heal = Number(value);
				i++;
				break;
			case '--cap':
				options.cap = Number(value);
				i++;
				break;
			case '--glyphboss':
				options.glyphBoss = true;
				break;
			case '--no-glyphboss':
				options.glyphBoss = false;
				break;
			case '--strategy':
				options.strategy =
					value === 'dfs' || value === 'beam' || value === 'hybrid' ? value : 'best';
				// The default width would keep best-first on the beam path, so choosing it clears the beam.
				if (options.strategy === 'best') options.beamWidth = 0;
				i++;
				break;
			case '--depth':
				options.depth = Number(value);
				i++;
				break;
			case '--time':
				options.seconds = Number(value);
				i++;
				break;
			case '--steps':
				options.limit = Number(value);
				i++;
				break;
			case '--quiet':
				options.quiet = true;
				break;
			default:
				break;
		}
	}
	return options;
}

const pad = (text: string, width: number) => (text.length >= width ? text : text + ' '.repeat(width - text.length));
const left = (text: string, width: number) => (text.length >= width ? text.slice(0, width) : ' '.repeat(width - text.length) + text);

function party(state: TombState): string {
	return state.draft
		.slice()
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => `${ROLE_WORD[entry.role]} ${entry.name}`)
		.join(' · ');
}

function heading(state: TombState, options: Options): string {
	const free = FREE_CELL_COUNT[options.difficulty];
	const goal = options.goal === 'boss' ? 'slay the boss' : '100% clear';
	return [
		`seed ${state.seed}  ·  ${options.difficulty} (${free} free cells)  ·  goal: ${goal}  ·  level up heals ${TOMB_RULES.levelUpHeal}${options.difficulty === 'hard' ? '  ·  no ceiling on a blow' : TOMB_RULES.levelDamageCap ? `  ·  no blow over ${TOMB_RULES.levelDamageCap}` : ''}${TOMB_RULES.glyphMoveBoss ? '  ·  glyphs may shift the boss' : ''}`,
		`boss  ${state.bossSuit ? `${state.bossSuit} king` : 'not yet revealed'}  ·  party  ${party(state) || '(none)'}`,
	].join('\n');
}

function printSteps(result: SolveResult, limit: number | null): void {
	const steps = result.solved ? result.steps : result.bestSteps;
	const shown = limit === null ? steps : steps.slice(0, limit);
	console.log('');
	console.log('  #  action                                            fog  hp     lvl  par   cleared');
	shown.forEach((step, index) => {
		const board = boardSummary(step.state)
			.replace(/^fog (\d+)\s+hp (\S+)\s+lvl (\d+)\s+par (\d+)\s+(\S+)$/, (_all, fog, hearts, level, par, cleared) =>
				`${left(fog, 3)}  ${pad(hearts, 6)} ${left(level, 4)} ${left(par, 4)}  ${cleared}`
			);
		console.log(`${left(String(index + 1), 3)}  ${pad(step.label, 50)} ${board}`);
	});
	if (limit !== null && steps.length > limit) console.log(`… ${steps.length - limit} more moves`);
	console.log('');
}

function single(options: Options): void {
	const state = createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty]);
	console.log(heading(state, options));
	console.log(matchSummary(state));
	const result = solveTomb({
		state,
		goal: options.goal,
		nodes: options.nodes,
		depth: options.depth,
		beamWidth: options.beamWidth,
		strategy: options.strategy,
		// A zero seconds budget means no clock at all: the state budget is then the only limit, so a
		// run reads the same on any machine.
		timeBudgetMs: options.seconds > 0 ? options.seconds * 1000 : Number.POSITIVE_INFINITY,
		onProgress: (info) => {
			if (options.quiet) return;
			process.stdout.write(
				`\r  nodes ${left(info.nodes.toLocaleString('en-US'), 8)} open ${left(info.open.toLocaleString('en-US'), 6)} best ${left(String(info.best), 5)} depth ${left(String(info.depth), 3)} ${(info.elapsedMs / 1000).toFixed(1)}s   `
			);
		},
	});
	if (!options.quiet) process.stdout.write('\r' + ' '.repeat(72) + '\r');

	printSteps(result, options.limit);

	const seconds = (result.elapsedMs / 1000).toFixed(1);
	const states = result.nodes.toLocaleString('en-US');
	if (result.solved) {
		const final = result.steps[result.steps.length - 1].state;
		console.log(`solved: ${options.goal === 'boss' ? 'boss slain' : '100% clear'} in ${result.steps.length} moves · final par ${final.game.cards.filter((card) => card.location.fixture !== 'foundation').length === 0 ? 0 : '—'} · ${seconds}s · ${states} states`);
		return;
	}
	console.log(`no line found in ${seconds}s (${states} states examined${result.timedOut ? ', ran out of time' : ''})`);
	console.log(`best reachable board: ${boardSummary(result.best)}`);
	if (result.bestSteps.length) {
		const last = result.bestSteps[result.bestSteps.length - 1].label;
		console.log(`last move of that line: ${last}`);
	}
	console.log('this is a lower bound: a line found proves winnable, finding none does not prove the opposite.');
}

function matchSummary(state: TombState): string {
	const open = state.hidden.length;
	return `fog ${open} cards face down · ${state.game.cells.filter((card) => !card).length} free cells open · starting ${boardSummary(state)}`;
}

function range(options: Options): void {
	const [from, to] = options.seeds ?? [1, 10];
	const rows: { seed: number; solved: boolean; length: number; summary: string; seconds: string }[] = [];
	for (let seed = from; seed <= to; seed++) {
		const state = createTombState(seed, FREE_CELL_COUNT[options.difficulty]);
			const result = solveTomb({
			state,
			goal: options.goal,
			nodes: options.nodes,
			depth: options.depth,
			beamWidth: options.beamWidth,
			strategy: options.strategy,
			// A zero seconds budget means no clock at all: the state budget is then the only limit, so a
		// run reads the same on any machine.
		timeBudgetMs: options.seconds > 0 ? options.seconds * 1000 : Number.POSITIVE_INFINITY,
		});
		const solved = result.solved;
		const last = result.steps.length ? result.steps[result.steps.length - 1].state : result.best;
		rows.push({
			seed,
			solved,
			length: result.steps.length,
			summary: boardSummary(last),
			seconds: (result.elapsedMs / 1000).toFixed(1),
		});
		if (!options.quiet) {
			console.log(
				`${left(String(seed), 6)} ${left(solved ? 'found' : 'none', 6)} ${left(solved ? `${result.steps.length} moves` : '—', 10)} ${left(result.elapsedMs / 1000 + 's', 7)} ${boardSummary(last)}`
			);
		}
	}
	const found = rows.filter((row) => row.solved);
	const lengths = found.map((row) => row.length).sort((a, b) => a - b);
	console.log('');
	const heal = TOMB_RULES.levelUpHeal === 1 ? '' : `, level up heals ${TOMB_RULES.levelUpHeal}`;
	const cap =
		options.difficulty === 'hard'
			? ', no ceiling on a blow'
			: TOMB_RULES.levelDamageCap
				? `, no blow over ${TOMB_RULES.levelDamageCap}`
				: '';
	console.log(`${found.length}/${rows.length} solved at ${options.difficulty}${heal}${cap} (${Math.round((found.length / rows.length) * 100)}%)`);
	if (lengths.length) {
		const median = lengths[Math.floor(lengths.length / 2)];
		console.log(`move counts: min ${lengths[0]} · median ${median} · max ${lengths[lengths.length - 1]}`);
	}
}

function usage(): void {
	console.log(`usage
  npm run solve -- --seed 4242                one deal, printed move by move
  npm run solve -- --seeds 1-50               a range, one summary line each
  npm run solve -- --seed 4242 --goal boss    stop at the boss kill instead of 100%

options
  --difficulty easy|med|hard   free cells to begin with (default med)
  --nodes N                    states to examine (default 2000000)
  --beam N                     keep N boards per ply (default 300; 0 for best-first)
  --strategy hybrid|best|beam|dfs   search order (default hybrid: beam, then best-first)
  --heal N                     hearts a level up restores (default 1; tuning only)
  --cap N                      most hearts one kill may cost (default 0, no ceiling)
  --no-glyphboss               keep the boss king immovable, glyphs included
  --depth N                    longest line to follow (default 300)
  --time S                     seconds before giving up (default 120; 0 = no clock, states only)
  --steps N                    print only the first N moves of a line
  --quiet                      no progress line
  --help                       this text

results are a lower bound: a line found proves the deal winnable, finding none does not
prove it is not.`);
}

function main(): void {
	const argv = process.argv.slice(2);
	if (!argv.length || argv.includes('--help')) {
		usage();
		return;
	}
	const options = parse(argv);
	// A tuning hook for score experiments only: a sweep sets these to compare weightings without
	// editing the solver, and the game never sets them.
	for (const [name, key] of [
		['BOSS_OPEN', 'bossOpen'],
		['BOSS_DEPTH', 'bossDepth'],
		['KINGS', 'kings'],
		['POTION', 'potion'],
		['RESTOCK', 'restock'],
	] as const) {
		const value = process.env[name];
		if (value !== undefined) SCORE_WEIGHTS[key] = Number(value);
	}
	// A tuning knob for experiments only: the shipped game keeps the default of one heart.
	TOMB_RULES.levelUpHeal = options.heal;
	TOMB_RULES.levelDamageCap = options.cap;
	TOMB_RULES.glyphMoveBoss = options.glyphBoss;
	if (options.seeds) {
		range(options);
		return;
	}
	single(options);
}

main();
