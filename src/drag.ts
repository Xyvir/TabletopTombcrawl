/**
 * What a finger can pick up on the tomb, and where it may put it down. The board is the rules' own, so
 * the drag asks `tombcrawl` what is legal rather than keeping a second copy: every target here is a
 * question put to the same gate the click path uses, which is what keeps the two gestures in step.
 *
 * Pickpocket's window is why this lives apart from the component: the lift and both ends of the trade
 * are rules-shaped, and a drag regression should fail a unit test rather than need a browser hunt.
 */
import type { CardLocation, CardSequence } from './game/card/card';
import {
	attackPreview,
	canBuildOn,
	cardAt,
	cellCardMovable,
	cydsteppCanBury,
	emptyCells,
	isFaceDown,
	moveCapacity,
	swapPickpocket,
	tombRun,
	type TombState,
} from './tombcrawl';

export function tombDragRun(state: TombState, location: CardLocation): CardSequence | null {
	if (location.fixture === 'foundation') return null;
	if (location.fixture === 'cell') {
		// A plain scratch cell hands its card back; a drafted item waits for the chip to reach it.
		const index = location.data[0];
		const card = state.game.cells[index];
		if (!card) return null;
		// An armed CYDSTEPP can pick up a wounded card that would otherwise be locked.
		const cydsteppLift = state.armed?.kind === 'cydstepp';
		// Pickpocket's open window picks up the pocket's own card, spent or not, and an armed one can
		// too: the swap is draggable from either end, and the drop's own gate still decides which
		// hallway it may land on. Other pockets stay locked.
		const pickpocketLift =
			state.pickpocket === index || (state.armed?.kind === 'pickpocket' && state.armed.cell === index);
		const parked = !cellCardMovable(state, index) && !cydsteppLift && !pickpocketLift;
		if (parked && !attackPreview(state, location).legal) return null;
		return { location, cards: [card], peekOnly: false };
	}
	// BURNDAYRAZ hands you a single card however deeply it lies: reaching under cover is the
	// spell's whole point, and the spell only ever burns the one card it was given.
	if (state.armed?.kind === 'burndayraz') {
		const held = tombRun(state, location);
		return held.length ? { location, cards: [held[0]], peekOnly: false } : null;
	}
	const run = tombRun(state, location);
	const column = state.game.tableau[location.data[0]] ?? [];
	if (!run.length || run[run.length - 1] !== column[column.length - 1]) return null;
	return { location, cards: run, peekOnly: false };
}

export function tombDragTargets(state: TombState, location: CardLocation): string[] {
	const run = tombDragRun(state, location);
	if (!run) return [];
	const arm = state.armed;
	if (arm && arm.kind === 'pisorf') {
		// the whole pair goes into one open free cell
		return emptyCells(state).map((index) => `cell:${index}`);
	}
	if (arm && arm.kind === 'weytwut') {
		// a swap can take a card from any other column
		const fromColumn = location.fixture === 'cascade' ? location.data[0] : -1;
		return state.game.tableau
			.map((_, index) => index)
			.filter((index) => index !== fromColumn && (state.game.tableau[index]?.length ?? 0) > 0)
			.map((index) => `cascade:${index}`);
	}
	// Pickpocket's window trades from either end whether it is armed or not: the pocket's own card
	// dragged onto a hallway top, or a hallway card dragged onto the lit pocket. The arm changes
	// only how the click path begins the trade, so both gestures light the same targets.
	const pocket = arm?.kind === 'pickpocket' ? arm.cell : !arm ? state.pickpocket : null;
	if (pocket !== null) {
		// The trade from the other end: the pocket's own card in hand, every hallway top it may change
		// places with. The click path's own gate answers each column, so the columns a drop may land on
		// and the rule that answers it stay in step — a boss, a face-down top or a buried aim lights nothing.
		if (location.fixture === 'cell' && location.data[0] === pocket) {
			return state.game.tableau
				.map((column, index) => ({ column, index }))
				.filter(({ column }) => {
					const top = column[column.length - 1];
					return !!top && !isFaceDown(state, top) && !!swapPickpocket(state, pocket, top);
				})
				.map(({ index }) => `cascade:${index}`);
		}
		// The pocket is the target and the card is the aim, the reverse of every other armed drop: the card
		// has to be one exposed hallway card, since the swap takes the top of a pile and nothing under it.
		// Asking `swapPickpocket` itself is what keeps the lit target and the rule that answers it in step —
		// a boss, a face-down card or a buried one simply lights nothing.
		const card = location.fixture === 'cascade' ? cardAt(state.game, location) : null;
		const trades = !!card && run.cards.length === 1 && !!swapPickpocket(state, pocket, card);
		return trades ? [`cell:${pocket}`] : [];
	}
	const keys: string[] = [];
	// A drafted item left of the chip, or a wounded cell, has no board targets.
	const parked = location.fixture === 'cell' && !cellCardMovable(state, location.data[0]);
	// A run longer than the free cells can hold only moves with the sack open.
	const overfull = run.cards.length > moveCapacity(state) && arm?.kind !== 'sack';
	state.game.tableau.forEach((column, index) => {
		const target = { fixture: 'cascade' as const, data: [index, Math.max(0, column.length - 1)] };
		if ((!parked && !overfull && canBuildOn(state, run.cards, target)) || cydsteppCanBury(state, run.cards, target))
			keys.push(`cascade:${index}`);
	});
	if (!parked && !overfull && run.cards.length === 1) emptyCells(state).forEach((index) => keys.push(`cell:${index}`));
	if (attackPreview(state, location).legal) {
		state.game.foundations.forEach((_, index) => keys.push(`foundation:${index}`));
	}
	return keys;
}
