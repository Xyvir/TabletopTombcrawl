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
	armedClick,
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
	useAbility,
	type Difficulty,
	type TombState,
} from '../src/tombcrawl';
import { applyAction, type SolverAction } from '../src/solver';
import { shorthandCard, type CardLocation } from '../src/game/card/card';

/** Where a transcript is kept. Not gitignored: these are the baselines, so they live in the repository. */
const DIR = process.env.DIR ?? 'solutions';

// THIEF_FINISHED=0 reads the Thief's bounty the other way: a finished grave keeps the lead, so a line
// that only survives on the second or third pile stops replaying. Used to price that clause.
if (process.env.THIEF_FINISHED === '0') CLAUSES.thiefFinishedPile = false;

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

function step(state: TombState, text: string): TombState | null {
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

	// arm   PISORF (cell 3)   /   drop  PISORF (cell 3)
	if ((m = /^arm (\w+) \(cell (\d+)\)$/.exec(text))) return useAbility(state, Number(m[2]) - 1);
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
		return carry(state, from, cell(Number(slot) - 1));
	}

	// move  8D col 8 -> col 5      /      move  TD JS col 3 -> col 2      /      move  9C cell 6 -> col 2
	if ((m = /^move ([\w ]+?) col (\d+) -> col (\d+)$/.exec(text))) {
		const [, ids, from, to] = m;
		// A run reads top first, and the card a hand takes hold of is the bottom one of it.
		const held = ids.trim().split(' ').pop()!;
		const at = locOf(state, held);
		return carry(state, at, topOf(state, Number(to) - 1));
	}
	if ((m = /^move (\w+) cell (\d+) -> col (\d+)$/.exec(text))) {
		const [, id, slot, to] = m;
		const at = locOf(state, id);
		if (at.fixture !== 'cell' || at.data[0] !== Number(slot) - 1) throw new Error(`${id} is not in cell ${slot}`);
		return carry(state, at, topOf(state, Number(to) - 1));
	}

	throw new Error(`cannot read the line "${text}"`);
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
		const next = step(state, line);
		if (!next) {
			problems.push(`step ${index + 1} is illegal: "${line}"`);
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

const files = (process.env.FILES ?? '').split(',').filter(Boolean);
const chosen = files.length ? files.map((path) => path.replace(`${DIR}/`, '')) : readdirSync(DIR).filter((name) => name.endsWith('.json'));
const results = chosen.map(check);
console.log(`${results.filter(Boolean).length}/${results.length} transcripts replay`);
process.exit(results.every(Boolean) ? 0 : 1);
