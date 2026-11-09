import { BOTTOM_OF_CASCADE } from '@/game/constants';
import { FreeCell } from '@/game/game';

/* *********** */
/* DEFINITIONS */
/* *********** */

export const SuitList = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SuitList)[number];
export function isSuit(val: string | undefined): val is Suit {
	if (!val) return false;
	return (SuitList as readonly string[]).includes(val);
}
export const isRed = (suit: Suit) => suit === 'diamonds' || suit === 'hearts';
type SuitSH = 'C' | 'D' | 'H' | 'S';

export const RankList = [
	'ace',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'jack',
	'queen',
	'king',
	'joker',
] as const;
export type Rank = (typeof RankList)[number];
export function isRank(val: string | undefined): val is Rank {
	if (!val) return false;
	return (RankList as readonly string[]).includes(val);
}
type RankSH = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'W';

export const getSuitForCompare = (suit: Suit): number => SuitList.indexOf(suit);
export const getRankForCompare = (rank: Rank): number => RankList.indexOf(rank);
export const isAdjacent = ({ min, max }: { min: Rank; max: Rank }) =>
	getRankForCompare(min) === getRankForCompare(max) - 1;

/**
	rank shorthand + suit shorthand, aka `rs`

	- XXX (techdebt) use type CardSH everywhere it makes sense

	@example 'KH'
	@example 'AS'
*/
export type CardSH = `${RankSH}${SuitSH}`;

const FixtureList = ['deck', 'cell', 'foundation', 'cascade'] as const;

export type Fixture = (typeof FixtureList)[number];
export function isFixture(val: string): val is Fixture {
	return (FixtureList as readonly string[]).includes(val);
}

export const PileSHList = [
	'a',
	'b',
	'c',
	'd',
	'e',
	'f',
	'h',
	'k', // deck
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'0',
] as const;

/**
	foundation: h
	cells: a - d
	cascades: 1 - 9, 0 (1-8, but we allow 9 and 10 columns)
	deck: k

	@see [Standard FreeCell Notation](https://www.solitairelaboratory.com/solutioncatalog.html)
*/
export type PileSH = (typeof PileSHList)[number];
export function isPileSH(val: string): val is PileSH {
	return (PileSHList as readonly string[]).includes(val);
}

export interface CardLocation {
	readonly fixture: Fixture;
	// XXX (techdebt) (refactor-rename) (coords) location.data → location.coords, d0/d1 → c0/c1
	//  - do this after the whole "rewrite actionText-examples.ts" thing
	readonly data: number[];
}
/** REVIEW (coords) (types) why do we even have `Coord`, instead of just `string`? */
export type Coord = string & { length: 1 };
/**
	- REVIEW (coords) (types) why do we even have `LocationSH`, instead of just `string`?
	   - why not simply use `${PileSH}${string}`, but then we have {@linkcode Coord}
	   - how far do we have to go down this type rabbit hole, when does the utility end?
	   - {@linkcode PileSH} _is_ useful
	   - even as written, it's imprecise
*/
export type LocationSH = PileSH | `${PileSH}${Coord}`;

export interface CardShorthand {
	readonly rank: Rank;
	readonly suit: Suit;
}
export interface Card extends CardShorthand {
	location: CardLocation;
}

export interface CardSequence {
	/**
		the first card in the sequence
		(cursor, selection)
	*/
	location: CardLocation;

	/**
		the list of cards in the sequence
		(alternates red/black, rank descends by one)
	*/
	cards: Card[];

	/**
		Since we allow select-to-peek, not all selections are legal/ly movable.

		If we were to act entirely based on shorthand, "select 3 JD" would mean, "select the last complete sequence in 3".
		However, we allow something like "select JD", technically in 3, but not the last card(s) in the cascade.

		this is _**not**_ `hasAvailableMoves = !!availableMoves?.length`
	*/
	peekOnly: boolean;
}

/* ************** */
/* HELPER METHODS */
/* ************** */

/**
	Create the standard deck of cards for a new game.

	- XXX (joker) will need to add an argument
*/
export function initializeDeckOfCards(includeJoker = false): Card[] {
	const deck = new Array<Card>();

	/*
		initialize deck
		this order was chosen because of how the shuffle32 reference algoritm works

		> Create an array of 52 cards:
		> Ace of Clubs, Ace of Diamonds, Ace of Hearts, Ace of Spades, 2 of Clubs, 2 of Diamonds,
		> and so on through the ranks: Ace, 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen, King.
		> The array indexes are 0 to 51, with Ace of Clubs at 0, and King of Spades at 51.
	*/
	RankList.forEach((rank) => {
		if (rank === 'joker' && !includeJoker) return;
		SuitList.forEach((suit) => {
			const card: Card = {
				rank,
				suit,
				location: { fixture: 'deck', data: [deck.length] },
			};
			deck.push(card);
		});
	});

	return deck;
}

/**
	used when we collect all the cards from across tableau
	(for some reason, like reversing a deal)
	and we need to re-arrange the collected cards back into the OG order like whe the game was created

	`game.cards` just always have a fixed order, regardless of the locations of those cards \
	`game.deck`, `game.cell`, `game.foundation`, `game.tableau` have cards in a gameplay-meaningful order

	(this could be a sortCardsByRankAndSuit or something, but "og order" is what's important here)

	@param cards OG order of the cards (i.e. game.cards)
	@param cards sort this list in-place
*/
export function sortCardsOG(game: FreeCell, cards: Card[]): void {
	const order = new Map<string, number>();
	game.cards.forEach((card, idx) => {
		order.set(shorthandCard(card), idx);
	});
	cards.sort((a, b) => {
		const oa = order.get(shorthandCard(a));
		const ob = order.get(shorthandCard(b));

		// REVIEW (refactor-no-throw) where is this used?
		//  - explain why throw is still okay
		if (oa == undefined)
			throw new Error(`undeal deck has ${shorthandCard(a)}, but game cards do not?`);
		if (ob == undefined)
			throw new Error(`undeal deck has ${shorthandCard(b)}, but game cards do not?`);

		return oa - ob;
	});
}

/**
	sort the cards by suit (primary) and rank (secondary),
	and then assigns d0 to all of them
	(this is meant to be used _as a_ game.deck)

	- TODO (optimize) (flourish-anim) do not shuffle in place, produce a new state
	   - basically, we should do another game.__clone
	   - or maybe, since this is only used by juice, we should move it there for now
*/
export function sortCardsBySuitAndRank(deck: Card[]): void {
	deck.sort((a, b) => {
		// sort by suit (high to low)
		const sa = getSuitForCompare(a.suit);
		const sb = getSuitForCompare(b.suit);
		if (sa !== sb) return sb - sa;

		// sort by rank (high to low)
		const ra = getRankForCompare(a.rank);
		const rb = getRankForCompare(b.rank);
		return rb - ra;
	});

	// this is "unshuffle" the cards
	// so if we game.undo to undeal (but no unshuffle), we will lose that
	deck.forEach((card, idx) => {
		card.location = { fixture: 'deck', data: [idx] };
	});
}

export function calcCardId(shorthand: string, gameBoardId?: string) {
	let cardId = 'c' + shorthand;
	if (gameBoardId) {
		cardId += '-' + gameBoardId;
	}
	return cardId;
}

export function calcPilemarkerId(location: CardLocation, gameBoardId?: string) {
	let pileId = `pilemarker-${shorthandPile(location)}`;
	if (pileId === 'pilemarker-h') {
		pileId += '-' + (location.data[0] + 1).toString(10);
	}
	if (gameBoardId) {
		pileId += '-' + gameBoardId;
	}
	return pileId;
}

/**
	we need to duplicate cards to detect when it changes
	cards need to remain in consitent order for react[key=""] to work
*/
export function cloneCards(cards: Card[]): Card[] {
	return cards.map((card) => ({ ...card }));
}

export function findCard(cards: Card[], card: CardShorthand | null | undefined): Card {
	// REVIEW (refactor-no-throw) where is this used?
	//  - explain why throw is still okay
	if (!card) throw new Error('no card provided');
	const found = cards.find((c) => c.suit === card.suit && c.rank === card.rank);
	if (!found) throw new Error('missing card ' + shorthandCard(card));
	return found;
}

export function isLocationEqual(a: CardLocation, b: CardLocation): boolean {
	return a.fixture === b.fixture && a.data[0] === b.data[0] && a.data[1] === b.data[1];
}

export function getCardAt(game: FreeCell, location: CardLocation): Card | null {
	const [d0] = location.data;

	switch (location.fixture) {
		case 'deck':
			return game.deck[d0] || null;
		case 'foundation':
			return game.foundations[d0];
		case 'cell':
			return game.cells[d0];
		case 'cascade': {
			const d1 = location.data[1];
			const cascade = game.tableau.at(d0);
			return cascade?.at(d1) ?? null;
		}
	}

	// no card at location
	return null;
}

export function getSequenceAt(game: FreeCell, location: CardLocation): CardSequence {
	const [d0] = location.data;

	switch (location.fixture) {
		case 'deck':
			{
				const card = game.deck.at(d0);
				if (card) {
					return {
						location,
						cards: [card],
						peekOnly: true,
					};
				}
			}
			break;
		case 'foundation':
			{
				const card = game.foundations[d0];
				if (card) {
					return {
						location,
						cards: [card],
						peekOnly: true,
					};
				}
			}
			break;
		case 'cell':
			{
				const card = game.cells[d0];
				if (card) {
					return {
						location,
						cards: [card],
						peekOnly: false,
					};
				}
			}
			break;
		case 'cascade': {
			const cascade = game.tableau[d0];
			let idx = location.data[1];

			if (!cascade[idx]) break;

			const sequence: CardSequence = {
				location,
				cards: [cascade[idx]],
				peekOnly: true,
			};

			while (
				idx < cascade.length - 1 &&
				isAdjacent({ min: cascade[idx + 1].rank, max: cascade[idx].rank }) &&
				isRed(cascade[idx].suit) !== isRed(cascade[idx + 1].suit)
			) {
				idx++;
				sequence.cards.push(cascade[idx]);
			}

			if (idx === cascade.length - 1) {
				sequence.peekOnly = false;
			}

			return sequence;
		}
	}

	// no cards at selection
	return { location, cards: [], peekOnly: true };
}

/* ************* */
/* PRINT / PARSE */
/* ************* */

// REVIEW (techdebt) what does 'shorthand' even mean?
//  - rank,suit/card/sequence
//  - pile/location/move/history
//  - parseShorthandMove, parseShorthandPileForMove, parseShorthandPileForSelect
//  - review every use of `shorthand`, `sh`, "Shorthand"
// ---
//  - "sh" just means "the text representation"
//  - `Pile` is the code/json and `PileSH` is how we represent it in print/parse
//  - so this is just an encode/decode process between JSON and string
//  - maybe we stop using "shorthand" altogether and start using "str"
//  - maybe we stick with "SH" suffix matching the analogous object
//  - PileStr, LocationStr, CardStr 🤔
//  - rename to "printShorthandCard" to match "parseShorthandCard"
export function shorthandCard(card: CardShorthand | null | undefined): CardSH | '  ' {
	if (!card) return '  ';
	const r = card.rank === '10' ? 'T' : card.rank === 'joker' ? 'W' : card.rank[0];
	const s = card.suit[0];
	return (r + s).toUpperCase() as CardSH;
}

export function parseShorthandCard(rs: string | undefined): CardShorthand | null {
	if (!rs) return null;

	const [r, s] = rs;
	if (!r || r === ' ' || !s || s === ' ') return null;

	let rank: Rank;
	let suit: Suit;
	switch (r) {
		case 'A':
			rank = 'ace';
			break;
		case '2':
		case '3':
		case '4':
		case '5':
		case '6':
		case '7':
		case '8':
		case '9':
			rank = r;
			break;
		case 'T':
			rank = '10';
			break;
		case 'J':
			rank = 'jack';
			break;
		case 'Q':
			rank = 'queen';
			break;
		case 'K':
			rank = 'king';
			break;
		case 'W':
			rank = 'joker';
			break;
		default:
			// REVIEW (parse) (refactor-no-throw) maybe return null? it should only be invalid during a parse
			throw new Error(`invalid rank shorthand: "${r}"`);
	}

	switch (s) {
		case 'C':
			suit = 'clubs';
			break;
		case 'D':
			suit = 'diamonds';
			break;
		case 'H':
			suit = 'hearts';
			break;
		case 'S':
			suit = 'spades';
			break;
		default:
			// REVIEW (parse) (refactor-no-throw) maybe return null? it should only be invalid during a parse
			throw new Error(`invalid suit shorthand: "${s}"`);
	}

	return { rank, suit };
}

export function shorthandSequence(sequence: CardSequence) {
	return sequence.cards.map((card) => shorthandCard(card)).join('-');
}

/**
	Use coords for: Location (card)
	 - ❌ cell
	 - ✅ foundation
	 - ✅ cascade
	 - ✅ deck

	Use coords for: Pile (without card)
	 - ❌ cell
	 - ✅ foundation
	 - ❌ cascade
	 - ❌ deck

	Never use coords for:
	 - `game.print()`
	 - `game.print({ includeHistory: true })` (except if we are dumping the 'invalid history list')
*/
export function shorthandLocation(location: CardLocation): LocationSH {
	const d0 = location.data[0];
	switch (location.fixture) {
		case 'cell': {
			return shorthandPile(location);
		}
		case 'deck':
		case 'foundation': {
			const braille = d0 >= 0 ? countToBraille(d0) : '';
			return `${shorthandPile(location)}${braille}`;
		}
		case 'cascade': {
			const d1 = location.data[1];
			const braille = d1 >= 0 ? countToBraille(d1) : '';
			return `${shorthandPile(location)}${braille}`;
		}
	}
}

/**
	Used for referencing a _pile_, not a card location.

	Also, just the "standard notation" without coords.

	@see {@linkcode shorthandLocation}
*/
export function shorthandPile(location: CardLocation): PileSH {
	const d0 = location.data[0];
	switch (location.fixture) {
		case 'deck':
			return 'k';
		case 'cell':
			// XXX (techdebt) && d0 < game.cells.length
			// 0 <= d0 < MAX_CELL_COUNT
			if (d0 >= 0 && d0 < 6) {
				return (d0 + 10).toString(16) as PileSH;
			}
			break;
		case 'foundation':
			return 'h';
		case 'cascade':
			if (d0 === 9) {
				return '0';
			} else if (d0 >= 0 && d0 < 9) {
				return (d0 + 1).toString(10) as PileSH;
			}
			break;
	}
	// shouldn't happen, mostly to make typescript happy
	throw new Error(`invalid location: ${JSON.stringify(location)}`);
}

export function parseShorthandLocation(p: LocationSH): CardLocation {
	const location = parseShorthandPile(p as PileSH);
	switch (location.fixture) {
		case 'cascade':
			// p[1] is optional, then brailleToCount ⇒ 0
			location.data[1] = brailleToCount(p[1]);
			break;
		case 'foundation':
			// p[1] is required, …but brailleToCount ⇒ 0
			location.data[0] = brailleToCount(p[1]);
			break;
		case 'cell':
			// p[1] is not allowed
			// REVIEW (optimize) (parse) (refactor-no-throw) (test) this is a nice way to enforce it, but it's probably better to just leave it off?
			//  - maybe check if NODE_ENV === 'test' ??
			// if (p[1]) throw new Error(`cell should never have coords -- "${p}"`);
			break;
		case 'deck':
			// p[1] is optional, then data[0] ⇐ BOTTOM_OF_CASCADE
			if (p[1]) location.data[0] = brailleToCount(p[1]);
			break;
	}
	return location;
}

/**
	@see parseShorthandPileForSelect
	@see parseShorthandPileForMove
*/
export function parseShorthandPile(p: PileSH): CardLocation {
	// use p[0] just in case we pass in a LocationSH
	switch (p[0] as PileSH) {
		case '1':
		case '2':
		case '3':
		case '4':
		case '5':
		case '6':
		case '7':
		case '8':
		case '9':
			// this isn't a valid cursor location, it will need to be clamped
			// cascades can have sequences, so you need to decide if you really want the "bottom"
			return {
				fixture: 'cascade',
				data: [parseInt(p, 10) - 1, BOTTOM_OF_CASCADE],
			};
		// ten
		case '0':
			return {
				fixture: 'cascade',
				data: [9, BOTTOM_OF_CASCADE],
			};
		case 'h':
			// h could refer to _any_ of the foundations; this needs to be verified
			// h simply does not carry any more information with it
			// consider using parseShorthandPileForMove instead
			return { fixture: 'foundation', data: [0] };
		case 'k':
			return { fixture: 'deck', data: [BOTTOM_OF_CASCADE] };
		case 'a':
		case 'b':
		case 'c':
		case 'd':
		case 'e':
		case 'f':
			return { fixture: 'cell', data: [parseInt(p, 16) - 10] };
	}
	// XXX (parse) (refactor-no-throw) just delete it?
	// throw new Error(`invalid pile shorthand: "${p}"`);
}

/**
	https://en.wikipedia.org/wiki/Braille_Patterns

	6 dots are traditional literary text, and 8 dots are so computers can abuse them

	we can use them to get the selection length (the number of cards that moved).
	we can use them to get an actual location of a cursor (if we log a pile + coord).
*/
const START_OF_8_DOT_BRAILLE = 0x2840;
const end = START_OF_8_DOT_BRAILLE + 191; // (end-start=191) must be larger than BOTTOM_OF_CASCADE=99
export const countToBraille = (count = 0) =>
	String.fromCodePoint(START_OF_8_DOT_BRAILLE + count) as Coord;
export const brailleToCount = (char = '⡀') => char.charCodeAt(0) - START_OF_8_DOT_BRAILLE;
export function removeBraille(actionText: string | undefined): string {
	if (!actionText) return '';
	return [...actionText]
		.filter((ch) => {
			const code = ch.codePointAt(0);
			return code === undefined || code < START_OF_8_DOT_BRAILLE || code > end;
		})
		.join('');
}
