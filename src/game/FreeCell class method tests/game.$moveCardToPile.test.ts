import { describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';
import { PreviousAction } from '@/game/move/history';

/*
	- XXX (techdebt) more unit testing
	   - try to move the tests elsewhere:
	      - standard moves: `game.touch.test.ts`
	         - already has from each ⨉ to each
	         - it may have just omitted some
	      - special edge case testing: `move.parseShorthandMove.test.ts`
	   - if it doesn't make sense to move it there, test here anyways
	   - afterall, this does have some situations you can't simply "touch" your way into
	   - what we want in this file is a test for: "from any conceivable start pile/location" to "any given pile/location"
	   - this will make it easier to test a bunch more "invalid scenarios" more than anything
*/
describe('game.$moveCardToPile', () => {
	test('spot some concerns (resolved)', () => {
		let game = new FreeCell().dealAll({ demo: true, keepDeck: true });
		game = game.$selectCard('AH');
		expect(game.print()).toBe(
			'' + //
				'                         \n' +
				' KS KH KD KC QS QH QD QC \n' +
				' JS JH JD JC TS TH TD TC \n' +
				' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
				' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
				' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
				' 3S 3H 3D 3C             \n' +
				':d 2S 2H 2D 2C AS>AH|AD AC \n' +
				' peek k AH'
		);

		// playing cards from the deck is not allowed (it should be empty for standard gameplay, anyways)
		// don't explode (it use to throw an error)
		expect(() => game.$moveCardToPile('AH', 'a')).not.toThrow();
		// block the move
		expect(game.$moveCardToPile('AH', 'a')).toBe(game);

		// we do allow interacting with the deck (for what it's worth)
		expect(game.$selectCard('2C').previousAction).toEqual({ text: 'peek k⡄ 2C', type: 'select' });
		// noop, already selected
		expect(game.$selectCard('AH')).toBe(game);

		// cannot move a card within the deck
		expect(game.$moveCardToPile('AH', 'k')).toBe(game);

		// blocked
		expect(game.touchByPile('h').print()).toBe(
			'' +
				'            >            \n' +
				' KS KH KD KC QS QH QD QC \n' +
				' JS JH JD JC TS TH TD TC \n' +
				' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
				' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
				' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
				' 3S 3H 3D 3C             \n' +
				':d 2S 2H 2D 2C AS|AH|AD AC \n' +
				' invalid move kh AH→foundation'
		);
		// gameFunction
		expect(game.touchByPile('h', { gameFunction: 'recall-or-bury' }).print()).toBe(
			'' +
				'            >AH          \n' +
				' KS KH KD KC QS QH QD QC \n' +
				' JS JH JD JC TS TH TD TC \n' +
				' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
				' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
				' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
				' 3S 3H 3D 3C             \n' +
				':d 2S 2H 2D 2C AS AD AC \n' +
				' invalid move kh AH→foundation'
		);

		game = game.dealAll();
		expect(game.print()).toBe(
			'' + //
				'>                        \n' +
				' KS KH KD KC QS QH QD QC \n' +
				' JS JH JD JC TS TH TD TC \n' +
				' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
				' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
				' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
				' 3S 3H 3D 3C AS AH AD AC \n' +
				' 2S 2H 2D 2C             \n' +
				' deal all cards'
		);
		game = game.$touchAndMove('AS');
		expect(game.print()).toBe(
			'' + //
				'            >KS KH KD KC \n' +
				'                         \n' +
				':    Y O U   W I N !    :\n' +
				'                         \n' +
				' move 5h AS→foundation (flourish 167823412345678123456781234567812345678123456781234 2S,AH,AD,AC,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)'
		);

		// we can't select this card, so note it
		game = game.$moveCardToPile('AH', 'a');
		expect(game.print()).toBe(
			'' + //
				'             KS>KH KD KC \n' +
				'                         \n' +
				':    Y O U   W I N !    :\n' +
				'                         \n' +
				' touch stop'
		);

		game = game.$selectCard('JS');
		expect(game.print()).toBe(
			'' + //
				'            >KS KH KD KC \n' +
				'                         \n' +
				':    Y O U   W I N !    :\n' +
				'                         \n' +
				' touch stop'
		);
		expect(game.selection).toBe(null);
	});

	describe('from', () => {
		describe('cell', () => {
			test.todo('empty vs not');
		});

		describe('foundation', () => {
			test.todo('empty');

			test.todo('any');
		});

		describe('cascade', () => {
			test.todo('empty');

			test.todo('single');

			test.todo('sequence');

			// i.e. 1 cell and 2 cascades empty = max 4 cards move
			test.todo('size sequence to allowable space');
		});

		describe('deck', () => {
			// t('empty'); // we need a card to be in the deck

			test('present', () => {
				let game = new FreeCell().dealAll({ demo: true, keepDeck: true });
				expect(game.deck.length).toBe(8);

				game = game.$selectCard('AS');
				expect(game.cursor).toEqual({ fixture: 'deck', data: [3] });
				expect(game.$moveCardToPile('AS', 'h')).toBe(game);

				game = game.$selectCard('2D');
				expect(game.cursor).toEqual({ fixture: 'deck', data: [5] });
				expect(game.$moveCardToPile('2D', 'a')).toBe(game);
			});

			// if this is the only card in the deck,
			// we move it out,
			// and then the deck is empty
			test.todo('last card remaining');
		});
	});

	// this lets us potentially pluck it from anywhere
	describe('from invalid', () => {
		test.todo('card not found');

		// not sure if this has been covered elsewhere
		// normally we can see and affect the top
		test.todo('card inside foundation');

		// this should be covered elsewhere since we can access any card with the cursor
		test.todo('card inside deck');

		test.todo('selection is peekOnly');
	});

	describe('to each pile', () => {
		describe('cell', () => {
			test.todo('a, b, c, d, e, f');

			test.todo('cellCount of 1, 4, 6');

			test.todo('empty vs not');
		});

		describe('foundation', () => {
			test('first', () => {
				const game = FreeCell.parse(
					'' + //
						'>            AS          \n' +
						' 2S AH AD AC             \n' +
						'    2H 2D 2C             \n' +
						' hand-jammed'
				);
				expect(game.$moveCardToPile('2S', 'h').previousAction).toEqual({ text: 'move 1⡀h⡀ 2S→AS', type: 'move' });
			});

			test('second', () => {
				const game = FreeCell.parse(
					'' + //
						'>               AS       \n' +
						' 2S AH AD AC             \n' +
						'    2H 2D 2C             \n' +
						' hand-jammed'
				);
				expect(game.$moveCardToPile('2S', 'h').previousAction).toEqual({ text: 'move 1⡀h⡁ 2S→AS', type: 'move' });
			});

			test('third', () => {
				const game = FreeCell.parse(
					'' + //
						'>                  AS    \n' +
						' 2S AH AD AC             \n' +
						'    2H 2D 2C             \n' +
						' hand-jammed'
				);
				expect(game.$moveCardToPile('2S', 'h').previousAction).toEqual({ text: 'move 1⡀h⡂ 2S→AS', type: 'move' });
			});

			test('fourth', () => {
				const game = FreeCell.parse(
					'' + //
						'>                     AS \n' +
						' 2S AH AD AC             \n' +
						'    2H 2D 2C             \n' +
						' hand-jammed'
				);
				expect(game.$moveCardToPile('2S', 'h').previousAction).toEqual({ text: 'move 1⡀h⡃ 2S→AS', type: 'move' });
			});

			test.todo('find existing');
		});

		describe('cascade', () => {
			test.todo('1, 2, 3, 4, 5, 6, 7, 8, 9, 0');

			test.todo('cascadeCount of 4, 8, 10');

			test.todo('empty');

			test.todo('single');

			test.todo('sequence');
		});

		describe('deck', () => {
			test.todo('empty');

			test.todo('not empty');
		});
	});

	// impl edge cases
	test.todo('to: special');

	test.todo('something else selected');

	// TODO (coords) (history) (parse) (print) (shorthandMove-mismatch) shorthandMove is idealized, but we can move anything
	//  - verify behavior of print/parse w/w/o history
	//  - standard move notation is inadequate for this level of freedom
	//  - either use braille or block shorthand, or some other mitigation strategy
	describe('mismatch between shorthandMove and actual move', () => {
		describe('from cascade', () => {
			const game = FreeCell.parse(
				'' + //
					'>                        \n' +
					' AS AH AD AC             \n' +
					' KS KH KD KC             \n' +
					' QH QS QC QD             \n' +
					' JS JH JD JC             \n' +
					' TH TS TC TD             \n' +
					' 9S 9H 9D 9C             \n' +
					' 8H 8S 8C 8D             \n' +
					' 7S 7H 7D 7C             \n' +
					' 6H 6S 6C 6D             \n' +
					' 5S 5H 5D 5C             \n' +
					' 4H 4S 4C 4D             \n' +
					' 3S 3H 3D 3C             \n' +
					' 2H 2S 2C 2D             \n' +
					' hand-jammed'
			);

			test('moveByShorthand', () => {
				expect(game.moveByShorthand('18').previousAction).toEqual({
					text: 'move 1⡁8 KS-QH-JS-TH-9S-8H-7S-6H-5S-4H-3S-2H→cascade (auto-foundation 12 AS,2S)',
					type: 'move-foundation',
					tweenCards: [
						{ rank: 'king', suit: 'spades', location: { fixture: 'cascade', data: [7, 0] } },
						{ rank: 'queen', suit: 'hearts', location: { fixture: 'cascade', data: [7, 1] } },
						{ rank: 'jack', suit: 'spades', location: { fixture: 'cascade', data: [7, 2] } },
						{ rank: '10', suit: 'hearts', location: { fixture: 'cascade', data: [7, 3] } },
						{ rank: '9', suit: 'spades', location: { fixture: 'cascade', data: [7, 4] } },
						{ rank: '8', suit: 'hearts', location: { fixture: 'cascade', data: [7, 5] } },
						{ rank: '7', suit: 'spades', location: { fixture: 'cascade', data: [7, 6] } },
						{ rank: '6', suit: 'hearts', location: { fixture: 'cascade', data: [7, 7] } },
						{ rank: '5', suit: 'spades', location: { fixture: 'cascade', data: [7, 8] } },
						{ rank: '4', suit: 'hearts', location: { fixture: 'cascade', data: [7, 9] } },
						{ rank: '3', suit: 'spades', location: { fixture: 'cascade', data: [7, 10] } },
						{ rank: '2', suit: 'hearts', location: { fixture: 'cascade', data: [7, 11] } },
					],
				});
			});

			test.each`
				shorthand | action
				${'2H'}   | ${{ text: 'move 1⡌8 2H→cascade', type: 'move' }}
				${'3S'}   | ${{ text: 'move 1⡋8 3S-2H→cascade', type: 'move' }}
				${'4H'}   | ${{ text: 'move 1⡊8 4H-3S-2H→cascade', type: 'move' }}
				${'5S'}   | ${{ text: 'move 1⡉8 5S-4H-3S-2H→cascade', type: 'move' }}
				${'6H'}   | ${{ text: 'move 1⡈8 6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'7S'}   | ${{ text: 'move 1⡇8 7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'8H'}   | ${{ text: 'move 1⡆8 8H-7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'9S'}   | ${{ text: 'move 1⡅8 9S-8H-7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'TH'}   | ${{ text: 'move 1⡄8 TH-9S-8H-7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'JS'}   | ${{ text: 'move 1⡃8 JS-TH-9S-8H-7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
				${'QH'}   | ${{ text: 'move 1⡂8 QH-JS-TH-9S-8H-7S-6H-5S-4H-3S-2H→cascade', type: 'move' }}
			`('$shorthand', ({ shorthand, action }: { shorthand: string; action: PreviousAction }) => {
				expect(game.$moveCardToPile(shorthand, '8').previousAction).toEqual(action);
			});
		});
	});

	describe('invalid move', () => {
		test('cannot select', () => {
			const game = FreeCell.parse(
				'' + //
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
					' move a8 TS→JH'
			).$moveCardToPile('2H', '5');
			expect(game.previousAction).toEqual({
				text: 'touch stop',
				type: 'invalid',
			});
		});

		test('peekOnly', () => {
			const game = FreeCell.parse(
				'' + //
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
					' move a8 TS→JH'
			).$moveCardToPile('KS', 'd');
			expect(game.previousAction).toEqual({
				text: 'move a8⡆ TS→JH',
				type: 'move',
			});
		});

		test('only as much as is allowed to move', () => {
			let game = FreeCell.parse(
				'' + //
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
					' move a8 TS→JH'
			);
			expect(game.previousAction).toEqual({
				text: 'move a8⡆ TS→JH',
				type: 'move',
			});
			game = game.$moveCardToPile('KC', '5');
			expect(game.previousAction).toEqual({
				text: 'invalid move 4⡆5 KC-QD-JS-TD-9C-8D-7C→cascade',
				type: 'invalid',
			});
			game = game.$moveCardToPile('TD', '5');
			expect(game.previousAction).toEqual({
				text: 'invalid move 4⡉5 TD-9C-8D-7C→cascade',
				type: 'invalid',
			});
			game = game.$moveCardToPile('9C', '5');
			expect(game.previousAction).toEqual({
				text: 'move 4⡊5 9C-8D-7C→cascade',
				type: 'move',
			});
		});
	});
});
