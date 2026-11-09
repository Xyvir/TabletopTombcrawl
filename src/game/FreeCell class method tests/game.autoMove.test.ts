import { omit as _omit } from 'lodash';
import { describe, expect, test } from 'vitest';
import { availableMovesMinimized } from '@/game/testUtils';
import { FreeCell } from '@/game/game';
import { AvailableMove, MoveDestinationType } from '@/game/move/move';

describe('game.autoMove', () => {
	function collectUniquePriorities(availableMoves: AvailableMove[] | null) {
		if (!availableMoves) return {};
		const groupedPriorities = new Map<MoveDestinationType, Set<number>>();
		availableMoves.forEach((availableMove) => {
			let priorities = groupedPriorities.get(availableMove.moveDestinationType);
			if (!priorities) {
				priorities = new Set<number>();
				groupedPriorities.set(availableMove.moveDestinationType, priorities);
			}
			priorities.add(availableMove.priority);
		});
		return Object.fromEntries(groupedPriorities);
	}

	describe('scenarios', () => {
		describe('deck', () => {
			describe('prefers', () => {
				/** not that we _can_ play from the deck, but if we could, strait to home is best :D */
				test.todo('foundation');
			});
		});

		describe('cell', () => {
			test('cycle through cell', () => {
				let game = FreeCell.parse(
					'' + //
						'>JC          9C 9D 9H 9S \n' +
						' QC QD QH QS KC KD KH KS \n' +
						' TC TD TH TS    JD JH JS \n' +
						' hand-jammed'
				);

				game = game.touch();

				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
					['b', 'cell:empty', 7],
					['c', 'cell:empty', 6],
					['d', 'cell:empty', 5],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'   >JC       9C 9D 9H 9S \n' +
						' QC QD QH QS KC KD KH KS \n' +
						' TC TD TH TS    JD JH JS \n' +
						' move ab JC→cell'
				);

				game = game.touch();

				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['a', 4],
					['c', 6],
					['d', 5],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'      >JC    9C 9D 9H 9S \n' +
						' QC QD QH QS KC KD KH KS \n' +
						' TC TD TH TS    JD JH JS \n' +
						' move ac JC→cell'
				);

				game = game.touch();

				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['a', 4],
					['b', 3],
					['d', 5],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'         >JC 9C 9D 9H 9S \n' +
						' QC QD QH QS KC KD KH KS \n' +
						' TC TD TH TS    JD JH JS \n' +
						' move ad JC→cell'
				);

				game = game.touch();

				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['a', 4],
					['b', 3],
					['c', 2],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'>JC          9C 9D 9H 9S \n' +
						' QC QD QH QS KC KD KH KS \n' +
						' TC TD TH TS    JD JH JS \n' +
						' hand-jammed'
				);
			});

			describe('prefers', () => {
				/** if we prefer cells, it just cycles forever, we need to be able to move them up and down */
				test.todo('cascade:empty to cell');
			});
		});

		describe('foundation', () => {
			test.todo('cycles through foundation');

			test.todo('all non-foundation moves are not allowed');

			describe('prefers', () => {
				/** not that we _can_ play from a foundation, but if we could, we still can't take them down */
				test.todo('foundation');
			});
		});

		describe('cascade:single', () => {
			test('cycles through cascade:empty (4)', () => {
				let game = FreeCell.parse(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'>KC          \n' +
						' hand-jammed'
				);
				expect(game.tableau.length).toBe(4);

				game = game.touch();

				expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
					['2', 'cascade:empty', 7],
					['3', 'cascade:empty', 6],
					['4', 'cascade:empty', 5],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'   >KC       \n' +
						' move 12 KC→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false }).touch();

				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1', 4],
					['2', 3],
					['4', 5],
				]);

				game = game.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'         >KC \n' +
						' move 14 KC→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'>KC          \n' +
						' hand-jammed'
				);
			});

			test('cycles through cascade:empty (8)', () => {
				let game = FreeCell.parse(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'>KC                      \n' +
						' hand-jammed'
				);
				expect(game.tableau.length).toBe(8);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'   >KC                   \n' +
						' move 12 KC→cascade'
				);

				game = game
					.touch()
					.autoMove({ autoFoundation: false })
					.touch()
					.autoMove({ autoFoundation: false })
					.touch()
					.autoMove({ autoFoundation: false })
					.touch()
					.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'               >KC       \n' +
						' move 16 KC→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false }).touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'                     >KC \n' +
						' move 18 KC→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'>KC                      \n' +
						' hand-jammed'
				);
			});

			test('cycles through cascade:sequence', () => {
				let game = FreeCell.parse(
					'' + //
						'             QC TD KH QS \n' +
						' JD KC       KS          \n' +
						' KD>QD                   \n' +
						' hand-jammed'
				);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH QS \n' +
						' JD KC      >KS          \n' +
						' KD          QD          \n' +
						' move 25 QD→KS'
				);

				game = game
					.setCursor({ fixture: 'cascade', data: [4, 1] })
					.touch()
					.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH QS \n' +
						' JD>KC       KS          \n' +
						' KD QD                   \n' +
						' hand-jammed'
				);
			});

			/**
				- TODO (joker) cascade:sequence cycle
				   - there can only be 1 or 2 options in normal play
				   - jokers:wild and jokers:high allow more options
			*/
			test.todo('cycles through cascade:sequence with jokers');

			describe('prefers', () => {
				/** always prefer an existing sequence, if available */
				test('cascade:sequence to cell and cascade:empty', () => {
					let game = FreeCell.parse(
						'' + //
							'             QC TD KH QS \n' +
							' JD KC       KS          \n' +
							' KD>QD                   \n' +
							' hand-jammed'
					).touch();

					expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
						['a', 'cell:empty', -1],
						['b', 'cell:empty', -1],
						['c', 'cell:empty', -1],
						['d', 'cell:empty', -1],
						['3', 'cascade:empty', -1],
						['4', 'cascade:empty', -1],
						['5⡀', 'cascade:sequence', 12],
						['6', 'cascade:empty', -1],
						['7', 'cascade:empty', -1],
						['8', 'cascade:empty', -1],
					]);

					expect(collectUniquePriorities(game.availableMoves)).toEqual({
						'cell:empty': new Set([-1]),
						'cascade:empty': new Set([-1]),
						'cascade:sequence': new Set([12]),
					});

					game = game.autoMove({ autoFoundation: false });

					expect(game.print()).toBe(
						'' + //
							'             QC TD KH QS \n' +
							' JD KC      >KS          \n' +
							' KD          QD          \n' +
							' move 25 QD→KS'
					);
				});

				/**
					empty cascades can move _sequences_
					empty cells can move _single_
					so move to a cell first to keep our options open
				*/
				test.todo('cell to cascade:empty');

				/**
					if you are going to start building something new,
					it needs to be in a cascade
				*/
				test.todo('cascade:empty to cell when only one cell remains');

				describe('foundation, somtimes', () => {
					/**
						in this situation, we're kind of stuck.
						we can free up tableau[2] (6C-dD-4S) by moving 6C/5H to the foundation
						(after that, it's quick work to win the game)
					*/
					test('one', () => {
						expect(
							FreeCell.parse(
								'' + //
									'    6H QS    AS 3C 3H 3D \n' +
									' JD 9S 6C KH KC 2S QH JH \n' +
									' TS 8D 5D QC QD KD JS TC \n' +
									' 9H 7S 4S    JC 7C TH 9D \n' +
									' 8C 6D       TD 7H 9C 8S \n' +
									' 7D 5C          KS 8H    \n' +
									' 6S 4D          5S       \n' +
									' 5H             4H       \n' +
									'>4C             3S       \n' +
									' copy-pasta'
							)
								.touch()
								.autoMove({ autoFoundation: false })
								.print()
						).toBe(
							'' + //
								'    6H QS    AS>4C 3H 3D \n' +
								' JD 9S 6C KH KC 2S QH JH \n' +
								' TS 8D 5D QC QD KD JS TC \n' +
								' 9H 7S 4S    JC 7C TH 9D \n' +
								' 8C 6D       TD 7H 9C 8S \n' +
								' 7D 5C          KS 8H    \n' +
								' 6S 4D          5S       \n' +
								' 5H             4H       \n' +
								'                3S       \n' +
								' move 1h 4C→3C'
						);
					});

					/**
						in a bit of a bind here
						need to move 3S and 4S to make some breathing room
					*/
					test('two', () => {
						expect(
							FreeCell.parse(
								'' + //
									' JC 9C>3S 4S AH 2C 2S    \n' +
									'    TH 4C JS KD 2H QD 5H \n' +
									'    7C 6D KH QH 6S 4D 5S \n' +
									'    AD    9D 8H TC KC 7H \n' +
									'    6C    5C 8C QC 9H 3H \n' +
									'    TD    JD QS KS 8S 4H \n' +
									'    5D    TS 3C JH 7S 9S \n' +
									'    7D    3D 2D    6H 8D \n' +
									' copy-pasta'
							)
								.touch()
								.autoMove({ autoFoundation: false })
								.print()
						).toBe(
							'' + //
								' JC 9C    4S AH 2C 2S    \n' +
								'>3S TH 4C JS KD 2H QD 5H \n' +
								'    7C 6D KH QH 6S 4D 5S \n' +
								'    AD    9D 8H TC KC 7H \n' +
								'    6C    5C 8C QC 9H 3H \n' +
								'    TD    JD QS KS 8S 4H \n' +
								'    5D    TS 3C JH 7S 9S \n' +
								'    7D    3D 2D    6H 8D \n' +
								' move c1 3S→cascade'
						);
					});
				});

				/** if we are moving a single king, it's _probably_ time to build a sequence */
				test('King prefers cascade:empty', () => {
					expect(
						FreeCell.parse(
							'' + //
								' KD QD 7S    AS AD       \n' +
								' 2C JC 6C 2D AH 9D    QC \n' +
								' 9S TD 4H QS 2S 8S    8H \n' +
								' 5S AC 7D TC>KS       JD \n' +
								' 2H 3C 5C KH          7H \n' +
								' 5D 6D 4D 6H          5H \n' +
								' KC 6S 3S JH          4S \n' +
								' QH 4C    TS          3D \n' +
								' JS 3H    9H             \n' +
								' TH       8C             \n' +
								' 9C                      \n' +
								' 8D                      \n' +
								' 7C                      \n' +
								' copy-pasta'
						)
							.touch()
							.autoMove({ autoFoundation: false })
							.print()
					).toBe(
						'' + //
							' KD QD 7S    AS AD       \n' +
							' 2C JC 6C 2D AH 9D>KS QC \n' +
							' 9S TD 4H QS 2S 8S    8H \n' +
							' 5S AC 7D TC          JD \n' +
							' 2H 3C 5C KH          7H \n' +
							' 5D 6D 4D 6H          5H \n' +
							' KC 6S 3S JH          4S \n' +
							' QH 4C    TS          3D \n' +
							' JS 3H    9H             \n' +
							' TH       8C             \n' +
							' 9C                      \n' +
							' 8D                      \n' +
							' 7C                      \n' +
							' move 57 KS→cascade'
					);
				});

				test('Ace prefers foundation', () => {
					const game = FreeCell.parse(
						'' + //
							'                         \n' +
							' 3C TS 6S 5D 9H QC AH 9C \n' +
							' 4H 8S 8C JS 2S 2H 3D 3H \n' +
							' JD 7C TC 4C 9S 6H QH 9D \n' +
							' TH TD KC AS JC 6C 4D 5C \n' +
							' AC 7S KH 3S 6D QS 8H 7D \n' +
							' KD 2D JH 8D KS 4S 5H>AD \n' +
							' 7H 2C 5S QD             \n' +
							' copy-pasta'
					).touch();

					expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
						['a', 'cell:empty', -1],
						['b', 'cell:empty', -1],
						['c', 'cell:empty', -1],
						['d', 'cell:empty', -1],
						['h⡀', 'foundation:any', 4],
						['h⡁', 'foundation:any', 3],
						['h⡂', 'foundation:any', 2],
						['h⡃', 'foundation:any', 1],
						['2⡆', 'cascade:sequence', -1],
					]);

					expect(game.autoMove({ autoFoundation: false }).print()).toBe(
						'' + //
							'            >AD          \n' +
							' 3C TS 6S 5D 9H QC AH 9C \n' +
							' 4H 8S 8C JS 2S 2H 3D 3H \n' +
							' JD 7C TC 4C 9S 6H QH 9D \n' +
							' TH TD KC AS JC 6C 4D 5C \n' +
							' AC 7S KH 3S 6D QS 8H 7D \n' +
							' KD 2D JH 8D KS 4S 5H    \n' +
							' 7H 2C 5S QD             \n' +
							' move 8h AD→foundation'
					);
				});
			});
		});

		describe('cascade:sequence', () => {
			test('cycles through cascade:empty', () => {
				let game = FreeCell.parse(
					'' + //
						'             QC TD KH TS \n' +
						' KD>KC       KS          \n' +
						' QS QD                   \n' +
						' JD JS                   \n' +
						' hand-jammed'
				);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH TS \n' +
						' KD   >KC    KS          \n' +
						' QS    QD                \n' +
						' JD    JS                \n' +
						' move 23 KC-QD-JS→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false }).touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH TS \n' +
						' KD          KS>KC       \n' +
						' QS             QD       \n' +
						' JD             JS       \n' +
						' move 26 KC-QD-JS→cascade'
				);

				game = game.touch().autoMove({ autoFoundation: false }).touch().autoMove({ autoFoundation: false }).touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH TS \n' +
						' KD>KC       KS          \n' +
						' QS QD                   \n' +
						' JD JS                   \n' +
						' hand-jammed'
				);
			});

			test('cycles through cascade:sequence', () => {
				let game = FreeCell.parse(
					'' + //
						'             QC TD KH TS \n' +
						' KD KC       KS          \n' +
						' QS>QD                   \n' +
						' JD JS                   \n' +
						' hand-jammed'
				);

				game = game.touch().autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH TS \n' +
						' KD KC      >KS          \n' +
						' QS          QD          \n' +
						' JD          JS          \n' +
						' move 25 QD-JS→KS'
				);

				game = game
					.setCursor({ fixture: 'cascade', data: [4, 1] })
					.touch()
					.autoMove({ autoFoundation: false });

				expect(game.print()).toBe(
					'' + //
						'             QC TD KH TS \n' +
						' KD>KC       KS          \n' +
						' QS QD                   \n' +
						' JD JS                   \n' +
						' hand-jammed'
				);
			});

			/**
				- TODO (joker) cascade:sequence cycle
				   - there can only be 1 or 2 options in normal play
				   - jokers:wild and jokers:high allow more options
			*/
			test.todo('cycles through cascade:sequence with jokers');

			describe('prefers', () => {
				/** always prefer an existing sequence, if available */
				test.todo('cascade:sequence to cascade:empty');
			});
		});
	});

	describe('autoFoundation', () => {
		test('move', () => {
			const game = FreeCell.parse(
				'' + //
					'             QC TD KH QS \n' +
					' JD KC       KS          \n' +
					' KD>QD                   \n' +
					' hand-jammed'
			)
				.touch()
				.autoMove();

			expect(game.print()).toBe(
				'' + //
					'             QC TD KH QS \n' +
					' JD KC      >KS          \n' +
					' KD          QD          \n' +
					' move 25 QD→KS'
			);
			expect(game.previousAction).toEqual({
				text: 'move 2⡁5⡀ QD→KS',
				type: 'move',
			});
			expect(game.history).toEqual(['hand-jammed', 'move 2⡁5⡀ QD→KS']);

			expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
			expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);
		});

		test('move-foundation', () => {
			const game = FreeCell.parse(
				'' + //
					'             QC TD KH TS \n' +
					' KD KC       KS          \n' +
					' QS>QD                   \n' +
					' JD JS                   \n' +
					' hand-jammed'
			)
				.touch()
				.autoMove();
			expect(game.print()).toBe(
				'' + //
					'            >KC KD KH KS \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 25 QD-JS→KS (auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS)'
			);
			expect(game.previousAction).toEqual({
				text: 'move 2⡁5⡀ QD-JS→KS (auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS)',
				type: 'move-foundation',
				tweenCards: [
					{ rank: 'queen', suit: 'diamonds', location: { fixture: 'cascade', data: [4, 1] } },
					{ rank: 'jack', suit: 'spades', location: { fixture: 'cascade', data: [4, 2] } },
				],
			});
			expect(game.history).toEqual(['hand-jammed', 'move 2⡁5⡀ QD-JS→KS (auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS)']);

			const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
			expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
			expect(gameWithHist).toEqual(game);

			const gameNoHist = FreeCell.parse(game.print());
			expect(gameNoHist.print()).toBe(game.print());
			expect(gameNoHist.history).toEqual(['init without history', 'move 2⡁5⡀ QD-JS→KS (auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS)']);
			expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
		});

		test('auto-foundation', () => {
			const game = FreeCell.parse(
				'' + //
					'             QC TD KH TS \n' +
					' KD KC       KS          \n' +
					' QS>QD                   \n' +
					' JD JS                   \n' +
					' hand-jammed'
			)
				.touch()
				.autoMove({ autoFoundation: false })
				.autoFoundationAll();
			expect(game.print()).toBe(
				'' + //
					'            >KC KD KH KS \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS'
			);
			expect(game.previousAction).toEqual({
				text: 'auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS',
				type: 'auto-foundation',
			});
			expect(game.history).toEqual(['hand-jammed', 'move 2⡁5⡀ QD-JS→KS', 'auto-foundation 1551215 JD,JS,QD,QS,KC,KD,KS']);

			expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
			expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);
		});
	});

	describe('edges', () => {
		test('do not autoMove if previous touch was invalid', () => {
			let game = FreeCell.parse(
				'' + //
					'>                        \n' +
					' 3H 4S 9H 5C 2H 9S KC QC \n' +
					' 7S 4D 5D 9D KS 2S 3C TC \n' +
					' 5H QD QS 2D 6D 5S AD KH \n' +
					' AS 7H QH 8H 6S 8D KD 6C \n' +
					' TH 4H AC 6H 8S JH TS AH \n' +
					' TD JD 2C 7C 3D 9C 8C 7D \n' +
					' JC 4C 3S JS             \n' +
					' init'
			);
			// select a card
			game = game.setCursor({ fixture: 'cascade', data: [7, 5] }).touch();
			expect(game.previousAction.text).toBe('select 8⡅ 7D');
			// invalid move
			game = game.setCursor({ fixture: 'cascade', data: [5, 5] }).touch({ stopWithInvalid: true });
			expect(game.previousAction.text).toBe('invalid move 8⡅6⡅ 7D→9C');
			// do not move card
			game = game.autoMove({ autoFoundation: false });
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' 3H 4S 9H 5C 2H 9S KC QC \n' +
					' 7S 4D 5D 9D KS 2S 3C TC \n' +
					' 5H QD QS 2D 6D 5S AD KH \n' +
					' AS 7H QH 8H 6S 8D KD 6C \n' +
					' TH 4H AC 6H 8S JH TS AH \n' +
					' TD JD 2C 7C 3D>9C 8C|7D|\n' +
					' JC 4C 3S JS             \n' +
					' invalid move 86 7D→9C'
			);
		});
	});
});
