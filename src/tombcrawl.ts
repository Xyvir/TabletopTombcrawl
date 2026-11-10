import {
	Card,
	CardLocation,
	getRankForCompare,
	initializeDeckOfCards,
	isRed,
	Rank,
	shorthandCard,
	Suit,
} from './game/card/card';
import { FreeCell } from './game/game';

/**
 * Tabletop Tombcrawl: a roguelike variant bolted onto the FreeCell board.
 *
 * Freecells double as the HP pool, eight columns are dealt under fog of war, and the first king
 * dealt becomes a boss you can only kill once the other three kings are home. Everything here is
 * pure: every action returns a new state, so the UI can keep a snapshot per move for undo.
 */

/** The drafted party always fills the first four cells, one per suit. */
export const DRAFT_CELL_COUNT = 4;
/** Free cells past the party: the difficulty knob, and the size of the HP track. */
export const FREE_CELL_COUNT: Record<Difficulty, number> = { easy: 4, med: 3, hard: 2 };
export type Difficulty = 'easy' | 'med' | 'hard';
/** The default track: four drafted items and three free cells. */
export const TOMB_CELL_COUNT = DRAFT_CELL_COUNT + FREE_CELL_COUNT.med;
export const TOMB_CASCADE_COUNT = 8;

export type DraftRole = 'kin' | 'class' | 'glyph' | 'consumable';

export const ROLE_LABEL: Record<DraftRole, string> = {
	kin: 'Kin · passive',
	class: 'Class · passive',
	glyph: 'Glyph · active, refreshes on level up',
	consumable: 'Item · active, refilled by playing it home',
};

/**
 * The one-word reminder printed over each draft slot: four unfamiliar names tell a new player
 * nothing, but "kin, class, glyph, item" says which slot is which at a glance.
 */
export const ROLE_WORD: Record<DraftRole, string> = {
	kin: 'kin',
	class: 'class',
	glyph: 'glyph',
	consumable: 'item',
};

interface Ability {
	name: string;
	text: string;
}

const KIN: Record<Suit, Ability> = {
	spades: {
		name: 'Orc',
		text: 'Scavenger: when an item refills, any card of the same colour will do.',
	},
	hearts: {
		name: 'Human',
		text: 'Courageous: send a card home skipping one missing rank, and slide a lower card in under the pile.',
	},
	clubs: {
		name: 'Elf',
		text: 'Insight: reach under the fog and reveal any face-down card, even a buried one, to explore it.',
	},
	diamonds: {
		name: 'Dwarf',
		text: 'Grudge: the boss king has no protection — kill it without sending another king home first.',
	},
};

const CLASSES: Record<Suit, Ability> = {
	spades: {
		name: 'Fighter',
		text: 'Veteran: ignore the lowest card when calculating your level, so you level up sooner than the rest.',
	},
	hearts: {
		name: 'Priest',
		text: 'Vigil: exploration heals two exhausted cells instead of one.',
	},
	clubs: {
		name: 'Wizard',
		text: 'Affinity: cast your glyph once for free on the very next turn it is refreshed.',
	},
	diamonds: {
		name: 'Thief',
		text: 'Bounty: slay into the single most advanced foundation still in play and the kill costs no HP.',
	},
};

const GLYPHS: Record<Suit, Ability> = {
	spades: {
		name: 'BYSSEPS',
		text: 'Arm, then move a valid stack of any size, even one your free cells could not carry. Spent by that move.',
	},
	hearts: {
		name: 'IMAWAL',
		text: 'Arm to play any exposed card on top of a face-down card, as if it were an empty column.',
	},
	clubs: {
		name: 'PISORF',
		text: 'Arm, then send a proper stack of two cards into one open free cell: two cards, two hearts.',
	},
	diamonds: {
		name: 'WEYTWUT',
		text: 'Arm, then choose two exposed cards: they trade places.',
	},
};

const CONSUMABLES: Record<Suit, Ability> = {
	spades: {
		name: 'Revive',
		text: 'Arm to take one wound more than your track can hold: that action may spend the last heart, and the item is spent with it.',
	},
	hearts: {
		name: 'Potion',
		text: 'Drink to heal every wound on the track at once.',
	},
	clubs: {
		name: 'Elixir',
		text: 'Arm to heal and/or refresh (un-exhaust) your spell glyph.',
	},
	diamonds: {
		name: 'Remedy',
		text: 'Arm, exhausted after your next action. Ignore the boss-suit power for that action: a kill, or a card parked in a free cell.',
	},
};

const ABILITY_TABLE: Record<DraftRole, Record<Suit, Ability>> = {
	kin: KIN,
	class: CLASSES,
	glyph: GLYPHS,
	consumable: CONSUMABLES,
};

const ROLES_BY_DRAW_ORDER: DraftRole[] = ['kin', 'class', 'glyph', 'consumable'];

export interface DraftCard {
	/** Free cell index, 0-3 by draw order. */
	cell: number;
	role: DraftRole;
	id: string;
	suit: Suit;
	name: string;
	text: string;
}

export type ArmedAbility = {
	kind: 'burndayraz' | 'imawal' | 'pisorf' | 'weytwut' | 'remedy' | 'revive' | 'sack';
	cell: number;
	first?: string;
};

export interface TombState {
	game: FreeCell;
	seed: number;
	/** Card ids still face-down on the tableau. */
	hidden: string[];
	draft: DraftCard[];
	bossId: string | null;
	bossSuit: Suit | null;
	/** An exhausted cell: its ability is spent and the card lies on its side. Still counts as HP. */
	exhausted: boolean[];
	/**
	 * Wounds per free cell: how many of its cards lie face-down. A stack fills from the bottom up,
	 * and it is worth two hearts, so it takes two wounds and each needs a heal of its own.
	 */
	wounded: number[];
	won: boolean;
	/** Golf total, set when the player leaves through the exit. */
	score: number | null;
	armed: ArmedAbility | null;
	/** A spent item slot: feed it a matching card on the very next action to remake the item. */
	itemWindow: { cell: number; role: DraftRole; suit: Suit } | null;
	/**
	 * The Glyph was refreshed by this action, so a Wizard's very next move may be a free cast. Any
	 * other action closes the window: it never survives a second move.
	 */
	freeCast: boolean;
}

const rankOf = (rank: Rank) => getRankForCompare(rank) + 1;

function cardId(card: Card | null | undefined): string {
	return card ? shorthandCard(card) : '';
}

export function cardAt(game: FreeCell, location: CardLocation): Card | null {
	switch (location.fixture) {
		case 'cell':
			return game.cells[location.data[0]] ?? null;
		case 'foundation':
			return game.foundations[location.data[0]] ?? null;
		case 'cascade':
			return game.tableau[location.data[0]]?.[location.data[1]] ?? null;
		default:
			return null;
	}
}

/* ------------------------------------------------------------------ setup */

/** Small deterministic PRNG so a deal number always produces the same tomb. */
function seededShuffle<T>(items: T[], seed: number): T[] {
	let state = (seed || 1) >>> 0;
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export function randomTombSeed(): number {
	return 1 + Math.floor(Math.random() * 32000);
}

/**
 * The first king the dungeon shows: face-down kings (and undealt cards) are not revealed, and a king
 * drafted into a free cell is yours rather than the dungeon's boss.
 */
function firstRevealedKing(cards: Card[], hidden: string[]): Card | null {
	return (
		cards.find(
			(card) =>
				card.rank === 'king' &&
				card.location.fixture === 'cascade' &&
				!hidden.includes(cardId(card))
		) ?? null
	);
}

/**
 * A deal whose party is drafted into the first four cells and leaves `freeCells` cells open. The
 * seed alone decides the cards, so the same seed deals the same board at any difficulty.
 */
export function createTombState(seed = randomTombSeed(), freeCells = FREE_CELL_COUNT.med): TombState {
	const deck = seededShuffle(initializeDeckOfCards(), seed).map((card) => ({ ...card }));

	// Draft: reveal until four different suits have come up, in the order they appeared.
	const picks: Card[] = [];
	const rest: Card[] = [];
	deck.forEach((card) => {
		if (picks.length < DRAFT_CELL_COUNT && !picks.some((pick) => pick.suit === card.suit)) picks.push(card);
		else rest.push(card);
	});

	// The rest of the deck fills eight columns, row by row.
	const columns: Card[][] = Array.from({ length: TOMB_CASCADE_COUNT }, () => []);
	rest.forEach((card, index) => {
		const col = index % TOMB_CASCADE_COUNT;
		card.location = { fixture: 'cascade', data: [col, columns[col].length] };
		columns[col].push(card);
	});
	picks.forEach((card, index) => {
		card.location = { fixture: 'cell', data: [index] };
	});

	const cards = [...picks, ...rest];
	const cellCount = DRAFT_CELL_COUNT + freeCells;
	const game = new FreeCell({ cellCount, cascadeCount: TOMB_CASCADE_COUNT, cards });

	// Fog of war: row 1 (the bottom of each column, the row you can actually touch) is face up.
	const hidden: string[] = [];
	columns.forEach((column) => {
		column.forEach((card, i) => {
			if ((column.length - 1 - i) % 2 === 1) hidden.push(cardId(card));
		});
	});

	// The boss is the first king the tableau reveals: a king dealt under the fog does not count
	// until the fog lifts off it, and a drafted king is a party member rather than the dungeon's
	// boss, so a deal can start with no boss at all.
	const bossCard = firstRevealedKing(cards, hidden);

	const draft: DraftCard[] = picks.map((card, i) => {
		const role = ROLES_BY_DRAW_ORDER[i];
		const ability = ABILITY_TABLE[role][card.suit];
		return { cell: i, role, id: cardId(card), suit: card.suit, name: ability.name, text: ability.text };
	});

	return {
		game,
		seed,
		hidden,
		draft,
		bossId: bossCard ? cardId(bossCard) : null,
		bossSuit: bossCard ? bossCard.suit : null,
		exhausted: new Array(cellCount).fill(false),
		wounded: new Array(cellCount).fill(0),
		won: false,
		score: null,
		armed: null,
		itemWindow: null,
		freeCast: false,
	};
}

/* --------------------------------------------------------------- reading */

export function isFaceDown(state: TombState, card: Card): boolean {
	return state.hidden.includes(cardId(card));
}

export function draftAt(state: TombState, cell: number): DraftCard | undefined {
	return state.draft.find((entry) => entry.cell === cell);
}

export function hasPassive(state: TombState, name: string): boolean {
	// A wounded passive is face-down and locked: it does nothing until it is healed.
	return state.draft.some(
		(entry) => entry.name === name && (entry.role === 'kin' || entry.role === 'class') && !state.wounded[entry.cell]
	);
}

export function hasGlyph(state: TombState, name: string): boolean {
	return state.draft.some((entry) => entry.name === name && entry.role === 'glyph' && !state.wounded[entry.cell]);
}

export function playerLevel(game: FreeCell): number {
	// The delver starts at level 1: an empty foundation counts as its ace, so the first level up
	// only arrives once every suit has reached its two. Each pile is read by its highest card, since
	// a Human can slide a lower one underneath.
	const ranks = (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).map((suit) =>
		game.cards
			.filter((card) => card.location.fixture === 'foundation' && card.suit === suit)
			.reduce((top, card) => Math.max(top, rankOf(card.rank)), 1)
	);
	return Math.min(...ranks);
}

export function currentLevel(state: TombState): number {
	const level = playerLevel(state.game);
	if (!hasPassive(state, 'Fighter')) return level;
	// A Fighter ignores the lowest card, so one lagging suit stops holding him back: with three suits
	// ahead of the slowest one, he is a level higher than anyone else would be.
	const ranks = (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).map((suit) => foundationTopRank(state, suit) || 1);
	const sorted = ranks.sort((a, b) => a - b);
	return sorted[1] ?? level;
}

export function isBoss(state: TombState, card: Card): boolean {
	return !!state.bossId && cardId(card) === state.bossId;
}

/** Boss minions: the boss suit, ace through queen, excluding the boss king itself. */
export function isBossMinion(state: TombState, card: Card): boolean {
	return (
		!!state.bossSuit &&
		card.suit === state.bossSuit &&
		!isBoss(state, card) &&
		getRankForCompare(card.rank) <= getRankForCompare('queen')
	);
}

/** Monster types: the flavour behind each boss suit, and the power that suit's cards carry. */
export const MONSTERS: Record<Suit, { name: string; power: string; text: string }> = {
	spades: { name: 'Bandit', power: 'Weakness', text: 'killing this costs one extra HP.' },
	hearts: {
		name: 'Serpent',
		power: 'Poison',
		text: 'killing this reveals the bottom face-down card of the rightmost fogged column, buried or not, with no heal.',
	},
	clubs: { name: 'Gorgon', power: 'Burden', text: 'killing this exhausts and wounds your item.' },
	diamonds: { name: 'Wraith', power: 'Mana Burn', text: 'killing this exhausts and wounds your Glyph.' },
};

/** The aura is off while a Remedy is armed: the action it covers ignores the power, kill or park. */
export function auraActive(state: TombState): boolean {
	return state.armed?.kind !== 'remedy';
}

/** Cards in one free cell, bottom first: a PISORF stack puts two cards in the same cell. */
export function cellCards(state: TombState, cell: number): Card[] {
	return state.game.cards
		.filter((card) => card.location.fixture === 'cell' && card.location.data[0] === cell)
		.sort((a, b) => (a.location.data[1] ?? 0) - (b.location.data[1] ?? 0));
}

/** Face-up cards in a cell: the heart bar is made of cards, not slots. */
export function faceUp(state: TombState, cell: number): number {
	return Math.max(0, cellCards(state, cell).length - state.wounded[cell]);
}

/** The face-down cards of a cell: wounds fill a stack from the bottom up. */
export function woundedCards(state: TombState, cell: number): Card[] {
	const cards = cellCards(state, cell);
	return cards.slice(0, Math.min(cards.length, state.wounded[cell]));
}

/** Only the card on top can be touched, so only its wound locks the cell. */
/**
 * The cards that just turned face-down, so the board can turn them over with the same animation
 * the fog uses. Wounds are paid from the right edge of the track, one card per point.
 */
export function newlyWounded(before: TombState, after: TombState): string[] {
	return before.wounded.flatMap((count, i) => {
		const stack = cellCards(after, i);
		const down = Math.min(stack.length, after.wounded[i] ?? 0);
		if (down <= count) return [];
		const card = stack[down - 1];
		return card ? [shorthandCard(card)] : [];
	});
}

/**
 * The cards that just came back face-up, so the board can turn them over with the same animation a
 * wound uses, run the other way. Healing runs left to right, one card per point healed.
 */
export function newlyHealed(before: TombState, after: TombState): string[] {
	return before.wounded.flatMap((count, i) => {
		const stack = cellCards(after, i);
		const down = Math.min(stack.length, after.wounded[i] ?? 0);
		if (down >= count) return [];
		return stack.slice(down, Math.min(count, stack.length)).map((card) => shorthandCard(card));
	});
}

/**
 * The track cards exploring a fogged card would turn back face up. Hovering the fog reads this out
 * the way hovering a kill reads out its wounds: the dig's mending is known before the action is spent.
 */
export function healPreview(state: TombState, from: CardLocation): string[] {
	if (!canRevealFaceDown(state, from)) return [];
	// A Priest's Vigil mends two cells a dig; anyone else mends one.
	const { wounded } = heal(state, hasPassive(state, 'Priest') ? 2 : 1);
	return newlyHealed(state, cloneWith(state, { wounded }));
}

export function cellTopWounded(state: TombState, cell: number): boolean {
	const cards = cellCards(state, cell).length;
	return cards > 0 && state.wounded[cell] >= cards;
}

export function verticalCells(state: TombState): number[] {
	return state.game.cells
		.map((card, index) => ({ card, index }))
		.filter(({ card, index }) => !!card && faceUp(state, index) > 0)
		.map(({ index }) => index);
}

/** A cell holding a stack of two cards is worth two hearts while it lasts. */
export function stackedCells(state: TombState): number {
	return state.game.cells.filter((_, index) => cellCards(state, index).length > 1).length;
}

export function maxHp(state: TombState): number {
	return state.game.cells.length + stackedCells(state);
}

export function emptyCells(state: TombState): number[] {
	return state.game.cells.map((card, index) => (card ? -1 : index)).filter((index) => index >= 0);
}

export function hp(state: TombState): number {
	return state.game.cells.reduce((total, _, index) => total + faceUp(state, index), 0);
}

/** Kings other than the boss that are already home. */
export function kingsHome(state: TombState): number {
	return state.game.cards.filter(
		(card) => card.location.fixture === 'foundation' && card.rank === 'king' && cardId(card) !== state.bossId
	).length;
}

/** Every king on a foundation, boss included. */
export function kingsOnFoundation(state: TombState): number {
	return state.game.cards.filter((card) => card.location.fixture === 'foundation' && card.rank === 'king').length;
}

/** The boss is frozen until at least one other king has been killed. */
export function bossUnlocked(state: TombState): boolean {
	return kingsHome(state) >= 1;
}

export function bossSlain(state: TombState): boolean {
	const boss = state.bossId ? state.game.cards.find((card) => cardId(card) === state.bossId) : undefined;
	return boss?.location.fixture === 'foundation';
}

/** Dwarf roots: while that passive is drafted, the boss king carries no protection at all. */
export function bossProtected(state: TombState): boolean {
	return !hasPassive(state, 'Dwarf') && !bossUnlocked(state);
}

function frozenBoss(state: TombState, card: Card): boolean {
	return isBoss(state, card) && bossProtected(state);
}

export function foundationIndexOf(game: FreeCell, suit: Suit): number {
	const occupied = game.foundations.findIndex((card) => card?.suit === suit);
	if (occupied !== -1) return occupied;
	return game.foundations.findIndex((card) => !card);
}	export function foundationTopRank(state: TombState, suit: Suit): number {
		// A pile can hold more than one card (a Human slides low cards underneath): the top is the highest.
		return state.game.cards
			.filter((card) => card.location.fixture === 'foundation' && card.suit === suit)
			.reduce((top, card) => Math.max(top, rankOf(card.rank)), 0);
	}/**
 * The one pile a Bounty pays for: it has to be the outright highest, so a tie is not a lead. A
 * finished pile (a king on top) is out of the running entirely, so completing one never takes the
 * passive away from the Thief for the rest of the run.
 */
export function leadingFoundation(state: TombState, suit: Suit): boolean {
	const top = foundationTopRank(state, suit);
	return state.game.foundations.every((card) => {
		// its own pile is the measure, not a rival
		if (!card || card.suit === suit) return true;
		const other = foundationTopRank(state, card.suit);
		return other >= 13 || other < top;
	});
}

/**
 * Phantom rank: a drafted card still sitting in a free cell counts as already home, so the next
 * rank of that suit may be built even though the drafted card never touched the foundation.
 */
export function phantomCard(state: TombState, suit: Suit, ignore?: string): Card | null {
	const entry = state.draft.find((candidate) => candidate.suit === suit && candidate.id !== ignore);
	if (!entry) return null;
	return state.game.cards.find((candidate) => cardId(candidate) === entry.id) ?? null;
}

export function phantomRank(state: TombState, suit: Suit, ignore?: string): number {
	const card = phantomCard(state, suit, ignore);
	return card ? rankOf(card.rank) : 0;
}

/* ------------------------------------------------------------ move rules */

export function tombRun(state: TombState, from: CardLocation): Card[] {
	if (from.fixture !== 'cascade') {
		const card = cardAt(state.game, from);
		return card ? [card] : [];
	}
	const column = state.game.tableau[from.data[0]] ?? [];
	const card = column[from.data[1]];
	if (!card || isFaceDown(state, card)) return [];
	const run = [card];
	for (let i = from.data[1]; i < column.length - 1; i++) {
		const lower = column[i];
		const next = column[i + 1];
		if (isFaceDown(state, next)) break;
		if (getRankForCompare(next.rank) !== getRankForCompare(lower.rank) - 1) break;
		if (isRed(next.suit) === isRed(lower.suit)) break;
		run.push(next);
	}
	return run;
}

function runReachesBottom(state: TombState, from: CardLocation, run: Card[]): boolean {
	if (from.fixture !== 'cascade' || !run.length) return false;
	const column = state.game.tableau[from.data[0]] ?? [];
	return run[run.length - 1] === column[column.length - 1];
}

/**
 * The poker chip's boundary: ability cells sit to its left, plain free cells to its right, and the
 * mark walks one slot left each time an item converts. A slot waiting on its refill is still an
 * ability slot — the chip only moves once that window closes unfed.
 */
export function chipBoundary(state: TombState): number {
	const drafted = convertibleCell(state) + 1;
	const pending = state.itemWindow ? state.itemWindow.cell + 1 : 0;
	return Math.max(drafted, pending);
}

/** The one item that may leave its slot: the drafted card sitting just left of the chip. */
export function convertibleCell(state: TombState): number {
	return state.draft.reduce((highest, entry) => Math.max(highest, entry.cell), -1);
}

/**
 * A plain scratch cell (to the right of the chip) hands its card back like FreeCell does: it builds
 * onto a column, waits in another cell, or goes home. A drafted item may leave only once the chip
 * reaches it, because conversions run in order. A wound locks either kind until it is healed.
 */
export function cellCardMovable(state: TombState, cell: number): boolean {
	const card = state.game.cells[cell];
	// Only a wound locks a cell: a spent card can still be picked up and played.
	if (!card || cellTopWounded(state, cell)) return false;
	if (!draftAt(state, cell)) return true;
	return cell === convertibleCell(state);
}

/** The column a click lands on whose top card is still fog. */
function foggedColumn(state: TombState, location: CardLocation): number | null {
	if (location.fixture !== 'cascade') return null;
	const column = state.game.tableau[location.data[0]] ?? [];
	const top = column[column.length - 1];
	return top && isFaceDown(state, top) ? location.data[0] : null;
}

/**
 * IMAWAL buys one illegal play: a single exposed card may be laid on top of a face-down card,
 * which normally blocks its whole column. The fog then stays face-down, buried for good.
 */
export function imawalCanBury(state: TombState, cards: Card[], to: CardLocation): boolean {
	if (state.armed?.kind !== 'imawal' || to.fixture !== 'cascade' || cards.length !== 1) return false;
	if (isFaceDown(state, cards[0])) return false;
	return foggedColumn(state, { fixture: 'cascade', data: [to.data[0], 0] }) !== null;
}

/**
 * The tomb's version of FreeCell's move limit: every card past the first in a run needs a free
 * cell to wait in, and the track's cells are the only ones there are. The Sack is the
 * one thing that ignores it.
 */
export function moveCapacity(state: TombState): number {
	return emptyCells(state).length + 1;
}

/** A proper stack: exactly two exposed cards, descending and alternating, at the bottom of a column. */
export function pisorfPair(state: TombState, from: CardLocation): Card[] | null {
	if (from.fixture !== 'cascade') return null;
	const run = tombRun(state, from);
	if (run.length !== 2 || !runReachesBottom(state, from, run)) return null;
	if (run.some((card) => isFaceDown(state, card) || frozenBoss(state, card))) return null;
	return run;
}

/** PISORF needs a proper pair and an open free cell to put it in. */
export function pisorfCanStack(state: TombState, from: CardLocation, cell: number): boolean {
	return !!pisorfPair(state, from) && !state.game.cells[cell];
}

export function canBuildOn(state: TombState, cards: Card[], to: CardLocation): boolean {
	if (!cards.length) return false;
	if (to.fixture === 'cell') {
		return cards.length === 1 && !state.game.cells[to.data[0]];
	}
	if (to.fixture !== 'cascade') return false;
	const column = state.game.tableau[to.data[0]] ?? [];
	if (!column.length) return true;
	const top = column[column.length - 1];
	if (isFaceDown(state, top)) return false;
	const bottom = cards[0];
	return (
		getRankForCompare(top.rank) === getRankForCompare(bottom.rank) + 1 && isRed(top.suit) !== isRed(bottom.suit)
	);
}

export interface FoundationCheck {
	legal: boolean;
	reason: string;
}

export function canSendHome(state: TombState, from: CardLocation, ignoreCover = false): FoundationCheck {
	const card = cardAt(state.game, from);
	if (!card) return { legal: false, reason: 'no card' };
	if (card.location.fixture === 'foundation') return { legal: false, reason: 'already home' };

	if (from.fixture === 'cell') {
		if (cellTopWounded(state, from.data[0])) return { legal: false, reason: 'wounded' };
		// Conversion runs in order: only the drafted item beside the chip may leave its slot.
		if (draftAt(state, from.data[0]) && from.data[0] !== convertibleCell(state)) {
			return { legal: false, reason: 'convert the item beside the chip first' };
		}
	} else {
		const column = state.game.tableau[from.data[0]] ?? [];
		const index = from.data[1];
		if (!ignoreCover && index !== column.length - 1) return { legal: false, reason: 'covered by another card' };
		if (isFaceDown(state, card)) return { legal: false, reason: 'face down' };
	}

	if (frozenBoss(state, card)) {
		return { legal: false, reason: 'boss king: frozen until one other king is home' };
	}

	const rank = rankOf(card.rank);
	const home = foundationTopRank(state, card.suit);
	const human = hasPassive(state, 'Human');
	const gap = human ? 2 : 1;
	// A Human may still slide a card under its pile: the pile keeps the higher card on top.
	if (rank === home || (rank < home && !human)) {
		return { legal: false, reason: 'foundation already past this rank' };
	}

	// A drafted card counts as already home, but only once it is the card this pile is really waiting
	// for: it opens the rank above it and never withholds the ranks below. A drafted three does not
	// open the four while the two is still buried, so no kill (or wound preview) is offered for a
	// card that is out of reach.
	const drafted = phantomCard(state, card.suit, cardId(card));
	const skip = !!drafted && rankOf(drafted.rank) === home + gap && rank === rankOf(drafted.rank) + 1;
	if (rank > home + gap && !skip) {
		return {
			legal: false,
			reason: home ? `foundation needs the ${home + 1 <= 13 ? home + 1 : 'next'} of this suit` : 'needs an ace',
		};
	}
	return { legal: true, reason: '' };
}

export interface AttackPreview {
	legal: boolean;
	reason: string;
	damage: number;
	/** Free cells this kill would lock (rightmost first). */
	locks: number[];
	/** Empty cells that would have to be filled first — the kill is one HP short. */
	need: number[];
	/**
	 * The track itself refuses this kill: it costs more hearts than you can spare at all, so no
	 * arrangement of the board pays it. The whole track reads as the blocker, empty cells included.
	 */
	fatal: boolean;
	/** The track cards that would turn face-down, in the order the wounds land. */
	wounds: string[];
}

export function attackPreview(state: TombState, from: CardLocation, reachThroughCover = false): AttackPreview {
	const card = cardAt(state.game, from);
	// BURNDAYRAZ burns any card it can see: the whole cover is ignored, however deep the card lies.
	// The aim is passed in explicitly too, because the spell is spent before the attack lands.
	const ignoreCover = reachThroughCover || (state.armed?.kind === 'burndayraz' && from.fixture === 'cascade');
	const check = canSendHome(state, from, ignoreCover);
	if (!card) return { legal: false, reason: check.reason, damage: 0, locks: [], need: [], fatal: false, wounds: [] };
	if (!check.legal)
		return { legal: false, reason: check.reason, damage: 0, locks: [], need: [], fatal: false, wounds: [] };

	const level = currentLevel(state);
	let damage = Math.max(0, rankOf(card.rank) - level);
	if (isBossMinion(state, card) && state.bossSuit === 'spades' && auraActive(state)) {
		damage = Math.max(0, rankOf(card.rank) + 1 - level);
	}
	// Bounty only pays for the pile you have pushed furthest: dumping a high card into a suit you
	// never touched still costs its full damage.
	if (hasPassive(state, 'Thief') && leadingFoundation(state, card.suit)) damage = 0;

	// The power spends the item's card before the kill's own wounds, so that wound is owed on top.
	const itemCell = auraItemWound(state, card, from);
	const total = damage + (itemCell === null ? 0 : 1);
	const free = hp(state);
	// One heart has to be left standing, so a kill can spend every heart but the last. An empty free
	// cell is not a heart until a card sits in it: it is where the track grows by one to absorb more.
	// A Revive buys the one wound the track cannot hold: that action may spend the last heart, and
	// the item is spent with it, so the reserve only applies when the spell is not armed.
	const revive = state.armed?.kind === 'revive';
	const short = Math.max(0, total - free + (revive ? 0 : 1));
	const legal = short === 0;
	const need = short ? emptyCells(state).slice(0, short) : [];
	const afterItem = itemCell === null ? state : woundCell(state, itemCell);
	const afterWounds = wound(afterItem, damage);
	const locks =
		legal
			? Array.from(new Set([...(itemCell === null ? [] : [itemCell]), ...afterWounds.locks]))
			: [];
	return {
		legal,
		reason: legal ? '' : `needs ${total} HP and one to spare, you have ${free}`,
		damage,
		locks,
		need,
		fatal: short > 0,
		wounds: legal ? woundCardIds(state, afterItem, itemCell, afterWounds.wounded) : [],
	};
}

/* ------------------------------------------------------------- mechanics */

function cloneWith(state: TombState, patch: Partial<TombState>): TombState {
	return { ...state, ...patch };
}

function relocate(state: TombState, moves: { id: string; to: CardLocation }[]): FreeCell {
	const targets = new Map(moves.map((move) => [move.id, move.to]));
	const moved = state.game.cards.map((card) => {
		const to = targets.get(cardId(card));
		return to ? { ...card, location: to } : card;
	});
	const cards = closeColumns(moved);
	const game = new FreeCell({ cellCount: state.game.cells.length, cascadeCount: state.game.tableau.length, cards });
	// Two cards can share a free cell: the slot always shows the top of the stack.
	game.cells.forEach((_, cell) => {
		game.cells[cell] = cellCards(cloneWith(state, { game }), cell).pop() ?? null;
	});
	return game;
}

/**
 * A card can leave the middle of a column — BURNDAYRAZ slays through cover — and the base game seats
 * its columns by index, so the hole would be left behind as a gap with nothing in it (and render as
 * an undefined card). Re-seat every column from the bottom up instead: the run that sat above the
 * gap closes it and keeps the order it already had.
 */
function closeColumns(cards: Card[]): Card[] {
	const columns = new Map<number, Card[]>();
	for (const card of cards) {
		if (card.location.fixture !== 'cascade') continue;
		const column = columns.get(card.location.data[0]) ?? [];
		column.push(card);
		columns.set(card.location.data[0], column);
	}
	const reseated = new Map<string, CardLocation>();
	for (const [index, column] of columns) {
		column
			.sort((a, b) => a.location.data[1] - b.location.data[1])
			.forEach((card, order) => {
				if (card.location.data[1] !== order) {
					reseated.set(cardId(card), { fixture: 'cascade', data: [index, order] });
				}
			});
	}
	if (!reseated.size) return cards;
	return cards.map((card) => {
		const to = reseated.get(cardId(card));
		return to ? { ...card, location: to } : card;
	});
}

/**
 * Damage wounds the rightmost face-up cards; inside a stack it fills from the bottom up, so the
 * first point turns over the card underneath and the next one turns over the top card.
 */
function wound(state: TombState, damage: number): { wounded: number[]; locks: number[] } {
	const wounded = [...state.wounded];
	const locks: number[] = [];
	let left = damage;
	for (let cell = wounded.length - 1; cell >= 0 && left > 0; cell--) {
		const cards = cellCards(state, cell).length;
		while (left > 0 && wounded[cell] < cards) {
			wounded[cell] += 1;
			left -= 1;
			if (!locks.includes(cell)) locks.push(cell);
		}
	}
	return { wounded, locks };
}

/**
 * The exact cards a blow would turn face-down: the aura item first, then the track right edge
 * inward. Inside a stack the bottom card turns before the one on top of it.
 */
function woundCardIds(state: TombState, afterItem: TombState, itemCell: number | null, after: number[]): string[] {
	const drained =
		itemCell === null
			? []
			: cellCards(state, itemCell)
					.slice(state.wounded[itemCell] ?? 0, (state.wounded[itemCell] ?? 0) + 1)
					.map((card) => shorthandCard(card));
	const turned = after.flatMap((count, cell) => {
		const stack = cellCards(afterItem, cell);
		const was = Math.min(stack.length, afterItem.wounded[cell] ?? 0);
		const now = Math.min(stack.length, count);
		return stack.slice(was, now).map((card) => shorthandCard(card));
	});
	return [...drained, ...turned];
}

/**
 * Healing flips wounds face-up again from the left edge inward, the reverse of the way a blow pays
 * them, so the wounded cards stay bunched against the right edge of the track. Every wounded card
 * needs its own heal.
 */
function heal(state: TombState, count: number): { wounded: number[]; healed: number } {
	const wounded = [...state.wounded];
	let healed = 0;
	for (let cell = 0; cell < wounded.length && healed < count; cell++) {
		while (wounded[cell] > 0 && healed < count) {
			wounded[cell] -= 1;
			healed += 1;
		}
	}
	return { wounded, healed };
}

/** The Elixir mends its own glyph: one of its wounds turns face-up and the spell un-exhausts. */
function healGlyph(state: TombState): TombState {
	const entry = state.draft.find((candidate) => candidate.role === 'glyph');
	if (!entry) return state;
	const wounded = [...state.wounded];
	if ((wounded[entry.cell] ?? 0) > 0) wounded[entry.cell] -= 1;
	return refreshGlyphs(cloneWith(state, { wounded }));
}

function refreshGlyphs(state: TombState): TombState {
	const glyphs = state.draft.filter((entry) => entry.role === 'glyph');
	if (!glyphs.length) return state;
	const exhausted = [...state.exhausted];
	let refreshed = false;
	glyphs.forEach((entry) => {
		if (!state.game.cells[entry.cell]) return;
		refreshed = refreshed || state.exhausted[entry.cell];
		exhausted[entry.cell] = false;
	});
	// A Wizard's window opens on a real refresh: tidying a glyph that was already fresh hands nothing
	// out, so there has to have been an exhaustion to spend for the free cast to be worth anything.
	const window = refreshed && hasPassive(state, 'Wizard');
	return cloneWith(state, { exhausted, freeCast: state.freeCast || window });
}

/** Golf score: every card still off the foundation counts against you, court cards as ten. */
export function tombScore(state: TombState): number {
	return -state.game.cards
		.filter((card) => card.location.fixture === 'cascade' || card.location.fixture === 'cell')
		.reduce((sum, card) => sum + Math.min(rankOf(card.rank), 10), 0);
}

/** Leave the dungeon: only on offer once the boss king is home. */
export function tombExit(state: TombState): TombState | null {
	if (state.won || !bossSlain(state)) return null;
	return cloneWith(state, { won: true, score: tombScore(state) });
}

/**
 * After any move: check for a level up (a free heal plus a glyph refresh) and a boss kill. Cards
 * are never turned over here — digging is the player's click, and a card they leave face down is
 * a heal kept in reserve.
 */
function settle(state: TombState, levelBefore: number): TombState {
	// A card leaving a stacked cell must not leave a wound behind on an empty slot.
	let next = closeFreeCast(
		closeItemWindow(
			cloneWith(state, {
				wounded: state.wounded.map((count, cell) => Math.min(count, cellCards(state, cell).length)),
			})
		)
	);

	if (!next.bossId) {
		const boss = firstRevealedKing(next.game.cards, next.hidden);
		if (boss) {
			next = cloneWith(next, {
				bossId: cardId(boss),
				bossSuit: boss.suit,
			});
		}
	}

	const level = currentLevel(next);
	if (level > levelBefore) {
		const result = heal(next, 1);
		next = cloneWith(next, {
			wounded: result.wounded,
		});
		next = refreshGlyphs(next);
	}

	// Nothing ends a run on its own any more: once the boss king is down the exit is on offer,
	// and the dungeon is only left when the player takes it.
	return next;
}

/**
 * Digging is always the player's click: a face-down card is only turned over when asked for, so
 * it can be kept face-down as a heal for later. An ordinary dig needs the card exposed at the	 * bottom of its column; an Elf (Insight) can reach under the pile.
 */
export function canRevealFaceDown(state: TombState, location: CardLocation): boolean {
	if (state.won || location.fixture !== 'cascade') return false;
	const card = cardAt(state.game, location);
	if (!card || !isFaceDown(state, card)) return false;
	if (hasPassive(state, 'Elf')) return true;
	const column = state.game.tableau[location.data[0]] ?? [];
	return column[column.length - 1] === card;
}

/** Reveal one face-down card as an exploration: it heals from the left edge of the track. */
export function revealFaceDown(state: TombState, location: CardLocation): TombState | null {
	if (!canRevealFaceDown(state, location)) return null;
	const card = cardAt(state.game, location)!;

	const hidden = state.hidden.filter((id) => id !== cardId(card));
	const perFlip = hasPassive(state, 'Priest') ? 2 : 1;
	const result = heal(state, perFlip);
	let next = cloneWith(state, { hidden, wounded: result.wounded });

	if (!next.bossId) {
		const boss = firstRevealedKing(next.game.cards, hidden);
		if (boss) {
			next = cloneWith(next, {
				bossId: cardId(boss),
				bossSuit: boss.suit,
			});
		}
	}

	return spendArmedItem(closeFreeCast(closeItemWindow(next)));
}

/** Same suit, or any card of the same colour for an Orc's Scavenger. */
function matchesItemSuit(state: TombState, card: Card, suit: Suit): boolean {
	return hasPassive(state, 'Orc') ? isRed(card.suit) === isRed(suit) : card.suit === suit;
}

/** Any action other than the feed closes a spent item slot for good. */
function closeItemWindow(state: TombState): TombState {
	return state.itemWindow ? cloneWith(state, { itemWindow: null }) : state;
}

/** Any action other than the free cast closes the Wizard's window. */
function closeFreeCast(state: TombState): TombState {
	return state.freeCast ? cloneWith(state, { freeCast: false }) : state;
}

/** A Remedy is spent by the action it covers: the arm clears and the item exhausts. */
function spendArmedItem(state: TombState): TombState {
	const armed = state.armed;
	if (armed?.kind !== 'remedy' && armed?.kind !== 'revive') return state;
	const exhausted = [...state.exhausted];
	exhausted[armed.cell] = true;
	return cloneWith(state, { exhausted, armed: null });
}

function consumeDraft(state: TombState, cell: number): DraftCard[] {
	return state.draft.filter((entry) => entry.cell !== cell);
}

/** The item a monster power drains: the Consumable under a Gorgon, the Glyph under a Wraith. */
export function auraItem(state: TombState): number | null {
	const role: DraftRole | null = state.bossSuit === 'clubs' ? 'consumable' : state.bossSuit === 'diamonds' ? 'glyph' : null;
	if (!role) return null;
	const entry = state.draft.find((candidate) => candidate.role === role);
	return entry ? entry.cell : null;
}

/** Turn one card of an item cell face-down, if it still has a face-up card to give. */
function woundCell(state: TombState, cell: number): TombState {
	const wounded = [...state.wounded];
	if ((wounded[cell] ?? 0) >= cellCards(state, cell).length) return state;
	wounded[cell] += 1;
	return cloneWith(state, { wounded });
}

/**
 * The item cell a kill drains before its own wounds, or null when there is nothing left to drain.
 * The aura exhausts that item (one already spent simply stays spent) and wounds it.
 */
export function auraItemWound(state: TombState, card: Card, from: CardLocation): number | null {
	if (!isBossMinion(state, card) || !auraActive(state)) return null;
	const cell = auraItem(state);
	if (cell === null) return null;
	// a card leaving that very cell takes the item with it: there is nothing left behind to drain
	if (from.fixture === 'cell' && from.data[0] === cell) return null;
	if ((state.wounded[cell] ?? 0) >= cellCards(state, cell).length) return null;
	return cell;
}

/**
 * A boss-suit minion carries its power wherever it leaves the board: sending one home kills it,
 * and parking one in a free cell sets the power off just the same. An armed Remedy covers either.
 */
function bossAura(state: TombState, card: Card): TombState {
	if (!isBossMinion(state, card) || !auraActive(state)) return state;
	switch (state.bossSuit) {
		case 'hearts': {
			// Poison digs anywhere, buried or not: it finds the deepest face-down card of the
			// rightmost column that still has fog, with no heal. Columns are scanned right to left,
			// and each column from its bottom card up.
			const tableau = state.game.tableau as Card[][];
			let poison: Card | undefined;
			for (let c = tableau.length - 1; c >= 0 && !poison; c--) {
				const column = tableau[c];
				for (let k = 0; k < column.length && !poison; k++) {
					const card = column[column.length - 1 - k];
					if (state.hidden.includes(cardId(card))) poison = card;
				}
			}
			if (!poison) return state;
			return cloneWith(state, { hidden: state.hidden.filter((id) => id !== cardId(poison)) });
		}
		case 'clubs':
		case 'diamonds': {
			// Burden and Mana Burn take the item itself: spent, and turned face-down as a wound.
			const cell = auraItem(state);
			if (cell === null) return state;
			const exhausted = [...state.exhausted];
			exhausted[cell] = true;
			return woundCell(cloneWith(state, { exhausted }), cell);
		}
		default:
			return state;
	}
}

/** Fill the cell a spent consumable's own card just vacated with a card of the same suit (or colour). */
function refillConsumable(state: TombState, cell: number, suit: Suit): TombState {
	const orc = hasPassive(state, 'Orc');
	const candidates = state.game.cards.filter((card) => {
		if (card.location.fixture !== 'cascade') return false;
		const column = state.game.tableau[card.location.data[0]] ?? [];
		if (column[column.length - 1] !== card) return false; // only cards already exposed on the board
		if (isFaceDown(state, card)) return false;
		return orc ? isRed(card.suit) === isRed(suit) : card.suit === suit;
	});
	const pick = candidates[0];
	if (!pick) {
		return state;
	}
	const game = relocate(state, [{ id: cardId(pick), to: { fixture: 'cell', data: [cell] } }]);
	return cloneWith(state, {
		game,
		draft: [
			...state.draft.filter((entry) => entry.cell !== cell),
			{ cell, role: 'consumable', id: cardId(pick), suit: pick.suit, name: CONSUMABLES[pick.suit].name, text: CONSUMABLES[pick.suit].text },
		],
	});
}

/* --------------------------------------------------------------- actions */

export function tombMove(state: TombState, from: CardLocation, to: CardLocation): TombState | null {
	if (state.won) return null;
	const cards = tombRun(state, from);
	if (!cards.length) return null;
	if (from.fixture === 'cascade' && !runReachesBottom(state, from, cards)) return null;
	// "Frozen" means no method at all: not a build, not a cell, not the foundation.
	if (cards.some((card) => frozenBoss(state, card))) return null;

	const source = from.fixture === 'cell' ? from.data[0] : -1;
	const entry = source >= 0 ? draftAt(state, source) : undefined;
	// An item only leaves its slot when it is the one beside the chip: conversions run in order.
	if (entry && source !== convertibleCell(state)) return null;

	// A spent item slot claims exactly one card on the very next action, and that card becomes
	// the new item. It is always the same ability: the suit has to match, or the colour for an Orc.
	const window = state.itemWindow;
	const feed =
		window &&
		!entry &&
		to.fixture === 'cell' &&
		to.data[0] === window.cell &&
		cards.length === 1 &&
		matchesItemSuit(state, cards[0], window.suit)
			? window
			: null;
	// Only a run the free cells could not carry spends the sack; a normal stack move leaves it armed.
	const overfull = cards.length > moveCapacity(state);
	const sack = state.armed?.kind === 'sack' && overfull;
	const bury = imawalCanBury(state, cards, to);

	if (source >= 0 && to.fixture === 'foundation') {
		// Home is always an option for the face-up card in a free cell: the chip's conversion order
		// only governs leaving the cell for the board, and canSendHome enforces it there.
		return cellTopWounded(state, source) ? null : attackWith(state, from);
	}

	if (source >= 0) {
		if (!cellCardMovable(state, source)) {
			// The two exceptions to a plain cell card staying put: feeding a spent item slot, and
			// laying it on fog with IMAWAL armed.
			if ((!feed && !bury) || cellTopWounded(state, source)) return null;
		}
	}

	if (to.fixture === 'foundation') return attackWith(state, from);
	if (!bury && !canBuildOn(state, cards, to)) return null;
	// A run longer than the free cells can hold only moves with the sack open.
	if (overfull && !sack) return null;

	const moves = cards.map((card, offset) => ({
		id: cardId(card),
		to:
			to.fixture === 'cell'
				? { fixture: 'cell' as const, data: [to.data[0]] }
				: { fixture: 'cascade' as const, data: [to.data[0], (state.game.tableau[to.data[0]]?.length ?? 0) + offset] },
	}));
	// Every action closes an older window unless this one claims it (or opens a fresh one below).
	// A run the sack carried, or a card buried on the fog, spends the arm; the item stays exhausted.
	let next = cloneWith(state, {
		game: relocate(state, moves),
		itemWindow: null,
		armed: sack || bury ? null : state.armed,
	});

	if (entry && source >= 0) {
		next = cloneWith(next, { draft: consumeDraft(next, source) });
	}

	if (feed) {
		const ability = ABILITY_TABLE[feed.role][cards[0].suit];
		const exhausted = [...next.exhausted];
		exhausted[feed.cell] = false;
		next = cloneWith(next, {
			exhausted,
			draft: [
				...next.draft,
				{ cell: feed.cell, role: feed.role, id: cardId(cards[0]), suit: cards[0].suit, name: ability.name, text: ability.text },
			],
		});
	}

	// A boss-suit minion parked in a free cell still sets off its power, and a Remedy covers that
	// park exactly as it covers a kill: the arm is checked here, not just inside the aura. A card
	// fed into a spent item slot becomes that item, so it is no longer a monster either way.
	if (from.fixture === 'cascade' && to.fixture === 'cell' && !feed && auraActive(next)) {
		for (const card of cards) next = bossAura(next, card);
	}

	next = settle(next, currentLevel(state));

	// An item played out to the board (not home) leaves its slot open for exactly one action.
	if (entry && source >= 0 && to.fixture === 'cascade') {
		next = cloneWith(next, { itemWindow: { cell: source, role: entry.role, suit: entry.suit } });
	}

	return spendArmedItem(next);
}

/** Send a card home, paying the HP cost and applying the boss aura. */
export function attackWith(state: TombState, from: CardLocation, reachThroughCover = false): TombState | null {
	const preview = attackPreview(state, from, reachThroughCover);
	if (!preview.legal) return null;
	const card = cardAt(state.game, from);
	if (!card) return null;

	const levelBefore = currentLevel(state);
	const wasCell = from.fixture === 'cell';
	const cellIndex = wasCell ? from.data[0] : -1;
	const entry = wasCell ? draftAt(state, cellIndex) : undefined;
	// Only the item's own card carries the item with it. A plain card can lie on top of an item slot,
	// and sending that one home leaves the item, its exhaustion and its restock window untouched.
	const itemCard = !!entry && entry.id === cardId(card);
	const spentConsumable = !!entry && itemCard && entry.role === 'consumable' && state.exhausted[cellIndex];

	let next = state;

	const foundation = foundationIndexOf(next.game, card.suit);
	next = cloneWith(next, {
		game: relocate(next, [{ id: cardId(card), to: { fixture: 'foundation', data: [foundation] } }]),
	});

	// Cell conversion: a draft card sent home is gone for good and the cell becomes plain.
	if (itemCard) {
		next = cloneWith(next, {
			draft: consumeDraft(next, cellIndex),
		});
	}

	next = bossAura(next, card);

	// The kill's own wounds are paid last, so a drained item is already face-down when they land.
	next = cloneWith(next, { wounded: wound(next, preview.damage).wounded });

	if (hasPassive(next, 'Wizard') && card.suit === 'clubs') {
		next = refreshGlyphs(next);
	}

	if (spentConsumable && entry) {
		next = refillConsumable(next, cellIndex, entry.suit);
	}

	const settled = spendArmedItem(settle(next, levelBefore));
	// An item sent home leaves its slot waiting for one action: a card of its suit (any card of the
	// colour, for an Orc) restocks the item and the chip stays put. Any other action drops the
	// window, so the chip steps left and the cell is ordinary from then on.
	if (!entry || !itemCard || settled.game.cells[cellIndex]) return settled;
	return cloneWith(settled, { itemWindow: { cell: cellIndex, role: entry.role, suit: entry.suit } });
}

/** Single click movement affordance: the best tableau build, if there is one. */
export function tombTapTargets(state: TombState, from: CardLocation): CardLocation[] {
	const cards = tombRun(state, from);
	if (!cards.length) return [];
	if (from.fixture === 'cascade' && !runReachesBottom(state, from, cards)) return [];
	if (from.fixture === 'cell' && !cellCardMovable(state, from.data[0])) return [];
	// A run the free cells cannot hold is not a single click away, sack or no sack.
	if (cards.length > moveCapacity(state) && state.armed?.kind !== 'sack') return [];
	const targets: CardLocation[] = [];
	state.game.tableau.forEach((column, index) => {
		const location: CardLocation = { fixture: 'cascade', data: [index, Math.max(0, column.length - 1)] };
		if (canBuildOn(state, cards, location)) targets.push(location);
	});
	return targets;
}

export function tombFirstCell(state: TombState): CardLocation | null {
	const cell = emptyCells(state)[0];
	return cell === undefined ? null : { fixture: 'cell', data: [cell] };
}

/* -------------------------------------------------------------- abilities */

export function abilityUsable(state: TombState, cell: number): boolean {
	const entry = draftAt(state, cell);
	return (
		!!entry &&
		!state.exhausted[cell] &&
		!state.wounded[cell] &&
		(entry.role === 'glyph' || entry.role === 'consumable') &&
		!state.armed &&
		!state.won
	);
}

export function useAbility(state: TombState, cell: number): TombState | null {
	if (!abilityUsable(state, cell)) return null;
	const entry = draftAt(state, cell)!;
	// A Wizard's Affinity: the Glyph cast made on the very move after a refresh costs no exhaustion.
	// This cast spends the window with it, so the one after it pays as usual.
	const free = hasPassive(state, 'Wizard') && state.freeCast && entry.role === 'glyph';
	state = closeFreeCast(state);
	const exhausted = [...state.exhausted];
	// A Remedy or a Revive is not spent by arming it: the action it covers is what exhausts it.
	if (entry.name !== 'Remedy' && entry.name !== 'Revive' && !free) exhausted[cell] = true;

	let next = cloneWith(state, { exhausted });
	switch (entry.name) {
		case 'Potion':
			// The Potion drinks for the whole track at once instead of being aimed at one wound.
			next = cloneWith(next, { wounded: next.wounded.map(() => 0) });
			break;
		case 'Elixir':
			next = healGlyph(next);
			break;
		case 'Remedy':
			next = cloneWith(next, { armed: { kind: 'remedy', cell } });
			break;
		case 'IMAWAL':
			next = cloneWith(next, { armed: { kind: 'imawal', cell } });
			break;
		case 'Sack':
		case 'BYSSEPS':
			next = cloneWith(next, { armed: { kind: 'sack', cell } });
			break;
		case 'Revive':
			next = cloneWith(next, { armed: { kind: 'revive', cell } });
			break;
		case 'BURNDAYRAZ':
		case 'PISORF':
		case 'WEYTWUT': {
			const kind = entry.name === 'BURNDAYRAZ' ? 'burndayraz' : entry.name === 'PISORF' ? 'pisorf' : 'weytwut';
			next = cloneWith(next, { armed: { kind, cell } });
			break;
		}
		default:
			break;
	}
	return closeItemWindow(next);
}

/**
 * Drag-and-drop version of an armed ability. A swap always takes the grabbed card and the card it
 * is dropped on, ignoring an earlier click, while a single-target ability just aims at the drop.
 */
export function armedDrop(state: TombState, from: CardLocation, to: CardLocation): TombState | null {
	if (!state.armed) return null;
	// The sack answers the drop itself: the grabbed run is the one it carries.
	if (state.armed.kind === 'sack') return tombMove(state, from, to);
	// IMAWAL answers the drop with the grabbed card laid on the fog.
	if (state.armed.kind === 'imawal') return tombMove(state, from, to);
	// A Remedy or Revive covers whatever action comes next, so a drop is just the action it covers.
	if (state.armed.kind === 'remedy' || state.armed.kind === 'revive') return tombMove(state, from, to);
	if (state.armed.kind === 'pisorf' || state.armed.kind === 'weytwut') {
		const cleared = state.armed.first
			? cloneWith(state, { armed: { ...state.armed, first: undefined } })
			: state;
		const picked = armedClick(cleared, from);
		return picked ? armedClick(picked, to) : null;
	}
	if (state.armed.kind === 'burndayraz') {
		// A drop onto a foundation spends the spell on the card in hand, however deeply it lay.
		if (to.fixture === 'foundation') return attackWith(cloneWith(state, { armed: null }), from, true);
		return armedClick(state, to);
	}
	return armedClick(state, to);
}

/** Put an armed ability away unspent: the cell it came from is released again. */
export function disarm(state: TombState): TombState {
	if (!state.armed) return state;
	const exhausted = [...state.exhausted];
	exhausted[state.armed.cell] = false;
	return closeItemWindow(cloneWith(state, { armed: null, exhausted }));
}

/**
 * Resolve a click while an ability is armed. BURNDAYRAZ burns a card it can see however deeply it
 * lies, IMAWAL lays a card on the fog, PISORF moves an exposed card anywhere, WEYTWUT swaps two.
 */
export function armedClick(state: TombState, location: CardLocation): TombState | null {
	state = closeItemWindow(state);
	if (!state.armed) return null;
	const armed = state.armed;

	// Clicking the card that armed the ability puts it away unspent instead of aiming it at itself.
	if (location.fixture === 'cell' && location.data[0] === armed.cell) return disarm(state);

	// A Remedy or Revive waits for the action it covers: clicks elsewhere leave it armed.
	if (armed.kind === 'remedy' || armed.kind === 'revive') return null;

	// The sack is a state rather than a target: it waits for the next stack move to carry.
	if (armed.kind === 'sack') return null;

	// IMAWAL takes a card first, then the fog it is laid on.
	if (armed.kind === 'imawal') {
		const column = foggedColumn(state, location);
		if (column !== null) {
			const card = armed.first ? state.game.cards.find((candidate) => cardId(candidate) === armed.first) : undefined;
			if (!card) return null;
			return tombMove(state, card.location, { fixture: 'cascade', data: [column] });
		}
		const card = cardAt(state.game, location);
		if (!card || isFaceDown(state, card)) return null;
		if (location.fixture === 'cell' && draftAt(state, location.data[0])) return null;
		return cloneWith(state, { armed: { ...armed, first: cardId(card) } });
	}

	if (armed.kind === 'pisorf') {
		// Second click: an open free cell takes the whole pair, two cards and two hearts.
		if (armed.first) {
			if (location.fixture !== 'cell') return null;
			const to = location.data[0];
			if (state.game.cells[to] || to === armed.cell) return null;
			const upper = state.game.cards.find((candidate) => cardId(candidate) === armed.first);
			const pair = upper ? pisorfPair(state, upper.location) : null;
			if (!pair) return null;
			const game = relocate(cloneWith(state, { armed: null }), [
				{ id: cardId(pair[0]), to: { fixture: 'cell', data: [to, 1] } },
				{ id: cardId(pair[1]), to: { fixture: 'cell', data: [to, 0] } },
			]);
			return settle(cloneWith(state, { game, armed: null }), currentLevel(state));
		}
		// First click: the head of a proper two-card stack.
		const pair = pisorfPair(state, location);
		const head = cardAt(state.game, location);
		if (!pair || !head) return null;
		return cloneWith(state, { armed: { ...armed, first: cardId(head) } });
	}

	// A draft card in its cell is never a target: an ability only aims at the board.
	if (location.fixture === 'cell') return null;

	if (armed.kind === 'burndayraz') {
		const card = cardAt(state.game, location);
		// Buried is fine, hidden is not: the spell has to see the card it burns.
		if (!card || isFaceDown(state, card) || location.fixture !== 'cascade') return null;
		return attackWith(cloneWith(state, { armed: null }), location, true);
	}

	// WEYTWUT: two exposed cards trade physical places.
	const card = cardAt(state.game, location);
	if (!card) return null;
	if (!armed.first) return cloneWith(state, { armed: { ...armed, first: cardId(card) } });
	if (armed.first === cardId(card)) return cloneWith(state, { armed: { ...armed, first: undefined } });
	const first = state.game.cards.find((candidate) => cardId(candidate) === armed.first);
	if (!first || isFaceDown(state, first) || isFaceDown(state, card)) return null;
	if (frozenBoss(state, first) || frozenBoss(state, card)) return null;
	const game = relocate(cloneWith(state, { armed: null }), [
		{ id: armed.first, to: card.location },
		{ id: cardId(card), to: first.location },
	]);
	return settle(cloneWith(state, { game, armed: null }), currentLevel(state));
}

/** Auto to home for the tomb: send everything the rules allow, in priority order. */
export function tombHomeAll(state: TombState): TombState {
	let next = state;
	for (let pass = 0; pass < 60; pass++) {
		const moved = next;
		const candidates = next.game.cards.filter((card) => card.location.fixture !== 'foundation');
		let applied: TombState | null = null;
		for (const card of candidates) {
			const target = attackWith(next, card.location);
			if (target) {
				applied = target;
				break;
			}
		}
		if (!applied || applied === moved) break;
		next = applied;
	}
	return next;
}
