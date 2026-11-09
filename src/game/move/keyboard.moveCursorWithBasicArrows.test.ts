import { describe, expect, test } from 'vitest';
import { CardLocation } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { moveCursorWithBasicArrows } from '@/game/move/keyboard';

describe('keyboard.moveCursorWithBasicArrows', () => {
	describe('cell', () => {
		describe('going off-bottom moves to cascade', () => {
			// moves to last card of cascade
			test('single', () => {
				const game = new FreeCell({ cursor: { fixture: 'cell', data: [2] } }).dealAll();
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 99] },
				});
			});

			// moves to top of sequence (at the bottom of the cascade)
			// 3-2-A,9-8-7
			test.todo('sequence');

			test('empty', () => {
				const game = new FreeCell({ cursor: { fixture: 'cell', data: [2] } });
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 99] },
				});
			});
		});

		describe('size mismatch: cell + foundation < tableau', () => {
			// (cd | stop | fond)
			//  01   2345   6789
			const game = new FreeCell({ cascadeCount: 10, cellCount: 2 }).dealAll();
			test('board', () => {
				expect(game.cells.length + game.foundations.length).toBe(6);
				expect(game.tableau.length).toBe(10);
			});

			test.each([0, 1])('cell %d', (d0: number) => {
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cell', data: [d0] }), 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [d0, 99] },
				});
			});
		});

		describe('size mismatch: cell + foundation > tableau', () => {
			const game = new FreeCell({ cascadeCount: 5, cellCount: 4 }).dealAll();
			test('board', () => {
				expect(game.cells.length + game.foundations.length).toBe(8);
				expect(game.tableau.length).toBe(5);
			});

			test.each([0, 1, 2, 3])('cell %d', (d0: number) => {
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cell', data: [d0] }), 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [d0, 99] },
				});
			});
		});

		describe('size mismatch: cell > tableau', () => {
			const game = new FreeCell({ cascadeCount: 4, cellCount: 6 }).dealAll();
			test('board', () => {
				expect(game.cells.length + game.foundations.length).toBe(10);
				expect(game.cells.length).toBe(6);
				expect(game.tableau.length).toBe(4);
			});

			test.each([0, 1, 2, 3, 4, 5])('cell %d', (d0: number) => {
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cell', data: [d0] }), 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [d0, 99] },
				});
			});
		});
	});

	describe('foundation', () => {
		describe('going off-bottom moves to cascade', () => {
			test('single', () => {
				const game = new FreeCell({ cursor: { fixture: 'foundation', data: [1] } }).dealAll();
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [5, 99] },
				});
				expect(game.tableau[5].length).toBe(6);
			});

			// moves to top of sequence (at the bottom of the cascade)
			// 3-2-A,9-8-7
			test.todo('sequence');

			test('empty', () => {
				const game = new FreeCell({ cursor: { fixture: 'foundation', data: [1] } });
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [5, 99] },
				});
				expect(game.tableau[2].length).toBe(0);
			});
		});

		describe('size mismatch: cell + foundation < tableau', () => {
			// (cd | stop | fond)
			//  01   2345   6789
			const game = new FreeCell({ cascadeCount: 10, cellCount: 2 }).dealAll();
			test('board', () => {
				expect(game.cells.length + game.foundations.length).toBe(6);
				expect(game.tableau.length).toBe(10);
			});

			test.each`
				startD0 | endD0
				${0}    | ${6}
				${1}    | ${7}
				${2}    | ${8}
				${3}    | ${9}
			`('foundation $startD0', ({ startD0, endD0 }: { startD0: number; endD0: number }) => {
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'foundation', data: [startD0] }), 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [endD0, 99] },
				});
			});
		});

		describe('size mismatch: cell + foundation > tableau', () => {
			const game = new FreeCell({ cascadeCount: 5, cellCount: 4 }).dealAll();
			test('board', () => {
				expect(game.cells.length + game.foundations.length).toBe(8);
				expect(game.tableau.length).toBe(5);
			});

			test.each`
				startD0 | endD0
				${0}    | ${1}
				${1}    | ${2}
				${2}    | ${3}
				${3}    | ${4}
			`('foundation $startD0', ({ startD0, endD0 }: { startD0: number; endD0: number }) => {
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'foundation', data: [startD0] }), 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [endD0, 99] },
				});
			});
		});
	});

	describe('cascade', () => {
		describe('within left and right', () => {
			test('single', () => {
				const game = new FreeCell().dealAll().setCursor({ fixture: 'cascade', data: [0, 2] });

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [0, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [1, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [1, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [5, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [6, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [6, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [7, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [7, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [6, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [6, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [5, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [2, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [1, 2] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [1, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [0, 2] },
				});
			});

			test('empty', () => {
				const game = new FreeCell().setCursor({ fixture: 'cascade', data: [0, 2] });

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [0, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [1, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [1, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [5, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [6, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [6, 2] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [7, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [7, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [6, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [6, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [5, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [2, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [1, 0] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [1, 2] }), 'left')).toEqual({
					action: { text: 'cursor left', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [0, 0] },
				});
			});

			test('bottom of cascade when smaller', () => {
				const game = new FreeCell().dealAll();
				expect(game.tableau[3].length).toBe(7);
				expect(game.tableau[4].length).toBe(6);

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'cascade', data: [3, 6] }), 'right')).toEqual({
					action: { text: 'cursor right', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [4, 6] },
				});
			});
		});

		describe('going off-top', () => {
			test('moves to cell', () => {
				expect(moveCursorWithBasicArrows(new FreeCell().dealAll().setCursor({ fixture: 'cascade', data: [2, 0] }), 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cell', data: [2] },
				});
			});

			test('moves to foundation', () => {
				// 0 1 2 3 0 1 2 3
				// 0 1 2 3 4 5 6 7
				expect(moveCursorWithBasicArrows(new FreeCell().dealAll().setCursor({ fixture: 'cascade', data: [5, 0] }), 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'foundation', data: [1] },
				});

				// 0 1 2 3 4 5 0 1 2 3
				// 0 1 2 3 4 5 6 7 8 9
				expect(
					moveCursorWithBasicArrows(new FreeCell({ cellCount: 6, cascadeCount: 10 }).dealAll().setCursor({ fixture: 'cascade', data: [8, 0] }), 'up')
				).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'foundation', data: [2] },
				});
			});

			describe('size mismatch: cell + foundation < tableau', () => {
				// (cd | stop | fond)
				//  01   2345   6789
				test.each`
					col  | location                                | actionText
					${0} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor up wrap'}
					${1} | ${{ fixture: 'cell', data: [1] }}       | ${'cursor up wrap'}
					${2} | ${{ fixture: 'cell', data: [1] }}       | ${'cursor up wrap'}
					${3} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor stop 4⡀ KC'}
					${4} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor stop 5⡀ QS'}
					${5} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor up wrap'}
					${6} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor up wrap'}
					${7} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor up wrap'}
					${8} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor up wrap'}
					${9} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor up wrap'}
				`('col $col', ({ col, location, actionText }: { col: number; location: CardLocation; actionText: string }) => {
					expect(
						moveCursorWithBasicArrows(new FreeCell({ cellCount: 2, cascadeCount: 10 }).dealAll().setCursor({ fixture: 'cascade', data: [col, 0] }), 'up')
					).toEqual({
						action: { text: actionText, type: 'cursor' },
						cursor: location,
					});
				});
			});

			test.todo('size mismatch: cell + foundation > tableau');
		});

		describe('going off-bottom', () => {
			test('moves to deck', () => {
				const game = new FreeCell({ cursor: { fixture: 'cascade', data: [2, 0] } });
				expect(game.tableau[2].length).toBe(0);
				expect(game.deck.length).toBe(52);
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'deck', data: [49] },
				});
			});

			// i.e. if the deck has 1 card in it, and the cursor is in the middle of the tableau
			test('moves when deck is short', () => {
				const game = new FreeCell({ cascadeCount: 10 }).dealAll({ demo: true, keepDeck: true }).setCursor({ fixture: 'cascade', data: [9, 4] });
				expect(game.tableau[9].length).toBe(4);
				expect(game.deck.length).toBe(8);
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor down wrap', type: 'cursor' },
					cursor: { fixture: 'deck', data: [-2] },
				});

				// confirm that the cursor will be clamped
				// XXX (test) this file shouldn't have this
				expect(game.moveCursor('down').cursor).toEqual({ fixture: 'deck', data: [0] });
			});

			test('stops when deck empty', () => {
				const game = new FreeCell().dealAll().setCursor({ fixture: 'cascade', data: [2, 6] });
				expect(game.tableau[2].length).toBe(7);
				expect(moveCursorWithBasicArrows(game, 'down')).toEqual({
					action: { text: 'cursor stop 3⡆ AD', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 6] },
				});
			});
		});
	});

	describe('deck', () => {
		describe('going off-top moves to cascade', () => {
			test('single', () => {
				let game = new FreeCell({ cursor: { fixture: 'deck', data: [5] } });

				game = game.dealAll({ demo: true, keepDeck: true });
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C             \n' +
						':d 2S 2H>2D 2C AS AH AD AC \n' +
						' deal 44 cards'
				);
				expect(game.cursor).toEqual({ fixture: 'deck', data: [5] });

				expect(moveCursorWithBasicArrows(game, 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 99] },
				});
			});

			// moves to top of sequence (at the bottom of the cascade)
			// 3-2-A,9-8-7
			test.todo('sequence');

			test('empty', () => {
				const game = new FreeCell({ cursor: { fixture: 'deck', data: [49] } });
				expect(moveCursorWithBasicArrows(game, 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [2, 99] },
				});
			});

			test('size mismatch: tableau !== deck', () => {
				const game = new FreeCell();
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'deck', data: [15] }), 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [36, 99] },
				});

				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'deck', data: [51] }), 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [0, 99] },
				});
				expect(moveCursorWithBasicArrows(game.setCursor({ fixture: 'deck', data: [0] }), 'up')).toEqual({
					action: { text: 'cursor up wrap', type: 'cursor' },
					cursor: { fixture: 'cascade', data: [51, 99] },
				});
			});
		});
	});

	describe('lets over do it', () => {
		describe('4 4 | 8', () => {
			describe('not dealt', () => {
				const game = new FreeCell();
				describe('left', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [3] }} | ${'cursor left wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [0] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cell', data: [3] }}       | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor left'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [51] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [32] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [31] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [14] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [13] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [1] }}       | ${'cursor left'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'left')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('right', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [3] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'foundation', data: [0] }} | ${'cursor right wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor right wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [50] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [49] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [30] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [29] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [12] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [11] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [51] }}      | ${'cursor right wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'right')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('up', () => {
					test.each`
						start                                   | end                                       | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [0] }}         | ${'cursor stop a'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [1] }}         | ${'cursor stop b'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [2] }}         | ${'cursor stop c'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [3] }}         | ${'cursor stop d'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor stop h⡀'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor stop h⡁'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor stop h⡂'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor stop h⡃'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cell', data: [0] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cell', data: [1] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cell', data: [2] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cell', data: [3] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'cascade', data: [0, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'cascade', data: [1, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'cascade', data: [20, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'cascade', data: [21, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'cascade', data: [38, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'cascade', data: [39, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'cascade', data: [50, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'cascade', data: [51, 99] }} | ${'cursor up wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'up')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('down', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cascade', data: [3, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cascade', data: [4, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'cascade', data: [5, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'cascade', data: [6, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cascade', data: [7, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'deck', data: [51] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'deck', data: [50] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'deck', data: [49] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'deck', data: [48] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'deck', data: [47] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'deck', data: [46] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'deck', data: [45] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'deck', data: [44] }}       | ${'cursor down wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [51] }}       | ${'cursor stop k⡳ KS'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [50] }}       | ${'cursor stop k⡲ KH'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [31] }}       | ${'cursor stop k⡟ 8S'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [30] }}       | ${'cursor stop k⡞ 8H'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [13] }}       | ${'cursor stop k⡍ 4D'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [12] }}       | ${'cursor stop k⡌ 4C'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [1] }}        | ${'cursor stop k⡁ AD'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}        | ${'cursor stop k⡀ AC'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'down')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});
			});

			describe('dealt', () => {
				const game = new FreeCell().dealAll();
				describe('left', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [3] }} | ${'cursor left wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [0] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cell', data: [3] }}       | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 6] }} | ${{ fixture: 'cascade', data: [7, 6] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 6] }} | ${{ fixture: 'cascade', data: [0, 6] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 6] }} | ${{ fixture: 'cascade', data: [1, 6] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 6] }} | ${{ fixture: 'cascade', data: [2, 6] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [4, 5] }} | ${{ fixture: 'cascade', data: [3, 5] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [5, 5] }} | ${{ fixture: 'cascade', data: [4, 5] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [6, 5] }} | ${{ fixture: 'cascade', data: [5, 5] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [7, 5] }} | ${{ fixture: 'cascade', data: [6, 5] }} | ${'cursor left'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'left')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('right', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [3] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'foundation', data: [0] }} | ${'cursor right wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 6] }} | ${{ fixture: 'cascade', data: [1, 6] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 6] }} | ${{ fixture: 'cascade', data: [2, 6] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 6] }} | ${{ fixture: 'cascade', data: [3, 6] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 6] }} | ${{ fixture: 'cascade', data: [4, 6] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [4, 5] }} | ${{ fixture: 'cascade', data: [5, 5] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [5, 5] }} | ${{ fixture: 'cascade', data: [6, 5] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [6, 5] }} | ${{ fixture: 'cascade', data: [7, 5] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [7, 5] }} | ${{ fixture: 'cascade', data: [0, 5] }} | ${'cursor right wrap'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'right')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('up', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [0] }}        | ${'cursor stop a'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [1] }}        | ${'cursor stop b'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [2] }}        | ${'cursor stop c'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [3] }}        | ${'cursor stop d'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [0] }}  | ${'cursor stop h⡀'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [1] }}  | ${'cursor stop h⡁'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [2] }}  | ${'cursor stop h⡂'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [3] }}  | ${'cursor stop h⡃'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cell', data: [0] }}        | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cell', data: [1] }}        | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cell', data: [2] }}        | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cell', data: [3] }}        | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'foundation', data: [0] }}  | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'foundation', data: [1] }}  | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'foundation', data: [2] }}  | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'foundation', data: [3] }}  | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [0, 6] }} | ${{ fixture: 'cascade', data: [0, 5] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [1, 6] }} | ${{ fixture: 'cascade', data: [1, 5] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [2, 6] }} | ${{ fixture: 'cascade', data: [2, 5] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [3, 6] }} | ${{ fixture: 'cascade', data: [3, 5] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [4, 5] }} | ${{ fixture: 'cascade', data: [4, 4] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [5, 5] }} | ${{ fixture: 'cascade', data: [5, 4] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [6, 5] }} | ${{ fixture: 'cascade', data: [6, 4] }}  | ${'cursor up'}
						${{ fixture: 'cascade', data: [7, 5] }} | ${{ fixture: 'cascade', data: [7, 4] }}  | ${'cursor up'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor up wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'up')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('down', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cascade', data: [3, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cascade', data: [4, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'cascade', data: [5, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'cascade', data: [6, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cascade', data: [7, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [0, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [1, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [2, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [3, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [4, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [5, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [6, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [7, 1] }}  | ${'cursor down'}
						${{ fixture: 'cascade', data: [0, 6] }} | ${{ fixture: 'cascade', data: [0, 6] }}  | ${'cursor stop 1⡆ AS'}
						${{ fixture: 'cascade', data: [1, 6] }} | ${{ fixture: 'cascade', data: [1, 6] }}  | ${'cursor stop 2⡆ AH'}
						${{ fixture: 'cascade', data: [2, 6] }} | ${{ fixture: 'cascade', data: [2, 6] }}  | ${'cursor stop 3⡆ AD'}
						${{ fixture: 'cascade', data: [3, 6] }} | ${{ fixture: 'cascade', data: [3, 6] }}  | ${'cursor stop 4⡆ AC'}
						${{ fixture: 'cascade', data: [4, 5] }} | ${{ fixture: 'cascade', data: [4, 5] }}  | ${'cursor stop 5⡅ 2S'}
						${{ fixture: 'cascade', data: [5, 5] }} | ${{ fixture: 'cascade', data: [5, 5] }}  | ${'cursor stop 6⡅ 2H'}
						${{ fixture: 'cascade', data: [6, 5] }} | ${{ fixture: 'cascade', data: [6, 5] }}  | ${'cursor stop 7⡅ 2D'}
						${{ fixture: 'cascade', data: [7, 5] }} | ${{ fixture: 'cascade', data: [7, 5] }}  | ${'cursor stop 8⡅ 2C'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}        | ${'cursor stop k'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'down')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});
			});
		});

		describe('1 4 | 10 (cell + foundation < tableau)', () => {
			describe('not dealt', () => {
				const game = new FreeCell({ cellCount: 1, cascadeCount: 10 });
				describe('left', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [3] }} | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [9, 0] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [8, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [9, 0] }} | ${{ fixture: 'cascade', data: [8, 0] }} | ${'cursor left'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [51] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [32] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [31] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [14] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [13] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [1] }}       | ${'cursor left'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'left')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('right', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [0] }} | ${'cursor right wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [5, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'cascade', data: [6, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'cascade', data: [8, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [8, 0] }} | ${{ fixture: 'cascade', data: [9, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [9, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor right wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [50] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [49] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [30] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [29] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [12] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [11] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [51] }}      | ${'cursor right wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'right')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('up', () => {
					test.each`
						start                                   | end                                       | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [0] }}         | ${'cursor stop a'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor stop h⡀'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor stop h⡁'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor stop h⡂'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor stop h⡃'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cell', data: [0] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cell', data: [0] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }}   | ${'cursor stop 3'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }}   | ${'cursor stop 4'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }}   | ${'cursor stop 5'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [8, 0] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [9, 0] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'cascade', data: [0, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'cascade', data: [1, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'cascade', data: [20, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'cascade', data: [21, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'cascade', data: [38, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'cascade', data: [39, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'cascade', data: [50, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'cascade', data: [51, 99] }} | ${'cursor up wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'up')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('down', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cascade', data: [6, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'cascade', data: [7, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'cascade', data: [8, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cascade', data: [9, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'deck', data: [51] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'deck', data: [50] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'deck', data: [49] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'deck', data: [48] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'deck', data: [47] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [5, 0] }} | ${{ fixture: 'deck', data: [46] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [6, 0] }} | ${{ fixture: 'deck', data: [45] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [7, 0] }} | ${{ fixture: 'deck', data: [44] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [8, 0] }} | ${{ fixture: 'deck', data: [43] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [9, 0] }} | ${{ fixture: 'deck', data: [42] }}       | ${'cursor down wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [51] }}       | ${'cursor stop k⡳ KS'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [50] }}       | ${'cursor stop k⡲ KH'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [31] }}       | ${'cursor stop k⡟ 8S'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [30] }}       | ${'cursor stop k⡞ 8H'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [13] }}       | ${'cursor stop k⡍ 4D'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [12] }}       | ${'cursor stop k⡌ 4C'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [1] }}        | ${'cursor stop k⡁ AD'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}        | ${'cursor stop k⡀ AC'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'down')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});
			});

			test.todo('dealt');
		});

		describe('3 4 | 5 (cell + foundation > tableau)', () => {
			describe('not dealt', () => {
				const game = new FreeCell({ cellCount: 3, cascadeCount: 5 });
				describe('left', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [3] }} | ${'cursor left wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [0] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor left'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cell', data: [2] }}       | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor left'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [51] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [32] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [31] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [14] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [13] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [1] }}       | ${'cursor left'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'left')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('right', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'foundation', data: [0] }} | ${'cursor right wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [4, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor right wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [50] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [49] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [30] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [29] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [12] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [11] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [51] }}      | ${'cursor right wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'right')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('up', () => {
					test.each`
						start                                   | end                                       | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [0] }}         | ${'cursor stop a'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [1] }}         | ${'cursor stop b'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [2] }}         | ${'cursor stop c'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor stop h⡀'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor stop h⡁'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor stop h⡂'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor stop h⡃'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cell', data: [0] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cell', data: [1] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cell', data: [2] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'cascade', data: [0, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'cascade', data: [1, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'cascade', data: [20, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'cascade', data: [21, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'cascade', data: [38, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'cascade', data: [39, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'cascade', data: [50, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'cascade', data: [51, 99] }} | ${'cursor up wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'up')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('down', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'cascade', data: [3, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cascade', data: [4, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'deck', data: [51] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'deck', data: [50] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'deck', data: [49] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'deck', data: [48] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [4, 0] }} | ${{ fixture: 'deck', data: [47] }}       | ${'cursor down wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [51] }}       | ${'cursor stop k⡳ KS'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [50] }}       | ${'cursor stop k⡲ KH'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [31] }}       | ${'cursor stop k⡟ 8S'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [30] }}       | ${'cursor stop k⡞ 8H'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [13] }}       | ${'cursor stop k⡍ 4D'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [12] }}       | ${'cursor stop k⡌ 4C'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [1] }}        | ${'cursor stop k⡁ AD'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}        | ${'cursor stop k⡀ AC'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'down')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});
			});

			test.todo('dealt');
		});

		test.todo('6 4 | 4 (cell > tableau)');
		describe('6 4 | 4 (cell > tableau)', () => {
			describe('not dealt', () => {
				const game = new FreeCell({ cellCount: 6, cascadeCount: 4 });
				describe('left', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'foundation', data: [3] }} | ${'cursor left wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [0] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [4] }}       | ${{ fixture: 'cell', data: [3] }}       | ${'cursor left'}
						${{ fixture: 'cell', data: [5] }}       | ${{ fixture: 'cell', data: [4] }}       | ${'cursor left'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cell', data: [5] }}       | ${'cursor left wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [0] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor left'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor left wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor left'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor left'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [51] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [32] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [31] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [14] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [13] }}      | ${'cursor left'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [2] }}       | ${'cursor left'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [1] }}       | ${'cursor left'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'left')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('right', () => {
					test.each`
						start                                   | end                                     | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [1] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [2] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [3] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [4] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [4] }}       | ${{ fixture: 'cell', data: [5] }}       | ${'cursor right'}
						${{ fixture: 'cell', data: [5] }}       | ${{ fixture: 'foundation', data: [0] }} | ${'cursor right wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [1] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [2] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [3] }} | ${'cursor right'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cell', data: [0] }}       | ${'cursor right wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cascade', data: [3, 0] }} | ${'cursor right'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'cursor right wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [50] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [49] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [30] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [29] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [12] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [11] }}      | ${'cursor right'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [51] }}      | ${'cursor right wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'right')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('up', () => {
					test.each`
						start                                   | end                                       | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cell', data: [0] }}         | ${'cursor stop a'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cell', data: [1] }}         | ${'cursor stop b'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cell', data: [2] }}         | ${'cursor stop c'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cell', data: [3] }}         | ${'cursor stop d'}
						${{ fixture: 'cell', data: [4] }}       | ${{ fixture: 'cell', data: [4] }}         | ${'cursor stop e'}
						${{ fixture: 'cell', data: [5] }}       | ${{ fixture: 'cell', data: [5] }}         | ${'cursor stop f'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'foundation', data: [0] }}   | ${'cursor stop h⡀'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'foundation', data: [1] }}   | ${'cursor stop h⡁'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'foundation', data: [2] }}   | ${'cursor stop h⡂'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'foundation', data: [3] }}   | ${'cursor stop h⡃'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'cell', data: [0] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'cell', data: [1] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'cell', data: [2] }}         | ${'cursor up wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'cell', data: [3] }}         | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'cascade', data: [0, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'cascade', data: [1, 99] }}  | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'cascade', data: [20, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'cascade', data: [21, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'cascade', data: [38, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'cascade', data: [39, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'cascade', data: [50, 99] }} | ${'cursor up wrap'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'cascade', data: [51, 99] }} | ${'cursor up wrap'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'up')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});

				describe('down', () => {
					test.each`
						start                                   | end                                      | actionText
						${{ fixture: 'cell', data: [0] }}       | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [1] }}       | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [2] }}       | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [3] }}       | ${{ fixture: 'cascade', data: [3, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [4] }}       | ${{ fixture: 'cascade', data: [4, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cell', data: [5] }}       | ${{ fixture: 'cascade', data: [5, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [0] }} | ${{ fixture: 'cascade', data: [0, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [1] }} | ${{ fixture: 'cascade', data: [1, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [2] }} | ${{ fixture: 'cascade', data: [2, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'foundation', data: [3] }} | ${{ fixture: 'cascade', data: [3, 99] }} | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [0, 0] }} | ${{ fixture: 'deck', data: [51] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [1, 0] }} | ${{ fixture: 'deck', data: [50] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [2, 0] }} | ${{ fixture: 'deck', data: [49] }}       | ${'cursor down wrap'}
						${{ fixture: 'cascade', data: [3, 0] }} | ${{ fixture: 'deck', data: [48] }}       | ${'cursor down wrap'}
						${{ fixture: 'deck', data: [51] }}      | ${{ fixture: 'deck', data: [51] }}       | ${'cursor stop k⡳ KS'}
						${{ fixture: 'deck', data: [50] }}      | ${{ fixture: 'deck', data: [50] }}       | ${'cursor stop k⡲ KH'}
						${{ fixture: 'deck', data: [31] }}      | ${{ fixture: 'deck', data: [31] }}       | ${'cursor stop k⡟ 8S'}
						${{ fixture: 'deck', data: [30] }}      | ${{ fixture: 'deck', data: [30] }}       | ${'cursor stop k⡞ 8H'}
						${{ fixture: 'deck', data: [13] }}      | ${{ fixture: 'deck', data: [13] }}       | ${'cursor stop k⡍ 4D'}
						${{ fixture: 'deck', data: [12] }}      | ${{ fixture: 'deck', data: [12] }}       | ${'cursor stop k⡌ 4C'}
						${{ fixture: 'deck', data: [1] }}       | ${{ fixture: 'deck', data: [1] }}        | ${'cursor stop k⡁ AD'}
						${{ fixture: 'deck', data: [0] }}       | ${{ fixture: 'deck', data: [0] }}        | ${'cursor stop k⡀ AC'}
					`('$start.fixture $start.data', ({ start, end, actionText }: { start: CardLocation; end: CardLocation; actionText: string }) => {
						const g = game.setCursor(start);
						expect(g.cursor).toEqual(start);
						expect(moveCursorWithBasicArrows(g, 'down')).toEqual({
							action: { text: actionText, type: 'cursor' },
							cursor: end,
						});
					});
				});
			});

			test.todo('dealt');
		});
	});
});
