import { beforeEach, describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';

describe('game.clampCursor', () => {
	test('default', () => {
		const game = new FreeCell({ cursor: undefined }).dealAll({ demo: true });
		expect(game.print()).toMatchSnapshot();
		expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
	});

	describe('cell', () => {
		test('okay', () => {
			const game = new FreeCell({ cellCount: 3, cursor: { fixture: 'cell', data: [1] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cell', data: [1] });
		});

		test('too small', () => {
			const game = new FreeCell({
				cellCount: 3,
				cursor: { fixture: 'cell', data: [-5] },
			}).dealAll({ demo: true });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
		});

		test('too large', () => {
			const game = new FreeCell({ cellCount: 3, cursor: { fixture: 'cell', data: [5] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cell', data: [2] });
		});
	});

	describe('foundation', () => {
		test('okay', () => {
			const game = new FreeCell({ cursor: { fixture: 'foundation', data: [1] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [1] });
		});

		test('too small', () => {
			const game = new FreeCell({ cursor: { fixture: 'foundation', data: [-1] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [0] });
		});

		test('too large', () => {
			const game = new FreeCell({ cursor: { fixture: 'foundation', data: [8] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'foundation', data: [3] });
		});
	});

	describe('cascade', () => {
		let game: FreeCell;
		beforeEach(() => {
			game = new FreeCell().dealAll({
				demo: true,
			});
		});

		test('okay', () => {
			game = game.setCursor({ fixture: 'cascade', data: [2, 2] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 2] });
			expect(game.previousAction.text).toBe('cursor set 3⡂ 9D');
		});

		test('col too small', () => {
			game = game.setCursor({ fixture: 'cascade', data: [-3, 2] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [0, 2] });
		});

		test('col too large', () => {
			game = game.setCursor({ fixture: 'cascade', data: [15, 2] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [7, 2] });
		});

		test('row too small', () => {
			game = game.setCursor({ fixture: 'cascade', data: [2, -3] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] });
		});

		test('row too large', () => {
			game = game.setCursor({ fixture: 'cascade', data: [2, 90] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 5] });
		});

		// first we fix the col; then we fix the row
		test('invalid col and row', () => {
			game = game.setCursor({ fixture: 'cascade', data: [90, 90] });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [7, 4] });
		});

		// we can still sit on the 0th location
		test('empty', () => {
			const game = new FreeCell({ cursor: { fixture: 'cascade', data: [2, 2] } });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cascade', data: [2, 0] });
		});
	});

	describe('deck', () => {
		test('okay', () => {
			const game = new FreeCell({ cursor: { fixture: 'deck', data: [48] } });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'deck', data: [48] });
		});

		test('too small', () => {
			const game = new FreeCell({ cursor: { fixture: 'deck', data: [-48] } });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'deck', data: [0] });
		});

		test('too large', () => {
			const game = new FreeCell({ cursor: { fixture: 'deck', data: [90] } });
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });
		});

		// move back to the default
		test('empty', () => {
			const game = new FreeCell({ cursor: { fixture: 'deck', data: [48] } }).dealAll({
				demo: true,
			});
			expect(game.print()).toMatchSnapshot();
			expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });
		});
	});
});
