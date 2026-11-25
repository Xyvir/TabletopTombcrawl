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

/** The drafted party always fills the first four cells, one per role. */
export const DRAFT_CELL_COUNT = 4;
/** Free cells past the party: the difficulty knob, and the size of the HP track. */
/** Free pockets beside the four drafted ones: three on the baseline, two on a legacy hard deal. */
export const FREE_CELL_COUNT: Record<Difficulty, number> = { med: 3, hard: 2 };
/** The baseline and its legacy harder deal. Easy is retired; the Dwarf's extra pocket is the easy mode. */
export type Difficulty = 'med' | 'hard';
/** The default track: four drafted items and three free cells. */
export const TOMB_CELL_COUNT = DRAFT_CELL_COUNT + FREE_CELL_COUNT.med;
export const TOMB_CASCADE_COUNT = 8;

/**
 * Tunable rules, so a balance experiment can be run without forking the engine. The shipped game runs
 * these defaults; only a tuning run in the solver changes them, and only for that process.
 */
export const TOMB_RULES = {
	/** Hearts a level up mends. The card game this borrows from healed fully. */
	levelUpHeal: 1,
	/**
	 * Wounds one conversion mends. One is the whole of the endgame's supply: four hero aspects, four kings,
	 * four hearts of bill, and no slack at all — and convert-first spends the opener on a healthy board,
	 * so the spare has to come from fog the crawl held on purpose.
	 */
	conversionHeal: 1,
	/**
	 * The most hearts one kill may cost, or 0 for no ceiling. Damage is rank minus level, so the
	 * ceiling only ever bites at low levels, where a single high card would otherwise end the run.
	 *
	 * Zero on the baseline: a card over a lagging level costs its whole rank, so a king you cannot
	 * afford is a wall rather than a bill, and some crawls may simply be unsolvable. Experiments may
	 * set a cap; the retired easy track used two, which was the whole of the arithmetic its table
	 * had to do.
	 */
	levelDamageCap: 0,
	/**
	 * The highest level the delver can read, or 0 for no ceiling. A cap stops the level-ups above it (and
	 * the heals and glyph refreshes they carry), so the cards ranked over the cap keep charging damage.
	 *
	 * Twelve ships: level 12 needs all four jacks home, so the cap prices only the last eight cards of a
	 * crawl — a queen is free, a king costs one — and the endgame stops being a formality without moving
	 * a single midgame blow. Set 0 to play the old uncapped game.
	 */
	levelCap: 12,
	/**
	 * The highest level a blow reads, or 0 for no ceiling. Unlike `levelCap`, the delver keeps levelling:
	 * the heals and glyph refreshes are untouched, and only the damage reduction stops here.
	 */
	damageLevelCap: 0,
	/**
	 * Minimum damage a court card (jack, queen, king) deals however high the level climbs, or 0 for none.
	 * Applied before Aggression, so a free kill stays free.
	 */
	courtFloor: 0,
	/**
	 * Whether a movement glyph may carry the boss king: no hand ever shifts him, but a spell can lift him
	 * out of the way, which frees the column he was sitting on. Killing him is a separate gate (his
	 * Generals), so a fallen General opens the blade and leaves the hand shut.
	 */
	glyphMoveBoss: true,
};

/**
 * Clause switches: every ability that does more than one thing is split into named clauses here, so a
 * simplification can be proposed, measured and only then implemented. The shipped game runs with all
 * of them on and nothing in the app ever turns one off; a harness process flips them for a run, which
 * is the difference between "this rule is too fiddly" and "this rule is too fiddly *and* we can afford
 * to lose it" — the answer only ever comes from seeds that were already winnable.
 */
export const CLAUSES = {
	/** Human: ignore the lowest grave when reading your level. */
	humanLevel: true,
	/**
	 * Thief: a spent item slot restocked after its card was slain into a grave takes any card, while one
	 * restocked after its card was played into the crypt takes another suit — never the suit that left.
	 * Retired with the explicit conversion: the level-up swap below is the ability now. The clause stays
	 * so the old window can still be switched back on in a test, and nothing in the shipped game reads it.
	 */
	thiefPickpocket: false,
	/** A boss-suit minion sets its power off when it is parked in a free cell, not only when slain. */
	bossAuraPark: true,
	/** Stone Gaze: a boss-suit minion turns the party's kin and class to stone instead of adding a rank. */
	stoneGaze: true,
	/**
	 * Mug: a bandit forces the conversion a step early — the chip walks one slot left with no heal.
	 * The card stays where it lies as a plain card, exactly as a conversion by hand leaves it, minus the
	 * mend. A wound over the slot locks it, so the bandit takes nothing: the counterplay is arriving
	 * wounded, the same bargain a Wraith offers.
	 */
	banditMug: true,
	/**
	 * Mug spares a blow that completes a rank: the level up lifts the delver before the bandit reaches the
	 * chip, so the aspect beside it stands and the chip does not move. Mug is the one power whose price no
	 * heal can buy back, and the level up is the heal that arrives with the kill that would have taken it.
	 * Every other power still fires on that blow — only the permanent price is refunded.
	 */
	mugLevelSparing: true,
	/**
	 * Every king is a lesser king of the boss: it carries the boss suit's power, whatever its own suit is,
	 * the way a euchre bower answers to the trump. That keeps one aura per deal to learn, felt by the
	 * court and by all four kings rather than by a quarter of the deck.
	 */
	kingPowers: true,
	/**
	 * Orc: a kill into the leading grave is free. A finished grave still leads — nothing out-ranks a
	 * king — so the first suit to go all the way home ends Aggression for the rest of the run.
	 */
	orcAggression: true,
	/** Wizard: the item slot becomes a second glyph slot, spelling from its own suit. */
	wizardDualcast: true,
	/** Dwarf: the crawl opens one pocket wider than the track allows. */
	dwarfConstitution: true,
	/** A free cell holding two cards is worth two hearts rather than one. */
	pisorfStack: true,
	/**
	 * The search drops a board reached with an item spent when the same board was already reached with that item
	 * in hand. Exhaustion gates the ability and nothing else — a spent card is still playable out of its slot — so
	 * the unspent twin has every move the spent one has and the branch below it is wasted budget. Sound, and it
	 * fired zero times in a 40k-node A/B over 16 proved seeds: positions differing only in the spent bits are not
	 * being reached twice at that scale. Off until a deeper sweep says otherwise.
	 */
	spentDominance: false,
	/**
	 * The search drops a board that has dug a card when the same board (fog aside) was reached with that card
	 * still face down. Not a rule: a dug card is a heal taken, a Venom target and a clogged hallway avoided,
	 * while the fog is a heal still banked. It is a bet that fog kept is worth more than fog spent, and it is
	 * off until a sweep measures it.
	 */
	fogDominance: false,
	/**
	 * Wraith: Mana Burn drains the glyph slot rather than the Glyph item, so a slot the chip has stepped
	 * past is still bitten instead of going quiet.
	 */
	wraithSlot: false,
	/**
	 * The conversion is explicit: clicking the Hero Chip is the only way a hero aspect ever leaves its slot. It
	 * spends the ability for good, leaves the card lying in the pocket as a plain card, walks the chip one
	 * step left and mends a wound as a bonus. A drafted card is never picked up, parked, played out or sent
	 * home, and no refill window opens — the chip is the conversion, not a tracker for one made somewhere else.
	 * Switched off, the old rules come back: a card beside the chip could be played out for free.
	 */
	explicitConversion: true,
	/**
	 * Pickpocket, rewritten for the explicit conversion: a level up opens a one-action window in which the
	 * item pocket trades its card with an exposed card of the tableau. It replaces the retired refill
	 * window, so the two abilities are switched together.
	 */
	pickpocketSwap: true,
};

export type ClauseName = keyof typeof CLAUSES;

export type DraftRole = 'kin' | 'class' | 'glyph' | 'consumable';

export const ROLE_LABEL: Record<DraftRole, string> = {
	kin: 'Kin trait · always on',
	class: 'Class skill · always on',
	glyph: 'Glyph spell · armed, spends on use, refreshes on level up',
	consumable: 'Item effect · spent once, restocked after it is slain',
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

export interface Ability {
	name: string;
	text: string;
}

/**
 * Who the four kin are, by the suit of the kin card. The pairing is thematic before it is mechanical:
 * orcs swing clubs, elves have the pointed diamonds on their ears, and dwarves go to work with a
 * spade. Behaviour is keyed on the kin's name, not on the suit, so a kin and its card can be re-paired
 * without touching a single rule.
 */
const KIN: Record<Suit, Ability> = {
	hearts: {
		name: 'Human',
		text: 'Intuition: ignore your lowest grave when calculating your level.',
	},
	clubs: {
		name: 'Orc',
		text: 'Aggression: slaying into the fullest grave inflicts no wounds.',
	},
	diamonds: {
		name: 'Elf',
		text: 'Perception: slay or reveal any card in a hallway whose cover is nothing but exposed number cards. Fog and face cards turn the shot aside.',
	},
	spades: {
		name: 'Dwarf',
		text: 'Constitution: the crawl opens with one pocket more than the track allows.',
	},
};

const CLASSES: Record<Suit, Ability> = {
	spades: {
		name: 'Fighter',
		text: 'Powerstrike: send a card home skipping one missing rank.',
	},
	hearts: {
		name: 'Priest',
		text: 'Bloodgift: every dig and every level up heals two wounds instead of one.',
	},
	clubs: {
		name: 'Wizard',
		text: 'Dualcast: the item aspect holds a second glyph in place of an item, spelling from its own suit. Both refresh on a level up, and a Wraith drains them both.',
	},
	diamonds: {
		name: 'Thief',
		text: 'Pickpocket: a level up opens a one-action window. Arm the item pocket, then click an exposed card: the two trade places, and the card you took becomes the item, spelling from its own suit. A spent item comes back fresh, because exhaustion does not exist on the tableau.',
	},
};

const GLYPHS: Record<Suit, Ability> = {
	spades: {
		name: 'BYSSEPS',
		text: 'Arm, then move a valid stack of any size, even one your pockets could not carry. Spent by that move.',
	},
	hearts: {
		name: 'CYDSTEPP',
		text: 'Arm to play a run your pockets could carry on top of a fogged card, as if it were an empty hallway. Also sets the boss down in an empty hallway, which spends it.',
	},
	clubs: {
		name: 'PISORF',
		text: 'Arm, then send a proper stack of two cards into one open pocket: two cards, two hearts.',
	},
	diamonds: {
		name: 'WEYTWUT',
		text: 'Arm, then choose two exposed cards: they trade places.',
	},
};

/** Purity buries the mouth of a hallway rather than the whole lane: three heals, not a hallway's bank. */
const PURITY_REFOG_CARDS = 3;

const CONSUMABLES: Record<Suit, Ability> = {
	spades: {
		name: 'Purity',
		text: 'Arm, then turn the three bottommost unfogged cards of a hallway to fog. Fog already there does not count against the three, and the boss is not a card the spell can touch.',
	},
	hearts: {
		name: 'Potion',
		text: 'Drink to heal every wound on the status track at once.',
	},
	clubs: {
		name: 'Elixir',
		text: "Spend to refresh and heal your glyph — the glyph's own wound, not another card's.",
	},
	diamonds: {
		name: 'Remedy',
		text: 'Arm, spent after your next action. Ignore the boss-suit power for that action: a slay, or a card stashed in a pocket.',
	},
};

const ABILITY_TABLE: Record<DraftRole, Record<Suit, Ability>> = {
	kin: KIN,
	class: CLASSES,
	glyph: GLYPHS,
	consumable: CONSUMABLES,
};

/** The ability a role brings when its card is a given suit: the layout trellis reads all 256 parties. */
export function abilityFor(role: DraftRole, suit: Suit): Ability {
	return ABILITY_TABLE[role][suit];
}

/** The four roles in draw order: the party's cells, left to right. */
export const ROLES_BY_DRAW_ORDER: DraftRole[] = ['kin', 'class', 'glyph', 'consumable'];

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
	kind: 'burndayraz' | 'cydstepp' | 'pisorf' | 'weytwut' | 'remedy' | 'purity' | 'sack' | 'pickpocket';
	cell: number;
	first?: string;
};

/**
 * What a spent item slot will take on the action after the item leaves. `same` waits for the suit it lost,
 * `any` takes any card at all, and `other` takes any suit but the one that left.
 */
export type RestockTakes = 'same' | 'any' | 'other';

export interface TombState {
	game: FreeCell;
	seed: number;
	/** Card ids still face-down on the tableau. */
	hidden: string[];
	draft: DraftCard[];
	bossId: string | null;
	bossSuit: Suit | null;
	/**
	 * The deal opened the Dwarf's extra pocket: the right-most free cell. It stands only while the Dwarf is
	 * face up, so a wound on him turns it to stone (see `stoneCell`) and healing him opens it again — the one
	 * pocket an affliction can take off the track.
	 */
	constitution: boolean;
	/** An exhausted cell: its ability is spent and the card lies on its side. Still counts as HP. */
	exhausted: boolean[];
	/**
	 * Wounds per free cell: how many of its cards lie face-down. A stack fills from the bottom up,
	 * and it is worth two hearts, so it takes two wounds and each needs a heal of its own.
	 */
	wounded: number[];
	won: boolean;
	/** The crawl ended on a blow the party could not afford: the card still went home, the delver did not. */
	died: boolean;
	/**
	 * The reserve pocket — the right-most free cell — has never been occupied this deal. Set false the first time
	 * any card sits in it and never set true again. It changes no rule: it is the optional third win, read off the
	 * board when the crawl ends.
	 */
	reserveHeld: boolean;
	/**
	 * A true boss kill has been earned: the boss king fell while the reserve pocket was untouched. Sticky on its own,
	 * separately from `reserveHeld`, because spending the pocket after the kill cannot un-earn a blow that was already
	 * clean — it only costs the step from two to three. This is what the gold multiplier reads.
	 */
	trueBoss: boolean;
	/** Golf total, set when the player leaves through the exit. */
	score: number | null;
	armed: ArmedAbility | null;
	/**
	 * A spent slot: feed it a card on the very next action to remake the item. The suit is the one
	 * that left, and `takes` is how wide the window is — a Thief's Pickpocket opened one that takes any
	 * card when the item was slain into a grave, or any other suit when it was played into the crypt. It
	 * is held on the window rather than read from the party, so the permission outlives even the class
	 * card itself being replaced.
	 */
	itemWindow: { cell: number; role: DraftRole; suit: Suit; takes: RestockTakes } | null;
	/**
	 * Pickpocket's window: the item pocket a level up just opened, or null. It lasts one action — the swap
	 * is the only thing that spends it — and it is set by `settle`, cleared at every action's door.
	 */
	pickpocket: number | null;
	/**
	 * A balance harness pin, set only by `withSyntheticLoadout`: the suits the party is pinned to, for
	 * whatever roles were named. Null in every real game, and never read by the deal itself.
	 */
	synthetic: Partial<Record<DraftRole, Suit>> | null;
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

	// Draft: the top four cards of the shuffled deck, in draw order. The roles are independent, so
	// suits may repeat — all 256 suit assignments are legal parties, and a physical deal is simply the
	// first four cards off the deck.
	const picks = deck.slice(0, DRAFT_CELL_COUNT);
	const rest = deck.slice(DRAFT_CELL_COUNT);

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
	// A Dwarf's Constitution opens the crawl one pocket wider than the track allows.
	const constitution = CLAUSES.dwarfConstitution && ABILITY_TABLE.kin[picks[0].suit].name === 'Dwarf';
	const cellCount = DRAFT_CELL_COUNT + freeCells + (constitution ? 1 : 0);
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
		const ability = abilityFor(role, card.suit);
		return { cell: i, role, id: cardId(card), suit: card.suit, name: ability.name, text: ability.text };
	});
	// A Wizard's Dualcast makes the item slot a second glyph: it spells from its own suit, so it wears
	// the glyph's name on the board rather than an item's.
	if (CLAUSES.wizardDualcast && draft.some((entry) => entry.role === 'class' && entry.name === 'Wizard')) {
		const item = draft.find((entry) => entry.role === 'consumable');
		if (item) {
			const glyph = GLYPHS[item.suit];
			item.name = glyph.name;
			item.text = glyph.text;
		}
	}

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
		died: false,
		reserveHeld: true,
		trueBoss: false,
		score: null,
		constitution,
					armed: null,
			itemWindow: null,
			pickpocket: null,
			synthetic: null,
	};
}

const SUIT_BY_LETTER: Record<string, Suit> = { h: 'hearts', c: 'clubs', d: 'diamonds', s: 'spades' };
/** A role left as `*` keeps whatever the deal drafted there, so a pin can name just one slot. */
const PIN_WILDCARDS = ['*', '-'];

/**
 * A balance harness, never used by the game: pin any of the party's four suits so one deal can be
 * played by different parties.
 *
 * `ssss` pins all four roles; `s***` pins the kin and leaves the class, glyph and item exactly as the
 * deal drafted them, which is the usual mode — it compares kin on one board without also comparing
 * four other abilities at the same time. A wildcard role keeps its dealt card and its dealt ability.
 *
 * The cards never move. The same four sit in the same cells with the same ranks, and the tableau, the
 * fog and the boss are the deal's — only the abilities the named cells confer change. Two runs over
 * one seed therefore differ in exactly the roles that were pinned. A slot restocked later keeps its
 * pinned suit rather than taking the fed card's, so a long line does not drift off the pin mid-run.
 */
export function withSyntheticLoadout(state: TombState, loadout: string): TombState {
	const letters = [...loadout.trim().toLowerCase()];
	if (letters.length !== DRAFT_CELL_COUNT)
		throw new Error(`a loadout is ${DRAFT_CELL_COUNT} letters, got "${loadout}"`);
	const synthetic: Partial<Record<DraftRole, Suit>> = {};
	letters.forEach((letter, index) => {
		if (PIN_WILDCARDS.includes(letter)) return;
		const suit = SUIT_BY_LETTER[letter];
		if (!suit) throw new Error(`unknown suit "${letter}" in loadout "${loadout}"`);
		synthetic[ROLES_BY_DRAW_ORDER[index]] = suit;
	});
	const draft = state.draft.map((entry) => {
		const suit = synthetic[entry.role];
		if (!suit) return entry;
		const ability = ABILITY_TABLE[entry.role][suit];
		return { ...entry, suit, name: ability.name, text: ability.text };
	});
	// Pinning a Wizard's class makes the item slot a glyph, and pinning it away makes it an item again.
	const settled = draft.map((entry) => {
		if (entry.role !== 'consumable') return entry;
		const spell = CLAUSES.wizardDualcast && draft.some((other) => other.role === 'class' && other.name === 'Wizard');
		const ability = spell ? GLYPHS[entry.suit] : ABILITY_TABLE.consumable[entry.suit];
		return { ...entry, name: ability.name, text: ability.text };
	});
	return cloneWith(state, { synthetic, draft: settled });
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

/**
 * A Wizard's Dualcast: the item slot is a second glyph, holding the spell of the card's own suit. Both
 * refresh on a level up and both are drained by a Wraith, so everything that reads "the glyph" reads
 * this pair of slots.
 */
export function isDualcastItem(state: TombState, entry: DraftCard): boolean {
	return CLAUSES.wizardDualcast && entry.role === 'consumable' && hasPassive(state, 'Wizard');
}

/**
 * What a drafted slot answers to right now. Dualcast is a live reading of the party rather than something
 * baked into the draft when it was dealt: the moment the Wizard is stoned his pocket is an item again,
 * carrying whatever exhaustion it already had, and it spells again the moment his wound is healed. Every
 * reader of a slot's ability — the board, the arm, the glyph checks — goes through here, so the name and
 * the rules cannot disagree.
 */
export function draftAbility(state: TombState, entry: DraftCard): Ability {
	if (entry.role !== 'consumable' || !CLAUSES.wizardDualcast) return entry;
	const item = CONSUMABLES[entry.suit];
	const glyph = GLYPHS[entry.suit];
	// A slot is stored under the name the deal gave it — the glyph's while a Wizard stood, the item's
	// otherwise — so those two names are the pair this pocket can answer to, and Dualcast says which of
	// them it is right now. A party built by hand may name any item on any suit; that name is what it is.
	if (entry.name !== item.name && entry.name !== glyph.name) return entry;
	return isDualcastItem(state, entry) ? glyph : item;
}

export function hasGlyph(state: TombState, name: string): boolean {
	return state.draft.some(
		(entry) =>
			(entry.role === 'glyph' || isDualcastItem(state, entry)) &&
			!state.wounded[entry.cell] &&
			draftAbility(state, entry).name === name
	);
}

/** The level the rules allow: a cap keeps the high cards biting, and 0 means no ceiling at all. */
function cappedLevel(level: number): number {
	return TOMB_RULES.levelCap > 0 ? Math.min(level, TOMB_RULES.levelCap) : level;
}

export function playerLevel(game: FreeCell): number {
	// The delver starts at level 1, and the level is one above the rank every suit has reached. A pile
	// is read by its highest card, since any delver can slide a lower one underneath, and an empty pile
	// has reached nothing at all: the four aces together are the first level up, and every rank all
	// four piles complete after that is another.
	const ranks = (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).map((suit) =>
		game.cards
			.filter((card) => card.location.fixture === 'foundation' && card.suit === suit)
			.reduce((top, card) => Math.max(top, rankOf(card.rank)), 0)
	);
	return cappedLevel(1 + Math.min(...ranks));
}

export function currentLevel(state: TombState): number {
	const level = playerLevel(state.game);
	if (!CLAUSES.humanLevel || !hasPassive(state, 'Human')) return level;
	// A Human ignores the lowest grave, so one lagging suit stops holding him back: with three suits
	// ahead of the slowest one, he is a level higher than anyone else would be.
	const ranks = (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).map((suit) => foundationTopRank(state, suit));
	const sorted = ranks.sort((a, b) => a - b);
	return cappedLevel(1 + (sorted[1] ?? 0));
}

/**
 * The graves where the next card home is a level up. The level is read off the lowest grave — or the
 * second lowest, for a Human, who ignores the first — so only the grave holding that number back can
 * lift it: put a card on any other and the same grave counts next time. A tie at the bottom lifts
 * nothing, and a grave already at its king can take no card at all. The next card home is the highest
 * rank the grave can take, which is not always the one right above it (see `graveReach`).
 */
const GRAVE_SUITS: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

/** The level a set of grave tops reads in this party's hands: the lowest of the four, the second for a Human. */
function levelOfRanks(state: TombState, ranks: number[]): number {
	const sorted = [...ranks].sort((a, b) => a - b);
	const human = CLAUSES.humanLevel && hasPassive(state, 'Human');
	return cappedLevel(1 + (human ? (sorted[1] ?? 0) : (sorted[0] ?? 0)));
}

export function levelUpGraves(state: TombState): Suit[] {
	const ranks = GRAVE_SUITS.map((suit) => foundationTopRank(state, suit));
	const level = levelOfRanks(state, ranks);
	return GRAVE_SUITS.filter((suit, index) => {
		const reach = graveReach(state, suit);
		if (reach <= ranks[index]) return false;
		const raised = [...ranks];
		raised[index] = reach;
		return levelOfRanks(state, raised) > level;
	});
}

/**
 * Whether sending this one card home completes a rank, which is the blow a bandit cannot answer. A pile reads
 * by its highest card, so a card slid under a higher one lifts nothing. Asked about the card in hand rather
 * than about the next card each grave could take, which is the question `levelUpGraves` answers.
 */
export function levelsUpOnSlay(state: TombState, card: Card): boolean {
	const index = GRAVE_SUITS.indexOf(card.suit);
	if (index < 0) return false;
	const ranks = GRAVE_SUITS.map((suit) => foundationTopRank(state, suit));
	const raised = [...ranks];
	raised[index] = Math.max(raised[index], rankOf(card.rank));
	return levelOfRanks(state, raised) > levelOfRanks(state, ranks);
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

/**
 * Cards that carry a monster power. The boss suit's court always does, and with `kingPowers` every king
 * does too, whatever suit the run dealt — a spade king in a heart tomb is a Viper's king and venoms.
 * The power always comes from the boss suit: one aura per deal, worn by the court and the lesser kings.
 */
export function carriesPower(state: TombState, card: Card): boolean {
	if (isBossMinion(state, card)) return true;
	return CLAUSES.kingPowers && card.rank === 'king';
}

/**
 * Monster types: the flavour behind each boss suit, the power that suit's cards carry, and the boss who
 * wears it. The names are the ones the monsters answer to, borrowed rather than invented.
 */
export const MONSTERS: Record<Suit, { name: string; boss: string; blurb: string; power: string; text: string }> = {
	spades: {
		name: 'Bandit',
		boss: 'Tomithy Longdall',
		blurb: 'A scallywag looking to loot the tomb.',
		power: 'Mug',
		text: 'slaying or stashing this forces a Hero Chip conversion, with no heal. Blocked by a wound over the aspect, or by a slay that completes a rank.',
	},
	hearts: {
		name: 'Viper',
		boss: 'Jörmungandrn',
		blurb: 'A viper lying in wait, patient and venomous.',
		power: 'Venom',
		text: 'slaying or stashing this digs the deepest fogged card, rightmost hallway on a tie, with no heal — or takes 1 more damage once no fog is left.',
	},
	clubs: {
		name: 'Gorgon',
		boss: 'Medusa',
		blurb: 'A gorgon whose gaze weighs down the living.',
		power: 'Stone Gaze',
		text: 'slaying or stashing this turns your kin and class face down, one card each from the left, and stops at the class.',
	},
	diamonds: {
		name: 'Wraith',
		boss: 'Tormented One',
		blurb: 'A wraith that drinks the spells out of your hand.',
		power: 'Mana Burn',
		text: 'slaying this exhausts and wounds your Glyph.',
	},
};

/**
 * What the status bar calls the place you are in: the type of tomb and the monsters that fill it, rather
 * than the boss's name, which is a phrase too long for a bar that is already reading out a level, hearts,
 * moves and gold. The boss keeps its own name in the tooltip on its card.
 */
export const TOMBS: Record<Suit, string> = {
	spades: 'Barrow of Bandits',
	hearts: 'Cairn of Vipers',
	clubs: 'Catacomb of Gorgons',
	diamonds: 'Crypt of Wraiths',
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
	const cards = CLAUSES.pisorfStack ? cellCards(state, cell).length : Math.min(1, cellCards(state, cell).length);
	return Math.max(0, cards - Math.min(state.wounded[cell], cards));
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
	// A Priest's Bloodgift mends two cells a dig; anyone else mends one.
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
	if (!CLAUSES.pisorfStack) return 0;
	return state.game.cells.filter((_, index) => cellCards(state, index).length > 1).length;
}

export function maxHp(state: TombState): number {
	return state.game.cells.length + stackedCells(state);
}

export function emptyCells(state: TombState): number[] {
	return state.game.cells
		.map((card, index) => (card ? -1 : index))
		.filter((index) => index >= 0 && !stoneCell(state, index));
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


/**
 * The difficulty a state was dealt at. The track is the whole difference between the three — four
 * free cells, three or two — so its size is the rule, rather than something every state has to carry.
 */
/**
 * The ceiling on one blow: whatever the table is set to, which is nothing on the baseline. A capped
 * blow still zeroes under Bounty after the cap, so a free kill stays free.
 */
export function damageCapOf(state: TombState): number {
	return TOMB_RULES.levelDamageCap;
}

export function difficultyOf(state: TombState): Difficulty {
	// One baseline and its legacy harder deal: six pockets is hard, anything else is med. The Dwarf's
	// extra pocket is the easy mode, not another track, so an eight-pocket Dwarf crawl reads med.
	return state.game.cells.length === DRAFT_CELL_COUNT + FREE_CELL_COUNT.hard ? 'hard' : 'med';
}

/**
 * Whether a wounded card may still be slain straight to its foundation. Never on the baseline: the
 * wound has to be healed face up first. (Easy's one-way-out lesson is retired with the track.)
 */
export function woundedCanGoHome(state: TombState): boolean {
	return false;
}

/** The boss stands behind its Generals: no party reaches it until another king is home. */
export function bossProtected(state: TombState): boolean {
	return !bossUnlocked(state);
}

function frozenBoss(state: TombState, card: Card): boolean {
	return isBoss(state, card) && bossProtected(state);
}

/** The four glyphs that move a card rather than wound, heal or arm something else. */
const MOVING_GLYPHS = new Set(['sack', 'cydstepp', 'pisorf', 'weytwut']);

/**
 * Indomitable: no hand ever moves the boss, not even after a General falls — that lifts only his
 * invulnerability. A movement glyph is the one thing that shifts him. A run can carry him, so every
 * card of a run is checked rather than just its top.
 */
export function immobileBoss(state: TombState, card: Card): boolean {
	if (!isBoss(state, card)) return false;
	const kind: string | undefined = state.armed?.kind;
	return !(TOMB_RULES.glyphMoveBoss && kind !== undefined && MOVING_GLYPHS.has(kind));
}

export function foundationIndexOf(game: FreeCell, suit: Suit): number {
	const occupied = game.foundations.findIndex((card) => card?.suit === suit);
	if (occupied !== -1) return occupied;
	return game.foundations.findIndex((card) => !card);
}	export function foundationTopRank(state: TombState, suit: Suit): number {
		// A pile can hold more than one card (any delver slides low cards underneath): the top is the highest.
		return state.game.cards
			.filter((card) => card.location.fixture === 'foundation' && card.suit === suit)
			.reduce((top, card) => Math.max(top, rankOf(card.rank)), 0);
	}/**
 * The one pile Aggression pays for: it has to be the outright highest, so a tie is not a lead. A
 * finished pile (a king on top) still leads, so the first suit home ends the passive for the run:
 * there is no exception for a grave that is already full.
 */
export function leadingFoundation(state: TombState, suit: Suit): boolean {
	const top = foundationTopRank(state, suit);
	return state.game.foundations.every((card) => {
		// its own pile is the measure, not a rival
		if (!card || card.suit === suit) return true;
		return foundationTopRank(state, card.suit) < top;
	});
}

/**
 * Phantom rank: a drafted card still sitting in a free cell counts as already home, so the next
 * rank of that suit may be built even though the drafted card never touched the foundation. A
 * drafted card never comes home, so the pile has to pass over it, and it passes over a *run* of
 * them: with a drafted three and a drafted four above a two, it is waiting for the five. Two
 * drafted cards that are not consecutive are not a run — above a two, a drafted three and five
 * still leave the four as the card the pile waits for.
 */
export function phantomRank(state: TombState, suit: Suit, ignore?: string): number {
	const drafted = state.draft.flatMap((entry) => {
		if (entry.suit !== suit || entry.id === ignore) return [];
		const card = state.game.cards.find((candidate) => cardId(candidate) === entry.id);
		return card ? [rankOf(card.rank)] : [];
	});
	let rank = foundationTopRank(state, suit);
	while (drafted.includes(rank + 1)) rank += 1;
	return rank;
}

export function phantomCard(state: TombState, suit: Suit, ignore?: string): Card | null {
	const rank = phantomRank(state, suit, ignore);
	if (rank <= foundationTopRank(state, suit)) return null;
	return state.game.cards.find((card) => card.suit === suit && rankOf(card.rank) === rank) ?? null;
}

/**
 * How high this grave can be landed on in one card. Anyone may slide a lower card under a pile, and a
 * Fighter may open the rank above a gap, so a landing can come as high as `top + gap`; the run of
 * drafted cards the pile has passed over moves the landing up with it, because those ranks can never
 * come home. The pile reads its highest card, so this is also the rank it would be read at.
 */
export function graveReach(state: TombState, suit: Suit, ignore?: string): number {
	const top = foundationTopRank(state, suit);
	const passed = phantomRank(state, suit, ignore) - top;
	const gap = hasPassive(state, 'Fighter') ? 2 : 1;
	return Math.min(13, top + passed + gap);
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
 * The Hero Chip's boundary: hero aspects sit to its left, plain pockets to its right, and the
 * mark walks one slot left each time an aspect converts. A slot waiting on its refill is still an
 * aspect slot — the chip only moves once that window closes unfed.
 */
export function chipBoundary(state: TombState): number {
	const drafted = convertibleCell(state) + 1;
	const pending = state.itemWindow ? state.itemWindow.cell + 1 : 0;
	return Math.max(drafted, pending);
}

/** The one aspect that may leave its slot: the drafted card sitting just left of the chip. */
export function convertibleCell(state: TombState): number {
	return state.draft.reduce((highest, entry) => Math.max(highest, entry.cell), -1);
}

/** The hero aspect the chip has reached: the one a conversion would spend. */
export function conversionTarget(state: TombState): DraftCard | undefined {
	const cell = convertibleCell(state);
	return cell >= 0 ? draftAt(state, cell) : undefined;
}

/**
 * The hero aspect Mug would spend: the one the chip has reached, as long as its pocket holds a card and no
 * wound has locked it. Shared with the interface, because the bandit's warning sits on the chip and not on a
 * card — the aspect never moves, so there is nothing on the board to mark.
 */
export function mugTarget(state: TombState): DraftCard | undefined {
	const slot = convertibleCell(state);
	if (slot < 0 || !state.game.cells[slot] || cellTopWounded(state, slot)) return undefined;
	return draftAt(state, slot);
}

/**
 * Whether the Hero Chip itself can be clicked: a live, unwounded hero aspect beside it, under the explicit rule.
 * A wound locks the aspect — the conversion cannot spend a face-down card, and neither can a bandit.
 */
export function canConvert(state: TombState): boolean {
	if (!CLAUSES.explicitConversion || state.won || state.itemWindow) return false;
	const cell = convertibleCell(state);
	if (cell < 0 || !state.game.cells[cell]) return false;
	return !cellTopWounded(state, cell);
}

/** Any action other than the conversion closes Pickpocket's one-turn window. */
function closePickpocket(state: TombState): TombState {
	return state.pickpocket === null ? state : cloneWith(state, { pickpocket: null });
}

/**
 * The conversion, made by hand: click the Hero Chip and the hero aspect beside it is spent for good. Its
 * ability is gone, the slot turns into a plain pocket, the chip walks one step left and the track mends one
 * wound as a bonus. The card stays where it lies — a plain card in the pocket, free to go home like any
 * other — so the price is always an ability, never a heart.
 */
/**
 * The cards a conversion would turn face up, so the board can price the chip before it is clicked —
 * the same courtesy a dig's hover gets.
 */
export function conversionHeals(state: TombState): string[] {
	if (!canConvert(state)) return [];
	const { wounded } = heal(state, TOMB_RULES.conversionHeal);
	return newlyHealed(state, cloneWith(state, { wounded }));
}

export function convertChip(state: TombState): TombState | null {
	if (!canConvert(state)) return null;
	const entry = conversionTarget(state)!;
	const cell = entry.cell;
	const exhausted = [...state.exhausted];
	exhausted[cell] = false;
	const { wounded } = heal(state, TOMB_RULES.conversionHeal);
	// Nothing goes home, so no level can lift here; settle still runs because it is where the party's own
	// state is read once the slot is gone — a converted Dwarf closes the pocket his Constitution opened.
	const next = settle(
		cloneWith(state, {
			draft: consumeDraft(state, cell),
			exhausted,
			wounded,
			armed: state.armed?.cell === cell ? null : state.armed,
			itemWindow: null,
			pickpocket: null,
		}),
		currentLevel(state)
	);
	return spendArmedItem(next);
}

/**
 * A plain pocket (to the right of the chip) hands its card back like FreeCell does: it builds
 * onto a column, waits in another pocket, or goes home. A hero aspect may leave only once the chip
 * reaches it, because conversions run in order — and a card played out that way is spent for good.
 * A wound locks either kind until it is healed.
 */
export function cellCardMovable(state: TombState, cell: number): boolean {
	const card = state.game.cells[cell];
	// Constitution's pocket is one-way while the Dwarf is down: the card in it still plays out like any other —
	// a build, another pocket, a restock, its grave — and only the pocket itself is shut. What refuses
	// new cards is `canBuildOn` and `emptyCells`, not this.
	// Only a wound locks a cell: a spent card can still be picked up and played.
	if (!card || cellTopWounded(state, cell)) return false;
	if (!draftAt(state, cell)) return true;
	// The explicit conversion: a hero aspect is not a card you can pick up at all. Click the chip, and the
	// plain card it leaves behind moves like every other card on the track.
	if (CLAUSES.explicitConversion) return false;
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
 * CYDSTEPP buys one illegal play: an exposed run may be laid on top of a face-down card, which
 * normally blocks its whole column. The fog then stays face-down, buried for good. The run is a
 * normal supermove, so the free cells still have to carry it — the spell buys the fog, not a longer arm.
 */
export function cydsteppCanBury(state: TombState, cards: Card[], to: CardLocation): boolean {
	if (state.armed?.kind !== 'cydstepp' || to.fixture !== 'cascade' || !cards.length) return false;
	if (cards.length > moveCapacity(state)) return false;
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
	if (run.some((card) => isFaceDown(state, card) || immobileBoss(state, card))) return null;
	return run;
}

/** PISORF needs a proper pair and an open free cell to put it in — a stone pocket is not an open cell. */
export function pisorfCanStack(state: TombState, from: CardLocation, cell: number): boolean {
	return !!pisorfPair(state, from) && !state.game.cells[cell] && !stoneCell(state, cell);
}

export function canBuildOn(state: TombState, cards: Card[], to: CardLocation): boolean {
	if (!cards.length) return false;
	if (to.fixture === 'cell') {
		// A stone pocket takes nothing in: it is not a free cell while the Dwarf is face down.
		return cards.length === 1 && !state.game.cells[to.data[0]] && !stoneCell(state, to.data[0]);
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
			if (card.location.fixture === 'foundation') return { legal: false, reason: 'already in its grave' };

	if (from.fixture === 'cell') {
		// A wound locks a card against building, spells and passives, and the foundation is no way
		// out: the wound has to be healed face up first.
		if (cellTopWounded(state, from.data[0]) && !woundedCanGoHome(state)) {
			return { legal: false, reason: 'wounded' };
		}
		// The party leaves only through the chip: a drafted card cannot reach its grave on its own.
		if (draftAt(state, from.data[0]) && CLAUSES.explicitConversion) {
			return { legal: false, reason: 'convert it through the chip first' };
		}
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
		return { legal: false, reason: 'boss: one of its Generals has to fall first' };
	}

	const rank = rankOf(card.rank);
	const home = foundationTopRank(state, card.suit);
	// Anyone may slide a lower card in under a pile: the pile keeps its higher card on top, so a rank
	// that was skipped stays available for the rest of the run. `graveReach` is how high this landing
	// can come: only a Fighter may open the rank above a gap, and a card the tomb drafted counts as
	// already home, so the rank above it comes home instead. A drafted three does not open the four
	// while the two is still buried, so no kill (or wound preview) is offered for a card out of reach.
	if (rank === home) {
		return { legal: false, reason: 'that grave is past this rank' };
	}
	if (rank > graveReach(state, card.suit, cardId(card))) {
		return {
			legal: false,
			reason: home ? `the grave needs the ${home + 1 <= 13 ? home + 1 : 'next'} of this suit` : 'needs an ace',
		};
	}
	return { legal: true, reason: '' };
}

/**
 * Whether Stone Gaze is live: a carrier slain or stashed while the clubs aura is up. The gaze no
 * longer prices a rank onto the blow; it stones the party instead, so this is the predicate the
 * aura and the warning both read rather than a number the bill adds.
 */
export function stoneGazeApplies(state: TombState, card: Card): boolean {
	return (
		CLAUSES.stoneGaze && carriesPower(state, card) && state.bossSuit === 'clubs' && auraActive(state)
	);
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
	// An Elf's shot ignores cover the way a burn does, but only down a lane his sight reaches.
	const ignoreCover =
		reachThroughCover ||
		(state.armed?.kind === 'burndayraz' && from.fixture === 'cascade') ||
		elfSight(state, from);
	const check = canSendHome(state, from, ignoreCover);
	if (!card) return { legal: false, reason: check.reason, damage: 0, locks: [], need: [], fatal: false, wounds: [] };
	if (!check.legal)
		return { legal: false, reason: check.reason, damage: 0, locks: [], need: [], fatal: false, wounds: [] };

	const level = currentLevel(state);
	// A damage floor on the level keeps the court priced while the level keeps healing.
	const blowLevel = TOMB_RULES.damageLevelCap > 0 ? Math.min(level, TOMB_RULES.damageLevelCap) : level;
	let damage = Math.max(0, rankOf(card.rank) - blowLevel);
	// The ceiling is applied before Bounty, so a free kill stays free.
	const ceiling = damageCapOf(state);
	if (ceiling > 0) damage = Math.min(damage, ceiling);
	// A court floor is applied before Bounty too, so an Aggression kill is still free.
	if (TOMB_RULES.courtFloor > 0 && getRankForCompare(card.rank) >= getRankForCompare('jack')) {
		damage = Math.max(damage, TOMB_RULES.courtFloor);
	}
	// Aggression only pays for the pile you have pushed furthest: dumping a high card into a suit you
	// never touched still costs its full damage.
	if (CLAUSES.orcAggression && hasPassive(state, 'Orc') && leadingFoundation(state, card.suit)) damage = 0;
	// The power spends the item's card before the kill's own wounds, so that wound is owed on top.
	const itemCells = auraItemWound(state, card, from);
	const afterItem = itemCells.reduce((next, cell) => woundCell(next, cell), state);
	// Venom digs the fog; with none left to dig it takes a wound instead, and that one lands before the
	// blow's own. It is a heart the kill costs, so it belongs on the bill the preview reads out.
	const afterVenom = venomWounds(state, card)
		? cloneWith(afterItem, { wounded: wound(afterItem, 1).wounded })
		: afterItem;
	const venomLocks = afterVenom.wounded.flatMap((count, cell) =>
		count > (afterItem.wounded[cell] ?? 0) ? [cell] : []
	);
	const afterWounds = wound(afterVenom, damage);
	const struck = cloneWith(state, { wounded: afterWounds.wounded });
	// Stone Gaze is paid by the party, not the blow: one passive turns face down after the kill's own
	// wounds, and that heart is on the bill. The card it turns is an affliction, not a wound, so the
	// preview leaves it off `wounds` (the board's ! mark) rather than painting it as damage.
	const afterGaze = stoneGaze(struck, card);
	const gazes = afterGaze.wounded.flatMap((count, cell) =>
		count > (afterWounds.wounded[cell] ?? 0) ? [cell] : []
	);
	const total = damage + itemCells.length + venomLocks.length + gazes.length;
	const free = hp(state);
	// One heart has to be left standing, so a kill can spend every heart but the last. An empty free
	// cell is not a heart until a card sits in it: it is where the track grows by one to absorb more.
	// The reserve wants a heart held back, but only a bill can spend one: a kill that costs nothing
	// spends nothing, so it never owes the spare heart.
	const short = Math.max(0, total - free + (total > 0 ? 1 : 0));
	const legal = short === 0;
	const need = short ? emptyCells(state).slice(0, short) : [];
	const locks = legal
		? Array.from(new Set([...itemCells, ...venomLocks, ...afterWounds.locks, ...gazes]))
		: [];
	return {
		legal,
		reason: legal ? '' : `needs ${total} wounds and one to spare, you have ${free}`,
		damage,
		locks,
		need,
		fatal: short > 0,
		wounds: legal ? woundCardIds(state, afterVenom, itemCells, afterWounds.wounded) : [],
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
	// Two cards can share a free cell, and the slot shows the top of the stack. This used to ask
	// `cellCards` for each cell in turn, which filtered and sorted all 52 cards per cell and cloned a
	// state to do it — eight full deck scans for information one pass over the moved cards already
	// has.
	const top: (Card | null)[] = new Array(game.cells.length).fill(null);
	for (const card of cards) {
		if (card.location.fixture !== 'cell') continue;
		const [cell, depth = 0] = card.location.data;
		const held = top[cell];
		if (!held || (held.location.data[1] ?? 0) < depth) top[cell] = card;
	}
	for (let cell = 0; cell < top.length; cell++) game.cells[cell] = top[cell];
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
		const held = cellCards(state, cell).length;
		const cards = CLAUSES.pisorfStack ? held : Math.min(1, held);
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
function woundCardIds(state: TombState, afterItem: TombState, itemCells: number[], after: number[]): string[] {
	const drained = itemCells.flatMap((cell) =>
		cellCards(state, cell)
			.slice(state.wounded[cell] ?? 0, (state.wounded[cell] ?? 0) + 1)
			.map((card) => shorthandCard(card))
	);
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
	// Dualcast puts a spell in the item slot, so a level up brings both back.
	const glyphs = state.draft.filter((entry) => entry.role === 'glyph' || isDualcastItem(state, entry));
	if (!glyphs.length) return state;
	const exhausted = [...state.exhausted];
	glyphs.forEach((entry) => {
		if (!state.game.cells[entry.cell]) return;
		exhausted[entry.cell] = false;
	});
	return cloneWith(state, { exhausted });
}

/**
 * What a full tomb is worth before a single card goes home: the whole deck at its values, with the
 * boss king priced at a hundred. Every deal opens on this number, because the boss is in there
 * whether or not the fog has lifted off him yet. It is a round five hundred so the run reads as a
 * percentage: (500 - par) / 5 is how much of the tomb is clear.
 */
/**
 * The whole of a tomb, for par: the solver is scored by how deep a card was in the deck as well as by whether it
 * came home, and that reading lives here and in the corpus. The bar counts gold instead (GOLD_TOTAL below); par is
 * no longer shown to the player anywhere.
 */
export const PAR_TOTAL = 500;

/**
 * The whole of a tomb in gold: a flat price per card, so a bare tomb reads exactly a hundred and the gold on the bar
 * is also the percentage cleared. Thirty-six rats, twelve boss-suit minions, three Generals and the boss are 52.
 */
export const GOLD_TOTAL = 100;

/**
 * What one card pays when it is slain: a rat one, a boss-suit minion two, a General five, and the boss king
 * twenty-five. The deal decides the last three — the boss's suit is the tomb's, and the kings off it answer to him.
 */
export function goldValue(state: TombState, card: Card): number {
	if (state.bossId && cardId(card) === state.bossId) return 25;
	if (card.rank === 'king') return 5;
	return state.bossSuit && card.suit === state.bossSuit ? 2 : 1;
}

/** The gold a crawl has banked: every card that has gone home, at its own price. */
export function tombGold(state: TombState): number {
	return state.game.cards
		.filter((card) => card.location.fixture === 'foundation')
		.reduce((sum, card) => sum + goldValue(state, card), 0);
}

/** What one card is worth in par: ace one, numbers at face, court fifteen, king twenty. */
function parValue(card: Card): number {
	if (card.rank === 'king') return 20;
	if (card.rank === 'queen' || card.rank === 'jack') return 15;
	return Math.min(rankOf(card.rank), 10);
}

/**
 * Par: the score, counted down from a full tomb. A card going home takes its own value off the
 * whole — aces one, court fifteen, kings twenty, the boss king a hundred — so par only ever falls,
 * and a fresh deal always opens on 500 even while the boss still lies under the fog. Lower is
 * better, and zero is a tomb stripped bare.
 */
export function tombPar(state: TombState): number {
	const home = state.game.cards.filter((card) => card.location.fixture === 'foundation');
	const taken = home.reduce((sum, card) => sum + parValue(card), 0);
	// His extra eighty is only paid out for the card the dungeon actually made the boss.
	const bossHome = !!state.bossId && home.some((card) => cardId(card) === state.bossId);
	return PAR_TOTAL - taken - (bossHome ? 80 : 0);
}

/**
 * How much of the tomb is clear, to one decimal place: nothing sent home yet reads 0, and an empty
 * tomb reads 100. A single card is worth only a fraction of a percent, so the decimal is what lets
 * the first few cards show on the way up instead of sitting at zero.
 */
export function parCleared(state: TombState): number {
	return Math.round((((PAR_TOTAL - tombPar(state)) / PAR_TOTAL) * 1000)) / 10;
}

/** Golf score: every card still off the foundation counts against you, court cards as ten. */
export function tombScore(state: TombState): number {
	return -state.game.cards
		.filter((card) => card.location.fixture === 'cascade' || card.location.fixture === 'cell')
		.reduce((sum, card) => sum + Math.min(rankOf(card.rank), 10), 0);
}

/**
 * Leave the dungeon: available at any time, boss or no boss. The score is whatever the tomb still
 * owes, so an early exit reads as the crawl it was rather than as a lost run.
 */
export function tombExit(state: TombState): TombState | null {
	if (state.won) return null;
	return cloneWith(state, { won: true, score: tombScore(state) });
}

/**
 * After any move: check for a level up (a free heal plus a glyph refresh) and a boss kill. Cards
 * are never turned over here — digging is the player's click, and a card they leave face down is
 * a heal kept in reserve.
 */
function settle(state: TombState, levelBefore: number): TombState {
	// A card leaving a stacked cell must not leave a wound behind on an empty slot.
	let next = closeItemWindow(
		cloneWith(state, {
			wounded: state.wounded.map((count, cell) => Math.min(count, cellCards(state, cell).length)),
		})
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
		// Bloodgift mends two at a time, a dig and a level up alike.
		const result = heal(next, TOMB_RULES.levelUpHeal + (hasPassive(next, 'Priest') ? 1 : 0));
		next = cloneWith(next, {
			wounded: result.wounded,
		});
		next = refreshGlyphs(next);
		// Pickpocket: the level opens a one-action window on the item pocket while it still holds a live,
		// unwounded card. A spent one is fair game, because exhaustion does not travel to the tableau.
		if (CLAUSES.pickpocketSwap && hasPassive(next, 'Thief')) {
			const item = next.draft.find((entry) => entry.role === 'consumable');
			if (item && next.game.cells[item.cell] && !next.wounded[item.cell]) {
				next = cloneWith(next, { pickpocket: item.cell });
			}
		}
	}

	// Nothing ends a run on its own any more: once the boss king is down the exit is on offer,
	// and the dungeon is only left when the player takes it.
	return noteReserve(noteTrueBoss(next));
}

/** The right-most free cell: the reserve pocket the star sits over, and where the Dwarf's extra cell lands. */
export function reserveCell(state: TombState): number {
	return state.game.cells.length - 1;
}

/**
 * A pocket Constitution opened and a wound has closed: stone for as long as the Dwarf is face down. It is the
 * right-most cell of a deal that opened one wider than the track, so it is also the reserve pocket, and
 * the crawl is the track's own size again while he is stoned. Nothing else in the game can close a
 * pocket, which is what makes this the Dwarf's whole off-switch.
 *
 * The stone only shuts the pocket: nothing is ever moved out of it. A card already lying there stays, is
 * still a heart and is still played out like any other, and the pocket stands empty and shut only once the
 * player has moved that card on by hand — nothing can enter it again until his wound heals.
 */
export function stoneCell(state: TombState, cell: number): boolean {
	return state.constitution && cell === state.game.cells.length - 1 && !hasPassive(state, 'Dwarf');
}

/**
 * Give up the reserve the moment anything sits in it. It is sticky on purpose: a card put in and taken out again
 * still ends the true win, or the pocket would be free to borrow from all deal and only be guarded at the end.
 */
function noteReserve(state: TombState): TombState {
	if (!state.reserveHeld || !state.game.cells[reserveCell(state)]) return state;
	return cloneWith(state, { reserveHeld: false });
}

/** Whether the reserve pocket has never been used this deal. */
export function reserveHeld(state: TombState): boolean {
	return state.reserveHeld;
}

/**
 * Earn the true boss kill the first time the boss is home with the pocket still untouched. Sticky, like the reserve it
 * is named after: the kill happened when it happened.
 */
function noteTrueBoss(state: TombState): TombState {
	if (state.trueBoss || !state.reserveHeld || !bossSlain(state)) return state;
	return cloneWith(state, { trueBoss: true });
}

/**
 * The optional third win, one step past the boss: he fell without anything ever sitting in the reserve pocket.
 * It changes no rule and is never required — the crawl is won either way; this records that it was done the hard
 * way, and it is what doubles the pay.
 */
export function trueBossKill(state: TombState): boolean {
	return state.trueBoss;
}

/** The optional third win, all the way: a bare tomb with the reserve pocket untouched. */
export function trueClear(state: TombState): boolean {
	return state.reserveHeld && tombPar(state) === 0;
}

/**
 * What gold pays on this board: one ordinarily, two after a true boss kill — kept for the rest of the crawl, so using
 * the pocket afterwards only costs the third step rather than the second — and three for a bare tomb with the pocket
 * untouched. That makes the score read past a hundred: the boss's way is 200%, the whole tomb the hard way 300%.
 */
export function goldMultiplier(state: TombState): number {
	if (trueClear(state)) return 3;
	return state.trueBoss ? 2 : 1;
}

/** The scored gold: what has gone home, times the multiplier. A clean tomb reads three hundred of a hundred. */
export function goldScore(state: TombState): number {
	return tombGold(state) * goldMultiplier(state);
}

/** A court card: the face cards, which a ranged shot cannot see past. */
function isFaceCard(card: Card): boolean {
	return card.rank === 'jack' || card.rank === 'queen' || card.rank === 'king';
}

/**
 * The Elf's line of sight down a column: every card standing above the target has to be an exposed
 * number card. Unrevealed cards are walls, and a face card turns the shot aside, so a column of pips
 * is a firing lane and one court card closes it for everything beneath.
 */
export function elfSight(state: TombState, location: CardLocation): boolean {
	if (location.fixture !== 'cascade' || !hasPassive(state, 'Elf')) return false;
	const column = state.game.tableau[location.data[0]] ?? [];
	for (let index = location.data[1] + 1; index < column.length; index++) {
		const cover = column[index];
		if (!cover || isFaceDown(state, cover) || isFaceCard(cover)) return false;
	}
	return true;
}

/**
 * Digging is always the player's click: a face-down card is only turned over when asked for, so
 * it can be kept face-down as a heal for later. An ordinary dig needs the card exposed at the
 * bottom of its column; an Elf shoots down the column and turns over whatever his lane reaches.
 */
export function canRevealFaceDown(state: TombState, location: CardLocation): boolean {
	if (state.won || location.fixture !== 'cascade') return false;
	const card = cardAt(state.game, location);
	if (!card || !isFaceDown(state, card)) return false;
	if (hasPassive(state, 'Elf')) return elfSight(state, location);
	const column = state.game.tableau[location.data[0]] ?? [];
	return column[column.length - 1] === card;
}

/** Reveal one face-down card as an exploration: it heals from the left edge of the track. */
export function revealFaceDown(state: TombState, location: CardLocation): TombState | null {
	state = closePickpocket(state);
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

	return spendArmedItem(closeItemWindow(noteReserve(noteTrueBoss(next))));
}

/**
 * What a spent item slot will take. An ordinary slot waits for the suit it lost. A Thief's Pickpocket widens
 * the window as far as the item's own exit allows: an item slain into a grave leaves a slot any card can fill,
 * while one played into the crypt only takes another suit — the same suit coming straight back is the loop the
 * allowance is meant to price, so it has to be rebuilt from a different card instead. The permission rides on
 * the window, so it outlives the item that opened it.
 */
function restockTakes(card: Card, window: { suit: Suit; takes: RestockTakes }): boolean {
	if (window.takes === 'any') return true;
	if (window.takes === 'other') return card.suit !== window.suit;
	return card.suit === window.suit;
}

/** The suits that would refill a spent slot, for the search to price a window by and the tests to read it through. */
export function restockSuits(window: { suit: Suit; takes: RestockTakes }): Suit[] {
	const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
	if (window.takes === 'any') return suits;
	if (window.takes === 'other') return suits.filter((suit) => suit !== window.suit);
	return [window.suit];
}

/** Any action other than the feed closes a spent item slot for good. */
function closeItemWindow(state: TombState): TombState {
	return state.itemWindow ? cloneWith(state, { itemWindow: null }) : state;
}

/** A Remedy is spent by the action it covers: the arm clears and the item exhausts. */
function spendArmedItem(state: TombState): TombState {
	const armed = state.armed;
	if (armed?.kind !== 'remedy') return state;
	const exhausted = [...state.exhausted];
	exhausted[armed.cell] = true;
	return cloneWith(state, { exhausted, armed: null });
}

function consumeDraft(state: TombState, cell: number): DraftCard[] {
	return state.draft.filter((entry) => entry.cell !== cell);
}

/**
 * The cells a monster power drains: the item under a Gorgon, the Glyph under a Wraith — and with a
 * Wizard's Dualcast the item aspect spells too, so a Wraith bites both glyphs.
 */
/**
 * The cells Mana Burn drains. The item used to share this list — one affliction for each spent slot — but the
 * item is Mug's now: a bandit forces its conversion without a heal rather than spending it, so this list is
 * the Wraith's alone. The glyphs are its own, and a Wizard's Dualcast makes the item slot one of them.
 */
function auraCells(state: TombState): number[] {
	if (state.bossSuit !== 'diamonds') return [];
	// The Wraith on the slot clause drains the place rather than the item, so a converted one still bites.
	if (CLAUSES.wraithSlot) {
		const slot = ROLES_BY_DRAW_ORDER.indexOf('glyph');
		return slot >= 0 && slot < state.game.cells.length ? [slot] : [];
	}
	return state.draft
		.filter((entry) => entry.role === 'glyph' || isDualcastItem(state, entry))
		.map((entry) => entry.cell);
}

/** The first cell a monster power would drain: what the interface points the arrow at. */
function auraItem(state: TombState): number | null {
	return auraCells(state)[0] ?? null;
}

/** The item cell a card's power would drain, for the interface to point at. */
export function auraItemOf(state: TombState, card: Card): number | null {
	return carriesPower(state, card) ? auraItem(state) : null;
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
export function auraItemWound(state: TombState, card: Card, from: CardLocation): number[] {
	if (!carriesPower(state, card) || !auraActive(state)) return [];
	return auraCells(state).filter((cell) => {
		// a card leaving that very cell takes the item with it: there is nothing left behind to drain
		if (from.fixture === 'cell' && from.data[0] === cell) return false;
		return (state.wounded[cell] ?? 0) < cellCards(state, cell).length;
	});
}

/**
 * Mug: the bandit forces the conversion one step early — the Hero Chip walks left with no heal.
 * The card stays where it lies and turns plain, exactly as a conversion by hand leaves it, minus the
 * bonus mend. No pocket need stand open, because nothing moves: the price is the aspect and its heal.
 * A wound lying over the aspect locks it, so the bandit takes nothing — the counterplay is
 * arriving wounded, the same bargain a Wraith offers. The aspect is whatever the chip has reached, so a
 * Wizard's Dualcast glyph is mugged exactly like a flask, and a card merely resting on top of a drafted
 * aspect is not the aspect.
 */
function mugSlot(state: TombState): TombState {
	// A wound turns the card face down and locks the aspect, so a bandit has nothing to convert:
	// the same bargain a Wraith offers, where a slot already paid for has nothing left to take.
	const entry = mugTarget(state);
	if (!entry) return state;
	const slot = entry.cell;
	const exhausted = [...state.exhausted];
	exhausted[slot] = false;
	// No heal: the forced step spends the ability without mending anything. Settle still runs, because it
	// is where the party's own state is read once the slot is gone — a converted Dwarf closes the pocket
	// his Constitution opened.
	const next = settle(
		cloneWith(state, {
			draft: consumeDraft(state, slot),
			exhausted,
			armed: state.armed?.cell === slot ? null : state.armed,
			itemWindow: null,
			pickpocket: null,
		}),
		currentLevel(state)
	);
	return dropKnockedArm(spendArmedItem(next));
}

/**
 * Whether this blow would pay Venom in wounds rather than fog: a carrier in a hearts tomb, with the aura
 * standing, and no fog left anywhere to dig. Shared with the interface so the extra heart is on the bill
 * before the blow.
 */
function venomWounds(state: TombState, card: Card): boolean {
	return state.bossSuit === 'hearts' && carriesPower(state, card) && auraActive(state) && !venomTarget(state);
}

/**
 * The fog Venom digs. At a table the player may dig any face-down card, without the heal, or take 1 extra
 * damage instead; the app makes that choice for them, and takes the dig while any fog is left.
 *
 * The card it takes is the deepest one anywhere in the hallways, the rightmost hallway breaking a tie — the
 * card that has been buried longest pays out first, and reading right to left on a tie keeps the pick in the
 * order the board is already scanned in. Shared with the interface, so the card the warning points at is the
 * card the blow would turn over.
 */
export function venomTarget(state: TombState): Card | null {
	const tableau = state.game.tableau as Card[][];
	let deepest: Card | null = null;
	let depth = -1;
	// Left to right, so a tie at the same depth leaves the later — rightmost — hallway holding it.
	for (const column of tableau) {
		for (let k = 0; k < column.length; k++) {
			const card = column[k];
			if (!state.hidden.includes(cardId(card))) continue;
			if (k >= depth) {
				depth = k;
				deepest = card;
			}
		}
	}
	return deepest;
}

/**
 * The card a single point of damage would turn face down. The track pays from the right edge inward, so
 * this is the card the next wound costs, and the same one the red glow marks for a blow's own price.
 */
export function woundTarget(state: TombState): Card | null {
	for (let cell = state.game.cells.length - 1; cell >= 0; cell--) {
		const cards = cellCards(state, cell);
		// A stack pays one card at a time from its bottom up; every other pocket is worth one card.
		const pay = CLAUSES.pisorfStack ? cards.length : Math.min(1, cards.length);
		const down = state.wounded[cell] ?? 0;
		if (down < pay) return cards[down] ?? null;
	}
	return null;
}

/**
 * The one card a single Stone Gaze turns: the leftmost of the party's kin and class that is still face
 * up. An affliction takes one card, so the kin turns first and the class is what the next gorgon finds;
 * the gaze stops at the class, so the glyph and the item to its right never turn. A cell already face
 * down has nothing left to take, which is the window the party can play around by converting a passive
 * away or leaving one wounded before the next gorgon falls.
 */
function gazeCell(state: TombState): number | null {
	const entry = [...state.draft]
		.sort((a, b) => a.cell - b.cell)
		.find(
			(row) =>
				(row.role === 'kin' || row.role === 'class') &&
				(state.wounded[row.cell] ?? 0) < cellCards(state, row.cell).length
		);
	return entry ? entry.cell : null;
}

/** Stone Gaze: one card turns face down, the leftmost passive still standing. */
function stoneGaze(state: TombState, card: Card): TombState {
	if (!stoneGazeApplies(state, card)) return state;
	const cell = gazeCell(state);
	if (cell === null) return state;
	const wounded = [...state.wounded];
	wounded[cell] += 1;
	return cloneWith(state, { wounded });
}

/**
 * The cards an affliction is aimed at right now, for the board to warn on while the carrier is under the
 * pointer: the fog Venom would lift, the kin and class Stone Gaze would turn down, the glyphs Mana Burn
 * would spend. Mug is the exception — it spends the hero aspect beside the chip and leaves the card where it
 * lies, so nothing on the board is marked and the interface bangs the chip instead (`mugTarget`). An armed
 * Remedy turns the whole aura off, so it warns on nothing at all: nothing would happen.
 */
export function afflictionTargets(state: TombState, card: Card): string[] {
	if (!carriesPower(state, card) || !auraActive(state)) return [];
	switch (state.bossSuit) {
		case 'hearts': {
			// With the fog gone there is nothing left to dig, so the price is the wound instead: the mark
			// moves to the card that would turn face down, the same one a blow's own damage points at.
			const fog = venomTarget(state) ?? woundTarget(state);
			return fog ? [cardId(fog)] : [];
		}
		case 'spades':
			// Mug walks the chip a step left with no heal, and the aspect it spends stays in its pocket as a
			// plain card: the chip is the one thing that moves, so it is the one thing the warning marks.
			return [];
		case 'clubs': {
			// Stone Gaze turns one card, the leftmost passive still face up: the kin first, then the class
			// once the kin is wounded. A stashed gorgon has no attack preview to show its heart, so this is
			// the only warning that route gets.
			const cell = gazeCell(state);
			const hit = cell === null ? undefined : cellCards(state, cell)[state.wounded[cell] ?? 0];
			return hit ? [cardId(hit)] : [];
		}
		case 'diamonds':
			return auraCells(state).flatMap((cell) => {
				const up = faceUp(state, cell);
				if (up <= 0) return [];
				const cards = cellCards(state, cell);
				const top = cards[(state.wounded[cell] ?? 0) + up - 1];
				return top ? [cardId(top)] : [];
			});
		default:
			return [];
	}
}

/**
 * A boss-suit minion carries its power wherever it leaves the board: sending one home kills it,
 * and parking one in a free cell sets the power off just the same. An armed Remedy covers either.
 * `by` says which of the two it was, because Stone Gaze is the one power already priced into the kill.
	 * `levelled` says the blow completed a rank: the bandit is the one power that arrives too late, because
	 * the level up lifts the delver first. Nothing parks a card home, so a park never levels.
	 */
function bossAura(state: TombState, card: Card, by: 'kill' | 'park', levelled = false): TombState {
	if (!carriesPower(state, card) || !auraActive(state)) return state;
	switch (state.bossSuit) {
		case 'hearts': {
			// Venom is a choice at a table: dig any fog without the heal, or take 1 more damage. The app
			// makes that choice, and takes the dig while there is any fog to take — buried or not — because
			// a dry board has no dig left to offer. The card it digs is the one the interface warns on.
			const venom = venomTarget(state);
			if (venom) return cloneWith(state, { hidden: state.hidden.filter((id) => id !== cardId(venom)) });
			return cloneWith(state, { wounded: wound(state, 1).wounded });
		}
		case 'spades':
			// Mug forces the conversion rather than pricing the card: the Hero Chip walks left with no heal,
			// whether the bandit went down to a blade or was only stashed. Nothing is priced into the
			// kill for this, so both routes land here.
			return CLAUSES.banditMug && !(CLAUSES.mugLevelSparing && levelled) ? mugSlot(state) : state;
		case 'clubs':
			// Stone Gaze turns the party's kin and class face down, left to right, and stops at the class.
			// A kill pays its own wounds first and then gazes (see `attackWith`); a park has no bill to
			// pay first, so it gazes here.
			return by === 'park' ? stoneGaze(state, card) : state;
		case 'diamonds': {
			// Mana Burn takes the glyphs themselves: spent, and turned face-down as a wound. A Wizard's
			// Dualcast leaves two glyphs standing, and a Wraith takes them both.
			const cells = auraCells(state);
			if (!cells.length) return state;
			return dropKnockedArm(
				cells.reduce((next, cell) => {
					const exhausted = [...next.exhausted];
					exhausted[cell] = true;
					return woundCell(cloneWith(next, { exhausted }), cell);
				}, state)
			);
		}
		default:
			return state;
	}
}

/**
 * Whether a monster power went off on the move from `before` to `after`, for the speaker.
 * The flash cannot answer this: it only fires on kills, and Stone Gaze leaves no card on the
 * foundation to see. Sound wants every slay or stash of a carrier the aura actually priced —
 * including a Gorgon kill, which should double up with the slash.
 */
export function afflictionFired(before: TombState, after: TombState): boolean {
	if (!before.bossSuit || !auraActive(before)) return false;
	const wasLoc = new Map(before.game.cards.map((card) => [cardId(card), card.location]));
	const inDraft = new Set(after.draft.map((entry) => entry.id));
	const moved = after.game.cards.find((card) => {
		const id = cardId(card);
		const was = wasLoc.get(id);
		if (!was || was.fixture !== 'cascade') return false;
		const now = card.location.fixture;
		if (now !== 'foundation' && now !== 'cell') return false;
		// A card fed into a spent item slot becomes that item, which the aura skips.
		if (inDraft.has(id)) return false;
		const prior = before.game.cards.find((other) => cardId(other) === id);
		return !!prior && carriesPower(before, prior);
	});
	if (!moved) return false;
	const prior = before.game.cards.find((other) => cardId(other) === cardId(moved));
	switch (before.bossSuit) {
		// Venom and Mug leave evidence: fog lifted without a heal, a wound taken for a dry board, or the
		// slot converted.
		case 'hearts':
			return after.hidden.length < before.hidden.length || newlyWounded(before, after).length > 0;
		case 'spades':
			return after.draft.length < before.draft.length;
		// Stone Gaze leaves a passive face down when it has one left to stone.
		case 'clubs':
			return gazeCell(before) !== null;
		// Mana Burn needs a glyph standing to drain.
		case 'diamonds':
			return !!prior && auraItemOf(before, prior) !== null;
		default:
			return false;
	}
}

/* --------------------------------------------------------------- actions */

export function tombMove(state: TombState, from: CardLocation, to: CardLocation): TombState | null {
	if (state.won) return null;
	state = closePickpocket(state);
	const cards = tombRun(state, from);
	if (!cards.length) return null;
	if (from.fixture === 'cascade' && !runReachesBottom(state, from, cards)) return null;
	// "Frozen" means no hand can shift it: not a build, not a cell, not the foundation. A movement
	// glyph may still carry it when the rules allow that, which is the only way past a stuck column.
	if (cards.some((card) => immobileBoss(state, card))) return null;

	const source = from.fixture === 'cell' ? from.data[0] : -1;
	const entry = source >= 0 ? draftAt(state, source) : undefined;
	// An item only leaves its slot when it is the one beside the chip: conversions run in order.
	if (entry && source !== convertibleCell(state)) return null;
	// The explicit conversion: a drafted card is not played out, parked or buried on the fog — the chip
	// is the only door, and it is one click rather than a drag.
	if (entry && CLAUSES.explicitConversion) return null;
	// An item may still be played out of its slot — a card is a card — and the play spends it. Played
	// into a free cell it is the conversion the chip counts: the slot turns plain and the chip steps
	// past it. Played into a hallway it has gone to the crypt, which is the one trip a Thief's
	// Pickpocket leaves the empty slot waiting on (see the window at the end of the move) — unless
	// the hallway stands empty, in which case the item is set down in the open and the slot converts
	// like a cell-park, with no restock waiting.

	// A spent item slot claims exactly one card on the very next action, and that card becomes the
	// new item. It need not be the suit that left: an Orc's Scavenger takes any card at all.
	const window = state.itemWindow;
	// The slot must stand empty for a restock: a window opens where an item was played out, so a card
	// landing on a slot that still holds one would bury it and leave two items claiming the same cell.
	const feed =
		window &&
		!entry &&
		to.fixture === 'cell' &&
		to.data[0] === window.cell &&
		!state.game.cells[window.cell] &&
		cards.length === 1 &&			restockTakes(cards[0], window)
			? window
			: null;
	// Only a run the free cells could not carry spends the sack; a normal stack move leaves it armed.
	const overfull = cards.length > moveCapacity(state);
	// The boss is the other card no hand can carry, so shifting him is a use of the spell rather than a
	// stack move that happened to go through: otherwise he is the one card the sack moves for free.
	const carriesBoss = cards.some((card) => isBoss(state, card));
	const sack = state.armed?.kind === 'sack' && (overfull || carriesBoss);
	const bury = cydsteppCanBury(state, cards, to);
	// CYDSTEPP is the spell that sets the boss down somewhere new, and carrying him is what spends it:
	// an empty hallway is a plain build, so no hand could ever have reached him for that move.
	const lift = state.armed?.kind === 'cydstepp' && carriesBoss;

	if (source >= 0 && to.fixture === 'foundation') {
		// Home is always an option, wounded or not: the chip's conversion order only governs leaving
		// the cell for the board, and canSendHome enforces it there.
		return attackWith(state, from);
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
		armed: sack || bury || lift ? null : state.armed,
	});

	// The item left its slot the other way: it is spent, and nothing waits to remake it.
	if (entry && source >= 0) {
		next = cloneWith(next, { draft: consumeDraft(next, source) });
	}

	if (feed) {
		// A pinned party keeps its suit even when a card of another one fills the slot.
					const suit = state.synthetic?.[feed.role] ?? cards[0].suit;
			const ability = abilityFor(feed.role, suit);
		const exhausted = [...next.exhausted];
		exhausted[feed.cell] = false;
		next = cloneWith(next, {
			exhausted,
			// One item per slot: whatever the cell claimed before is replaced, never added to.
			draft: [
				...next.draft.filter((existing) => existing.cell !== feed.cell),
				{ cell: feed.cell, role: feed.role, id: cardId(cards[0]), suit, name: ability.name, text: ability.text },
			],
		});
	}

	// A boss-suit minion parked in a free cell still sets off its power, and a Remedy covers that
	// park exactly as it covers a kill: the arm is checked here, not just inside the aura. A card
	// fed into a spent item slot becomes that item, so it is no longer a monster either way.
	if (CLAUSES.bossAuraPark && from.fixture === 'cascade' && to.fixture === 'cell' && !feed && auraActive(next)) {
		for (const card of cards) next = bossAura(next, card, 'park');
	}

				// Pickpocket: an item played out of its slot into a lived-in hallway has gone to the crypt, so the
		// pocket it emptied waits one action — but only for another suit. The item that just left is the one
		// card that cannot come straight back: a pocket refilled with its own suit is a free refresh, and the
		// whole point of the window is that a second item has to be found and spent first. The chip holds
		// where it is while that window is open, which is what lets a Thief work through a pocket's worth of
		// flasks. An empty hallway is set down in the open instead: no window opens, and the slot converts
		// like a cell-park. It is the item pocket only: the glyph, class and kin pockets keep their own suit,
		// because a card that could re-roll a Thief's class mid-crawl is a different character every three
		// moves rather than a thief. A free cell is the other thing entirely; there the slot is filled by a
		// kill, which Pickpocket leaves wide open (see attackWith).
	const pickpocketed =
		entry &&
		source >= 0 &&
		entry.role === 'consumable' &&
		to.fixture === 'cascade' &&
		(state.game.tableau[to.data[0]]?.length ?? 0) > 0 &&
		!next.game.cells[source] &&
		CLAUSES.thiefPickpocket &&
		hasPassive(state, 'Thief')
		? { cell: source, role: entry.role, suit: entry.suit, takes: 'other' as const }
		: null;

	next = settle(next, currentLevel(state));
	if (pickpocketed) next = cloneWith(next, { itemWindow: pickpocketed });

	return spendArmedItem(next);
}

/**
 * Send a card home, paying the HP cost and applying the boss aura.
 *
 * `allowFatal` is the confirm behind a blow the party cannot afford: the card still goes home, and the
 * crawl ends with it if the bill takes every heart. It never opens any other refused kill — the boss
 * gate, a face-down card and a grave out of reach are still refused outright.
 */
export function attackWith(
	state: TombState,
	from: CardLocation,
	reachThroughCover = false,
	allowFatal = false
): TombState | null {
	state = closePickpocket(state);
	const preview = attackPreview(state, from, reachThroughCover);
	if (!preview.legal && !(allowFatal && preview.fatal)) return null;
	const card = cardAt(state.game, from);
	if (!card) return null;

	const levelBefore = currentLevel(state);
	const wasCell = from.fixture === 'cell';
	const cellIndex = wasCell ? from.data[0] : -1;
	const entry = wasCell ? draftAt(state, cellIndex) : undefined;
	// Only the item's own card carries the item with it. A plain card can lie on top of an item slot,
	// and sending that one home leaves the item, its exhaustion and its restock window untouched.
	// Pickpocket's any-suit restock is the item pocket's alone: slaying a glyph, class or kin card still
	// leaves a window that wants that pocket's own suit, for a Thief as much as for anyone else.
	const pickpocket = CLAUSES.thiefPickpocket && entry?.role === 'consumable' && hasPassive(state, 'Thief');
	const itemCard = !!entry && entry.id === cardId(card);

	let next = state;

	const foundation = foundationIndexOf(next.game, card.suit);
	next = cloneWith(next, {
		game: relocate(next, [{ id: cardId(card), to: { fixture: 'foundation', data: [foundation] } }]),
	});

	// Cell conversion: a draft card sent home is gone for good and the cell becomes plain, so any
	// exhaustion it was carrying goes with it — an empty slot has no item left to be spent.
	if (itemCard) {
		const exhausted = [...next.exhausted];
		exhausted[cellIndex] = false;
		next = cloneWith(next, {
			exhausted,
			draft: consumeDraft(next, cellIndex),
		});
	}

	// Whether this blow completed a rank, read with the card already home: Mug is the one power a level up
	// outruns, so the bandit needs to know before it reaches the chip.
	const levelled = currentLevel(next) > levelBefore;
	// A power card that was itself the item is already converting its own slot on the way home, so there is no
	// conversion left to force: the bandit takes the slot as it stands, not the next pocket's worth after one.
	next = itemCard ? next : bossAura(next, card, 'kill', levelled);

	// The kill's own wounds are paid last, so a drained item is already face-down when they land.
	next = cloneWith(next, { wounded: wound(next, preview.damage).wounded });

	// Stone Gaze follows the blow: the kin and the class turn face down, left to right, stopping at
	// the class. Anything the kill's own wounds already turned over is left as it is.
	next = stoneGaze(next, card);

	// A spent item going home leaves its slot empty and waiting: the restock is the player's pick on the
	// very next action, and nothing is pulled off the board for them. Miss that action and the window
	// closes — the slot is plain from then on, which is what the chip counting it as converted means.

	const settled = dropKnockedArm(spendArmedItem(settle(next, levelBefore)));
	// The last heart is gone: the crawl ends here. Read off the board rather than the preview, so a
	// killing blow that levels up is saved by the heal it earns. `fatal` is the bill the preview priced,
	// Venom's dry-board heart included, so a blow that empties the track is exactly the one it refused;
	// a party card played home leaving no hearts behind is the end of a clear, not a death.
	if (preview.fatal && hp(settled) === 0)
		return cloneWith(settled, { won: true, died: true, score: tombScore(settled) });
	// An item sent home leaves its slot waiting for one action: a card of its suit (any card at all, with a
	// Thief's Pickpocket) restocks the item and the chip stays put. A kill is the exit that earns the wide
	// window: the item was spent on a blow, so the pocket may be rebuilt from anything. Any other action
	// drops the window, so the chip steps left and the cell is ordinary from then on.
	// The explicit conversion retired the refill window: a party card leaves its slot through the chip,
	// so nothing is ever waiting to be fed and the chip never holds for one action.
	if (CLAUSES.explicitConversion) return settled;
	if (!entry || !itemCard || settled.game.cells[cellIndex]) return settled;
	return cloneWith(settled, {
		itemWindow: { cell: cellIndex, role: entry.role, suit: entry.suit, takes: pickpocket ? 'any' : 'same' },
	});
}

/** Single click movement affordance: the best tableau build, if there is one. */
export function tombTapTargets(state: TombState, from: CardLocation): CardLocation[] {
	const cards = tombRun(state, from);
	if (!cards.length) return [];
	if (from.fixture === 'cascade' && !runReachesBottom(state, from, cards)) return [];
	// An ability card is never one click away from the board: playing it out spends it for good, so
	// that price is only paid by a drag. A wounded cell is not one click away from anywhere.
	if (from.fixture === 'cell' && (draftAt(state, from.data[0]) || !cellCardMovable(state, from.data[0]))) return [];
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

/** Whether Pickpocket's window is open on this pocket and can be armed right now. */
export function pickpocketUsable(state: TombState, cell: number): boolean {
	if (!CLAUSES.pickpocketSwap || state.pickpocket !== cell) return false;
	const entry = draftAt(state, cell);
	return (
		!!entry &&
		!!state.game.cells[cell] &&
		!state.wounded[cell] &&
		!state.armed &&
		!state.won
	);
}

/**
 * The swap itself: the pocket's card and an exposed tableau card trade places. The stolen card becomes
 * the item — its suit picks the ability, and it counts as drafted for its grave the way every party card
 * does — while the old item card lands on the column as a plain card, free to go home.
 */
export function swapPickpocket(state: TombState, cell: number, target: Card): TombState | null {
	const entry = draftAt(state, cell);
	const held = state.game.cells[cell];
	if (!entry || !held || state.wounded[cell]) return null;
	if (isBoss(state, target) || immobileBoss(state, target)) return null;
	const from = target.location;
	const game = relocate(cloneWith(state, { armed: null }), [
		{ id: cardId(target), to: { fixture: 'cell', data: [cell] } },
		{ id: cardId(held), to: from },
	]);
	const exhausted = [...state.exhausted];
	exhausted[cell] = false;
	const ability = abilityFor(entry.role, target.suit);
	return settle(
		cloneWith(state, {
			game,
			armed: null,
			exhausted,
			pickpocket: null,
			draft: [
				...state.draft.filter((existing) => existing.cell !== cell),
				{ cell, role: entry.role, id: cardId(target), suit: target.suit, name: ability.name, text: ability.text },
			],
		}),
		currentLevel(state)
	);
}

export function useAbility(state: TombState, cell: number): TombState | null {
	if (pickpocketUsable(state, cell)) {
		// Arming leaves the window lit: the pocket is the button and the swap is the click that spends it,
		// so putting the arm down again (the disarm every other ability allows) costs nothing. Anything
		// that is not the swap closes it at that action's own door.
		return cloneWith(state, { armed: { kind: 'pickpocket', cell } });
	}
	state = closePickpocket(state);
	if (!abilityUsable(state, cell)) return null;
	const entry = draftAt(state, cell)!;
	// Dualcast is read live rather than off the draft: a stoned Wizard's pocket is an item again, so the
	// name that decides what this cast does is the one the party reads right now.
	const ability = draftAbility(state, entry);
	const exhausted = [...state.exhausted];
	// A Remedy is not spent by arming it: the action it covers is what exhausts it.
	if (ability.name !== 'Remedy') exhausted[cell] = true;

	let next = cloneWith(state, { exhausted });
	switch (ability.name) {
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
		case 'CYDSTEPP':
			next = cloneWith(next, { armed: { kind: 'cydstepp', cell } });
			break;
		case 'Sack':
		case 'BYSSEPS':
			next = cloneWith(next, { armed: { kind: 'sack', cell } });
			break;
		case 'Purity':
			next = cloneWith(next, { armed: { kind: 'purity', cell } });
			break;
		case 'BURNDAYRAZ':
		case 'PISORF':
		case 'WEYTWUT': {
			const kind = ability.name === 'BURNDAYRAZ' ? 'burndayraz' : ability.name === 'PISORF' ? 'pisorf' : 'weytwut';
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
	// CYDSTEPP answers the drop with the grabbed card laid on the fog.
	if (state.armed.kind === 'cydstepp') return tombMove(state, from, to);
	// A Remedy covers whatever action comes next, so a drop is just the action it covers.
	if (state.armed.kind === 'remedy') return tombMove(state, from, to);
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
	return releaseArm(state);
}

/**
 * A spell whose own card is turned over is knocked out of hand. An arm sits on a face-up card, so it
 * cannot outlive that card: the board would go on offering a cast `abilityUsable` has already
 * refused. It is put down exactly as a disarm puts it down — the cell released and the spell unspent —
 * because losing the spell to a wound reads as a misclick, not as a lost cast.
 * This runs where the injury lands, after the arm that paid for the action has been spent, so an item
 * that pays for the very action is never knocked out of hand by its own bill.
 * Exhaustion needs no rule of its own: casting exhausts a glyph as it arms it, so an armed glyph is
 * already spent, and the only powers that exhaust an unspent item (Burden, Mana Burn) wound it too.
 */
function dropKnockedArm(state: TombState): TombState {
	const armed = state.armed;
	if (!armed) return state;
	// A Remedy is spent by the action it covers, so while that action is being resolved the item is in
	// hand: a power that drains it does not knock it out of hand first.
	if (armed.kind === 'remedy') return state;
	if ((state.wounded[armed.cell] ?? 0) === 0) return state;
	// The wound stays: the arm is released, the blow that knocked it out of hand is not undone.
	return releaseArm(state);
}

/** Putting a spell down, whether by hand or by having it knocked out of hand. */
function releaseArm(state: TombState): TombState {
	if (!state.armed) return state;
	const exhausted = [...state.exhausted];
	exhausted[state.armed.cell] = false;
	return closeItemWindow(cloneWith(state, { armed: null, exhausted }));
}

/**
 * Put the first card of a two-click spell down without spending it: the spell stays armed, so a click
 * that cannot use the pick costs a click rather than the cast.
 */
export function unpick(state: TombState): TombState | null {
	const armed = state.armed;
	if (!armed?.first) return null;
	return cloneWith(state, { armed: { ...armed, first: undefined } });
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

	// A Remedy waits for the action it covers: clicks elsewhere leave it armed.
	if (armed.kind === 'remedy') return null;

	// The sack is a state rather than a target: it waits for the next stack move to carry.
	if (armed.kind === 'sack') return null;

	// Purity names a hallway rather than a card: its three bottommost unfogged cards turn to fog, the boss aside.
	if (armed.kind === 'purity') {
		if (location.fixture !== 'cascade') return null;
		const column = state.game.tableau[location.data[0]] ?? [];
		const hidden = [...state.hidden];
		let turned = 0;
		// The mouth is the last card of the pile, so the sweep starts there and walks into the deep
		// end only as far as the spell reaches.
		for (let index = column.length - 1; index >= 0 && turned < PURITY_REFOG_CARDS; index--) {
			const id = cardId(column[index]!);
			// The boss is not a card the spell can touch, and fog already there is already fog.
			if (id === state.bossId || hidden.includes(id)) continue;
			hidden.push(id);
			turned += 1;
			if (turned === PURITY_REFOG_CARDS) break;
		}
		if (!turned) return null;
		return cloneWith(state, { hidden, armed: null });
	}

	const held = armed.first ? state.game.cards.find((candidate) => cardId(candidate) === armed.first) : undefined;

	// CYDSTEPP takes a card first, then the fog it is laid on — or an empty hallway, which is the one
	// square a hand can put the boss on and the reason every spell has a way to shift him.
	if (armed.kind === 'cydstepp') {
		const column = foggedColumn(state, location);
		if (column !== null) {
			if (!held) return null;
			return tombMove(state, held.location, { fixture: 'cascade', data: [column] });
		}
		const card = cardAt(state.game, location);
		if (!card || isFaceDown(state, card)) {
			const empty = location.fixture === 'cascade' && !(state.game.tableau[location.data[0]]?.length ?? 0);
			if (empty && held && isBoss(state, held))
				return tombMove(state, held.location, { fixture: 'cascade', data: [location.data[0]] });
			return null;
		}
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
			// The pair lands in the order it stood: the card that was on top of the column stays on top of
			// the cell. Laid the other way up, the slot offers the card that was *under* it — and if that
			// card is a frozen boss, the cell is dead to the touch and the card above it can never be taken.
			const game = relocate(cloneWith(state, { armed: null }), [
				{ id: cardId(pair[0]), to: { fixture: 'cell', data: [to, 0] } },
				{ id: cardId(pair[1]), to: { fixture: 'cell', data: [to, 1] } },
			]);
			let landed = cloneWith(state, { game, armed: null });
			// A stashed monster sets its power off however it reached the pocket, so the pair PISORF
			// parks pays it as a one-card park would. The cast is one action, so it owes one trigger:
			// a lesser king lying on a boss-suit minion is two carriers and still one park.
			const carrier = CLAUSES.bossAuraPark ? pair.find((member) => carriesPower(landed, member)) : undefined;
			if (carrier) landed = bossAura(landed, carrier, 'park');
			return settle(landed, currentLevel(state));
		}
		// First click: the head of a proper two-card stack.
		const pair = pisorfPair(state, location);
		const head = cardAt(state.game, location);
		if (!pair || !head) return null;
		return cloneWith(state, { armed: { ...armed, first: cardId(head) } });
	}

	if (armed.kind === 'pickpocket') {
		// The one target a stolen card can have: the exposed top of a hallway. The boss is no hand's to take.
		if (location.fixture !== 'cascade') return null;
		const target = cardAt(state.game, location);
		const pile = state.game.tableau[location.data[0]] ?? [];
		if (!target || isFaceDown(state, target) || pile[pile.length - 1] !== target) return null;
		return swapPickpocket(state, armed.cell, target);
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
	if (immobileBoss(state, first) || immobileBoss(state, card)) return null;
	const game = relocate(cloneWith(state, { armed: null }), [
		{ id: armed.first, to: card.location },
		{ id: cardId(card), to: first.location },
	]);
	return settle(cloneWith(state, { game, armed: null }), currentLevel(state));
}

