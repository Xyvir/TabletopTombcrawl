import { shorthandCard, type Card, type CardLocation } from './game/card/card';
import {
	DRAFT_CELL_COUNT,
	FREE_CELL_COUNT,
	ROLE_WORD,
	TOMB_RULES,
	currentLevel,
	hp,
	maxHp,
	parCleared,
	tombPar,
	type Difficulty,
	type TombState,
} from './tombcrawl';

/**
 * One vocabulary for reading a move, shared by the solver's printed lines and the playtest recorder,
 * so a human transcript can be compared with a simulated one line for line.
 */

/** Where a pile sits, the way a printed line reads it. */
export function where(location: CardLocation): string {
	if (location.fixture === 'cascade') return `col ${location.data[0] + 1}`;
	if (location.fixture === 'cell') return `cell ${location.data[0] + 1}`;
	return location.fixture;
}

export const cardName = (card: Card) => shorthandCard(card);

export const digLabel = (card: Card, at: CardLocation) =>
	`dig   ${cardName(card)} ${where(at)} row ${(at.data[1] ?? 0) + 1}`;
export const homeLabel = (card: Card) => `home  ${cardName(card)} -> ${card.suit} foundation`;
export const parkLabel = (card: Card, from: CardLocation, to: CardLocation) =>
	`park  ${cardName(card)} ${where(from)} -> ${where(to)}`;
export const armLabel = (name: string, slot: number) => `arm   ${name} (cell ${slot + 1})`;
export const disarmLabel = (name: string, slot: number) => `drop  ${name} (cell ${slot + 1})`;
export const useLabel = (name: string, slot: number) => `use   ${name} (cell ${slot + 1})`;

export function moveLabel(cards: Card[], from: CardLocation, to: CardLocation, buried: boolean): string {
	const what = cards.map(cardName).join(' ');
	return `move  ${what} ${where(from)} -> ${where(to)}${buried ? ' (onto fog)' : ''}`;
}

/** fog, hearts, level and par: the trailing columns every printed step ends with. */
export function boardSummary(state: TombState): string {
	return `fog ${state.hidden.length}  hp ${hp(state)}/${maxHp(state)}  lvl ${currentLevel(state)}  par ${tombPar(state)}  ${parCleared(state).toFixed(1)}%`;
}

const sameLocation = (a: CardLocation, b: CardLocation) =>
	a.fixture === b.fixture && a.data.join('.') === b.data.join('.');

/**
 * Read one committed change as a single line, the way the solver would print the same move. It works
 * from the two boards rather than from the action, so the recorder never needs to be told what the
 * player did: a click that hops a card and then sends it home reads as the home play it turned into.
 */
export function describeStep(before: TombState, after: TombState): string | null {
	const was = new Map(before.game.cards.map((card) => [shorthandCard(card), card]));
	const now = new Map(after.game.cards.map((card) => [shorthandCard(card), card]));
	const old = (card: Card) => was.get(shorthandCard(card));

	// A card that reached a foundation: the loudest thing that can happen in a move.
	const homed = [...now.values()].filter(
		(card) => card.location.fixture === 'foundation' && old(card)?.location.fixture !== 'foundation'
	);
	if (homed.length === 1) return homeLabel(homed[0]);
	if (homed.length > 1) return `home  ${homed.map(cardName).join(' ')} -> ${homed[0].suit} foundations`;

	// Fog lifting off a card.
	const dug = [...now.values()].filter(
		(card) => before.hidden.includes(shorthandCard(card)) && !after.hidden.includes(shorthandCard(card))
	);
	if (dug.length) {
		const card = dug[0];
		const at = old(card)?.location ?? card.location;
		return digLabel(card, at);
	}

	// Arming or dropping a spell: no card moves, so nothing above has caught it.
	const beforeArm = before.armed;
	const afterArm = after.armed;
	const changed =
		!!beforeArm !== !!afterArm ||
		(!!beforeArm && !!afterArm && (beforeArm.kind !== afterArm.kind || beforeArm.cell !== afterArm.cell));
	if (changed) {
		const arm = afterArm ?? beforeArm;
		const entry = arm
			? (after.draft.find((candidate) => candidate.cell === arm.cell) ??
				before.draft.find((candidate) => candidate.cell === arm.cell))
			: undefined;
		if (entry && arm) return afterArm ? armLabel(entry.name, arm.cell) : disarmLabel(entry.name, arm.cell);
	}

	// Cards that changed pile: a park into a cell, a build, a bury, a swap.
	const moved = [...now.values()].filter((card) => {
		const previous = old(card);
		return !!previous && !sameLocation(previous.location, card.location);
	});
	if (moved.length === 2) {
		const [a, b] = moved;
		const fromA = old(a)?.location;
		const fromB = old(b)?.location;
		if (fromA && fromB && sameLocation(fromA, b.location) && sameLocation(fromB, a.location))
			return `swap  ${cardName(a)} ${where(fromA)} <-> ${cardName(b)} ${where(fromB)}`;
	}
	if (moved.length) {
		const first = moved[0];
		const from = old(first)?.location ?? first.location;
		const under =
			first.location.fixture === 'cascade' && first.location.data[1] > 0
				? (after.game.tableau[first.location.data[0]]?.[first.location.data[1] - 1] ?? null)
				: null;
		const buried = !!under && before.hidden.includes(shorthandCard(under));
		if (first.location.fixture === 'cell' && from.fixture === 'cascade')
			return parkLabel(first, from, first.location);
		return moveLabel(moved, from, first.location, buried);
	}

	// An item spent without moving anything: a Potion drunk, an Elixir taken.
	const spent = after.draft.find((entry) => after.exhausted[entry.cell] && !before.exhausted[entry.cell]);
	if (spent) return useLabel(spent.name, spent.cell);

	return null;
}

/** A recorded step: the line to print and the board it arrived at. */
export interface RecordedStep {
	label: string;
	state: TombState;
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

function difficultyOf(state: TombState): string {
	const free = state.game.cells.length - DRAFT_CELL_COUNT;
	const found = (Object.keys(FREE_CELL_COUNT) as Difficulty[]).find((key) => FREE_CELL_COUNT[key] === free);
	return found ?? 'med';
}

/**
 * A pasteable session: the seed, the party, then one numbered line per move with the board it left,
 * in the same shape as `npm run solve` prints. Two transcripts of the same seed can be diffed.
 */
export function transcript(start: TombState, steps: RecordedStep[]): string {
	const free = start.game.cells.length - DRAFT_CELL_COUNT;
	const lines = [
		`seed ${start.seed}  ·  ${difficultyOf(start)} (${free} free cells)  ·  level up heals ${TOMB_RULES.levelUpHeal}`,
		`boss  ${start.bossSuit ? `${start.bossSuit} king` : 'not yet revealed'}  ·  party  ${party(start) || '(none)'}`,
		`fog ${start.hidden.length} cards face down · starting ${boardSummary(start)}`,
		'',
		'  #  action                                            fog  hp     lvl  par   cleared',
	];
	steps.forEach((step, index) => {
		lines.push(`${left(String(index + 1), 3)}  ${pad(step.label, 50)} ${boardSummary(step.state)}`);
	});
	lines.push('');
	const last = steps.length ? steps[steps.length - 1].state : start;
	lines.push(`final ${boardSummary(last)} · ${steps.length} moves`);
	return lines.join('\n');
}
