import { describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';
import { PREVIOUS_ACTION_TYPE_IS_START_OF_GAME } from '@/game/move/history';

describe('game.$undoThenShuffle', () => {
	test.todo('everything');

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

			const undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual([]);
			expect(undids.previousAction).toEqual({
				text: 'init',
				type: 'init',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
			expect(undids).toBe(game);
		});

		test('shuffle', () => {
			const game = new FreeCell().shuffle32(1);
			expect(game.history).toEqual(['shuffle deck (1)']);
			expect(game.previousAction).toEqual({
				text: 'shuffle deck (1)',
				type: 'shuffle',
			});
			expect(game.cursor).toEqual({ fixture: 'deck', data: [51] });

			const undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (2)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (2)',
				type: 'shuffle',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
		});

		test('shuffle + deal', () => {
			const game = new FreeCell().shuffle32(1).dealAll();
			expect(game.history).toEqual(['shuffle deck (1)', 'deal all cards']);
			expect(game.previousAction).toEqual({
				text: 'deal all cards',
				type: 'deal',
			});
			expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });

			const undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (1)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (1)',
				type: 'shuffle',
				gameFunction: 'undo',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
		});

		test('deal', () => {
			const game = new FreeCell().dealAll();
			expect(game.history).toEqual(['deal all cards']);
			expect(game.previousAction).toEqual({
				text: 'deal all cards',
				type: 'deal',
			});
			expect(game.cursor).toEqual({ fixture: 'cell', data: [0] });

			const undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (2)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (2)',
				type: 'shuffle',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
		});

		test('deal 44 cards', () => {
			const game = new FreeCell().dealAll({ demo: true, keepDeck: true });
			expect(game.history).toEqual(['deal 44 cards']);
			expect(game.previousAction).toEqual({
				text: 'deal 44 cards',
				type: 'deal',
			});
			expect(game.cursor).toEqual({ fixture: 'deck', data: [7] });

			const undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (2)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (2)',
				type: 'shuffle',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
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

			let undids = game.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (3)', 'deal all cards']);
			expect(undids.previousAction).toEqual({
				text: 'deal all cards',
				type: 'deal',
				gameFunction: 'undo',
			});
			expect(undids.cursor).toEqual({ fixture: 'cell', data: [0] });

			// do not shuffle just because we did a shuffle
			undids = undids.$undoThenShuffle(1);
			expect(undids.history).toEqual(['shuffle deck (3)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (3)',
				type: 'shuffle',
				gameFunction: 'undo',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });

			// the point is, do not go back to 'init', shuffle instead
			undids = undids.$undoThenShuffle(2);
			expect(undids.history).toEqual(['shuffle deck (2)']);
			expect(undids.previousAction).toEqual({
				text: 'shuffle deck (2)',
				type: 'shuffle',
			});
			expect(undids.cursor).toEqual({ fixture: 'deck', data: [51] });
		});
	});
});
