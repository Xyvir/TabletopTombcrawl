import { describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';

describe('game.$selectCard', () => {
	test.todo('everything');

	test('null', () => {
		expect(new FreeCell().dealAll().$selectCard(null).print()).toBe(
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
	});

	describe('select and then again', () => {
		test('different card', () => {
			let game = new FreeCell().dealAll().$selectCard('AS');
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
					'>AS|AH AD AC             \n' +
					' select 1 AS'
			);
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [0, 6] },
				cards: [{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [0, 6] } }],
				peekOnly: false,
			});
			game = game.$selectCard('2D');
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H>2D|2C \n' +
					' AS AH AD AC             \n' +
					' select 7 2D'
			);
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [6, 5] },
				cards: [{ rank: '2', suit: 'diamonds', location: { fixture: 'cascade', data: [6, 5] } }],
				peekOnly: false,
			});
			game = game.$selectCard('KH');
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' KS>KH|KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
					' AS AH AD AC             \n' +
					' peek 2 KH'
			);
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [1, 0] },
				cards: [{ rank: 'king', suit: 'hearts', location: { fixture: 'cascade', data: [1, 0] } }],
				peekOnly: true,
			});
		});

		test('same card', () => {
			const game = new FreeCell().dealAll().$selectCard('AS');
			expect(game.print()).toBe(
				'' + //
					'                         \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
					'>AS|AH AD AC             \n' +
					' select 1 AS'
			);
			expect(game.selection).toEqual({
				location: { fixture: 'cascade', data: [0, 6] },
				cards: [{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [0, 6] } }],
				peekOnly: false,
			});
			expect(game.$selectCard('AS')).toBe(game);
		});

		test('different action first', () => {
			const gameStart = new FreeCell().dealAll().$selectCard('AS').moveCursor('right');
			expect(gameStart.print()).toBe(
				'' + //
					'                         \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
					'|AS>AH AD AC             \n' +
					' cursor right'
			);
			const gameSelect = gameStart.$selectCard('AS');
			expect(gameSelect).not.toBe(gameStart);
			expect(gameSelect).not.toEqual(gameStart);
			expect(gameSelect.print()).toBe(
				'' + //
					'                         \n' +
					' KS KH KD KC QS QH QD QC \n' +
					' JS JH JD JC TS TH TD TC \n' +
					' 9S 9H 9D 9C 8S 8H 8D 8C \n' +
					' 7S 7H 7D 7C 6S 6H 6D 6C \n' +
					' 5S 5H 5D 5C 4S 4H 4D 4C \n' +
					' 3S 3H 3D 3C 2S 2H 2D 2C \n' +
					'>AS|AH AD AC             \n' +
					' select 1 AS'
			);
		});
	});

	describe('foundation', () => {
		test.todo('without previous selection');

		test.todo('with previous selection');

		test.todo('allowSelectFoundation');
	});

	describe('during win', () => {
		test('end of game stays end of game', () => {
			let game = new FreeCell().dealAll().$touchAndMove('AS');
			expect(game.win).toBe(true);
			game = game.$selectCard('AH');
			expect(game.print()).toBe(
				'' + //
					'             KS>KH KD KC \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' touch stop'
			);
		});

		test('allowSelectFoundation', () => {
			let game = new FreeCell().dealAll().$touchAndMove('AS');
			expect(game.win).toBe(true);
			expect(game.print()).toBe(
				'' + //
					'            >KS KH KD KC \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 1h AS→foundation (flourish 523467812345678123456781234567812345678123456781234 2S,AH,AD,AC,2H,2D,2C,3S,3H,3D,3C,4S,4H,4D,4C,5S,5H,5D,5C,6S,6H,6D,6C,7S,7H,7D,7C,8S,8H,8D,8C,9S,9H,9D,9C,TS,TH,TD,TC,JS,JH,JD,JC,QS,QH,QD,QC,KS,KH,KD,KC)'
			);
			expect(game.win).toBe(true);
			expect(game.winIsFlourish).toBe(true);
			expect(game.winIsFlourish52).toBe(false); // first to moves are 52, not because it's a flourish52, lol
			game = game.$selectCard('AH', { allowSelectFoundation: true });
			expect(game.print()).toBe(
				'' + //
					'             KS>KH|KD KC \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' peek h KH'
			);
			expect(game.selection).toEqual({
				location: { fixture: 'foundation', data: [1] },
				cards: [{ rank: 'king', suit: 'hearts', location: { fixture: 'foundation', data: [1] } }],
				peekOnly: true,
			});
			expect(game.availableMoves).toEqual([]);
		});
	});
});
