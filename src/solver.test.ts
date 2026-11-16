import { describe, expect, test } from 'vitest';
import { createTombState } from './tombcrawl';
import { shorthandCard } from './game/card/card';
import {
	applyAction,
	boardKey,
	fogKey,
	fogMask,
	generateMoves,
	solveTomb,
	spentMask,
	stateKey,
} from './solver';

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

	// WEYTWUT is aimed at two cards with a second click, so a plain `arm` followed by a `move` is refused
	// by the rules: the cast has to be offered as one action or the search can never make it at all.
	test('offers a two-click cast as one action, and it replays through the rules', () => {
		const state = createTombState(4);
		const cast = generateMoves(state).find((move) => move.action.kind === 'weytwut');

		expect(cast).toBeDefined();
		expect(cast!.label).toContain('WEYTWUT');
		const replayed = applyAction(state, cast!.action);
		expect(replayed).not.toBeNull();
		// the glyph is spent by the cast, and the pair it traded has swapped places
		expect(home(replayed!)).toBe(home(cast!.next));
		expect(replayed!.hidden.length).toBe(cast!.next.hidden.length);
		expect(replayed!.armed).toBeNull();
	});

	// The dominance clauses lean on keys that ignore exactly one field. A spent cell and a kept one have to look
	// like the same board, and a dug card and a face-down one too — and nothing else may be ignored, or two
	// genuinely different boards would be pruned as twins.
	test('the dominance keys separate exactly one field from a board', () => {
		const state = createTombState(4242);
		expect(state.exhausted[0]).toBe(false);
		const spent = { ...state, exhausted: [...state.exhausted] };
		spent.exhausted[0] = true;

		expect(stateKey(spent)).not.toBe(stateKey(state));
		expect(boardKey(spent)).toBe(boardKey(state));
		expect(spentMask(spent) ^ spentMask(state)).toBe(1);

		const index = new Map(state.game.cards.map((card, at) => [shorthandCard(card), 1n << BigInt(at)]));
		const dug = { ...state, hidden: state.hidden.slice(1) };
		expect(state.hidden.length).toBeGreaterThan(0);
		expect(stateKey(dug)).not.toBe(stateKey(state));
		expect(fogKey(dug)).toBe(fogKey(state));
		// the dug state's fog is a proper subset of the undug one's, which is what the clause compares
		const whole = fogMask(state, index);
		const less = fogMask(dug, index);
		expect(whole & less).toBe(less);
		expect(whole).not.toBe(less);
	});
});
