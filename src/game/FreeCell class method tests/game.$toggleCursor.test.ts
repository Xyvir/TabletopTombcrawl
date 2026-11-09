import { describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';

describe('game.$toggleCursor', () => {
	describe('examples', () => {
		test('one', () => {
			let game = new FreeCell().shuffle32(7852).dealAll().moveCursor('left').moveCursor('down').moveCursor('left').$touchAndMove(); // space bar
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' JS 9S 2C TC 8D 5C 3H 2H \n' +
					' 9D 8C 9H 5H JD AH 7D JC \n' +
					' 7S 2S 6S 4H TH TD AS 7H \n' +
					' KC 3S 2D AC JH KD 5D 8H \n' +
					' 3D QH QD 7C QS TS 6C KS \n' +
					' KH QC 8S AD 9C 4C    4S \n' +
					' 6H 3C 6D>5S             \n' +
					'          4D             \n' +
					' move 74 4D→5S'
			);

			expect(game.previousAction.text).toBe('move 7⡅4⡆ 4D→5S');
			expect(game.$toggleCursor().previousAction.text).toBe('cursor set 7⡄ 6C');
			expect(game.$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 4⡆ 5S');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 7⡄ 6C');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 4⡆ 5S');

			// okay, moving on
			// see how much easier this iw with toggleCursor
			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡄a 6C→cell');
			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡃b 5D→cell (auto-foundation 7 AS)');
			game = game.moveCursor('left').$touchAndMove();
			expect(game.previousAction.text).toBe('move a7⡁ 6C→7D');
			game = game.$toggleCursor().moveCursor('right').$touchAndMove();
			expect(game.previousAction.text).toBe('move b7⡂ 5D→6C');

			expect(game.__printHistory(true)).toBe(
				'\n' + //
					':h shuffle32 7852\n' +
					' 74 7a 7b a7 b7 '
			);
		});

		test('two', () => {
			// same setup as one, but different moves
			let game = new FreeCell().shuffle32(7852).dealAll().moveCursor('left').moveCursor('down').moveCursor('left').$touchAndMove(); // space bar
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' JS 9S 2C TC 8D 5C 3H 2H \n' +
					' 9D 8C 9H 5H JD AH 7D JC \n' +
					' 7S 2S 6S 4H TH TD AS 7H \n' +
					' KC 3S 2D AC JH KD 5D 8H \n' +
					' 3D QH QD 7C QS TS 6C KS \n' +
					' KH QC 8S AD 9C 4C    4S \n' +
					' 6H 3C 6D>5S             \n' +
					'          4D             \n' +
					' move 74 4D→5S'
			);

			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡄a 6C→cell');
			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡃b 5D→cell (auto-foundation 7 AS)');
			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡁c 7D→cell');
			game = game.$toggleCursor().$touchAndMove();
			expect(game.previousAction.text).toBe('move 7⡀8⡅ 3H→4S');
			expect(game.print()).toBe(
				'' + //
					' 6C 5D 7D    AS          \n' +
					' JS 9S 2C TC 8D 5C    2H \n' +
					' 9D 8C 9H 5H JD AH    JC \n' +
					' 7S 2S 6S 4H TH TD    7H \n' +
					' KC 3S 2D AC JH KD    8H \n' +
					' 3D QH QD 7C QS TS    KS \n' +
					' KH QC 8S AD 9C 4C   >4S \n' +
					' 6H 3C 6D 5S          3H \n' +
					'          4D             \n' +
					' move 78 3H→4S'
			);

			// now we need to do a bit to get 7D into the right place
			game = game
				.moveCursor('right')
				.moveCursor('right')
				.moveCursor('right')
				.moveCursor('up')
				.moveCursor('up')
				.moveCursor('up')
				.moveCursor('up')
				.moveCursor('up')
				.moveCursor('up')
				.$touchAndMove();
			expect(game.previousAction.text).toBe('move c7 7D→cascade');
			// but now it's easy again
			game = game.$toggleCursor().moveCursor('left').moveCursor('left').$touchAndMove();
			expect(game.previousAction.text).toBe('move a7⡀ 6C→7D');
			game = game.$toggleCursor().moveCursor('right').$touchAndMove();
			expect(game.previousAction.text).toBe('move b7⡁ 5D→6C');
			// okay, this last one is a little far
			game = game.moveCursor('right').moveCursor('down').moveCursor('down').moveCursor('down').moveCursor('down').$touchAndMove();
			expect(game.previousAction.text).toBe('move 8⡅7⡂ 4S-3H→5D');

			expect(game.print({ includeHistory: true })).toBe(
				'' + //
					'             AS          \n' +
					' JS 9S 2C TC 8D 5C 7D 2H \n' +
					' 9D 8C 9H 5H JD AH 6C JC \n' +
					' 7S 2S 6S 4H TH TD 5D 7H \n' +
					' KC 3S 2D AC JH KD 4S 8H \n' +
					' 3D QH QD 7C QS TS 3H KS \n' +
					' KH QC 8S AD 9C 4C       \n' +
					' 6H 3C 6D 5S             \n' +
					'          4D             \n' +
					' move 87 4S-3H→5D\n' +
					':h shuffle32 7852\n' +
					' 74 7a 7b 7c 78 c7 a7 b7 \n' +
					' 87 '
			);
		});
	});

	describe('deck', () => {
		test('with cards', () => {
			// deal 44 cards keeps the cursor in the deck (after)
			const gameDealMost = new FreeCell().dealAll({ demo: true, keepDeck: true });
			expect(gameDealMost.deck.length).toBe(8);
			expect(gameDealMost.__printDeck()).toBe('>2S 2H 2D 2C AS AH AD AC ');

			expect(gameDealMost.cursor.fixture).toEqual('deck');
			expect(gameDealMost.$toggleCursor().cursor.fixture).toEqual('deck');
			expect(gameDealMost.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');
			expect(gameDealMost.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');

			expect(gameDealMost.previousAction.text).toBe('deal 44 cards');
			expect(gameDealMost.$toggleCursor().previousAction.text).toBe('cursor set k⡇ 2S');
			expect(gameDealMost.$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set k⡇ 2S');
			expect(gameDealMost.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set k⡇ 2S');
		});

		/*
		t('allowEmptyDeck', () => {
			// dealing all cards moves the cursor to a cell
			const gameAllCards = new FreeCell().dealAll();
			expect(gameAllCards.deck.length).toBe(0);

			expect(gameAllCards.cursor.fixture).toEqual('cell');
			expect(gameAllCards.$toggleCursor().cursor.fixture).toEqual('cell');
			expect(gameAllCards.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('cell');
			expect(gameAllCards.$toggleCursor({ allowEmptyDeck: true }).cursor.fixture).toEqual('deck');
			expect(gameAllCards.$toggleCursor({ allowEmptyDeck: true }).$toggleCursor({ allowEmptyDeck: true }).cursor.fixture).toEqual('cell');

			expect(gameAllCards.previousAction.text).toBe('deal all cards');
			expect(gameAllCards.$toggleCursor().previousAction.text).toEqual('cursor set a');
			expect(gameAllCards.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set a');
			expect(gameAllCards.$toggleCursor({ allowEmptyDeck: true }).previousAction.text).toEqual('cursor set k');
			expect(gameAllCards.$toggleCursor({ allowEmptyDeck: true }).$toggleCursor({ allowEmptyDeck: true }).previousAction.text).toEqual('cursor set a');
		});
		*/
	});

	describe('foundation', () => {
		test('manually move to empty', () => {
			const game = new FreeCell()
				.dealAll()
				.$selectCard('AC')
				.setCursor({ fixture: 'foundation', data: [2] })
				.touch({ autoFoundation: false });
			expect(game.previousAction).toEqual({
				type: 'move',
				text: 'move 4⡆h⡂ AC→foundation',
			});

			expect(game.cursor.fixture).toEqual('foundation');
			expect(game.$toggleCursor().cursor.fixture).toEqual('cascade');
			expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('cascade');

			expect(game.previousAction.text).toBe('move 4⡆h⡂ AC→foundation');
			expect(game.$toggleCursor().previousAction.text).toEqual('cursor set 4⡅ 3C');
			expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡂ AC');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set 4⡅ 3C');
		});

		test('manually move to not empty', () => {
			const game = new FreeCell()
				.dealAll()
				.$selectCard('AD')
				.setCursor({ fixture: 'foundation', data: [3] })
				.touch({ autoFoundation: false })
				.$touchAndMove('2D', { autoFoundation: false });
			expect(game.previousAction).toEqual({
				type: 'move',
				text: 'move 7⡅h⡃ 2D→AD',
			});

			expect(game.cursor.fixture).toEqual('foundation');
			expect(game.$toggleCursor().cursor.fixture).toEqual('cascade');
			expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('cascade');

			expect(game.previousAction.text).toBe('move 7⡅h⡃ 2D→AD');
			expect(game.$toggleCursor().previousAction.text).toEqual('cursor set 7⡄ 4D');
			expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡃ 2D');
			expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set 7⡄ 4D');
		});

		describe('gameFunction: recall-or-bury', () => {
			describe('foundation→deck', () => {
				test('empty', () => {
					const game = FreeCell.parse(
						'' + //
							'>QC QD QH QS TC|TD|TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							' hand-jammed'
					)
						.setCursor({ fixture: 'deck', data: [0] })
						.touch({ gameFunction: 'recall-or-bury' });
					expect(game.print()).toBe(
						'' + //
							' QC QD QH QS TC 9D TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							':d>TD \n' +
							' invalid move hk TD→deck'
					);
					expect(game.previousAction).toEqual({
						type: 'move',
						text: 'invalid move h⡁k TD→deck',
						gameFunction: 'recall-or-bury',
					});

					expect(game.cursor.fixture).toEqual('deck');
					expect(game.$toggleCursor().cursor.fixture).toEqual('foundation');
					expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');
					expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');

					expect(game.previousAction.text).toBe('invalid move h⡁k TD→deck');
					expect(game.$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
					expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set k⡀ TD');
					expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
				});

				describe('not empty', () => {
					test.todo('pile');

					test('first', () => {
						const game = FreeCell.parse(
							'' + //
								'>            TC|TD|TH TS \n' +
								'             JC JD JH JS \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'deck', data: [99] })
							.touch({ gameFunction: 'recall-or-bury' });
						expect(game.cursor).toEqual({ fixture: 'deck', data: [7] });
						expect(game.print()).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d TD>KS KH KD KC QS QH QD QC \n' +
								' invalid move hk TD→KS'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d TD KS KH KD KC QS QH QD QC \n' +
								' invalid move h⡁k⡇ TD→KS\n' +
								' hand-jammed'
						);
						expect(game.previousAction).toEqual({
							type: 'move',
							text: 'invalid move h⡁k⡇ TD→KS',
							gameFunction: 'recall-or-bury',
						});

						expect(game.cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().cursor.fixture).toEqual('foundation');
						expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');

						expect(game.previousAction.text).toBe('invalid move h⡁k⡇ TD→KS');
						expect(game.$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
						expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set k⡇ KS');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
					});

					test('middle', () => {
						const game = FreeCell.parse(
							'' + //
								'>            TC|TD|TH TS \n' +
								'             JC JD JH JS \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'deck', data: [3] })
							.touch({ gameFunction: 'recall-or-bury' });
						expect(game.cursor).toEqual({ fixture: 'deck', data: [3] });
						expect(game.print()).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d KS KH KD KC TD>QS QH QD QC \n' +
								' invalid move hk TD→QS'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d KS KH KD KC TD QS QH QD QC \n' +
								' invalid move h⡁k⡃ TD→QS\n' +
								' hand-jammed'
						);
						expect(game.previousAction).toEqual({
							type: 'move',
							text: 'invalid move h⡁k⡃ TD→QS',
							gameFunction: 'recall-or-bury',
						});

						expect(game.cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().cursor.fixture).toEqual('foundation');
						expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');

						expect(game.previousAction.text).toBe('invalid move h⡁k⡃ TD→QS');
						expect(game.$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
						expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set k⡃ QS');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
					});

					test('last', () => {
						const game = FreeCell.parse(
							'' + //
								'>            TC|TD|TH TS \n' +
								'             JC JD JH JS \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'deck', data: [0] })
							.touch({ gameFunction: 'recall-or-bury' });
						expect(game.cursor).toEqual({ fixture: 'deck', data: [0] });
						expect(game.print()).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d KS KH KD KC QS QH QD TD>QC \n' +
								' invalid move hk TD→QC'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             TC 9D TH TS \n' +
								'             JC JD JH JS \n' +
								':d KS KH KD KC QS QH QD TD QC \n' +
								' invalid move h⡁k⡀ TD→QC\n' +
								' hand-jammed'
						);
						expect(game.previousAction).toEqual({
							type: 'move',
							text: 'invalid move h⡁k⡀ TD→QC',
							gameFunction: 'recall-or-bury',
						});

						expect(game.cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().cursor.fixture).toEqual('foundation');
						expect(game.$toggleCursor().$toggleCursor().cursor.fixture).toEqual('deck');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().cursor.fixture).toEqual('foundation');

						expect(game.previousAction.text).toBe('invalid move h⡁k⡀ TD→QC');
						expect(game.$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
						expect(game.$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set k⡀ QC');
						expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toEqual('cursor set h⡁ 9D');
					});
				});
			});

			test.todo('deck→foundation');
		});

		describe('semi-unrelated', () => {
			// foundation is incidental
			test('move-foundation', () => {
				const gamePrint =
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
					' 13 27 67 52 53 56 ';
				const game = FreeCell.parse(gamePrint);
				expect(game.print({ includeHistory: true })).toBe(gamePrint);
				expect(game.previousAction).toEqual({
					text: 'move 5⡂6 KD→cascade (auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'king', suit: 'diamonds', location: { fixture: 'cascade', data: [5, 0] } }],
				});
				expect(game.$toggleCursor().previousAction.text).toBe('cursor set 6');
				expect(game.$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 5');
				expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 6');
			});

			// foundation is incidental
			test('auto-foundation', () => {
				const gamePrint =
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
					' 13 27 67 52 53 56 ';

				const game = FreeCell.parse(gamePrint).undo().moveByShorthand('56', { autoFoundation: false });
				expect(game.previousAction).toEqual({
					text: 'move 5⡂6 KD→cascade',
					type: 'move',
				});
				expect(game.$toggleCursor().previousAction.text).toBe('cursor set 5⡁ 4D');
				expect(game.$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 6⡀ KD');
				expect(game.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 5⡁ 4D');

				// BUG (cursor) cannot toggleCursor when previous move is auto-foundation
				//  - this isn't the end of the world
				//  - it's not standard gameplay anymore
				const gameAutoFoundation = game.autoFoundationAll();
				expect(gameAutoFoundation.previousAction).toEqual({
					text: 'auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC',
					type: 'auto-foundation',
				});
				expect(gameAutoFoundation.$toggleCursor().previousAction.text).toBe(
					'auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC'
				);
				expect(gameAutoFoundation.$toggleCursor().$toggleCursor().previousAction.text).toBe(
					'auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC'
				);
				expect(gameAutoFoundation.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe(
					'auto-foundation 55748248278274382782733728827338278263 4D,4C,5H,5S,5D,5C,6H,6S,6D,6C,7H,7S,7D,7C,8H,8S,8D,8C,9H,9S,9D,9C,TH,TS,TD,TC,JH,JS,JD,JC,QH,QS,QD,QC,KH,KS,KD,KC'
				);
			});

			// not a move
			test('allowSelectFoundation', () => {
				const gamePrint =
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
					' 67 ';
				const game = FreeCell.parse(gamePrint);
				expect(game.print({ includeHistory: true })).toBe(gamePrint);
				expect(game.previousAction).toEqual({
					text: 'move 6⡀7⡇ 9H→TC',
					type: 'move',
				});
				expect(game.$selectCard('2C').previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				const gameSelectFoundation = game.$selectCard('2C', { allowSelectFoundation: true });
				expect(gameSelectFoundation.previousAction).toEqual({
					text: 'peek h⡁ 2C',
					type: 'select',
				});
				expect(gameSelectFoundation.$toggleCursor().previousAction.text).toBe('cursor set 7⡇ TC');
				expect(gameSelectFoundation.$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 6');
				expect(gameSelectFoundation.$toggleCursor().$toggleCursor().$toggleCursor().previousAction.text).toBe('cursor set 7⡇ TC');
			});
		});
	});
});
