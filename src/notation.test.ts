import { describe, expect, test } from 'vitest';
import {
	attackPreview,
	attackWith,
	canRevealFaceDown,
	createTombState,
	emptyCells,
	isFaceDown,
	revealFaceDown,
	tombMove,
	useAbility,
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

	test('reads the move an armed item paid for, not the item being spent', () => {
		// A Remedy covers the next action and is spent by it, so a park made under one changes the
		// armed slot as well: the line still has to name the card that moved, or the park is lost
		const dealt = createTombState(9, 4);
		const entry = dealt.draft.find((candidate) => candidate.role === 'consumable')!;
		const state: TombState = {
			...dealt,
			draft: dealt.draft.map((candidate) =>
				candidate.cell === entry.cell ? { ...candidate, name: 'Remedy', text: '' } : candidate
			),
		};
		const armed = useAbility(state, entry.cell)!;
		expect(armed.armed).toMatchObject({ kind: 'remedy' });

		const open = { fixture: 'cell' as const, data: [emptyCells(armed)[0]] };
		const from = armed.game.cards.find(
			(card) => card.location.fixture === 'cascade' && !isFaceDown(armed, card) && tombMove(armed, card.location, open)
		);
		expect(from).toBeDefined();
		const parked = tombMove(armed, from!.location, open)!;
		expect(parked.armed).toBe(null);
		expect(describeStep(armed, parked)).toMatch(/^park {2}\S+ col \d+ -> cell \d+$/);
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
