import { describe, expect, test } from 'vitest';
import { encodeBoard } from './boardstate';
import { shorthandCard } from './game/card/card';
import { FREE_CELL_COUNT, createTombState } from './tombcrawl';
import { restoreState, snapshotState } from './session';

/**
 * A saved crawl is only worth anything if it comes back as the same board: the store keeps plain JSON, so
 * the round trip goes through a JSON clone the way IndexedDB's own structured clone would.
 */
describe('the saved crawl', () => {
	test('comes back as the same board, party and move log', () => {
		const dealt = createTombState(3595, FREE_CELL_COUNT.med);

		const saved = JSON.parse(JSON.stringify(snapshotState(dealt)));
		const back = restoreState(saved);

		expect(back.seed).toBe(dealt.seed);
		expect(back.hidden).toEqual(dealt.hidden);
		expect(back.wounded).toEqual(dealt.wounded);
		expect(back.exhausted).toEqual(dealt.exhausted);
		expect(back.draft).toEqual(dealt.draft);
		expect(back.bossId).toBe(dealt.bossId);
		expect(back.reserveHeld).toBe(dealt.reserveHeld);
		expect(back.trueBoss).toBe(dealt.trueBoss);
		// The board itself, drawn the same way: columns, pockets and the graves are all read off the game.
		expect(encodeBoard(back)).toBe(encodeBoard(dealt));
		expect(back.game.tableau.map((pile) => pile.map((card) => shorthandCard(card)))).toEqual(
			dealt.game.tableau.map((pile) => pile.map((card) => shorthandCard(card)))
		);
		expect(back.game.foundations.map((card) => (card ? shorthandCard(card) : null))).toEqual(
			dealt.game.foundations.map((card) => (card ? shorthandCard(card) : null))
		);
		// The move recorder: undo reads this log, so it has to survive the reload with the board.
		expect(back.game.history).toEqual(dealt.game.history);
		expect(back.game.previousAction).toEqual(dealt.game.previousAction);
	});

	test('keeps a spent pocket spent and a party card armed', () => {
		const dealt = createTombState(3595, FREE_CELL_COUNT.med);
		const spent = {
			...dealt,
			exhausted: dealt.exhausted.map((_, index) => index === dealt.draft[2].cell),
			armed: { kind: 'pisorf' as const, cell: dealt.draft[2].cell, first: dealt.draft[2].id },
		};

		const back = restoreState(JSON.parse(JSON.stringify(snapshotState(spent))));
		expect(back.exhausted).toEqual(spent.exhausted);
		expect(back.armed).toEqual(spent.armed);
	});
});
