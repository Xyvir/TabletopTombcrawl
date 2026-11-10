import { describe, expect, test } from 'vitest';
import { initializeDeckOfCards, shorthandCard, type Card } from './game/card/card';
import { FreeCell } from './game/game';
import {	MONSTERS,
	TOMB_CELL_COUNT,
	FREE_CELL_COUNT,
	abilityUsable,
	armedClick,
		armedDrop,

	attackPreview,
	attackWith,
	healPreview,
	bossSlain,
	bossUnlocked,
	canSendHome,
	cellCardMovable,
	chipBoundary,
	convertibleCell,
	newlyHealed,
	newlyWounded,
	createTombState,
	currentLevel,
	emptyCells,
	hp,
	cellCards,
	maxHp,
	woundedCards,
	isFaceDown,
	revealFaceDown,
	kingsHome,
	playerLevel,
	tombExit,
	tombMove,
	tombPar,
	tombScore,
	useAbility,
	type DraftCard,
	type TombState,
} from './tombcrawl';

interface Setup {
	columns: string[][];
	cells?: (string | null)[];
	foundations?: (string | null)[];
	hidden?: string[];
	draft?: DraftCard[];
	exhausted?: number[];
	wounded?: number[];
	boss?: string;
	freeCastBank?: boolean;
}

function makeTomb({
	columns,
	cells = [],
	foundations = [],
	hidden = [],
	draft = [],
	exhausted = [],
	wounded = [],
	boss,
	freeCastBank = false,
}: Setup): TombState {
	const cards: Card[] = initializeDeckOfCards();
	const byId = new Map<string, Card>();
	cards.forEach((card) => byId.set(shorthandCard(card), card));
	const used = new Set<string>();
	const place = (id: string, location: Card['location']) => {
		const card = byId.get(id);
		if (!card) throw new Error(`unknown card ${id}`);
		card.location = location;
		used.add(id);
	};

	columns.forEach((column, c) => column.forEach((id, i) => place(id, { fixture: 'cascade', data: [c, i] })));
	cells.forEach((id, i) => id && place(id, { fixture: 'cell', data: [i] }));
	foundations.forEach((id, i) => id && place(id, { fixture: 'foundation', data: [i] }));

	let deckIndex = 0;
	cards.forEach((card) => {
		if (!used.has(shorthandCard(card))) card.location = { fixture: 'deck', data: [deckIndex++] };
	});

	const game = new FreeCell({ cellCount: TOMB_CELL_COUNT, cascadeCount: 8, cards });
	return {
		game,
		seed: 1,
		hidden,
		draft,
		bossId: boss ?? null,
		bossSuit: boss ? byId.get(boss)!.suit : null,
		exhausted: Array.from({ length: TOMB_CELL_COUNT }, (_, i) => exhausted.includes(i)),
		wounded: Array.from({ length: TOMB_CELL_COUNT }, (_, i) => (wounded.includes(i) ? 1 : 0)),
		won: false,
		score: null,
		armed: null,
		itemWindow: null,
		freeCast: false,
		freeCastBank,
	};
}

const cascade = (column: number, card = 0) => ({ fixture: 'cascade' as const, data: [column, card] });
const cell = (index: number) => ({ fixture: 'cell' as const, data: [index] });

describe("the wizard's affinity", () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Wizard', text: '' },
		{ cell: 1, role: 'glyph', id: '2S', suit: 'spades', name: 'BYSSEPS', text: '' },
		{ cell: 2, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
	];
	// the Elixir is the cleanest way to refresh on demand: it opens the window with its own action
	const preparing = (extra: Partial<Setup> = {}) =>
		makeTomb({ columns: [['5H'], ['9D']], cells: ['KC', '2S', '5C'], draft, exhausted: [1], hidden: ['5H'], ...extra });
	const refreshed = (extra: Partial<Setup> = {}) => useAbility(preparing(extra), 2)!;
	// the same board with the glyph fresh, so the banked cast is the only free cast on offer
	const opening = (extra: Partial<Setup> = {}) =>
		makeTomb({ columns: [['5H'], ['9D']], cells: ['KC', '2S', '5C'], draft, hidden: ['5H'], ...extra });

	test('the glyph cast on the move after a refresh costs no exhaustion', () => {
		expect(refreshed().freeCast).toBe(true);

		const cast = useAbility(refreshed(), 1)!;
		expect(cast.armed).toMatchObject({ kind: 'sack' });
		expect(cast.exhausted[1]).toBe(false);
		// the window is spent by the free cast itself, so a second one in a row is not
		expect(cast.freeCast).toBe(false);
		expect(useAbility({ ...cast, armed: null }, 1)!.exhausted[1]).toBe(true);
	});

	test('any other move closes the window', () => {
		const dug = revealFaceDown(refreshed(), cascade(0, 0))!;
		expect(dug.freeCast).toBe(false);
		expect(useAbility(dug, 1)!.exhausted[1]).toBe(true);
	});

	test('the first glyph cast of the run is free, whenever it comes', () => {
		const cast = useAbility(opening({ freeCastBank: true }), 1)!;

		expect(cast.armed).toMatchObject({ kind: 'sack' });
		expect(cast.exhausted[1]).toBe(false);
		// the one banked cast is spent by the cast it paid for
		expect(cast.freeCastBank).toBe(false);
		expect(useAbility({ ...cast, armed: null }, 1)!.exhausted[1]).toBe(true);
	});

	test('a free cast spends the window and the banked cast together', () => {
		const state = refreshed({ freeCastBank: true });
		expect(state.freeCast).toBe(true);

		const cast = useAbility(state, 1)!;
		expect(cast.exhausted[1]).toBe(false);
		expect(cast.freeCast).toBe(false);
		// one free cast, never two in a row: the window takes the bank down with it
		expect(cast.freeCastBank).toBe(false);
		expect(useAbility({ ...cast, armed: null }, 1)!.exhausted[1]).toBe(true);
	});

	test('a class that is not the wizard casts at full price', () => {
		const fighter = draft.map((entry) => (entry.role === 'class' ? { ...entry, name: 'Fighter' } : entry));
		const state = useAbility(preparing({ draft: fighter, freeCastBank: true }), 2)!;

		expect(state.freeCast).toBe(false);
		expect(useAbility(state, 1)!.exhausted[1]).toBe(true);
	});
});

describe('monster damage on the way home', () => {
	test('a card one level above you wounds the rightmost face-up card', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: 'KC', suit: 'clubs', name: 'Elf', text: '' },
			{ cell: 3, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' },
		];
		const state = makeTomb({ columns: [['2H']], cells: ['KC', 'QC', 'JC', 'TC'], foundations: ['AH'], draft });
		expect(currentLevel(state)).toBe(1);
		expect(hp(state)).toBe(4);

		const next = attackWith(state, cascade(0, 0));
		expect(next).not.toBeNull();
		// the kill costs one HP, paid from the right edge of the track
		expect(hp(next!)).toBe(3);
		expect(next!.wounded).toEqual([0, 0, 0, 1, 0, 0, 0]);
		// that wound landed on the drafted item, so it is out of reach until it is healed
		expect(abilityUsable(next!, 3)).toBe(false);
	});

	test('a wound you cannot pay for refuses the kill', () => {
		const state = makeTomb({ columns: [['2H']], cells: ['KC', 'QC'], foundations: ['AH'], wounded: [0, 1] });
		expect(hp(state)).toBe(0);
		expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);
		expect(attackWith(state, cascade(0, 0))).toBeNull();
		expect(tombMove(state, cascade(0, 0), { fixture: 'foundation', data: [0] })).toBeNull();
	});
});

describe("the fighter's level", () => {
	const draft: DraftCard[] = [{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Fighter', text: '' }];

	test('ignores the lowest card, so one lagging suit does not hold him back', () => {
		const board = { columns: [['5D']], cells: ['KC'], foundations: ['AS', '2S', '2H', '2C'] };
		expect(currentLevel(makeTomb(board))).toBe(1);
		expect(currentLevel(makeTomb({ ...board, draft }))).toBe(2);
	});

	test('still starts at level 1 while every suit is only an ace', () => {
		const state = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', 'AH', 'AC', 'AD'], draft });
		expect(currentLevel(state)).toBe(1);
	});

	test('a wounded fighter loses the passive', () => {
		const state = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', '2S', '2H', '2C'], draft, wounded: [0] });
		expect(currentLevel(state)).toBe(1);
	});
});

describe('conversion order', () => {
	test('the chip starts between the party and the plain free cells', () => {
		const easy = createTombState(4242, FREE_CELL_COUNT.easy);
		const hard = createTombState(4242, FREE_CELL_COUNT.hard);
		[easy, hard].forEach((state) => {
			expect(chipBoundary(state)).toBe(4);
			expect(convertibleCell(state)).toBe(3);
		});
	});

	test('only the item beside the chip may leave its slot', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2S', suit: 'spades', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: 'AC', suit: 'clubs', name: 'Fighter', text: '' },
		];
		const state = makeTomb({ columns: [['5D', '6D']], cells: ['2S', 'AC'], foundations: ['AS'], draft });
		expect(convertibleCell(state)).toBe(1);

		// the spade is rank-legal, but it sits left of the chip so it has to wait its turn
		expect(canSendHome(state, cell(0)).legal).toBe(false);
		expect(canSendHome(state, cell(0)).reason).toContain('chip');
		expect(attackWith(state, cell(0))).toBeNull();
		expect(tombMove(state, cell(0), { fixture: 'foundation', data: [0] })).toBeNull();
		expect(cellCardMovable(state, 0)).toBe(false);

		// the item beside the chip converts: its slot waits one action, so the chip holds at 2
		const next = attackWith(state, cell(1));
		expect(next).not.toBeNull();
		expect(next!.draft.map((entry) => entry.cell)).toEqual([0]);
		expect(convertibleCell(next!)).toBe(0);
		expect(next!.itemWindow).toEqual({ cell: 1, role: 'class', suit: 'clubs' });
		expect(chipBoundary(next!)).toBe(2);
		expect(cellCardMovable(next!, 0)).toBe(true);
	});

	test('the chip holds while a refill window is open, then steps left', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '4C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 3, role: 'consumable', id: '5S', suit: 'spades', name: 'Potion', text: '' },
		];
		const state = makeTomb({ columns: [['6H'], ['3S']], cells: ['4C', null, null, '5S'], draft, hidden: ['3S'] });
		expect(chipBoundary(state)).toBe(4);

		// the potion is played out: its slot is normal for one action, but the chip has not moved yet
		const played = tombMove(state, cell(3), cascade(0))!;
		expect(played.itemWindow).toEqual({ cell: 3, role: 'consumable', suit: 'spades' });
		expect(chipBoundary(played)).toBe(4);

		// the refill was missed, so the slot is plain for good and the chip steps one slot left
		const missed = revealFaceDown(played, cascade(1))!;
		expect(missed.itemWindow).toBe(null);
		expect(chipBoundary(missed)).toBe(1);
	});

	test('an item sent home leaves its slot open for one action to restock', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: 'AS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
		const state = makeTomb({ columns: [['5D']], cells: ['AS', '3S'], draft });
		expect(chipBoundary(state)).toBe(1);

		// the spell goes home for free: the slot waits instead of turning plain straight away
		const home = attackWith(state, cell(0))!;
		expect(home.draft).toEqual([]);
		expect(home.itemWindow).toEqual({ cell: 0, role: 'glyph', suit: 'spades' });
		expect(chipBoundary(home)).toBe(1);

		// a spade on the next action restocks the slot, so the chip never passes it
		const restocked = tombMove(home, cell(1), cell(0));
		expect(restocked).not.toBe(null);
		expect(restocked!.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'BYSSEPS', id: '3S' });
		expect(restocked!.itemWindow).toBe(null);
		expect(chipBoundary(restocked!)).toBe(1);
		expect(abilityUsable(restocked!, 0)).toBe(true);
	});

	test('any other action sends the chip past the emptied slot', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: 'AS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
		const state = makeTomb({ columns: [['5D'], ['4H']], cells: ['AS', '3S'], draft });
		const home = attackWith(state, cell(0))!;
		expect(chipBoundary(home)).toBe(1);

		// a move somewhere else closes the window: the cell is plain and the chip steps left
		const other = tombMove(home, cell(1), cascade(1));
		expect(other).not.toBe(null);
		expect(other!.itemWindow).toBe(null);
		expect(other!.game.cells[0]).toBe(null);
		expect(chipBoundary(other!)).toBe(0);
	});

	test('a plain card in a free cell goes home by drag as well as by double click', () => {
		const state = makeTomb({ columns: [['2H']], cells: ['AD', 'KC'] });
		const next = tombMove(state, cell(0), { fixture: 'foundation', data: [0] });

		expect(next).not.toBeNull();
		expect(next!.game.cards.find((card) => shorthandCard(card) === 'AD')!.location.fixture).toBe('foundation');
	});
});

describe('the wound turn', () => {
	test('reports the card that just turned face-down', () => {
		const state = makeTomb({ columns: [['2H']], cells: ['KC', 'QC'], foundations: ['AH'] });
		const next = attackWith(state, cascade(0, 0))!;

		expect(next.wounded[1]).toBe(1);
		expect(newlyWounded(state, next)).toEqual(['QC']);
		expect(newlyWounded(next, next)).toEqual([]);
		expect(newlyHealed(state, next)).toEqual([]);
	});

	test('reports the cards that just came back face-up', () => {
		const state = makeTomb({ columns: [['3S']], cells: ['KC', 'QC'], foundations: ['AH'], wounded: [1], hidden: ['3S'] });
		const next = revealFaceDown(state, cascade(0, 0))!;

		expect(next.wounded[1]).toBe(0);
		expect(newlyHealed(state, next)).toEqual(['QC']);
		expect(newlyHealed(next, next)).toEqual([]);
		expect(newlyWounded(state, next)).toEqual([]);
	});
});

describe('burden and mana burn', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' },
		{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
	];
	const board = (overrides: Partial<Setup> = {}) =>
		makeTomb({
			columns: [['4C']],
			cells: ['TC', 'TS', 'KD', 'QD'],
			foundations: ['3C'],
			draft,
			boss: 'KC',
			...overrides,
		});

	test('a Gorgon kill spends and wounds the Consumable before the damage lands', () => {
		// one heart has to be left standing, so this kill runs a rank below the deadly one
		const state = board({ columns: [['3C']], foundations: ['2C'] });
		expect(currentLevel(state)).toBe(1);
		expect(hp(state)).toBe(4);

		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(2);
		expect(preview.locks).toContain(0);

		const next = attackWith(state, cascade(0, 0))!;
		expect(next.exhausted[0]).toBe(true);
		expect(next.wounded[0]).toBe(1);
		expect(abilityUsable(next, 0)).toBe(false);
		// one heart for the item, then the kill's own two, paid from the right edge inward
		expect(next.wounded).toEqual([1, 0, 1, 1, 0, 0, 0]);
		expect(hp(next)).toBe(1);
	});

	test('a kill that would spend the last heart is refused', () => {
		const state = board();
		expect(currentLevel(state)).toBe(1);
		expect(hp(state)).toBe(4);

		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(3);
		expect(preview.legal).toBe(false);
		// the one empty cell that has to take a card first, so the track can absorb the wounds
		expect(preview.need).toEqual([4]);
		// the track is the blocker, so every heart slot reads as one, empty ones included
		expect(preview.fatal).toBe(true);
		expect(preview.wounds).toEqual([]);
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});

	test('an already spent Consumable is still wounded', () => {
		const state = board({ exhausted: [0], columns: [['3C']], foundations: ['2C'] });
		const next = attackWith(state, cascade(0, 0))!;

		expect(next.exhausted[0]).toBe(true);
		expect(next.wounded[0]).toBe(1);
	});

	test('the aura wound is owed on top, so a kill one HP short is refused', () => {
		const state = board({
			cells: ['TC', 'TS', 'KD'],
			draft: [{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' }],
		});
		expect(hp(state)).toBe(3);

		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.legal).toBe(false);
		expect(preview.reason).toContain('needs 4 HP');
		expect(preview.fatal).toBe(true);
		expect(attackWith(state, cascade(0, 0))).toBeNull();
	});

	test('a Wraith kill drains the Glyph instead', () => {
		const state = board({ columns: [['3D']], foundations: ['2D'], boss: 'KD' });
		const next = attackWith(state, cascade(0, 0))!;

		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
		expect(next.exhausted[0]).toBe(false);
		expect(hp(next)).toBe(1);
	});

	test('parking a Gorgon in a free cell burdens the Consumable, just like a kill', () => {
		const state = board();
		const next = tombMove(state, cascade(0, 0), cell(4))!;

		expect(shorthandCard(next.game.cells[4]!)).toBe('4C');
		expect(next.exhausted[0]).toBe(true);
		expect(next.wounded[0]).toBe(1);
		// the card was not killed, so the power's one wound is the whole bill
		expect(next.wounded).toEqual([1, 0, 0, 0, 0, 0, 0]);
	});

	test('parking a Wraith in a free cell burns the Glyph too', () => {
		const state = board({ columns: [['4D']], foundations: ['3D'], boss: 'KD' });
		const next = tombMove(state, cascade(0, 0), cell(4))!;

		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
		expect(next.exhausted[0]).toBe(false);
	});

	test('sending a boss-suit minion home from the tableau sets its power off', () => {
		const state = board({ columns: [['3C']], foundations: ['2C'] });
		const next = tombMove(state, cascade(0, 0), { fixture: 'foundation', data: [0] })!;

		expect(next.exhausted[0]).toBe(true);
		expect(next.wounded[0]).toBe(1);
	});

	test('the card that restocks a spent slot becomes the item, so the power holds its fire', () => {
		const state = makeTomb({
			columns: [['4C']],
			cells: [null, 'TS', 'KD', 'QD'],
			draft: [{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }],
			boss: 'KC',
		});
		const feeding = { ...state, itemWindow: { cell: 0, role: 'consumable' as const, suit: 'clubs' as const } };

		const next = tombMove(feeding, cascade(0, 0), cell(0))!;
		expect(next.draft.find((entry) => entry.cell === 0)?.role).toBe('consumable');
		expect(next.exhausted[0]).toBe(false);
		expect(next.wounded[0]).toBe(0);
	});

	test('a converted item is not there to drain, so the kill costs only its damage', () => {
		const state = board({
			draft: [{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }],
		});
		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(3);
		expect(preview.legal).toBe(true);

		const next = attackWith(state, cascade(0, 0))!;
		expect(next.wounded[0]).toBe(0);
		expect(hp(next)).toBe(1);
	});
});

describe('the revive', () => {
	const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: 'TS', suit: 'spades', name: 'Revive', text: '' }];
	const board = () =>
		makeTomb({
			columns: [['4C']],
			cells: ['TS', 'KD', 'QD', '7C'],
			foundations: ['3C'],
			draft,
			boss: 'KC',
		});

	test('it buys the one wound the track cannot hold, then it is spent', () => {
		// four hearts against a four-wound kill: the last heart is exactly what the rule forbids
		const state = board();
		expect(hp(state)).toBe(4);
		expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);

		const armed = useAbility(state, 0)!;
		expect(armed.armed).toMatchObject({ kind: 'revive' });
		// arming it costs nothing: the action it covers is what spends it
		expect(armed.exhausted[0]).toBe(false);
		expect(attackPreview(armed, cascade(0, 0)).legal).toBe(true);

		const next = attackWith(armed, cascade(0, 0))!;
		expect(hp(next)).toBe(0);
		expect(next.armed).toBe(null);
		expect(next.exhausted[0]).toBe(true);
	});

	test('without the revive armed the same kill is refused', () => {
		const state = board();
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});
});

describe('the bysseps glyph', () => {
	test('arms the stack carry from a glyph slot, which level up refreshes', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '5S', suit: 'spades', name: 'BYSSEPS', text: '' }];
		const state = makeTomb({
			columns: [['KC', 'QS', 'JD', 'TC', '9H']],
			cells: ['5S', '2D'],
			foundations: ['AS'],
			draft,
		});
		const armed = useAbility(state, 0)!;
		expect(armed.armed).toMatchObject({ kind: 'sack' });
		expect(armed.exhausted[0]).toBe(true);
	});
});

describe('the remedy', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'consumable', id: 'TD', suit: 'diamonds', name: 'Remedy', text: '' },
		{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
	];
	const board = (overrides: Partial<Setup> = {}) =>
		makeTomb({
			columns: [['4C']],
			cells: ['TD', 'TS', 'KD', 'QD'],
			foundations: ['3C'],
			draft,
			boss: 'KC',
			...overrides,
		});

	test('arming it does not spend it, and putting it away costs nothing', () => {
		const armed = useAbility(board(), 0)!;
		expect(armed.armed).toMatchObject({ kind: 'remedy', cell: 0 });
		expect(armed.exhausted[0]).toBe(false);

		const putAway = armedClick(armed, cell(0))!;
		expect(putAway.armed).toBe(null);
		expect(putAway.exhausted[0]).toBe(false);
	});

	test('the next action exhausts it', () => {
		const armed = useAbility(board(), 0)!;
		const next = tombMove(armed, cascade(0, 0), cell(4))!;

		expect(next.armed).toBe(null);
		expect(next.exhausted[0]).toBe(true);
	});

	test('while it is armed, a boss-suit kill ignores the power', () => {
		// one heart has to be left standing, so this kill runs a rank below the deadly one
		const kill = board({ columns: [['3C']], foundations: ['2C'] });
		// without the remedy the Gorgon's Burden would drain the Consumable before the wounds land
		expect(attackPreview(kill, cascade(0, 0)).locks).toContain(0);

		const armed = useAbility(kill, 0)!;
		const preview = attackPreview(armed, cascade(0, 0));
		expect(preview.legal).toBe(true);
		expect(preview.fatal).toBe(false);
		expect(preview.locks).not.toContain(0);

		const next = attackWith(armed, cascade(0, 0))!;
		expect(next.wounded[0]).toBe(0);
		// the action it covered is what exhausts it
		expect(next.exhausted[0]).toBe(true);
		expect(next.armed).toBe(null);
	});

	test('a minion parked in a free cell is covered too', () => {
		// unarmed, the Burden drains the Consumable even when the card is only going to a cell
		const plain = tombMove(board(), cascade(0, 0), cell(4))!;
		expect(plain.wounded[0]).toBe(1);

		const armed = useAbility(board(), 0)!;
		const next = tombMove(armed, cascade(0, 0), cell(4))!;
		expect(next.wounded[0]).toBe(0);
		// the park is the action the remedy covers, so the arm is spent and the item exhausts
		expect(next.armed).toBe(null);
		expect(next.exhausted[0]).toBe(true);
	});

	test('a plain card parked on an item slot goes home without refilling the item', () => {
		// the diamond in the column is the card the old bookkeeping would have dragged into the slot
		const draft: DraftCard[] = [
			{ cell: 0, role: 'consumable', id: 'TD', suit: 'diamonds', name: 'Remedy', text: '' },
		];
		const state = makeTomb({
			columns: [['6S', '7S', '3S', 'JD'], ['KD']],
			cells: ['AC'],
			draft,
			exhausted: [0],
		});

		const next = attackWith(state, cell(0))!;

		expect(next.game.foundations[0]?.rank).toBe('ace');
		// the Cure-All stays in its slot, still exhausted, and nothing is dragged out of a column
		expect(next.draft.find((entry) => entry.cell === 0)?.name).toBe('Remedy');
		expect(next.exhausted[0]).toBe(true);
		expect(next.itemWindow).toBe(null);
		expect(next.game.cards.some((card) => shorthandCard(card) === 'JD' && card.location.fixture === 'cell')).toBe(
			false
		);
		expect(next.game.tableau[0]).toHaveLength(4);
	});
});

describe('the potion and the elixir', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		{ cell: 1, role: 'consumable', id: '5H', suit: 'hearts', name: 'Potion', text: '' },
	];
	const board = (overrides: Partial<Setup> = {}) =>
		makeTomb({ columns: [['4C']], cells: ['2S', '5H'], draft, wounded: [0], ...overrides });

	test('the potion heals every wound at once, wherever it sits', () => {
		const state = board({ cells: ['2S', '5H', 'KD'], wounded: [0, 2] });
		expect(hp(state)).toBe(1);

		const drunk = useAbility(state, 1)!;
		expect(drunk.wounded.every((wound) => wound === 0)).toBe(true);
		expect(hp(drunk)).toBe(3);
		expect(drunk.exhausted[1]).toBe(true);
		expect(drunk.armed).toBe(null);
	});

	test('the potion needs no wound to be aimed at', () => {
		const drunk = useAbility(board({ wounded: [] }), 1)!;
		expect(drunk.wounded[0]).toBe(0);
		expect(drunk.exhausted[1]).toBe(true);
	});

	test('the elixir heals the glyph and un-exhausts it', () => {
		const elixir: DraftCard[] = [
			{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
			{ cell: 1, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
		];
		const state = makeTomb({ columns: [['4C']], cells: ['2S', '5C'], draft: elixir, wounded: [0], exhausted: [0] });
		expect(hp(state)).toBe(1);

		const next = useAbility(state, 1)!;
		expect(next.wounded[0]).toBe(0);
		expect(next.exhausted[0]).toBe(false);
		expect(next.exhausted[1]).toBe(true);
		expect(hp(next)).toBe(2);
	});
});

describe('tombcrawl deal and draft', () => {
	test('drafts four suits in draw order and deals the rest under fog', () => {
		const state = createTombState(1234);
		expect(state.draft.map((entry) => entry.role)).toEqual(['kin', 'class', 'glyph', 'consumable']);
		expect(new Set(state.draft.map((entry) => entry.suit)).size).toBe(4);
		expect(state.draft.every((entry) => state.game.cells[entry.cell])).toBe(true);
		expect(state.game.tableau.map((column) => column.length)).toEqual([6, 6, 6, 6, 6, 6, 6, 6]);
		expect(state.game.cards.filter((card) => card.location.fixture === 'deck')).toHaveLength(0);
		expect(hp(state)).toBe(4);
		expect(playerLevel(state.game)).toBe(1);

		// bottom row playable, the row above it is face down
		state.game.tableau.forEach((column) => {
			expect(isFaceDown(state, column[column.length - 1])).toBe(false);
			expect(isFaceDown(state, column[column.length - 2])).toBe(true);
		});
	});

	test('difficulty adds or drops free cells without touching the deal', () => {
		const easy = createTombState(1234, FREE_CELL_COUNT.easy);
		const med = createTombState(1234, FREE_CELL_COUNT.med);
		const hard = createTombState(1234, FREE_CELL_COUNT.hard);

		// four drafted items plus 4 / 3 / 2 free cells, and the HP pool is the whole track
		expect([easy, med, hard].map((state) => state.game.cells.length)).toEqual([8, 7, 6]);
		expect([easy, med, hard].map(maxHp)).toEqual([8, 7, 6]);
		expect(hard.exhausted).toHaveLength(6);
		expect(hard.wounded).toHaveLength(6);

		// the seed alone decides the cards, so every difficulty shows the same deal and fog
		const layout = (state: TombState) =>
			state.game.tableau.map((column) => column.map(shorthandCard).join(' '));
		expect(layout(easy)).toEqual(layout(med));
		expect(layout(hard)).toEqual(layout(med));

		[easy, med, hard].forEach((state) => {
			expect(state.draft.map((entry) => entry.cell)).toEqual([0, 1, 2, 3]);
			expect(emptyCells(state)).toEqual(
				Array.from({ length: state.game.cells.length - 4 }, (_, i) => 4 + i)
			);
			expect(hp(state)).toBe(4);
		});
	});

	test('the boss is the first king the table reveals, not the first king dealt', () => {
		const state = createTombState(77);
		const firstRevealed = state.game.cards.find(
			(card) =>
				card.rank === 'king' &&
				card.location.fixture === 'cascade' &&
				!state.hidden.includes(shorthandCard(card))
		);
		expect(state.bossId).toBe(firstRevealed ? shorthandCard(firstRevealed) : null);
		expect(state.bossSuit).toBe(firstRevealed?.suit ?? null);
	});

	test('a king dealt face down is never the boss', () => {
		let checked = 0;
		for (let seed = 1; seed <= 400 && checked < 5; seed++) {
			const state = createTombState(seed);
			const boss = state.game.cards.find((card) => shorthandCard(card) === state.bossId);
			if (!boss) continue;
			expect(boss.location.fixture).toBe('cascade');
			expect(isFaceDown(state, boss)).toBe(false);
			state.game.cards
				.slice(0, state.game.cards.indexOf(boss))
				.filter((card) => card.rank === 'king' && card.location.fixture === 'cascade')
				.forEach((king) => expect(isFaceDown(state, king)).toBe(true));
			checked++;
		}
		expect(checked).toBe(5);
	});

	test('a deal can start with no boss at all', () => {
		const seed = Array.from({ length: 400 }, (_, i) => i + 1).find(
			(candidate) => !createTombState(candidate).bossId
		);
		expect(seed).toBeDefined();
		const state = createTombState(seed!);
		expect(state.bossSuit).toBe(null);
		state.game.cards
			.filter((card) => card.rank === 'king' && card.location.fixture === 'cascade')
			.forEach((king) => expect(isFaceDown(state, king)).toBe(true));
	});

	test('a king drafted into a free cell is not the boss', () => {
		const state = makeTomb({ columns: [['2C'], ['3D']], cells: ['KS'] });
		const next = tombMove(state, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })!;
		expect(next.bossId).toBe(null);
		expect(next.bossSuit).toBe(null);
	});

	test('the first king dug out of the fog becomes the boss', () => {
		const state = makeTomb({ columns: [['KS', '2C'], ['3D']], hidden: ['KS'] });
		expect(state.bossId).toBe(null);
		const moved = tombMove(state, { fixture: 'cascade', data: [0, 1] }, { fixture: 'cascade', data: [1, 0] })!;
		expect(moved.bossId).toBe(null);

		const next = revealFaceDown(moved, cascade(0, 0))!;
		expect(next.bossId).toBe('KS');
		expect(next.bossSuit).toBe('spades');
	});

	test('the deal is deterministic for a seed', () => {
		const a = createTombState(2024);
		const b = createTombState(2024);
		expect(a.game.cards.map(shorthandCard)).toEqual(b.game.cards.map(shorthandCard));
		expect(a.hidden.sort()).toEqual(b.hidden.sort());
	});
});

describe('tombcrawl damage and free-cell HP', () => {
	test('a kill costs enemy rank minus level, paid from the right edge', () => {
		const state = makeTomb({
			columns: [['4H'], [], [], [], [], [], [], []],
			cells: ['2C', '3C', '4C', '6C', null, null, null],
			foundations: ['3H', 'AS'],
		});
		expect(currentLevel(state)).toBe(1);

		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(3);
		expect(preview.locks).toEqual([3, 2, 1]);

		const next = attackWith(state, cascade(0))!;
		expect(next.game.foundations.some((card) => card && shorthandCard(card) === '4H')).toBe(true);
		expect(hp(next)).toBe(1);
	});

	test('a kill you cannot pay for is refused and names the empty cells', () => {
		const state = makeTomb({ columns: [['5H']], cells: ['2C', '3C'], foundations: ['4H', 'AS'] });
		const preview = attackPreview(state, cascade(0));
		expect(preview.legal).toBe(false);
		expect(preview.need).toEqual([2, 3, 4]);
		expect(attackWith(state, cascade(0))).toBe(null);
	});

	test('spades weakness makes boss minions cost one extra', () => {
		const state = makeTomb({
			columns: [['5S']],
			cells: ['2C', '3C', '4C', '6C', '7C', '8C', null],
			foundations: ['4S', 'AH'],
			boss: 'KS',
		});
		expect(attackPreview(state, cascade(0)).damage).toBe(5);
	});

	test('a kill preview names the cards it would turn face-down', () => {
		const state = makeTomb({ columns: [['2H']], cells: ['KC', 'QC'], foundations: ['AH'] });
		const preview = attackPreview(state, cascade(0, 0));

		expect(preview.damage).toBe(1);
		expect(preview.locks).toEqual([1]);
		expect(preview.wounds).toEqual(['QC']);
	});

	test('an unpayable kill previews no wounds, only the cells it needs', () => {
		const state = makeTomb({ columns: [['2H']], cells: ['KC', 'QC'], foundations: ['AH'], wounded: [0, 1] });
		const preview = attackPreview(state, cascade(0, 0));

		expect(preview.legal).toBe(false);
		expect(preview.need).toEqual([2, 3]);
		expect(preview.fatal).toBe(true);
		expect(preview.wounds).toEqual([]);
	});

	test('bounty pays only for a kill into the leading foundation', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'class', id: '2D', suit: 'diamonds', name: 'Thief', text: '' }];
		// hearts leads, so the 5 of hearts is worth the bounty
		const leading = makeTomb({ columns: [['5H']], foundations: ['4H', '3S'], draft });
		expect(attackPreview(leading, cascade(0)).damage).toBe(0);

		// spades is further along, so the same kill pays its full four damage again
		const behind = makeTomb({ columns: [['5H']], foundations: ['4H', '8S'], draft });
		expect(attackPreview(behind, cascade(0)).damage).toBe(4);
	});

	test('bounty needs the outright lead, and a finished pile is not in the running', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'class', id: '2D', suit: 'diamonds', name: 'Thief', text: '' }];

		// level with spades is not a lead: the tie pays full price
		const tied = makeTomb({ columns: [['5H']], foundations: ['4H', '4S'], draft });
		expect(attackPreview(tied, cascade(0)).damage).toBe(4);

		// a king on top takes that pile out of the comparison, so hearts still leads
		const finished = makeTomb({ columns: [['5H']], foundations: ['4H', 'KS'], draft });
		expect(attackPreview(finished, cascade(0)).damage).toBe(0);

		// with two piles finished, the only live pile is the leader again
		const donePiles = makeTomb({ columns: [['5H']], foundations: ['4H', 'KD', 'KC'], draft });
		expect(attackPreview(donePiles, cascade(0)).damage).toBe(0);
	});

	test('the boss king is frozen until one other king is home', () => {
		const early = makeTomb({ columns: [['KH']], foundations: ['QH'], boss: 'KH' });
		expect(kingsHome(early)).toBe(0);
		expect(bossUnlocked(early)).toBe(false);
		expect(canSendHome(early, cascade(0)).legal).toBe(false);
		expect(canSendHome(early, cascade(0)).reason).toContain('frozen');
		// frozen means no method at all, not just the foundation
		expect(tombMove(early, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })).toBe(null);

		const unlocked = makeTomb({ columns: [['KH']], foundations: ['QH', 'KS'], boss: 'KH' });
		expect(kingsHome(unlocked)).toBe(1);
		expect(bossUnlocked(unlocked)).toBe(true);
		expect(canSendHome(unlocked, cascade(0)).legal).toBe(true);
		expect(tombMove(unlocked, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })).not.toBe(null);
	});
});

describe('tombcrawl progression rules', () => {
	test('a drafted card never withholds the ranks below it, so a buried suit ace can still go home', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'KS', suit: 'spades', name: 'Orc', text: '' }];
		const state = makeTomb({ columns: [['AS']], cells: ['KS'], draft });
		expect(attackPreview(state, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

		const next = attackWith(state, cascade(0, 0))!;
		const ace = next.game.cards.find((card) => shorthandCard(card) === 'AS')!;
		expect(ace.location.fixture).toBe('foundation');
	});

	test('a drafted card only opens the rank above it once the pile is waiting for it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		// no ace home yet, so the drafted two is not the card this pile waits for and nothing opens
		const early = makeTomb({ columns: [['3S']], cells: ['2S', '7D', '8D'], draft });
		expect(canSendHome(early, cascade(0, 0)).legal).toBe(false);
		expect(attackPreview(early, cascade(0, 0)).wounds).toEqual([]);

		// with the ace home the drafted two is next in line, so the three may go
		const ready = makeTomb({ columns: [['3S']], cells: ['2S', '7D', '8D'], foundations: ['AS'], draft });
		expect(attackPreview(ready, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

		const home = makeTomb({ columns: [['3H']], foundations: ['5H'] });
		expect(attackPreview(home, cascade(0, 0)).reason).toBe('foundation already past this rank');
	});

	test('a drafted card does not open a rank while the pile is still short of it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '3S', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
		const state = makeTomb({
			columns: [['4S']],
			cells: ['3S', 'KD', 'QD', '2C', '3C', '4C', '5C'],
			foundations: ['AS'],
			draft,
		});
		// the two of spades is still out there, so the drafted three opens nothing above it
		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.legal).toBe(false);
		expect(preview.wounds).toEqual([]);
	});

	test('a drafted card counts as home for the next rank', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const withPhantom = makeTomb({ columns: [['9C'], ['KS']], cells: ['8C'], foundations: ['7C'], draft });
		expect(canSendHome(withPhantom, cascade(0)).legal).toBe(true);

		const without = makeTomb({ columns: [['9C'], ['KS']], foundations: ['7C'] });
		expect(canSendHome(without, cascade(0)).legal).toBe(false);
	});

	describe('the human', () => {
		const human: DraftCard[] = [{ cell: 0, role: 'kin', id: 'KS', suit: 'spades', name: 'Human', text: '' }];

		test('may skip exactly one rank on the way home', () => {
			const skipping = makeTomb({ columns: [['2H']], cells: ['KS'], draft: human });
			expect(canSendHome(skipping, cascade(0)).legal).toBe(true);

			const reaching = makeTomb({ columns: [['3H']], cells: ['KS'], draft: human });
			expect(canSendHome(reaching, cascade(0)).legal).toBe(false);
		});

		test('may slide a card under a pile that has already passed it', () => {
			const state = makeTomb({ columns: [['3S'], ['6S']], cells: ['KS', '2C', '2D'], foundations: ['5S'], draft: human });
			expect(canSendHome(state, cascade(0)).legal).toBe(true);

			const home = attackWith(state, cascade(0))!;
			const spades = home.game.cards.filter(
				(card) => card.suit === 'spades' && card.location.fixture === 'foundation'
			);
			expect(spades.map((card) => shorthandCard(card)).sort()).toEqual(['3S', '5S']);
			// the pile still reads five, so the six is still the card it wants next
			expect(canSendHome(home, cascade(1)).legal).toBe(true);
		});

		test('does not change the rule for anyone else', () => {
			const state = makeTomb({ columns: [['3S']], foundations: ['5S'] });
			expect(canSendHome(state, cascade(0)).legal).toBe(false);
		});
	});

	describe('heal preview', () => {
		test('names the card a dig would turn back up, and nothing for a card already face up', () => {
			const state = makeTomb({ columns: [['3D', '2C']], cells: ['KC', 'QC'], hidden: ['2C'], wounded: [0] });
			// the fog card at the end of the column can be dug, and mending starts at the left edge
			expect(healPreview(state, cascade(0, 1))).toEqual(['KC']);
			// a card that is already face up is no dig at all
			expect(healPreview(state, cascade(0, 0))).toEqual([]);
		});

		test('a Priest reads out both cells a dig would mend', () => {
			const party: DraftCard[] = [{ cell: 2, role: 'kin', id: 'KH', suit: 'hearts', name: 'Priest', text: '' }];
			const state = makeTomb({
				columns: [['3D', '2C']],
				cells: ['KC', 'QC', 'JC'],
				hidden: ['2C'],
				wounded: [0, 1],
				draft: party,
			});
			expect(healPreview(state, cascade(0, 1))).toEqual(['KC', 'QC']);
		});

		test('nothing to mend reads out nothing', () => {
			const state = makeTomb({ columns: [['3D', '2C']], hidden: ['2C'] });
			expect(healPreview(state, cascade(0, 1))).toEqual([]);
		});
	});

	describe('BURNDAYRAZ through any cover', () => {
		const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];

		test('reaches a card with exactly one card stacked on it', () => {
			const state = makeTomb({ columns: [['4H', '9C']], cells: ['2S', '5D', '6C', '7D'], draft: glyph, foundations: ['3H'] });
			expect(canSendHome(state, cascade(0, 0)).legal).toBe(false);
			expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);

			const primed = useAbility(state, 0)!;
			expect(attackPreview(primed, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

			const home = armedClick(primed, cascade(0, 0))!;
			expect(home.game.cards.find((card) => shorthandCard(card) === '4H')!.location.fixture).toBe('foundation');
		});

		test('reaches a card under any number of covers', () => {
			const state = makeTomb({
				columns: [['4H', '9C', '8D', 'JS', 'KC']],
				cells: ['2S', '5D', '6C', '7D'],
				draft: glyph,
				foundations: ['3H'],
			});
			expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);

			const primed = useAbility(state, 0)!;
			expect(attackPreview(primed, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

			const home = armedClick(primed, cascade(0, 0))!;
			expect(home.game.cards.find((card) => shorthandCard(card) === '4H')!.location.fixture).toBe('foundation');
		});

		test('the gap a burn leaves closes up behind it', () => {
			const state = makeTomb({
				columns: [['4H', '9C', '8D', 'JS', 'KC']],
				cells: ['2S', '5D', '6C', '7D'],
				draft: glyph,
				foundations: ['3H'],
			});
			const primed = useAbility(state, 0)!;
			const home = armedClick(primed, cascade(0, 0))!;

			const column = home.game.tableau[0];
			// nothing is left behind where the card stood
			expect(column.length).toBe(4);
			expect(column.every(Boolean)).toBe(true);
			// the run above the gap keeps its order and steps down one place
			expect(column.map((card) => shorthandCard(card))).toEqual(['9C', '8D', 'JS', 'KC']);
			expect(column.map((card) => card.location.data[1])).toEqual([0, 1, 2, 3]);
		});

		test('a drop onto a foundation spends the spell on the card in hand', () => {
			const state = makeTomb({
				columns: [['4H', '9C', '8D', 'JS', 'KC']],
				cells: ['2S', '5D', '6C', '7D'],
				draft: glyph,
				foundations: ['3H'],
			});
			const primed = useAbility(state, 0)!;
			// the grabbed card is the buried one, and the drop lands on a pile
			const home = armedDrop(primed, cascade(0, 0), { fixture: 'foundation', data: [0] })!;

			expect(home.armed).toBe(null);
			const burned = home.game.cards.find((card) => shorthandCard(card) === '4H')!;
			expect(burned.location).toEqual({ fixture: 'foundation', data: [0] });
			// the column it came from closes up behind it
			expect(home.game.tableau[0].every(Boolean)).toBe(true);
			expect(home.game.tableau[0].length).toBe(4);
		});

		test('still has to see the card: fog is not a target', () => {
			const state = makeTomb({
				columns: [['4H', '9C']],
				cells: ['2S', '5D', '6C'],
				draft: glyph,
				foundations: ['3H'],
				hidden: ['4H'],
			});
			const primed = useAbility(state, 0)!;
			expect(attackPreview(primed, cascade(0, 0)).legal).toBe(false);
			expect(armedClick(primed, cascade(0, 0))).toBe(null);
		});

		test('a Human can skip the missing ace and still reach through the cover', () => {
			const party: DraftCard[] = [
				{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
				{ cell: 1, role: 'kin', id: 'KS', suit: 'spades', name: 'Human', text: '' },
			];
			const state = makeTomb({ columns: [['2H', '6S']], cells: ['2S', 'KS', '5D'], draft: party });
			const primed = useAbility(state, 0)!;

			expect(attackPreview(primed, cascade(0, 0))).toMatchObject({ legal: true });
			const home = armedClick(primed, cascade(0, 0))!;
			expect(home.game.cards.find((card) => shorthandCard(card) === '2H')!.location.fixture).toBe('foundation');
		});
	});

	test('digging is the player\'s call: a newly exposed card stays face down until clicked', () => {
		const state = makeTomb({
			columns: [['2C', '3D'], [], [], [], [], [], [], []],
			cells: [null, null, null, null, null, '8H', '9H'],
			hidden: ['2C'],
			wounded: [5, 6],
		});
		const moved = tombMove(state, cascade(0, 1), cascade(1))!;
		expect(isFaceDown(moved, moved.game.cards.find((card) => shorthandCard(card) === '2C')!)).toBe(true);
		expect(moved.wounded[6]).toBe(1);

		const dug = revealFaceDown(moved, cascade(0, 0))!;
		expect(isFaceDown(dug, dug.game.cards.find((card) => shorthandCard(card) === '2C')!)).toBe(false);
		// healing runs left to right, so the leftmost wound of the pair comes back first
		expect(dug.wounded[5]).toBe(0);
		expect(dug.wounded[6]).toBe(1);
	});

	test('exploration heals from the left edge of the track, so the wounds stay bunched right', () => {
		const state = makeTomb({
			columns: [['2C'], []],
			cells: ['8H', '9H', 'TH', 'JH', 'QH', null, null],
			hidden: ['2C'],
			wounded: [2, 3, 4],
		});
		expect(hp(state)).toBe(2);

		const dug = revealFaceDown(state, cascade(0, 0))!;
		expect(dug.wounded).toEqual([0, 0, 0, 1, 1, 0, 0]);
		expect(hp(dug)).toBe(3);
	});

	test('a face-down card can never be sent home, so an auto move cannot reveal it', () => {
		const state = makeTomb({ columns: [['AS', '3D'], ['5S']], hidden: ['AS'] });
		expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});

	test('poison turns over the deepest face-down card in the rightmost fogged column, with no heal', () => {
		const state = makeTomb({
			columns: [['2C', '8H'], ['KS', '3D'], ['4S', '5C'], [], [], [], [], ['6C', '9D']],
			cells: ['6S', '2D'],
			foundations: ['7H', '7S', '7D', '7C'],
			hidden: ['2C', 'KS', '3D', '5C', '6C'],
			boss: 'KH',
		});
		expect(state.bossSuit).toBe('hearts');

		const next = attackWith(state, cascade(0, 1))!;
		// the rightmost column with fog wins, even though its hidden card sits under 9D
		expect(next.hidden).not.toContain('6C');
		expect(next.hidden).toContain('5C');
		expect(next.hidden).toContain('3D');
		expect(next.hidden).toContain('2C');
		expect(next.hidden).toContain('KS');
		// the kill wounded the spare cell (the rightmost one) and poison healed nothing
		expect(next.wounded[1]).toBe(1);
	});

	test('a draft card can be converted out of its cell', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '8C', suit: 'clubs', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['9H'], ['KS']], cells: ['8C'], draft });
		const next = tombMove(state, cell(0), cascade(0))!;
		expect(next.draft).toHaveLength(0);
		expect(next.game.cells[0]).toBe(null);
	});

	test('a plain card in a free cell is scratch space: it builds back onto the board', () => {
		const state = makeTomb({ columns: [['4D'], ['5S']], cells: ['4H'] });
		expect(cellCardMovable(state, 0)).toBe(true);

		const next = tombMove(state, cell(0), cascade(1))!;
		expect(next).not.toBeNull();
		expect(shorthandCard(next.game.tableau[1][1]!)).toBe('4H');
		expect(next.game.cells[0]).toBe(null);
		// home is still a separate, rank-checked route
		expect(tombMove(state, cell(0), { fixture: 'foundation', data: [0] })).toBe(null);
	});

	 test('a wounded free cell keeps its card stuck until it is healed', () => {
		const state = makeTomb({ columns: [['4D'], ['5S']], cells: ['4H'], wounded: [0] });
		expect(cellCardMovable(state, 0)).toBe(false);
		expect(tombMove(state, cell(0), cascade(1))).toBe(null);
		expect(tombMove(state, cell(0), { fixture: 'foundation', data: [0] })).toBe(null);
	});

	test('an Elf digs a buried card out and heals with it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KS', '2C', '3D'], ['4S']],
			cells: ['JC', '9H'],
			hidden: ['KS', '3D'],
			wounded: [1],
			draft,
		});
		expect(state.bossId).toBe(null);

		const next = revealFaceDown(state, cascade(0, 0))!;
		const king = next.game.cards.find((card) => shorthandCard(card) === 'KS')!;
		expect(isFaceDown(next, king)).toBe(false);
		expect(next.wounded[1]).toBe(0);
		expect(next.bossId).toBe('KS');
		expect(next.bossSuit).toBe('spades');
	});

	test('only an Elf can reveal a buried card', () => {
		const state = makeTomb({ columns: [['KS', '2C']], hidden: ['KS'] });
		expect(revealFaceDown(state, cascade(0, 0))).toBe(null);
	});

	test('revealing at full health wastes the heal instead of banking it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({ columns: [['KS', '2C']], cells: ['JC'], hidden: ['KS'], draft });
		const next = revealFaceDown(state, cascade(0, 0))!;
		expect(next.hidden).not.toContain('KS');
		expect(next.wounded.every((count) => count === 0)).toBe(true);
	});

	test('a level up heals and refreshes the glyph', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '4H', suit: 'hearts', name: 'IMAWAL', text: '' }];
		const state = makeTomb({
			columns: [['3C'], ['KS']],
			cells: ['4H', '5D'],
			foundations: ['3S', '3H', '3D', '2C'],
			draft,
		});
		expect(currentLevel(state)).toBe(2);

		const armed = useAbility(state, 0)!;
		expect(armed.exhausted[0]).toBe(true);
		expect(armed.armed).toMatchObject({ kind: 'imawal' });

		const kill = attackWith(armed, cascade(0))!;
		expect(currentLevel(kill)).toBe(3);
		expect(kill.exhausted[0]).toBe(false);
	});
});

describe('tombcrawl wounds and exhaustion', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];

	test('a wound is damage: it costs HP and locks the cell', () => {
		const state = makeTomb({ columns: [['3S']], cells: ['2S'], draft: glyph, wounded: [0] });
		expect(hp(state)).toBe(0);
		expect(abilityUsable(state, 0)).toBe(false);
		expect(cellCardMovable(state, 0)).toBe(false);
	});

	test('a heal flips the wound back up but leaves the card exhausted', () => {
		const draft: DraftCard[] = [
			...glyph,
			{ cell: 1, role: 'consumable', id: '5H', suit: 'hearts', name: 'Potion', text: '' },
		];
		const state = makeTomb({ columns: [['3S']], cells: ['2S', '5H'], draft, wounded: [0], exhausted: [0] });
		expect(hp(state)).toBe(1);

		// the Potion drinks for the whole track, but a spent glyph stays spent
		const healed = useAbility(state, 1)!;
		expect(healed.wounded[0]).toBe(0);
		expect(healed.exhausted[0]).toBe(true);
		expect(hp(healed)).toBe(2);
	});

	test('a spent card still counts as HP until it is wounded', () => {
		const spent: DraftCard[] = [{ cell: 1, role: 'glyph', id: '3S', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
		const state = makeTomb({
			columns: [['2S']],
			// the spent glyph is the rightmost card, so the first wound lands on it
			cells: ['5D', '3S'],
			foundations: ['AS', 'AH', 'AD', 'AC'],
			draft: spent,
			exhausted: [0, 1],
		});
		expect(hp(state)).toBe(2);

		const kill = attackWith(state, cascade(0))!;
		expect(kill.wounded[1]).toBe(1);
		expect(kill.exhausted[1]).toBe(true);
		// one heart spent, one left standing
		expect(hp(kill)).toBe(1);
	});
});

describe('tombcrawl PISORF stacks', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '5C', suit: 'clubs', name: 'PISORF', text: '' }];

	/** A drafted PISORF, a 7-6 pair, a 3C worth one damage and a 4S worth two. */
	function stackBoard() {
		return makeTomb({
			columns: [['7H', '6S'], ['4S'], ['3C'], ['4H'], ['5D']],
			cells: ['5C'],
			hidden: ['4H', '5D'],
			foundations: ['3S', '2H', '2D', '2C'],
			draft: glyph,
		});
	}

	function stacked() {
		const armed = useAbility(stackBoard(), 0)!;
		const head = armedClick(armed, cascade(0, 0))!;
		return armedClick(head, cell(1))!;
	}

	test('a proper pair goes into one open free cell and is worth two hearts', () => {
		const state = stacked();
		expect(state.armed).toBe(null);
		expect(state.exhausted[0]).toBe(true); // the glyph is spent
		expect(cellCards(state, 1).map(shorthandCard)).toEqual(['6S', '7H']);
		expect(hp(state)).toBe(3);
		expect(maxHp(state)).toBe(8);
	});

	test('damage turns over the bottom card of a stack first', () => {
		const kill = attackWith(stacked(), cascade(2))!; // 3C costs one point at level 2
		expect(kill.wounded[1]).toBe(1);
		expect(hp(kill)).toBe(2);
		expect(woundedCards(kill, 1).map(shorthandCard)).toEqual(['6S']);
	});

	test('the next point of damage turns over the other card', () => {
		const kill = attackWith(stacked(), cascade(1))!; // 4S costs two points at level 2
		expect(kill.wounded[1]).toBe(2);
		expect(hp(kill)).toBe(1);
		expect(woundedCards(kill, 1).map(shorthandCard)).toEqual(['6S', '7H']);
	});

	test('each wounded card in a stack needs its own heal', () => {
		const state = attackWith(stacked(), cascade(1))!;
		const first = revealFaceDown(state, cascade(3))!; // 4H heals the top card first
		expect(first.wounded[1]).toBe(1);
		expect(woundedCards(first, 1).map(shorthandCard)).toEqual(['6S']);
		expect(hp(first)).toBe(2);

		const second = revealFaceDown(first, cascade(4))!; // 5D
		expect(second.wounded[1]).toBe(0);
		expect(hp(second)).toBe(3);
	});

	test('PISORF needs an open free cell and a proper pair', () => {
		const state = makeTomb({ columns: [['7H', '6S']], cells: ['5C', '9D'], draft: glyph });
		const armed = useAbility(state, 0)!;
		const head = armedClick(armed, cascade(0, 0))!;
		expect(armedClick(head, cell(1))).toBe(null); // 9D is parked there already
		expect(armedClick(armed, cascade(0, 1))).toBe(null); // the card under the head heads no pair
	});
});

describe('tombcrawl abilities', () => {
	test('clicking the armed card again disarms it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['KS', '2C'], ['3D']], cells: ['2S'], draft });
		const armed = useAbility(state, 0)!;
		expect(armed.armed).toMatchObject({ kind: 'pisorf', cell: 0 });

		const away = armedClick(armed, cell(0))!;
		expect(away.armed).toBe(null);
		expect(away.exhausted[0]).toBe(false); // disarming puts the glyph away unspent
		expect(away.hidden).toEqual(state.hidden);
	});

	test('a drag resolves pisorf: the grabbed pair lands in the open free cell', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['7H', '6S'], ['3D']], cells: ['2S'], draft });
		const armed = useAbility(state, 0)!;

		const next = armedDrop(armed, cascade(0, 0), cell(1))!;
		expect(next.armed).toBe(null);
		const spot = (id: string) => next.game.cards.find((card) => shorthandCard(card) === id)!.location;
		expect(spot('6S')).toEqual({ fixture: 'cell', data: [1, 0] });
		expect(spot('7H')).toEqual({ fixture: 'cell', data: [1, 1] });
	});

	test('an armed ability never aims at a draft card in its cell', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['KS']], cells: ['2S', '9D'], draft });
		const armed = useAbility(state, 0)!;

		expect(armedClick(armed, cell(1))).toBe(null);
		expect(armed.armed).not.toBe(null);
	});
});

describe('tombcrawl levels', () => {
	test('the delver starts at level 1 and levels up only when every suit reaches two', () => {
		expect(playerLevel(makeTomb({ columns: [['5H']] }).game)).toBe(1);
		// one suit at two is not enough: the slowest foundation sets the level
		expect(playerLevel(makeTomb({ columns: [['5H']], foundations: ['2S', '2H', '2D'] }).game)).toBe(1);
		expect(playerLevel(makeTomb({ columns: [['5H']], foundations: ['2S', '2H', '2D', '2C'] }).game)).toBe(2);
	});
});	describe('tombcrawl IMAWAL', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'IMAWAL', text: '' }];
	const make = (columns: string[][] = [['3S'], ['9D', '5H'], ['4H']]) =>
		makeTomb({ columns, cells: ['2S', '4C'], draft: glyph, hidden: ['5H'] });

	test('a card can be laid on the fog only while IMAWAL is armed', () => {
		const state = make();
		expect(tombMove(state, cell(1), cascade(1))).toBe(null);

		const primed = useAbility(state, 0)!;
		expect(primed.armed).toMatchObject({ kind: 'imawal', cell: 0 });
		const buried = tombMove(primed, cell(1), cascade(1))!;

		const column = buried.game.tableau[1];
		expect(shorthandCard(column[column.length - 1]!)).toBe('4C');
		// the fog stays face down, now buried under the card that was paid for it
		expect(buried.hidden).toContain('5H');
		expect(buried.armed).toBe(null);
		expect(buried.exhausted[0]).toBe(true);
	});

	test('a normal build does not spend it', () => {
		const primed = useAbility(make(), 0)!;
		const built = tombMove(primed, cascade(0), cascade(2))!;

		const column = built.game.tableau[2];
		expect(shorthandCard(column[column.length - 1]!)).toBe('3S');
		expect(built.armed).toMatchObject({ kind: 'imawal' });
	});

	test('it can also be aimed by clicking a card and then the fog', () => {
		const primed = useAbility(make(), 0)!;
		const picked = armedClick(primed, cascade(0))!;
		expect(picked.armed).toMatchObject({ kind: 'imawal', first: '3S' });

		const buried = armedClick(picked, cascade(1))!;
		expect(shorthandCard(buried.game.tableau[1][2])).toBe('3S');
		expect(buried.hidden).toContain('5H');
		expect(buried.armed).toBe(null);
	});

	test('it never turns a face-down card over', () => {
		const primed = useAbility(make(), 0)!;
		expect(armedClick(primed, cascade(1))).toBe(null);
		expect(primed.hidden).toContain('5H');
	});
});

describe('tombcrawl the the sack', () => {
	const sack: DraftCard[] = [{ cell: 0, role: 'consumable', id: '2S', suit: 'spades', name: 'Sack', text: '' }];
	// a six-card run with only one free cell to help it move
	const make = () =>
		makeTomb({
			columns: [['9D', '8S', '7H', '6C', '5D', '4S'], ['TC']],
			cells: ['2S', '3S', '4C', '5C', '7S', '8D'],
			draft: sack,
		});

	test('a run longer than the free cells will not move on its own', () => {
		const state = make();
		expect(tombMove(state, cascade(0, 0), cascade(1))).toBe(null);
	});

	test('the sack carries the whole run, then it is spent', () => {
		const primed = useAbility(make(), 0)!;
		expect(primed.armed).toMatchObject({ kind: 'sack' });

		const carried = tombMove(primed, cascade(0, 0), cascade(1))!;
		expect(carried.game.tableau[1].length).toBe(7);
		expect(carried.armed).toBe(null);
		expect(carried.exhausted[0]).toBe(true);
	});

	test('a run that fits does not spend the sack', () => {
		const state = makeTomb({ columns: [['9D', '8S'], ['TC']], cells: ['2S', '3S'], draft: sack });
		const primed = useAbility(state, 0)!;
		const built = tombMove(primed, cascade(0, 0), cascade(1))!;

		expect(built.game.tableau[1].length).toBe(3);
		expect(built.armed).toMatchObject({ kind: 'sack' });
	});
});

describe('tombcrawl item refresh', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
	const base = (draft: DraftCard[] = glyph, cells: string[] = ['2S']) =>
		makeTomb({ columns: [['5H'], ['3S'], ['9D', '3H'], ['8S'], ['7C']], cells, draft });

	test('playing an item out to the board leaves its slot open for one action', () => {
		const next = tombMove(base(), cell(0), cascade(2))!;
		expect(next.draft).toHaveLength(0);
		expect(next.game.cells[0]).toBe(null);
		expect(next.itemWindow).toEqual({ cell: 0, role: 'glyph', suit: 'spades' });
	});

	test('feeding the slot a matching card remakes the very same item', () => {
		const played = tombMove(base(), cell(0), cascade(2))!;
		const refilled = tombMove(played, cascade(1), cell(0))!;

		expect(refilled.itemWindow).toBe(null);
		expect(shorthandCard(refilled.game.cells[0]!)).toBe('3S');
		expect(refilled.draft).toHaveLength(1);
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'BYSSEPS', id: '3S' });
	});

	test('a plain card parked in another free cell can be fed in too', () => {
		const played = tombMove(base(glyph, ['2S', '4S']), cell(0), cascade(2))!;
		const refilled = tombMove(played, cell(1), cell(0))!;

		expect(shorthandCard(refilled.game.cells[0]!)).toBe('4S');
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'BYSSEPS', id: '4S' });
	});

	test('the wrong suit is not a feed: it misses and the slot stays a plain free cell', () => {
		const played = tombMove(base(), cell(0), cascade(2))!;
		const missed = tombMove(played, cascade(0), cell(0))!;

		expect(missed.itemWindow).toBe(null);
		expect(shorthandCard(missed.game.cells[0]!)).toBe('5H');
		expect(missed.draft).toHaveLength(0);
	});

	test('any other action misses the chance for good', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
			{ cell: 1, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		];
		// the glyph sits beside the chip, so it is the one that may be played out
		const played = tombMove(base(draft, ['5C', '2S']), cell(1), cascade(2))!;
		expect(played.itemWindow).toEqual({ cell: 1, role: 'glyph', suit: 'spades' });

		const spent = useAbility(played, 0)!;
		expect(spent.itemWindow).toBe(null);
	});

	test('an Orc can feed any card of the same colour, which makes the colour’s item', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '4C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		];
		const played = tombMove(base(draft, ['4C', '2S']), cell(1), cascade(2))!;
		const refilled = tombMove(played, cascade(4), cell(1))!;

		expect(refilled.draft).toHaveLength(2);
		expect(refilled.draft.find((item) => item.cell === 1)).toMatchObject({
			role: 'glyph',
			suit: 'clubs',
			name: 'PISORF',
			id: '7C',
		});
	});
});

describe('tombcrawl boss protection', () => {
	test('a drafted dwarf can go straight for the boss', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
		const dwarf = makeTomb({
			columns: [['KH']],
			cells: ['9D', '3C', '4C'],
			foundations: ['QH', 'QS', 'QD', 'QC'],
			boss: 'KH',
			draft,
		});
		expect(attackPreview(dwarf, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });
		expect(attackWith(dwarf, cascade(0, 0))).not.toBe(null);

		const others = makeTomb({
			columns: [['KH']],
			cells: ['3C', '4C', '5C'],
			foundations: ['QH', 'QS', 'QD', 'QC'],
			boss: 'KH',
		});
		expect(attackPreview(others, cascade(0, 0)).reason).toBe('boss king: frozen until one other king is home');
	});

	test('a drafted dwarf no longer silences the boss aura', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
		const dwarf = makeTomb({
			columns: [['9S']],
			cells: ['9D', '3C'],
			foundations: ['8S', '8H', '8D', '8C'],
			boss: 'KS',
			draft,
		});
		// Weakness still adds a rank: 9 + 1 - 8
		expect(attackPreview(dwarf, cascade(0, 0)).damage).toBe(2);
	});
});

describe('tombcrawl monsters', () => {
	test('every boss suit names its monster and power', () => {
		expect(MONSTERS.spades).toMatchObject({ name: 'Bandit', power: 'Weakness' });
		expect(MONSTERS.hearts).toMatchObject({ name: 'Serpent', power: 'Poison' });
		expect(MONSTERS.clubs).toMatchObject({ name: 'Gorgon', power: 'Burden' });
		expect(MONSTERS.diamonds).toMatchObject({ name: 'Wraith', power: 'Mana Burn' });
	});
});

describe('tombcrawl endgame', () => {
	test('three kings home does not end the run any more', () => {
		const state = makeTomb({
			columns: [['KH'], ['5H']],
			cells: ['8C', '9C'],
			foundations: ['QH', 'QS', 'KD', 'KC'],
			boss: 'KS',
		});
		expect(state.bossId).toBe('KS');
		const next = attackWith(state, { fixture: 'cascade', data: [0, 0] })!;
		expect(bossSlain(next)).toBe(false);
		expect(next.won).toBe(false);
		expect(next.score).toBe(null);
		// the boss is still standing, so there is no way out yet
		expect(tombExit(next)).toBe(null);
	});

	test('the boss kill ends the game and scores the leftovers', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KH'], ['5H']],
			cells: ['8C', '5D'],
			foundations: ['QH', 'KS', 'KD', 'KC'],
			draft,
			boss: 'KH',
		});
		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(1);
		expect(preview.legal).toBe(true);

		const next = attackWith(state, cascade(0))!;
		expect(next.won).toBe(false); // the boss is down, but you leave through the exit yourself

		const exit = tombExit(next)!;
		expect(exit.won).toBe(true);
		// 5H left on the tableau (5), the un-dumped 8C ability (8) and the spare 5D (5)
		expect(exit.score).toBe(-18);
	});

	test('court cards count as ten apiece and the total stays negative', () => {
		const state = makeTomb({ columns: [['KH', 'QH', 'JH'], ['2S']] });
		expect(tombScore(state)).toBe(-32);
	});
});

describe('par', () => {
	// Sending a card home takes it out of the dungeon, so par drops by exactly that card's value.
	const lifted = (id: string, boss?: string) =>
		tombPar(makeTomb({ columns: [['2H']], boss })) -
		tombPar(makeTomb({ columns: [['2H']], foundations: [id], boss }));

	test('aces count one and the number cards count their face', () => {
		expect(lifted('AH')).toBe(1);
		expect(lifted('9D')).toBe(9);
		expect(lifted('TS')).toBe(10);
	});

	test('court cards count ten, kings twenty and the boss king a hundred', () => {
		expect(lifted('JC')).toBe(10);
		expect(lifted('QH')).toBe(10);
		expect(lifted('KD')).toBe(20);
		expect(lifted('KD', 'KD')).toBe(100);
	});

	test('a card counts the same however it is lying', () => {
		const plain = tombPar(makeTomb({ columns: [['2H']], cells: ['KD'] }));
		expect(tombPar(makeTomb({ columns: [['2H']], cells: ['KD'], hidden: ['KD'] }))).toBe(plain);
		expect(tombPar(makeTomb({ columns: [['2H']], cells: ['KD'], wounded: [1] }))).toBe(plain);
	});

	test('a whole deal reads 460 with a boss on the board and 380 without', () => {
		const fresh = createTombState(1);
		expect(tombPar(fresh)).toBe(fresh.bossId ? 460 : 380);
	});
});
