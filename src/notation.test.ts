import { describe, expect, test } from 'vitest';
import {
	attackPreview,
	attackWith,
	canRevealFaceDown,
	createTombState,
	isFaceDown,
	revealFaceDown,
	type TombState,
} from './tombcrawl';
import { describeStep, transcript, type RecordedStep } from './notation';

/** The first legal home play from a column, which also shortens that column by one. */
function homeFromCascade(state: TombState): TombState | null {
	for (const card of state.game.cards) {
		if (card.location.fixture !== 'cascade') continue;
		if (!attackPreview(state, card.location).legal) continue;
		return attackWith(state, card.location);
	}
	return null;
}

function firstDig(state: TombState) {
	for (const card of state.game.cards) {
		if (!isFaceDown(state, card) || !canRevealFaceDown(state, card.location)) continue;
		return card.location;
	}
	return null;
}

describe('notation', () => {
	test('reads a home play the way a solver line reads it', () => {
		const state = createTombState(4, 4);
		const next = homeFromCascade(state);
		expect(next).not.toBe(null);
		expect(describeStep(state, next!)).toMatch(/^home {2}\S+ -> \w+ foundation$/);
	});

	test('reads a dig with its column and row', () => {
		const state = createTombState(4, 4);
		const opened = homeFromCascade(state)!;
		const at = firstDig(opened);
		expect(at).not.toBe(null);
		const next = revealFaceDown(opened, at!)!;
		expect(describeStep(opened, next)).toMatch(/^dig {3}\S+ col \d+ row \d+$/);
	});

	test('prints a pasteable transcript with the seed and numbered rows', () => {
		const start = createTombState(4, 4);
		const after = homeFromCascade(start)!;
		const steps: RecordedStep[] = [{ label: describeStep(start, after)!, state: after }];
		const text = transcript(start, steps);
		expect(text.split('\n')[0]).toContain('seed 4');
		expect(text).toContain('  1  home');
		expect(text).toContain('final fog');
		expect(text).toContain('1 moves');
	});
});
