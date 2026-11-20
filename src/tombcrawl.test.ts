import { afterEach, describe, expect, test } from 'vitest';
import { initializeDeckOfCards, shorthandCard, type Card } from './game/card/card';
import { FreeCell } from './game/game';
import {
	CLAUSES,
	MONSTERS,
	TOMB_RULES,
	TOMB_CELL_COUNT,
	DRAFT_CELL_COUNT,
	FREE_CELL_COUNT,
	abilityUsable,
	afflictionTargets,
	armedClick,
		armedDrop,

	attackPreview,
	attackWith,
	healPreview,
	bossSlain,
	bossUnlocked,
	canBuildOn,
	canSendHome,
	carriesPower,
	cellCardMovable,		cellTopWounded,
	chipBoundary,
	convertibleCell,
	withSyntheticLoadout,
	hasGlyph,
	hasPassive,
	newlyHealed,
	newlyWounded,
	createTombState,
	currentLevel,
	levelUpGraves,
	difficultyOf,
	emptyCells,
	hp,
	cellCards,
	draftAbility,
	stoneCell,
	maxHp,
	moveCapacity,
	woundedCards,
	isFaceDown,
	revealFaceDown,
	unpick,
	disarm,
	kingsHome,
	playerLevel,
	tombExit,
	tombMove,
	tombTapTargets,
	GOLD_TOTAL,
	goldMultiplier,
	goldScore,
	goldValue,
	reserveCell,
	reserveHeld,
	trueBossKill,
	trueClear,
	tombGold,
	parCleared,
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
	/** Size of the deal: 7 pockets on the baseline, 6 on a legacy hard deal. */
	cellCount?: number;
	/** The extra pocket Stout opened: the deal was dealt one wider than the track. */
	stout?: boolean;
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
	cellCount = TOMB_CELL_COUNT,
	stout = false,
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

	const game = new FreeCell({ cellCount, cascadeCount: 8, cards });
	return {
		game,
		seed: 1,
		hidden,
		draft,
		bossId: boss ?? null,
		bossSuit: boss ? byId.get(boss)!.suit : null,
		exhausted: Array.from({ length: cellCount }, (_, i) => exhausted.includes(i)),
		wounded: Array.from({ length: cellCount }, (_, i) => (wounded.includes(i) ? 1 : 0)),
		won: false,
		died: false,
		stout,
		reserveHeld: true,
		trueBoss: false,
		score: null,
		armed: null,
		itemWindow: null,
		synthetic: null,
	};
}

const cascade = (column: number, card = 0) => ({ fixture: 'cascade' as const, data: [column, card] });
const cell = (index: number) => ({ fixture: 'cell' as const, data: [index] });

describe('synthetic loadouts', () => {
	const deal = (state: TombState) =>
		state.game.cards
			.map((card) => `${shorthandCard(card)}@${card.location.fixture}${card.location.data.join('.')}`)
			.sort()
			.join(' ');
	const cellsHeld = (state: TombState) => state.draft.map((entry) => `${entry.cell}:${entry.id}`).join(' ');

	test('pins the party without moving a single card of the deal', () => {
		const state = createTombState(4242, FREE_CELL_COUNT.med);
		const pinned = withSyntheticLoadout(state, 'ssss');

		// the deal is the deal: same positions, same fog, same boss, and the same four cards in the cells
		expect(deal(pinned)).toBe(deal(state));
		expect(pinned.hidden).toEqual(state.hidden);
		expect(pinned.bossId).toBe(state.bossId);
		expect(cellsHeld(pinned)).toBe(cellsHeld(state));

		// and those cells now confer the pinned abilities
		expect(pinned.draft.map((entry) => entry.suit)).toEqual(['spades', 'spades', 'spades', 'spades']);
		expect(pinned.draft.map((entry) => entry.name)).toEqual(['Dwarf', 'Fighter', 'BYSSEPS', 'Purity']);
		expect(hasPassive(pinned, 'Dwarf')).toBe(true);
		expect(hasPassive(pinned, 'Fighter')).toBe(true);
	});

	test('a wildcard leaves that role exactly as the deal drafted it', () => {
		const dealt = createTombState(4242, FREE_CELL_COUNT.med);
		const pinned = withSyntheticLoadout(dealt, 'h***');

		// the kin is the pin, and the class, glyph and item are the deal's own
		expect(pinned.draft[0]).toMatchObject({ role: 'kin', suit: 'hearts', name: 'Human' });
		pinned.draft.slice(1).forEach((entry, index) => expect(entry).toEqual(dealt.draft[index + 1]));
		expect(pinned.synthetic).toEqual({ kin: 'hearts' });

		// and the board is still the deal's
		expect(pinned.bossId).toBe(dealt.bossId);
		expect(pinned.hidden).toEqual(dealt.hidden);
	});

	test('a restocked slot keeps the pinned suit rather than the fed card’s', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '3H', suit: 'hearts', name: 'Priest', text: '' },
			{ cell: 2, role: 'consumable', id: '2C', suit: 'clubs', name: 'Elixir', text: '' },
		];
		// a plain diamond waits in the last cell: feeding takes a card off the board, not another item
		const state = withSyntheticLoadout(
			makeTomb({ columns: [['5D']], cells: ['3H', null, '2C', '9D'], foundations: ['AC'], draft }),
			// diamonds for the class, so the party is a Thief, and clubs for the item, so the pin is testable
			'*d*c'
		);

		// the item beside the chip goes to the crypt, which is the one trip that restocks its pocket
		const played = attackWith(state, cell(2))!;
		expect(played.itemWindow).toEqual({ cell: 2, role: 'consumable', suit: 'clubs', takes: 'any' });

		// a diamond fills the pocket, and it becomes the pinned clubs item, not its own suit's
		const fed = tombMove(played, cascade(0), cell(2))!;
		expect(fed.draft.find((entry) => entry.cell === 2)).toMatchObject({ suit: 'clubs', name: 'Elixir' });
	});
});

describe("the wizard's affinity", () => {
	// Arcana superseded it: the item pocket spells from its own suit now, so a free cast after a refresh
	// was the same grant twice over, and it was the one rule the card never said out loud.
	test('a refresh mends the glyph and gives nothing else', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Wizard', text: '' },
			{ cell: 1, role: 'glyph', id: '2S', suit: 'spades', name: 'BYSSEPS', text: '' },
			{ cell: 2, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
		];
		const state = makeTomb({
			columns: [['5H'], ['9D']],
			cells: ['KC', '2S', '5C'],
			draft,
			exhausted: [1],
			hidden: ['5H'],
			// Arcana is off while the Wizard is face down, so the pocket is the Elixir it was dealt as
			// rather than the clubs spell his standing turns it into
			wounded: [0],
		});
		const refreshed = useAbility(state, 2)!;
		expect(refreshed.exhausted[1]).toBe(false);

		// the very next cast still costs its exhaustion: the window is gone
		const cast = useAbility(refreshed, 1)!;
		expect(cast.armed).toMatchObject({ kind: 'sack' });
		expect(cast.exhausted[1]).toBe(true);
	});
});

describe('an armed spell', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Fighter', text: '' },
		{ cell: 1, role: 'consumable', id: '5C', suit: 'clubs', name: 'Remedy', text: '' },
		{ cell: 2, role: 'glyph', id: '2S', suit: 'spades', name: 'BYSSEPS', text: '' },
	];
	// the track pays a blow from the right edge inward, so the rightmost cell is the one that breaks
	const board = (extra: Partial<Setup> = {}) =>
		makeTomb({ columns: [['2H']], cells: ['KC', '5C', '2S'], foundations: ['AH'], draft, ...extra });

	test('a wound puts the spell down, and putting it down gives it back', () => {
		const armed = useAbility(board(), 2)!;
		expect(armed.armed).toMatchObject({ kind: 'sack' });

		// a 2 is one rank over a level-1 delver, so this kill costs the rightmost cell a heart
		const struck = attackWith(armed, cascade(0, 0))!;
		expect(struck.wounded[2]).toBe(1);
		expect(struck.armed).toBe(null);
		// knocked out of hand reads as a misclick: the spell is unspent, exactly as a disarm leaves it
		expect(struck.exhausted[2]).toBe(false);
	});

	test('a wizard’s spell knocked out of hand keeps the wound that did it', () => {
		const wizard = draft.map((entry) => (entry.role === 'class' ? { ...entry, name: 'Wizard' } : entry));
		const armed = useAbility(board({ draft: wizard }), 2)!;

		const struck = attackWith(armed, cascade(0, 0))!;
		expect(struck.armed).toBe(null);
		// the blow that interrupted the cast still stands, and the cast is unspent
		expect(struck.wounded[2]).toBe(1);
		expect(struck.exhausted[2]).toBe(false);
	});

	test('the board never holds an arm it has already refused', () => {
		const struck = attackWith(useAbility(board(), 2)!, cascade(0, 0))!;

		expect(abilityUsable(struck, 2)).toBe(false);
		// the whole point: no armed slot pointing at a cell abilityUsable says no to
		expect(struck.armed === null || abilityUsable(struck, struck.armed.cell)).toBe(true);
	});
});

describe('a club going home', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Wizard', text: '' },
		{ cell: 1, role: 'glyph', id: '2S', suit: 'spades', name: 'BYSSEPS', text: '' },
		{ cell: 2, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
	];

	test("does not refresh the wizard's glyph", () => {
		const state = makeTomb({
			columns: [['2C'], ['9D']],
			cells: ['KC', '2S', '5C'],
			foundations: ['AC'],
			draft,
			exhausted: [1],
		});
		// the ace's own pile is the clubs foundation: play the two there
		const home = state.game.cards.find((card) => shorthandCard(card) === 'AC')!.location;
		const next = tombMove(state, cascade(0, 0), home)!;

		// the glyph only comes back on a level up or an Elixir, never because a club went home
		expect(next.exhausted[1]).toBe(true);
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

	describe('the grave a level up waits behind', () => {
		test('is the lowest grave, empty ones included', () => {
			// three aces home and diamonds still empty: the ace of diamonds is the level up
			const state = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', 'AH', 'AC'] });
			expect(levelUpGraves(state)).toEqual(['diamonds']);

			// with all four aces home the bottom is a tie, and one card lifts nobody
			const tied = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', 'AH', 'AC', 'AD'] });
			expect(levelUpGraves(tied)).toEqual([]);
		});

		test('leaves a human the second lowest, since he ignores the first', () => {
			const human: DraftCard[] = [{ cell: 0, role: 'kin', id: 'KC', suit: 'clubs', name: 'Human', text: '' }];
			// an empty spades grave, then hearts one, clubs two, diamonds three
			const board = { columns: [['5D']], cells: ['KC'], foundations: ['AH', '2C', '3D'] };
			// everyone else is held back by the empty grave; he already ignores it, so hearts is his
			expect(levelUpGraves(makeTomb(board))).toEqual(['spades']);
			expect(levelUpGraves(makeTomb({ ...board, draft: human }))).toEqual(['hearts']);
		});

		test('follows the next card home over a card the tomb drafted', () => {
			// clubs sits on its ace with the tomb's own two drafted, so the card that can come home there is
			// the three. Read off the lowest grave, that club lifts it; a Human ignores that grave and is held
			// by the diamond's two, so the diamond's three lifts him as well.
			const glyph: DraftCard = { cell: 1, role: 'glyph', id: '2C', suit: 'clubs', name: 'PISORF', text: '' };
			const human: DraftCard = { cell: 0, role: 'kin', id: '9H', suit: 'hearts', name: 'Human', text: '' };
			const board = { columns: [['3C', '8D']], cells: ['9H', '2C'], foundations: ['5S', '5H', 'AC', '2D'] };
			expect(levelUpGraves(makeTomb({ ...board, draft: [glyph] }))).toEqual(['clubs']);
			expect(levelUpGraves(makeTomb({ ...board, draft: [human, glyph] }))).toEqual(['clubs', 'diamonds']);
		});
	});

	describe("the human's level", () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'KC', suit: 'clubs', name: 'Human', text: '' }];

	test('ignores the lowest card, so one lagging suit does not hold him back', () => {
		const board = { columns: [['5D']], cells: ['KC'], foundations: ['AS', '2S', '2H', '2C'] };
		expect(currentLevel(makeTomb(board))).toBe(1);
		// the lagging diamonds pile is ignored: three suits at their two read as level 3 to him
		expect(currentLevel(makeTomb({ ...board, draft }))).toBe(3);
	});

	test('starts at level 1 with nothing home, and all four aces lift him too', () => {
		expect(currentLevel(makeTomb({ columns: [['5D']], cells: ['KC'], draft }))).toBe(1);
		const aces = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', 'AH', 'AC', 'AD'], draft });
		// one rank every suit has cleared, so there is no lagging pile left for him to ignore
		expect(currentLevel(aces)).toBe(2);
	});

			test('a wounded human loses the trait', () => {
		const state = makeTomb({ columns: [['5D']], cells: ['KC'], foundations: ['AS', '2S', '2H', '2C'], draft, wounded: [0] });
		expect(currentLevel(state)).toBe(1);
	});
});

describe('conversion order', () => {
	test('the chip starts between the party and the plain free cells', () => {
		const med = createTombState(4242, FREE_CELL_COUNT.med);
		const hard = createTombState(4242, FREE_CELL_COUNT.hard);
		[med, hard].forEach((state) => {
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
		// no Thief in the party, so the window still wants the suit it lost
		expect(next!.itemWindow).toEqual({ cell: 1, role: 'class', suit: 'clubs', takes: 'same' });
		expect(chipBoundary(next!)).toBe(2);
		expect(cellCardMovable(next!, 0)).toBe(true);
	});

	test('the chip holds while a refill window is open, then steps left', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '4C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 3, role: 'consumable', id: '5S', suit: 'spades', name: 'Potion', text: '' },
		];
		// five hearts on the track, so the five of spades can be paid for on its way home
		const state = makeTomb({
			columns: [['6H'], ['3S']],
			cells: ['4C', '2H', '3C', '5S', '7D', '8D', '9D'],
			foundations: ['4S'],
			draft,
			hidden: ['3S'],
		});
		expect(chipBoundary(state)).toBe(4);

		// the potion goes home: its slot waits one action, but the chip has not moved yet
		const played = attackWith(state, cell(3))!;
		expect(played.itemWindow).toEqual({ cell: 3, role: 'consumable', suit: 'spades', takes: 'same' });
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
		expect(home.itemWindow).toEqual({ cell: 0, role: 'glyph', suit: 'spades', takes: 'same' });
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

describe('mana burn and mug', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' },
		{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
	];
	const board = (overrides: Partial<Setup> = {}) =>
		makeTomb({
			columns: [['4D']],
			cells: ['TC', 'TS', 'KD', 'QD'],
			foundations: ['3D'],
			draft,
			boss: 'KD',
			...overrides,
		});

	test('a Wraith kill spends and wounds the Glyph before the damage lands', () => {
		// one heart has to be left standing, so this kill runs a rank below the deadly one
		const state = board({ columns: [['3D']], foundations: ['2D'] });
		expect(currentLevel(state)).toBe(1);
		expect(hp(state)).toBe(4);

		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(2);
		expect(preview.locks).toContain(1);

		const next = attackWith(state, cascade(0, 0))!;
		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
		expect(abilityUsable(next, 1)).toBe(false);
		// one heart for the glyph, then the kill's own two, paid from the right edge inward
		expect(next.wounded).toEqual([0, 1, 1, 1, 0, 0, 0]);
		expect(hp(next)).toBe(1);
	});

	test('a kill that would spend the last heart is refused', () => {
		// one heart left, and the Wraith wants its glyph burned on top of its three damage
		const state = board({ wounded: [1, 2, 3] });
		expect(currentLevel(state)).toBe(1);
		expect(hp(state)).toBe(1);

		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(3);
		expect(preview.legal).toBe(false);
		// the empty cell that has to take a card first, so the track can absorb the wounds
		expect(preview.need).toContain(4);
		expect(preview.wounds).toEqual([]);
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});

	test('an already spent Glyph is still burned', () => {
		const state = board({ exhausted: [1], columns: [['3D']], foundations: ['2D'] });
		const next = attackWith(state, cascade(0, 0))!;

		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
	});

	test('the aura wound is owed on top, so a kill one HP short is refused', () => {
		const state = board({
			cells: ['TC', 'TS', 'KD'],
			wounded: [2],
			draft: [{ cell: 0, role: 'glyph', id: 'TC', suit: 'clubs', name: 'PISORF', text: '' }],
		});
		expect(hp(state)).toBe(2);

		// three damage plus the burned glyph
		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.legal).toBe(false);
		expect(preview.reason).toContain('needs 4 wounds');
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

	test('parking a Gorgon in a free cell stones the kin, and leaves the class and item alone', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Wizard', text: '' },
			{ cell: 2, role: 'glyph', id: '5S', suit: 'spades', name: 'BYSSEPS', text: '' },
			{ cell: 3, role: 'consumable', id: '6S', suit: 'spades', name: 'Potion', text: '' },
		];
		const state = makeTomb({
			columns: [['4C']],
			cells: ['2C', '3C', '5S', '6S', '7C', '8C', null],
			boss: 'KC',
			draft,
		});
		const before = hp(state);
		const next = tombMove(state, cascade(0, 0), cell(6))!;

		expect(shorthandCard(next.game.cells[6]!)).toBe('4C');
		expect(next.exhausted[3]).toBe(false);
		expect(next.draft).toHaveLength(4);
		// one affliction takes one card: the kin turns, and the class waits for the next gorgon
		expect(next.wounded).toEqual([1, 0, 0, 0, 0, 0, 0]);
		// the parked card is a fresh heart and the gaze spends it again
		expect(hp(next)).toBe(before);
	});

	test('parking a Wraith in a free cell burns the Glyph too', () => {
		const state = board({ columns: [['4D']], foundations: ['3D'], boss: 'KD' });
		const next = tombMove(state, cascade(0, 0), cell(4))!;

		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
		expect(next.exhausted[0]).toBe(false);
	});

	test('sending a boss-suit minion home from the tableau sets its power off', () => {
		const state = board({ columns: [['3D']], foundations: ['2D'] });
		const next = tombMove(state, cascade(0, 0), { fixture: 'foundation', data: [0] })!;

		expect(next.exhausted[1]).toBe(true);
		expect(next.wounded[1]).toBe(1);
	});

	test('the card that restocks a spent slot becomes the item, and nothing drains it on the way in', () => {
		const state = makeTomb({
			columns: [['4C']],
			cells: [null, 'TS', 'KD', 'QD'],
			draft: [{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }],
			boss: 'KS',
		});
		const feeding = {
			...state,
			itemWindow: { cell: 0, role: 'consumable' as const, suit: 'clubs' as const, takes: 'any' as const },
		};

		const next = tombMove(feeding, cascade(0, 0), cell(0))!;
		expect(next.draft.find((entry) => entry.cell === 0)?.role).toBe('consumable');
		expect(next.exhausted[0]).toBe(false);
		expect(next.wounded[0]).toBe(0);
	});

	test('a level up lifts the burn the same kill dealt, so the glyph ends ready', () => {
		// The third suit reaching three is the level up; the diamonds three is a Wraith, so one kill
		// both burns the glyph and levels the delver up. The power resolves first and the level up
		// after it, the way a level up in DD clears the ailment that was just laid on you.
		const state = board({
			columns: [['3D']],
			cells: ['TC', 'TS', 'KS', 'QS'],
			foundations: ['3S', '3H', '2D', '3C'],
			exhausted: [1],
			boss: 'KD',
		});
		expect(currentLevel(state)).toBe(3);

		const next = attackWith(state, cascade(0, 0))!;
		expect(currentLevel(next)).toBe(4);
		// the burn landed, then the level up mended and refreshed it
		expect(next.exhausted[1]).toBe(false);
		expect(next.wounded[1]).toBe(0);
		expect(abilityUsable(next, 1)).toBe(true);

		// the same kill without the level up leaves the glyph exactly as the Wraith left it, so the
		// burn is really what the level up lifted, not something it never happened to take
		const noLevel = board({
			columns: [['3D']],
			cells: ['TC', 'TS', 'KS', 'QS'],
			foundations: ['3S', '3H', '2D', '2C'],
			exhausted: [1],
			boss: 'KD',
		});
		expect(currentLevel(noLevel)).toBe(3);
		const burned = attackWith(noLevel, cascade(0, 0))!;
		expect(currentLevel(burned)).toBe(3);
		expect(burned.exhausted[1]).toBe(true);
	});

	test('a burned glyph a level up does not mend stays locked, so it cannot be cast', () => {
		// The track already has a wound to the left, so the level up's one heal leaves the glyph
		// face-down: the exhaustion is gone, but the ability is still not there to use.
		const state = board({
			columns: [['3D']],
			cells: ['TC', 'TS', 'KS', 'QS'],
			foundations: ['3S', '3H', '2D', '3C'],
			exhausted: [1],
			wounded: [0],
			boss: 'KD',
		});

		const next = attackWith(state, cascade(0, 0))!;
		expect(currentLevel(next)).toBe(4);
		expect(next.exhausted[1]).toBe(false);
		expect(next.wounded[1]).toBe(1);
		expect(abilityUsable(next, 1)).toBe(false);
	});

	test('mug needs a free pocket to its right, and leaves the item when the row is full', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({
			columns: [['5S']],
			cells: ['TC', '2C', '3C', '4C', '6C', '7C', '8C'],
			foundations: ['4S'],
			boss: 'KS',
			draft,
		});
		const next = attackWith(state, cascade(0, 0))!;

		// there is nowhere to put it, so the item keeps its slot: the pockets are the price, and there are none
		expect(next.draft).toHaveLength(1);
		expect(shorthandCard(next.game.cells[0]!)).toBe('TC');
	});

	test('a Wizard\'s Arcana glyph is mugged out of the item slot like an item', () => {
		// the class card sits left of the item, so the item slot is still the slot beside the chip
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: 'TD', suit: 'diamonds', name: 'Wizard', text: '' },
			{ cell: 2, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' },
		];
		const state = makeTomb({
			columns: [['5S']],
			cells: ['TD', '3C', 'TC', null],
			foundations: ['4S', '4H', '4D', '4C'],
			boss: 'KS',
			draft,
		});
		const next = attackWith(state, cascade(0, 0))!;

		// the slot is the slot whatever it holds: one entry leaves, the class card stays
		expect(next.draft.map((entry) => entry.role)).toEqual(['class']);
		expect(shorthandCard(next.game.cells[3]!)).toBe('TC');
	});

	test('an armed Remedy covers a mugging, so the item keeps its slot', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Remedy', text: '' },
			{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		];
		const state = makeTomb({
			columns: [['5S']],
			cells: ['TC', 'TS', '3C', null],
			foundations: ['4S', '4H', '4D', '4C'],
			boss: 'KS',
			draft,
		});
		const armed = useAbility(state, 0)!;
		const next = attackWith(armed, cascade(0, 0))!;

		// the glyph is the item slot's card, and the Remedy covering the kill keeps it there
		expect(next.draft).toHaveLength(2);
		expect(shorthandCard(next.game.cells[1]!)).toBe('TS');
		// the arm was spent covering the kill
		expect(next.armed).toBe(null);
	});

	test('a converted glyph is not there to burn, so the kill costs only its damage', () => {
		const state = board({ draft: [] });
		const preview = attackPreview(state, cascade(0, 0));
		expect(preview.damage).toBe(3);
		expect(preview.legal).toBe(true);

		const next = attackWith(state, cascade(0, 0))!;
		// nothing is drained: the three damage is the whole bill
		expect(next.wounded.reduce((total, count) => total + count, 0)).toBe(3);
		expect(next.exhausted.some(Boolean)).toBe(false);
		expect(hp(next)).toBe(1);
	});
});

describe('purity', () => {
	const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: '9S', suit: 'spades', name: 'Purity', text: '' }];
	// Two hallways, and the boss is buried in the second: the spell fogs cards, not the dungeon's king.
	const board = () =>
		makeTomb({ columns: [['5C', '4C'], ['9D'], ['KH', '4D']], cells: ['9S', '2D', '3D'], draft, boss: 'KH' });

	test('turns a whole hallway to fog, and the boss is not a card it can touch', () => {
		const state = board();
		const primed = useAbility(state, 0)!;
		expect(primed.armed).toMatchObject({ kind: 'purity' });

		const fogged = armedClick(primed, cascade(0))!;
		expect(fogged.armed).toBe(null);
		expect(fogged.hidden).toEqual(expect.arrayContaining(['5C', '4C']));
		expect(fogged.exhausted[0]).toBe(true);

		// the boss keeps his face, and only the card above him turns
		const bossHall = armedClick(useAbility(board(), 0)!, cascade(2))!;
		expect(bossHall.hidden).toContain('4D');
		expect(bossHall.hidden).not.toContain('KH');
	});

	test('a hallway that is already fog pays nothing and is refused', () => {
		const state = makeTomb({ columns: [['5C']], cells: ['9S', '2D'], draft, hidden: ['5C'] });
		expect(armedClick(useAbility(state, 0)!, cascade(0))).toBe(null);
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
		const kill = board({ columns: [['3D']], foundations: ['2D'], boss: 'KD' });
		// without the remedy the Wraith would burn the Glyph before the wounds land
		expect(attackPreview(kill, cascade(0, 0)).locks).toContain(1);

		const armed = useAbility(kill, 0)!;
		const preview = attackPreview(armed, cascade(0, 0));
		expect(preview.legal).toBe(true);
		expect(preview.fatal).toBe(false);
		expect(preview.locks).not.toContain(1);

		const next = attackWith(armed, cascade(0, 0))!;
		expect(next.wounded[1]).toBe(0);
		// the action it covered is what exhausts it
		expect(next.exhausted[0]).toBe(true);
		expect(next.armed).toBe(null);
	});

	test('a minion parked in a free cell is covered too', () => {
		// unarmed, the Wraith burns the Glyph even when the card is only going to a cell
		const parking = board({ columns: [['4D']], boss: 'KD' });
		const plain = tombMove(parking, cascade(0, 0), cell(4))!;
		expect(plain.wounded[1]).toBe(1);

		const armed = useAbility(parking, 0)!;
		const next = tombMove(armed, cascade(0, 0), cell(4))!;
		expect(next.wounded[1]).toBe(0);
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
	test('drafts four cards in role order and deals the rest under fog', () => {
		const state = createTombState(1234);
		expect(state.draft.map((entry) => entry.role)).toEqual(['kin', 'class', 'glyph', 'consumable']);
		// the roles are independent, so suits may repeat: some seeds deal a party with a doubled suit
		const parties = Array.from({ length: 60 }, (_, index) =>
			createTombState(index + 1).draft.map((entry) => entry.suit)
		);
		expect(parties.some((suits) => new Set(suits).size < 4)).toBe(true);
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

	test('fewer free cells never touch the deal', () => {
		const med = createTombState(1234, FREE_CELL_COUNT.med);
		const hard = createTombState(1234, FREE_CELL_COUNT.hard);

		// four drafted items plus 3 / 2 free cells, and the HP pool is the whole track
		expect([med, hard].map((state) => state.game.cells.length)).toEqual([7, 6]);
		expect([med, hard].map(maxHp)).toEqual([7, 6]);
		expect(hard.exhausted).toHaveLength(6);
		expect(hard.wounded).toHaveLength(6);

		// the seed alone decides the cards, so every difficulty shows the same deal and fog
		const layout = (state: TombState) =>
			state.game.tableau.map((column) => column.map(shorthandCard).join(' '));
		expect(layout(hard)).toEqual(layout(med));

		[med, hard].forEach((state) => {
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
	test('a kill costs enemy rank minus level, in full, paid from the right edge', () => {
		const state = makeTomb({
			columns: [['4H'], [], [], [], [], [], [], []],
			cells: ['2C', '3C', '4C', '6C', null, null, null],
			foundations: ['3H', 'AS'],
		});
		expect(currentLevel(state)).toBe(1);

		// rank four against a level one delver is three, and med pays all three
		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(3);
		expect(preview.locks).toEqual([3, 2, 1]);

		const next = attackWith(state, cascade(0))!;
		expect(next.game.foundations.some((card) => card && shorthandCard(card) === '4H')).toBe(true);
		expect(hp(next)).toBe(1);
	});

	test('a kill you cannot pay for is refused and names the empty cells', () => {
		// one heart on the track, and the cheapest kill is two
		const state = makeTomb({ columns: [['4H']], cells: ['2C'], foundations: ['3H', 'AS'] });
		expect(hp(state)).toBe(1);
		const preview = attackPreview(state, cascade(0));
		expect(preview.legal).toBe(false);
		expect(preview.need).toContain(1);
		expect(attackWith(state, cascade(0))).toBe(null);
	});

	test('parking a bandit in a free cell mugs the item, and costs no heart', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: '2C', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({
			columns: [['5S']],
			cells: ['2C', '3C', '4C', '6C', '7C', null, null],
			boss: 'KS',
			draft,
		});
		expect(hp(state)).toBe(5);

		const parked = tombMove(state, cascade(0, 0), cell(5))!;
		// the parked card is a fresh heart on the track, and Mug takes no heart at all
		expect(hp(parked)).toBe(6);
		// the item left its slot for the first free pocket along — past the card just parked — and the
		// slot converted behind it, so nothing is left waiting to remake it
		expect(parked.draft).toHaveLength(0);
		expect(parked.game.cells[0]).toBe(null);
		expect(shorthandCard(parked.game.cells[6]!)).toBe('2C');
		expect(parked.itemWindow).toBe(null);

		// a minion of another suit parks for free and touches nothing
		const other = makeTomb({ columns: [['5H']], cells: ['2C', '3C', '4C', '6C', '7C', null, null], boss: 'KS', draft });
		const otherParked = tombMove(other, cascade(0, 0), cell(5))!;
		expect(otherParked.draft).toHaveLength(1);
		expect(hp(otherParked)).toBe(6);
	});

	test('stone gaze stones the kin instead of adding a rank to the kill', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2S', suit: 'spades', name: 'Dwarf', text: '' },
			{ cell: 1, role: 'class', id: '2H', suit: 'hearts', name: 'Priest', text: '' },
			{ cell: 2, role: 'glyph', id: '2D', suit: 'diamonds', name: 'CYDSTEPP', text: '' },
			{ cell: 3, role: 'consumable', id: '2C', suit: 'clubs', name: 'Elixir', text: '' },
		];
		// level four, so a four of clubs is free and the gaze adds nothing to the blow
		const state = makeTomb({
			columns: [['4C'], ['4H']],
			cells: ['2S', '2H', '2D', '2C', '7C', '8C', null],
			foundations: ['3S', '3H', '3D', '3C'],
			boss: 'KC',
			draft,
		});
		expect(currentLevel(state)).toBe(4);
		expect(attackPreview(state, cascade(0)).damage).toBe(0);
		// the same rank in another suit costs nothing at all
		expect(attackPreview(state, cascade(1)).damage).toBe(0);

		// the gaze is one card and not a wound on the blow: the kin turns, and the red preview says nothing
		expect(attackPreview(state, cascade(0)).wounds).toEqual([]);

		// the kill's own bill is free, and one passive turns: the kin, stopping short of the class
		const next = attackWith(state, cascade(0))!;
		expect(next.wounded).toEqual([1, 0, 0, 0, 0, 0, 0]);
		expect(hasPassive(next, 'Dwarf')).toBe(false);
		expect(hasPassive(next, 'Priest')).toBe(true);
	});

	test('a gaze is paid like any other wound: no spare heart, no kill', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Wizard', text: '' },
		];
		const state = makeTomb({
			columns: [['5C']],
			cells: ['2C', '3C'],
			foundations: ['4S', '4H', '4D', '4C'],
			boss: 'KC',
			draft,
			wounded: [0],
		});
		expect(hp(state)).toBe(1);
		const preview = attackPreview(state, cascade(0, 0));
		// the blow is free at level five, but the gaze takes the last passive standing and needs one to spare
		expect(preview.damage).toBe(0);
		expect(preview.legal).toBe(false);
		expect(preview.reason).toContain('needs 1 wounds');
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});

	test('a gaze has nothing to take from a party already wounded', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Wizard', text: '' },
		];
		const state = makeTomb({
			columns: [['5C'], ['6H']],
			cells: ['2C', '3C', '9C', '7C', '8C'],
			foundations: ['4S', '4H', '4D', '4C'],
			boss: 'KC',
			draft,
			wounded: [0, 1],
		});
		expect(hp(state)).toBe(3);
		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(0);
		expect(preview.wounds).toEqual([]);
		// the window is spent: the gaze has no card left to turn, so the free kill is free
		expect(preview.legal).toBe(true);
		expect(attackWith(state, cascade(0))!.wounded).toEqual([1, 1, 0, 0, 0, 0, 0]);
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

	test('no party reaches the boss king before another king is home', () => {
		// A Dwarf used to be the exception; Stout is his pocket now, so the Generals shield the boss too.
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '2D', suit: 'diamonds', name: 'Dwarf', text: '' }];
		const early = makeTomb({ columns: [['KH']], cells: ['2D'], foundations: ['QH'], draft, boss: 'KH' });

		expect(kingsHome(early)).toBe(0);
		expect(canSendHome(early, cascade(0)).legal).toBe(false);

		// and a court card is no cheaper once a king is home: a jack costs its ten, like anyone's
		const face = makeTomb({ columns: [['JC']], cells: ['2D'], foundations: ['TC', 'AD'], draft });
		expect(attackPreview(face, cascade(0)).damage).toBe(10);
	});

	test('bloodthirsty pays only for a kill into the leading grave', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '2D', suit: 'diamonds', name: 'Orc', text: '' }];
		// hearts leads, so the 5 of hearts is worth the bounty
		const leading = makeTomb({ columns: [['5H']], foundations: ['4H', '3S'], draft });
		expect(attackPreview(leading, cascade(0)).damage).toBe(0);

		// spades is further along, so the same kill pays the full four
		const behind = makeTomb({ columns: [['5H']], foundations: ['4H', '8S'], draft });
		expect(attackPreview(behind, cascade(0)).damage).toBe(4);
	});

	test('bloodthirsty needs the outright lead, and a finished grave still leads', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '2D', suit: 'diamonds', name: 'Orc', text: '' }];

		// level with spades is not a lead: the tie pays the four
		const tied = makeTomb({ columns: [['5H']], foundations: ['4H', '4S'], draft });
		expect(attackPreview(tied, cascade(0)).damage).toBe(4);

		// a king on top out-ranks hearts, so the run has no leader left and the kill pays its four
		const finished = makeTomb({ columns: [['5H']], foundations: ['4H', 'KS'], draft });
		expect(attackPreview(finished, cascade(0)).damage).toBe(4);

		// two finished graves only make it worse: nothing can climb back over a king
		const donePiles = makeTomb({ columns: [['5H']], foundations: ['4H', 'KD', 'KC'], draft });
		expect(attackPreview(donePiles, cascade(0)).damage).toBe(4);
	});

	test('the boss king is shielded until a General lies in a grave', () => {
		const early = makeTomb({ columns: [['KH']], foundations: ['QH'], boss: 'KH' });
		expect(kingsHome(early)).toBe(0);
		expect(bossUnlocked(early)).toBe(false);
		expect(canSendHome(early, cascade(0)).legal).toBe(false);
		expect(canSendHome(early, cascade(0)).reason).toContain('Generals has to fall first');
		// frozen means no method at all, not just the foundation
		expect(tombMove(early, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })).toBe(null);

		const unlocked = makeTomb({ columns: [['KH']], foundations: ['QH', 'KS'], boss: 'KH' });
		expect(kingsHome(unlocked)).toBe(1);
		expect(bossUnlocked(unlocked)).toBe(true);
		expect(canSendHome(unlocked, cascade(0)).legal).toBe(true);
		// Invulnerable is gone; Indomitable is not — a General's fall opens the blade, never the hand.
		expect(tombMove(unlocked, { fixture: 'cascade', data: [0, 0] }, { fixture: 'cascade', data: [1, 0] })).toBe(null);
	});
});

	describe('tombcrawl a boss king behind a glyph', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BYSSEPS', text: '' }];
	const board = () => makeTomb({ columns: [['KH'], []], foundations: ['QH'], draft: glyph, boss: 'KH' });
	const stepper: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2H', suit: 'hearts', name: 'CYDSTEPP', text: '' }];

	test('a fallen General opens the blade and leaves the hand shut', () => {
		// A king is home, so the boss is no longer invulnerable — and still not something a hand moves.
		const open = makeTomb({ columns: [['KH'], []], foundations: ['QH', 'KS'], boss: 'KH' });
		expect(canSendHome(open, cascade(0)).legal).toBe(true);
		expect(tombMove(open, cascade(0), cascade(1))).toBe(null);
		expect(tombMove(open, cascade(0), cell(0))).toBe(null);
	});

	test('a boss king at the top of a stack does not take his stack with him', () => {
		// The king is exposed on top of the Queen; neither he nor the card beneath him can be shifted.
		const state = makeTomb({ columns: [['QH', 'KH'], []], foundations: ['KS'], boss: 'KH' });
		expect(tombMove(state, cascade(0, 1), cascade(1))).toBe(null);
		expect(tombMove(state, cascade(0), cascade(1))).toBe(null);
	});

	test('CYDSTEPP sets the king in an empty hallway and is spent doing it', () => {
		const primed = useAbility(
			makeTomb({ columns: [['KH'], [], []], foundations: ['QH'], draft: stepper, boss: 'KH' }),
			0
		)!;
		expect(primed.armed).toMatchObject({ kind: 'cydstepp' });
		// A click picks the king up and a second click names the empty hallway.
		const picked = armedClick(primed, cascade(0))!;
		expect(picked.armed).toMatchObject({ first: 'KH' });
		const setDown = armedClick(picked, cascade(2))!;
		expect(setDown).not.toBe(null);
		expect(setDown.armed).toBe(null);
		expect(shorthandCard(setDown.game.tableau[2][0])).toBe('KH');
	});

	test('no hand shifts it, a movement glyph can, and it stays unkillable', () => {
		expect(tombMove(board(), cascade(0), cascade(1))).toBe(null);

		const shipit = TOMB_RULES.glyphMoveBoss;
		TOMB_RULES.glyphMoveBoss = true;
		try {
			const primed = useAbility(board(), 0)!;
			expect(primed.armed).toMatchObject({ kind: 'sack' });
			const carried = tombMove(primed, cascade(0), cascade(1));
			expect(carried).not.toBe(null);
			expect(shorthandCard(carried!.game.tableau[1][0])).toBe('KH');
			// Carrying the boss is the spell's use even though he rides alone: the arm clears and the
			// glyph stays spent, so no click afterwards hands it back.
			expect(carried!.armed).toBe(null);
			expect(carried!.exhausted[0]).toBe(true);
			// The spell lifted it out of the way; the foundation stays shut until a king is home.
			expect(canSendHome(primed, cascade(0)).legal).toBe(false);
			expect(canSendHome(primed, cascade(0)).reason).toContain('Generals has to fall first');
		} finally {
			TOMB_RULES.glyphMoveBoss = shipit;
		}
	});
});

describe('tombcrawl a wounded card', () => {
	// Seven slots on the baseline, six on a legacy hard deal.
	const board = (cellCount: number) =>
		makeTomb({
			cellCount,
			columns: [['KS'], []],
			cells: ['3C', '9S', '9H', '9D', '8C', '8D'],
			foundations: ['2C'],
			wounded: [1, 0, 0, 0, 0, 0],
		});

	test('a wound has to be healed face up first: the foundation is no way out', () => {
		const state = board(7);
		expect(cellTopWounded(state, 0)).toBe(true);
		// locked against the board, even to an empty column
		expect(tombMove(state, { fixture: 'cell', data: [0] }, cascade(1))).toBe(null);
		// and the kill is not on offer either
		expect(attackPreview(state, { fixture: 'cell', data: [0] })).toMatchObject({ legal: false, reason: 'wounded' });
		expect(attackWith(state, { fixture: 'cell', data: [0] })).toBe(null);
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

		// a card below the pile is no longer refused: it slides in underneath it, whatever it costs
		const under = makeTomb({ columns: [['3H'], ['KS']], cells: ['QC', 'QD', '2C'], foundations: ['5H'] });
		expect(attackPreview(under, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });
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

	test('two drafted cards of one suit pass the pile over both, lowest first', () => {
		const party: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '3C', suit: 'clubs', name: 'Elf', text: '' },
			{ cell: 1, role: 'glyph', id: '5C', suit: 'clubs', name: 'PISORF', text: '' },
		];
		// the pile sits on the two and the three is drafted, so the four is the rank it waits for
		const waiting = makeTomb({
			columns: [['4C'], ['KS']],
			cells: ['3C', '5C'],
			foundations: ['2C'],
			draft: party,
		});
		expect(canSendHome(waiting, cascade(0)).legal).toBe(true);

		// past the four, the drafted five is now the next one, so the six opens over it
		const past = makeTomb({ columns: [['6C'], ['KS']], cells: ['3C', '5C'], foundations: ['4C'], draft: party });
		expect(canSendHome(past, cascade(0)).legal).toBe(true);

		// the two is still out there, so the pile is not waiting for the drafted three yet
		const short = makeTomb({ columns: [['4C'], ['KS']], cells: ['3C', '5C'], foundations: ['AC'], draft: party });
		expect(canSendHome(short, cascade(0)).legal).toBe(false);
	});

	describe('the fighter', () => {
		const fighter: DraftCard[] = [{ cell: 0, role: 'class', id: 'KS', suit: 'spades', name: 'Fighter', text: '' }];

		test('may skip exactly one rank on the way home', () => {
			const skipping = makeTomb({ columns: [['2H']], cells: ['KS'], draft: fighter });
			expect(canSendHome(skipping, cascade(0)).legal).toBe(true);

			const reaching = makeTomb({ columns: [['3H']], cells: ['KS'], draft: fighter });
			expect(canSendHome(reaching, cascade(0)).legal).toBe(false);

			// the gap itself is the Fighter's alone to open
			const plain = makeTomb({ columns: [['2H']], cells: ['KS'] });
			expect(canSendHome(plain, cascade(0)).legal).toBe(false);
		});

				test('may slide a card under a pile that has already passed it', () => {
			const state = makeTomb({ columns: [['3S'], ['6S']], cells: ['KS', '2C', '2D'], foundations: ['5S'], draft: fighter });
			expect(canSendHome(state, cascade(0)).legal).toBe(true);

			const home = attackWith(state, cascade(0))!;
			const spades = home.game.cards.filter(
				(card) => card.suit === 'spades' && card.location.fixture === 'foundation'
			);
			expect(spades.map((card) => shorthandCard(card)).sort()).toEqual(['3S', '5S']);
			// the pile still reads five, so the six is still the card it wants next
			expect(canSendHome(home, cascade(1)).legal).toBe(true);
		});

		test('is not the only delver who may slide a card under', () => {
			const state = makeTomb({ columns: [['3S']], cells: ['KS', '2C', '2D'], foundations: ['5S'] });
			expect(canSendHome(state, cascade(0)).legal).toBe(true);

			const home = attackWith(state, cascade(0))!;
			const spades = home.game.cards
				.filter((card) => card.suit === 'spades' && card.location.fixture === 'foundation')
				.map((card) => shorthandCard(card))
				.sort();
			// the pile still reads five, so a skipped rank is never lost to the rest of the run
			expect(spades).toEqual(['3S', '5S']);
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

				test('a Fighter can skip the missing ace and still reach through the cover', () => {
			const party: DraftCard[] = [
				{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
				{ cell: 1, role: 'class', id: 'KS', suit: 'spades', name: 'Fighter', text: '' },
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

	test('venom turns over the deepest face-down card in the rightmost fogged column, with no heal', () => {
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
		// a card that costs nothing wounds nothing, and venom healed nothing either
		expect(next.wounded[1]).toBe(0);
	});

	test('an off-suit king wears the boss suit power: a spade king venoms in a heart tomb', () => {
		const state = makeTomb({
			columns: [['2C', '8H'], ['KS']],
			cells: ['6S', '2D'],
			foundations: ['QS', 'QH', 'QD', 'QC'],
			hidden: ['2C'],
			boss: 'KH',
		});
		expect(state.bossSuit).toBe('hearts');
		const king = state.game.cards.find((card) => shorthandCard(card) === 'KS')!;
		expect(carriesPower(state, king)).toBe(true);

		const next = attackWith(state, cascade(1, 0))!;
		expect(next.hidden).not.toContain('2C');
	});

	test('no blow has a ceiling on the baseline: every deal pays the whole rank', () => {
		// Spades are away at nine while the other three sit on their aces, so the level lags at two and
		// the ten of spades is worth its whole eight on every deal.
		const board = (cellCount: number) =>
			makeTomb({
				columns: [['TS']],
				cells: ['2C', '3C', '4C', '6C', '7C', '8C'],
				foundations: ['9S', 'AH', 'AD', 'AC'],
				cellCount,
			});
		const med = board(DRAFT_CELL_COUNT + FREE_CELL_COUNT.med);
		const hard = board(DRAFT_CELL_COUNT + FREE_CELL_COUNT.hard);
		expect(currentLevel(med)).toBe(2);
		expect(attackPreview(med, cascade(0)).damage).toBe(8);
		expect(attackPreview(hard, cascade(0)).damage).toBe(8);
	});

	test('a Dwarf’s extra pocket is the easy mode, not another track', () => {
		// seed 3 drafts a Dwarf: eight pockets on the baseline, seven on a legacy hard deal
		const med = createTombState(3, FREE_CELL_COUNT.med);
		const hard = createTombState(3, FREE_CELL_COUNT.hard);
		expect(med.draft[0].name).toBe('Dwarf');
		expect(difficultyOf(med)).toBe('med');
		// hard and med run the same rules, so the smaller Dwarf board reads med too
		expect(difficultyOf(hard)).toBe('med');
		// while a non-Dwarf legacy hard deal still reads hard
		expect(difficultyOf(createTombState(1, FREE_CELL_COUNT.hard))).toBe('hard');
	});

	test('an off-suit king carries the club tomb’s gaze', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Wizard', text: '' },
		];
		const state = makeTomb({
			columns: [['KH']],
			cells: ['2C', '3C', '4C', '6C', '7C', '8C', null],
			foundations: ['QH', 'QS', 'QD', 'QC'],
			boss: 'KC',
			draft,
		});
		const level = currentLevel(state);
		// no extra rank: the king costs 13 - level like any other, and the gaze stones the party
		expect(attackPreview(state, cascade(0)).damage).toBe(Math.max(0, 13 - level));

		const next = attackWith(state, cascade(0))!;
		expect(next.wounded.slice(0, 3)).toEqual([1, 0, 0]);
	});

	test('an off-suit king mugs the consumable in a spade tomb', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: '7C', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({
			columns: [['KH']],
			cells: ['7C', '3C', '4C', '6C', '7D', '8C', null],
			foundations: ['QH', 'QS', 'QD', 'QC'],
			draft,
			boss: 'KS',
		});
		const mugged = attackWith(state, cascade(0, 0))!;
		// the first free pocket to the right of the slot, past the rest of the party
		expect(mugged.draft).toHaveLength(0);
		expect(shorthandCard(mugged.game.cells[6]!)).toBe('7C');
		expect(mugged.exhausted[0]).toBe(false);
	});

	test('a drafted card played out to the board is spent for good', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '8C', suit: 'clubs', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['9H'], ['7S']], cells: ['8C'], draft });
		const next = tombMove(state, cell(0), cascade(0))!;

		// the eight builds on the nine, and the slot it leaves is an ordinary free cell
		expect(shorthandCard(next.game.tableau[0][1]!)).toBe('8C');
		expect(next.game.cells[0]).toBe(null);
		expect(next.draft).toHaveLength(0);
		// nothing waits to remake it: the play out is a conversion, and a lost one
		expect(next.itemWindow).toBe(null);

		const parked = tombMove(next, cascade(1), cell(0))!;
		expect(shorthandCard(parked.game.cells[0]!)).toBe('7S');
		expect(parked.draft).toHaveLength(0);
		expect(abilityUsable(parked, 0)).toBe(false);
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
			// the king is under two exposed pips, so the elf's lane reaches it: the fog above him is
			// what would turn the shot aside, and that is the next test's business
			columns: [['KS', '2C', '3D'], ['4S']],
			cells: ['JC', '9H'],
			hidden: ['KS'],
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

	test('an Elf shoots a buried card home down a lane of number cards', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['2S', '4H', '5D']],
			cells: ['JC', '9H'],
			foundations: ['AS'],
			draft,
		});

		// the two sits under two pips, and the pile is only waiting for it
		const next = attackWith(state, cascade(0, 0));
		expect(next).not.toBeNull();
		expect(next!.game.cards.find((card) => shorthandCard(card) === '2S')!.location.fixture).toBe('foundation');
		expect(next!.game.tableau[0].map((card) => shorthandCard(card))).toEqual(['4H', '5D']);

		// the same shot is not on offer to anyone else
		const human = makeTomb({ columns: [['2S', '4H', '5D']], cells: ['JC', '9H'], foundations: ['AS'] });
		expect(attackWith(human, cascade(0, 0))).toBeNull();
	});

	test('a face card in the lane turns the shot aside, and the fog under it too', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['2S', 'QH', '5D']],
			cells: ['JC', '9H'],
			foundations: ['AS'],
			draft,
		});
		expect(attackWith(state, cascade(0, 0))).toBeNull();

		const fogged = makeTomb({
			columns: [['2S', 'QH', '5D']],
			cells: ['JC', '9H'],
			hidden: ['2S'],
			draft,
		});
		expect(revealFaceDown(fogged, cascade(0, 0))).toBe(null);
	});

	test('the fog a clear lane reaches can be dug out even when buried', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({ columns: [['2S', '4H', '5D']], cells: ['JC', '9H'], hidden: ['2S'], draft });

		const next = revealFaceDown(state, cascade(0, 0));
		expect(next).not.toBeNull();
		expect(next!.hidden).not.toContain('2S');
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

	test('an ace home never levels the delver up: an empty pile already counts as its ace', () => {
		const state = makeTomb({
			columns: [['AD'], ['2D']],
			cells: ['KC', 'QD'],
			foundations: ['AS', 'AH', 'AC'],
		});
		expect(currentLevel(state)).toBe(1);

		// an empty pile has cleared nothing, so the three aces already home hold the level at 1 until
		// the diamonds ace lands: all four aces are the first rank every suit has cleared
		const ace = attackWith(state, cascade(0))!;
		expect(currentLevel(ace)).toBe(2);

		// then every pile has to reach its two, and the diamonds two is the last one left
		const two = attackWith(ace, cascade(1))!;
		expect(currentLevel(two)).toBe(2);
	});

	test('a level up heals and refreshes the glyph', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '4H', suit: 'hearts', name: 'CYDSTEPP', text: '' }];
		const state = makeTomb({
			columns: [['3C'], ['KS']],
			cells: ['4H', '5D'],
			foundations: ['3S', '3H', '3D', '2C'],
			draft,
		});
		expect(currentLevel(state)).toBe(3);

		const armed = useAbility(state, 0)!;
		expect(armed.exhausted[0]).toBe(true);
		expect(armed.armed).toMatchObject({ kind: 'cydstepp' });

		const kill = attackWith(armed, cascade(0))!;
		expect(currentLevel(kill)).toBe(4);
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
			foundations: ['AS', 'AH', 'AD'],
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
			foundations: ['3S', '2H', 'AD', '2C'],
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
		// the card that stood on top of the column is the card the cell offers
		expect(cellCards(state, 1).map(shorthandCard)).toEqual(['7H', '6S']);
		expect(shorthandCard(cellCards(state, 1).at(-1)!)).toBe(shorthandCard(state.game.cells[1]!));
		expect(hp(state)).toBe(3);
		expect(maxHp(state)).toBe(8);
	});

	test('a boss under the pair does not lock the cell above it', () => {
		// the king is the boss and is frozen; the queen that was on top of him is what the cell offers
		const state = makeTomb({ columns: [['KS', 'QH'], ['KC']], cells: ['5C'], boss: 'KS', draft: glyph });
		const armed = useAbility(state, 0)!;
		const shot = armedClick(armedClick(armed, cascade(0, 0))!, cell(1))!;
		expect(cellCards(shot, 1).map(shorthandCard)).toEqual(['KS', 'QH']);
		expect(shorthandCard(shot.game.cells[1]!)).toBe('QH');

		const freed = tombMove(shot, cell(1), cascade(1))!;
		expect(freed).not.toBe(null);
		expect(shorthandCard(freed.game.tableau[1].at(-1)!)).toBe('QH');
		expect(cellCards(freed, 1).map(shorthandCard)).toEqual(['KS']);
	});

	test('damage turns over the bottom card of a stack first', () => {
		const kill = attackWith(stacked(), cascade(2))!; // 3C costs one point at level 2
		expect(kill.wounded[1]).toBe(1);
		expect(hp(kill)).toBe(2);
		expect(woundedCards(kill, 1).map(shorthandCard)).toEqual(['7H']);
	});

	test('the next point of damage turns over the other card', () => {
		const kill = attackWith(stacked(), cascade(1))!; // 4S costs two points at level 2
		expect(kill.wounded[1]).toBe(2);
		expect(hp(kill)).toBe(1);
		expect(woundedCards(kill, 1).map(shorthandCard)).toEqual(['7H', '6S']);
	});

	test('each wounded card in a stack needs its own heal', () => {
		const state = attackWith(stacked(), cascade(1))!;
		const first = revealFaceDown(state, cascade(3))!; // 4H heals the top card first
		expect(first.wounded[1]).toBe(1);
		expect(woundedCards(first, 1).map(shorthandCard)).toEqual(['7H']);
		expect(hp(first)).toBe(2);

		const second = revealFaceDown(first, cascade(4))!; // 5D
		expect(second.wounded[1]).toBe(0);
		expect(hp(second)).toBe(3);
	});

	test('a parked pair sets off the gaze, once for the cast', () => {
		// A Gorgon's tomb: a red king is a lesser gorgon and he is lying on a club queen, one of his own
		// minions, so both cards carry Stone Gaze — and the pair still stones the party once, not twice.
		const party: DraftCard[] = [
			{ cell: 0, role: 'glyph', id: '5C', suit: 'clubs', name: 'PISORF', text: '' },
			{ cell: 1, role: 'kin', id: '7C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 2, role: 'class', id: '8C', suit: 'clubs', name: 'Wizard', text: '' },
		];
		const gorgon = makeTomb({
			columns: [['KH', 'QC'], ['KC'], ['9D'], ['4H']],
			cells: ['5C', '7C', '8C', '9C'],
			boss: 'KC',
			draft: party,
		});
		const armed = useAbility(gorgon, 0)!;
		const parked = armedClick(armedClick(armed, cascade(0, 0))!, cell(4))!;

		expect(cellCards(parked, 4).map(shorthandCard)).toEqual(['KH', 'QC']);
		// one wound, on the kin: a second carrier in the pair adds nothing, and the class waits its turn
		expect(parked.wounded).toEqual([0, 1, 0, 0, 0, 0, 0]);
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
		// the pair keeps its order: 6S stood on 7H, so 6S is the card the cell shows
		expect(spot('7H')).toEqual({ fixture: 'cell', data: [1, 0] });
		expect(spot('6S')).toEqual({ fixture: 'cell', data: [1, 1] });
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
	test('the level is one above the rank every suit has cleared, so the four aces are the first', () => {
		expect(playerLevel(makeTomb({ columns: [['5H']] }).game)).toBe(1);
		// one suit still waiting on its ace has cleared nothing, and it sets the level
		expect(playerLevel(makeTomb({ columns: [['5H']], foundations: ['2S', '2H', '2D'] }).game)).toBe(1);
		expect(playerLevel(makeTomb({ columns: [['5H']], foundations: ['AS', 'AH', 'AD', 'AC'] }).game)).toBe(2);
		// a suit only as far as its ace is not far enough for the next one
		expect(playerLevel(makeTomb({ columns: [['5H']], foundations: ['2S', '2H', '2D', 'AC'] }).game)).toBe(2);
	});
});	describe('tombcrawl CYDSTEPP', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'CYDSTEPP', text: '' }];
	const make = (columns: string[][] = [['3S'], ['9D', '5H'], ['4H']]) =>
		makeTomb({ columns, cells: ['2S', '4C'], draft: glyph, hidden: ['5H'] });

	test('a card can be laid on the fog only while CYDSTEPP is armed', () => {
		const state = make();
		expect(tombMove(state, cell(1), cascade(1))).toBe(null);

		const primed = useAbility(state, 0)!;
		expect(primed.armed).toMatchObject({ kind: 'cydstepp', cell: 0 });
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
		expect(built.armed).toMatchObject({ kind: 'cydstepp' });
	});

	test('a run the free cells can carry is buried whole', () => {
		const state = makeTomb({
			columns: [['9D', '8S', '7D'], ['5H']],
			cells: ['2S'],
			draft: glyph,
			hidden: ['5H'],
		});
		const primed = useAbility(state, 0)!;
		// three cards need two free cells to wait in, and the track has six to spare
		expect(moveCapacity(primed)).toBe(7);

		const buried = tombMove(primed, cascade(0, 0), cascade(1))!;
		const column = buried.game.tableau[1];
		// the fog stays down, buried for good, with the whole run laid over it
		expect(buried.hidden).toContain('5H');
		expect(column.map((card) => shorthandCard(card))).toEqual(['5H', '9D', '8S', '7D']);
		// the play spends the spell
		expect(buried.armed).toBe(null);
		// the arm clears without a wound, and the glyph is spent
		expect(buried.exhausted[0]).toBe(true);
	});

	test('a run too long for the free cells cannot be buried', () => {
		const state = makeTomb({
			columns: [['9D', '8S', '7D'], ['5H']],
			cells: ['2S', '4C', '5D', '9C', '6H', '7S', '8C'],
			draft: glyph,
			hidden: ['5H'],
		});
		const primed = useAbility(state, 0)!;
		// no free cell to wait in: CYDSTEPP buys the fog, not a longer arm
		expect(moveCapacity(primed)).toBe(1);
		expect(tombMove(primed, cascade(0, 0), cascade(1))).toBe(null);
	});

	test('it can also be aimed by clicking a card and then the fog', () => {
		const primed = useAbility(make(), 0)!;
		const picked = armedClick(primed, cascade(0))!;
		expect(picked.armed).toMatchObject({ kind: 'cydstepp', first: '3S' });

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
	// The ace home lets the card beside the chip go home, which is the exit that restocks its slot.
	// Four cards on the track, so the single point that kill costs lands on the right edge and leaves
	// the card the test wants to feed still face up.
	const base = (draft: DraftCard[] = glyph, cells: string[] = ['2S', '4S', '5S', '6S']) =>
		makeTomb({ columns: [['5H'], ['3S'], ['9D', '3H'], ['8S'], ['7C']], cells, foundations: ['AS'], draft });

	test('sending the item home leaves its slot open for one action', () => {
		const next = attackWith(base(), cell(0))!;
		expect(next.draft).toHaveLength(0);
		expect(next.game.cells[0]).toBe(null);
		expect(next.itemWindow).toEqual({ cell: 0, role: 'glyph', suit: 'spades', takes: 'same' });
	});

	test('playing an item out to the board spends it, and opens no window', () => {
		const next = tombMove(base(), cell(0), cascade(2))!;

		expect(shorthandCard(next.game.tableau[2][2]!)).toBe('2S');
		expect(next.game.cells[0]).toBe(null);
		expect(next.draft).toHaveLength(0);
		expect(next.itemWindow).toBe(null);
	});

	test('an item played into a free cell converts, and nothing waits to restock it', () => {
		const draft: DraftCard[] = [{ cell: 1, role: 'glyph', id: 'AC', suit: 'clubs', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['5C']], cells: [null, 'AC', null], draft });
		expect(convertibleCell(state)).toBe(1);
		expect(chipBoundary(state)).toBe(2);

		// the tableau is the scavenging path: a free cell is the conversion the chip counts instead
		const moved = tombMove(state, cell(1), cell(2))!;
		expect(moved.draft).toHaveLength(0);
		expect(moved.itemWindow).toBe(null);
		expect(shorthandCard(moved.game.cells[2]!)).toBe('AC');
		expect(chipBoundary(moved)).toBe(0);
	});

	test('feeding the slot a matching card remakes the very same item', () => {
		const played = attackWith(base(), cell(0))!;
		const refilled = tombMove(played, cascade(1), cell(0))!;

		expect(refilled.itemWindow).toBe(null);
		expect(shorthandCard(refilled.game.cells[0]!)).toBe('3S');
		expect(refilled.draft).toHaveLength(1);
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'BYSSEPS', id: '3S' });
	});

	test('a plain card parked in another free cell can be fed in too', () => {
		const played = attackWith(base(glyph, ['2S', '4S', '5S', '6S']), cell(0))!;
		const refilled = tombMove(played, cell(1), cell(0))!;

		expect(shorthandCard(refilled.game.cells[0]!)).toBe('4S');
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'BYSSEPS', id: '4S' });
	});

	test('the wrong suit is not a feed: it misses and the slot stays a plain free cell', () => {
		const played = attackWith(base(), cell(0))!;
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
		// the glyph sits beside the chip, so it is the one that may go home and open its slot
		const played = attackWith(base(draft, ['5C', '2S', '5S', '6S']), cell(1))!;
		expect(played.itemWindow).toEqual({ cell: 1, role: 'glyph', suit: 'spades', takes: 'same' });

		// any other action closes the window: the plain move into the third free cell is not a feed
		const spent = tombMove(played, cascade(0), cell(4))!;
		expect(spent.itemWindow).toBe(null);
		expect(spent.draft).toHaveLength(1);
	});

	test('a Thief feeds an item pocket a card of any suit, which makes that suit’s item', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '4C', suit: 'clubs', name: 'Thief', text: '' },
			{ cell: 1, role: 'consumable', id: '2S', suit: 'spades', name: 'Purity', text: '' },
		];
		// the spades item goes home, then a heart — the other colour entirely — restocks it
		const played = attackWith(base(draft, ['4C', '2S', '5S', '6S']), cell(1))!;

		expect(played.itemWindow).toEqual({ cell: 1, role: 'consumable', suit: 'spades', takes: 'any' });

		const refilled = tombMove(played, cascade(0), cell(1))!;
		expect(refilled.itemWindow).toBe(null);
		expect(refilled.draft.find((item) => item.cell === 1)).toMatchObject({
			role: 'consumable',
			suit: 'hearts',
			name: 'Potion',
			id: '5H',
		});
	});

	test('a Thief playing an item into the crypt waits for another suit, never the one that left', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '4C', suit: 'clubs', name: 'Thief', text: '' },
			{ cell: 1, role: 'consumable', id: '5S', suit: 'spades', name: 'Purity', text: '' },
		];
		// the spades item is played out onto the six of diamonds: spent, and the pocket waits one action
		const state = makeTomb({ columns: [['6D']], cells: ['4C', '5S', '3H', '9S'], foundations: ['4D'], draft });
		const played = tombMove(state, cell(1), cascade(0))!;

		expect(played.draft.find((item) => item.cell === 1)).toBeUndefined();
		expect(played.itemWindow).toEqual({ cell: 1, role: 'consumable', suit: 'spades', takes: 'other' });
		// the chip holds where it is while the window waits, so the slot is still draftable
		expect(chipBoundary(played)).toBe(2);

		// the suit that just left is the loop the window exists to close: it parks in the pocket instead
		const same = tombMove(played, cell(3), cell(1))!;
		expect(same.itemWindow).toBe(null);
		expect(same.draft.find((item) => item.cell === 1)).toBeUndefined();
		expect(shorthandCard(same.game.cells[1]!)).toBe('9S');

		// a heart, the other colour entirely, restocks it as a heart item
		const refilled = tombMove(played, cell(2), cell(1))!;
		expect(refilled.itemWindow).toBe(null);
		expect(refilled.draft.find((item) => item.cell === 1)).toMatchObject({
			role: 'consumable',
			suit: 'hearts',
			name: 'Potion',
		});
	});

	test('a Thief setting an item down in an empty hallway converts the slot with no window', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '4C', suit: 'clubs', name: 'Thief', text: '' },
			{ cell: 1, role: 'consumable', id: '5S', suit: 'spades', name: 'Purity', text: '' },
		];
		// the second hallway stands empty: the item is set down in the open rather than lost to the crypt
		const state = makeTomb({ columns: [['6D'], []], cells: ['4C', '5S', '3H', '9D'], foundations: ['4D'], draft });
		const played = tombMove(state, cell(1), cascade(1))!;

		expect(played.draft.find((item) => item.cell === 1)).toBeUndefined();
		expect(played.itemWindow).toBe(null);
		// the slot converts like a cell-park: the chip steps past the empty slot
		expect(chipBoundary(played)).toBe(1);
	});

	test('a Thief’s any-suit restock is the item pocket’s alone', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '4C', suit: 'clubs', name: 'Thief', text: '' },
			{ cell: 1, role: 'glyph', id: 'AS', suit: 'spades', name: 'BYSSEPS', text: '' },
		];
		// a glyph sent home waits for its own suit, for a Thief as much as for anyone else
		const state = makeTomb({ columns: [['6D']], cells: ['4C', 'AS', '3H', '9D'], draft });
		expect(attackWith(state, cell(1))?.itemWindow).toEqual({ cell: 1, role: 'glyph', suit: 'spades', takes: 'same' });

		// so a heart cannot fill it, and parks in the empty pocket instead
		const played = attackWith(state, cell(1))!;
		const parked = tombMove(played, cell(2), cell(1))!;
		expect(parked.draft.find((item) => item.cell === 1)).toBeUndefined();
	});

	test('without a Thief, an item played into the crypt converts the slot instead', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '4C', suit: 'clubs', name: 'Fighter', text: '' },
			{ cell: 1, role: 'glyph', id: '5S', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		];
		const state = makeTomb({ columns: [['6D']], cells: ['4C', '5S', '3H', '9D'], foundations: ['4D'], draft });
		const played = tombMove(state, cell(1), cascade(0))!;

		// no window, so the chip steps past the empty slot: the conversion is final
		expect(played.itemWindow).toBe(null);
		expect(chipBoundary(played)).toBe(1);
	});

	test('the same colour is not the same suit: only an Orc takes any card', () => {
		// a club is the colour of the spades slot, but a plain delver still has to find a spade
		const played = attackWith(base(), cell(0))!;
		const missed = tombMove(played, cascade(4), cell(0))!;

		expect(missed.itemWindow).toBe(null);
		expect(shorthandCard(missed.game.cells[0]!)).toBe('7C');
		expect(missed.draft).toHaveLength(0);
	});

	test('a spent item sent home leaves its slot waiting rather than grabbing one of its suit', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'consumable', id: '2D', suit: 'diamonds', name: 'Potion', text: '' },
		];
		const state = makeTomb({
			columns: [['6D']],
			cells: ['2D', '5H', '9C'],
			foundations: ['AH', 'AS', 'AC', 'AD'],
			draft,
			exhausted: [0],
		});
		const home = attackWith(state, cell(0))!;

		// nothing is pulled off the board: the six stays where it was
		expect(home.game.cells[0]).toBe(null);
		expect(home.draft.find((entry) => entry.cell === 0)).toBeUndefined();
		expect(home.game.cards.some((card) => shorthandCard(card) === '6D' && card.location.fixture === 'cascade')).toBe(true);
		// the slot waits for the card the player picks, and the exhausted mark goes with the item
		expect(home.itemWindow).toEqual({ cell: 0, role: 'consumable', suit: 'diamonds', takes: 'same' });
		expect(home.exhausted[0]).toBe(false);
	});

	test('a Thief is still not handed another suit when a spent item goes home', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'class', id: '3C', suit: 'clubs', name: 'Thief', text: '' },
			{ cell: 1, role: 'consumable', id: '2D', suit: 'diamonds', name: 'Potion', text: '' },
		];
		const state = makeTomb({
			columns: [['5C']],
			cells: ['3C', '2D', '9C'],
			foundations: ['AH', 'AS', 'AC', 'AD'],
			draft,
			exhausted: [1],
		});
		const home = attackWith(state, cell(1))!;

		// the club stays on the board: Pickpocket is a feed he chooses, not an automatic grab
		expect(home.game.cells[1]).toBe(null);
		expect(home.draft).toHaveLength(1);
		// and the slot is still waiting for whichever card he does feed it
		expect(home.itemWindow).toEqual({ cell: 1, role: 'consumable', suit: 'diamonds', takes: 'any' });
	});
});

describe('tombcrawl boss protection', () => {
	test('a drafted dwarf gets no shortcut past the Generals', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
		const dwarf = makeTomb({
			columns: [['KH']],
			cells: ['9D', '3C', '4C'],
			foundations: ['QH', 'QS', 'QD', 'QC'],
			boss: 'KH',
			draft,
		});
		expect(attackPreview(dwarf, cascade(0, 0))).toMatchObject({
			legal: false,
			reason: 'boss: one of its Generals has to fall first',
		});
		expect(attackWith(dwarf, cascade(0, 0))).toBe(null);
	});

	test('a drafted dwarf no longer silences the boss aura', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
		const dwarf = makeTomb({
			columns: [['9C']],
			cells: ['9D', '3C'],
			foundations: ['8S', '8H', '8D', '8C'],
			boss: 'KC',
			draft,
		});
		// Stone Gaze adds no rank of its own: the gaze turns the dwarf's own card face down
		expect(attackPreview(dwarf, cascade(0, 0)).damage).toBe(0);
		expect(attackWith(dwarf, cascade(0, 0))!.wounded[0]).toBe(1);
	});
});

describe('restocking a spent slot', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
		{ cell: 3, role: 'consumable', id: '3D', suit: 'diamonds', name: 'Remedy', text: '' },
	];
	const window = { cell: 3, role: 'consumable' as const, suit: 'diamonds' as const, takes: 'same' as const };
	const open = (cells: (string | null)[]) => ({
		...makeTomb({ columns: [['9D']], cells: cells as string[], draft, boss: 'KC' }),
		itemWindow: window,
	});

	test('a card fed into an empty slot becomes the item, and there is only ever one', () => {
		const next = tombMove(open(['2C', 'QH', '6H', null]), cascade(0, 0), cell(3))!;

		expect(cellCards(next, 3).map(shorthandCard)).toEqual(['9D']);
		const items = next.draft.filter((entry) => entry.cell === 3);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ role: 'consumable', id: '9D' });
		expect(next.exhausted[3]).toBe(false);
	});

	test('a slot that still holds a card refuses the feed instead of burying it', () => {
		// a window that opened over an occupied slot is not a licence to stack two items in one cell
		expect(tombMove(open(['2C', 'QH', '6H', 'TD']), cascade(0, 0), cell(3))).toBe(null);
	});

	test('sending a spent item home waits for the player, and pulls nothing off the board', () => {
		const spent = {
			...makeTomb({
				columns: [['9D']],
				cells: ['2C', 'QH', '6H', '3D'],
				foundations: ['2D'],
				draft,
				exhausted: [3],
				boss: 'KC',
			}),
		};
		const next = attackWith(spent, cell(3))!;

		// the slot is empty and waiting, rather than already holding the first diamond it found
		expect(next.game.cells[3]).toBe(null);
		expect(next.itemWindow).toMatchObject({ cell: 3, role: 'consumable', suit: 'diamonds' });
		expect(
			next.game.cards.some((card) => shorthandCard(card) === '9D' && card.location.fixture === 'cascade')
		).toBe(true);
	});
});

describe('mana burn on the slot', () => {
	// The glyph is the third card drafted, so its slot is 2 whatever the chip is doing.
	const board = (draft: DraftCard[]) =>
		makeTomb({
			columns: [['2D']],
			cells: ['2S', '3S', 'TS', 'TD'],
			foundations: ['AD'],
			draft,
			boss: 'KD',
		});
	const glyph: DraftCard = { cell: 2, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' };
	const shipped = CLAUSES.wraithSlot;
	afterEach(() => {
		CLAUSES.wraithSlot = shipped;
	});

	test('a converted glyph slot is still drained', () => {
		CLAUSES.wraithSlot = true;
		// no Glyph left: it was played out, and a plain card sits where it was
		const next = attackWith(board([{ cell: 3, role: 'consumable', id: 'TD', suit: 'diamonds', name: 'Remedy', text: '' }]), cascade(0, 0))!;

		expect(next.exhausted[2]).toBe(true);
		expect(next.wounded[2]).toBe(1);
	});

	test('as shipped an empty of Glyph board is left alone', () => {
		const next = attackWith(board([{ cell: 3, role: 'consumable', id: 'TD', suit: 'diamonds', name: 'Remedy', text: '' }]), cascade(0, 0))!;

		expect(next.exhausted[2]).toBeFalsy();
		expect(next.wounded[2]).toBe(0);
	});

	test('with the Glyph still in its slot both read the same', () => {
		CLAUSES.wraithSlot = true;
		const next = attackWith(board([glyph]), cascade(0, 0))!;

		expect(next.exhausted[2]).toBe(true);
		expect(next.wounded[2]).toBe(1);
	});
});

describe('tombcrawl monsters', () => {
	test('every boss suit names its monster, its boss and its power', () => {
		expect(MONSTERS.spades).toMatchObject({ name: 'Bandit', boss: 'Tomithy Longdall', power: 'Mug' });
		expect(MONSTERS.hearts).toMatchObject({ name: 'Viper', boss: 'Jörmungandrn', power: 'Venom' });
		expect(MONSTERS.clubs).toMatchObject({ name: 'Gorgon', boss: 'Medusa', power: 'Stone Gaze' });
		expect(MONSTERS.diamonds).toMatchObject({ name: 'Wraith', boss: 'Tormented One', power: 'Mana Burn' });
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
		// leaving is the player's own call now, boss or no boss: the exit only records it
		const exit = tombExit(next)!;
		expect(exit.won).toBe(true);
		expect(exit.score).toBe(tombScore(next));
	});

	test('a blow the party cannot afford can be taken, and the delver dies of it', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Fighter', text: '' },
		];
		const state = makeTomb({
			columns: [['6C']],
			cells: ['2C', '3C'],
			foundations: ['4S', '4H', '4D', '4C'],
			boss: 'KC',
			draft,
		});
		expect(hp(state)).toBe(2);
		// the blow is a heart, the gaze another, and one still has to be left standing
		expect(attackPreview(state, cascade(0)).fatal).toBe(true);
		// an ordinary double click is still refused: the blow costs more than the track can spare
		expect(attackWith(state, cascade(0))).toBe(null);

		// taken deliberately, the card goes home and the party does not
		const died = attackWith(state, cascade(0), false, true)!;
		expect(died.won).toBe(true);
		expect(died.died).toBe(true);
		expect(hp(died)).toBe(0);
		expect(died.score).toBe(tombScore(died));
	});

	test('the confirm opens no kill but the one the bill refuses', () => {
		// the boss itself, still shielded by its Generals: nothing to do with hearts
		const state = makeTomb({ columns: [['KC']], cells: ['2C', '3C'], boss: 'KC' });
		expect(attackPreview(state, cascade(0)).fatal).toBe(false);
		expect(attackWith(state, cascade(0), false, true)).toBe(null);
	});

	test('the boss kill ends the game and scores the leftovers', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KH'], ['5H']],
			cells: ['8C', '5D'],
			foundations: ['QH', 'KS', 'KD', 'JC'],
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

	test('court cards count fifteen, kings twenty and the boss king a hundred', () => {
		expect(lifted('JC')).toBe(15);
		expect(lifted('QH')).toBe(15);
		expect(lifted('KD')).toBe(20);
		expect(lifted('KD', 'KD')).toBe(100);
	});

	test('a card counts the same however it is lying', () => {
		const plain = tombPar(makeTomb({ columns: [['2H']], cells: ['KD'] }));
		expect(tombPar(makeTomb({ columns: [['2H']], cells: ['KD'], hidden: ['KD'] }))).toBe(plain);
		expect(tombPar(makeTomb({ columns: [['2H']], cells: ['KD'], wounded: [1] }))).toBe(plain);
	});

	test('a full tomb opens at 500, whether or not the boss has been uncovered', () => {
		// the boss is in the deal from the start, so his hundred is already spoken for
		expect(tombPar(makeTomb({ columns: [['2H']] }))).toBe(500);
		expect(tombPar(makeTomb({ columns: [['2H']], boss: 'KD' }))).toBe(500);
		expect(tombPar(createTombState(1))).toBe(500);
	});

	test('the cleared percentage reads the par as a share of the five hundred', () => {
		expect(parCleared(createTombState(1))).toBe(0);
		// a king, a queen, a jack and a ten are 60 of the 500: twelve percent
		const home = makeTomb({ columns: [['2H']], foundations: ['KS', 'QH', 'JD', 'TC'] });
		expect(parCleared(home)).toBe(12);
		expect(parCleared(makeTomb({ columns: [['2H']], boss: 'KD' }))).toBe(0);
	});

	test('the percentage keeps one decimal, so early cards still show', () => {
		// a lone king home is 4%, and a lone two is 0.4% rather than nothing
		expect(parCleared(makeTomb({ columns: [['2H']], foundations: ['KS'] }))).toBe(4);
		expect(parCleared(makeTomb({ columns: [['2H']], foundations: ['2S'] }))).toBe(0.4);
	});

	test('par divides into a clean percentage of the tomb cleared', () => {
		// (500 - par) / 5 is the percentage clear, so the round total is what makes it readable
		const fresh = tombPar(createTombState(1));
		expect((500 - fresh) / 5).toBe(0);
		expect((500 - (fresh - 250)) / 5).toBe(50);
	});

	test('a card going home takes exactly its value off the whole', () => {
		const onBoard = makeTomb({ columns: [['2H']], cells: ['TS'] });
		const home = makeTomb({ columns: [['2H']], foundations: ['AH'] });
		expect(tombPar(onBoard) - tombPar(home)).toBe(1);
	});
});

describe('tombcrawl a kill that costs nothing', () => {
	// The Orc's Bloodthirsty pays for the pile leading the board, so this kill is free and the track is bare.
	const orc = (): DraftCard[] => [{ cell: 0, role: 'kin', id: '2D', suit: 'diamonds', name: 'Orc', text: '' }];

	test('a free kill does not owe the spare heart', () => {
		const state = makeTomb({ columns: [['5H'], []], foundations: ['4H'], draft: orc() });
		expect(hp(state)).toBe(0);
		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(0);
		expect(preview.reason).toBe('');
		expect(preview.legal).toBe(true);
		expect(attackWith(state, cascade(0))).not.toBe(null);
	});

	test('a kill that costs anything at all still leaves a heart standing', () => {
		const state = makeTomb({ columns: [['5H'], []], foundations: ['4H'] });
		expect(attackPreview(state, cascade(0))).toMatchObject({ legal: false, fatal: true });
	});
});

describe('tombcrawl the class powers and the hearts they pay', () => {
	const wounds = (state: TombState) => state.wounded.reduce((sum, count) => sum + count, 0);

	test('the Fighter pays the same eight on med as anyone else, with no ceiling to save him', () => {
		const fighter: DraftCard[] = [{ cell: 0, role: 'class', id: '2S', suit: 'spades', name: 'Fighter', text: '' }];
		// a nine at level one asks for eight, every party pays all of it on med, and three hearts is not enough
		const board = (draft: DraftCard[] = []) =>
			makeTomb({ columns: [['9S'], []], foundations: ['8S'], cells: ['2H', '3H', '4H'], draft });
		const withFighter = attackPreview(board(fighter), cascade(0));
		const plain = attackPreview(board(), cascade(0));
		expect(withFighter).toMatchObject({ legal: false, damage: 8 });
		expect(plain).toMatchObject({ legal: false, damage: 8 });
	});

	test('the Priest mends two on a level up', () => {
		const priest: DraftCard[] = [{ cell: 2, role: 'class', id: '2H', suit: 'hearts', name: 'Priest', text: '' }];
		const board = (draft: DraftCard[] = []) =>
			makeTomb({
				columns: [['2D'], []],
				foundations: ['2S', '2H', '2C', 'AD'],
				cells: ['5S', '6S', '7S', '8S'],
				wounded: [0, 1],
				draft,
			});
		// diamonds is the pile holding the level back, so its two levels the run up
		const plain = attackWith(board(), cascade(0))!;
		const holy = attackWith(board(priest), cascade(0))!;
		expect(wounds(plain) - wounds(holy)).toBe(1);
	});
});

describe('putting a two-click spell’s pick down', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'glyph', id: '2D', suit: 'diamonds', name: 'WEYTWUT', text: '' },
	];
	const board = () => makeTomb({ columns: [['5H'], ['9D']], cells: ['2D'], draft });

	test('clears the pick and leaves the spell armed and exhausted for a fresh aim', () => {
		const armed = armedClick(useAbility(board(), 0)!, cascade(0, 0))!;
		expect(armed.armed).toMatchObject({ kind: 'weytwut', first: '5H' });

		const put = unpick(armed)!;
		expect(put.armed).toMatchObject({ kind: 'weytwut' });
		expect(put.armed?.first).toBeUndefined();
		expect(put.exhausted[0]).toBe(true);
	});

	test('does nothing when nothing has been picked yet', () => {
		expect(unpick(useAbility(board(), 0)!)).toBe(null);
	});
});

describe('tombcrawl CYDSTEPP has only the one use', () => {
	const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2H', suit: 'hearts', name: 'CYDSTEPP', text: '' }];
	const board = () =>
		makeTomb({
			columns: [['5C', '4D'], ['KS'], ['QC']],
			cells: ['2H', '2C', '3C'],
			hidden: ['QC'],
			draft,
			wounded: [1],
		});

	test('a face-up card is only ever picked up, never turned back over', () => {
		const armed = useAbility(board(), 0)!;
		const picked = armedClick(armed, cascade(0, 1))!;

		expect(picked.armed).toMatchObject({ kind: 'cydstepp', first: '4D' });
		expect(picked.hidden).not.toContain('4D');
	});
});

describe('an item coming back without a level up', () => {
	// A level up is the third suit reaching two: the clubs two goes home onto a pile of aces while the
	// other three piles already stand at two.
	const levelling = () =>
		makeTomb({
			columns: [['2C']],
			cells: ['KC', '5H'],
			foundations: ['2S', '2H', '2D', 'AC'],
			draft: [
				{ cell: 0, role: 'kin', id: 'KC', suit: 'clubs', name: 'Orc', text: '' },
				{ cell: 1, role: 'consumable', id: '5H', suit: 'hearts', name: 'Potion', text: '' },
			],
			exhausted: [1],
		});
	const clubsHome = { fixture: 'foundation' as const, data: [3] };

	test('a spent item stays spent through a level up: only the glyph comes back', () => {
		const state = levelling();
		expect(currentLevel(state)).toBe(2);
		const next = tombMove(state, cascade(0), clubsHome)!;
		expect(currentLevel(next)).toBe(3);
		expect(next.exhausted[1]).toBe(true);
	});
});

describe('the wizard’s arcana', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'class', id: 'KC', suit: 'clubs', name: 'Wizard', text: '' },
		{ cell: 1, role: 'glyph', id: '3S', suit: 'spades', name: 'BYSSEPS', text: '' },
		{ cell: 2, role: 'consumable', id: '5H', suit: 'hearts', name: 'CYDSTEPP', text: '' },
	];

	test('the item slot is a spell, and a level up brings both of them back', () => {
		const state = makeTomb({
			columns: [['2C']],
			cells: ['KC', '3S', '5H'],
			// clubs is the pile holding the level back, so its two levels the run up
			foundations: ['2S', '2H', '2D', 'AC'],
			draft,
			exhausted: [1, 2],
		});
		// the second slot is a glyph to everything that reads the glyph
		expect(hasGlyph(state, 'CYDSTEPP')).toBe(true);
		expect(hasGlyph(state, 'BYSSEPS')).toBe(true);

		const next = tombMove(state, cascade(0), { fixture: 'foundation', data: [3] })!;
		expect(currentLevel(next)).toBe(3);
		expect(next.exhausted[1]).toBe(false);
		expect(next.exhausted[2]).toBe(false);
	});

	test('a wraith drains both glyphs at once', () => {
		// the diamond king is the boss, so every other king carries his Mana Burn into a free cell
		const state = makeTomb({
			columns: [['KD'], ['KH']],
			cells: ['KC', '2S', '5H', null],
			draft,
			boss: 'KD',
		});
		const parked = tombMove(state, cascade(1), cell(3))!;

		expect(parked.wounded[1]).toBe(1);
		expect(parked.wounded[2]).toBe(1);
		expect(parked.exhausted[1]).toBe(true);
		expect(parked.exhausted[2]).toBe(true);
	});
});

describe('the dwarf’s stout', () => {
	test('the crawl opens with one pocket more than the track allows', () => {
		const deals = Array.from({ length: 200 }, (_, index) => createTombState(index + 1, FREE_CELL_COUNT.med));
		const dwarf = deals.find((state) => state.draft[0].name === 'Dwarf')!;
		const other = deals.find((state) => state.draft[0].name !== 'Dwarf')!;

		expect(dwarf.game.cells.length).toBe(other.game.cells.length + 1);
		// the party is still four cards in the first four cells
		expect(dwarf.draft).toHaveLength(4);
	});
});

describe('the reserve pocket', () => {
	test('the star is held until the right-most cell is used, and not given back', () => {
		const state = makeTomb({ columns: [['2C'], ['3D']], cells: ['5C', '5D', '5H'] });
		expect(reserveCell(state)).toBe(6);
		expect(reserveHeld(state)).toBe(true);

		// a card parked a pocket short of it costs nothing
		const beside = tombMove(state, cascade(0), cell(5))!;
		expect(reserveHeld(beside)).toBe(true);

		const used = tombMove(state, cascade(0), cell(6))!;
		expect(reserveHeld(used)).toBe(false);

		// taking the card out again does not hand the star back: the pocket was borrowed from
		const away = tombMove(used, cell(6), cascade(1))!;
		expect(reserveHeld(away)).toBe(false);
	});

	test('a dwarf slides the star out with the extra pocket', () => {
		const state = makeTomb({ columns: [['2C']], cells: ['5C'], cellCount: 8 });
		expect(reserveCell(state)).toBe(7);
	});

	test('the true wins are the ordinary wins with the star still up', () => {
		const deck = initializeDeckOfCards().map((card) => shorthandCard(card));
		const bared = makeTomb({ columns: [], foundations: deck, boss: 'KS' });
		expect(trueClear(bared)).toBe(true);

		const borrowed = { ...bared, reserveHeld: false };
		expect(trueClear(borrowed)).toBe(false);
	});

	test('a clean boss kill is earned at the kill and kept through a borrowed pocket', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KH'], ['5D']],
			cells: ['8C', '9C'],
			foundations: ['QH', 'KS', 'KD', 'JC'],
			draft,
			boss: 'KH',
		});
		expect(trueBossKill(state)).toBe(false);

		const slain = attackWith(state, cascade(0))!;
		expect(bossSlain(slain)).toBe(true);
		expect(trueBossKill(slain)).toBe(true);

		// spending the pocket after the kill cannot un-earn it: it only costs the third step
		const spent = tombMove(slain, cascade(1), cell(6))!;
		expect(reserveHeld(spent)).toBe(false);
		expect(trueBossKill(spent)).toBe(true);
	});

	test('a boss killed with the pocket already spent earns nothing', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'kin', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KH'], ['5D']],
			cells: ['8C', '9C'],
			foundations: ['QH', 'KS', 'KD', 'JC'],
			draft,
			boss: 'KH',
		});
		const parked = tombMove(state, cascade(1), cell(6))!;
		const slain = attackWith(parked, cascade(0))!;

		expect(bossSlain(slain)).toBe(true);
		expect(trueBossKill(slain)).toBe(false);
	});

	test('gold pays one, two or three, and the score reads past a hundred', () => {
		const gold = (state: TombState) => tombGold(state);
		// a fresh deal pays face value
		const opening = makeTomb({ columns: [], cells: ['2C'], boss: 'KS' });
		expect(goldMultiplier(opening)).toBe(1);
		expect(goldScore(opening)).toBe(gold(opening));

		// a true boss kill doubles whatever the tomb still owes
		const killed: TombState = { ...opening, trueBoss: true };
		expect(goldMultiplier(killed)).toBe(2);
		expect(goldScore(killed)).toBe(gold(opening) * 2);

		// a bare tomb with the pocket intact pays three, and reads three hundred of a hundred
		const deck = initializeDeckOfCards().map((card) => shorthandCard(card));
		const clean = makeTomb({ columns: [], foundations: deck, boss: 'KS' });
		expect(goldMultiplier(clean)).toBe(3);
		expect(goldScore(clean)).toBe(GOLD_TOTAL * 3);

		// the same tomb with the pocket spent after a clean kill stops at two hundred, not three
		const borrowed: TombState = { ...clean, reserveHeld: false, trueBoss: true };
		expect(goldMultiplier(borrowed)).toBe(2);
		expect(goldScore(borrowed)).toBe(GOLD_TOTAL * 2);

		// and spent before the kill it is an ordinary score
		const plain: TombState = { ...clean, reserveHeld: false };
		expect(goldMultiplier(plain)).toBe(1);
	});
});

describe('gold', () => {
	const wholeTomb = (state: TombState) =>
		state.game.cards.reduce((total, card) => total + goldValue(state, card), 0);

	test('the flat table comes to exactly a hundred on a dealt tomb', () => {
		expect(wholeTomb(makeTomb({ columns: [], boss: 'KD' }))).toBe(GOLD_TOTAL);
	});

	test('a deal with no boss cannot reach the hundred: four kings and forty-eight rats', () => {
		expect(wholeTomb(makeTomb({ columns: [] }))).toBe(68);
	});

	test('a card pays by what it is: rat one, minion two, General five, boss twenty-five', () => {
		const state = makeTomb({ columns: [], boss: 'KD' });
		const card = (id: string) => state.game.cards.find((held) => shorthandCard(held) === id)!;
		expect(goldValue(state, card('7C'))).toBe(1);
		expect(goldValue(state, card('7D'))).toBe(2);
		expect(goldValue(state, card('KS'))).toBe(5);
		expect(goldValue(state, card('KD'))).toBe(25);
	});

	test('the bar counts only what has gone home, at its own price', () => {
		const none = makeTomb({ columns: [], boss: 'KD' });
		expect(tombGold(none)).toBe(0);

		const some = makeTomb({ columns: [], foundations: ['3S', '3D', 'KD'], boss: 'KD' });
		// a rat, a boss-suit minion and the boss
		expect(tombGold(some)).toBe(28);

		const bare = makeTomb({ columns: [], foundations: initializeDeckOfCards().map((card) => shorthandCard(card)), boss: 'KD' });
		expect(tombGold(bare)).toBe(GOLD_TOTAL);
	});
});

describe('the affliction preview', () => {
	const cardIn = (state: TombState, id: string) => state.game.cards.find((card) => shorthandCard(card) === id)!;

	test('a bandit warns on the slot the chip has reached, and on the glyph once the item is gone', () => {
		const item: DraftCard[] = [{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({ columns: [['5S']], cells: ['TC', null], boss: 'KS', draft: item });
		expect(afflictionTargets(state, cardIn(state, '5S'))).toEqual(['TC']);

		// the item is spent, so the chip has stepped onto the glyph and the glyph is what is at stake
		const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' }];
		const later = makeTomb({ columns: [['5S']], cells: ['TS', null], boss: 'KS', draft: glyph });
		expect(afflictionTargets(later, cardIn(later, '5S'))).toEqual(['TS']);
	});

	test('a wounded slot is locked, so the bandit warns on nothing and takes nothing', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({
			columns: [['5S']],
			cells: ['TC', '2C', '3C', '4C', '6C', '7C'],
			foundations: ['4S'],
			boss: 'KS',
			draft,
			wounded: [0],
		});
		expect(afflictionTargets(state, cardIn(state, '5S'))).toEqual([]);

		// and the rule agrees: the kill lands and the face-down slot keeps its card and its entry
		const next = attackWith(state, cascade(0, 0))!;
		expect(next.draft).toHaveLength(1);
		expect(shorthandCard(next.game.cells[0]!)).toBe('TC');
	});

	test('a viper warns on the fog it would lift, not on any card it likes', () => {
		const state = makeTomb({ columns: [['2C', '3C'], ['4H']], cells: ['5H', null], hidden: ['3C'], boss: 'KH' });
		expect(afflictionTargets(state, cardIn(state, '5H'))).toEqual(['3C']);
	});

	test('a wraith warns on the glyph it would spend, and stops once the slot is face down', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: 'TD', suit: 'diamonds', name: 'CYDSTEPP', text: '' }];
		const state = makeTomb({ columns: [['5D']], cells: ['TD', null], boss: 'KD', draft });
		expect(afflictionTargets(state, cardIn(state, '5D'))).toEqual(['TD']);

		const spent = makeTomb({ columns: [['5D']], cells: ['TD', null], boss: 'KD', draft, wounded: [0] });
		expect(afflictionTargets(spent, cardIn(spent, '5D'))).toEqual([]);
	});

	test('a gorgon warns on the one card it would stone, and stops at the class', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'kin', id: '2C', suit: 'clubs', name: 'Orc', text: '' },
			{ cell: 1, role: 'class', id: '3C', suit: 'clubs', name: 'Wizard', text: '' },
			{ cell: 2, role: 'glyph', id: '4C', suit: 'clubs', name: 'BURNDAYRAZ', text: '' },
		];
		const state = makeTomb({ columns: [['5C']], cells: ['2C', '3C', '4C'], boss: 'KC', draft });
		// one affliction, one card: the kin answers for it, and the class is only next
		expect(afflictionTargets(state, cardIn(state, '5C'))).toEqual(['2C']);

		// a cell already face down has nothing left to take, so the gaze only warns on the class
		const spent = makeTomb({ columns: [['5C']], cells: ['2C', '3C', '4C'], boss: 'KC', draft, wounded: [0] });
		expect(afflictionTargets(spent, cardIn(spent, '5C'))).toEqual(['3C']);
	});

	test('an armed Remedy silences the warning, since the blow would not set the power off', () => {
		const draft: DraftCard[] = [
			{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Remedy', text: '' },
			{ cell: 1, role: 'glyph', id: 'TS', suit: 'spades', name: 'BURNDAYRAZ', text: '' },
		];
		const state = makeTomb({ columns: [['5S']], cells: ['TC', 'TS'], boss: 'KS', draft });
		expect(afflictionTargets(state, cardIn(state, '5S'))).toEqual(['TS']);

		const armed = useAbility(state, 0)!;
		expect(armed.armed?.kind).toBe('remedy');
		expect(afflictionTargets(armed, cardIn(armed, '5S'))).toEqual([]);
	});

	test('a plain card warns on nothing, whatever tomb it stands in', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'consumable', id: 'TC', suit: 'clubs', name: 'Potion', text: '' }];
		const state = makeTomb({ columns: [['5S'], ['7H']], cells: ['TC', null], boss: 'KS', draft });
		expect(afflictionTargets(state, cardIn(state, '7H'))).toEqual([]);
	});
});

describe('a stoned wizard’s arcana turns back into an item', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'kin', id: '5H', suit: 'hearts', name: 'Human', text: '' },
		{ cell: 1, role: 'class', id: 'KC', suit: 'clubs', name: 'Wizard', text: '' },
		{ cell: 2, role: 'glyph', id: '3H', suit: 'hearts', name: 'CYDSTEPP', text: '' },
		// a spade in the item slot: BYSSEPS while he stands, Purity the moment he is face down
		{ cell: 3, role: 'consumable', id: 'AS', suit: 'spades', name: 'BYSSEPS', text: '' },
	];
	const board = (extra: Partial<Setup> = {}) =>
		makeTomb({ columns: [['2H']], cells: ['5H', 'KC', '3H', 'AS'], draft, ...extra });

	test('spells while he stands, and is the item again while he is face down', () => {
		const standing = board();
		expect(draftAbility(standing, draft[3]).name).toBe('BYSSEPS');
		expect(hasGlyph(standing, 'BYSSEPS')).toBe(true);
		expect(useAbility(standing, 3)!.armed).toMatchObject({ kind: 'sack' });

		const stoned = board({ wounded: [1] });
		expect(draftAbility(stoned, draft[3]).name).toBe('Purity');
		expect(hasGlyph(stoned, 'BYSSEPS')).toBe(false);
		expect(useAbility(stoned, 3)!.armed).toMatchObject({ kind: 'purity' });
	});

	test('keeps the exhaustion it had, and spells again once his wound is healed', () => {
		const spent = board({ wounded: [1], exhausted: [3] });
		expect(abilityUsable(spent, 3)).toBe(false);

		// the wizard is the leftmost wound on the track, so the first dig mends him and the pocket spells again
		const stoned = makeTomb({
			columns: [['2H']],
			cells: ['5H', 'KC', '3H', 'AS'],
			hidden: ['2H'],
			draft,
			wounded: [1],
		});
		expect(draftAbility(stoned, draft[3]).name).toBe('Purity');

		const dug = revealFaceDown(stoned, cascade(0))!;
		expect(dug.wounded[1]).toBe(0);
		expect(draftAbility(dug, draft[3]).name).toBe('BYSSEPS');
	});
});

describe('a stoned dwarf’s stout pocket closes', () => {
	const draft: DraftCard[] = [
		{ cell: 0, role: 'kin', id: 'KS', suit: 'spades', name: 'Dwarf', text: '' },
		{ cell: 1, role: 'class', id: 'QC', suit: 'clubs', name: 'Wizard', text: '' },
	];
	const held = (state: TombState, id: string) => state.game.cards.find((card) => shorthandCard(card) === id)!;

	test('a gaze on the kin shoves the extra card out to the first free pocket to its left', () => {
		const state = makeTomb({
			columns: [['4C'], ['8S']],
			cells: ['KS', null, null, null, null, null, null, '8D'],
			boss: 'KC',
			draft,
			cellCount: 8,
			stout: true,
		});
		expect(stoneCell(state, 7)).toBe(false);

		// a club minion stashed in a free cell stones the kin, and the pocket he opened closes
		const parked = tombMove(state, cascade(0, 0), cell(5))!;
		expect(parked.wounded[0]).toBe(1);
		expect(stoneCell(parked, 7)).toBe(true);
		expect(cellCards(parked, 7)).toHaveLength(0);
		expect(shorthandCard(cellCards(parked, 6)[0])).toBe('8D');
		// the pocket is out of the track: not a free cell, and nothing builds into it
		expect(emptyCells(parked)).toEqual([1, 2, 3, 4]);
		expect(canBuildOn(parked, [held(parked, 'QC')], cell(7))).toBe(false);
	});

	test('with nowhere to go it stays, a heart still in play, until the wound heals', () => {
		const state = makeTomb({
			columns: [['AC'], ['8S'], ['2H']],
			cells: ['KS', '4H', '2H', '3H', '5H', '6H', '7H', 'AD'],
			hidden: ['8S'],
			boss: 'JC',
			draft,
			cellCount: 8,
			stout: true,
		});
		// an ace of clubs wears the Gorgon's gaze, and a level-one ace is a free kill: no wounds to pay first
		const stoned = attackWith(state, cascade(0))!;
		expect(stoned.wounded[0]).toBe(1);
		expect(stoneCell(stoned, 7)).toBe(true);
		expect(shorthandCard(cellCards(stoned, 7)[0])).toBe('AD');
		// the pocket is one-way: the card plays out like any other, and only the pocket itself is shut
		expect(cellCardMovable(stoned, 7)).toBe(true);
		expect(tombTapTargets(stoned, cell(7))).toContainEqual(cascade(2));
		expect(tombMove(stoned, cell(7), cascade(2))).not.toBeNull();
		expect(canSendHome(stoned, cell(7)).legal).toBe(true);
		expect(canBuildOn(stoned, [held(stoned, 'KS')], cell(7))).toBe(false);

		// the dig mends the kin, and the pocket opens back up with the card still in it
		const healed = revealFaceDown(stoned, cascade(1, 0))!;
		expect(healed.wounded[0]).toBe(0);
		expect(stoneCell(healed, 7)).toBe(false);
		expect(cellCardMovable(healed, 7)).toBe(true);
	});

	test('and it can still be played into a spent item pocket that wants it', () => {
		const state = makeTomb({
			columns: [['5H']],
			cells: ['KS', 'QC', '4S', null, null, null, null, 'AD'],
			boss: 'JC',
			draft,
			cellCount: 8,
			stout: true,
			// already face down, so the pocket is stone before the move rather than by it
			wounded: [0],
		});
		expect(stoneCell(state, 7)).toBe(true);
		// the item pocket beside the chip emptied on the last action and waits one more for a feed
		const waiting: TombState = {
			...state,
			itemWindow: { cell: 3, role: 'consumable', suit: 'diamonds', takes: 'same' },
		};
		const fed = tombMove(waiting, cell(7), cell(3))!;

		expect(fed.draft.find((entry) => entry.cell === 3)).toMatchObject({ id: 'AD', role: 'consumable' });
		expect(stoneCell(fed, 7)).toBe(true);
		expect(cellCards(fed, 7)).toHaveLength(0);
	});
});




