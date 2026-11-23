/**
 * Replays the hand-played lines in `solutions/` through the rules themselves.
 *
 * A transcript is a claim like a corpus seed, and a stronger one: it says not merely that a deal is winnable
 * but exactly how. These lines were found by a player, not by the solver, so they are the baseline a search
 * change is measured against — and a baseline is only worth having if it still replays. Each line is applied
 * through the same functions the game and the solver use, so an illegal step stops the run and names itself.
 *
 *   node scripts/run.mjs scripts/replay.ts          every file in solutions/
 *   FILES=solutions/737.json node scripts/run.mjs scripts/replay.ts   just one
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
	CLAUSES,
	FREE_CELL_COUNT,
	TOMB_RULES,
	armedClick,
	convertChip,
	armedDrop,
	attackWith,
	bossSlain,
	cardAt,
	createTombState,
	currentLevel,
	disarm,
	hp,
	revealFaceDown,
	tombMove,
	tombPar,
	tombRun,
	useAbility,
	type Difficulty,
	type TombState,
} from '../src/tombcrawl';
import { applyAction, type SolverAction } from '../src/solver';
import { describeStep } from '../src/notation';
import { shorthandCard, type CardLocation } from '../src/game/card/card';

/** Where a transcript is kept. Not gitignored: these are the baselines, so they live in the repository. */
const DIR = process.env.DIR ?? 'solutions';

interface Solution {
	seed: number;
	difficulty: Difficulty;
	goal: 'boss' | 'clear';
	moves: number;
	loadout: string;
	party: string[];
	found: string;
	source: string;
	note?: string;
	lines: string[];
	/**
	 * A solver line keeps the actions it took beside the printed one. Its vocabulary is wider than the
	 * transcript grammar (a `range` dig, an arm fused with its aim), so replaying the actions is what keeps
	 * a cached machine solution checkable rather than merely readable.
	 */
	actions?: SolverAction[];
}

/**
 * VARIANT=variants/conversions.json replays the stored lines under rules that are not shipped, so a
 * proposed change can be priced in keys before anybody commits to it.
 */
const variantFile = process.env.VARIANT;
if (variantFile) {
	const variant = JSON.parse(readFileSync(variantFile, 'utf8')) as {
		clauses?: Record<string, boolean>;
		rules?: Record<string, unknown>;
	};
	Object.assign(CLAUSES, variant.clauses ?? {});
	Object.assign(TOMB_RULES, variant.rules ?? {});
}

const column = (index: number, row = 0): CardLocation => ({ fixture: 'cascade', data: [index, row] });
const cell = (index: number): CardLocation => ({ fixture: 'cell', data: [index] });

function locOf(state: TombState, id: string): CardLocation {
	const card = state.game.cards.find((candidate) => shorthandCard(candidate) === id);
	if (!card) throw new Error(`no ${id} on the board`);
	return card.location;
}

function topOf(state: TombState, index: number): CardLocation {
	const pile = state.game.tableau[index] ?? [];
	return column(index, Math.max(0, pile.length - 1));
}

/** PISORF and WEYTWUT are aimed across two clicks; everything else covers its action in one. */
const aiming = (state: TombState) => state.armed?.kind === 'pisorf' || state.armed?.kind === 'weytwut';

function clickPair(state: TombState, a: CardLocation, b: CardLocation): TombState | null {
	const one = armedClick(state, a);
	return one ? armedClick(one, b) : null;
}

/** A carry is a plain move, or the two clicks of an aimed glyph if one is armed. */
function carry(state: TombState, from: CardLocation, to: CardLocation): TombState | null {
	if (aiming(state)) return clickPair(state, from, to);
	return armedDrop(state, from, to) ?? tombMove(state, from, to);
}

const SUIT_NAMES: Record<string, string> = { h: 'hearts', c: 'clubs', d: 'diamonds', s: 'spades' };

export function step(state: TombState, text: string): TombState | null {
	let m: RegExpExecArray | null;

	// home  AS -> spades foundation
	if ((m = /^home (\w+) -> (\w+) foundation$/.exec(text))) {
		const [, id, suit] = m;
		const at = locOf(state, id);
		if (SUIT_NAMES[id.slice(-1).toLowerCase()] !== suit) throw new Error(`${id} is not a ${suit} card`);
		return attackWith(state, at);
	}

	// dig   8D col 8 row 5
	if ((m = /^dig (\w+) col (\d+) row (\d+)$/.exec(text))) {
		const [, id, col, row] = m;
		const at = column(Number(col) - 1, Number(row) - 1);
		const card = cardAt(state.game, at);
		if (card && shorthandCard(card) !== id) throw new Error(`col ${col} row ${row} holds ${shorthandCard(card)}, not ${id}`);
		return revealFaceDown(state, at);
	}

	// drop  Purity (cell 4) -> col 2 — a Purity cast names the hallway it refogs, while a bare drop
	// puts the spell away unspent
	if ((m = /^drop (\w+) \(cell (\d+)\) -> col (\d+)$/.exec(text))) {
		const cast = state.armed;
		if (cast?.kind !== 'purity' || cast.cell !== Number(m[2]) - 1) throw new Error(`no Purity armed in cell ${m[2]}`);
		return armedClick(state, column(Number(m[3]) - 1));
	}
	// convert Remedy (cell 4) — the chip, clicked: the party card beside it is spent for one wound
	if ((m = /^convert (\w+) \(cell (\d+)\)$/.exec(text))) return convertChip(state);
	// arm   PISORF (cell 3)   /   drop  PISORF (cell 3)
	if ((m = /^arm (\w+) \(cell (\d+)\)$/.exec(text))) return useAbility(state, Number(m[2]) - 1);
	// use   Potion (cell 4)   — an item whose effect lands as it is used, rather than one left armed
	if ((m = /^use (\w+) \(cell (\d+)\)$/.exec(text))) return useAbility(state, Number(m[2]) - 1);
	if ((m = /^drop (\w+) \(cell (\d+)\)$/.exec(text))) return disarm(state);

	// swap  AS col 4 <-> 8D col 4
	if ((m = /^swap (\w+) col (\d+) <-> (\w+) col (\d+)$/.exec(text))) {
		return clickPair(state, locOf(state, m[1]), locOf(state, m[3]));
	}

	// park  9H col 8 -> cell 5
	if ((m = /^park (\w+) col (\d+) -> cell (\d+)$/.exec(text))) {
		const [, id, col, slot] = m;
		const from = locOf(state, id);
		if (from.fixture !== 'cascade' || from.data[0] !== Number(col) - 1) throw new Error(`${id} is not in col ${col}`);
		// A PISORF cast prints as the park of the card the deck lists first: the spell is still armed
		// across the transcript's invisible aim, so the grab is the named card when it heads the pair
		// and the card under it when the pair's top card is the one the deck lists first.
		if (state.armed?.kind === 'pisorf') {
			const column = state.game.tableau[from.data[0]] ?? [];
			const under = column[from.data[1] - 1];
			for (const spot of [from, ...(under ? [under.location] : [])]) {
				const next = armedDrop(state, spot, cell(Number(slot) - 1));
				if (next) return next;
			}
			return null;
		}
		return carry(state, from, cell(Number(slot) - 1));
	}

	// move  8D col 8 -> col 5      /      move  TD JS col 3 -> col 2      /      move  9C cell 6 -> col 2
	// A move that buries onto fog carries the " (onto fog)" suffix; it names no new information.
	if ((m = /^move ([\w ]+?) col (\d+) -> col (\d+)( \(onto fog\))?$/.exec(text))) {
		const [, ids, from, to] = m;
		// The line names the cards that went, and a hand takes hold of one end of that run — but the log
		// does not always print the same end first, so the handle is the card whose run is that long.
		const named = ids.trim().split(/\s+/);
		const inColumn = named.filter((id) => {
			const at = locOf(state, id);
			return at.fixture === 'cascade' && at.data[0] === Number(from) - 1;
		});
		const held =
			(inColumn.length ? inColumn : named).find((id) => tombRun(state, locOf(state, id)).length === named.length) ??
			named[named.length - 1];
		return carry(state, locOf(state, held), topOf(state, Number(to) - 1));
	}
	if ((m = /^move (\w+) cell (\d+) -> col (\d+)( \(onto fog\))?$/.exec(text))) {
		const [, id, slot, to] = m;
		const at = locOf(state, id);
		if (at.fixture !== 'cell' || at.data[0] !== Number(slot) - 1) throw new Error(`${id} is not in cell ${slot}`);
		return carry(state, at, topOf(state, Number(to) - 1));
	}

	// move  2C JS cell 3 -> cell 7 — a park plus the Mug it sets off, printed as one line off the
	// mugged card: the bandit went to a free pocket and the item slot's card went to the next one.
	// The transcript names the deck's first card first, so the grab is the named card itself for a
	// plain re-park and the cascade run's lowest card beside it for a park with a Mug.
	if ((m = /^move ([\w ]+?) cell (\d+) -> cell (\d+)$/.exec(text))) {
		const [, ids, a] = m;
		const named = ids.trim().split(/\s+/);
		const first = locOf(state, named[0]);
		if (first.fixture !== 'cell' || first.data[0] !== Number(a) - 1) throw new Error(`${named[0]} is not in cell ${a}`);
		const grabs = [first];
		const rest = named.slice(1).map((id) => locOf(state, id));
		const cols = new Set(rest.map((at) => (at.fixture === 'cascade' ? at.data[0] : -1)));
		if (rest.length && cols.size === 1 && !cols.has(-1)) {
			grabs.push(rest.reduce((low, at) => (at.data[1] < low.data[1] ? at : low), rest[0]));
		}
		const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
		for (const grab of grabs) {
			for (let e = 0; e < state.game.cells.length; e++) {
				if (state.game.cells[e]) continue;
				const next = tombMove(state, grab, cell(e));
				if (next && describeStep(state, next) && norm(describeStep(state, next)!) === norm(text)) return next;
			}
		}
		return null;
	}

	throw new Error(`cannot read the line "${text}"`);
}

/** A line the grammar does not know, read as a failure rather than a crash. */
export function tryStep(state: TombState, text: string): TombState | null {
	try {
		return step(state, text);
	} catch {
		return null;
	}
}

function check(file: string): boolean {
	const solution = JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')) as Solution;
	let state = createTombState(solution.seed, FREE_CELL_COUNT[solution.difficulty]);
	const dealt = [...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.map((entry) => entry.suit[0])
		.join('');

	const problems: string[] = [];
	if (dealt !== solution.loadout) problems.push(`deals ${dealt}, transcript says ${solution.loadout}`);
	if (solution.lines.length !== solution.moves) {
		problems.push(`${solution.lines.length} lines, claims ${solution.moves} moves`);
	}

	if (solution.actions?.length) {
		for (let index = 0; index < solution.actions.length && !problems.length; index++) {
			const next = applyAction(state, solution.actions[index]);
			if (!next) {
				problems.push(`action ${index + 1} is illegal: ${JSON.stringify(solution.actions[index])}`);
				break;
			}
			state = next;
		}
	}
	for (let index = 0; index < solution.lines.length && !problems.length && !solution.actions?.length; index++) {
		const line = solution.lines[index];
		if (process.env.DEBUG) {
			const board = state.game.tableau.map((pile, index) => `${index + 1}: ${pile.map((card) => (state.hidden.includes(shorthandCard(card)) ? `(${shorthandCard(card)})` : shorthandCard(card))).join(' ')}`);
			console.log(`  before ${index + 1} · hp ${hp(state)}/${state.game.cells.length} · armed ${state.armed?.kind ?? '-'} · ${board.join(' | ')} · cells ${state.game.cells.map((card) => (card ? shorthandCard(card) : '.')).join(' ')}`);
		}
		const next = tryStep(state, line);
		if (!next) {
			problems.push(`step ${index + 1} is illegal: "${line}"`);
			break;
		}
		// The transcript is printed off the board, so the parsed action has to print back as the
		// same line: a step that moves the right cards for the wrong reason is still the wrong step.
		const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
		const back = describeStep(state, next);
		if (!back || norm(back) !== norm(line)) {
			problems.push(`step ${index + 1} replays as "${back ?? '(nothing)'}", not "${line}"`);
			break;
		}
		state = next;
	}

	if (!problems.length) {
		if (solution.goal === 'clear' && tombPar(state) !== 0) problems.push(`ends at ${tombPar(state)} par, not a clear`);
		if (solution.goal === 'boss' && !bossSlain(state)) problems.push('ends with the boss still in the tomb');
	}

	const status = problems.length ? 'FAIL' : 'ok  ';
	console.log(
		`${status} ${file} · seed ${solution.seed} ${solution.difficulty} ${solution.loadout} · ${solution.lines.length} moves · ` +
			`par ${tombPar(state)} · hp ${hp(state)} · lvl ${currentLevel(state)}`
	);
	for (const problem of problems) console.log(`     ${problem}`);
	return problems.length === 0;
}

// The runner only runs as the entry: probes import step/tryStep without replaying the world.
if ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/replay.ts')) {
	const files = (process.env.FILES ?? '').split(',').filter(Boolean);
	const chosen = files.length ? files.map((path) => path.replace(`${DIR}/`, '')) : readdirSync(DIR).filter((name) => name.endsWith('.json'));
	const results = chosen.map(check);
	console.log(`${results.filter(Boolean).length}/${results.length} transcripts replay`);
	process.exit(results.every(Boolean) ? 0 : 1);
}
