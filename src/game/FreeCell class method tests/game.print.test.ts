import { beforeAll, describe, expect, test } from 'vitest';
import { initializeDeckOfCards } from '@/game/card/card';
import { FreeCell } from '@/game/game';

describe('game.print', () => {
	describe('compare game state', () => {
		describe('deck', () => {
			describe('empty', () => {
				let game: FreeCell;
				beforeAll(() => {
					game = new FreeCell().dealAll();
				});

				test('omitted from standard', () => {
					expect(game.print()).not.toContain(':d');
				});

				test('omitted from includeHistory', () => {
					expect(game.print({ includeHistory: true })).not.toContain(':d');
				});

				test('included in verbose', () => {
					expect(game.print({ verbose: true })).toContain(':d');
				});
			});

			test('not empty', () => {
				const game = new FreeCell().dealAll({ demo: true, keepDeck: true });
				expect(game.__printDeck()).toBe('>2S 2H 2D 2C AS AH AD AC ');
				expect(game.__printDeck({ fixture: 'cascade', data: [-1, -1] })).toBe(' 2S 2H 2D 2C AS AH AD AC ');
			});

			test('has gaps', () => {
				const cards = initializeDeckOfCards();
				cards.forEach((card, idx) => {
					card.location = { fixture: 'cascade', data: [0, idx] };
				});
				cards[51].location = { fixture: 'deck', data: [1] };
				cards[50].location = { fixture: 'deck', data: [4] };
				const game = new FreeCell({ cards });
				game.deck.length = 6;
				expect(game.__printDeck({ fixture: 'deck', data: [0] })).toBe('    KH       KS>   ');
				expect(game.__printDeck({ fixture: 'deck', data: [1] })).toBe('    KH      >KS    ');
				expect(game.__printDeck({ fixture: 'deck', data: [2] })).toBe('    KH   >   KS    ');
				expect(game.__printDeck({ fixture: 'deck', data: [3] })).toBe('    KH>      KS    ');
				expect(game.__printDeck({ fixture: 'deck', data: [4] })).toBe('   >KH       KS    ');
				expect(game.__printDeck({ fixture: 'deck', data: [5] })).toBe('>   KH       KS    ');
				expect(game.__printDeck({ fixture: 'deck', data: [6] })).toBe('    KH       KS    '); // invalid
				expect(game.__printDeck({ fixture: 'deck', data: [7] })).toBe('    KH       KS    '); // invalid
				expect(game.__printDeck({ fixture: 'cascade', data: [-1, -1] })).toBe('    KH       KS    ');
			});
		});

		describe('cursor', () => {
			let game: FreeCell;
			beforeAll(() => {
				game = new FreeCell().dealAll();
			});

			test('included in standard', () => {
				expect(game.print()).toContain('>');
			});

			test('omitted from includeHistory', () => {
				expect(game.print({ includeHistory: true })).not.toContain('>');
			});

			test('included in verbose', () => {
				expect(game.print({ verbose: true })).toContain('>');
			});
		});

		describe('selection', () => {
			let game: FreeCell;
			beforeAll(() => {
				game = new FreeCell()
					.dealAll()
					.$selectCard('KH')
					.setCursor({ fixture: 'cell', data: [0] });
			});

			test('included in standard', () => {
				expect(game.print()).toContain('|KH|');
			});

			test('omitted from includeHistory', () => {
				expect(game.print({ includeHistory: true })).not.toContain('|KH|');
			});

			test('included in verbose', () => {
				expect(game.print({ verbose: true })).toContain('|KH|');
			});
		});

		describe('availableMoves', () => {
			let game: FreeCell;
			beforeAll(() => {
				game = new FreeCell().dealAll().$moveCardToPile('AS', 'c', { autoFoundation: false }).$selectCard('AH');
			});

			test.todo('omitted from standard');

			test.todo('omitted from includeHistory');

			// TODO (techdebt) (print) actually include availableMoves
			test('included in verbose', () => {
				expect(game.print({ verbose: true })).toBe(
					'' +
						'       AS                \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						'   >AH|AD AC             \n' +
						':d\n' +
						' select 2 AH'
				);
			});
		});

		test.todo('what other state and options should we check');
	});
});
