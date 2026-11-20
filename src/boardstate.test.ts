import { describe, expect, test } from 'vitest';
import {
	attackPreview,
	attackWith,
	cellCards,
	createTombState,
	currentLevel,
	FREE_CELL_COUNT,
	foundationTopRank,
	hp,
	isFaceDown,
	revealFaceDown,
	tombPar,
	type TombState,
} from './tombcrawl';
import { decodeBoard, encodeBoard } from './boardstate';
import { shorthandCard } from './game/card/card';

/** The cards still in the tomb, with a pocket's missing depth read as 0, so both boards compare. */
function board(state: TombState) {
	return state.game.cards
		.filter((card) => card.location.fixture !== 'foundation')
		.map(
			(card) =>
				`${shorthandCard(card)} ${card.location.fixture} ${card.location.data[0]} ${
					card.location.data[1] ?? 0
				}`
		)
		.sort();
}

/** The home row as a set: a boardstring implies which cards are home, but not which slot they sit in. */
function home(state: TombState) {
	return state.game.cards
		.filter((card) => card.location.fixture === 'foundation')
		.map((card) => shorthandCard(card))
		.sort();
}

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
		if (!isFaceDown(state, card) || !revealFaceDown(state, card.location)) continue;
		return card.location;
	}
	return null;
}

describe('boardstring', () => {
	test('a dealt board round-trips with its party read off the pockets', () => {
		const dealt = createTombState(1803, FREE_CELL_COUNT.med);
		const text = encodeBoard(dealt);
		const back = decodeBoard(text);
		expect(back).not.toBeNull();
		expect(board(back!)).toEqual(board(dealt));
		expect(home(back!)).toEqual(home(dealt));
		expect(back!.hidden.slice().sort()).toEqual(dealt.hidden.slice().sort());
		expect(back!.draft.map((entry) => entry.id)).toEqual(
			dealt.game.cells.slice(0, 4).map((card) => shorthandCard(card!))
		);
		expect(back!.draft.map((entry) => entry.name)).toEqual(dealt.draft.map((entry) => entry.name));
		expect(back!.seed).toBe(1803);
		expect(hp(back!)).toBe(hp(dealt));
		expect(currentLevel(back!)).toBe(currentLevel(dealt));
		expect(tombPar(back!)).toBe(tombPar(dealt));
	});

	test('a played board keeps its fog, its homes, its wounds and its level', () => {
		const dealt = createTombState(4, FREE_CELL_COUNT.med);
		const homePlay = homeFromCascade(dealt);
		expect(homePlay).not.toBeNull();
		const at = firstDig(homePlay!);
		expect(at).not.toBeNull();
		const played = revealFaceDown(homePlay!, at!)!;

		const text = encodeBoard(played);
		const back = decodeBoard(text)!;
		expect(board(back)).toEqual(board(played));
		expect(home(back)).toEqual(home(played));
		expect(back.hidden.slice().sort()).toEqual(played.hidden.slice().sort());
		expect(hp(back)).toBe(hp(played));
		expect(currentLevel(back)).toBe(currentLevel(played));
		expect(tombPar(back)).toBe(tombPar(played));
		for (const suit of ['spades', 'hearts', 'clubs', 'diamonds'] as const)
			expect(foundationTopRank(back, suit)).toBe(foundationTopRank(played, suit));
		// The same board prints the same line every time, so two transcripts can be diffed.
		expect(encodeBoard(back)).toBe(text);
	});

	test('reads a spent pocket and a wounded one', () => {
		const dealt = createTombState(12, FREE_CELL_COUNT.med);
		const marked: TombState = {
			...dealt,
			exhausted: dealt.exhausted.map((_, cell) => cell === 1),
			wounded: dealt.wounded.map((_, cell) => (cell === 0 ? 1 : 0)),
		};
		const text = encodeBoard(marked);
		expect(text).toContain('*');
		expect(text).toContain('!');
		const back = decodeBoard(text)!;
		expect(back.exhausted[1]).toBe(true);
		expect(back.wounded[0]).toBe(1);
		expect(cellCards(back, 0)).toHaveLength(1);
		expect(hp(back)).toBe(hp(marked));
	});

	test('marks the boss king where it stands', () => {
		const found = Array.from({ length: 40 }, (_, index) => index + 1)
			.map((seed) => createTombState(seed, FREE_CELL_COUNT.med))
			.find((state) => state.bossId);
		expect(found).toBeDefined();
		const text = encodeBoard(found!);
		expect(text).toContain('^');
		const back = decodeBoard(text)!;
		expect(back.bossId).toBe(found!.bossId);
		expect(back.bossSuit).toBe(found!.bossSuit);
	});

	test('a seedless board is a puzzle, and stays one', () => {
		const dealt = createTombState(1803, FREE_CELL_COUNT.med);
		const text = encodeBoard(dealt, false);
		expect(text).not.toContain(':');
		const back = decodeBoard(text)!;
		expect(back.seed).toBe(0);
		expect(board(back)).toEqual(board(dealt));
		// A board with no crawl behind it never grows one.
		expect(encodeBoard(back)).toBe(text);
		// The seeded form still carries its number through.
		expect(decodeBoard(encodeBoard(dealt))!.seed).toBe(1803);
	});

	test('refuses text that is not a board', () => {
		expect(decodeBoard('')).toBeNull();
		expect(decodeBoard('1803')).toBeNull();
		expect(decodeBoard('crawl #1803')).toBeNull();
		// A card named twice: eight columns all holding the same card.
		expect(decodeBoard(`E.E.E.E.E.E.E.E/ABCD`)).toBeNull();
		// A column went missing, so the board no longer holds eight piles.
		const dealt = createTombState(1803, FREE_CELL_COUNT.med);
		expect(decodeBoard(encodeBoard(dealt).replace('.', ''))).toBeNull();
	});
});
