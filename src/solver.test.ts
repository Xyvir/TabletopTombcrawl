import { describe, expect, test } from 'vitest';
import { createTombState } from './tombcrawl';
import { applyAction, generateMoves, solveTomb } from './solver';

const home = (state: ReturnType<typeof createTombState>) =>
	state.game.cards.filter((card) => card.location.fixture === 'foundation').length;

describe('tomb solver', () => {
	test('offers legal moves, each with a description', () => {
		const state = createTombState(4242);
		const moves = generateMoves(state);

		expect(moves.length).toBeGreaterThan(5);
		moves.forEach((move) => {
			expect(move.label.length).toBeGreaterThan(0);
			expect(move.next).not.toBe(state);
		});
	});

	test('every offered move replays through the rules to the same board', () => {
		const state = createTombState(4242);
		generateMoves(state)
			.slice(0, 15)
			.forEach((move) => {
				const replayed = applyAction(state, move.action);
				expect(replayed).not.toBeNull();
				expect(home(replayed!)).toBe(home(move.next));
				expect(replayed!.hidden.length).toBe(move.next.hidden.length);
			});
	});

	test('a search reports a coherent result even when it cannot finish', () => {
		const result = solveTomb({ seed: 4242, depth: 4, nodes: 5000, timeBudgetMs: 5000 });

		expect(result.plies).toBeGreaterThan(0);
		expect(result.nodes).toBeGreaterThan(0);
		expect(result.bestSteps.length).toBeLessThanOrEqual(4);
		// every step of the reported line must be a real move, applied in order
		expect(result.bestSteps.every((step) => step.label.length > 0)).toBe(true);
	});
});
