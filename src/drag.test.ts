import { describe, expect, test } from 'vitest';
import { tombDragRun, tombDragTargets } from './drag';
import { initializeDeckOfCards, shorthandCard, type Card, type CardLocation } from './game/card/card';
import { FreeCell } from './game/game';
import type { DraftCard, TombState } from './tombcrawl';

const cascade = (column: number, row = 0): CardLocation => ({ fixture: 'cascade', data: [column, row] });
const cell = (index: number): CardLocation => ({ fixture: 'cell', data: [index] });

/**
 * A Thief party with a spent Elixir in the item pocket and one exposed card in each of two hallways:
 * everything the Pickpocket window needs, and nothing else that would answer a drag.
 */
const PARTY: DraftCard[] = [
	{ cell: 0, role: 'kin', id: '9D', suit: 'diamonds', name: 'Elf', text: '' },
	{ cell: 1, role: 'class', id: 'TD', suit: 'diamonds', name: 'Thief', text: '' },
	{ cell: 2, role: 'glyph', id: '7C', suit: 'clubs', name: 'PISORF', text: '' },
	{ cell: 3, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
];

interface Setup {
	columns?: string[][];
	hidden?: string[];
	boss?: string;
	pickpocket?: number | null;
	exhausted?: number[];
}

function makeState({
	columns = [['7H'], ['8H']],
	hidden = [],
	boss,
	pickpocket = null,
	exhausted = [3],
}: Setup = {}): TombState {
	const cards: Card[] = initializeDeckOfCards();
	const byId = new Map<string, Card>(cards.map((card) => [shorthandCard(card), card]));
	const used = new Set<string>();
	const place = (id: string, location: CardLocation) => {
		const card = byId.get(id);
		if (!card) throw new Error(`unknown card ${id}`);
		card.location = location;
		used.add(id);
	};
	columns.forEach((column, c) => column.forEach((id, i) => place(id, cascade(c, i))));
	PARTY.forEach((entry) => place(entry.id, cell(entry.cell)));
	let deck = 0;
	for (const card of cards) if (!used.has(shorthandCard(card))) card.location = { fixture: 'deck', data: [deck++] };

	const game = new FreeCell({ cellCount: 7, cascadeCount: 8, cards });
	return {
		game,
		seed: 1,
		hidden,
		draft: PARTY,
		bossId: boss ?? null,
		bossSuit: boss ? 'hearts' : null,
		constitution: false,
		exhausted: Array.from({ length: 7 }, (_, index) => exhausted.includes(index)),
		wounded: Array.from({ length: 7 }, () => 0),
		won: false,
		died: false,
		reserveHeld: true,
		trueBoss: false,
		score: null,
		armed: null,
		itemWindow: null,
		pickpocket,
		synthetic: null,
	};
}

describe('the Pickpocket drag', () => {
	test('lifts a spent pocket card only while its window is open', () => {
		const closed = makeState();
		expect(tombDragRun(closed, cell(3))).toBeNull();

		const open = { ...closed, pickpocket: 3 };
		const run = tombDragRun(open, cell(3));
		expect(run?.location).toEqual(cell(3));
		expect(run?.cards.map(shorthandCard)).toEqual(['5C']);
	});

	test('keeps the lift while the window is armed', () => {
		const armed = { ...makeState({ pickpocket: 3 }), armed: { kind: 'pickpocket' as const, cell: 3 } };
		expect(tombDragRun(armed, cell(3))?.cards.map(shorthandCard)).toEqual(['5C']);
	});

	test('trades the pocket card onto every exposed hallway top', () => {
		const open = makeState({ pickpocket: 3 });
		expect(tombDragTargets(open, cell(3))).toEqual(['cascade:0', 'cascade:1']);
	});

	test('trades an exposed hallway card onto the open pocket', () => {
		const open = makeState({ pickpocket: 3 });
		expect(tombDragTargets(open, cascade(0))).toEqual(['cell:3']);
		expect(tombDragTargets(open, cascade(1))).toEqual(['cell:3']);
	});

	test('lights nothing for a hallway run deeper than the one card the window takes', () => {
		const open = makeState({ columns: [['7H'], ['8H', '7S']], pickpocket: 3 });
		expect(tombDragRun(open, cascade(1))?.cards).toHaveLength(2);
		expect(tombDragTargets(open, cascade(1))).toEqual([]);
	});

	test('leaves the boss and a fogged top out of the window', () => {
		const bossed = makeState({ columns: [['KH'], ['8H']], boss: 'KH', pickpocket: 3 });
		expect(tombDragTargets(bossed, cell(3))).toEqual(['cascade:1']);
		expect(tombDragTargets(bossed, cascade(0))).toEqual([]);

		const fogged = makeState({ columns: [['7H'], ['8H']], hidden: ['7H'], pickpocket: 3 });
		expect(tombDragTargets(fogged, cell(3))).toEqual(['cascade:1']);
		expect(tombDragTargets(fogged, cascade(0))).toEqual([]);
	});

	test('offers no pocket target once the window is closed', () => {
		const closed = makeState();
		expect(tombDragTargets(closed, cell(3))).toEqual([]);
		expect(tombDragTargets(closed, cascade(0))).not.toContain('cell:3');
	});
});
