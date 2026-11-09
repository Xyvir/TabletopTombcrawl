import { omit as _omit } from 'lodash';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CardLocation } from '@/game/card/card';
import { ACTION_TEXT_EXAMPLES, FIFTY_TWO_CARD_FLOURISH } from '@/game/catalog/actionText-examples';
import { FreeCell } from '@/game/game';
import { PREVIOUS_ACTION_TYPE_IS_START_OF_GAME } from '@/game/move/history';

describe('game.parse', () => {
	test('init', () => {
		const g = new FreeCell();
		const gamePrint = g.print();
		const gamePrintHist = g.print({ includeHistory: true });
		const game = FreeCell.parse(gamePrint);
		const gameHist = FreeCell.parse(gamePrintHist);

		expect(gamePrint).toBe(
			'' + //
				'                         \n' +
				'                         \n' +
				':d>KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD AC \n' +
				' init'
		);
		expect(gamePrintHist).toBe(
			'' + //
				'                         \n' +
				'                         \n' +
				':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD AC '
		);

		// bugfix, these got messed up
		expect(game.history).toEqual([]);
		expect(game.previousAction).toEqual({
			text: 'init',
			type: 'init',
		});
		expect(gameHist.history).toEqual([]);
		expect(gameHist.previousAction).toEqual({
			text: 'init',
			type: 'init',
		});

		// confirm intial cursor
		expect(g.cursor).toEqual({ fixture: 'deck', data: [51] });
		expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });
		expect(gameHist.cursor).toEqual({ fixture: 'deck', data: [51] });

		// this should have been all we needed to check 😬
		expect(game).toEqual(gameHist);
		// and we may as well check this too
		expect(game).toEqual(g);
		expect(gameHist).toEqual(g);

		// this is how we started out testing
		expect(game.print()).toEqual(gamePrint);
		expect(game.print({ includeHistory: true })).toEqual(gamePrintHist);
		expect(gameHist.print()).toEqual(gamePrint);
		expect(gameHist.print({ includeHistory: true })).toEqual(gamePrintHist);
	});

	describe('edging', () => {
		test('empty string', () => {
			expect(() => FreeCell.parse('')).toThrow('No game string provided.');
		});

		describe('home', () => {
			test('cell length', () => {
				expect(() => FreeCell.parse('ab')).toThrow('Invalid cell line length (2); expected "1 + count ⨉ 3" -- "ab"');
			});

			test('too few cells', () => {
				// takes foundations first
				expect(() => FreeCell.parse(' ')).toThrow('Must have between 1 and 6 cells; requested "-4".');
				// 4 foundations, 0 cells
				expect(() => FreeCell.parse('             ')).toThrow('Must have between 1 and 6 cells; requested "0".');
			});

			test('too many cells', () => {
				expect(() => FreeCell.parse('                                  \n')).toThrow('Must have between 1 and 6 cells; requested "7".');
			});
		});

		describe('cascade', () => {
			test('missing', () => {
				expect(() => FreeCell.parse('                \n')).toThrow('no cascade in game string');
			});

			test('length', () => {
				expect(() => FreeCell.parse('                \n abc ')).toThrow('Invalid cascade line length (5); expected "1 + count ⨉ 3" -- " abc "');
			});

			test('count', () => {
				expect(() => FreeCell.parse('                \n 1_ 2_ ')).toThrow('Must have at least as many cascades as foundations (4); requested "2".');
			});
		});

		describe('bad cards', () => {
			test('invalid rank', () => {
				expect(() =>
					FreeCell.parse(
						'' + //
							'         >   bC KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' cursro right'
					)
				).toThrow('invalid rank shorthand: "b"');
			});

			test('invalid suit', () => {
				expect(() =>
					FreeCell.parse(
						'' + //
							'         >   Kz KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' cursro right'
					)
				).toThrow('invalid suit shorthand: "z"');
			});

			test('no remaining', () => {
				expect(() =>
					FreeCell.parse(
						'' + //
							'         >KC KC KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' cursro right'
					)
				).toThrow('cannot find card in remaining: king of clubs');
			});

			test('card not present', () => {
				expect(() =>
					FreeCell.parse(
						'' + //
							'         >WC KC KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' cursro right'
					)
				).toThrow('cannot find card in game: joker of clubs');
			});
		});

		describe('history', () => {
			test('unsupported shuffle', () => {
				const game = FreeCell.parse(
					'' + //
						'         >   KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' cursor right\n' +
						':h banana'
				);
				expect(game.history).toEqual(['init with invalid history shuffle']);
				expect(game.previousAction).toEqual({
					text: 'cursor right',
					type: 'cursor',
				});
			});

			test('invalid shuffle', () => {
				const game = FreeCell.parse(
					'' + //
						'         >   KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' cursor right\n' +
						':h shuffle4 4294967295'
				);
				expect(game.history).toEqual(['init with invalid history shuffle']);
				expect(game.previousAction).toEqual({
					text: 'cursor right',
					type: 'cursor',
				});
				expect(game.undo()).toBe(game);
			});

			test('invalid seed', () => {
				const game = FreeCell.parse(
					'' + //
						'         >   KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' cursor right\n' +
						':h shuffle32 4294967295'
				);
				expect(game.history).toEqual(['init with invalid history seed']);
				expect(game.previousAction).toEqual({
					text: 'cursor right',
					type: 'cursor',
				});
				expect(game.undo()).toBe(game);
			});
		});

		describe('recursion', () => {
			test('without history', () => {
				const parseSpy = vi.spyOn(FreeCell, 'parse');
				const undoSpy = vi.spyOn(FreeCell.prototype, 'undo');

				const gamePrint = new FreeCell({ cellCount: 1, cascadeCount: 4 }).dealAll().$touchAndMove('AS').print();
				expect(parseSpy).toHaveBeenCalledTimes(0);
				expect(undoSpy).toHaveBeenCalledTimes(0);

				const game = FreeCell.parse(gamePrint);
				expect(game.print()).toBe(gamePrint);
				expect(parseSpy).toHaveBeenCalledTimes(1);
				expect(undoSpy).toHaveBeenCalledTimes(1);
			});

			test('with history', () => {
				const parseSpy = vi.spyOn(FreeCell, 'parse');
				const undoSpy = vi.spyOn(FreeCell.prototype, 'undo');

				const gamePrint = ACTION_TEXT_EXAMPLES[FIFTY_TWO_CARD_FLOURISH];
				expect(parseSpy).toHaveBeenCalledTimes(0);
				expect(undoSpy).toHaveBeenCalledTimes(0);

				const game = FreeCell.parse(gamePrint);
				expect(game).toBeInstanceOf(FreeCell);
				expect(game.print({ includeHistory: true })).toBe(gamePrint);
				expect(parseSpy).toHaveBeenCalledTimes(1);
				expect(undoSpy).toHaveBeenCalledTimes(0);
			});

			test('with invalid history', () => {
				const parseSpy = vi.spyOn(FreeCell, 'parse');
				const undoSpy = vi.spyOn(FreeCell.prototype, 'undo');

				const gamePrint = new FreeCell({ cellCount: 1, cascadeCount: 4 }).dealAll().$touchAndMove('AS').print({ includeHistory: true });
				expect(parseSpy).toHaveBeenCalledTimes(0);
				expect(undoSpy).toHaveBeenCalledTimes(0);

				const game = FreeCell.parse(gamePrint);
				expect(game.print({ includeHistory: true })).toBe(gamePrint);
				expect(parseSpy).toHaveBeenCalledTimes(1);
				expect(undoSpy).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe('history shorthand', () => {
		describe('start of game', () => {
			test('values', () => {
				// if this fails, add another test
				expect(PREVIOUS_ACTION_TYPE_IS_START_OF_GAME).toEqual(new Set(['init', 'shuffle', 'deal']));
			});

			test('init', () => {
				const game = new FreeCell();
				expect(game.history).toEqual([]);
				expect(game.previousAction).toEqual({
					text: 'init',
					type: 'init',
				});
				expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual([]);
				expect(gameWithHist.previousAction).toEqual({
					text: 'init',
					type: 'init',
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'deck', data: [51] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual([]);
				expect(gameNoHist.previousAction).toEqual({
					text: 'init',
					type: 'init',
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'deck', data: [51] });
				expect(gameNoHist).toEqual(game);
			});

			test('shuffle', () => {
				const game = new FreeCell().shuffle32(1);
				expect(game.history).toEqual(['shuffle deck (1)']);
				expect(game.previousAction).toEqual({
					text: 'shuffle deck (1)',
					type: 'shuffle',
				});
				expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual(['shuffle deck (1)']);
				expect(gameWithHist.previousAction).toEqual({
					text: 'shuffle deck (1)',
					type: 'shuffle',
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'deck', data: [51] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual(['shuffle deck (1)']);
				expect(gameNoHist.previousAction).toEqual({
					text: 'shuffle deck (1)',
					type: 'shuffle',
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'deck', data: [51] });
				expect(gameNoHist).toEqual(game);
			});

			test('shuffle + deal', () => {
				const game = new FreeCell().shuffle32(1).dealAll();
				expect(game.history).toEqual(['shuffle deck (1)', 'deal all cards']);
				expect(game.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual(['shuffle deck (1)', 'deal all cards']);
				expect(gameWithHist.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual(['deal all cards']);
				expect(gameNoHist.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameNoHist).not.toEqual(game);
				expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
			});

			test('deal', () => {
				const game = new FreeCell().dealAll();
				expect(game.history).toEqual(['deal all cards']);
				expect(game.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual(['deal all cards']);
				expect(gameWithHist.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual(['deal all cards']);
				expect(gameNoHist.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameNoHist).toEqual(game);
			});

			test('deal 44 cards', () => {
				const game = new FreeCell().dealAll({ demo: true, keepDeck: true });
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C             \n' +
						':d>2S 2H 2D 2C AS AH AD AC \n' +
						' deal 44 cards'
				);
				expect(game.history).toEqual(['deal 44 cards']);
				expect(game.previousAction).toEqual({
					text: 'deal 44 cards',
					type: 'deal',
				});
				expect(game.cursor).toEqual({ fixture: 'deck', data: [7] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual(['deal 44 cards']);
				expect(gameWithHist.previousAction).toEqual({
					text: 'deal 44 cards',
					type: 'deal',
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'deck', data: [7] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual(['deal 44 cards']);
				expect(gameNoHist.previousAction).toEqual({
					text: 'deal 44 cards',
					type: 'deal',
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'deck', data: [7] });
				expect(gameNoHist).toEqual(game);
			});

			test('remaining affects dealtCount', () => {
				const game = FreeCell.parse(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C             \n' +
						' 3S 3H 3D 3C             \n' +
						':d>2S 2H 2D 2C AS AH AD AC \n' +
						' deal abcd'
				);
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C             \n' +
						' 3S 3H 3D 3C             \n' +
						':d 4S 4H 4D 4C>2S 2H 2D 2C AS AH AD AC \n' +
						' deal abcd' // invalid action text is preserved
				);
				expect(game.previousAction).toEqual({
					text: 'deal abcd', // invalid action text is preserved
					type: 'deal',
				});
				// invalid action text is not preserved in the history
				expect(game.history).toEqual(['deal 40 cards']);

				const gameDealAgain = game.dealAll();
				expect(gameDealAgain.history).toEqual(['deal 40 cards', 'deal all cards']);

				const gameDealAgainUndo = gameDealAgain.undo();
				expect(gameDealAgainUndo.history).toEqual(['deal 40 cards']);
				expect(gameDealAgainUndo.previousAction).toEqual({
					text: 'deal 40 cards',
					type: 'deal',
					gameFunction: 'undo',
				});
			});

			test('first move', () => {
				const game = new FreeCell().shuffle32(3).dealAll().moveByShorthand('2a');
				expect(game.history).toEqual(['shuffle deck (3)', 'deal all cards', 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)']);
				expect(game.previousAction).toEqual({
					text: 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)',
					type: 'move-foundation',
					tweenCards: [{ rank: '4', suit: 'spades', location: { fixture: 'cell', data: [0] } }],
				});
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });

				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.history).toEqual(['shuffle deck (3)', 'deal all cards', 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)']);
				expect(gameWithHist.previousAction).toEqual({
					text: 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)',
					type: 'move-foundation',
					tweenCards: [{ rank: '4', suit: 'spades', location: { fixture: 'cell', data: [0] } }],
				});
				expect(gameWithHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.history).toEqual(['init without history', 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)']);
				expect(gameNoHist.previousAction).toEqual({
					text: 'move 2⡆a 4S→cell (auto-foundation 56 AH,2H)',
					type: 'move-foundation',
					tweenCards: [{ rank: '4', suit: 'spades', location: { fixture: 'cell', data: [0] } }],
				});
				expect(gameNoHist.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(gameNoHist).not.toEqual(game);
				expect(_omit(gameNoHist, ['history', 'previousAction'])).toEqual(_omit(game, ['history', 'previousAction']));
			});

			test('not dealt', () => {
				const game = new FreeCell().shuffle32(5);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'                         \n' +
						'                         \n' +
						':d AH 8S 2D QS 4C 9H 2S 3D 5C AS 9C KH 4D 2C 3C 4S 3S 5D KC 3H KD 5H 6S 8D TD 7S JD 7H 8H JH JC 7D 5S QH 8C 9D KS QD 4H AC 2H TC TH 6D 6H 6C QC JS 9S AD 7C TS \n' +
						' shuffle deck (5)\n' +
						':h shuffle32 5'
				);
				expect(game.history).toEqual(['shuffle deck (5)']);
				expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);
			});

			test('no moves yet', () => {
				const game = new FreeCell().shuffle32(5).dealAll();
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'                         \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' deal all cards\n' +
						':h shuffle32 5'
				);
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards']);
				expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);
			});
		});

		describe('end of game', () => {
			test('previousAction.text', () => {
				let game = FreeCell.parse(
					'' + //
						'             KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)\n' +
						':h shuffle32 1\n' +
						' 3a 32 7b 3c 37 37 b7 8b \n' +
						' 87 48 82 a8 4a 34 57 54 \n' +
						' 85 8d 87 c7 d7 b8 38 23 \n' +
						' 28 32 6b 6c 78 a3 73 7a \n' +
						' 7c 74 c7 67 63 56 8h b8 \n' +
						' 5b 51 b5 24 25 6h 6h 24 \n' +
						' 26 a4 37 2a 8h 4h 1h 17 \n' +
						' 1h 1b 8h 4h 4b 4c 4d a2 \n' +
						' 42 46 3h 7h 13 '
				);
				expect(game.history.length).toBe(71);
				expect(game.print()).toBe(
					'' + //
						'            >KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)'
				);

				// at this point, we can recover the entire game using the history
				let gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				let gameNoHist = FreeCell.parse(game.print());
				expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
				expect(gameWithHist).toEqual(game);
				// but the whole game isn't exactly the same
				// if write/read a game, we can recover the state, but not the history
				expect(gameNoHist.print()).toBe(game.print());
				expect(_omit(gameNoHist, ['history'])).toEqual(_omit(game, ['history']));
				expect(game.history.length).toBe(71);
				expect(gameNoHist.history).toEqual(['init without history', 'move 1⡁3 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)']);

				game = game.moveCursor('right');
				expect(game.print()).toBe(
					'' + //
						'             KC>KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' cursor right'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             KC KS KH KD \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)\n' +
						':h shuffle32 1\n' +
						' 3a 32 7b 3c 37 37 b7 8b \n' +
						' 87 48 82 a8 4a 34 57 54 \n' +
						' 85 8d 87 c7 d7 b8 38 23 \n' +
						' 28 32 6b 6c 78 a3 73 7a \n' +
						' 7c 74 c7 67 63 56 8h b8 \n' +
						' 5b 51 b5 24 25 6h 6h 24 \n' +
						' 26 a4 37 2a 8h 4h 1h 17 \n' +
						' 1h 1b 8h 4h 4b 4c 4d a2 \n' +
						' 42 46 3h 7h 13 '
				);

				// if write/read a game, we can recover the state, but not the history
				gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.print()).toBe(game.print());
				expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
				expect(game.history.length).toBe(71);
				expect(gameNoHist.history).toEqual(['init without history']);
				expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
				expect(_omit(gameWithHist, ['previousAction', 'cursor'])).toEqual(_omit(game, ['previousAction', 'cursor']));
				expect(game.previousAction).toEqual({
					text: 'cursor right',
					type: 'cursor',
				});
				expect(game.cursor).toEqual({
					fixture: 'foundation',
					data: [1],
				});
				expect(gameWithHist.previousAction).toEqual({
					text: 'move 1⡁3 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'king', suit: 'diamonds', location: { fixture: 'cascade', data: [2, 0] } }],
				});
				expect(gameWithHist.cursor).toEqual({
					fixture: 'foundation',
					data: [0],
				});
			});
		});

		describe('validity checks', () => {
			test('sample valid state', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' move 67 9H→TC\n' +
						':h shuffle32 5\n' +
						' 53 6a 65 67 85 a8 68 27 \n' +
						' 67 '
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' move 67 9H→TC\n' +
						':h shuffle32 5\n' +
						' 53 6a 65 67 85 a8 68 27 \n' +
						' 67 '
				);
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' move 67 9H→TC'
				);
			});

			test('invalid cards', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H 9H       TC    \n' + // 9H is in the wrong place
						//                  9H
						' move 67 9H→TC\n' +
						':h shuffle32 5\n' +
						' 53 6a 65 67 85 a8 68 27 \n' +
						' 67 '
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H 9H       TC    \n' +
						' invalid move 67 9H→TC\n' +
						' init with invalid history replay cards'
				);
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H 9H      >TC    \n' +
						' invalid move 67 9H→TC'
				);
				expect(game.history).toEqual(['init with invalid history replay cards', 'invalid move 67 9H→TC']);
				expect(game.previousAction).toEqual({
					text: 'invalid move 67 9H→TC',
					type: 'invalid',
				});
			});

			test('invalid cards: move has not happened yet', () => {
				// the state is invalid, don't try to correct it
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' + // 9H is in the previous place
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						//                  9H
						' move 67 9H→TC\n' +
						':h shuffle32 5\n' +
						' 53 6a 65 67 85 a8 68 27 \n' +
						' 67 '
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						' invalid move 67 9H→TC\n' +
						' init with invalid history replay cards'
				);
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						' invalid move 67 9H→TC'
				);
				expect(game.history).toEqual(['init with invalid history replay cards', 'invalid move 67 9H→TC']);
				expect(game.previousAction).toEqual({
					text: 'invalid move 67 9H→TC',
					type: 'invalid',
				});
			});

			test('invalid actionText', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' move 27 9H→TC\n' +
						':h shuffle32 5\n' +
						' 53 6a 65 67 85 a8 68 27 \n' +
						' 67 '
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' invalid move 27 9H→TC\n' +
						' init with invalid history replay action text'
				);
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' invalid move 27 9H→TC'
				);
				expect(game.history).toEqual(['init with invalid history replay action text', 'invalid move 27 9H→TC']);
				expect(game.previousAction).toEqual({
					text: 'invalid move 27 9H→TC',
					type: 'invalid',
				});
			});

			test('invalid actionText shorthand', () => {
				expect(() =>
					FreeCell.parse(
						'' + //
							'             AD 2C       \n' +
							' AH 8S 2D QS 4C    2S 3D \n' +
							' 5C AS 9C KH 4D    3C 4S \n' +
							' 3S 5D KC 3H KD    6S 8D \n' +
							' TD 7S JD 7H 8H    JC 7D \n' +
							' 5S QH 8C 9D KS    4H 6C \n' +
							' 2H    TH 6D QD    QC 5H \n' +
							' 9S    7C TS JS    JH    \n' +
							'       6H          TC    \n' +
							'                   9H    \n' +
							' move 23 9H→TC\n' +
							':h shuffle32 5\n' +
							' 53 6a 65 67 85 a8 68 27 \n' +
							' 67 '
					)
				).toThrow('invalid move actionText cascade "move 23 9H→TC" for cards w/ {"rank":"10","suit":"clubs","location":{"fixture":"cascade","data":[6,7]}}');
			});

			test('invalid moves', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' move 67 9H→TC\n' +
						':h shuffle32 5\n' +
						// ' 53 6a 65 67 85 a8 68 27 \n' + just take out all of these
						' 67 '
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' invalid move 67 9H→TC\n' +
						' init with invalid history replay cards'
				);
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' invalid move 67 9H→TC'
				);
				expect(game.history).toEqual(['init with invalid history replay cards', 'invalid move 67 9H→TC']);
				expect(game.previousAction).toEqual({
					text: 'invalid move 67 9H→TC',
					type: 'invalid',
				});
			});

			describe('different print', () => {
				test('trailing whitespace', () => {
					const game = FreeCell.parse(
						'' + //
							'             KC KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)\n' +
							':h shuffle32 1\n' +
							' 3a 32 7b 3c 37 37 b7 8b \n' +
							' 87 48 82 a8 4a 34 57 54 \n' +
							' 85 8d 87 c7 d7 b8 38 23 \n' +
							' 28 32 6b 6c 78 a3 73 7a \n' +
							' 7c 74 c7 67 63 56 8h b8 \n' +
							' 5b 51 b5 24 25 6h 6h 24 \n' +
							' 26 a4 37 2a 8h 4h 1h 17 \n' +
							' 1h 1b 8h 4h 4b 4c 4d a2 \n' +
							' 42 46 3h 7h 13' // missing last space; which I do _aaaallllllll_ the time
					);
					expect(game.history).toEqual(['init with invalid history trailing whitespace', 'invalid move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)']);
					expect(game.previousAction).toEqual({
						text: 'invalid move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)',
						type: 'invalid',
					});
				});

				test('any line trimmed whitespace', () => {
					// this doesn't happen as often because it tends to break a lot of other things
					// (the parser needs the leading whitespace or we don't get this far)
					const game = FreeCell.parse(
						'' + //
							'             KC KS KH KD \n' +
							'                         \n' +
							':    Y O U   W I N !    :\n' +
							'                         \n' +
							' move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)\n' +
							':h shuffle32 1\n' +
							' 3a 32 7b 3c 37 37 b7 8b\n' + // missing trailing spaces on all history lines
							' 87 48 82 a8 4a 34 57 54\n' +
							' 85 8d 87 c7 d7 b8 38 23\n' +
							' 28 32 6b 6c 78 a3 73 7a\n' +
							' 7c 74 c7 67 63 56 8h b8\n' +
							' 5b 51 b5 24 25 6h 6h 24\n' +
							' 26 a4 37 2a 8h 4h 1h 17\n' +
							' 1h 1b 8h 4h 4b 4c 4d a2\n' +
							' 42 46 3h 7h 13'
					);
					expect(game.history).toEqual(['init with invalid history whitespace lines', 'invalid move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)']);
					expect(game.previousAction).toEqual({
						text: 'invalid move 13 KD→cascade (auto-foundation 16263 JD,QD,KC,KS,KD)',
						type: 'invalid',
					});
				});
			});
		});
	});

	describe('no history, just previous', () => {
		describe('undo the one move', () => {
			test('valid move (success)', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' move 67 9H→TC'
				);
				expect(game.history).toEqual(['init without history', 'move 6⡀7⡇ 9H→TC']);
				const gameUndid = game.undo();
				expect(gameUndid.print()).toBe(
					'' + //
						'>            AD 2C       \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						' init without history'
				);

				// and if we replay that one move, we get back to where we started
				const gameRedid = gameUndid.moveByShorthand('67');
				expect(gameRedid).toEqual(game);
			});

			test('valid non-move', () => {
				const game = FreeCell.parse(
					'' + //
						' 4S 7S 2S    AH          \n' +
						' 8D 6C JS 3D 3H    8C 6S \n' +
						' 2H 9S QC 9C 7D    9H JD \n' +
						' 2C AC 5D 5C TS    QH KH \n' +
						' TH 6D 5H 4H TD    AD 6H \n' +
						' 7H 8S KS 3S KC   >AS|3C \n' +
						'    2D KD    QD    8H 4C \n' +
						'    5S QS    JC    7C    \n' +
						'    4D JH                \n' +
						'       TC                \n' +
						'       9D                \n' +
						' select 7 AS'
				);
				expect(game.history).toEqual(['init without history']);
				expect(game.undo()).toBe(game);
			});

			test('invalid as-stated', () => {
				const game = FreeCell.parse(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D>KS|   4H 6C \n' +
						' 2H    TH 6D|QD|   QC 5H \n' +
						' 9S    7C TS|JS|   JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' invalid move 54 KS-QD-JS→TS'
				);
				expect(game.history).toEqual(['init without history']);
				expect(game.previousAction).toEqual({
					text: 'invalid move 54 KS-QD-JS→TS',
					type: 'invalid',
				});
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D>KS|   4H 6C \n' +
						' 2H    TH 6D|QD|   QC 5H \n' +
						' 9S    7C TS|JS|   JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' invalid move 54 KS-QD-JS→TS'
				);
				expect(game.undo()).toBe(game);
			});

			describe('invalid move (illegal move)', () => {
				test('undo successful', () => {
					const game = FreeCell.parse(
						'' + //
							'             AD 2C       \n' +
							' AH 8S 2D QS 4C    2S 3D \n' +
							' 5C>AS 9C KH 4D    3C 4S \n' +
							' 3S 5D KC 3H KD    6S 8D \n' +
							' TD 7S JD 7H 8H    JC 7D \n' +
							' 5S QH 8C 9D KS    4H 6C \n' +
							' 2H    TH 6D QD    QC 5H \n' +
							' 9S    7C TS JS    JH    \n' +
							'       6H          TC    \n' +
							'                   9H    \n' +
							' move 65 KS-QD-JS→8H' // this is an illegal move
					);
					expect(game.history).toEqual(['init with invalid move redid']);
					expect(game.previousAction).toEqual({
						text: 'invalid move 6⡀5⡃ KS-QD-JS→8H',
						type: 'invalid',
					});
					expect(game.print()).toBe(
						'' + //
							'             AD 2C       \n' +
							' AH 8S 2D QS 4C    2S 3D \n' +
							' 5C>AS 9C KH 4D    3C 4S \n' +
							' 3S 5D KC 3H KD    6S 8D \n' +
							' TD 7S JD 7H 8H    JC 7D \n' +
							' 5S QH 8C 9D KS    4H 6C \n' +
							' 2H    TH 6D QD    QC 5H \n' +
							' 9S    7C TS JS    JH    \n' +
							'       6H          TC    \n' +
							'                   9H    \n' +
							' invalid move 65 KS-QD-JS→8H'
					);
					expect(game.undo()).toBe(game);
				});

				test('undo unsuccessful', () => {
					const game = FreeCell.parse(
						'' + //
							'             AD 2C       \n' +
							' AH 8S 2D QS 4C    2S 3D \n' +
							' 5C>AS 9C KH 4D    3C 4S \n' +
							' 3S 5D KC 3H KD    6S 8D \n' +
							' TD 7S JD 7H 8H    JC 7D \n' +
							' 5S QH 8C 9D KS    4H 6C \n' +
							' 2H    TH 6D QD    QC 5H \n' +
							' 9S    7C TS JS    JH    \n' +
							'       6H          TC    \n' +
							'                   9H    \n' +
							' move 21 AS→9S' // this is an illegal move
					);
					expect(game.history).toEqual(['init with invalid move undid']);
					expect(game.previousAction).toEqual({
						text: 'invalid move 21 AS→9S',
						type: 'invalid',
					});
					expect(game.print()).toBe(
						'' + //
							'             AD 2C       \n' +
							' AH 8S 2D QS 4C    2S 3D \n' +
							' 5C>AS 9C KH 4D    3C 4S \n' +
							' 3S 5D KC 3H KD    6S 8D \n' +
							' TD 7S JD 7H 8H    JC 7D \n' +
							' 5S QH 8C 9D KS    4H 6C \n' +
							' 2H    TH 6D QD    QC 5H \n' +
							' 9S    7C TS JS    JH    \n' +
							'       6H          TC    \n' +
							'                   9H    \n' +
							' invalid move 21 AS→9S'
					);
					expect(game.undo()).toBe(game);
				});
			});

			describe('invalid move (produces invalid action)', () => {
				test('invalid first card pile', () => {
					const gamePrint =
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' move ab 9H→TC'; // this is wrong (cursor is on '7 TC', ab are cells)
					expect(() => FreeCell.parse(gamePrint, { throwError: true })).toThrow('invalid first card pile: move ab 9H→TC; 7 !== b');
					const game = FreeCell.parse(gamePrint);
					expect(game.history).toEqual(['init with invalid move undid']);
					expect(game.undo()).toBe(game);
				});

				test('invalid sequence', () => {
					const gamePrint =
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H         >TC    \n' +
						'                   9H    \n' +
						' move a7 9H-8C→TC'; // this is wrong (this isn't the sequence in the cascade)
					expect(() => FreeCell.parse(gamePrint, { throwError: true })).toThrow('invalid sequence: move a7 9H-8C→TC; 9H !== 9H-8C');
					const game = FreeCell.parse(gamePrint);
					expect(game.history).toEqual(['init with invalid move undid']);
					expect(game.undo()).toBe(game);
				});
			});
		});
	});

	// correct should be correct
	// incorrect… shouldn't break
	describe('flashCards', () => {
		test('basic', () => {
			const game = new FreeCell().shuffle32(5).dealAll().$checkCanFlourish();
			expect(game.print()).toBe(
				'' + //
					'>                        \n' +
					'*AH*8S 2D QS 4C 9H 2S 3D \n' +
					' 5C*AS*9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' juice flash AH,AS'
			);
			expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards']);
			expect(game.flashCards).toEqual([
				{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [0, 0] } },
				{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
			]);
			expect(game.previousAction).toEqual({
				text: 'juice flash AH,AS',
				type: 'juice',
				gameFunction: 'check-can-flourish',
			});

			const parsedGame = FreeCell.parse(game.print());
			expect(parsedGame.history).toEqual(['init without history']);
			expect(parsedGame.flashCards).toEqual([
				{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [0, 0] } },
				{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
			]);
			expect(parsedGame.previousAction).toEqual({
				text: 'juice flash AH,AS',
				type: 'juice',
				gameFunction: 'check-can-flourish',
			});

			expect(_omit(parsedGame, 'history')).toEqual(_omit(game, 'history'));
		});

		// we don't care, it just parses the line… (optional-complexity)
		test('flash does not match flourish', () => {
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash AD'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					' AH 8S 2D QS 4C 9H 2S 3D \n' +
					' 5C AS 9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S*AD*7C TS             \n' +
					' invalid juice flash AD'
			);
		});

		// we don't care, it just parses the line… (optional-complexity)
		test('flash does not match flourish52', () => {
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash *AD*'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					' AH 8S 2D QS 4C 9H 2S 3D \n' +
					' 5C AS 9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S*AD*7C TS             \n' +
					' invalid juice flash *AD*'
			);
		});

		test('flash any cards', () => {
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash *KH*'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					' AH 8S 2D QS 4C 9H 2S 3D \n' +
					' 5C AS 9C*KH*4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' invalid juice flash *KH*'
			);

			// TODO (flourish-anim) (test) check flashCards with useCardPositionAnimations
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash AH,8S,2D,QS,4C,9H,2S,3D'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					'*AH*8S*2D*QS*4C*9H*2S*3D*\n' +
					' 5C AS 9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' invalid juice flash AH,8S,2D,QS,4C,9H,2S,3D'
			);

			// TODO (flourish-anim) (test) check flashCards with useCardPositionAnimations
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash AH,AS,2D,KH,4C,2C,2S,4S'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					'*AH*8S*2D*QS*4C*9H*2S*3D \n' +
					' 5C*AS*9C*KH*4D*2C*3C*4S*\n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' invalid juice flash AH,AS,2D,KH,4C,2C,2S,4S'
			);

			// TODO (flourish-anim) (test) check flashCards with useCardPositionAnimations
			expect(
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash AH,5C,3S,TD,5S,2H,9S'
				).print()
			).toBe(
				'' + //
					'>                        \n' +
					'*AH*8S 2D QS 4C 9H 2S 3D \n' +
					'*5C*AS 9C KH 4D 2C 3C 4S \n' +
					'*3S*5D KC 3H KD 5H 6S 8D \n' +
					'*TD*7S JD 7H 8H JH JC 7D \n' +
					'*5S*QH 8C 9D KS QD 4H AC \n' +
					'*2H*TC TH 6D 6H 6C QC JS \n' +
					'*9S*AD 7C TS             \n' +
					' invalid juice flash AH,5C,3S,TD,5S,2H,9S'
			);
		});

		test('invalid flash text', () => {
			expect(() =>
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash 9@'
				)
			).toThrow('invalid juice actionText: juice flash 9@');
		});

		test('flash invalid cards', () => {
			expect(() =>
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash HK'
				)
			).toThrow('invalid rank shorthand: "H"');
		});

		test('joker not present in game settings', () => {
			expect(() =>
				FreeCell.parse(
					'' + //
						'>                        \n' +
						'*AH*8S 2D QS 4C 9H 2S 3D \n' +
						' 5C*AS*9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' juice flash WS'
				)
			).toThrow('missing card WS');
		});
	});

	describe('selection', () => {
		test('history with selection', () => {
			const game = FreeCell.parse(
				'' + //
					' TD       TC AH 2S       \n' +
					' QD AC AD 5D 9H JH 4H 6S \n' +
					' 2H 4C QS KD 8C 5C>6D|QH \n' +
					' 3D 8H 3S 2D 3H 8D|5S|JS \n' +
					' JD 4S 2C KC 7C JC|4D|TS \n' +
					' 7S 9D 6H 7D    QC|3C|7H \n' +
					' 9S TH    6C    KS    9C \n' +
					' 8S KH    5H             \n' +
					' move 54 6C-5H→7D\n' +
					':h shuffle32 27571\n' +
					' 34 4d d4 4d d4 5d 75 74 \n' +
					' 47 4a 54 '
			);

			expect(game.cursor).toEqual({ fixture: 'cascade', data: [6, 1] });
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [6, 1] },
				cards: [
					{ rank: '6', suit: 'diamonds', location: { fixture: 'cascade', data: [6, 1] } },
					{ rank: '5', suit: 'spades', location: { fixture: 'cascade', data: [6, 2] } },
					{ rank: '4', suit: 'diamonds', location: { fixture: 'cascade', data: [6, 3] } },
					{ rank: '3', suit: 'clubs', location: { fixture: 'cascade', data: [6, 4] } },
				],
				peekOnly: false,
			});
			expect(game.availableMoves).toEqual([]);
		});

		describe('within deck', () => {
			test('cursor at selection', () => {
				const game = FreeCell.parse(
					'' + //
						'                         \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH>AD|AC \n' +
						' select k AD'
				);
				expect(game.cursor).toEqual({ fixture: 'deck', data: [1] });
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [1] },
					cards: [{ rank: 'ace', suit: 'diamonds', location: { fixture: 'deck', data: [1] } }],
					peekOnly: true,
				});
				expect(game.availableMoves).toEqual([]);
			});

			test('cursor after selection', () => {
				const game = FreeCell.parse(
					'' + //
						'                         \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH|AD>AC \n' +
						' select k AD'
				);
				expect(game.cursor).toEqual({ fixture: 'deck', data: [0] });
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [1] },
					cards: [{ rank: 'ace', suit: 'diamonds', location: { fixture: 'deck', data: [1] } }],
					peekOnly: true,
				});
				expect(game.availableMoves).toEqual([]);
			});

			test('last card selected', () => {
				const game = FreeCell.parse(
					'' + //
						'                         \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS>AH AD|AC|\n' +
						' select k AC'
				);
				expect(game.cursor).toEqual({ fixture: 'deck', data: [2] });
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [0] },
					cards: [{ rank: 'ace', suit: 'clubs', location: { fixture: 'deck', data: [0] } }],
					peekOnly: true,
				});
				expect(game.availableMoves).toEqual([]);
			});

			test('invalid selection', () => {
				// it just grabs the first one that looks right, and drops the rest
				// this isn't designed behavior, it's just what happens
				// the important part i that it produces something sensible
				const game = FreeCell.parse(
					'' + //
						'                         \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D>2C AS|AH|AD|AC|\n' +
						' cursor set k 2C'
				);
				expect(game.cursor).toEqual({ fixture: 'deck', data: [4] });
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [2] },
					cards: [{ rank: 'ace', suit: 'hearts', location: { fixture: 'deck', data: [2] } }],
					peekOnly: true,
				});
				expect(game.availableMoves).toEqual([]);
			});
		});

		describe('selection next to cursor', () => {
			describe('home', () => {
				test('cell 0', () => {
					const game = FreeCell.parse(
						'' + //
							'>KC|KD|KH KS QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
					expect(game.selection).toEqual({
						location: { fixture: 'cell', data: [1] },
						cards: [{ rank: 'king', suit: 'diamonds', location: { fixture: 'cell', data: [1] } }],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							'>KC|KD|KH KS QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('cell 1', () => {
					const game = FreeCell.parse(
						'' + //
							' KC>KD|KH|KS QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
					expect(game.selection).toEqual({
						location: { fixture: 'cell', data: [2] },
						cards: [{ rank: 'king', suit: 'hearts', location: { fixture: 'cell', data: [2] } }],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							' KC>KD|KH|KS QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('cell 2', () => {
					const game = FreeCell.parse(
						'' + //
							' KC KD>KH|KS|QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cell', data: [2] });
					expect(game.selection).toEqual({
						location: { fixture: 'cell', data: [3] },
						cards: [{ rank: 'king', suit: 'spades', location: { fixture: 'cell', data: [3] } }],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							' KC KD>KH|KS|QC QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('cell 3', () => {
					const game = FreeCell.parse(
						'' + //
							' KC KD KH>KS|QC|QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cell', data: [3] });
					expect(game.selection).toEqual({
						location: { fixture: 'foundation', data: [0] },
						cards: [{ rank: 'queen', suit: 'clubs', location: { fixture: 'foundation', data: [0] } }],
						peekOnly: true,
					});
					expect(game.print()).toBe(
						'' + //
							' KC KD KH>KS|QC|QD QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('foundation 0', () => {
					const game = FreeCell.parse(
						'' + //
							' KC KD KH KS>QC|QD|QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
					expect(game.selection).toEqual({
						location: { fixture: 'foundation', data: [1] },
						cards: [{ rank: 'queen', suit: 'diamonds', location: { fixture: 'foundation', data: [1] } }],
						peekOnly: true,
					});
					expect(game.print()).toBe(
						'' + //
							' KC KD KH KS>QC|QD|QH QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('foundation 1', () => {
					const game = FreeCell.parse(
						'' + //
							' KC KD KH KS QC>QD|QH|QS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [1] });
					expect(game.selection).toEqual({
						location: { fixture: 'foundation', data: [2] },
						cards: [{ rank: 'queen', suit: 'hearts', location: { fixture: 'foundation', data: [2] } }],
						peekOnly: true,
					});
					expect(game.print()).toBe(
						'' + //
							' KC KD KH KS QC>QD|QH|QS \n' +
							'                         \n' +
							' hand-jammed'
					);
				});

				test('foundation 2', () => {
					const game = FreeCell.parse(
						'' + //
							' KC KD KH KS QC QD>QH|QS|\n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [2] });
					expect(game.selection).toEqual({
						location: { fixture: 'foundation', data: [3] },
						cards: [{ rank: 'queen', suit: 'spades', location: { fixture: 'foundation', data: [3] } }],
						peekOnly: true,
					});
					expect(game.print()).toBe(
						'' + //
							' KC KD KH KS QC QD>QH|QS|\n' +
							'                         \n' +
							' hand-jammed'
					);
				});
			});

			describe('cascade', () => {
				test('0,0 full + 1,0 selected', () => {
					const game = FreeCell.parse(
						'' + //
							'             TC 8D KH KS \n' +
							'>9D|TD|KC KD             \n' +
							'       QD QC             \n' +
							'       JC JD             \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 0] });
					expect(game.selection).toEqual({
						location: { fixture: 'cascade', data: [1, 0] },
						cards: [{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 0] } }],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							'             TC 8D KH KS \n' +
							'>9D|TD|KC KD             \n' +
							'       QD QC             \n' +
							'       JC JD             \n' +
							' hand-jammed'
					);
				});

				test('0,0 empty + 1,0 selected', () => {
					const game = FreeCell.parse(
						'' + //
							'             TC 8D KH KS \n' +
							'>  |TD|KC KD    9D       \n' +
							'       QD QC             \n' +
							'       JC JD             \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 0] });
					expect(game.selection).toEqual({
						location: { fixture: 'cascade', data: [1, 0] },
						cards: [{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 0] } }],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							'             TC 8D KH KS \n' +
							'>  |TD|KC KD    9D       \n' +
							'       QD QC             \n' +
							'       JC JD             \n' +
							' hand-jammed'
					);
				});

				test('0,1 empty + 1,1 selected', () => {
					const game = FreeCell.parse(
						'' + //
							'             JC TD KH KS \n' +
							' KC KD                   \n' +
							'>QD|QC|                  \n' +
							'   |JD|                  \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 1] });
					expect(game.selection).toEqual({
						location: { fixture: 'cascade', data: [1, 1] },
						cards: [
							{ rank: 'queen', suit: 'clubs', location: { fixture: 'cascade', data: [1, 1] } },
							{ rank: 'jack', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 2] } },
						],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							'             JC TD KH KS \n' +
							' KC KD                   \n' +
							'>QD|QC|                  \n' +
							'   |JD|                  \n' +
							' hand-jammed'
					);
				});

				test('2,1 empty + 2,1 selected', () => {
					const game = FreeCell.parse(
						'' + //
							'             JC 8D KH KS \n' +
							'    TD KC KD    9D       \n' +
							'      >  |QC|   QD       \n' +
							'         |JD|            \n' +
							' hand-jammed'
					);
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] }); // cursor moves up to valid card
					expect(game.selection).toEqual({
						location: { fixture: 'cascade', data: [3, 1] },
						cards: [
							{ rank: 'queen', suit: 'clubs', location: { fixture: 'cascade', data: [3, 1] } },
							{ rank: 'jack', suit: 'diamonds', location: { fixture: 'cascade', data: [3, 2] } },
						],
						peekOnly: false,
					});
					expect(game.print()).toBe(
						'' + //
							'             JC 8D KH KS \n' +
							'    TD>KC KD    9D       \n' +
							'         |QC|   QD       \n' +
							'         |JD|            \n' +
							' hand-jammed'
					);
				});
			});

			test.todo('deck');
		});

		describe('various valid selections', () => {
			const cursor_locations = Object.freeze([
				'{ "fixture": "cell", "data": [0] }',
				'{ "fixture": "cell", "data": [1] }',
				'{ "fixture": "cell", "data": [2] }',
				'{ "fixture": "cell", "data": [3] }',
				'{ "fixture": "foundation", "data": [0] }',
				'{ "fixture": "foundation", "data": [1] }',
				'{ "fixture": "foundation", "data": [2] }',
				'{ "fixture": "foundation", "data": [3] }',
				'{ "fixture": "cascade", "data": [0, 0] }',
				'{ "fixture": "cascade", "data": [1, 0] }',
				'{ "fixture": "cascade", "data": [2, 0] }',
				'{ "fixture": "cascade", "data": [3, 0] }',
				'{ "fixture": "cascade", "data": [4, 0] }',
				'{ "fixture": "cascade", "data": [5, 0] }',
				'{ "fixture": "cascade", "data": [6, 0] }',
				'{ "fixture": "cascade", "data": [7, 0] }',
				'{ "fixture": "cascade", "data": [0, 1] }',
				'{ "fixture": "cascade", "data": [1, 1] }',
				'{ "fixture": "cascade", "data": [2, 1] }',
				'{ "fixture": "cascade", "data": [3, 1] }',
				'{ "fixture": "cascade", "data": [4, 1] }',
				'{ "fixture": "cascade", "data": [5, 1] }',
				'{ "fixture": "cascade", "data": [6, 1] }',
				'{ "fixture": "cascade", "data": [7, 1] }',
			]);
			const selection_locations = Object.freeze(cursor_locations.filter((l) => !l.includes('foundation')));
			let game: FreeCell;
			beforeEach(() => {
				game = FreeCell.parse(
					'' + //
						'>9C 9D 9H 9S 8C 8D 8H 8S \n' +
						' JC JD JH JS TC TD TH TS \n' +
						' KC KD KH KS QC QD QH QS \n' +
						' hand-jammed'
				);
			});

			describe.each(selection_locations)('selection %s', (s) => {
				test.each(cursor_locations)('cursor %s', (c) => {
					const selection_location = JSON.parse(s) as CardLocation;
					const cursor_location = JSON.parse(c) as CardLocation;

					const g2 = game.setCursor(selection_location).touch().setCursor(cursor_location);
					expect(g2.cursor).toEqual(cursor_location);
					expect(g2.selection?.location).toEqual(selection_location);

					const g2Print = g2.print();
					expect(g2Print).toBe(FreeCell.parse(g2.print()).print());

					// there is always 1 cursor
					expect((g2Print.match(/>/g) ?? []).length).toBe(1);

					// there is always 2 selection bars (in these cases, no squences), unless...
					let selCount = 2;
					// the cursor and selection are the same (overlaps left)
					if (c === s) selCount = 1;
					// the curror is immediatly after the selection (overlaps right)
					if (
						cursor_location.fixture === selection_location.fixture &&
						cursor_location.data[0] === selection_location.data[0] + 1 &&
						cursor_location.data[1] === selection_location.data[1]
					)
						selCount = 1;
					// special case for curror is immediatly after the selection (straddles home row, overlaps right)
					// (no special case for left, because they would be the same location)
					if (c === '{ "fixture": "foundation", "data": [0] }' && s === '{ "fixture": "cell", "data": [3] }') selCount = 1;
					expect((g2Print.match(/\|/g) ?? []).length).toBe(selCount);
				});
			});
		});

		describe('invalid selections', () => {
			test.todo('selected whole column');

			test.todo('multiple selections');

			test.todo('just a bunch of vertical pipes');
		});
	});

	describe('detect cursor location', () => {
		test('move … (auto-foundation …)', () => {
			const game = FreeCell.parse(
				'' + //
					'             KH KC KS KD \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 42 JS→QH (auto-foundation 45656788a355782833552123 7H,8C,8S,9D,8H,9C,9S,TD,9H,TC,TS,JD,TH,JC,JS,QD,JH,QC,QS,KD,QH,KC,KS,KH)\n' +
					' hand-jammed'
			);
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
			expect(game.print()).toBe(
				'' + //
					'            >KH KC KS KD \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 42 JS→QH (auto-foundation 45656788a355782833552123 7H,8C,8S,9D,8H,9C,9S,TD,9H,TC,TS,JD,TH,JC,JS,QD,JH,QC,QS,KD,QH,KC,KS,KH)'
			);
		});
	});
});
