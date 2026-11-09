import { describe, expect, test } from 'vitest';
import { getMoves, SEED_SOLUTIONS_4x8, SEED_SOLUTIONS_6x10 } from '@/game/catalog/solutions-catalog';
import { FreeCell } from '@/game/game';
import { parseMovesFromHistory, spotCheckMoveRegex } from '@/game/move/history';

function undoUntilStart(game: FreeCell): FreeCell {
	let prev = game;
	do {
		prev = game;
		game = game.undo();
	} while (prev !== game && game.history.length > 2);
	return game;
}

// TODO (techdebt) confirm all MoveSourceType ⨉ MoveDestinationType
//  - make a generic helper (like actionText-examples)
// TODO (techdebt) (history) (undo) ACTION_TEXT_EXAMPLES
//  - filter by what ends up in the history
// XXX (history) (optional-complexity) (undo) ACTION_TEXT_EXAMPLES
//  - but what if they _were_ in the history
describe('game.undo (+ history)', () => {
	describe('PreviousActionType', () => {
		describe('init', () => {
			test('init', () => {
				const game = new FreeCell();
				expect(game.previousAction.type).toBe('init');
				expect(game).toBe(game);
				expect(game.undo()).toBe(game);
			});

			test('init with invalid history replay', () => {
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
						//53 6a 65 67 85 a8 68 27 // clipped most of the action
						' 67 '
				);
				expect(game.history).toEqual(['init with invalid history replay cards', 'invalid move 67 9H→TC']);
				expect(game.undo()).toBe(game);
			});

			test('hand-jammed', () => {
				const game = FreeCell.parse(
					'' + //
						' QC KD KH KS JC QD QH QS \n' +
						'>KC          \n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'hand-jammed',
					type: 'init',
				});
				expect(game.undo()).toBe(game);
			});
		});

		test('shuffle', () => {
			const game = new FreeCell();
			const shuffled = game.shuffle32();
			expect(shuffled.previousAction.type).toBe('shuffle');
			const undid = shuffled.undo();
			expect(undid.previousAction.gameFunction).toBe('undo');
			delete undid.previousAction.gameFunction;
			expect(undid).toEqual(game);
		});

		describe('deal', () => {
			test('default', () => {
				const game = new FreeCell();
				const dealt = game.dealAll();
				expect(dealt.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(dealt.print()).toBe(
					'' + //
						'>                        \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						' AS AH AD AC             \n' +
						' deal all cards'
				);
				const undid = dealt.undo();
				expect(undid.previousAction.gameFunction).toBe('undo');
				delete undid.previousAction.gameFunction;
				expect(undid).toEqual(game);
			});

			test('shuffled', () => {
				const game = new FreeCell().shuffle32(1);
				expect(game.__printDeck()).toBe(
					'>JD 2D 9H JC 5D 7H 7C 5H KD KC 9S 5S AD QC KH 3H 2S KS 9D QD JS AS AH 3C 4C 5C TS QH 4H AC 4D 7S 3S TD 4S TH 8H 2C JH 7D 6D 8S 8D QS 6C 3D 8C TC 6S 9C 2H 6H '
				);
				const dealt = game.dealAll();
				expect(dealt.__printDeck()).toBe('');
				expect(dealt.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(dealt.print()).toBe(
					'' + //
						'>                        \n' +
						' JD 2D 9H JC 5D 7H 7C 5H \n' +
						' KD KC 9S 5S AD QC KH 3H \n' +
						' 2S KS 9D QD JS AS AH 3C \n' +
						' 4C 5C TS QH 4H AC 4D 7S \n' +
						' 3S TD 4S TH 8H 2C JH 7D \n' +
						' 6D 8S 8D QS 6C 3D 8C TC \n' +
						' 6S 9C 2H 6H             \n' +
						' deal all cards'
				);
				expect(dealt.__printDeck()).toBe('');
				const undid = dealt.undo();
				expect(undid.__printDeck()).toBe(
					'>JD 2D 9H JC 5D 7H 7C 5H KD KC 9S 5S AD QC KH 3H 2S KS 9D QD JS AS AH 3C 4C 5C TS QH 4H AC 4D 7S 3S TD 4S TH 8H 2C JH 7D 6D 8S 8D QS 6C 3D 8C TC 6S 9C 2H 6H '
				);
				expect(undid.previousAction.gameFunction).toBe('undo');
				delete undid.previousAction.gameFunction;

				expect(game.deck[0].location.data[0]).toBe(0);
				expect(game.deck[9].location.data[0]).toBe(9);
				expect(dealt.deck).toEqual([]);
				expect(undid.deck[0].location.data[0]).toBe(0);
				expect(undid.deck[9].location.data[0]).toBe(9);
				expect(undid).toEqual(game);
			});

			test('demo', () => {
				const game = new FreeCell();
				const dealt = game.dealAll({ demo: true });
				expect(dealt.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
				});
				expect(dealt.print()).toBe(
					'' + //
						'>2S 2H 2D 2C AS AH AD AC \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C             \n' +
						' deal all cards'
				);
				const undid = dealt.undo();
				expect(undid.previousAction.gameFunction).toBe('undo');
				delete undid.previousAction.gameFunction;
				expect(undid).toEqual(game);
			});

			test('keepDeck', () => {
				const game = new FreeCell();
				expect(game.__printDeck()).toBe(
					'>KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD AC '
				);
				const dealt = game.dealAll({ demo: true, keepDeck: true });
				expect(dealt.__printDeck()).toBe('>2S 2H 2D 2C AS AH AD AC ');
				expect(dealt.previousAction).toEqual({
					text: 'deal 44 cards',
					type: 'deal',
				});
				expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });
				expect(dealt.cursor).toEqual({ fixture: 'deck', data: [7] });
				expect(dealt.print()).toBe(
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
				const undid = dealt.undo();
				expect(undid.__printDeck()).toBe(
					'>KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD AC '
				);
				expect(undid.previousAction.gameFunction).toBe('undo');
				delete undid.previousAction.gameFunction;
				expect(undid).toEqual(game);
			});

			describe('mangled', () => {
				test.todo('card missing from structure (in cards)');

				test.todo('card missing from cards (in deck)');

				test.todo('card missing from cards (in cells)');

				test.todo('card missing from cards (in foundations)');

				test.todo('card missing from cards (in tableau)');
			});
		});

		describe('cursor', () => {
			test('history does not keep track of the cursor', () => {
				let game = FreeCell.parse(
					'' + //
						' KC>QC       JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				)
					.moveCursor('left')
					.moveCursor('left');

				expect(game.print()).toBe(
					'' + //
						' KC QC       JC KD KH>KS \n' +
						'                         \n' +
						' cursor left wrap'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC QC       JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [3] });
				expect(game.history).toEqual(['hand-jammed', 'move cb QC→cell']);

				game = game.undo();

				expect(game.print()).toBe(
					'' + //
						'>KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(game.history).toEqual(['hand-jammed']);
			});

			test.todo('made it into history');
		});

		describe('select', () => {
			test('history does not keep track of the selection', () => {
				let game = FreeCell.parse(
					'' + //
						' KC>QC       JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				).touch();

				expect(game.print()).toBe(
					'' + //
						' KC>QC|      JC KD KH KS \n' +
						'                         \n' +
						' select b QC'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC QC       JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
				expect(game.history).toEqual(['hand-jammed', 'move cb QC→cell']);

				game = game.undo();

				expect(game.print()).toBe(
					'' + //
						'>KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(game.history).toEqual(['hand-jammed']);
			});

			test.todo('made it into history');
		});

		describe('deselect', () => {
			test('history does not keep track of the selection', () => {
				let game = FreeCell.parse(
					'' + //
						' KC>QC|      JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				).touch();

				expect(game.print()).toBe(
					'' + //
						' KC>QC       JC KD KH KS \n' +
						'                         \n' +
						' deselect b QC'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC QC       JC KD KH KS \n' +
						'                         \n' +
						' move cb QC→cell\n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
				expect(game.history).toEqual(['hand-jammed', 'move cb QC→cell']);

				game = game.undo();

				expect(game.print()).toBe(
					'' + //
						'>KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KC    QC    JC KD KH KS \n' +
						'                         \n' +
						' hand-jammed'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(game.history).toEqual(['hand-jammed']);
			});

			test.todo('made it into history');
		});

		/** written as original move from→to, so we run the undo from←to */
		describe('move', () => {
			// REVIEW (techdebt) can we move a card from the deck directly to anywhere?
			// this should just be handled by undo deal
			test.todo('from: deck');

			describe('from: cell', () => {
				// REVIEW (techdebt) do we have any control of where cards move from the deck?
				// we can't really undo that
				test.todo('to: deck');

				test('to: cell', () => {
					let game = FreeCell.parse(
						'' + //
							'|KC>         QC KD KH KS \n' +
							'                         \n' +
							' hand-jammed'
					);
					const origPrint = game.print({ includeHistory: true });
					expect(origPrint).toEqual(
						'' + //
							' KC          QC KD KH KS \n' +
							'                         \n' +
							' hand-jammed'
					);
					expect(game.history).toEqual(['hand-jammed']);

					game = game.touch({ autoFoundation: false });
					expect(game.print({ includeHistory: true })).toBe(
						'' + //
							'    KC       QC KD KH KS \n' +
							'                         \n' +
							' move ab KC→cell\n' +
							' hand-jammed'
					);
					expect(game.history).toEqual(['hand-jammed', 'move ab KC→cell']);
					expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
					expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

					expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
				});

				describe('to: foundation', () => {
					test('empty', () => {
						let game = FreeCell.parse(
							'' + //
								'|AC|        >   KD KH KS \n' +
								'                         \n' +
								' hand-jammed'
						);
						const origPrint = game.print({ includeHistory: true });
						expect(origPrint).toEqual(
							'' + //
								' AC             KD KH KS \n' +
								'                         \n' +
								':d KC QC JC TC 9C 8C 7C 6C 5C 4C 3C 2C \n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed']);

						game = game.touch();
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             AC KD KH KS \n' +
								'                         \n' +
								':d KC QC JC TC 9C 8C 7C 6C 5C 4C 3C 2C \n' +
								' move ah⡀ AC→foundation\n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed', 'move ah⡀ AC→foundation']);
						expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
						expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

						expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
					});

					test('not empty', () => {
						let game = FreeCell.parse(
							'' + //
								'|KC|        >QC KD KH KS \n' +
								'                         \n' +
								' hand-jammed'
						);
						const origPrint = game.print({ includeHistory: true });
						expect(origPrint).toEqual(
							'' + //
								' KC          QC KD KH KS \n' +
								'                         \n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed']);

						game = game.touch();
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             KC KD KH KS \n' +
								'                         \n' +
								':    Y O U   W I N !    :\n' +
								'                         \n' +
								' move ah⡀ KC→QC\n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed', 'move ah⡀ KC→QC']);
						expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
						expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

						expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
					});
				});

				describe('to: cascade', () => {
					describe('not empty', () => {
						test('single', () => {
							let game = FreeCell.parse(
								'' + //
									' KC|QC|      JC QD KH KS \n' +
									'   >KD                   \n' +
									' hand-jammed'
							);
							const origPrint = game.print({ includeHistory: true });
							expect(origPrint).toEqual(
								'' + //
									' KC QC       JC QD KH KS \n' +
									'    KD                   \n' +
									' hand-jammed'
							);
							expect(game.history).toEqual(['hand-jammed']);

							game = game.touch({ autoFoundation: false });
							expect(game.print({ includeHistory: true })).toBe(
								'' + //
									' KC          JC QD KH KS \n' +
									'    KD                   \n' +
									'    QC                   \n' +
									' move b2⡀ QC→KD\n' +
									' hand-jammed'
							);
							expect(game.history).toEqual(['hand-jammed', 'move b2⡀ QC→KD']);
							expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
							expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

							expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
						});

						describe('sequence', () => {
							// TODO (controls) (gameplay) (test) move card to the top of a sequence
							test.todo('first');
							// t('first', () => {
							// 	let game = FreeCell.parse(
							// 		'' + //
							// 			'   |TC|      9C TD KH KS \n' +
							// 			' KC>KD                   \n' +
							// 			' QD QC                   \n' +
							// 			' JC JD                   \n' +
							// 			' hand-jammed'
							// 	);
							// 	const origPrint = game.print({ includeHistory: true });
							// 	expect(origPrint).toEqual(
							// 		'' + //
							// 			'    TC       9C TD KH KS \n' +
							// 			' KC KD                   \n' +
							// 			' QD QC                   \n' +
							// 			' JC JD                   \n' +
							// 			' hand-jammed'
							// 	);

							// 	game = game.touch();
							// 	// what it is
							// 	expect(game.previousAction.text).toEqual('invalid move b2 TC→JD');
							// 	expect(game.history).toEqual(['hand-jammed']);
							// 	// XXX (techdebt) what is should be
							// 	expect(game.print()).toBe(
							// 		'' + //
							// 			'             9C TD KH KS \n' +
							// 			' KC KD                   \n' +
							// 			' QD QC                   \n' +
							// 			' JC JD                   \n' +
							// 			'    TC                   \n' +
							// 			' move b2 TC→JD\n' +
							// 			' hand-jammed'
							// 	);
							// 	expect(game.print({ includeHistory: true })).toBe(
							// 		'' + //
							// 			'             9C TD KH KS \n' +
							// 			' KC KD                   \n' +
							// 			' QD QC                   \n' +
							// 			' JC JD                   \n' +
							// 			'    TC                   \n' +
							// 			' move b2 TC→JD\n' +
							// 			' hand-jammed'
							// 	);
							// 	expect(game.history).toEqual(['hand-jammed', 'move b2 TC→JD']);
							// 	expect(
							// 		FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })
							// 	).toBe(game.print({ includeHistory: true }));

							// 	expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
							// });

							test.todo('middle');

							test('last', () => {
								let game = FreeCell.parse(
									'' + //
										'   |TC|      9C TD KH KS \n' +
										' KC KD                   \n' +
										' QD QC                   \n' +
										' JC>JD                   \n' +
										' hand-jammed'
								);
								const origPrint = game.print({ includeHistory: true });
								expect(origPrint).toEqual(
									'' + //
										'    TC       9C TD KH KS \n' +
										' KC KD                   \n' +
										' QD QC                   \n' +
										' JC JD                   \n' +
										' hand-jammed'
								);

								game = game.touch({ autoFoundation: false });
								expect(game.print({ includeHistory: true })).toBe(
									'' + //
										'             9C TD KH KS \n' +
										' KC KD                   \n' +
										' QD QC                   \n' +
										' JC JD                   \n' +
										'    TC                   \n' +
										' move b2⡂ TC→JD\n' +
										' hand-jammed'
								);
								expect(game.history).toEqual(['hand-jammed', 'move b2⡂ TC→JD']);
								expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
								expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

								expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
							});
						});

						test.todo('pile');
					});

					test('empty', () => {
						let game = FreeCell.parse(
							'' + //
								'|KC|         QC KD KH KS \n' +
								'>                        \n' +
								' hand-jammed'
						);
						const origPrint = game.print({ includeHistory: true });
						expect(origPrint).toEqual(
							'' + //
								' KC          QC KD KH KS \n' +
								'                         \n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed']);

						game = game.touch({ autoFoundation: false });
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             QC KD KH KS \n' +
								' KC                      \n' +
								' move a1 KC→cascade\n' +
								' hand-jammed'
						);
						expect(game.history).toEqual(['hand-jammed', 'move a1 KC→cascade']);
						expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
						expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

						expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
					});
				});
			});

			// we can't move a card off the foundation
			describe('from: foundation', () => {
				test.todo('to: deck');

				test.todo('to: cell');

				// but we (will) allow the player to fuss with Aces on the foundation
				// so we need to undo that
				describe('to: foundation', () => {
					test.todo('ace to empty');

					test.todo('jack to empty');

					test.todo('king to empty');

					test.todo('any to not empty');
				});

				describe('to: cascade', () => {
					describe('not empty', () => {
						test.todo('single');

						describe('sequence', () => {
							test.todo('first');

							test.todo('middle');

							test.todo('last');
						});

						test.todo('pile');
					});

					test.todo('empty');
				});
			});

			describe('from: cascade', () => {
				describe('single', () => {
					// REVIEW (techdebt) do we have any control of where cards move from the deck?
					//  - we can't really undo that
					//  - but we can write a test to prove that when we undo, the state stays the same
					test.todo('to: deck');

					test('to: cell', () => {
						const game = FreeCell.parse(
							'' + //
								' KC>         JC QD KH KS \n' +
								'|QC|KD                   \n' +
								' hand-jammed'
						).touch({ autoFoundation: false });
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								' KC QC       JC QD KH KS \n' +
								'    KD                   \n' +
								' move 1⡀b QC→cell\n' +
								' hand-jammed'
						);
						expect(game.undo().print()).toBe(
							'' + //
								'>KC          JC QD KH KS \n' +
								' QC KD                   \n' +
								' hand-jammed'
						);
					});

					describe('to: foundation', () => {
						test.todo('empty');

						test('to: foundation', () => {
							const game = FreeCell.parse(
								'' + //
									' KC         >JC QD KH KS \n' +
									'|QC|KD                   \n' +
									' hand-jammed'
							).touch({ autoFoundation: false });
							expect(game.print({ includeHistory: true })).toBe(
								'' + //
									' KC          QC QD KH KS \n' +
									'    KD                   \n' +
									' move 1⡀h⡀ QC→JC\n' +
									' hand-jammed'
							);
							expect(game.undo().print()).toBe(
								'' + //
									'>KC          JC QD KH KS \n' +
									' QC KD                   \n' +
									' hand-jammed'
							);
						});
					});

					describe('to: cascade', () => {
						describe('not empty', () => {
							test('single', () => {
								let game = FreeCell.parse(
									'' + //
										' KC          JC QD KH KS \n' +
										'|QC>KD                   \n' +
										' hand-jammed'
								);
								const origPrint = game.print({ includeHistory: true });
								expect(origPrint).toEqual(
									'' + //
										' KC          JC QD KH KS \n' +
										' QC KD                   \n' +
										' hand-jammed'
								);
								expect(game.history).toEqual(['hand-jammed']);

								game = game.touch({ autoFoundation: false });
								expect(game.print({ includeHistory: true })).toBe(
									'' + //
										' KC          JC QD KH KS \n' +
										'    KD                   \n' +
										'    QC                   \n' +
										' move 1⡀2⡀ QC→KD\n' +
										' hand-jammed'
								);
								expect(FreeCell.parse(game.print({ includeHistory: true })).print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
								expect(FreeCell.parse(game.print({ includeHistory: true }))).toEqual(game);

								expect(game.undo().print({ includeHistory: true })).toBe(origPrint);
							});

							describe('sequence', () => {
								test.todo('first');

								test.todo('middle');

								test('last', () => {
									let game = FreeCell.parse(
										'' + //
											'>            TC 8D KH KS \n' +
											'    TD KC KD    9D       \n' +
											'       QD QC             \n' +
											'       JC JD             \n' +
											' hand-jammed'
									)
										.setCursor({ fixture: 'cascade', data: [1, 0] })
										.touch()
										.setCursor({ fixture: 'cascade', data: [2, 2] })
										.touch({ autoFoundation: false });
									expect(game.print()).toBe(
										'' + //
											'             TC 8D KH KS \n' +
											'       KC KD    9D       \n' +
											'       QD QC             \n' +
											'      >JC JD             \n' +
											'       TD                \n' +
											' move 23 TD→JC'
									);
									expect(game.print({ includeHistory: true })).toBe(
										'' + //
											'             TC 8D KH KS \n' +
											'       KC KD    9D       \n' +
											'       QD QC             \n' +
											'       JC JD             \n' +
											'       TD                \n' +
											' move 2⡀3⡂ TD→JC\n' +
											' hand-jammed'
									);
									game = game.undo();
									expect(game.print()).toBe(
										'' + //
											'>            TC 8D KH KS \n' +
											'    TD KC KD    9D       \n' +
											'       QD QC             \n' +
											'       JC JD             \n' +
											' hand-jammed'
									);
									expect(game.print({ includeHistory: true })).toBe(
										'' + //
											'             TC 8D KH KS \n' +
											'    TD KC KD    9D       \n' +
											'       QD QC             \n' +
											'       JC JD             \n' +
											' hand-jammed'
									);
								});
							});

							test.todo('pile');
						});

						test.todo('empty');
					});
				});

				describe('sequence', () => {
					// REVIEW (techdebt) do we have any control of where cards move from the deck?
					// we can't really undo that
					test.todo('to: deck');

					// just the bottom card would go
					test.todo('to: cell');

					// just the bottom card would go
					describe('to: foundation', () => {
						test.todo('empty');

						test.todo('not empty');
					});

					describe('to: cascade', () => {
						describe('not empty', () => {
							test.todo('single');

							describe('sequence', () => {
								test.todo('first');

								test.todo('middle');

								test.todo('last');
							});

							test.todo('pile');
						});

						test.todo('empty');
					});
				});
			});

			test('clears selection', () => {
				let game = FreeCell.parse(
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
				game = game.setCursor({ fixture: 'cascade', data: [7, 3] }).touch();
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C    2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC>7D|\n' +
						' 5S QH 8C 9D KS    4H|6C|\n' +
						' 2H    TH 6D QD    QC|5H|\n' +
						' 9S    7C TS JS    JH    \n' +
						'       6H          TC    \n' +
						'                   9H    \n' +
						' select 8 7D-6C-5H'
				);
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [7, 3] },
					cards: [
						{ rank: '7', suit: 'diamonds', location: { fixture: 'cascade', data: [7, 3] } },
						{ rank: '6', suit: 'clubs', location: { fixture: 'cascade', data: [7, 4] } },
						{ rank: '5', suit: 'hearts', location: { fixture: 'cascade', data: [7, 5] } },
					],
					peekOnly: false,
				});
				game = game.undo();
				expect(game.print()).toBe(
					'' + //
						'             AD 2C       \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D    3C 4S \n' +
						' 3S 5D KC 3H KD    6S 8D \n' +
						' TD 7S JD 7H 8H    JC 7D \n' +
						' 5S QH 8C 9D KS    4H 6C \n' +
						' 2H    TH 6D QD    QC 5H \n' +
						' 9S    7C TS JS   >JH    \n' +
						'       6H          TC    \n' +
						' move 27 TC→JH'
				);
				expect(game.selection).toBe(null);
			});
		});

		/** @see game.touch move card autoFoundation */
		describe('auto-foundation', () => {
			test('few', () => {
				let game = FreeCell.parse(
					'' + //
						'             AD          \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D    6C QC JS \n' +
						' 9S    7C TS             \n' +
						'       6H                \n' +
						' auto-foundation 2 AD\n' +
						' move 53 6H→7C\n' +
						' deal all cards\n' +
						' shuffle deck (5)'
				);
				expect(game.previousAction).toEqual({
					text: 'auto-foundation 2 AD',
					type: 'auto-foundation',
				});
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards', 'move 53 6H→7C', 'auto-foundation 2 AD']);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 6] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'                         \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D    6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						'       6H                \n' +
						' move 53 6H→7C\n' +
						':h shuffle32 5\n' +
						' 53 '
				);
				expect(game.previousAction).toEqual({
					text: 'move 53 6H→7C',
					type: 'move',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards', 'move 53 6H→7C']);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 6] });
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards', 'move 53 6H→7C']);

				game = game.undo();
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
				expect(game.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});

			test('win', () => {
				let game = FreeCell.parse(
					'' + //
						'             KC KD KH KS \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS\n' +
						' move ab KS→cell\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS',
					type: 'auto-foundation',
				});
				expect(game.history).toEqual(['hand-jammed', 'move ab KS→cell', 'auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.win).toBe(true);
				expect(game.winIsFlourish).toBe(false);
				expect(game.winIsFlourish52).toBe(false);

				game = game.undo();
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'    KS       JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' move ab KS→cell\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'move ab KS→cell',
					type: 'move',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['hand-jammed', 'move ab KS→cell']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KS          JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'hand-jammed',
					type: 'init',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['hand-jammed']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});

			test('flourish', () => {
				let game = FreeCell.parse(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS\n' +
						' move 78 AS→cascade\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS',
					type: 'auto-foundation',
				});
				expect(game.history).toEqual(['hand-jammed', 'move 78 AS→cascade', 'flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);
				expect(game.win).toBe(true);
				expect(game.winIsFlourish).toBe(true);
				expect(game.winIsFlourish52).toBe(false);

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                KH KD KC \n' +
						' KS JS 9S 7S 5S 3S    AS \n' +
						' QS TS 8S 6S 4S 2S       \n' +
						' move 78 AS→cascade\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'move 78 AS→cascade',
					type: 'move',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['hand-jammed', 'move 78 AS→cascade']);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [7, 0] });
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                KH KD KC \n' +
						' KS JS 9S 7S 5S 3S AS    \n' +
						' QS TS 8S 6S 4S 2S       \n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'hand-jammed',
					type: 'init',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['hand-jammed']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);
			});

			test('52-card flourish', () => {
				let game = FreeCell.parse(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC\n' +
						' move 46 AC→2H\n' +
						' deal all cards'
				);
				expect(game.previousAction).toEqual({
					text: 'flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC',
					type: 'auto-foundation',
				});
				expect(game.history).toEqual([
					'deal all cards',
					'move 46 AC→2H',
					'flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC',
				]);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.win).toBe(true);
				expect(game.winIsFlourish).toBe(true);
				expect(game.winIsFlourish52).toBe(true);

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						' AS AH AD       AC       \n' +
						' move 46 AC→2H\n' +
						' deal all cards'
				);
				expect(game.previousAction).toEqual({
					text: 'move 46 AC→2H',
					type: 'move',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['deal all cards', 'move 46 AC→2H']);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [5, 5] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						' AS AH AD AC             \n' +
						' deal all cards'
				);
				expect(game.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['deal all cards']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});
		});

		/** @see game.touch move card autoFoundation */
		describe('move-foundation', () => {
			test('few', () => {
				let game = FreeCell.parse(
					'' + //
						'             AD          \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D    6C QC JS \n' +
						' 9S    7C TS             \n' +
						'       6H                \n' +
						' move 53 6H→7C (auto-foundation 2 AD)\n' +
						':h shuffle32 5\n' +
						' 53 '
				);
				expect(game.previousAction).toEqual({
					text: 'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)',
					type: 'move-foundation',
					tweenCards: [{ rank: '6', suit: 'hearts', location: { fixture: 'cascade', data: [2, 7] } }],
				});
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards', 'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)']);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 6] });
				expect(game.selection).toBe(null);
				expect(game.availableMoves).toBe(null);

				game = game.undo();
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
				expect(game.previousAction).toEqual({
					text: 'deal all cards',
					type: 'deal',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['shuffle deck (5)', 'deal all cards']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});

			test('win', () => {
				let game = FreeCell.parse(
					'' + //
						'             KC KD KH KS \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)'
				);
				expect(game.previousAction).toEqual({
					text: 'move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'king', suit: 'spades', location: { fixture: 'cell', data: [1] } }],
				});
				expect(game.history).toEqual(['init without history', 'move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						' KS          JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' init without history'
				);
				expect(game.previousAction).toEqual({
					text: 'init without history',
					type: 'init',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['init without history']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});

			test('flourish', () => {
				let game = FreeCell.parse(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 78 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)'
				);
				expect(game.previousAction).toEqual({
					text: 'move 7⡀8 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [7, 0] } }],
				});
				expect(game.history).toEqual(['init without history', 'move 7⡀8 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                KH KD KC \n' +
						' KS JS 9S 7S 5S 3S AS    \n' +
						' QS TS 8S 6S 4S 2S       \n' +
						' init without history'
				);
				expect(game.previousAction).toEqual({
					text: 'init without history',
					type: 'init',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['init without history']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});

			test('52-card flourish', () => {
				let game = FreeCell.parse(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 46 AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)'
				);
				expect(game.previousAction).toEqual({
					text: 'move 4⡆6⡅ AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'ace', suit: 'clubs', location: { fixture: 'cascade', data: [5, 6] } }],
				});
				expect(game.history).toEqual([
					'init without history',
					'move 4⡆6⡅ AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)',
				]);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });

				game = game.undo();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						' AS AH AD AC             \n' +
						' init without history'
				);
				expect(game.previousAction).toEqual({
					text: 'init without history',
					type: 'init',
					gameFunction: 'undo',
				});
				expect(game.history).toEqual(['init without history']);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
			});
		});

		describe('invalid', () => {
			test('touch stop', () => {
				const game = FreeCell.parse(
					'' + //
						'             KD KC KS KH \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' touch stop\n' +
						':h shuffle32 16765\n' +
						' 13 63 68 62 72 6a 6b 62 \n' +
						' 1c 1d c1 14 85 a8 7a 17 \n' +
						' 71 86 8c 81 84 7h 51 b5 \n' +
						' 57 c8 58 58 58 28 2b 14 \n' +
						' 2c c5 25 25 d2 15 21 2c \n' +
						' a2 c2 8h 18 31 3a 3c 37 \n' +
						' 27 3d 37 b7 42 4b 45 '
				);
				expect(game.previousAction).toEqual({
					text: 'touch stop',
					type: 'invalid',
				});
				expect(game.history).toEqual(['init with invalid history replay action text']);
				expect(() => game.undo()).not.toThrow();
				expect(game.undo()).toBe(game);
			});
		});
	});

	describe('edges', () => {
		test.todo('start (nothing to undo)');

		test.todo('undo autoFoundation');

		// we ¿should? support both
		// we ¡could be swanky! and support both
		test.todo('undo autoFoundationAll');

		test.todo('parse without history (nothing to undo)');
	});

	describe('collapse history', () => {
		// i.e. click-to-move picked the wrong place, so i need to move it again to the right one
		// i.e. dithering on a single card doesn't increase history length
		test('moving the same card multiple times in a row replaces the history', () => {
			let game = FreeCell.parse(
				'' + //
					'             KC KD JH JS \n' +
					' QS    KS                \n' +
					' QH                      \n' +
					' KH                      \n' +
					' hand-jammed'
			);
			expect(game.history).toEqual(['hand-jammed']);
			game = game.$touchAndMove({ fixture: 'cascade', data: [2, 0] });
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade']);
			game = game.$touchAndMove({ fixture: 'cascade', data: [3, 0] });
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀5 KS→cascade']);
			game = game.$touchAndMove({ fixture: 'cascade', data: [4, 0] });
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀6 KS→cascade']);
			game = game.$touchAndMove({ fixture: 'cascade', data: [5, 0] });
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀7 KS→cascade']);

			expect(game.print()).toBe(
				'' + //
					'             KC KD JH JS \n' +
					' QS               >KS    \n' +
					' QH                      \n' +
					' KH                      \n' +
					' move 37 KS→cascade'
			);

			game = game.undo();
			expect(game.history).toEqual(['hand-jammed']);
		});

		// i.e. cell -> sequence a -> sequence b -> sequence a
		test('dithering across two sequences', () => {
			let game = new FreeCell().shuffle32(6).dealAll();
			expect(
				game
					.setCursor({ fixture: 'cascade', data: [1, 5] })
					.touch()
					.print()
			).toBe(
				'' + //
					'                         \n' +
					' 2H JS 5S 5C 6H 2C TH 2S \n' +
					' JC QH 3H 9H 7C QC 3C AC \n' +
					' AD TS QD KS 8D 8H TC QS \n' +
					' 4S 9D KH 7S KD JD 4H 8S \n' +
					' 3S 5H 5D 4D 8C 3D TD 2D \n' +
					' 4C>7H|AS 6S 7D 9S KC 6D \n' +
					' 9C|6C|JH AH             \n' +
					' select 2 7H-6C'
			);
			game = game
				.setCursor({ fixture: 'cascade', data: [1, 6] })
				.touch()
				.autoMove({ autoFoundation: false });
			expect(game.history).toEqual(['shuffle deck (6)', 'deal all cards', 'move 2⡆5⡅ 6C→7D']);
			game = game
				.setCursor({ fixture: 'cascade', data: [4, 6] })
				.touch()
				.autoMove({ autoFoundation: false });
			expect(game.history).toEqual(['shuffle deck (6)', 'deal all cards']);
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' 2H JS 5S 5C 6H 2C TH 2S \n' +
					' JC QH 3H 9H 7C QC 3C AC \n' +
					' AD TS QD KS 8D 8H TC QS \n' +
					' 4S 9D KH 7S KD JD 4H 8S \n' +
					' 3S 5H 5D 4D 8C 3D TD 2D \n' +
					' 4C>7H AS 6S 7D 9S KC 6D \n' +
					' 9C 6C JH AH             \n' +
					' deal all cards'
			);
		});

		// i.e. 12 auto-1h 21
		// this should be obvious, but just to be sure...
		describe('cannot collapse moves if auto-foundation in between', () => {
			test('move-foundation', () => {
				let game = FreeCell.parse(
					'' + //
						'             QC TD KH TS \n' +
						' KD>KC       JS          \n' +
						' QS QD       KS          \n' +
						' JD                      \n' +
						' hand-jammed'
				);
				game = game.moveByShorthand('23').moveByShorthand('34').moveByShorthand('46');

				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             QC JD KH TS \n' +
						' KD          JS KC       \n' +
						' QS          KS QD       \n' +
						' move 3⡀6 KC-QD→cascade\n' +
						' move 2⡀3 KC-QD→cascade (auto-foundation 1 JD)\n' +
						' hand-jammed'
				);

				expect(game.history).toEqual(['hand-jammed', 'move 2⡀3 KC-QD→cascade (auto-foundation 1 JD)', 'move 3⡀6 KC-QD→cascade']);

				game = game.undo();
				expect(game.history).toEqual(['hand-jammed', 'move 2⡀3 KC-QD→cascade (auto-foundation 1 JD)']);
				game = game.undo();
				expect(game.history).toEqual(['hand-jammed']);
			});

			test('auto-foundation', () => {
				let game = FreeCell.parse(
					'' + //
						'             QC TD KH TS \n' +
						' KD>KC       JS          \n' +
						' QS QD       KS          \n' +
						' JD                      \n' +
						' hand-jammed'
				);
				game = game
					.moveByShorthand('23', { autoFoundation: false })
					.autoFoundationAll()
					.moveByShorthand('34', { autoFoundation: false })
					.autoFoundationAll()
					.moveByShorthand('46', { autoFoundation: false })
					.autoFoundationAll();

				expect(game.print({ includeHistory: true })).toBe(
					'' + //
						'             QC JD KH TS \n' +
						' KD          JS KC       \n' +
						' QS          KS QD       \n' +
						' move 3⡀6 KC-QD→cascade\n' +
						' auto-foundation 1 JD\n' +
						' move 2⡀3 KC-QD→cascade\n' +
						' hand-jammed'
				);

				expect(game.history).toEqual(['hand-jammed', 'move 2⡀3 KC-QD→cascade', 'auto-foundation 1 JD', 'move 3⡀6 KC-QD→cascade']);

				game = game.undo();
				expect(game.history).toEqual(['hand-jammed', 'move 2⡀3 KC-QD→cascade', 'auto-foundation 1 JD']);
				game = game.undo();
				expect(game.history).toEqual(['hand-jammed', 'move 2⡀3 KC-QD→cascade']);
				game = game.undo();
				expect(game.history).toEqual(['hand-jammed']);
			});
		});

		// i.e. move 12 JH→QS, move 21 KH-QS-JH→cascade
		test('do not collapse when moving a different sequence', () => {
			let game = FreeCell.parse(
				'' + //
					'>            KC KD 9H TS \n' +
					' JH KH                KS \n' +
					'    QS                TH \n' +
					'                      JS \n' +
					'                      QH \n' +
					' hand-jammed'
			);
			game = game.moveByShorthand('12');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀2⡁ JH→QS']);
			game = game.moveByShorthand('21');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀2⡁ JH→QS', 'move 2⡀1 KH-QS-JH→cascade']);
			game = game.undo().undo().moveByShorthand('13');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀3 JH→cascade']);
			game = game.moveByShorthand('34');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀4 JH→cascade']);
			game = game.undo().moveByShorthand('12');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀2⡁ JH→QS']);
			game = game.$moveCardToPile('JH', '3');
			expect(game.history).toEqual(['hand-jammed', 'move 1⡀3 JH→cascade']);
		});

		// similar to collapsing the moves into one
		// this is essentially a free undo, except that "back to it's original location" is a valid move
		test('moving a card back to its original location remove the move from the history', () => {
			let game = FreeCell.parse(
				'' + //
					' QD          QC JD KH TS \n' +
					' KD KC       JS          \n' +
					' QS          KS          \n' +
					' hand-jammed'
			);
			game = game.moveByShorthand('ab');
			expect(game.history).toEqual(['hand-jammed', 'move ab QD→cell']);
			expect(game.previousAction).toEqual({
				text: 'move ab QD→cell',
				type: 'move',
			});
			game = game.moveByShorthand('bc');
			expect(game.history).toEqual(['hand-jammed', 'move ac QD→cell']);
			expect(game.previousAction).toEqual({
				text: 'move ac QD→cell',
				type: 'move',
			});
			game = game.moveByShorthand('cd');
			expect(game.history).toEqual(['hand-jammed', 'move ad QD→cell']);
			expect(game.previousAction).toEqual({
				text: 'move ad QD→cell',
				type: 'move',
			});
			expect(game.print()).toBe(
				'' + //
					'         >QD QC JD KH TS \n' +
					' KD KC       JS          \n' +
					' QS          KS          \n' +
					' move ad QD→cell'
			);
			expect(game.print({ includeHistory: true })).toBe(
				'' + //
					'          QD QC JD KH TS \n' +
					' KD KC       JS          \n' +
					' QS          KS          \n' +
					' move ad QD→cell\n' +
					' hand-jammed'
			);
			game = game.moveByShorthand('da');
			expect(game.history).toEqual(['hand-jammed']);
			expect(game.previousAction).toEqual({
				text: 'hand-jammed',
				type: 'init',
			});
			expect(game.print()).toBe(
				'' + //
					'>QD          QC JD KH TS \n' +
					' KD KC       JS          \n' +
					' QS          KS          \n' +
					' hand-jammed'
			);
			expect(game.print({ includeHistory: true })).toBe(
				'' + //
					' QD          QC JD KH TS \n' +
					' KD KC       JS          \n' +
					' QS          KS          \n' +
					' hand-jammed'
			);
		});

		/**
			move card a
			move card b
			move card c around a bit
			move card d a bit
			move card c a bit
			(still only 5 moves)
			move card c back
			move card d a bit, then back
			move card c back
			move card b back
			move card a back
			(no moves anymore, just shuffle and deal)

			@see GameBoard.test.tsx
		*/
		test('a wild example', () => {
			let game = FreeCell.parse(
				'' + //
					' QD          9C 9D TH JS \n' +
					' QH KH KS          JH QS \n' +
					' JC                TD TC \n' +
					'                   KD KC \n' +
					':d QC JD \n' +
					' hand-jammed'
			);
			// move card a
			// move card b
			expect(game.history).toEqual(['hand-jammed']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			game = game.$moveCardToPile('KS', '4');
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			game = game.$touchAndMove('QD');
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade']);
			expect(game.print()).toBe(
				'' + //
					'             9C 9D TH JS \n' +
					' QH KH   >KS       JH QS \n' +
					' JC       QD       TD TC \n' +
					'                   KD KC \n' +
					':d QC JD \n' +
					' move a4 QD→KS'
			);

			// move card c around a bit
			game = game.$touchAndMove('QH');
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀8⡂ QH-JC→KC']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			game = game.$moveCardToPile('QH', '3');
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀3 QH-JC→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			game = game.$moveCardToPile('QH', '5');
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			expect(game.print()).toBe(
				'' + //
					'             9C 9D TH JS \n' +
					'    KH    KS>QH    JH QS \n' +
					'          QD JC    TD TC \n' +
					'                   KD KC \n' +
					':d QC JD \n' +
					' move 15 QH-JC→cascade'
			);

			// move card d a bit, and then back
			game = game.$touchAndMove('KH');
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade', 'move 2⡀3 KH→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade']);
			game = game.$touchAndMove();
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade', 'move 2⡀6 KH→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade']);
			game = game.$touchAndMove();
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade', 'move 2⡀1 KH→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade']);
			game = game.$touchAndMove();
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀5 QH-JC→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			expect(game.print()).toBe(
				'' + //
					'             9C 9D TH JS \n' +
					'   >KH    KS QH    JH QS \n' +
					'          QD JC    TD TC \n' +
					'                   KD KC \n' +
					':d QC JD \n' +
					' move 15 QH-JC→cascade'
			);

			// move card c back
			// move card b back
			game = game.$moveCardToPile('QH', '6');
			// prettier-ignore
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS', 'move 1⡀6 QH-JC→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			game = game.$moveCardToPile('QH', '1');
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade', 'move a4⡀ QD→KS']);
			expect(game.undo().history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade']);
			game = game.$moveCardToPile('QD', 'a');
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀4 KS→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			game = game.$touchAndMove('KS');
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀5 KS→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			game = game.$touchAndMove();
			expect(game.history).toEqual(['hand-jammed', 'move 3⡀6 KS→cascade']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			// move card a back
			// (no moves anymore, just shuffle and deal)
			game = game.$touchAndMove();
			expect(game.history).toEqual(['hand-jammed']);
			expect(game.undo().history).toEqual(['hand-jammed']);
			expect(game.print()).toBe(
				'' + //
					' QD          9C 9D TH JS \n' +
					' QH KH>KS          JH QS \n' +
					' JC                TD TC \n' +
					'                   KD KC \n' +
					':d QC JD \n' +
					' hand-jammed'
			);
		});
	});

	test('parse history actions', () => {
		const game = FreeCell.parse(
			'' +
				'             AD 3C 4H 3S \n' +
				' QH TS 2D 7C 4C 7D QC KH \n' +
				' JC 9D 9C 6H 4D 6C JD QS \n' +
				' TH 8C KC 5S KD 5H    JH \n' +
				'             8H 4S    TC \n' +
				'             KS 3D    9H \n' +
				'             QD       8S \n' +
				'             JS       7H \n' +
				'             TD       6S \n' +
				'             9S       5D \n' +
				'             8D          \n' +
				'             7S          \n' +
				'             6D          \n' +
				'             5C          \n' +
				' move 37 JD→QC\n' +
				':h shuffle32 5\n' +
				' 53 6a 65 67 85 a8 68 27 \n' +
				' 67 1a 1b 13 15 a5 1a 1c \n' +
				' 86 85 86 86 21 25 2b 27 \n' +
				' 42 45 c5 42 47 4h 48 48 \n' +
				' 78 7c 7h 71 78 7h ah b8 \n' +
				' 34 31 32 c7 37 '
		);
		game.history.splice(0, game.history.length - 8);
		game.history.unshift('hand-jammed');
		expect(game.history).toEqual([
			'hand-jammed',
			// 'move 7⡅c QC→cell',
			// 'move 7⡄h⡂ 4H→3H',
			// 'move 7⡃1⡀ JC→QH',
			// 'move 7⡂8⡆ 6S→7H',
			'move 7⡁h⡁ 3C→2C (auto-foundation 7 2S)',
			'move ah⡃ 3S→2S',
			'move b8⡇ 5D→6S',
			'move 3⡆4 7C-6H-5S→cascade',
			'move 3⡅1⡁ TH→JC',
			'move 3⡄2⡁ 8C→9D',
			'move c7 QC→cascade',
			'move 3⡃7⡀ JD→QC',
		]);
		const gamePrintHist = game.print({ includeHistory: true });
		expect(gamePrintHist).toBe(
			'' + //
				'             AD 3C 4H 3S \n' +
				' QH TS 2D 7C 4C 7D QC KH \n' +
				' JC 9D 9C 6H 4D 6C JD QS \n' +
				' TH 8C KC 5S KD 5H    JH \n' +
				'             8H 4S    TC \n' +
				'             KS 3D    9H \n' +
				'             QD       8S \n' +
				'             JS       7H \n' +
				'             TD       6S \n' +
				'             9S       5D \n' +
				'             8D          \n' +
				'             7S          \n' +
				'             6D          \n' +
				'             5C          \n' +
				' move 3⡃7⡀ JD→QC\n' +
				' move c7 QC→cascade\n' +
				' move 3⡄2⡁ 8C→9D\n' +
				' move 3⡅1⡁ TH→JC\n' +
				' move 3⡆4 7C-6H-5S→cascade\n' +
				' move b8⡇ 5D→6S\n' +
				' move ah⡃ 3S→2S\n' +
				' move 7⡁h⡁ 3C→2C (auto-foundation 7 2S)\n' +
				' hand-jammed'
		);

		const parsed = FreeCell.parse(gamePrintHist);
		expect(parsed.print({ includeHistory: true })).toBe(gamePrintHist);
		expect(parsed.history).toEqual(game.history);
		expect(parsed.cards).toEqual(game.cards);

		// but really, we have _all_ the information we need to rebuild the entire game state
		expect(parsed).toEqual(game);
	});

	describe('bugfixes', () => {
		test('broken game', () => {
			const gamePrint =
				'             AD 2C       \n' +
				' AH 8S 2D QS 4C 9H 2S 3D \n' + // 9H is in the wrong place
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
				' 67 ';
			// move is already marked as invalid, so we don't check it with an undo
			expect(() => FreeCell.parse(gamePrint, { throwError: true })).not.toThrow();
			const game = FreeCell.parse(gamePrint);
			expect(game.history).toEqual(['init with invalid history replay cards', 'invalid move 67 9H→TC']);
			expect(game.undo()).toBe(game);

			// … but we really want to check this exception
			// XXX (techdebt) (optimize) (undo) should we remove this throws case? is it still possible to get here?
			//  - i think.. if we can't get here without mangling the history, then it should go
			//  - when it was written, we had an "real life" example, now this is a forced situation
			game.history[1] = 'move 67 9H→TC';
			expect(() => game.undo({ throwError: true })).toThrow('invalid first card pile: move 67 9H→TC; 6 !== 7');
		});

		test('undo to init (hand-jammed)', () => {
			// hand-jammed (type: 'init') just has the cursor in the deck
			// there is no way of knowing where gameStateOne cursor should be, so it's in the deck
			// the move is 23
			// when we undo there _was_ a specical condition for hand-jammed to just ignore it
			// …to make all the tests prettier (not cursor in the deck)
			// but we _are_ undoing to init, even if hand-jammed, having the special case is weird
			// there was a comment to remove that special case, and here is the proof why

			const gamePrintHist =
				'' + //
				'             QC TD KH 9S \n' +
				' QS KC       TS          \n' +
				' JD QD       KS          \n' +
				' KD JS                   \n' +
				' hand-jammed';

			const gameStateOne = FreeCell.parse(gamePrintHist);
			const gameStateTwo = gameStateOne.moveByShorthand('23');
			const gameStateThree = gameStateTwo.undo();

			expect(gameStateOne.print()).toBe(
				'' + //
					'>            QC TD KH 9S \n' +
					' QS KC       TS          \n' +
					' JD QD       KS          \n' +
					' KD JS                   \n' +
					' hand-jammed'
			);
			expect(gameStateOne.print({ includeHistory: true })).toBe(gamePrintHist);
			expect(gameStateThree.print()).toBe(
				'' + //
					'>            QC TD KH 9S \n' +
					' QS KC       TS          \n' +
					' JD QD       KS          \n' +
					' KD JS                   \n' +
					' hand-jammed'
			);
			expect(gameStateThree.print({ includeHistory: true })).toBe(gamePrintHist);

			// the original parse has the history, so this should be fine
			expect(gameStateThree.print({ includeHistory: true })).toBe(gameStateOne.print({ includeHistory: true }));

			// this is the goal of every undo
			expect(gameStateThree.print()).toBe(gameStateOne.print());
		});
	});

	/*
		1. play game to the end
		2. undo each move along the way, ensure same as previous
		3. print: ensure game history is the same
		4. reverse game: ensure start
		...
		This sounds quite a lot like FreeCell.parse with history, just do that?
	*/
	describe('play a game backward and forwards using move history', () => {
		test.todo('4 cells, 4 cascades');

		test.todo('1 cells, 10 cascades');

		describe.each`
			cellCount | cascadeCount | seedSolutions
			${4}      | ${8}         | ${SEED_SOLUTIONS_4x8}
			${6}      | ${10}        | ${SEED_SOLUTIONS_6x10}
		`(
			'$cellCount cells, $cascadeCount cascades',
			({ cellCount, cascadeCount, seedSolutions }: { cellCount: number; cascadeCount: number; seedSolutions: Map<number, string> }) => {
				test.each(Array.from(seedSolutions.keys()))('Game #%d', (seed: number) => {
					let game = new FreeCell({ cellCount, cascadeCount }).shuffle32(seed).dealAll();

					// play the game forward
					// undo each move as we play
					getMoves(seed, { cellCount, cascadeCount }).forEach((move) => {
						const prevState = game.print({ includeHistory: true });
						const prevAction = game.previousAction;
						const prevStateNH = game.print({ includeHistory: false });

						game = game.moveByShorthand(move);
						expect(game.previousAction.text).toMatch(spotCheckMoveRegex(move));

						// undo a in a different "branch" so we can keep marking forward
						const afterUndo = game.undo();
						// same action as before the undo, except flagged as such
						expect(afterUndo.previousAction).toEqual({ ...prevAction, gameFunction: 'undo' });
						expect(afterUndo.print({ includeHistory: true })).toBe(prevState);
						expect(afterUndo.print({ includeHistory: false })).toBe(prevStateNH);
					});
					expect(game.win).toBe(true);
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
					const movesSeed = parseMovesFromHistory(game.history);
					expect(movesSeed?.seed).toBe(seed);
					expect(movesSeed?.moves).toEqual(getMoves(seed, { cellCount, cascadeCount }));

					game = undoUntilStart(game);
					expect(game.history).toEqual([`shuffle deck (${seed})`, 'deal all cards']);
					const newGame = new FreeCell({ cellCount, cascadeCount }).shuffle32(seed).dealAll();
					expect(game.cards).toEqual(newGame.cards);

					expect(game.previousAction.gameFunction).toBe('undo');
					delete game.previousAction.gameFunction;

					expect(newGame).toEqual(game);
				});
			}
		);
	});
});
