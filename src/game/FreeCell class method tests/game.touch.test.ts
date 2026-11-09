import { beforeEach, describe, expect, test } from 'vitest';
import { removeBraille } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { countEmptyCascades, countEmptyCells, maxMovableSequenceLength } from '@/game/move/move';

describe('game.touch', () => {
	// also tests print, since select is rendered
	describe('select', () => {
		let game: FreeCell;
		beforeEach(() => {
			// #12411 has a few sequences we can test
			game = new FreeCell().shuffle32(12411);
		});

		test('preview', () => {
			// this demo deal is not a valid board position
			// but we only want to test selections, so it's OK for this
			// i suppose we could instead FreeCell.parse this instead of shuffle
			expect(game.dealAll({ demo: true }).print()).toBe(
				'' + //
					'>4C QD 8S 6S TH 7C 9S 9D \n' +
					' KS 4D 9C 5C 8H 7S 7H AD \n' +
					' 5D 3S KD TC 3C TD JH AS \n' +
					' JS 2D 6C 4H 7D QS 2S TS \n' +
					' 9H AH 6D JD 8C 5H 6H 8D \n' +
					' QH 5S KH 3H 4S 2C QC 2H \n' +
					' JC KC 3D AC             \n' +
					' deal all cards'
			);
		});

		describe('deck', () => {
			test('single', () => {
				game = game.setCursor({ fixture: 'deck', data: [51] }).touch();
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [51] },
					cards: [{ rank: 'king', suit: 'spades', location: { fixture: 'deck', data: [51] } }],
					peekOnly: true,
				});
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						'                         \n' +
						':d>KS|4D 9C 5C 8H 7S 7H AD 5D 3S KD TC 3C TD JH AS JS 2D 6C 4H 7D QS 2S TS 9H AH 6D JD 8C 5H 6H 8D QH 5S KH 3H 4S 2C QC 2H JC KC 3D AC 4C QD 8S 6S TH 7C 9S 9D \n' +
						' peek k KS'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'deck', data: [42] });
				expect(game.previousAction.text).toBe('cursor set k⡪ 3S');
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						'                         \n' +
						':d|KS|4D 9C 5C 8H 7S 7H AD 5D>3S KD TC 3C TD JH AS JS 2D 6C 4H 7D QS 2S TS 9H AH 6D JD 8C 5H 6H 8D QH 5S KH 3H 4S 2C QC 2H JC KC 3D AC 4C QD 8S 6S TH 7C 9S 9D \n' +
						' cursor set k 3S'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'deck', data: [51] }).touch();
				expect(game.previousAction.text).toBe('deselect k⡳ KS');
				expect(game.selection).toEqual(null);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
			});

			test('empty', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'deck', data: [0] })
					.touch();
				expect(game.previousAction.text).toBe('touch stop');
				expect(game.selection).toEqual(null);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						':d>   \n' +
						' touch stop'
				);
			});

			test('last', () => {
				game = game.setCursor({ fixture: 'deck', data: [0] }).touch();
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [0] },
					cards: [{ rank: '9', suit: 'diamonds', location: { fixture: 'deck', data: [0] } }],
					peekOnly: true,
				});
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						'                         \n' +
						':d KS 4D 9C 5C 8H 7S 7H AD 5D 3S KD TC 3C TD JH AS JS 2D 6C 4H 7D QS 2S TS 9H AH 6D JD 8C 5H 6H 8D QH 5S KH 3H 4S 2C QC 2H JC KC 3D AC 4C QD 8S 6S TH 7C 9S>9D|\n' +
						' peek k 9D'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
			});

			describe('cursor ⨉ selection', () => {
				test.each`
					d0    | printSubstr                     | actionText
					${44} | ${'7S 7H>AD 5D|3S|KD TC 3C TD'} | ${'cursor set k⡬ AD'}
					${43} | ${'7S 7H AD>5D|3S|KD TC 3C TD'} | ${'cursor set k⡫ 5D'}
					${42} | ${'7S 7H AD 5D>3S|KD TC 3C TD'} | ${'cursor set k⡪ 3S'}
					${41} | ${'7S 7H AD 5D|3S>KD TC 3C TD'} | ${'cursor set k⡩ KD'}
					${40} | ${'7S 7H AD 5D|3S|KD>TC 3C TD'} | ${'cursor set k⡨ TC'}
					${39} | ${'7S 7H AD 5D|3S|KD TC>3C TD'} | ${'cursor set k⡧ 3C'}
				`('$d0', ({ d0, printSubstr, actionText }: { d0: number; printSubstr: string; actionText: string }) => {
					game = game
						.setCursor({ fixture: 'deck', data: [42] })
						.touch()
						.setCursor({ fixture: 'deck', data: [d0] });
					expect(game.previousAction.text).toBe(actionText);
					expect(game.print()).toBe(
						'' + //
							'                         \n' +
							'                         \n' +
							`:d KS 4D 9C 5C 8H ${printSubstr} JH AS JS 2D 6C 4H 7D QS 2S TS 9H AH 6D JD 8C 5H 6H 8D QH 5S KH 3H 4S 2C QC 2H JC KC 3D AC 4C QD 8S 6S TH 7C 9S 9D \n` +
							` ${removeBraille(actionText)}`
					);
					expect(FreeCell.parse(game.print()).print()).toBe(game.print());
				});
			});

			describe('check all coords', () => {
				// spot check coords
				// TODO (joker) also test when jokers are in the deck
				test.each`
					d0    | actionText
					${0}  | ${'peek k⡀ AC'}
					${1}  | ${'peek k⡁ AD'}
					${50} | ${'peek k⡲ KH'}
					${51} | ${'peek k⡳ KS'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					game = new FreeCell().setCursor({ fixture: 'deck', data: [d0] }).touch();
					expect(game.previousAction.text).toBe(actionText);
				});
			});
		});

		describe('cell', () => {
			test('single', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cell', data: [1] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cell', data: [1] },
					cards: [{ rank: 'queen', suit: 'diamonds', location: { fixture: 'cell', data: [1] } }],
					peekOnly: false,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C>QD|8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' select b QD'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cascade', data: [3, 3] });
				expect(game.previousAction.text).toBe('cursor set 4⡃ JD');
				expect(game.print()).toBe(
					'' + //
						' 4C|QD|8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D>JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' cursor set 4 JD'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cell', data: [1] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('deselect b QD');
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
			});

			test('empty', () => {
				game = game.setCursor({ fixture: 'cell', data: [1] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('touch stop');
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
			});
		});

		test('cell ⨉ foundation', () => {
			game = game
				.dealAll({ demo: true })
				.setCursor({ fixture: 'cell', data: [3] })
				.touch();
			expect(game.selection).toEqual({
				location: { fixture: 'cell', data: [3] },
				cards: [{ rank: '6', suit: 'spades', location: { fixture: 'cell', data: [3] } }],
				peekOnly: false,
			});
			expect(game.print()).toBe(
				'' + //
					' 4C QD 8S>6S|TH 7C 9S 9D \n' +
					' KS 4D 9C 5C 8H 7S 7H AD \n' +
					' 5D 3S KD TC 3C TD JH AS \n' +
					' JS 2D 6C 4H 7D QS 2S TS \n' +
					' 9H AH 6D JD 8C 5H 6H 8D \n' +
					' QH 5S KH 3H 4S 2C QC 2H \n' +
					' JC KC 3D AC             \n' +
					' select d 6S'
			);
			expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

			game = game.setCursor({ fixture: 'foundation', data: [0] });
			expect(game.previousAction.text).toBe('cursor set h⡀ TH');
			expect(game.print()).toBe(
				'' + //
					' 4C QD 8S|6S>TH 7C 9S 9D \n' +
					' KS 4D 9C 5C 8H 7S 7H AD \n' +
					' 5D 3S KD TC 3C TD JH AS \n' +
					' JS 2D 6C 4H 7D QS 2S TS \n' +
					' 9H AH 6D JD 8C 5H 6H 8D \n' +
					' QH 5S KH 3H 4S 2C QC 2H \n' +
					' JC KC 3D AC             \n' +
					' cursor set h TH'
			);
			expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
		});

		test('foundation', () => {
			game = game
				.dealAll({ demo: true })
				.setCursor({ fixture: 'foundation', data: [2] })
				.touch();
			expect(game.selection).toEqual(null);
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [2] });
			expect(game.print()).toBe(
				'' + //
					' 4C QD 8S 6S TH 7C>9S 9D \n' +
					' KS 4D 9C 5C 8H 7S 7H AD \n' +
					' 5D 3S KD TC 3C TD JH AS \n' +
					' JS 2D 6C 4H 7D QS 2S TS \n' +
					' 9H AH 6D JD 8C 5H 6H 8D \n' +
					' QH 5S KH 3H 4S 2C QC 2H \n' +
					' JC KC 3D AC             \n' +
					' touch stop'
			);
			expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

			game = game.setCursor({ fixture: 'foundation', data: [2] }).touch();
			expect(game.previousAction.text).toBe('touch stop');
			expect(game.selection).toEqual(null);
			expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
		});

		test('foundation last', () => {
			game = game
				.dealAll({ demo: true })
				.setCursor({ fixture: 'foundation', data: [3] })
				.touch();
			expect(game.selection).toEqual(null);
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [3] });
			expect(game.print()).toBe(
				'' + //
					' 4C QD 8S 6S TH 7C 9S>9D \n' +
					' KS 4D 9C 5C 8H 7S 7H AD \n' +
					' 5D 3S KD TC 3C TD JH AS \n' +
					' JS 2D 6C 4H 7D QS 2S TS \n' +
					' 9H AH 6D JD 8C 5H 6H 8D \n' +
					' QH 5S KH 3H 4S 2C QC 2H \n' +
					' JC KC 3D AC             \n' +
					' touch stop'
			);
			expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
		});

		test('edge case: foundation selectionOnly', () => {
			// need to already have a section
			// the new place cannot be selected
			// the new place needs to be an availableMoves
			game = new FreeCell().dealAll().$selectCard('AS').touchByPile('h', { autoFoundation: false });
			// AS cannot be selected
			expect(game.selection).toBe(null);
			expect(game.$selectCard('AS').selection).toBe(null);
			game = game.$selectCard('2S');
			expect(game.print()).toBe(
				'' + //
					'             AS          \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C>2S|2H 2D 2C \n' +
					'    AH AD AC             \n' +
					' select 5 2S'
			);

			// we have a selection
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [4, 5] },
				cards: [{ rank: '2', suit: 'spades', location: { fixture: 'cascade', data: [4, 5] } }],
				peekOnly: false,
			});
			// AS is a valid destination
			expect(game.availableMoves).toEqual([
				{ location: { fixture: 'cell', data: [0] }, moveDestinationType: 'cell:empty', priority: -1 },
				{ location: { fixture: 'cell', data: [1] }, moveDestinationType: 'cell:empty', priority: -1 },
				{ location: { fixture: 'cell', data: [2] }, moveDestinationType: 'cell:empty', priority: -1 },
				{ location: { fixture: 'cell', data: [3] }, moveDestinationType: 'cell:empty', priority: -1 },
				{
					location: { fixture: 'foundation', data: [0] },
					moveDestinationType: 'foundation:any',
					priority: 4,
				},
			]);

			// now touch AS
			game = game.setCursor({ fixture: 'foundation', data: [0] }).touch({ selectionOnly: true });
			expect(game.previousAction).toEqual({
				text: 'touch stop',
				type: 'invalid',
			});
		});

		describe('cascade', () => {
			test('single cannot move', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cascade', data: [4, 1] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [4, 1] },
					cards: [{ rank: '3', suit: 'clubs', location: { fixture: 'cascade', data: [4, 1] } }],
					peekOnly: true,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC>3C|TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' peek 5 3C'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'foundation', data: [2] });
				expect(game.previousAction.text).toBe('cursor set h⡂ 9S');
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C>9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC|3C|TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' cursor set h 9S'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cascade', data: [4, 1] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('deselect 5⡁ 3C');
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
			});

			test('single can move', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cascade', data: [5, 4] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [5, 4] },
					cards: [{ rank: '2', suit: 'clubs', location: { fixture: 'cascade', data: [5, 4] } }],
					peekOnly: false,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S>2C|QC 2H \n' +
						' JC KC 3D AC             \n' +
						' select 6 2C'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cell', data: [1] });
				expect(game.print()).toBe(
					'' + //
						' 4C>QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S|2C|QC 2H \n' +
						' JC KC 3D AC             \n' +
						' cursor set b QD'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cascade', data: [5, 4] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('deselect 6⡄ 2C');
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
			});

			test('sequence cannot move', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cascade', data: [1, 0] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [1, 0] },
					cards: [
						{ rank: '4', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 0] } },
						{ rank: '3', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
						{ rank: '2', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 2] } },
					],
					peekOnly: true,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS>4D|9C 5C 8H 7S 7H AD \n' +
						' 5D|3S|KD TC 3C TD JH AS \n' +
						' JS|2D|6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' peek 2 4D-3S-2D'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'foundation', data: [2] });
				expect(game.previousAction.text).toBe('cursor set h⡂ 9S');
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C>9S 9D \n' +
						' KS|4D|9C 5C 8H 7S 7H AD \n' +
						' 5D|3S|KD TC 3C TD JH AS \n' +
						' JS|2D|6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' cursor set h 9S'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cascade', data: [1, 0] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('deselect 2⡀ 4D-3S-2D');
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				// side note: allowPeekOnly
				expect(game.touch().previousAction.text).toBe('peek 2⡀ 4D-3S-2D');
				expect(game.touch({ allowPeekOnly: false }).previousAction.text).toBe('touch stop');
			});

			test('sequence can move', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cascade', data: [0, 4] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [0, 4] },
					cards: [
						{ rank: 'queen', suit: 'hearts', location: { fixture: 'cascade', data: [0, 4] } },
						{ rank: 'jack', suit: 'clubs', location: { fixture: 'cascade', data: [0, 5] } },
					],
					peekOnly: false,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						'>QH|5S KH 3H 4S 2C QC 2H \n' +
						'|JC|KC 3D AC             \n' +
						' select 1 QH-JC'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cell', data: [3] });
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S>6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH AS \n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						'|QH|5S KH 3H 4S 2C QC 2H \n' +
						'|JC|KC 3D AC             \n' +
						' cursor set d 6S'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				game = game.setCursor({ fixture: 'cascade', data: [0, 4] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.previousAction.text).toBe('deselect 1⡄ QH-JC');
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());

				// semi-unrelated: allowPeekOnly
				expect(game.touch().previousAction.text).toBe('select 1⡄ QH-JC');
				expect(game.touch({ allowPeekOnly: false }).previousAction.text).toBe('select 1⡄ QH-JC');
			});

			test('sequence too tall', () => {
				game = FreeCell.parse(
					'' + //
						'>         2D             \n' +
						' AS AH KC KD AD AC    2C \n' +
						'       QD QC             \n' +
						'       JC JD             \n' +
						'       TD TC             \n' +
						'       9C 9D             \n' +
						'       8D 8C             \n' +
						'       7C 7D             \n' +
						' hand-jammed'
				)
					.setCursor({ fixture: 'cascade', data: [2, 1] })
					.touch();
				expect(game.print()).toBe(
					'' + //
						'          2D             \n' +
						' AS AH KC KD AD AC    2C \n' +
						'      >QD|QC             \n' +
						'      |JC|JD             \n' +
						'      |TD|TC             \n' +
						'      |9C|9D             \n' +
						'      |8D|8C             \n' +
						'      |7C|7D             \n' +
						':d KS KH QS QH JS JH TS TH 9S 9H 8S 8H 7S 7H 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H \n' +
						' select 3 QD-JC-TD-9C-8D-7C'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
				expect(game.selection?.cards.length).toBe(6);
				expect(countEmptyCells(game)).toBe(3);
				expect(countEmptyCascades(game)).toBe(1);
				expect(maxMovableSequenceLength(game)).toBe(8); // if we were to move to filled cascade
				expect(maxMovableSequenceLength(game) / 2).toBe(4); // since we are moving to an empty cascade
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [2, 1] },
					cards: [
						{ rank: 'queen', suit: 'diamonds', location: { fixture: 'cascade', data: [2, 1] } },
						{ rank: 'jack', suit: 'clubs', location: { fixture: 'cascade', data: [2, 2] } },
						{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [2, 3] } },
						{ rank: '9', suit: 'clubs', location: { fixture: 'cascade', data: [2, 4] } },
						{ rank: '8', suit: 'diamonds', location: { fixture: 'cascade', data: [2, 5] } },
						{ rank: '7', suit: 'clubs', location: { fixture: 'cascade', data: [2, 6] } },
					],
					peekOnly: false,
				});
				expect(game.availableMoves).toEqual([]);
			});

			test('empty', () => {
				game = game.setCursor({ fixture: 'cascade', data: [2, 0] }).touch();
				expect(game.selection).toEqual(null);
				expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] });
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						'      >                  \n' +
						':d KS 4D 9C 5C 8H 7S 7H AD 5D 3S KD TC 3C TD JH AS JS 2D 6C 4H 7D QS 2S TS 9H AH 6D JD 8C 5H 6H 8D QH 5S KH 3H 4S 2C QC 2H JC KC 3D AC 4C QD 8S 6S TH 7C 9S 9D \n' +
						' touch stop'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
			});

			test('last 1', () => {
				game = game
					.dealAll({ demo: true })
					.setCursor({ fixture: 'cascade', data: [7, 1] })
					.touch();
				expect(game.selection).toEqual({
					location: { fixture: 'cascade', data: [7, 1] },
					cards: [{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [7, 1] } }],
					peekOnly: true,
				});
				expect(game.print()).toBe(
					'' + //
						' 4C QD 8S 6S TH 7C 9S 9D \n' +
						' KS 4D 9C 5C 8H 7S 7H AD \n' +
						' 5D 3S KD TC 3C TD JH>AS|\n' +
						' JS 2D 6C 4H 7D QS 2S TS \n' +
						' 9H AH 6D JD 8C 5H 6H 8D \n' +
						' QH 5S KH 3H 4S 2C QC 2H \n' +
						' JC KC 3D AC             \n' +
						' peek 8 AS'
				);
				expect(FreeCell.parse(game.print(), { invalidFoundations: true }).print()).toBe(game.print());
			});

			test('last 2', () => {
				game = new FreeCell()
					.shuffle32(11863)
					.dealAll({ demo: false })
					.setCursor({ fixture: 'cascade', data: [6, 2] })
					.touch();

				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						' 8H 5D KS 3C 3S 3H JD AC \n' +
						' 9H 7D KC 5C 9D 5H 2C 2H \n' +
						' 6D TC 4H TS 3D 8S>QH|4S \n' +
						' 6S 2S 5S 7H QD 8C|JC|8D \n' +
						' AS 6H 9S 4C KD TD 6C 9C \n' +
						' 7C JH 7S TH QS AD KH 2D \n' +
						' QC AH JS 4D             \n' +
						' peek 7 QH-JC'
				);
				expect(FreeCell.parse(game.print()).print()).toBe(game.print());
			});
		});

		test.todo('select when current select can move'); // touch stop

		test.todo('select when current select cannot move'); // select

		describe('check all coords', () => {
			const gamePrint =
				'' + //
				'>                  \n' +
				' KH          \n' +
				' QS          \n' +
				' JH          \n' +
				' TS          \n' +
				' 9H          \n' +
				' 8S          \n' +
				' 7H          \n' +
				' 6S          \n' +
				' 5H          \n' +
				' 4S          \n' +
				' 3H          \n' +
				' 2S          \n' +
				' AH          \n' +
				' KS          \n' +
				' QH          \n' +
				' JS          \n' +
				' TH          \n' +
				' 9S          \n' +
				' 8H          \n' +
				' 7S          \n' +
				' 6H          \n' +
				' 5S          \n' +
				' 4H          \n' +
				' 3S          \n' +
				' 2H          \n' +
				' AS          \n' +
				' KD          \n' +
				' QC          \n' +
				' JD          \n' +
				' TC          \n' +
				' 9D          \n' +
				' 8C          \n' +
				' 7D          \n' +
				' 6C          \n' +
				' 5D          \n' +
				' 4C          \n' +
				' 3D          \n' +
				' 2C          \n' +
				' AD          \n' +
				' KC          \n' +
				' QD          \n' +
				' JC          \n' +
				' TD          \n' +
				' 9C          \n' +
				' 8D          \n' +
				' 7C          \n' +
				' 6D          \n' +
				' 5C          \n' +
				' 4D          \n' +
				' 3C          \n' +
				' 2D          \n' +
				' AC          \n' +
				' hand-jammed';
			// spot check coords
			// TODO (joker) also test when jokers are in the deck
			test.each`
				d1    | actionText
				${0}  | ${'peek 1⡀ KH-QS-JH-TS-9H-8S-7H-6S-5H-4S-3H-2S-AH'}
				${1}  | ${'peek 1⡁ QS-JH-TS-9H-8S-7H-6S-5H-4S-3H-2S-AH'}
				${12} | ${'peek 1⡌ AH'}
				${13} | ${'peek 1⡍ KS-QH-JS-TH-9S-8H-7S-6H-5S-4H-3S-2H-AS'}
				${25} | ${'peek 1⡙ AS'}
				${26} | ${'peek 1⡚ KD-QC-JD-TC-9D-8C-7D-6C-5D-4C-3D-2C-AD'}
				${38} | ${'peek 1⡦ AD'}
				${39} | ${'select 1⡧ KC-QD-JC-TD-9C-8D-7C-6D-5C-4D-3C-2D-AC'}
				${50} | ${'select 1⡲ 2D-AC'}
				${51} | ${'select 1⡳ AC'}
			`('$d1', ({ d1, actionText }: { d1: number; actionText: string }) => {
				game = FreeCell.parse(gamePrint)
					.setCursor({ fixture: 'cascade', data: [0, d1] })
					.touch();
				expect(game.previousAction.text).toBe(actionText);
			});
		});
	});

	// TODO (test) list out every single, uh, "type" of location, and then ensure we have a complete cross product from ⨉ to
	//  - cell (empty, not empty)
	//  - foundation (empty (specific, pile, invalid destination), not empty (each limit, pile, invalid destination))
	//  - cascade (empty, not empty (before, single, sequence (first, middle, last), pile))
	//  - deck (empty, not empty (pile, first, middle, last))
	// ---
	//  - review `MoveSourceType` for legal moves, make a separate list for all possible moves
	//  - review `MoveDestinationType` for legal moves, make a separate list for all possible moves
	describe('move card', () => {
		let game: FreeCell;

		describe('from: deck', () => {
			test('to: deck', () => {
				const game = new FreeCell().shuffle32(5).dealAll({ demo: true, keepDeck: true }).$selectCard('6H').moveCursor('left');
				expect(game.__printDeck()).toBe('|6H|6C QC JS 9S AD 7C>TS ');
				// we can't move from deck to deck
				const blocked = game.touch();
				expect(blocked.__printDeck()).toBe(' 6H 6C QC JS 9S AD 7C>TS|');
				expect(blocked.previousAction).toEqual({
					text: 'peek k⡀ TS',
					type: 'select',
				});
				// 'recall-or-bury' does not apply here (this is neither recall nor bury)
				expect(game.touch({ gameFunction: 'recall-or-bury' })).toEqual(blocked);
			});

			test.todo('to: cell');

			test('to: foundation', () => {
				const game = new FreeCell().$selectCard('AC').setCursor({ fixture: 'foundation', data: [1] });
				expect(game.previousAction.text).toBe('cursor set h⡁');
				expect(game.print()).toBe(
					'' +
						'               >         \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD|AC|\n' +
						' cursor set h'
				);

				// we can't move from deck to deck
				const blocked = game.touch();
				expect(blocked.previousAction).toEqual({
					text: 'invalid move k⡀h⡁ AC→foundation',
					type: 'invalid',
				});
				expect(blocked.deck.length).toBe(52);

				// empty
				let recalled = game.touch({ gameFunction: 'recall-or-bury' });
				expect(recalled.deck[0]).toEqual({ rank: 'ace', suit: 'diamonds', location: { fixture: 'deck', data: [0] } });
				expect(recalled.deck[50]).toEqual({ rank: 'king', suit: 'spades', location: { fixture: 'deck', data: [50] } });
				expect(recalled.deck[51]).toBe(undefined);
				expect(recalled.deck.length).toBe(51);
				expect(recalled.print()).toBe(
					'' +
						'               >AC       \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD \n' +
						' invalid move kh AC→foundation'
				);
				expect(recalled.previousAction).toEqual({
					text: 'invalid move k⡀h⡁ AC→foundation',
					type: 'move',
					gameFunction: 'recall-or-bury',
				});

				// not empty
				recalled = recalled.$selectCard('2C').touchByPile('h', { gameFunction: 'recall-or-bury' });
				expect(recalled.deck.slice(0, 6)).toEqual([
					{ rank: 'ace', suit: 'diamonds', location: { fixture: 'deck', data: [0] } },
					{ rank: 'ace', suit: 'hearts', location: { fixture: 'deck', data: [1] } },
					{ rank: 'ace', suit: 'spades', location: { fixture: 'deck', data: [2] } },
					{ rank: '2', suit: 'diamonds', location: { fixture: 'deck', data: [3] } },
					{ rank: '2', suit: 'hearts', location: { fixture: 'deck', data: [4] } },
					{ rank: '2', suit: 'spades', location: { fixture: 'deck', data: [5] } },
				]);
				expect(recalled.deck.length).toBe(50);
				expect(recalled.print()).toBe(
					'' +
						'               >2C       \n' +
						'                         \n' +
						':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D AS AH AD \n' +
						' invalid move kh 2C→AC'
				);
				expect(recalled.previousAction).toEqual({
					text: 'invalid move k⡃h⡁ 2C→AC',
					type: 'move',
					gameFunction: 'recall-or-bury',
				});
			});

			describe('to: cascade', () => {
				describe('not empty', () => {
					test.todo('single');

					describe('sequence', () => {
						test.todo('fist');

						test.todo('middle');

						test.todo('last');
					});

					test.todo('pile');
				});

				test.todo('empty');
			});
		});

		describe('from: cell', () => {
			describe('to: deck', () => {
				test('empty', () => {
					game = new FreeCell()
						.shuffle32(5)
						.dealAll({ demo: true })
						.$selectCard('6C')
						.setCursor({ fixture: 'deck', data: [0] });
					expect(game.print()).toBe(
						'' +
							' 6H|6C|QC JS 9S AD 7C TS \n' +
							' AH 8S 2D QS 4C 9H 2S 3D \n' +
							' 5C AS 9C KH 4D 2C 3C 4S \n' +
							' 3S 5D KC 3H KD 5H 6S 8D \n' +
							' TD 7S JD 7H 8H JH JC 7D \n' +
							' 5S QH 8C 9D KS QD 4H AC \n' +
							' 2H TC TH 6D             \n' +
							':d>   \n' +
							' cursor set k'
					);
					const blocked = game.touch();
					expect(blocked.print()).toBe(
						'' +
							' 6H|6C|QC JS 9S AD 7C TS \n' +
							' AH 8S 2D QS 4C 9H 2S 3D \n' +
							' 5C AS 9C KH 4D 2C 3C 4S \n' +
							' 3S 5D KC 3H KD 5H 6S 8D \n' +
							' TD 7S JD 7H 8H JH JC 7D \n' +
							' 5S QH 8C 9D KS QD 4H AC \n' +
							' 2H TC TH 6D             \n' +
							':d>   \n' +
							' invalid move bk 6C→deck'
					);
					expect(blocked.history).toEqual(['shuffle deck (5)', 'deal all cards']);
					expect(blocked.previousAction).toEqual({
						type: 'invalid',
						text: 'invalid move bk 6C→deck',
					});
					const burried = game.touch({ gameFunction: 'recall-or-bury' });
					expect(burried.print()).toBe(
						'' +
							' 6H    QC JS 9S AD 7C TS \n' +
							' AH 8S 2D QS 4C 9H 2S 3D \n' +
							' 5C AS 9C KH 4D 2C 3C 4S \n' +
							' 3S 5D KC 3H KD 5H 6S 8D \n' +
							' TD 7S JD 7H 8H JH JC 7D \n' +
							' 5S QH 8C 9D KS QD 4H AC \n' +
							' 2H TC TH 6D             \n' +
							':d>6C \n' +
							' invalid move bk 6C→deck'
					);
					expect(burried.print({ includeHistory: true })).toBe(
						'' +
							' 6H    QC JS 9S AD 7C TS \n' +
							' AH 8S 2D QS 4C 9H 2S 3D \n' +
							' 5C AS 9C KH 4D 2C 3C 4S \n' +
							' 3S 5D KC 3H KD 5H 6S 8D \n' +
							' TD 7S JD 7H 8H JH JC 7D \n' +
							' 5S QH 8C 9D KS QD 4H AC \n' +
							' 2H TC TH 6D             \n' +
							':d 6C \n' +
							' invalid move bk 6C→deck\n' +
							' deal all cards\n' +
							' shuffle deck (5)'
					);
					expect(burried.previousAction).toEqual({
						type: 'move',
						text: 'invalid move bk 6C→deck',
						gameFunction: 'recall-or-bury',
					});
				});

				describe('not empty', () => {
					test.todo('pile');

					test.todo('first');

					test.todo('middle');

					test.todo('last');
				});
			});

			test('to: cell', () => {
				game = FreeCell.parse(
					'' + //
						'>KS          JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' hand-jammed'
				)
					.touch()
					.setCursor({ fixture: 'cell', data: [1] });
				expect(game.print()).toBe(
					'' + //
						'|KS>         JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' cursor set b'
				);
				expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
				expect(game.selection).toEqual({
					location: { fixture: 'cell', data: [0] },
					cards: [{ rank: 'king', suit: 'spades', location: { fixture: 'cell', data: [0] } }],
					peekOnly: false,
				});
				expect(game.availableMoves).toEqual([
					{
						location: { fixture: 'cell', data: [1] },
						moveDestinationType: 'cell:empty',
						priority: 7,
					},
					{
						location: { fixture: 'cell', data: [2] },
						moveDestinationType: 'cell:empty',
						priority: 6,
					},
					{
						location: { fixture: 'cell', data: [3] },
						moveDestinationType: 'cell:empty',
						priority: 5,
					},
				]);
				game = game.touch({ autoFoundation: false });
				expect(game.print()).toBe(
					'' + //
						'   >KS       JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' move ab KS→cell'
				);
				expect(game.previousAction).toEqual({
					text: 'move ab KS→cell',
					type: 'move',
				});
				expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
				expect(game.selection).toEqual(null);
				expect(game.availableMoves).toEqual(null);
			});

			describe('to: foundation', () => {
				test.todo('empty');

				test('not empty', () => {
					game = FreeCell.parse(
						'' + //
							'>KS          JC JD JH QS \n' +
							' KC KD KH    QC QD QH    \n' +
							' hand-jammed'
					)
						.touch()
						.setCursor({ fixture: 'foundation', data: [3] });
					expect(game.previousAction.text).toBe('cursor set h⡃ QS');
					expect(game.print()).toBe(
						'' + //
							'|KS|         JC JD JH>QS \n' +
							' KC KD KH    QC QD QH    \n' +
							' cursor set h QS'
					);
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [3] });
					expect(game.selection).toEqual({
						location: { fixture: 'cell', data: [0] },
						cards: [{ rank: 'king', suit: 'spades', location: { fixture: 'cell', data: [0] } }],
						peekOnly: false,
					});
					expect(game.availableMoves).toEqual([
						{
							location: { fixture: 'cell', data: [1] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cell', data: [2] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cell', data: [3] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'foundation', data: [3] },
							moveDestinationType: 'foundation:any',
							priority: 1,
						},
						{
							location: { fixture: 'cascade', data: [3, 0] },
							moveDestinationType: 'cascade:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cascade', data: [7, 0] },
							moveDestinationType: 'cascade:empty',
							priority: -1,
						},
					]);
					game = game.touch({ autoFoundation: false });
					expect(game.print()).toBe(
						'' + //
							'             JC JD JH>KS \n' +
							' KC KD KH    QC QD QH    \n' +
							' move ah KS→QS'
					);
					expect(game.previousAction).toEqual({
						text: 'move ah⡃ KS→QS',
						type: 'move',
					});
					expect(game.cursor).toEqual({ fixture: 'foundation', data: [3] });
					expect(game.selection).toEqual(null);
					expect(game.availableMoves).toEqual(null);
				});
			});

			describe('to: cascade', () => {
				describe('not empty', () => {
					test('single', () => {
						game = FreeCell.parse(
							'' + //
								'>QC QD QH QS TC TD TH TS \n' +
								' KC KD KH KS JC JD JH JS \n' +
								' hand-jammed'
						)
							.touch()
							.setCursor({ fixture: 'cascade', data: [1, 0] });
						expect(game.previousAction.text).toBe('cursor set 2⡀ KD');
						expect(game.print()).toBe(
							'' + //
								'|QC|QD QH QS TC TD TH TS \n' +
								' KC>KD KH KS JC JD JH JS \n' +
								' cursor set 2 KD'
						);
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [1, 0] });
						expect(game.selection).toEqual({
							location: { fixture: 'cell', data: [0] },
							cards: [{ rank: 'queen', suit: 'clubs', location: { fixture: 'cell', data: [0] } }],
							peekOnly: false,
						});
						expect(game.availableMoves).toEqual([
							{
								location: { fixture: 'cascade', data: [1, 0] },
								moveDestinationType: 'cascade:sequence',
								priority: 7,
							},
							{
								location: { fixture: 'cascade', data: [2, 0] },
								moveDestinationType: 'cascade:sequence',
								priority: 6,
							},
						]);
						game = game.touch({ autoFoundation: false });
						expect(game.print()).toBe(
							'' + //
								'    QD QH QS TC TD TH TS \n' +
								' KC>KD KH KS JC JD JH JS \n' +
								'    QC                   \n' +
								' move a2 QC→KD'
						);
						expect(game.previousAction).toEqual({
							text: 'move a2⡀ QC→KD',
							type: 'move',
						});
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [1, 0] });
						expect(game.selection).toEqual(null);
						expect(game.availableMoves).toEqual(null);
					});

					describe('sequence', () => {
						beforeEach(() => {
							game = FreeCell.parse(
								'' + //
									'>TD          TC 9D KH KS \n' +
									' KC                   KD \n' +
									' QD                   QC \n' +
									' JC                   JD \n' +
									' hand-jammed'
							).touch();
						});

						test.todo('first');

						test.todo('middle');

						test('last', () => {
							game = game.setCursor({ fixture: 'cascade', data: [0, 2] });
							expect(game.previousAction.text).toBe('cursor set 1⡂ JC');
							expect(game.print()).toBe(
								'' + //
									'|TD|         TC 9D KH KS \n' +
									' KC                   KD \n' +
									' QD                   QC \n' +
									'>JC                   JD \n' +
									' cursor set 1 JC'
							);
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 2] });
							expect(game.selection).toEqual({
								location: { fixture: 'cell', data: [0] },
								cards: [{ rank: '10', suit: 'diamonds', location: { fixture: 'cell', data: [0] } }],
								peekOnly: false,
							});
							expect(game.availableMoves).toEqual([
								{
									location: { fixture: 'cell', data: [1] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cell', data: [2] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cell', data: [3] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'foundation', data: [1] },
									moveDestinationType: 'foundation:any',
									priority: 3,
								},
								{
									location: { fixture: 'cascade', data: [0, 2] },
									moveDestinationType: 'cascade:sequence',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [1, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [2, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [3, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [4, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [5, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [6, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
							]);
							game = game.touch({ autoFoundation: false });
							expect(game.print()).toBe(
								'' + //
									'             TC 9D KH KS \n' +
									' KC                   KD \n' +
									' QD                   QC \n' +
									'>JC                   JD \n' +
									' TD                      \n' +
									' move a1 TD→JC'
							);
							expect(game.previousAction).toEqual({
								text: 'move a1⡂ TD→JC',
								type: 'move',
							});
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 2] });
							expect(game.selection).toEqual(null);
							expect(game.availableMoves).toEqual(null);
						});
					});

					test.todo('pile');
				});

				test('empty', () => {
					game = FreeCell.parse(
						'' + //
							'>QC QD QH QS TC TD TH TS \n' +
							' KC       KS JC JD JH JS \n' +
							' hand-jammed'
					)
						.touch()
						.setCursor({ fixture: 'cascade', data: [2, 0] });
					expect(game.print()).toBe(
						'' + //
							'|QC|QD QH QS TC TD TH TS \n' +
							' KC   >   KS JC JD JH JS \n' +
							':d KH KD \n' +
							' cursor set 3'
					);
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] });
					expect(game.selection).toEqual({
						location: { fixture: 'cell', data: [0] },
						cards: [{ rank: 'queen', suit: 'clubs', location: { fixture: 'cell', data: [0] } }],
						peekOnly: false,
					});
					expect(game.availableMoves).toEqual([
						{
							location: { fixture: 'cascade', data: [1, 0] },
							moveDestinationType: 'cascade:empty',
							priority: 14,
						},
						{
							location: { fixture: 'cascade', data: [2, 0] },
							moveDestinationType: 'cascade:empty',
							priority: 12,
						},
					]);
					game = game.touch({ autoFoundation: false });
					expect(game.print()).toBe(
						'' + //
							'    QD QH QS TC TD TH TS \n' +
							' KC   >QC KS JC JD JH JS \n' +
							':d KH KD \n' +
							' move a3 QC→cascade'
					);
					expect(game.previousAction).toEqual({
						text: 'move a3 QC→cascade',
						type: 'move',
					});
					expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] });
					expect(game.selection).toEqual(null);
					expect(game.availableMoves).toEqual(null);
				});
			});
		});

		describe('from: foundation', () => {
			describe('to: deck', () => {
				test('empty', () => {
					game = FreeCell.parse(
						'' + //
							'>QC QD QH QS TC|TD|TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							' hand-jammed'
					).setCursor({ fixture: 'deck', data: [0] });
					expect(game.print()).toBe(
						'' + //
							' QC QD QH QS TC|TD|TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							':d>   \n' +
							' cursor set k'
					);
					const blocked = game.touch();
					expect(blocked.print()).toBe(
						'' + //
							' QC QD QH QS TC|TD|TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							':d>   \n' +
							' invalid move hk TD→deck'
					);
					expect(blocked.history).toEqual(['hand-jammed']);
					expect(blocked.previousAction).toEqual({
						type: 'invalid',
						text: 'invalid move h⡁k TD→deck',
					});
					const burried = game.touch({ gameFunction: 'recall-or-bury' });
					expect(burried.print()).toBe(
						'' + //
							' QC QD QH QS TC 9D TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							':d>TD \n' +
							' invalid move hk TD→deck'
					);
					expect(burried.print({ includeHistory: true })).toBe(
						'' + //
							' QC QD QH QS TC 9D TH TS \n' +
							' KC KD KH KS JC JD JH JS \n' +
							':d TD \n' +
							' invalid move h⡁k TD→deck\n' +
							' hand-jammed'
					);
					expect(burried.previousAction).toEqual({
						type: 'move',
						text: 'invalid move h⡁k TD→deck',
						gameFunction: 'recall-or-bury',
					});
				});

				describe('not empty', () => {
					test.todo('pile');

					test('first', () => {
						game = FreeCell.parse(
							'' + //
								'>QC QD QH QS TC|TD|TH TS \n' +
								' KC       KS JC JD JH JS \n' +
								' hand-jammed'
						).setCursor({ fixture: 'deck', data: [2] }, { gameFunction: 'recall-or-bury' });
						expect(game.cursor).toEqual({ fixture: 'deck', data: [1] });
						expect(game.previousAction.text).toBe('cursor set k⡁ KH');
						expect(game.print()).toBe(
							'' + //
								' QC QD QH QS TC|TD|TH TS \n' +
								' KC       KS JC JD JH JS \n' +
								':d>KH KD \n' +
								' cursor set k KH'
						);
						const blocked = game.touch();
						expect(blocked.print()).toBe(
							'' + //
								' QC QD QH QS TC TD TH TS \n' +
								' KC       KS JC JD JH JS \n' +
								':d>KH|KD \n' +
								' peek k KH'
						);
						expect(blocked.history).toEqual(['hand-jammed']);
						expect(blocked.previousAction).toEqual({
							text: 'peek k⡁ KH',
							type: 'select',
						});
						const burried = game.touch({ gameFunction: 'recall-or-bury' });
						expect(burried.print()).toBe(
							'' + //
								' QC QD QH QS TC 9D TH TS \n' +
								' KC       KS JC JD JH JS \n' +
								':d TD>KH KD \n' +
								' invalid move hk TD→KH'
						);
						expect(burried.print({ includeHistory: true })).toBe(
							'' + //
								' QC QD QH QS TC 9D TH TS \n' +
								' KC       KS JC JD JH JS \n' +
								':d TD KH KD \n' +
								' invalid move h⡁k⡁ TD→KH\n' +
								' hand-jammed'
						);
						expect(burried.previousAction).toEqual({
							type: 'move',
							text: 'invalid move h⡁k⡁ TD→KH',
							gameFunction: 'recall-or-bury',
						});
					});

					test.todo('middle');

					test.todo('last');
				});
			});

			test.todo('to: cell');

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
				beforeEach(() => {
					// #11863 has a few good moves we can test
					game = new FreeCell().shuffle32(11863);
				});

				describe('to: deck', () => {
					test('empty', () => {
						game = new FreeCell()
							.shuffle32(5)
							.dealAll({ demo: true })
							.$selectCard('6D')
							.setCursor({ fixture: 'deck', data: [0] });
						expect(game.print()).toBe(
							'' +
								' 6H 6C QC JS 9S AD 7C TS \n' +
								' AH 8S 2D QS 4C 9H 2S 3D \n' +
								' 5C AS 9C KH 4D 2C 3C 4S \n' +
								' 3S 5D KC 3H KD 5H 6S 8D \n' +
								' TD 7S JD 7H 8H JH JC 7D \n' +
								' 5S QH 8C 9D KS QD 4H AC \n' +
								' 2H TC TH|6D|            \n' +
								':d>   \n' +
								' cursor set k'
						);
						const burried = game.touch({ gameFunction: 'recall-or-bury' });
						expect(burried.print()).toBe(
							'' +
								' 6H 6C QC JS 9S AD 7C TS \n' +
								' AH 8S 2D QS 4C 9H 2S 3D \n' +
								' 5C AS 9C KH 4D 2C 3C 4S \n' +
								' 3S 5D KC 3H KD 5H 6S 8D \n' +
								' TD 7S JD 7H 8H JH JC 7D \n' +
								' 5S QH 8C 9D KS QD 4H AC \n' +
								' 2H TC TH                \n' +
								':d>6D \n' +
								' invalid move 4k 6D→deck'
						);
						expect(burried.print({ includeHistory: true })).toBe(
							'' +
								' 6H 6C QC JS 9S AD 7C TS \n' +
								' AH 8S 2D QS 4C 9H 2S 3D \n' +
								' 5C AS 9C KH 4D 2C 3C 4S \n' +
								' 3S 5D KC 3H KD 5H 6S 8D \n' +
								' TD 7S JD 7H 8H JH JC 7D \n' +
								' 5S QH 8C 9D KS QD 4H AC \n' +
								' 2H TC TH                \n' +
								':d 6D \n' +
								' invalid move 4⡅k 6D→deck\n' +
								' deal all cards\n' +
								' shuffle deck (5)'
						);
						expect(burried.previousAction).toEqual({
							type: 'move',
							text: 'invalid move 4⡅k 6D→deck',
							gameFunction: 'recall-or-bury',
						});
					});

					describe('not empty', () => {
						beforeEach(() => {
							game = new FreeCell().shuffle32(5).dealAll({ demo: true, keepDeck: true }).$selectCard('6D');
						});

						test.todo('pile');

						test('first', () => {
							game = game.setCursor({ fixture: 'deck', data: [7] });
							expect(game.previousAction.text).toBe('cursor set k⡇ 6H');
							expect(game.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH|6D|            \n' +
									':d>6H 6C QC JS 9S AD 7C TS \n' +
									' cursor set k 6H'
							);
							const burried = game.touch({ gameFunction: 'recall-or-bury' });
							expect(burried.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6D>6H 6C QC JS 9S AD 7C TS \n' +
									' invalid move 4k 6D→6H'
							);
							expect(burried.print({ includeHistory: true })).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6D 6H 6C QC JS 9S AD 7C TS \n' +
									' invalid move 4⡅k⡇ 6D→6H\n' +
									' deal 44 cards\n' +
									' shuffle deck (5)'
							);
							expect(burried.previousAction).toEqual({
								type: 'move',
								text: 'invalid move 4⡅k⡇ 6D→6H',
								gameFunction: 'recall-or-bury',
							});
						});

						test('middle', () => {
							game = game.setCursor({ fixture: 'deck', data: [3] });
							expect(game.previousAction.text).toBe('cursor set k⡃ 9S');
							expect(game.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH|6D|            \n' +
									':d 6H 6C QC JS>9S AD 7C TS \n' +
									' cursor set k 9S'
							);
							const burried = game.touch({ gameFunction: 'recall-or-bury' });
							expect(burried.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6H 6C QC JS 6D>9S AD 7C TS \n' +
									' invalid move 4k 6D→9S'
							);
							expect(burried.print({ includeHistory: true })).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6H 6C QC JS 6D 9S AD 7C TS \n' +
									' invalid move 4⡅k⡃ 6D→9S\n' +
									' deal 44 cards\n' +
									' shuffle deck (5)'
							);
							expect(burried.previousAction).toEqual({
								type: 'move',
								text: 'invalid move 4⡅k⡃ 6D→9S',
								gameFunction: 'recall-or-bury',
							});
						});

						test('last', () => {
							game = game.setCursor({ fixture: 'deck', data: [0] });
							expect(game.previousAction.text).toBe('cursor set k⡀ TS');
							expect(game.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH|6D|            \n' +
									':d 6H 6C QC JS 9S AD 7C>TS \n' +
									' cursor set k TS'
							);
							const burried = game.touch({ gameFunction: 'recall-or-bury' });
							expect(burried.print()).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6H 6C QC JS 9S AD 7C 6D>TS \n' +
									' invalid move 4k 6D→TS'
							);
							expect(burried.print({ includeHistory: true })).toBe(
								'' +
									'                         \n' +
									' AH 8S 2D QS 4C 9H 2S 3D \n' +
									' 5C AS 9C KH 4D 2C 3C 4S \n' +
									' 3S 5D KC 3H KD 5H 6S 8D \n' +
									' TD 7S JD 7H 8H JH JC 7D \n' +
									' 5S QH 8C 9D KS QD 4H AC \n' +
									' 2H TC TH                \n' +
									':d 6H 6C QC JS 9S AD 7C 6D TS \n' +
									' invalid move 4⡅k⡀ 6D→TS\n' +
									' deal 44 cards\n' +
									' shuffle deck (5)'
							);
							expect(burried.previousAction).toEqual({
								type: 'move',
								text: 'invalid move 4⡅k⡀ 6D→TS',
								gameFunction: 'recall-or-bury',
							});
						});
					});
				});

				test('to: cell', () => {
					game = game
						.dealAll()
						.setCursor({ fixture: 'cascade', data: [0, 6] })
						.touch()
						.setCursor({ fixture: 'cell', data: [1] });
					expect(game.print()).toBe(
						'' + //
							'   >                     \n' +
							' 8H 5D KS 3C 3S 3H JD AC \n' +
							' 9H 7D KC 5C 9D 5H 2C 2H \n' +
							' 6D TC 4H TS 3D 8S QH 4S \n' +
							' 6S 2S 5S 7H QD 8C JC 8D \n' +
							' AS 6H 9S 4C KD TD 6C 9C \n' +
							' 7C JH 7S TH QS AD KH 2D \n' +
							'|QC|AH JS 4D             \n' +
							' cursor set b'
					);
					expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
					expect(game.selection).toEqual({
						location: { fixture: 'cascade', data: [0, 6] },
						cards: [{ rank: 'queen', suit: 'clubs', location: { fixture: 'cascade', data: [0, 6] } }],
						peekOnly: false,
					});
					expect(game.availableMoves).toEqual([
						{
							location: { fixture: 'cell', data: [0] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cell', data: [1] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cell', data: [2] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cell', data: [3] },
							moveDestinationType: 'cell:empty',
							priority: -1,
						},
						{
							location: { fixture: 'cascade', data: [6, 5] },
							moveDestinationType: 'cascade:sequence',
							priority: 4,
						},
					]);
					game = game.touch({ autoFoundation: false });
					expect(game.print()).toBe(
						'' + //
							'   >QC                   \n' +
							' 8H 5D KS 3C 3S 3H JD AC \n' +
							' 9H 7D KC 5C 9D 5H 2C 2H \n' +
							' 6D TC 4H TS 3D 8S QH 4S \n' +
							' 6S 2S 5S 7H QD 8C JC 8D \n' +
							' AS 6H 9S 4C KD TD 6C 9C \n' +
							' 7C JH 7S TH QS AD KH 2D \n' +
							'    AH JS 4D             \n' +
							' move 1b QC→cell'
					);
					expect(game.previousAction).toEqual({
						text: 'move 1⡆b QC→cell',
						type: 'move',
					});
					expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
					expect(game.selection).toEqual(null);
					expect(game.availableMoves).toEqual(null);
				});

				describe('to: foundation', () => {
					test('empty', () => {
						game = game
							.dealAll()
							.setCursor({ fixture: 'cascade', data: [1, 6] })
							.touch()
							.setCursor({ fixture: 'foundation', data: [0] });
						expect(game.previousAction.text).toBe('cursor set h⡀');
						expect(game.print()).toBe(
							'' + //
								'            >            \n' +
								' 8H 5D KS 3C 3S 3H JD AC \n' +
								' 9H 7D KC 5C 9D 5H 2C 2H \n' +
								' 6D TC 4H TS 3D 8S QH 4S \n' +
								' 6S 2S 5S 7H QD 8C JC 8D \n' +
								' AS 6H 9S 4C KD TD 6C 9C \n' +
								' 7C JH 7S TH QS AD KH 2D \n' +
								' QC|AH|JS 4D             \n' +
								' cursor set h'
						);
						expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
						expect(game.selection).toEqual({
							location: { fixture: 'cascade', data: [1, 6] },
							cards: [{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [1, 6] } }],
							peekOnly: false,
						});
						expect(game.availableMoves).toEqual([
							{
								location: { fixture: 'cell', data: [0] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [1] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [2] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [3] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'foundation', data: [0] },
								moveDestinationType: 'foundation:any',
								priority: 4,
							},
							{
								location: { fixture: 'foundation', data: [1] },
								moveDestinationType: 'foundation:any',
								priority: 3,
							},
							{
								location: { fixture: 'foundation', data: [2] },
								moveDestinationType: 'foundation:any',
								priority: 2,
							},
							{
								location: { fixture: 'foundation', data: [3] },
								moveDestinationType: 'foundation:any',
								priority: 1,
							},
						]);
						game = game.touch({ autoFoundation: false });
						expect(game.print()).toBe(
							'' + //
								'            >AH          \n' +
								' 8H 5D KS 3C 3S 3H JD AC \n' +
								' 9H 7D KC 5C 9D 5H 2C 2H \n' +
								' 6D TC 4H TS 3D 8S QH 4S \n' +
								' 6S 2S 5S 7H QD 8C JC 8D \n' +
								' AS 6H 9S 4C KD TD 6C 9C \n' +
								' 7C JH 7S TH QS AD KH 2D \n' +
								' QC    JS 4D             \n' +
								' move 2h AH→foundation'
						);
						expect(game.previousAction).toEqual({
							text: 'move 2⡆h⡀ AH→foundation',
							type: 'move',
						});
						expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
						expect(game.selection).toEqual(null);
						expect(game.availableMoves).toEqual(null);
					});

					test.todo('not empty');
				});

				describe('to: cascade', () => {
					describe('not empty', () => {
						test('single', () => {
							game = game
								.dealAll()
								.setCursor({ fixture: 'cascade', data: [0, 6] })
								.touch()
								.setCursor({ fixture: 'cascade', data: [6, 5] });
							expect(game.previousAction.text).toBe('cursor set 7⡅ KH');
							expect(game.print()).toBe(
								'' + //
									'                         \n' +
									' 8H 5D KS 3C 3S 3H JD AC \n' +
									' 9H 7D KC 5C 9D 5H 2C 2H \n' +
									' 6D TC 4H TS 3D 8S QH 4S \n' +
									' 6S 2S 5S 7H QD 8C JC 8D \n' +
									' AS 6H 9S 4C KD TD 6C 9C \n' +
									' 7C JH 7S TH QS AD>KH 2D \n' +
									'|QC|AH JS 4D             \n' +
									' cursor set 7 KH'
							);
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [6, 5] });
							expect(game.selection).toEqual({
								location: { fixture: 'cascade', data: [0, 6] },
								cards: [{ rank: 'queen', suit: 'clubs', location: { fixture: 'cascade', data: [0, 6] } }],
								peekOnly: false,
							});
							expect(game.availableMoves).toEqual([
								{
									location: { fixture: 'cell', data: [0] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cell', data: [1] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cell', data: [2] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cell', data: [3] },
									moveDestinationType: 'cell:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [6, 5] },
									moveDestinationType: 'cascade:sequence',
									priority: 4,
								},
							]);
							game = game.touch({ autoFoundation: false });
							expect(game.print()).toBe(
								'' + //
									'                         \n' +
									' 8H 5D KS 3C 3S 3H JD AC \n' +
									' 9H 7D KC 5C 9D 5H 2C 2H \n' +
									' 6D TC 4H TS 3D 8S QH 4S \n' +
									' 6S 2S 5S 7H QD 8C JC 8D \n' +
									' AS 6H 9S 4C KD TD 6C 9C \n' +
									' 7C JH 7S TH QS AD>KH 2D \n' +
									'    AH JS 4D       QC    \n' +
									' move 17 QC→KH'
							);
							expect(game.previousAction).toEqual({
								text: 'move 1⡆7⡅ QC→KH',
								type: 'move',
							});
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [6, 5] });
							expect(game.selection).toEqual(null);
							expect(game.availableMoves).toEqual(null);
						});

						describe('sequence', () => {
							test.todo('first');

							test.todo('middle');

							test('last', () => {
								game = FreeCell.parse(
									'' + //
										'>            TC 8D KH KS \n' +
										'    TD KC KD    9D       \n' +
										'       QD QC             \n' +
										'       JC JD             \n' +
										' hand-jammed'
								)
									.setCursor({ fixture: 'cascade', data: [1, 0] })
									.touch()
									.setCursor({ fixture: 'cascade', data: [2, 2] });
								expect(game.previousAction.text).toBe('cursor set 3⡂ JC');
								expect(game.print()).toBe(
									'' + //
										'             TC 8D KH KS \n' +
										'   |TD|KC KD    9D       \n' +
										'       QD QC             \n' +
										'      >JC JD             \n' +
										' cursor set 3 JC'
								);
								expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 2] });
								expect(game.selection).toEqual({
									location: { fixture: 'cascade', data: [1, 0] },
									cards: [{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 0] } }],
									peekOnly: false,
								});
								expect(game.availableMoves).toEqual([
									{
										location: { fixture: 'cell', data: [0] },
										moveDestinationType: 'cell:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cell', data: [1] },
										moveDestinationType: 'cell:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cell', data: [2] },
										moveDestinationType: 'cell:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cell', data: [3] },
										moveDestinationType: 'cell:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [0, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [2, 2] },
										moveDestinationType: 'cascade:sequence',
										priority: 14,
									},
									{
										location: { fixture: 'cascade', data: [4, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [6, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [7, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
								]);
								game = game.touch({ autoFoundation: false });
								expect(game.print()).toBe(
									'' + //
										'             TC 8D KH KS \n' +
										'       KC KD    9D       \n' +
										'       QD QC             \n' +
										'      >JC JD             \n' +
										'       TD                \n' +
										' move 23 TD→JC'
								);
								expect(game.previousAction).toEqual({
									text: 'move 2⡀3⡂ TD→JC',
									type: 'move',
								});
								expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 2] });
								expect(game.selection).toEqual(null);
								expect(game.availableMoves).toEqual(null);
							});
						});

						test.todo('pile');
					});

					test('empty', () => {
						game = FreeCell.parse(
							'' + //
								'>            TC 8D KH KS \n' +
								'    TD KC KD    9D       \n' +
								'       QD QC             \n' +
								'       JC JD             \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'cascade', data: [1, 0] })
							.touch()
							.setCursor({ fixture: 'cascade', data: [6, 0] });
						expect(game.print()).toBe(
							'' + //
								'             TC 8D KH KS \n' +
								'   |TD|KC KD    9D>      \n' +
								'       QD QC             \n' +
								'       JC JD             \n' +
								' cursor set 7'
						);
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [6, 0] });
						expect(game.selection).toEqual({
							location: { fixture: 'cascade', data: [1, 0] },
							cards: [{ rank: '10', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 0] } }],
							peekOnly: false,
						});
						expect(game.availableMoves).toEqual([
							{
								location: { fixture: 'cell', data: [0] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [1] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [2] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cell', data: [3] },
								moveDestinationType: 'cell:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [0, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [2, 2] },
								moveDestinationType: 'cascade:sequence',
								priority: 14,
							},
							{
								location: { fixture: 'cascade', data: [4, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [6, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [7, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
						]);
						game = game.touch({ autoFoundation: false });
						expect(game.print()).toBe(
							'' + //
								'             TC 8D KH KS \n' +
								'       KC KD    9D>TD    \n' +
								'       QD QC             \n' +
								'       JC JD             \n' +
								' move 27 TD→cascade'
						);
						expect(game.previousAction).toEqual({
							text: 'move 2⡀7 TD→cascade',
							type: 'move',
						});
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [6, 0] });
						expect(game.selection).toEqual(null);
						expect(game.availableMoves).toEqual(null);
					});
				});
			});

			describe('sequence', () => {
				describe('to: deck', () => {
					test('empty', () => {
						const game = FreeCell.parse(
							'' + //
								'>            7C 8D TH KS \n' +
								'   |TC|   KD JH 9C QD KH \n' +
								'   |9D|   QC       JC KC \n' +
								'   |8C|   JD       TD QH \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'deck', data: [7] }, { gameFunction: 'recall-or-bury' })
							.touch({ gameFunction: 'recall-or-bury' });
						expect(game.__printDeck()).toBe(' TC 9D>8C ');
						expect(game.print()).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								'          KD JH 9C QD KH \n' +
								'          QC       JC KC \n' +
								'          JD       TD QH \n' +
								':d TC 9D>8C \n' +
								' invalid move 2k TC-9D-8C→deck'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								'          KD JH 9C QD KH \n' +
								'          QC       JC KC \n' +
								'          JD       TD QH \n' +
								':d TC 9D 8C \n' +
								' invalid move 2⡀k TC-9D-8C→deck\n' +
								' hand-jammed'
						);

						// bonus: verify we deal them out in the order we would expect
						//  - 8C was the bottom card in the cascade, the one we have to move first, so it's the first one that puts in the deck
						//  - TC was the top of the cascade, so it gets put onto the deck last
						//  - the deck is a stack, we deal from the top
						//  - TC is first one out of the deck, then 9D, the 8C
						expect(game.dealAll().print({ includeHistory: true })).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								' TC 9D 8C KD JH 9C QD KH \n' +
								'          QC       JC KC \n' +
								'          JD       TD QH \n' +
								' deal all cards\n' +
								' invalid move 2⡀k TC-9D-8C→deck\n' +
								' hand-jammed'
						);
					});

					describe('not empty', () => {
						test.todo('pile');

						test('first', () => {
							const game = FreeCell.parse(
								'' + //
									'>            7C 8D TH KS \n' +
									'   |TC|   KD JH          \n' +
									'   |9D|   QC             \n' +
									'   |8C|   JD             \n' +
									' hand-jammed'
							)
								.setCursor({ fixture: 'deck', data: [6] })
								.touch({ gameFunction: 'recall-or-bury' });
							expect(game.__printDeck()).toBe(' TC 9D 8C>KH KC QH QD JC TD 9C ');
							expect(game.deck.length).toBe(10);
							expect(game.print()).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d TC 9D 8C>KH KC QH QD JC TD 9C \n' +
									' invalid move 2k TC-9D-8C→KH'
							);
							expect(game.print({ includeHistory: true })).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d TC 9D 8C KH KC QH QD JC TD 9C \n' +
									' invalid move 2⡀k⡆ TC-9D-8C→KH\n' +
									' hand-jammed'
							);
						});

						test('middle', () => {
							const game = FreeCell.parse(
								'' + //
									'>            7C 8D TH KS \n' +
									'   |TC|   KD JH          \n' +
									'   |9D|   QC             \n' +
									'   |8C|   JD             \n' +
									' hand-jammed'
							)
								.setCursor({ fixture: 'deck', data: [2] })
								.touch({ gameFunction: 'recall-or-bury' });
							expect(game.__printDeck()).toBe(' KH KC QH QD TC 9D 8C>JC TD 9C ');
							expect(game.deck.length).toBe(10);
							expect(game.print()).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d KH KC QH QD TC 9D 8C>JC TD 9C \n' +
									' invalid move 2k TC-9D-8C→JC'
							);
							expect(game.print({ includeHistory: true })).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d KH KC QH QD TC 9D 8C JC TD 9C \n' +
									' invalid move 2⡀k⡂ TC-9D-8C→JC\n' +
									' hand-jammed'
							);
						});

						test('last', () => {
							const game = FreeCell.parse(
								'' + //
									'>            7C 8D TH KS \n' +
									'   |TC|   KD JH          \n' +
									'   |9D|   QC             \n' +
									'   |8C|   JD             \n' +
									' hand-jammed'
							)
								.setCursor({ fixture: 'deck', data: [0] })
								.touch({ gameFunction: 'recall-or-bury' });
							expect(game.__printDeck()).toBe(' KH KC QH QD JC TD TC 9D 8C>9C ');
							expect(game.deck.length).toBe(10);
							expect(game.print()).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d KH KC QH QD JC TD TC 9D 8C>9C \n' +
									' invalid move 2k TC-9D-8C→9C'
							);
							expect(game.print({ includeHistory: true })).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD JH          \n' +
									'          QC             \n' +
									'          JD             \n' +
									':d KH KC QH QD JC TD TC 9D 8C 9C \n' +
									' invalid move 2⡀k⡀ TC-9D-8C→9C\n' +
									' hand-jammed'
							);
						});
					});
				});

				describe('to: cell', () => {
					test('empty', () => {
						const game = FreeCell.parse(
							'' + //
								'>            7C 8D TH KS \n' +
								'   |TC|   KD JH          \n' +
								'   |9D|   QC             \n' +
								'   |8C|   JD             \n' +
								' hand-jammed'
						).touch();
						expect(game.print()).toBe(
							'' + //
								'>            8C 9D TH KS \n' +
								'    TC    KD JH          \n' +
								'          QC             \n' +
								'          JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' move 2a 8C→cell (auto-foundation a2 8C,9D)'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             8C 9D TH KS \n' +
								'    TC    KD JH          \n' +
								'          QC             \n' +
								'          JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' move 2⡂a 8C→cell (auto-foundation a2 8C,9D)\n' +
								' hand-jammed'
						);
					});

					test.todo('not empty');
				});

				describe('to: foundation', () => {
					test.todo('empty');

					test('not empty', () => {
						const game = FreeCell.parse(
							'' + //
								'            >7C 8D TH KS \n' +
								'   |TC|   KD JH          \n' +
								'   |9D|   QC             \n' +
								'   |8C|   JD             \n' +
								' hand-jammed'
						).touch();
						expect(game.print()).toBe(
							'' + //
								'            >8C 9D TH KS \n' +
								'    TC    KD JH          \n' +
								'          QC             \n' +
								'          JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' move 2h 8C→7C (auto-foundation 2 9D)'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             8C 9D TH KS \n' +
								'    TC    KD JH          \n' +
								'          QC             \n' +
								'          JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' move 2⡂h⡀ 8C→7C (auto-foundation 2 9D)\n' +
								' hand-jammed'
						);
					});

					// REVIEW (gameplay) consider moveByShorthand('2h') vs moveByShorthand('2⡀h⡁')
					test('invalid destination', () => {
						const game = FreeCell.parse(
							'' + //
								'             7C>8D TH KS \n' +
								'   |TC|   KD JH          \n' +
								'   |9D|   QC             \n' +
								'   |8C|   JD             \n' +
								' hand-jammed'
						).touch();
						expect(game.print()).toBe(
							'' + //
								'             7C>8D TH KS \n' +
								'   |TC|   KD JH          \n' +
								'   |9D|   QC             \n' +
								'   |8C|   JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' invalid move 2h TC-9D-8C→8D'
						);
						expect(game.print({ includeHistory: true })).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								'    TC    KD JH          \n' +
								'    9D    QC             \n' +
								'    8C    JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' hand-jammed'
						);
					});
				});

				describe('to: cascade', () => {
					beforeEach(() => {
						game = FreeCell.parse(
							'' + //
								'>            7C 8D TH KS \n' +
								'    TC    KD JH          \n' +
								'    9D    QC             \n' +
								'    8C    JD             \n' +
								' hand-jammed'
						)
							.setCursor({ fixture: 'cascade', data: [1, 0] })
							.touch();
					});

					describe('not empty', () => {
						test('single', () => {
							game = game.setCursor({ fixture: 'cascade', data: [4, 0] });
							expect(game.previousAction.text).toBe('cursor set 5⡀ JH');
							expect(game.print()).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'   |TC|   KD>JH          \n' +
									'   |9D|   QC             \n' +
									'   |8C|   JD             \n' +
									':d KH KC QH QD JC TD 9C \n' +
									' cursor set 5 JH'
							);
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [4, 0] });
							expect(game.selection).toEqual({
								location: { fixture: 'cascade', data: [1, 0] },
								cards: [
									{ rank: '10', suit: 'clubs', location: { fixture: 'cascade', data: [1, 0] } },
									{ rank: '9', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 1] } },
									{ rank: '8', suit: 'clubs', location: { fixture: 'cascade', data: [1, 2] } },
								],
								peekOnly: false,
							});
							expect(game.availableMoves).toEqual([
								{
									location: { fixture: 'cascade', data: [0, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [2, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [3, 2] },
									moveDestinationType: 'cascade:sequence',
									priority: 2,
								},
								{
									location: { fixture: 'cascade', data: [4, 0] },
									moveDestinationType: 'cascade:sequence',
									priority: 1,
								},
								{
									location: { fixture: 'cascade', data: [5, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [6, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
								{
									location: { fixture: 'cascade', data: [7, 0] },
									moveDestinationType: 'cascade:empty',
									priority: -1,
								},
							]);
							game = game.touch({ autoFoundation: false });
							expect(game.print()).toBe(
								'' + //
									'             7C 8D TH KS \n' +
									'          KD>JH          \n' +
									'          QC TC          \n' +
									'          JD 9D          \n' +
									'             8C          \n' +
									':d KH KC QH QD JC TD 9C \n' +
									' move 25 TC-9D-8C→JH'
							);
							expect(game.previousAction).toEqual({
								text: 'move 2⡀5⡀ TC-9D-8C→JH',
								type: 'move',
							});
							expect(game.cursor).toEqual({ fixture: 'cascade', data: [4, 0] });
							expect(game.selection).toEqual(null);
							expect(game.availableMoves).toEqual(null);
						});

						describe('sequence', () => {
							test.todo('first');

							test.todo('middle');

							test('last', () => {
								game = game.setCursor({ fixture: 'cascade', data: [3, 2] });
								expect(game.previousAction.text).toBe('cursor set 4⡂ JD');
								expect(game.print()).toBe(
									'' + //
										'             7C 8D TH KS \n' +
										'   |TC|   KD JH          \n' +
										'   |9D|   QC             \n' +
										'   |8C|  >JD             \n' +
										':d KH KC QH QD JC TD 9C \n' +
										' cursor set 4 JD'
								);
								expect(game.cursor).toEqual({ fixture: 'cascade', data: [3, 2] });
								expect(game.selection).toEqual({
									location: { fixture: 'cascade', data: [1, 0] },
									cards: [
										{ rank: '10', suit: 'clubs', location: { fixture: 'cascade', data: [1, 0] } },
										{ rank: '9', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 1] } },
										{ rank: '8', suit: 'clubs', location: { fixture: 'cascade', data: [1, 2] } },
									],
									peekOnly: false,
								});
								expect(game.availableMoves).toEqual([
									{
										location: { fixture: 'cascade', data: [0, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [2, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [3, 2] },
										moveDestinationType: 'cascade:sequence',
										priority: 2,
									},
									{
										location: { fixture: 'cascade', data: [4, 0] },
										moveDestinationType: 'cascade:sequence',
										priority: 1,
									},
									{
										location: { fixture: 'cascade', data: [5, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [6, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
									{
										location: { fixture: 'cascade', data: [7, 0] },
										moveDestinationType: 'cascade:empty',
										priority: -1,
									},
								]);
								game = game.touch({ autoFoundation: false });
								expect(game.print()).toBe(
									'' + //
										'             7C 8D TH KS \n' +
										'          KD JH          \n' +
										'          QC             \n' +
										'         >JD             \n' +
										'          TC             \n' +
										'          9D             \n' +
										'          8C             \n' +
										':d KH KC QH QD JC TD 9C \n' +
										' move 24 TC-9D-8C→JD'
								);
								expect(game.previousAction).toEqual({
									text: 'move 2⡀4⡂ TC-9D-8C→JD',
									type: 'move',
								});
								expect(game.cursor).toEqual({ fixture: 'cascade', data: [3, 2] });
								expect(game.selection).toEqual(null);
								expect(game.availableMoves).toEqual(null);
							});
						});

						test.todo('pile');
					});

					test('empty', () => {
						game = game.setCursor({ fixture: 'cascade', data: [5, 0] });
						expect(game.print()).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								'   |TC|   KD JH>         \n' +
								'   |9D|   QC             \n' +
								'   |8C|   JD             \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' cursor set 6'
						);
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [5, 0] });
						expect(game.selection).toEqual({
							location: { fixture: 'cascade', data: [1, 0] },
							cards: [
								{ rank: '10', suit: 'clubs', location: { fixture: 'cascade', data: [1, 0] } },
								{ rank: '9', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 1] } },
								{ rank: '8', suit: 'clubs', location: { fixture: 'cascade', data: [1, 2] } },
							],
							peekOnly: false,
						});
						expect(game.availableMoves).toEqual([
							{
								location: { fixture: 'cascade', data: [0, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [2, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [3, 2] },
								moveDestinationType: 'cascade:sequence',
								priority: 2,
							},
							{
								location: { fixture: 'cascade', data: [4, 0] },
								moveDestinationType: 'cascade:sequence',
								priority: 1,
							},
							{
								location: { fixture: 'cascade', data: [5, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [6, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
							{
								location: { fixture: 'cascade', data: [7, 0] },
								moveDestinationType: 'cascade:empty',
								priority: -1,
							},
						]);
						game = game.touch({ autoFoundation: false });
						expect(game.print()).toBe(
							'' + //
								'             7C 8D TH KS \n' +
								'          KD JH>TC       \n' +
								'          QC    9D       \n' +
								'          JD    8C       \n' +
								':d KH KC QH QD JC TD 9C \n' +
								' move 26 TC-9D-8C→cascade'
						);
						expect(game.previousAction).toEqual({
							text: 'move 2⡀6 TC-9D-8C→cascade',
							type: 'move',
						});
						expect(game.cursor).toEqual({ fixture: 'cascade', data: [5, 0] });
						expect(game.selection).toEqual(null);
						expect(game.availableMoves).toEqual(null);
					});

					describe('too tall', () => {
						// same as ^^ game.touch > select > cascade > sequence too tall
						test('cascade:empty', () => {
							const game = FreeCell.parse(
								'' + //
									'    8S 8H    5C AH 4D AS \n' +
									' 6H    TC QC KS KH 9H 4H \n' +
									' 7H    7D JH    JS 8C 6S \n' +
									' TH    5H TS    JD    9S \n' +
									' 3S    2S       QH   >KC|\n' +
									' 2H    9D       KD   |QD|\n' +
									' 6C    7C       QS   |JC|\n' +
									' 5D    8D            |TD|\n' +
									' 4S    7S            |9C|\n' +
									' 3H    6D                \n' +
									'       5S                \n' +
									' select 8 KC-QD-JC-TD-9C'
							);
							expect(game.availableMoves).toEqual([]);

							expect(game.setCursor({ fixture: 'cascade', data: [1, 0] }).touch().previousAction).toEqual({
								text: 'invalid move 8⡃2 KC-QD-JC-TD-9C→cascade',
								type: 'invalid',
							});
						});

						test('cascade:sequence', () => {
							const game = FreeCell.parse(
								'' + //
									'    8S       5C AH 4D AS \n' +
									' 6H TS TC QC KS KH 9H 4H \n' +
									' 7H    7D JH    JS 8C 6S \n' +
									' TH    5H       JD    9S \n' +
									' 3S    2S       QH    KC \n' +
									' 2H    9D       KD   >QD|\n' +
									' 6C    7C       QS   |JC|\n' +
									' 5D    8D            |TD|\n' +
									' 4S    7S            |9C|\n' +
									' 3H    6D            |8H|\n' +
									'       5S                \n' +
									' select 8 KC-QD-JC-TD-9C-8H'
							);
							expect(game.availableMoves).toEqual([]);

							expect(game.setCursor({ fixture: 'cascade', data: [4, 0] }).touch().previousAction).toEqual({
								text: 'select 5⡀ KS',
								type: 'select',
							});
						});

						// could move to a sequence (given that a cascade is available for part of it)
						// cannot move to the empty cascade itself (since it's the actual destination)
						test('enough for cascade:sequence, but not for cascade:empty', () => {
							const game = FreeCell.parse(
								'' + //
									'    8S       5C AH 4D AS \n' +
									' 6H    TC QC KS KH 9H 4H \n' +
									' 7H    7D JH    JS 8C 6S \n' +
									' TH    5H TS    JD    9S \n' +
									' 3S    2S       QH    KC \n' +
									' 2H    9D       KD   >QD|\n' +
									' 6C    7C       QS   |JC|\n' +
									' 5D    8D            |TD|\n' +
									' 4S    7S            |9C|\n' +
									' 3H    6D            |8H|\n' +
									'       5S                \n' +
									' select 8 QD-JC-TD-9C-8H'
							);
							expect(game.availableMoves).toEqual([{ location: { fixture: 'cascade', data: [4, 0] }, moveDestinationType: 'cascade:sequence', priority: 4 }]);

							expect(game.setCursor({ fixture: 'cascade', data: [4, 0] }).touch().previousAction).toEqual({
								text: 'move 8⡄5⡀ QD-JC-TD-9C-8H→KS',
								type: 'move',
							});
							expect(game.setCursor({ fixture: 'cascade', data: [1, 0] }).touch().previousAction).toEqual({
								text: 'invalid move 8⡄2 QD-JC-TD-9C-8H→cascade',
								type: 'invalid',
							});
						});
					});
				});
			});
		});

		/**
			@see game.undo PreviousActionType auto-foundation
			@see game.undo PreviousActionType move-foundation
		*/
		describe('autoFoundation', () => {
			test('few', () => {
				game = new FreeCell().shuffle32(5).dealAll();
				game = game.moveByShorthand('53');
				expect(game.print({ includeHistory: true })).toBe(
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
				expect(game.selection).toEqual(null);
				expect(game.availableMoves).toEqual(null);
			});

			test('win', () => {
				game = FreeCell.parse(
					'' + //
						'>KS          JC JD JH TS \n' +
						' KC KD KH JS QC QD QH QS \n' +
						' hand-jammed'
				)
					.touch()
					.setCursor({ fixture: 'cell', data: [1] })
					.touch();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'             KC KD KH KS \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'king', suit: 'spades', location: { fixture: 'cell', data: [1] } }],
				});
				expect(game.history).toEqual(['hand-jammed', 'move ab KS→cell (auto-foundation 54678123b QC,JS,QD,QH,QS,KC,KD,KH,KS)']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.selection).toEqual(null);
				expect(game.availableMoves).toEqual(null);
			});

			test('flourish', () => {
				game = FreeCell.parse(
					'' + //
						'>               KH KD KC \n' +
						' KS JS 9S 7S 5S 3S AS    \n' +
						' QS TS 8S 6S 4S 2S       \n' +
						' hand-jammed'
				);
				game = game
					.setCursor({ fixture: 'cascade', data: [6, 0] })
					.touch()
					.setCursor({ fixture: 'cascade', data: [7, 0] })
					.touch();

				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    Y O U   W I N !    :\n' +
						'                         \n' +
						' move 7⡀8 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)\n' +
						' hand-jammed'
				);
				expect(game.previousAction).toEqual({
					text: 'move 7⡀8 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [7, 0] } }],
				});
				expect(game.history).toEqual(['hand-jammed', 'move 7⡀8 AS→cascade (flourish 8665544332211 AS,2S,3S,4S,5S,6S,7S,8S,9S,TS,JS,QS,KS)']);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.selection).toEqual(null);
				expect(game.availableMoves).toEqual(null);
			});

			test('52-card flourish', () => {
				game = new FreeCell().dealAll().setCursor({ fixture: 'cascade', data: [3, 6] });
				expect(game.previousAction.text).toBe('cursor set 4⡆ AC');
				expect(game.print()).toBe(
					'' + //
						'                         \n' +
						' KS KH KD KC QS QH QD QC \n' +
						' JS JH JD JC TS TH TD TC \n' +
						' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
						' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
						' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
						' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
						' AS AH AD>AC             \n' +
						' cursor set 4 AC'
				);
				game = game
					.touch()
					.setCursor({ fixture: 'cascade', data: [5, 5] })
					.touch();
				expect(game.print({ includeHistory: true })).toEqual(
					'' + //
						'             KS KH KD KC \n' +
						'                         \n' +
						':    A M A Z I N G !    :\n' +
						'                         \n' +
						' move 4⡆6⡅ AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)\n' +
						' deal all cards'
				);
				expect(game.previousAction).toEqual({
					text: 'move 4⡆6⡅ AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)',
					type: 'move-foundation',
					tweenCards: [{ rank: 'ace', suit: 'clubs', location: { fixture: 'cascade', data: [5, 6] } }],
				});
				expect(game.history).toEqual([
					'deal all cards',
					'move 4⡆6⡅ AC→2H (flourish52 1236567812345678123456781234567812345678123456781234 AS,AH,AD,AC,2S,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)',
				]);
				expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
				expect(game.selection).toEqual(null);
				expect(game.availableMoves).toEqual(null);
			});
		});

		test('cannot move to invalid location', () => {
			game = new FreeCell().shuffle32(11863);
			game = game
				.dealAll({ demo: true })
				.setCursor({ fixture: 'cascade', data: [7, 4] })
				.touch()
				.setCursor({ fixture: 'cascade', data: [4, 4] });
			expect(game.previousAction.text).toBe('cursor set 5⡄ KD');
			expect(game.print()).toBe(
				'' + //
					' QS AD KH 2D QC AH JS 4D \n' +
					' 8H 5D KS 3C 3S 3H JD AC \n' +
					' 9H 7D KC 5C 9D 5H 2C 2H \n' +
					' 6D TC 4H TS 3D 8S QH 4S \n' +
					' 6S 2S 5S 7H QD 8C JC 8D \n' +
					' AS 6H 9S 4C>KD TD 6C|9C|\n' +
					' 7C JH 7S TH             \n' +
					' cursor set 5 KD'
			);
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [4, 4] });
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [7, 4] },
				cards: [{ rank: '9', suit: 'clubs', location: { fixture: 'cascade', data: [7, 4] } }],
				peekOnly: false,
			});
			expect(game.availableMoves).toEqual([
				{
					location: { fixture: 'cascade', data: [3, 5] },
					moveDestinationType: 'cascade:sequence',
					priority: 7,
				},
				{
					location: { fixture: 'cascade', data: [5, 4] },
					moveDestinationType: 'cascade:sequence',
					priority: 11,
				},
			]);
			game = game.touch({ stopWithInvalid: true });
			expect(game.print()).toBe(
				'' + //
					' QS AD KH 2D QC AH JS 4D \n' +
					' 8H 5D KS 3C 3S 3H JD AC \n' +
					' 9H 7D KC 5C 9D 5H 2C 2H \n' +
					' 6D TC 4H TS 3D 8S QH 4S \n' +
					' 6S 2S 5S 7H QD 8C JC 8D \n' +
					' AS 6H 9S 4C>KD TD 6C|9C|\n' +
					' 7C JH 7S TH             \n' +
					' invalid move 85 9C→KD'
			);
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [4, 4] });
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [7, 4] },
				cards: [{ rank: '9', suit: 'clubs', location: { fixture: 'cascade', data: [7, 4] } }],
				peekOnly: false,
			});
			expect(game.availableMoves).toEqual([
				{
					location: { fixture: 'cascade', data: [3, 5] },
					moveDestinationType: 'cascade:sequence',
					priority: 7,
				},
				{
					location: { fixture: 'cascade', data: [5, 4] },
					moveDestinationType: 'cascade:sequence',
					priority: 11,
				},
			]);
		});
	});

	describe('dropping the selection', () => {
		let game: FreeCell;
		beforeEach(() => {
			game = FreeCell.parse(
				'' + //
					' 3C 3D    3S             \n' +
					' KS 2C 2D    2S \n' +
					' QH             \n' +
					' JS             \n' +
					' hand-jammed'
			);
		});

		/**
			when you have a valid selection, and it can move,
			- and then you click on something else
			- or when you click on a location that is not one of the availableMoves
		*/
		test('re-select when move is invalid', () => {
			game = game.setCursor({ fixture: 'cascade', data: [0, 2] }).touch();
			expect(game.previousAction.text).toBe('select 1⡂ JS');

			game = game.setCursor({ fixture: 'cascade', data: [1, 0] }).touch();
			expect(game.previousAction.text).toBe('select 2⡀ 2C');
			game = game.setCursor({ fixture: 'cascade', data: [2, 0] }).touch();
			expect(game.previousAction.text).toBe('select 3⡀ 2D');
			game = game.setCursor({ fixture: 'cascade', data: [4, 0] }).touch();
			expect(game.previousAction.text).toBe('select 5⡀ 2S');
			game = game.setCursor({ fixture: 'cascade', data: [0, 0] }).touch();
			expect(game.previousAction.text).toBe('select 1⡀ KS-QH-JS');

			// semi-unrelated: no room to move to empty cascade
			// we want to use this more expressive text (rather than simply 'touch stop')
			game = game.setCursor({ fixture: 'cascade', data: [3, 0] }).touch();
			expect(game.previousAction.text).toBe('invalid move 1⡀4 KS-QH-JS→cascade');
		});

		test('allow "growing/shrinking sequence of current selection"', () => {
			// march down
			game = game.setCursor({ fixture: 'cascade', data: [0, 0] }).touch();
			expect(game.previousAction.text).toBe('select 1⡀ KS-QH-JS');
			game = game.setCursor({ fixture: 'cascade', data: [0, 1] }).touch();
			expect(game.previousAction.text).toBe('select 1⡁ QH-JS');
			game = game.setCursor({ fixture: 'cascade', data: [0, 2] }).touch();
			expect(game.previousAction.text).toBe('select 1⡂ JS');

			game = game.setCursor({ fixture: 'cascade', data: [0, 2] }).touch();
			expect(game.previousAction.text).toBe('deselect 1⡂ JS');

			// march up
			game = game.setCursor({ fixture: 'cascade', data: [0, 2] }).touch();
			expect(game.previousAction.text).toBe('select 1⡂ JS');
			game = game.setCursor({ fixture: 'cascade', data: [0, 1] }).touch();
			expect(game.previousAction.text).toBe('select 1⡁ QH-JS');
			game = game.setCursor({ fixture: 'cascade', data: [0, 0] }).touch();
			expect(game.previousAction.text).toBe('select 1⡀ KS-QH-JS');

			// skip a few
			game = game.setCursor({ fixture: 'cascade', data: [0, 2] }).touch();
			expect(game.previousAction.text).toBe('select 1⡂ JS');
			game = game.setCursor({ fixture: 'cascade', data: [0, 0] }).touch();
			expect(game.previousAction.text).toBe('select 1⡀ KS-QH-JS');
		});

		test('allow moving selection from one cell to another cell', () => {
			game = game.setCursor({ fixture: 'cell', data: [0] }).touch();
			expect(game.previousAction.text).toBe('select a 3C');
			game = game.setCursor({ fixture: 'cell', data: [1] }).touch();
			expect(game.previousAction.text).toBe('select b 3D');
			game = game.setCursor({ fixture: 'cell', data: [3] }).touch();
			expect(game.previousAction.text).toBe('select d 3S');

			// semi-unrelated: w/ selection, actually moves
			game = game.setCursor({ fixture: 'cell', data: [2] }).touch();
			expect(game.print()).toBe(
				'' + //
					' 3C 3D>3S                \n' +
					' KS 2C 2D    2S \n' +
					' QH             \n' +
					' JS             \n' +
					':d KH KD KC QS QD QC JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3H 2H AS AH AD AC \n' +
					' move dc 3S→cell'
			);

			// semi-unrelated: w/o selection, cannot select empty cell
			game = game.setCursor({ fixture: 'cell', data: [3] }).touch();
			expect(game.previousAction.text).toBe('touch stop');
		});
	});
});
