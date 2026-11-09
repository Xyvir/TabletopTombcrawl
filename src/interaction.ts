import type { Card, CardLocation, CardSequence, PileSH } from './game/card/card';
import { getSequenceAt, isLocationEqual, shorthandCard } from './game/card/card';
import type { FreeCell } from './game/game';
import type { AvailableMove } from './game/move/move';

/** Pile shorthands for the four free cells, in board order. */
const CELL_PILES: PileSH[] = ['a', 'b', 'c', 'd'];

export type TapOutcome = 'moved' | 'shook' | 'selected' | 'noop';

export interface TapResult {
	game: FreeCell;
	outcome: TapOutcome;
}

const noop = (game: FreeCell): TapResult => ({ game, outcome: 'noop' });
const shook = (game: FreeCell): TapResult => ({ game, outcome: 'shook' });

export function isExposed(game: FreeCell, location: CardLocation): boolean {
	if (location.fixture !== 'cascade') return false;
	return location.data[1] === (game.tableau[location.data[0]]?.length ?? 0) - 1;
}

/** The valid run that a drag (or double click) would pick up, if there is one. */
export function runAt(game: FreeCell, location: CardLocation): CardSequence | null {
	if (location.fixture !== 'cascade' && location.fixture !== 'cell') return null;
	const run = getSequenceAt(game, location);
	return run.cards.length ? run : null;
}

function probe(game: FreeCell, location: CardLocation) {
	// touch() toggles an existing selection: on an already-selected card the second click of a
	// double click would deselect and do nothing. Reuse that selection; clear any other one first.
	if (game.selection) {
		if (isLocationEqual(game.selection.location, location)) {
			return { selected: game, moves: game.availableMoves ?? [] };
		}
		game = game.clearSelection();
	}
	const selected = game.setCursor(location).touch();
	return { selected, moves: selected.availableMoves ?? [] };
}

const playable = (moves: AvailableMove[]) =>
	moves.filter((move) => move.location.fixture === 'cascade' || move.location.fixture === 'foundation');

const cascades = (moves: AvailableMove[]) =>
	moves.filter((move) => move.location.fixture === 'cascade');

const foundationMoves = (moves: AvailableMove[]) =>
	moves.filter((move) => move.location.fixture === 'foundation');

function best<T extends { priority: number }>(moves: T[]): T {
	return moves.reduce((a, b) => (b.priority > a.priority ? b : a), moves[0]);
}

export function samePile(a: CardLocation, b: CardLocation): boolean {
	return a.fixture === b.fixture && a.data[0] === b.data[0];
}

/**
 * Undo back until the card is sitting at `location` again, so a landed single click can still be
 * turned into the double click it was meant to be. Stops safely at the start of the game.
 */
export function rewindTo(game: FreeCell, id: string, location: CardLocation, maxSteps = 12): FreeCell {
	let current = game;
	for (let step = 0; step < maxSteps; step++) {
		const card = current.cards.find((candidate) => shorthandCard(candidate) === id);
		if (card && samePile(card.location, location)) return current;
		const previous = current.undo({ toggleCursor: true });
		if (previous === current) return current;
		current = previous;
	}
	return current;
}

export interface HomeFlight {
	delay: number;
	duration: number;
}

/**
 * Successive auto-foundation cards must not fly at the same time. The card the user moved goes
 * first; the first automatic one waits out the warmup, and every later one starts only after the
 * previous flight has landed.
 */
export function foundationSchedule(
	ids: string[],
	primary: string | null | undefined,
	{ warmup, gap, flight, homeFlight }: { warmup: number; gap: number; flight: number; homeFlight: number }
): Map<string, HomeFlight> {
	const ordered = primary && ids.includes(primary) ? [primary, ...ids.filter((id) => id !== primary)] : ids;
	const schedule = new Map<string, HomeFlight>();
	let cursor = 0;
	ordered.forEach((id, i) => {
		const userCard = i === 0 && primary === id;
		const delay = userCard ? 0 : i === 0 ? warmup : cursor + gap;
		const duration = userCard ? flight : homeFlight;
		schedule.set(id, { delay, duration });
		cursor = delay + duration;
	});
	return schedule;
}

/**
 * Explicit "send everything home" action (the Auto to home button). Passive auto-foundation keeps
 * the `opp+1` safety limit and skips the card that is currently selected, so an explicit request
 * clears the selection and takes every legal foundation move.
 */
export function homeAll(game: FreeCell): FreeCell {
	const base = game.selection ? game.clearSelection() : game;
	return base.autoFoundationAll({ anytime: true, limit: 'none' });
}

export interface GhostHit {
	rect: { left: number; top: number; right: number; bottom: number };
	time: number;
}

/**
 * The card flies away from the cursor, so a second click of a double click can land on empty felt.
 * This decides whether such a click should still be credited to the card that just left.
 */
export function ghostClick(
	hit: GhostHit | null,
	x: number,
	y: number,
	now: number,
	windowMs = 150
): boolean {
	if (!hit) return false;
	if (now - hit.time > windowMs) return false;
	const { left, right, top, bottom } = hit.rect;
	return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Single click on a tableau card.
 *
 * Only the exposed card ever moves, and only by one card: runs are never auto-moved by a click.
 * A buried card with a real super-move available shakes (a hint to drag or double click);
 * a buried card with nothing available is simply selected.
 */
export function tapTableau(game: FreeCell, location: CardLocation): TapResult {
	if (location.fixture !== 'cascade') return noop(game);
	if (!game.tableau[location.data[0]]?.length) return noop(game);

	const { selected, moves } = probe(game, location);
	if (!selected.selection) return noop(game);

	if (!isExposed(game, location)) {
		if (selected.selection.cards.length > 1 && playable(moves).length) return shook(game);
		return { game: selected, outcome: 'selected' };
	}

	// A single click only ever builds on the tableau: never the foundation, never a free cell.
	const targets = cascades(moves);
	if (!targets.length) return shook(game);
	const next = selected.setCursor(best(targets).location).touch();
	if (next.previousAction.type !== 'move' && next.previousAction.type !== 'move-foundation') {
		return shook(game);
	}
	return { game: next, outcome: 'moved' };
}

/** Single click on a free-cell card: build it back onto the tableau, never send it home. */
export function tapCell(game: FreeCell, location: CardLocation): TapResult {
	if (location.fixture !== 'cell' || !game.cells[location.data[0]]) return noop(game);

	const { selected, moves } = probe(game, location);
	if (!selected.selection) return noop(game);

	const targets = cascades(moves);
	if (!targets.length) return shook(game);
	const next = selected.setCursor(best(targets).location).touch();
	if (next.previousAction.type !== 'move' && next.previousAction.type !== 'move-foundation') {
		return shook(game);
	}
	return { game: next, outcome: 'moved' };
}

/**
 * Double click: super-move the run at that card, or send a lone exposed card to the first
 * empty free cell (the usual FreeCell double-click convention).
 */
export function doubleTapTableau(game: FreeCell, location: CardLocation): TapResult {
	if (location.fixture !== 'cascade') return noop(game);

	const { selected, moves } = probe(game, location);
	if (!selected.selection) return noop(game);
	const run = selected.selection.cards;

	if (run.length > 1) {
		const targets = cascades(moves);
		if (!targets.length) return shook(game);
		const next = selected.setCursor(best(targets).location).touch();
		if (next.previousAction.type !== 'move') return shook(game);
		return { game: next, outcome: 'moved' };
	}

	// going home wins; the free cell is only the fallback for a card with no foundation move
	const home = foundationMoves(moves);
	if (home.length) {
		const next = selected.setCursor(home[0].location).touch();
		if (next.previousAction.type !== 'move' && next.previousAction.type !== 'move-foundation') {
			return shook(game);
		}
		return { game: next, outcome: 'moved' };
	}

	// a stale selection would hijack the engine's touch-based move, so park on a clean state
	const base = game.selection ? game.clearSelection() : game;
	const cellIndex = base.cells.findIndex((card) => !card);
	if (cellIndex === -1) return shook(game);
	const id = shorthandCard(run[0]);
	const next = base.$moveCardToPile(id, CELL_PILES[cellIndex]);
	// the move can chain an auto-foundation (which relabels the action as move-foundation), so
	// check that the card actually landed in a cell instead of trusting the action type
	const landed = next !== game && next.cells.some((card) => card && shorthandCard(card) === id);
	if (!landed) return shook(game);
	return { game: next, outcome: 'moved' };
}

/**
 * Double click on a free-cell card: home to the foundation when that's legal, otherwise back
 * onto the tableau. A single click only ever does the tableau build.
 */
export function doubleTapCell(game: FreeCell, location: CardLocation): TapResult {
	if (location.fixture !== 'cell' || !game.cells[location.data[0]]) return noop(game);

	const { selected, moves } = probe(game, location);
	if (!selected.selection) return noop(game);

	const home = foundationMoves(moves);
	const targets = home.length ? home : cascades(moves);
	if (!targets.length) return shook(game);

	const next = selected.setCursor(best(targets).location).touch();
	if (next.previousAction.type !== 'move' && next.previousAction.type !== 'move-foundation') {
		return shook(game);
	}
	return { game: next, outcome: 'moved' };
}

/**
 * Whether a double click on this card could do anything — used to decide if a click should
 * wait out the double-click window. Cards that can't be doubles act immediately.
 */
export function canDoubleTap(game: FreeCell, card: Card): boolean {
	if (card.location.fixture !== 'cascade') return false;
	const run = getSequenceAt(game, card.location);
	if (run.cards.length > 1) return true;
	if (!isExposed(game, card.location)) return false;
	const { moves } = probe(game, card.location);
	return foundationMoves(moves).length > 0 || game.cells.some((cell) => !cell);
}

/** What a drag starting at this location would pick up. */
export function draggableRun(game: FreeCell, location: CardLocation): CardSequence | null {
	if (location.fixture === 'foundation') return null;
	return runAt(game, location);
}

/** Legal drop locations for a drag that started at this location. */
export function dragMoves(game: FreeCell, location: CardLocation): AvailableMove[] {
	return probe(game, location).moves;
}

/**
 * Perform a drop. Returns null when the pile can't take the run, so the caller can snap back.
 * Drops are matched by pile (not exact slot), which keeps empty-column and cascade targets simple.
 */
export function moveRun(game: FreeCell, from: CardLocation, to: CardLocation): FreeCell | null {
	const { selected, moves } = probe(game, from);
	if (!selected.selection) return null;

	const target = moves.find((move) => samePile(move.location, to));
	if (!target) return null;

	const next = selected.setCursor(target.location).touch();
	if (next.previousAction.type !== 'move' && next.previousAction.type !== 'move-foundation') return null;
	return next;
}
