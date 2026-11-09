import { omit as _omit } from 'lodash';
import { describe, expect, test } from 'vitest';
import { availableMovesMinimized } from '@/game/testUtils';
import { isPileSH, PileSH } from '@/game/card/card';
import { getMoves } from '@/game/catalog/solutions-catalog';
import { FreeCell } from '@/game/game';
import { PreviousAction } from '@/game/move/history';

describe('game.touchByPile', () => {
	describe('no selection', () => {
		const gamePrint =
			'    TH 4H    2S 2H AC    \n' +
			' 9H 5H TC 9D    2D 8S 5S \n' +
			' QH KS 8H AD    3D 5C 6H \n' +
			' KH 6D 3S QS       4S 4C \n' +
			' 8C JC 7S 2C       JD KD \n' +
			'    7H 3H 6C       7D 9S \n' +
			'    4D    5D       6S QC \n' +
			'    3C    KC          JH \n' +
			'          QD          TS \n' +
			'          JS             \n' +
			'          TD             \n' +
			'          9C             \n' +
			'          8D             \n' +
			'          7C             \n' +
			' move a8 TS→JH\n' +
			':h shuffle32 11737\n' +
			' 2a 14 13 64 68 5b 54 34 \n' +
			' 32 57 5c a8 ';

		describe('deck', () => {
			test('empty', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('k');
				expect(game.cursor).toEqual({ fixture: 'deck', data: [0] });
				expect(game.previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);
			});

			test('not empty', () => {
				let game = new FreeCell().shuffle32(5).dealAll({ demo: true, keepDeck: true });
				expect(game.__printDeck()).toBe('>6H 6C QC JS 9S AD 7C TS ');
				game = game.touchByPile('k');
				expect(game.cursor).toEqual({ fixture: 'deck', data: [7] });
				expect(game.previousAction).toEqual({
					text: 'peek k⡇ 6H',
					type: 'select',
				});
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [7] },
					cards: [{ rank: '6', suit: 'hearts', location: { fixture: 'deck', data: [7] } }],
					peekOnly: true,
				});
				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([]);
			});
		});

		describe('cell', () => {
			test('empty', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('a');
				expect(game.previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);
			});

			test('single', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('b');
				expect(game.previousAction).toEqual({
					text: 'select b TH',
					type: 'select',
				});
				expect(game.selection).toEqual({
					location: { fixture: 'cell', data: [1] },
					cards: [{ rank: '10', suit: 'hearts', location: { fixture: 'cell', data: [1] } }],
					peekOnly: false,
				});
				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
					['a', 'cell:empty', -1],
					['d', 'cell:empty', -1],
					['5', 'cascade:empty', 8],
				]);
			});
		});

		describe('foundation', () => {
			test('is a noop', () => {
				const game = FreeCell.parse(gamePrint);
				const g = game.touchByPile('h');
				expect(g.previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				expect(g.cursor).toEqual({
					fixture: 'foundation',
					data: [0],
				});
				expect(g.selection).toBe(null);
				expect(g.availableMoves).toBe(null);
				expect(g.history).toEqual(game.history);

				expect(_omit(g, ['previousAction', 'cursor'])).toEqual(_omit(game, ['previousAction', 'cursor']));
			});
		});

		describe('cascade', () => {
			test('empty', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('5');
				expect(game.previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);
			});

			test('single', () => {
				const game = FreeCell.parse(gamePrint).moveByShorthand('b5').touchByPile('5');
				expect(game.previousAction).toEqual({
					text: 'select 5⡀ TH',
					type: 'select',
				});
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [4, 0] },
					cards: [{ rank: '10', suit: 'hearts', location: { fixture: 'cascade', data: [4, 0] } }],
					peekOnly: false,
				});
				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
					['a', 'cell:empty', 4],
					['b', 'cell:empty', 3],
					['d', 'cell:empty', 1],
				]);
			});

			test('sequence', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('2');
				expect(game.previousAction).toEqual({
					text: 'select 2⡅ 4D-3C',
					type: 'select',
				});
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [1, 5] },
					cards: [
						{ rank: '4', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 5] } },
						{ rank: '3', suit: 'clubs', location: { fixture: 'cascade', data: [1, 6] } },
					],
					peekOnly: false,
				});
				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([['5', 'cascade:empty', 10]]);
			});

			// we are making a selection _without regard to the next move_
			// and to preserve some of the mystery
			// if we cannot move to the next place selected, we will try moveByShorthand, which will account for maxinim suze
			// but maybe that's not the intent, this is just a first selection
			test('picks the whole sequence even when we cannot move the whole thing', () => {
				const game = FreeCell.parse(gamePrint).touchByPile('4');
				expect(game.previousAction).toEqual({
					text: 'select 4⡆ KC-QD-JS-TD-9C-8D-7C',
					type: 'select',
				});
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [3, 6] },
					cards: [
						{ rank: 'king', suit: 'clubs', location: { fixture: 'cascade', data: [3, 6] } },
						{ rank: 'queen', suit: 'diamonds', location: { fixture: 'cascade', data: [3, 7] } },
						{ rank: 'jack', suit: 'spades', location: { fixture: 'cascade', data: [3, 8] } },
						{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [3, 9] } },
						{ rank: '9', suit: 'clubs', location: { fixture: 'cascade', data: [3, 10] } },
						{ rank: '8', suit: 'diamonds', location: { fixture: 'cascade', data: [3, 11] } },
						{ rank: '7', suit: 'clubs', location: { fixture: 'cascade', data: [3, 12] } },
					],
					peekOnly: false,
				});
				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([]);
			});

			test('tanget: can then go on to other tasks', () => {
				let game = FreeCell.parse(gamePrint).touchByPile('4');
				expect(game.previousAction).toEqual({
					text: 'select 4⡆ KC-QD-JS-TD-9C-8D-7C',
					type: 'select',
				});
				expect(game.selection).toBeTruthy();
				expect(game.availableMoves).toBeTruthy();

				game = game.moveCursor('down').moveCursor('down').touch();
				expect(game.previousAction).toEqual({
					text: 'select 4⡈ JS-TD-9C-8D-7C',
					type: 'select',
				});
				expect(game.selection).toBeTruthy();
				expect(game.availableMoves).toBeTruthy();

				// 4 is already selected, this will clear it
				game = game.touchByPile('4');
				expect(game.previousAction).toEqual({
					text: 'deselect 4⡈ JS-TD-9C-8D-7C',
					type: 'deselect',
				});
				expect(game.selection).toBeFalsy();
				expect(game.availableMoves).toBeFalsy();
			});
		});

		describe('by pile', () => {
			describe('4 cells, 8 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 2S', type: 'select' }}
					${'b'} | ${{ text: 'select b 2H', type: 'select' }}
					${'c'} | ${{ text: 'select c 2D', type: 'select' }}
					${'d'} | ${{ text: 'select d 2C', type: 'select' }}
					${'e'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'f'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'h'} | ${{ text: 'touch stop', type: 'invalid' }}
					${'1'} | ${{ text: 'select 1⡅ 3S', type: 'select' }}
					${'2'} | ${{ text: 'select 2⡅ 3H', type: 'select' }}
					${'3'} | ${{ text: 'select 3⡅ 3D', type: 'select' }}
					${'4'} | ${{ text: 'select 4⡅ 3C', type: 'select' }}
					${'5'} | ${{ text: 'select 5⡄ 4S', type: 'select' }}
					${'6'} | ${{ text: 'select 6⡄ 4H', type: 'select' }}
					${'7'} | ${{ text: 'select 7⡄ 4D', type: 'select' }}
					${'8'} | ${{ text: 'select 8⡄ 4C', type: 'select' }}
					${'9'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'0'} | ${{ text: 'deal all cards', type: 'deal' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 4, cascadeCount: 8 }).dealAll({ demo: true }).touchByPile(pileSh);
					expect(game.previousAction).toEqual(previousAction);
				});
			});

			describe('1 cells, 4 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 2C', type: 'select' }}
					${'b'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'c'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'d'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'e'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'f'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'h'} | ${{ text: 'touch stop', type: 'invalid' }}
					${'1'} | ${{ text: 'select 1⡋ 2S', type: 'select' }}
					${'2'} | ${{ text: 'select 2⡋ 2H', type: 'select' }}
					${'3'} | ${{ text: 'select 3⡋ 2D', type: 'select' }}
					${'4'} | ${{ text: 'select 4⡊ 3C', type: 'select' }}
					${'5'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'6'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'7'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'8'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'9'} | ${{ text: 'deal all cards', type: 'deal' }}
					${'0'} | ${{ text: 'deal all cards', type: 'deal' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 1, cascadeCount: 4 }).dealAll({ demo: true }).touchByPile(pileSh);
					expect(game.previousAction).toEqual(previousAction);
				});
			});

			describe('6 cells, 10 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 3D', type: 'select' }}
					${'b'} | ${{ text: 'select b 3C', type: 'select' }}
					${'c'} | ${{ text: 'select c 2S', type: 'select' }}
					${'d'} | ${{ text: 'select d 2H', type: 'select' }}
					${'e'} | ${{ text: 'select e 2D', type: 'select' }}
					${'f'} | ${{ text: 'select f 2C', type: 'select' }}
					${'h'} | ${{ text: 'touch stop', type: 'invalid' }}
					${'1'} | ${{ text: 'select 1⡄ 3S', type: 'select' }}
					${'2'} | ${{ text: 'select 2⡄ 3H', type: 'select' }}
					${'3'} | ${{ text: 'select 3⡃ 5S', type: 'select' }}
					${'4'} | ${{ text: 'select 4⡃ 5H', type: 'select' }}
					${'5'} | ${{ text: 'select 5⡃ 5D', type: 'select' }}
					${'6'} | ${{ text: 'select 6⡃ 5C', type: 'select' }}
					${'7'} | ${{ text: 'select 7⡃ 4S', type: 'select' }}
					${'8'} | ${{ text: 'select 8⡃ 4H', type: 'select' }}
					${'9'} | ${{ text: 'select 9⡃ 4D', type: 'select' }}
					${'0'} | ${{ text: 'select 0⡃ 4C', type: 'select' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 6, cascadeCount: 10 }).dealAll({ demo: true }).touchByPile(pileSh);
					expect(game.previousAction).toEqual(previousAction);
				});
			});
		});
	});

	describe('with selection', () => {
		const gamePrint =
			'    TH 4H    2S 2H AC    \n' +
			' 9H 5H TC 9D    2D 8S 5S \n' +
			' QH KS 8H AD    3D 5C 6H \n' +
			' KH 6D 3S QS       4S 4C \n' +
			' 8C JC 7S 2C       JD KD \n' +
			'    7H 3H 6C       7D 9S \n' +
			'    4D    5D       6S QC \n' +
			'    3C    KC          JH \n' +
			'          QD          TS \n' +
			'          JS             \n' +
			'          TD             \n' +
			'          9C             \n' +
			'          8D             \n' +
			'          7C             \n' +
			' move a8 TS→JH\n' +
			':h shuffle32 11737\n' +
			' 2a 14 13 64 68 5b 54 34 \n' +
			' 32 57 5c a8 ';

		describe('deck', () => {
			describe('standard', () => {
				test('empty', () => {
					const game = FreeCell.parse(gamePrint).$selectCard('3H').touchByPile('k');
					expect(game.previousAction).toEqual({
						text: 'invalid move 3⡄k 3H→deck',
						type: 'invalid',
					});
					expect(game.__printDeck()).toBe('>   ');
				});

				test('not empty', () => {
					const game = new FreeCell().shuffle32(5).dealAll({ demo: true, keepDeck: true }).$selectCard('2H').touchByPile('k');
					expect(game.previousAction).toEqual({
						text: 'peek k⡇ 6H',
						type: 'select',
					});
					expect(game.__printDeck()).toBe('>6H|6C QC JS 9S AD 7C TS ');
				});
			});

			describe('gameFunction: recall-or-bury', () => {
				test('empty', () => {
					const game = FreeCell.parse(gamePrint).$selectCard('3H').touchByPile('k', { gameFunction: 'recall-or-bury' });
					expect(game.previousAction).toEqual({
						text: 'invalid move 3⡄k 3H→deck',
						type: 'move',
						gameFunction: 'recall-or-bury',
					});
					expect(game.cursor).toEqual({ fixture: 'deck', data: [0] });
					expect(game.deck.length).toBe(1);
					expect(game.__printDeck()).toBe('>3H ');
					expect(game.history.slice(0, 1)).toEqual(['shuffle deck (11737)']);
					expect(game.history.slice(-2)).toEqual(['move a8⡆ TS→JH', 'invalid move 3⡄k 3H→deck']);
					expect(game).toMatchSnapshot();
				});

				test('not empty (incorrect)', () => {
					const game = new FreeCell()
						.shuffle32(5)
						.dealAll({ demo: true, keepDeck: true })
						.$selectCard('2H')
						.touchByPile('k', { gameFunction: 'recall-or-bury' });
					expect(game.previousAction).toEqual({
						text: 'invalid move 1⡅k⡇ 2H→6H',
						type: 'move',
						gameFunction: 'recall-or-bury',
					});
					expect(game.cursor).toEqual({ fixture: 'deck', data: [7] });
					expect(game.deck.length).toBe(9);
					expect(game.__printDeck()).toBe(' 2H>6H 6C QC JS 9S AD 7C TS ');
					expect(game).toMatchSnapshot();
				});

				// eslint-disable-next-line @vitest/no-disabled-tests -- XXX (motivation) (deck) (lint) it's a lot of exceptions to get this to work
				test.skip('not empty (fixed)', () => {
					const game = new FreeCell()
						.shuffle32(5)
						.dealAll({ demo: true, keepDeck: true })
						.$selectCard('2H')
						.touchByPile('k', { gameFunction: 'recall-or-bury' });
					expect(game.previousAction).toEqual({
						text: 'invalid move 1⡅k 2H→deck',
						type: 'move',
						gameFunction: 'recall-or-bury',
					});
					expect(game.cursor).toEqual({ fixture: 'deck', data: [8] });
					expect(game.deck.length).toBe(9);
					expect(game.__printDeck()).toBe('>2H 6H 6C QC JS 9S AD 7C TS ');
					expect(game).toMatchSnapshot();
				});
			});
		});

		describe('cell', () => {
			test('empty', () => {
				expect(FreeCell.parse(gamePrint).$selectCard('3H').touchByPile('a').previousAction).toEqual({
					text: 'move 3⡄a 3H→cell',
					type: 'move',
				});
			});

			test('single', () => {
				expect(FreeCell.parse(gamePrint).$selectCard('3H').touchByPile('b').previousAction).toEqual({
					text: 'select b TH',
					type: 'select',
				});
			});

			test('selected', () => {
				expect(FreeCell.parse(gamePrint).$selectCard('TH').touchByPile('b').previousAction).toEqual({
					text: 'deselect b TH',
					type: 'deselect',
				});
			});
		});

		describe('foundation', () => {
			describe('empty', () => {
				test('can move', () => {
					let game = new FreeCell().shuffle32(6).dealAll().touchByPile('4');
					expect(game.print()).toBe(
						'' + //
							'                         \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C AC \n' +
							' AD TS QD KS 8D 8H TC QS \n' +
							' 4S 9D KH 7S KD JD 4H 8S \n' +
							' 3S 5H 5D 4D 8C 3D TD 2D \n' +
							' 4C 7H AS 6S 7D 9S KC 6D \n' +
							' 9C 6C JH>AH|            \n' +
							' select 4 AH'
					);
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'move 4⡆h⡀ AH→foundation',
						type: 'move',
					});
					expect(game.printFoundation()).toBe('AH         ');
				});

				test('invalid move', () => {
					const game = new FreeCell().shuffle32(6).dealAll().touchByPile('1').touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'invalid move 1⡆h⡃ 9C→foundation',
						type: 'invalid',
					});
					expect(game.printFoundation()).toBe('           ');
				});
			});

			describe('single', () => {
				test('can move', () => {
					expect(FreeCell.parse(gamePrint).$selectCard('3H').touchByPile('h').previousAction).toEqual({
						text: 'move 3⡄h⡁ 3H→2H',
						type: 'move',
					});
				});

				test('invalid move', () => {
					expect(FreeCell.parse(gamePrint).$selectCard('8C').touchByPile('h').previousAction).toEqual({
						text: 'invalid move 1⡃h⡂ 8C→AC',
						type: 'invalid',
					});
				});
			});

			// while it's not a valid start move,
			// maybe we should still try to deselect
			describe('deselect one', () => {
				test('0', () => {
					let game = FreeCell.parse(
						'' + //
							'            >AH|         \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C AC \n' +
							' AD TS QD KS 8D 8H TC QS \n' +
							' 4S 9D KH 7S KD JD 4H 8S \n' +
							' 3S 5H 5D 4D 8C 3D TD 2D \n' +
							' 4C 7H AS 6S 7D 9S KC 6D \n' +
							' 9C 6C JH                \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [0] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡀ AH',
						type: 'deselect',
					});
				});

				test('1', () => {
					let game = FreeCell.parse(
						'' + //
							'               >AH|      \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C AC \n' +
							' AD TS QD KS 8D 8H TC QS \n' +
							' 4S 9D KH 7S KD JD 4H 8S \n' +
							' 3S 5H 5D 4D 8C 3D TD 2D \n' +
							' 4C 7H AS 6S 7D 9S KC 6D \n' +
							' 9C 6C JH                \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [1] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡁ AH',
						type: 'deselect',
					});
				});

				test('2', () => {
					let game = FreeCell.parse(
						'' + //
							'                  >AH|   \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C AC \n' +
							' AD TS QD KS 8D 8H TC QS \n' +
							' 4S 9D KH 7S KD JD 4H 8S \n' +
							' 3S 5H 5D 4D 8C 3D TD 2D \n' +
							' 4C 7H AS 6S 7D 9S KC 6D \n' +
							' 9C 6C JH                \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [2] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡂ AH',
						type: 'deselect',
					});
				});

				test('3', () => {
					let game = FreeCell.parse(
						'' + //
							'                     >AH|\n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C AC \n' +
							' AD TS QD KS 8D 8H TC QS \n' +
							' 4S 9D KH 7S KD JD 4H 8S \n' +
							' 3S 5H 5D 4D 8C 3D TD 2D \n' +
							' 4C 7H AS 6S 7D 9S KC 6D \n' +
							' 9C 6C JH                \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [3] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡃ AH',
						type: 'deselect',
					});
				});
			});

			describe('deselect all', () => {
				test('0', () => {
					let game = FreeCell.parse(
						'' + //
							'            >AC|AD AH AS \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C QS \n' +
							' 4S TS QD KS 8D 8H TC 8S \n' +
							' 3S 9D KH 7S KD JD 4H 2D \n' +
							' 4C 5H 5D 4D 8C 3D TD 6D \n' +
							' 9C 7H JH 6S 7D 9S KC 6C \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [0] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡀ AC',
						type: 'deselect',
					});
				});

				test('1', () => {
					let game = FreeCell.parse(
						'' + //
							'             AC>AD|AH AS \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C QS \n' +
							' 4S TS QD KS 8D 8H TC 8S \n' +
							' 3S 9D KH 7S KD JD 4H 2D \n' +
							' 4C 5H 5D 4D 8C 3D TD 6D \n' +
							' 9C 7H JH 6S 7D 9S KC 6C \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [1] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡁ AD',
						type: 'deselect',
					});
				});

				test('2', () => {
					let game = FreeCell.parse(
						'' + //
							'             AC AD>AH|AS \n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C QS \n' +
							' 4S TS QD KS 8D 8H TC 8S \n' +
							' 3S 9D KH 7S KD JD 4H 2D \n' +
							' 4C 5H 5D 4D 8C 3D TD 6D \n' +
							' 9C 7H JH 6S 7D 9S KC 6C \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [2] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡂ AH',
						type: 'deselect',
					});
				});

				test('3', () => {
					let game = FreeCell.parse(
						'' + //
							'             AC AD AH>AS|\n' +
							' 2H JS 5S 5C 6H 2C TH 2S \n' +
							' JC QH 3H 9H 7C QC 3C QS \n' +
							' 4S TS QD KS 8D 8H TC 8S \n' +
							' 3S 9D KH 7S KD JD 4H 2D \n' +
							' 4C 5H 5D 4D 8C 3D TD 6D \n' +
							' 9C 7H JH 6S 7D 9S KC 6C \n' +
							' hand-jammed'
					);
					expect(game.selection?.location).toEqual({ fixture: 'foundation', data: [3] });
					game = game.touchByPile('h');
					expect(game.previousAction).toEqual({
						text: 'deselect h⡃ AS',
						type: 'deselect',
					});
				});
			});
		});

		describe('cascade', () => {
			test('valid move', () => {
				const game = FreeCell.parse(gamePrint);
				expect(game.$selectCard('7D').touchByPile('1').previousAction).toEqual({
					text: 'move 7⡄1⡃ 7D-6S→8C',
					type: 'move',
				});
				expect(game.$selectCard('4H').touchByPile('5').previousAction).toEqual({
					text: 'move c5 4H→cascade',
					type: 'move',
				});
			});

			test('adjust move', () => {
				const game = FreeCell.parse(gamePrint);
				expect(game.$selectCard('QD').touchByPile('5').previousAction).toEqual({
					text: 'move 4⡊5 9C-8D-7C→cascade',
					type: 'move',
				});
				// this is because…
				expect(game.touchByPile('4').previousAction).toEqual({
					text: 'select 4⡆ KC-QD-JS-TD-9C-8D-7C',
					type: 'select',
				});
				expect(game.touchByPile('4').touchByPile('5').previousAction).toEqual({
					text: 'move 4⡊5 9C-8D-7C→cascade',
					type: 'move',
				});
			});

			// select second col instead (like how touch does it for convenience)
			test('invalid move', () => {
				const game = FreeCell.parse(gamePrint);
				expect(game.$selectCard('3H').touchByPile('6').previousAction).toEqual({
					text: 'select 6⡁ 3D',
					type: 'select',
				});
				expect(game.$selectCard('3H').touchByPile('6', { stopWithInvalid: true }).previousAction).toEqual({
					text: 'invalid move 3⡄6⡁ 3H→3D',
					type: 'invalid',
				});
			});

			// prove that shorthand isn't perfect (find the other test that does this too)
			test('col / shrink selection / move', () => {
				let game = FreeCell.parse(gamePrint).touchByPile('4');
				expect(game.previousAction).toEqual({
					text: 'select 4⡆ KC-QD-JS-TD-9C-8D-7C',
					type: 'select',
				});

				game = game.moveCursor('down').moveCursor('down').touch();
				expect(game.previousAction).toEqual({
					text: 'select 4⡈ JS-TD-9C-8D-7C',
					type: 'select',
				});

				game = game.touchByPile('5');
				expect(game.previousAction).toEqual({
					text: 'move 4⡊5 9C-8D-7C→cascade',
					type: 'move',
				});
			});

			test('deselect', () => {
				let game = FreeCell.parse(gamePrint).$selectCard('4D');
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [1, 5] },
					cards: [
						{ rank: '4', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 5] } },
						{ rank: '3', suit: 'clubs', location: { fixture: 'cascade', data: [1, 6] } },
					],
					peekOnly: false,
				});
				expect(game.previousAction.text).toBe('select 2⡅ 4D-3C');
				game = game.touchByPile('2');
				expect(game.previousAction).toEqual({
					text: 'deselect 2⡅ 4D-3C',
					type: 'deselect',
				});
			});

			test('deselect peekOnly', () => {
				let game = FreeCell.parse(gamePrint).$selectCard('7H');
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [1, 4] },
					cards: [{ rank: '7', suit: 'hearts', location: { fixture: 'cascade', data: [1, 4] } }],
					peekOnly: true,
				});
				expect(game.previousAction.text).toBe('peek 2⡄ 7H');
				game = game.touchByPile('2');
				expect(game.previousAction).toEqual({
					text: 'deselect 2⡄ 7H',
					type: 'deselect',
				});
			});
		});

		describe('by pile', () => {
			describe('4 cells, 8 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 2S', type: 'select' }}
					${'b'} | ${{ text: 'select b 2H', type: 'select' }}
					${'c'} | ${{ text: 'select c 2D', type: 'select' }}
					${'d'} | ${{ text: 'select d 2C', type: 'select' }}
					${'e'} | ${{ text: 'peek 2⡄ 5H', type: 'select' }}
					${'f'} | ${{ text: 'peek 2⡄ 5H', type: 'select' }}
					${'h'} | ${{ text: 'invalid move 2⡄h⡁ 5H→AH', type: 'invalid' }}
					${'1'} | ${{ text: 'select 1⡅ 3S', type: 'select' }}
					${'2'} | ${{ text: 'deselect 2⡄ 5H', type: 'deselect' }}
					${'3'} | ${{ text: 'select 3⡅ 3D', type: 'select' }}
					${'4'} | ${{ text: 'select 4⡅ 3C', type: 'select' }}
					${'5'} | ${{ text: 'select 5⡄ 4S', type: 'select' }}
					${'6'} | ${{ text: 'select 6⡄ 4H', type: 'select' }}
					${'7'} | ${{ text: 'select 7⡄ 4D', type: 'select' }}
					${'8'} | ${{ text: 'select 8⡄ 4C', type: 'select' }}
					${'9'} | ${{ text: 'peek 2⡄ 5H', type: 'select' }}
					${'0'} | ${{ text: 'peek 2⡄ 5H', type: 'select' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 4, cascadeCount: 8 }).dealAll({ demo: true }).$selectCard('5H').touchByPile(pileSh, { autoFoundation: false });
					expect(game.previousAction).toEqual(previousAction);
				});
			});

			describe('1 cells, 4 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 2C', type: 'select' }}
					${'b'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'c'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'d'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'e'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'f'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'h'} | ${{ text: 'move 2⡋h⡁ 2H→AH', type: 'move' }}
					${'1'} | ${{ text: 'select 1⡋ 2S', type: 'select' }}
					${'2'} | ${{ text: 'deselect 2⡈ 5H', type: 'deselect' }}
					${'3'} | ${{ text: 'select 3⡋ 2D', type: 'select' }}
					${'4'} | ${{ text: 'select 4⡊ 3C', type: 'select' }}
					${'5'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'6'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'7'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'8'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'9'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
					${'0'} | ${{ text: 'peek 2⡈ 5H', type: 'select' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 1, cascadeCount: 4 }).dealAll({ demo: true }).$selectCard('5H').touchByPile(pileSh, { autoFoundation: false });
					expect(game.previousAction).toEqual(previousAction);
				});
			});

			describe('6 cells, 10 cascades', () => {
				test.each`
					pileSh | previousAction
					${'a'} | ${{ text: 'select a 3D', type: 'select' }}
					${'b'} | ${{ text: 'select b 3C', type: 'select' }}
					${'c'} | ${{ text: 'select c 2S', type: 'select' }}
					${'d'} | ${{ text: 'select d 2H', type: 'select' }}
					${'e'} | ${{ text: 'select e 2D', type: 'select' }}
					${'f'} | ${{ text: 'select f 2C', type: 'select' }}
					${'h'} | ${{ text: 'invalid move 4⡃h⡁ 5H→AH', type: 'invalid' }}
					${'1'} | ${{ text: 'select 1⡄ 3S', type: 'select' }}
					${'2'} | ${{ text: 'select 2⡄ 3H', type: 'select' }}
					${'3'} | ${{ text: 'select 3⡃ 5S', type: 'select' }}
					${'4'} | ${{ text: 'deselect 4⡃ 5H', type: 'deselect' }}
					${'5'} | ${{ text: 'select 5⡃ 5D', type: 'select' }}
					${'6'} | ${{ text: 'select 6⡃ 5C', type: 'select' }}
					${'7'} | ${{ text: 'select 7⡃ 4S', type: 'select' }}
					${'8'} | ${{ text: 'select 8⡃ 4H', type: 'select' }}
					${'9'} | ${{ text: 'select 9⡃ 4D', type: 'select' }}
					${'0'} | ${{ text: 'select 0⡃ 4C', type: 'select' }}
				`('select $pileSh', ({ pileSh, previousAction }: { pileSh: PileSH; previousAction: PreviousAction }) => {
					const game = new FreeCell({ cellCount: 6, cascadeCount: 10 })
						.dealAll({ demo: true })
						.$selectCard('5H')
						.touchByPile(pileSh, { autoFoundation: false });
					expect(game.previousAction).toEqual(previousAction);
				});
			});
		});
	});

	// just collapse _alll_ the moves into one string and pick each character and _go_
	test('Game #5 (tutorial)', () => {
		let game = new FreeCell().shuffle32(5).dealAll();
		const moves = getMoves(5).join('').split('').reverse();
		while (moves.length) {
			const s = moves.pop();
			if (s && isPileSH(s)) {
				game = game.touchByPile(s);
			} else {
				throw new Error(`invalid move from stream: "${s ?? 'undefined'}"`);
			}
		}
		expect(game.print()).toBe(
			'' + //
				'            >KD KC KH KS \n' +
				'                         \n' +
				':    Y O U   W I N !    :\n' +
				'                         \n' +
				' move 56 KD→cascade (auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC)'
		);
		expect(game.print({ includeHistory: true })).toBe(
			'' + //
				'             KD KC KH KS \n' +
				'                         \n' +
				':    Y O U   W I N !    :\n' +
				'                         \n' +
				' move 56 KD→cascade (auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC)\n' +
				':h shuffle32 5\n' +
				' 53 6a 65 67 85 a8 68 27 \n' +
				' 67 1a 1b 13 15 a5 1a 1c \n' +
				' 86 85 86 86 21 25 2b 27 \n' +
				' 42 45 c5 42 47 4h 48 48 \n' +
				' 78 7c 7h 71 78 7h ah b8 \n' +
				' 34 31 32 c7 37 3a 31 a3 \n' +
				' 13 27 67 52 53 56 '
		);
	});
});
