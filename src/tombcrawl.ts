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

export const TOMB_CELL_COUNT = 7;
export const TOMB_CASCADE_COUNT = 8;
const DRAFT_CELL_COUNT = 4;

export type DraftRole = 'race' | 'class' | 'glyph' | 'consumable';

export const ROLE_LABEL: Record<DraftRole, string> = {
	race: 'Race · passive',
	class: 'Class · passive',
	glyph: 'Glyph · active, refreshes on level up',
	consumable: 'Consumable · active, refilled by playing it home',
};

interface Ability {
	name: string;
	text: string;
}

const RACES: Record<Suit, Ability> = {
	spades: {
		name: 'Orc',
		text: 'Scavenger: when a Consumable refills, any card of the same colour will do.',
	},
	hearts: {
		name: 'Human',
		text: 'Ignore up to two missing ranks when placing a card on a foundation.',
	},
	clubs: {
		name: 'Elf',
		text: 'Rootsight: reach under the fog and reveal any face-down card, even a buried one, to explore it.',
	},
	diamonds: {
		name: 'Dwarf',
		text: 'The boss king has no protection: kill it without sending another king home first.',
	},
};

const CLASSES: Record<Suit, Ability> = {
	spades: {
		name: 'Fighter',
		text: 'Killing an enemy ranked above your level triggers a free heal.',
	},
	hearts: {
		name: 'Priest',
		text: 'Exploration heals two exhausted cells instead of one.',
	},
	clubs: {
		name: 'Wizard',
		text: 'Sending a club home immediately refreshes your Glyph.',
	},
	diamonds: {
		name: 'Thief',
		text: 'Backstab: killing from a free cell, or a lone column card, costs no HP.',
	},
};

const GLYPHS: Record<Suit, Ability> = {
	spades: {
		name: 'GETINDARE',
		text: 'Spend to attack an enemy even with one card stacked on top of it.',
	},
	hearts: {
		name: 'CYDSTEPP',
		text: 'Spend to make your next attack cost no HP.',
	},
	clubs: {
		name: 'PISORF',
		text: 'Spend, then choose a card and a column: it moves there, ignoring build rules.',
	},
	diamonds: {
		name: 'WEYTWUT',
		text: 'Spend, then choose two exposed cards: they trade places.',
	},
};

const CONSUMABLES: Record<Suit, Ability> = {
	spades: {
		name: 'Key',
		text: 'Spend, then choose a face-down card: it turns face-up without an exploration heal.',
	},
	hearts: {
		name: 'Potion',
		text: 'Spend to heal one exhausted free cell.',
	},
	clubs: {
		name: 'Elixir',
		text: 'Spend to refresh your exhausted Glyph.',
	},
	diamonds: {
		name: 'Cure-All',
		text: 'Spend to ignore the boss-suit aura for your current level.',
	},
};

const ABILITY_TABLE: Record<DraftRole, Record<Suit, Ability>> = {
	race: RACES,
	class: CLASSES,
	glyph: GLYPHS,
	consumable: CONSUMABLES,
};

const ROLES_BY_DRAW_ORDER: DraftRole[] = ['race', 'class', 'glyph', 'consumable'];

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
	kind: 'getindare' | 'key' | 'pisorf' | 'weytwut';
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
	/** State 2: a cell card turned on its side. Exhausted cells are locked and spent HP. */
	exhausted: boolean[];
	won: boolean;
	/** Golf total, set when the player leaves through the exit. */
	score: number | null;
	nextAttackFree: boolean;
	/** Level at which a Cure-All was spent; the aura is ignored while the level matches. */
	curedLevel: number | null;
	armed: ArmedAbility | null;
	/** A spent item slot: feed it a matching card on the very next action to remake the item. */
	itemWindow: { cell: number; role: DraftRole; suit: Suit } | null;
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

export function createTombState(seed = randomTombSeed()): TombState {
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
	const game = new FreeCell({ cellCount: TOMB_CELL_COUNT, cascadeCount: TOMB_CASCADE_COUNT, cards });

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
		exhausted: new Array(TOMB_CELL_COUNT).fill(false),
		won: false,
		score: null,
		nextAttackFree: false,
		curedLevel: null,
		armed: null,
		itemWindow: null,
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
	return state.draft.some((entry) => entry.name === name && (entry.role === 'race' || entry.role === 'class'));
}

export function hasGlyph(state: TombState, name: string): boolean {
	return state.draft.some((entry) => entry.name === name && entry.role === 'glyph');
}

export function playerLevel(game: FreeCell): number {
	// The delver starts at level 1: an empty foundation counts as its ace, so the first level up
	// only arrives once every suit has reached its two.
	const ranks = game.foundations.map((card) => (card ? rankOf(card.rank) : 1));
	return ranks.length ? Math.min(...ranks) : 1;
}

export function currentLevel(state: TombState): number {
	return playerLevel(state.game);
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
	clubs: { name: 'Gorgon', power: 'Burden', text: 'killing this exhausts your Consumable.' },
	diamonds: { name: 'Wraith', power: 'Mana Burn', text: 'killing this exhausts your Glyph.' },
};

/** The aura is off only while a Cure-All is active for this level. */
export function auraActive(state: TombState): boolean {
	if (state.curedLevel !== null && state.curedLevel === currentLevel(state)) return false;
	return true;
}

export function verticalCells(state: TombState): number[] {
	return state.game.cells
		.map((card, index) => ({ card, index }))
		.filter(({ card, index }) => !!card && !state.exhausted[index])
		.map(({ index }) => index);
}

export function emptyCells(state: TombState): number[] {
	return state.game.cells.map((card, index) => (card ? -1 : index)).filter((index) => index >= 0);
}

export function hp(state: TombState): number {
	return verticalCells(state).length;
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
}

export function foundationTopRank(state: TombState, suit: Suit): number {
	const card = state.game.foundations.find((candidate) => candidate?.suit === suit);
	return card ? rankOf(card.rank) : 0;
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

/** Only a drafted card leaves its cell for the board; a plain card leaves by going home. */
export function cellCardMovable(state: TombState, cell: number): boolean {
	const card = state.game.cells[cell];
	if (!card || state.exhausted[cell]) return false;
	return !!draftAt(state, cell); // Cell Conversion is always available
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
		if (state.exhausted[from.data[0]]) return { legal: false, reason: 'cell exhausted' };
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
	const gap = hasPassive(state, 'Human') ? 3 : 1;
	if (rank <= home) return { legal: false, reason: 'foundation already past this rank' };

	// A drafted card in a free cell opens the rank above it, but never withholds the ranks below:
	// the suit can still be built up from its ace while that card sits out of the foundation.
	const drafted = phantomCard(state, card.suit, cardId(card));
	const skip = !!drafted && rank === rankOf(drafted.rank) + 1;
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
}

export function attackPreview(state: TombState, from: CardLocation): AttackPreview {
	const card = cardAt(state.game, from);
	const check = canSendHome(state, from);
	if (!card) return { legal: false, reason: check.reason, damage: 0, locks: [], need: [] };
	if (!check.legal) return { legal: false, reason: check.reason, damage: 0, locks: [], need: [] };

	const level = currentLevel(state);
	let damage = Math.max(0, rankOf(card.rank) - level);
	if (isBossMinion(state, card) && state.bossSuit === 'spades' && auraActive(state)) {
		damage = Math.max(0, rankOf(card.rank) + 1 - level);
	}
	if (state.nextAttackFree) damage = 0;
	const loneColumn = from.fixture === 'cascade' && (state.game.tableau[from.data[0]]?.length ?? 0) === 1;
	if (hasPassive(state, 'Thief') && (from.fixture === 'cell' || loneColumn)) damage = 0;

	const free = verticalCells(state).sort((a, b) => b - a);
	const locks = free.slice(0, Math.min(damage, free.length));
	const need = damage > free.length ? emptyCells(state).slice(0, damage - free.length) : [];
	return {
		legal: damage <= free.length,
		reason: damage > free.length ? `needs ${damage} HP, you have ${free.length}` : '',
		damage,
		locks,
		need,
	};
}

/* ------------------------------------------------------------- mechanics */

function cloneWith(state: TombState, patch: Partial<TombState>): TombState {
	return { ...state, ...patch };
}

function relocate(state: TombState, moves: { id: string; to: CardLocation }[]): FreeCell {
	const targets = new Map(moves.map((move) => [move.id, move.to]));
	const cards = state.game.cards.map((card) => {
		const to = targets.get(cardId(card));
		return to ? { ...card, location: to } : card;
	});
	return new FreeCell({ cellCount: state.game.cells.length, cascadeCount: state.game.tableau.length, cards });
}

function exhaust(state: TombState, count: number): boolean[] {
	const next = [...state.exhausted];
	verticalCells(state)
		.sort((a, b) => b - a)
		.slice(0, count)
		.forEach((cell) => {
			next[cell] = true;
		});
	return next;
}

/** Healing runs from the right edge, like a Zelda heart bar. */
function heal(exhausted: boolean[], count: number): { exhausted: boolean[]; healed: number } {
	const next = [...exhausted];
	let healed = 0;
	for (let i = next.length - 1; i >= 0 && healed < count; i--) {
		if (next[i]) {
			next[i] = false;
			healed++;
		}
	}
	return { exhausted: next, healed };
}

function refreshGlyphs(state: TombState): TombState {
	if (!state.draft.some((entry) => entry.role === 'glyph')) return state;
	const exhausted = [...state.exhausted];
	state.draft
		.filter((entry) => entry.role === 'glyph')
		.forEach((entry) => {
			if (state.game.cells[entry.cell]) exhausted[entry.cell] = false;
		});
	return cloneWith(state, { exhausted });
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
	let next = closeItemWindow(state);

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
		const result = heal(next.exhausted, 1);
		next = cloneWith(next, {
			exhausted: result.exhausted,
		});
		next = refreshGlyphs(next);
	}

	// Nothing ends a run on its own any more: once the boss king is down the exit is on offer,
	// and the dungeon is only left when the player takes it.
	return next;
}

/**
 * Digging is always the player's click: a face-down card is only turned over when asked for, so
 * it can be kept face-down as a heal for later. An ordinary dig needs the card exposed at the
 * bottom of its column; an Elf (Rootsight) can reach under the pile.
 */
export function canRevealFaceDown(state: TombState, location: CardLocation): boolean {
	if (state.won || location.fixture !== 'cascade') return false;
	const card = cardAt(state.game, location);
	if (!card || !isFaceDown(state, card)) return false;
	if (hasPassive(state, 'Elf')) return true;
	const column = state.game.tableau[location.data[0]] ?? [];
	return column[column.length - 1] === card;
}

/** Reveal one face-down card as an exploration: it heals from the right edge. */
export function revealFaceDown(state: TombState, location: CardLocation): TombState | null {
	if (!canRevealFaceDown(state, location)) return null;
	const card = cardAt(state.game, location)!;

	const hidden = state.hidden.filter((id) => id !== cardId(card));
	const perFlip = hasPassive(state, 'Priest') ? 2 : 1;
	const result = heal(state.exhausted, perFlip);
	let next = cloneWith(state, { hidden, exhausted: result.exhausted });

	if (!next.bossId) {
		const boss = firstRevealedKing(next.game.cards, hidden);
		if (boss) {
			next = cloneWith(next, {
				bossId: cardId(boss),
				bossSuit: boss.suit,
			});
		}
	}

	return closeItemWindow(next);
}

/** Same suit, or any card of the same colour for an Orc's Scavenger. */
function matchesItemSuit(state: TombState, card: Card, suit: Suit): boolean {
	return hasPassive(state, 'Orc') ? isRed(card.suit) === isRed(suit) : card.suit === suit;
}

/** Any action other than the feed closes a spent item slot for good. */
function closeItemWindow(state: TombState): TombState {
	return state.itemWindow ? cloneWith(state, { itemWindow: null }) : state;
}

function consumeDraft(state: TombState, cell: number): DraftCard[] {
	return state.draft.filter((entry) => entry.cell !== cell);
}

function bossAura(state: TombState, card: Card, fromCell: boolean): TombState {
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
		case 'clubs': {
			const entry = state.draft.find((candidate) => candidate.role === 'consumable');
			if (!entry) return state;
			const exhausted = [...state.exhausted];
			exhausted[entry.cell] = true;
			return cloneWith(state, { exhausted });
		}
		case 'diamonds': {
			const entry = state.draft.find((candidate) => candidate.role === 'glyph');
			if (!entry) return state;
			const exhausted = [...state.exhausted];
			exhausted[entry.cell] = true;
			return cloneWith(state, { exhausted });
		}
		default:
			return state;
	}
}

/** Fill the cell a spent consumable just vacated with a card of the same suit (or colour). */
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

	if (source >= 0) {
		if (!cellCardMovable(state, source)) {
			// The one exception to a plain cell card staying put: feeding a spent item slot.
			if (!feed || state.exhausted[source]) return null;
		}
		if (to.fixture === 'foundation') return attackWith(state, from);
	}

	if (to.fixture === 'foundation') return attackWith(state, from);
	if (!canBuildOn(state, cards, to)) return null;

	const moves = cards.map((card, offset) => ({
		id: cardId(card),
		to:
			to.fixture === 'cell'
				? { fixture: 'cell' as const, data: [to.data[0]] }
				: { fixture: 'cascade' as const, data: [to.data[0], (state.game.tableau[to.data[0]]?.length ?? 0) + offset] },
	}));
	// Every action closes an older window unless this one claims it (or opens a fresh one below).
	let next = cloneWith(state, { game: relocate(state, moves), itemWindow: null });

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

	next = settle(next, currentLevel(state));

	// An item played out to the board (not home) leaves its slot open for exactly one action.
	if (entry && source >= 0 && to.fixture === 'cascade') {
		next = cloneWith(next, { itemWindow: { cell: source, role: entry.role, suit: entry.suit } });
	}

	return next;
}

/** Send a card home, paying the HP cost and applying the boss aura. */
export function attackWith(state: TombState, from: CardLocation): TombState | null {
	const preview = attackPreview(state, from);
	if (!preview.legal) return null;
	const card = cardAt(state.game, from);
	if (!card) return null;

	const levelBefore = currentLevel(state);
	const wasCell = from.fixture === 'cell';
	const cellIndex = wasCell ? from.data[0] : -1;
	const entry = wasCell ? draftAt(state, cellIndex) : undefined;
	const spentConsumable = entry?.role === 'consumable' && state.exhausted[cellIndex];

	let next = cloneWith(state, {
		exhausted: exhaust(state, preview.damage),
		nextAttackFree: preview.damage === 0 && state.nextAttackFree ? false : state.nextAttackFree,
	});

	const foundation = foundationIndexOf(next.game, card.suit);
	next = cloneWith(next, {
		game: relocate(next, [{ id: cardId(card), to: { fixture: 'foundation', data: [foundation] } }]),
	});

	// Cell conversion: a draft card sent home is gone for good and the cell becomes plain.
	if (entry) {
		next = cloneWith(next, {
			draft: consumeDraft(next, cellIndex),
		});
	}

	next = bossAura(next, card, wasCell);

	if (hasPassive(next, 'Fighter') && rankOf(card.rank) > levelBefore) {
		const result = heal(next.exhausted, 1);
		next = cloneWith(next, { exhausted: result.exhausted });
	}
	if (hasPassive(next, 'Wizard') && card.suit === 'clubs') {
		next = refreshGlyphs(next);
	}

	if (spentConsumable && entry) {
		next = refillConsumable(next, cellIndex, entry.suit);
	}

	return settle(next, levelBefore);
}

/** Single click movement affordance: the best tableau build, if there is one. */
export function tombTapTargets(state: TombState, from: CardLocation): CardLocation[] {
	const cards = tombRun(state, from);
	if (!cards.length) return [];
	if (from.fixture === 'cascade' && !runReachesBottom(state, from, cards)) return [];
	if (from.fixture === 'cell' && !cellCardMovable(state, from.data[0])) return [];
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
	return !!entry && !state.exhausted[cell] && (entry.role === 'glyph' || entry.role === 'consumable') && !state.armed && !state.won;
}

export function useAbility(state: TombState, cell: number): TombState | null {
	if (!abilityUsable(state, cell)) return null;
	const entry = draftAt(state, cell)!;
	const exhausted = [...state.exhausted];
	exhausted[cell] = true;

	let next = cloneWith(state, { exhausted });
	switch (entry.name) {
		case 'Potion': {
			const result = heal(next.exhausted, 1);
			next = cloneWith(next, { exhausted: result.exhausted });
			break;
		}
		case 'Elixir':
			next = refreshGlyphs(next);
			break;
		case 'Cure-All':
			next = cloneWith(next, { curedLevel: currentLevel(next) });
			break;
		case 'CYDSTEPP':
			next = cloneWith(next, { nextAttackFree: true });
			break;
		case 'GETINDARE':
		case 'Key':
		case 'PISORF':
		case 'WEYTWUT': {
			const kind = entry.name === 'GETINDARE' ? 'getindare' : entry.name === 'Key' ? 'key' : entry.name === 'PISORF' ? 'pisorf' : 'weytwut';
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
	if (state.armed.kind === 'pisorf' || state.armed.kind === 'weytwut') {
		const cleared = state.armed.first
			? cloneWith(state, { armed: { ...state.armed, first: undefined } })
			: state;
		const picked = armedClick(cleared, from);
		return picked ? armedClick(picked, to) : null;
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
 * Resolve a click while an ability is armed. GETINDARE attacks a card exactly one card deep,
 * Key flips a face-down card, PISORF moves an exposed card anywhere, WEYTWUT swaps two cards.
 */
export function armedClick(state: TombState, location: CardLocation): TombState | null {
	state = closeItemWindow(state);
	if (!state.armed) return null;
	const armed = state.armed;

	// Clicking the card that armed the ability puts it away unspent instead of aiming it at itself.
	if (location.fixture === 'cell' && location.data[0] === armed.cell) return disarm(state);

	// A draft card in its cell is never a target: an ability only aims at the board.
	if (location.fixture === 'cell') return null;

	if (armed.kind === 'getindare') {
		const card = cardAt(state.game, location);
		if (!card) return null;
		const coveredByOne =
			location.fixture === 'cascade' &&
			(state.game.tableau[location.data[0]]?.length ?? 0) === location.data[1] + 2;
		if (!coveredByOne) return null;
		const next = cloneWith(state, { armed: null });
		return attackWith(next, location);
	}

	if (armed.kind === 'key') {
		const card = cardAt(state.game, location);
		if (!card || !isFaceDown(state, card)) return null;
		return cloneWith(state, {
			hidden: state.hidden.filter((id) => id !== cardId(card)),
			armed: null,
		});
	}

	if (armed.kind === 'pisorf') {
		const card = cardAt(state.game, location);
		if (!card) return null;
		if (!armed.first) return cloneWith(state, { armed: { ...armed, first: cardId(card) } });
		const first = state.game.cards.find((candidate) => cardId(candidate) === armed.first);
		if (!first || isFaceDown(state, first) || frozenBoss(state, first)) return null;
		const fromColumn = first.location.fixture === 'cascade' ? first.location.data[0] : -1;
		const toColumn = location.fixture === 'cascade' ? location.data[0] : -1;
		if (toColumn < 0 || fromColumn === toColumn) return null;
		const game = relocate(cloneWith(state, { armed: null }), [
			{ id: armed.first, to: { fixture: 'cascade', data: [toColumn, state.game.tableau[toColumn].length] } },
		]);
		return settle(cloneWith(state, { game, armed: null }), currentLevel(state));
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
