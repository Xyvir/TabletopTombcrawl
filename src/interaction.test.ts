import { describe, expect, test } from 'vitest';
import { initializeDeckOfCards, shorthandCard, type CardLocation } from './game/card/card';
import { FreeCell } from './game/game';
import {
	canDoubleTap,
	doubleTapCell,
	doubleTapTableau,
	ghostClick,
	draggableRun,
	dragMoves,
	foundationSchedule,
	homeAll,
	moveRun,
	rewindTo,
	tapCell,
	tapTableau,
} from './interaction';

/** Build a board from shorthand, e.g. [['8S','7H','6C'], ['9D']]; unplaced cards stay in the deck. */
function makeGame(setup: string[][], cells: string[] = [], foundations: string[] = []) {
	const cards = initializeDeckOfCards();
	const byId = new Map<string, (typeof cards)[number]>();
	cards.forEach((card) => byId.set(shorthandCard(card), card));
	cards.forEach((card, i) => (card.location = { fixture: 'deck', data: [i] }));
	setup.forEach((column, col) =>
		column.forEach((rs, row) => {
			byId.get(rs)!.location = { fixture: 'cascade', data: [col, row] };
		})
	);
	cells.forEach((rs, i) => {
		byId.get(rs)!.location = { fixture: 'cell', data: [i] };
	});
	foundations.forEach((rs, i) => {
		byId.get(rs)!.location = { fixture: 'foundation', data: [i] };
	});
	return new FreeCell({ cellCount: 4, cascadeCount: 8, cards });
}

const column = (game: FreeCell) => game.tableau.map((cards) => cards.map(shorthandCard).join(' '));
const find = (game: FreeCell, rs: string) =>
	game.tableau.findIndex((cards) => cards.some((card) => shorthandCard(card) === rs));

describe('single click', () => {
	test('moves only the exposed card, never the run', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 2] });

		expect(result.outcome).toBe('moved');
		expect(column(result.game)[0]).toBe('8S 7H');
		expect(column(result.game)[1]).toBe('7D 6C');
	});

	test('shakes a buried card when a super-move is available', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('shook');
		expect(result.game).toBe(game);
	});

	test('selects a buried card when no run can move', () => {
		const game = makeGame([['5C', 'KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH'], ['JS']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('selected');
		expect(result.game.selection?.cards.map(shorthandCard)).toEqual(['5C']);
	});

	test('shakes an exposed card with nowhere to go', () => {
		const game = makeGame([['5C'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('shook');
		expect(result.game).toBe(game);
	});

	test('never parks a card in a free cell', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 2] });

		expect(result.game.cells.every((card) => card === null)).toBe(true);
	});

	test('never sends a card home on a single click', () => {
		const game = makeGame([['AC'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const result = tapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('shook');
		expect(result.game.printFoundation()).not.toContain('AC');
	});

	test('moves a card out of a free cell', () => {
		const game = makeGame([['8S', '7H'], ['9D']], ['6C']);
		const result = tapCell(game, { fixture: 'cell', data: [0] });

		expect(result.outcome).toBe('moved');
		expect(result.game.cells[0]).toBeNull();
		expect(column(result.game).join(' ')).toContain('7H 6C');
	});
});

describe('double click', () => {
	test('super-moves the whole run', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D'], ['5S']]);
		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('moved');
		expect(result.game.tableau[0]).toHaveLength(0);
		expect(column(result.game)[find(result.game, '8S')]).toBe('9D 8S 7H 6C');
	});

	test('sends a lone exposed card to the first empty free cell', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']]);
		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 2] });

		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0])).toBe('6C');
	});

	test('sends a lone card home to the foundation', () => {
		const game = makeGame([['AC'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.outcome).toBe('moved');
		expect(result.game.printFoundation()).toContain('AC');
	});

	test('prefers the foundation over a free cell', () => {
		const game = makeGame([['AC'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 0] });

		expect(result.game.cells.every((cell) => cell === null)).toBe(true);
		expect(result.game.printFoundation()).toContain('AC');
	});

	test('double click on a cell card goes home first', () => {
		const game = makeGame([['2H'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']], ['AC']);
		const result = doubleTapCell(game, { fixture: 'cell', data: [0] });

		expect(result.outcome).toBe('moved');
		expect(result.game.printFoundation()).toContain('AC');
		expect(result.game.cells[0]).toBeNull();
	});

	test('double click on a cell card falls back to the tableau', () => {
		const game = makeGame([['8S'], ['9D']], ['7H']);
		const result = doubleTapCell(game, { fixture: 'cell', data: [0] });

		expect(result.outcome).toBe('moved');
		expect(column(result.game)[0]).toBe('8S 7H');
	});

	test('goes to a free cell even when the card underneath auto-foundations', () => {
		const game = makeGame([['AD', 'TD'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 1] });

		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0]!)).toBe('TD');
		expect(result.game.printFoundation()).toContain('AD');
	});

	test('a rewind after that same build still reaches the free cell', () => {
		const game = makeGame([['AD', 'TD'], ['JC'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const location: CardLocation = { fixture: 'cascade', data: [0, 1] };

		const single = tapTableau(game, location);
		expect(single.outcome).toBe('moved');
		expect(single.game.previousAction.type).toBe('move-foundation');

		const back = rewindTo(single.game, 'TD', location);
		const result = doubleTapTableau(back, location);
		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0]!)).toBe('TD');
	});

	test('shakes when every free cell is taken', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']], ['AD', '2D', '3D', '4D']);
		expect(doubleTapTableau(game, { fixture: 'cascade', data: [0, 2] }).outcome).toBe('shook');
	});

	test('canDoubleTap reflects what a double click could do', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']]);

		expect(canDoubleTap(game, game.tableau[0][2])).toBe(true);
		expect(canDoubleTap(game, game.tableau[0][0])).toBe(true);

		const fromCell = makeGame([['8S'], ['9D']], ['7H']);
		expect(canDoubleTap(fromCell, fromCell.cells[0]!)).toBe(false);
	});
});

describe('drag and drop', () => {
	test('drags a whole run onto a build target', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']]);
		const run = draggableRun(game, { fixture: 'cascade', data: [0, 0] });
		expect(run?.cards.map(shorthandCard)).toEqual(['8S', '7H', '6C']);

		const next = moveRun(game, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] });
		expect(next).not.toBeNull();
		expect(column(next!)[1]).toBe('9D 8S 7H 6C');
	});

	test('drags a single exposed card', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const run = draggableRun(game, { fixture: 'cascade', data: [0, 2] });
		expect(run?.cards.map(shorthandCard)).toEqual(['6C']);

		const next = moveRun(game, { fixture: 'cascade', data: [0, 2] }, { fixture: 'cascade', data: [1, 0] });
		expect(column(next!)[1]).toBe('7D 6C');
	});

	test('drags a card into an empty column', () => {
		const game = makeGame([['8S', '7H'], ['9D']]);
		const next = moveRun(game, { fixture: 'cascade', data: [0, 1] }, { fixture: 'cascade', data: [4, 0] });
		expect(next).not.toBeNull();
		expect(column(next!)[4]).toBe('7H');
	});

	test('drags a card out of a free cell', () => {
		const game = makeGame([['8S'], ['9D']], ['7H']);
		const next = moveRun(game, { fixture: 'cell', data: [0] }, { fixture: 'cascade', data: [0, 0] });
		expect(next).not.toBeNull();
		expect(next!.cells[0]).toBeNull();
	});

	test('refuses an illegal drop so the caller can snap back', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D'], ['5S']]);
		const next = moveRun(game, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [2, 0] });
		expect(next).toBeNull();
	});

	test('still picks up a card with no tableau target', () => {
		const game = makeGame([['5C'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		expect(draggableRun(game, { fixture: 'cascade', data: [0, 0] })).not.toBeNull();
		const moves = dragMoves(game, { fixture: 'cascade', data: [0, 0] });
		expect(moves.filter((move) => move.location.fixture === 'cascade')).toHaveLength(0);
		expect(moveRun(game, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })).toBeNull();
	});
});

describe('rewind after a landed single click', () => {
	test('puts the card back where it was clicked', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const from: CardLocation = { fixture: 'cascade', data: [0, 2] };
		const moved = tapTableau(game, from);
		expect(moved.outcome).toBe('moved');
		expect(column(moved.game)[1]).toBe('7D 6C');

		const back = rewindTo(moved.game, '6C', from);
		expect(column(back)[0]).toBe('8S 7H 6C');
		expect(column(back)[1]).toBe('7D');
	});

	test('does nothing when the card is already there', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const from: CardLocation = { fixture: 'cascade', data: [0, 2] };
		expect(rewindTo(game, '6C', from)).toBe(game);
	});
});

describe('cards that are already selected', () => {
	test('single click still moves one', () => {
		const game = makeGame([['8S', '7H', '6C'], ['7D']]);
		const location: CardLocation = { fixture: 'cascade', data: [0, 2] };
		const selected = game.setCursor(location).touch();
		expect(selected.selection).not.toBeNull();

		const result = tapTableau(selected, location);
		expect(result.outcome).toBe('moved');
		expect(column(result.game)[1]).toBe('7D 6C');
	});

	test('double click still sends one to a free cell', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D']]);
		const location: CardLocation = { fixture: 'cascade', data: [0, 2] };
		const selected = game.setCursor(location).touch();
		expect(selected.selection).not.toBeNull();

		const result = doubleTapTableau(selected, location);
		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0]!)).toBe('6C');
	});

	test('a stale selection elsewhere does not hijack the click', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D'], ['5S']]);
		// leave a selection on a different column, then double click the 6C
		const stale = game.setCursor({ fixture: 'cascade', data: [2, 0] }).touch();
		expect(stale.selection).not.toBeNull();

		const result = doubleTapTableau(stale, { fixture: 'cascade', data: [0, 2] });
		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0]!)).toBe('6C');
	});
});

describe('foundation flights take turns', () => {
	const opts = { warmup: 240, gap: 40, flight: 190, homeFlight: 250 };

	test('the user card flies first, the automatic ones follow', () => {
		const schedule = foundationSchedule(['2C', 'AC', '3C'], '2C', opts);
		expect(schedule.get('2C')).toEqual({ delay: 0, duration: 190 });
		expect(schedule.get('AC')!.delay).toBeGreaterThanOrEqual(190);
		const ac = schedule.get('AC')!;
		expect(schedule.get('3C')!.delay).toBeGreaterThanOrEqual(ac.delay + ac.duration);
	});

	test('no two foundation flights overlap', () => {
		const schedule = foundationSchedule(['AC', '2C', '3C', '4C'], null, opts);
		const flights = [...schedule.values()].sort((a, b) => a.delay - b.delay);
		for (let i = 1; i < flights.length; i++) {
			expect(flights[i].delay).toBeGreaterThanOrEqual(flights[i - 1].delay + flights[i - 1].duration);
		}
	});
});

describe('ghost clickbox after a card has flown', () => {
	const rect = { left: 100, top: 100, right: 180, bottom: 220 };

	test('credits a click inside the old card box while the window is open', () => {
		expect(ghostClick({ rect, time: 1000 }, 140, 160, 1100)).toBe(true);
	});

	test('expires after the window', () => {
		expect(ghostClick({ rect, time: 1000 }, 140, 160, 1160)).toBe(false);
	});

	test('ignores clicks outside the old card box', () => {
		expect(ghostClick({ rect, time: 1000 }, 300, 160, 1050)).toBe(false);
	});

	test('does nothing when no card has just moved', () => {
		expect(ghostClick(null, 140, 160, 1050)).toBe(false);
	});
});

describe('double click when a single click has nothing to do', () => {
	test('still sends the card to the first free cell', () => {
		// no build target, no empty column, foundation wants an ace: a single click can only shake
		const game = makeGame([['TC'], ['KS'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		expect(tapTableau(game, { fixture: 'cascade', data: [0, 0] }).outcome).toBe('shook');

		const result = doubleTapTableau(game, { fixture: 'cascade', data: [0, 0] });
		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0])).toBe('TC');
	});
});

describe('auto to home', () => {
	test('sends a playable cell card home even when the passive limit holds it', () => {
		const game = makeGame([['KS'], ['KH'], ['KC'], ['KD'], [], [], [], []], ['9S'], ['8S']);
		// the passive chain keeps the opp+1 safety limit and leaves the nine sitting in the cell
		expect(game.autoFoundationAll({ anytime: true })).toBe(game);

		const next = homeAll(game);
		expect(shorthandCard(next.foundations[0]!)).toBe('9S');
		expect(next.cells[0]).toBe(null);
	});

	test('a selected cell card is still sent home', () => {
		const game = makeGame([['KS'], ['KH'], ['KC'], ['KD'], [], [], [], []], ['9S'], ['8S']);
		const selected = game.setCursor({ fixture: 'cell', data: [0] }).touch();
		expect(selected.selection).toBeTruthy();

		const next = homeAll(selected);
		expect(shorthandCard(next.foundations[0]!)).toBe('9S');
	});
});

describe('parking in a free cell', () => {
	test('a stale selection does not hijack the park', () => {
		const game = makeGame([['8S', '7H', '6C'], ['9D'], ['KD'], ['KH'], ['KC'], ['QS'], ['QD'], ['QH']]);
		const selected = game.setCursor({ fixture: 'cascade', data: [1, 0] }).touch();

		const result = doubleTapTableau(selected, { fixture: 'cascade', data: [0, 2] });
		expect(result.outcome).toBe('moved');
		expect(shorthandCard(result.game.cells[0]!)).toBe('6C');
	});
});
