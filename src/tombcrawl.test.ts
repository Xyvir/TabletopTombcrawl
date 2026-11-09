import { describe, expect, test } from 'vitest';
import { initializeDeckOfCards, shorthandCard, type Card } from './game/card/card';
import { FreeCell } from './game/game';
import {	MONSTERS,
	TOMB_CELL_COUNT,
	armedClick,
		armedDrop,

	attackPreview,
	attackWith,
	bossSlain,
	bossUnlocked,
	canSendHome,
	createTombState,
	currentLevel,
	hp,
	isFaceDown,
	revealFaceDown,
	kingsHome,
	playerLevel,
	tombExit,
	tombMove,
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
	boss?: string;
}

function makeTomb({ columns, cells = [], foundations = [], hidden = [], draft = [], exhausted = [], boss }: Setup): TombState {
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
		won: false,
		score: null,
		nextAttackFree: false,
		curedLevel: null,
		armed: null,
		itemWindow: null,
	};
}

const cascade = (column: number, card = 0) => ({ fixture: 'cascade' as const, data: [column, card] });
const cell = (index: number) => ({ fixture: 'cell' as const, data: [index] });

describe('tombcrawl deal and draft', () => {
	test('drafts four suits in draw order and deals the rest under fog', () => {
		const state = createTombState(1234);
		expect(state.draft.map((entry) => entry.role)).toEqual(['race', 'class', 'glyph', 'consumable']);
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
			columns: [['5H'], [], [], [], [], [], [], []],
			cells: ['2C', '3C', '4C', '6C', null, null, null],
			foundations: ['4H', 'AS'],
		});
		expect(currentLevel(state)).toBe(1);

		const preview = attackPreview(state, cascade(0));
		expect(preview.damage).toBe(4);
		expect(preview.locks).toEqual([3, 2, 1, 0]);

		const next = attackWith(state, cascade(0))!;
		expect(next.game.foundations.some((card) => card && shorthandCard(card) === '5H')).toBe(true);
		expect(hp(next)).toBe(0);
	});

	test('a kill you cannot pay for is refused and names the empty cells', () => {
		const state = makeTomb({ columns: [['5H']], cells: ['2C', '3C'], foundations: ['4H', 'AS'] });
		const preview = attackPreview(state, cascade(0));
		expect(preview.legal).toBe(false);
		expect(preview.need).toEqual([2, 3]);
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

	test('backstab costs nothing from a free cell', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'class', id: '2D', suit: 'diamonds', name: 'Thief', text: '' }];
		const state = makeTomb({ columns: [['7H']], cells: ['8H'], foundations: ['7H', 'AS'], draft });
		expect(attackPreview(state, cell(0)).damage).toBe(0);
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
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: 'KS', suit: 'spades', name: 'Orc', text: '' }];
		const state = makeTomb({ columns: [['AS']], cells: ['KS'], draft });
		expect(attackPreview(state, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

		const next = attackWith(state, cascade(0, 0))!;
		const ace = next.game.cards.find((card) => shorthandCard(card) === 'AS')!;
		expect(ace.location.fixture).toBe('foundation');
	});

	test('a drafted card still opens the rank above it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['3S']], cells: ['2S', '7D', '8D', '9D'], draft });
		expect(attackPreview(state, cascade(0, 0))).toMatchObject({ legal: true, reason: '' });

		const home = makeTomb({ columns: [['3H']], foundations: ['5H'] });
		expect(attackPreview(home, cascade(0, 0)).reason).toBe('foundation already past this rank');
	});

	test('a drafted card counts as home for the next rank', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const withPhantom = makeTomb({ columns: [['9C'], ['KS']], cells: ['8C'], foundations: ['7C'], draft });
		expect(canSendHome(withPhantom, cascade(0)).legal).toBe(true);

		const without = makeTomb({ columns: [['9C'], ['KS']], foundations: ['7C'] });
		expect(canSendHome(without, cascade(0)).legal).toBe(false);
	});

	test('digging is the player\'s call: a newly exposed card stays face down until clicked', () => {
		const state = makeTomb({
			columns: [['2C', '3D'], [], [], [], [], [], [], []],
			cells: [null, null, null, null, null, '8H', '9H'],
			hidden: ['2C'],
			exhausted: [5, 6],
		});
		const moved = tombMove(state, cascade(0, 1), cascade(1))!;
		expect(isFaceDown(moved, moved.game.cards.find((card) => shorthandCard(card) === '2C')!)).toBe(true);
		expect(moved.exhausted[6]).toBe(true);

		const dug = revealFaceDown(moved, cascade(0, 0))!;
		expect(isFaceDown(dug, dug.game.cards.find((card) => shorthandCard(card) === '2C')!)).toBe(false);
		expect(dug.exhausted[6]).toBe(false);
		expect(dug.exhausted[5]).toBe(true);
	});

	test('a face-down card can never be sent home, so an auto move cannot reveal it', () => {
		const state = makeTomb({ columns: [['AS', '3D'], ['5S']], hidden: ['AS'] });
		expect(attackPreview(state, cascade(0, 0)).legal).toBe(false);
		expect(attackWith(state, cascade(0, 0))).toBe(null);
	});

	test('poison turns over the deepest face-down card in the rightmost fogged column, with no heal', () => {
		const state = makeTomb({
			columns: [['2C', '8H'], ['KS', '3D'], ['4S', '5C'], [], [], [], [], ['6C', '9D']],
			cells: ['6S'],
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
		// the kill cost one cell and poison healed nothing
		expect(next.exhausted[0]).toBe(true);
	});

	test('a draft card can be converted out of its cell', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '8C', suit: 'clubs', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['9H'], ['KS']], cells: ['8C'], draft });
		const next = tombMove(state, cell(0), cascade(0))!;
		expect(next.draft).toHaveLength(0);
		expect(next.game.cells[0]).toBe(null);
	});

	test('a plain card in a cell cannot be dragged onto the board', () => {
		const state = makeTomb({ columns: [['4D'], ['5S']], cells: ['4H'] });
		expect(tombMove(state, cell(0), cascade(1))).toBe(null);
		expect(tombMove(state, cell(0), { fixture: 'foundation', data: [0] })).toBe(null);
		expect(shorthandCard(state.game.cells[0]!)).toBe('4H');
	});

	test('an Elf digs a buried card out and heals with it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KS', '2C', '3D'], ['4S']],
			cells: ['JC', '9H'],
			hidden: ['KS', '3D'],
			exhausted: [1],
			draft,
		});
		expect(state.bossId).toBe(null);

		const next = revealFaceDown(state, cascade(0, 0))!;
		const king = next.game.cards.find((card) => shorthandCard(card) === 'KS')!;
		expect(isFaceDown(next, king)).toBe(false);
		expect(next.exhausted[1]).toBe(false);
		expect(next.bossId).toBe('KS');
		expect(next.bossSuit).toBe('spades');
	});

	test('only an Elf can reveal a buried card', () => {
		const state = makeTomb({ columns: [['KS', '2C']], hidden: ['KS'] });
		expect(revealFaceDown(state, cascade(0, 0))).toBe(null);
	});

	test('revealing at full health wastes the heal instead of banking it', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: 'JC', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({ columns: [['KS', '2C']], cells: ['JC'], hidden: ['KS'], draft });
		const next = revealFaceDown(state, cascade(0, 0))!;
		expect(next.hidden).not.toContain('KS');
		expect(next.exhausted.every((spent) => !spent)).toBe(true);
	});

	test('a level up heals and refreshes the glyph', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '4H', suit: 'hearts', name: 'CYDSTEPP', text: '' }];
		const state = makeTomb({
			columns: [['3C'], ['KS']],
			cells: ['4H'],
			foundations: ['3S', '3H', '3D', '2C'],
			draft,
		});
		expect(currentLevel(state)).toBe(2);

		const armed = useAbility(state, 0)!;
		expect(armed.exhausted[0]).toBe(true);
		expect(armed.nextAttackFree).toBe(true);

		const kill = attackWith(armed, cascade(0))!;
		expect(currentLevel(kill)).toBe(3);
		expect(kill.exhausted[0]).toBe(false);
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

	test('a drag resolves pisorf: the grabbed card lands on the column it is dropped on', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'PISORF', text: '' }];
		const state = makeTomb({ columns: [['KS', '2C'], ['3D']], cells: ['2S'], draft });
		const armed = useAbility(state, 0)!;

		const next = armedDrop(armed, cascade(0, 1), cascade(1, 0))!;
		expect(next.armed).toBe(null);
		const spot = (id: string) => next.game.cards.find((card) => shorthandCard(card) === id)!.location;
		expect(spot('2C')).toEqual({ fixture: 'cascade', data: [1, 1] });
		expect(spot('3D')).toEqual({ fixture: 'cascade', data: [1, 0] });
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
});

describe('tombcrawl item refresh', () => {
	const glyph: DraftCard[] = [{ cell: 0, role: 'glyph', id: '2S', suit: 'spades', name: 'GETINDARE', text: '' }];
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
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'GETINDARE', id: '3S' });
	});

	test('a plain card parked in another free cell can be fed in too', () => {
		const played = tombMove(base(glyph, ['2S', '4S']), cell(0), cascade(2))!;
		const refilled = tombMove(played, cell(1), cell(0))!;

		expect(shorthandCard(refilled.game.cells[0]!)).toBe('4S');
		expect(refilled.draft[0]).toMatchObject({ cell: 0, role: 'glyph', suit: 'spades', name: 'GETINDARE', id: '4S' });
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
			...glyph,
			{ cell: 1, role: 'consumable', id: '5C', suit: 'clubs', name: 'Elixir', text: '' },
		];
		const played = tombMove(base(draft, ['2S', '5C']), cell(0), cascade(2))!;
		expect(played.itemWindow).toEqual({ cell: 0, role: 'glyph', suit: 'spades' });

		const spent = useAbility(played, 1)!;
		expect(spent.itemWindow).toBe(null);
	});

	test('an Orc can feed any card of the same colour, which makes the colour’s item', () => {
		const draft: DraftCard[] = [
			...glyph,
			{ cell: 1, role: 'race', id: '4C', suit: 'clubs', name: 'Orc', text: '' },
		];
		const played = tombMove(base(draft, ['2S', '4C']), cell(0), cascade(2))!;
		const refilled = tombMove(played, cascade(4), cell(0))!;

		expect(refilled.draft).toHaveLength(2);
		expect(refilled.draft.find((item) => item.cell === 0)).toMatchObject({
			role: 'glyph',
			suit: 'clubs',
			name: 'PISORF',
			id: '7C',
		});
	});
});

describe('tombcrawl boss protection', () => {
	test('a drafted dwarf can go straight for the boss', () => {
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
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
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: '9D', suit: 'diamonds', name: 'Dwarf', text: '' }];
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
		const draft: DraftCard[] = [{ cell: 0, role: 'race', id: '8C', suit: 'clubs', name: 'Elf', text: '' }];
		const state = makeTomb({
			columns: [['KH'], ['5H']],
			cells: ['8C'],
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
		// 5H left on the tableau (5) plus the un-dumped 8C ability (8), as a negative total
		expect(exit.score).toBe(-13);
	});

	test('court cards count as ten apiece and the total stays negative', () => {
		const state = makeTomb({ columns: [['KH', 'QH', 'JH'], ['2S']] });
		expect(tombScore(state)).toBe(-32);
	});
});
