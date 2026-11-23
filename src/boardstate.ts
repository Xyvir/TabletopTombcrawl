import {
	getRankForCompare,
	getSuitForCompare,
	initializeDeckOfCards,
	RankList,
	shorthandCard,
	SuitList,
	type Card,
	type CardLocation,
} from './game/card/card';
import { FreeCell } from './game/game';
import {
	bossSlain,
	CLAUSES,
	cellCards,
	DRAFT_CELL_COUNT,
	FREE_CELL_COUNT,
	ROLES_BY_DRAW_ORDER,
	TOMB_CASCADE_COUNT,
	abilityFor,
	type DraftCard,
	type TombState,
} from './tombcrawl';

/**
 * A whole board in one line of text, every character a card: the 52 letters of the base64 alphabet,
 * in the deck's own order (`A` is the ace of clubs, `z` the king of spades). No digits, no `+` or `/`,
 * so a boardstring survives a URL, a chat message and a paste box unchanged.
 *
 *     [seed:]<columns>/<cells>
 *
 * The seed is provenance and nothing else: it names the crawl the board came from, so the layout sheet
 * and the solver probe have something to read. A puzzle is just a board with no crawl behind it, so
 * the prefix is optional — a string without one decodes to `seed 0`, and encodes back the same way.
 *
 * - `columns` is eight pile tokens, bottom card first; `cells` is one token per pocket, left to right.
 * - `*` before a card turns it face down: fog in a column, a wound in a pocket. `!` after a pocket's
 *   cards marks an ability already spent.
 * - `^` before a card marks the boss king. It is the one thing a board cannot imply: the dungeon's
 *   boss is whichever king the deal revealed first, and nothing about where the kings now stand
 *   remembers which one it was.
 *
 * Everything else is implied. A card that is not written down has gone home, so the home row is the
 * rest of the deck; the party is read off the four drafted pockets, one role per pocket in draw order
 * with the ability its suit brings. That leaves the interesting cards — the ones still in the tomb —
 * and nothing else, which is what keeps a mid-crawl board around a hundred characters:
 *
 *     1803:.Qa.zuomjdb.^yvpkifZURM.wtrlgeYWT.N.X.xsqnh/P.V.L.c!...*S.
 *
 * A pocket whose card has converted to a plain pocket reads as that role again if a card is parked
 * there, because a string has no way to say "this pocket no longer holds an item" — leave the pocket
 * empty and the role is gone.
 */

/** One card per letter, in the order `initializeDeckOfCards` lays the deck out. */
export const BOARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const DOWN = '*';
const BOSS = '^';
const SPENT = '!';
const PILE_SEPARATOR = '.';
const SECTION_SEPARATOR = '/';

function letterFor(card: Card): string {
	return BOARD_ALPHABET[getRankForCompare(card.rank) * 4 + getSuitForCompare(card.suit)];
}

function cardFor(letter: string | undefined): Card | null {
	if (!letter) return null;
	const index = BOARD_ALPHABET.indexOf(letter);
	if (index < 0) return null;
	return {
		rank: RankList[Math.floor(index / 4)],
		suit: SuitList[index % 4],
		location: { fixture: 'deck', data: [0] },
	};
}

/** A pile token: each card with the markers that stick to it. */
const pileText = (cards: { card: Card; down: boolean; boss: boolean }[]): string =>
	cards
		.map(({ card, down, boss }) => `${down ? DOWN : ''}${boss ? BOSS : ''}${letterFor(card)}`)
		.join('');

/**
 * The board as one line, in the grammar above. `withSeed` prints the crawl number when the board has
 * one; pass false for a puzzle that is not tied to a deal.
 */
export function encodeBoard(state: TombState, withSeed = true): string {
	// A boss already home has no card left to mark, and a string cannot name one that is implied;
	// the crawl is won by then, so it is the one thing that is not carried.
	const bossId = state.bossId;
	const mark = (card: Card, down: boolean) => ({
		card,
		down,
		boss: !!bossId && shorthandCard(card) === bossId,
	});
	const columns = state.game.tableau.map((pile) =>
		pileText(pile.map((card) => mark(card, state.hidden.includes(shorthandCard(card)))))
	);
	const cells = state.game.cells.map((_, index) => {
		const stack = cellCards(state, index);
		const wounded = state.wounded[index] ?? 0;
		const text = pileText(stack.map((card, depth) => mark(card, depth < wounded)));
		return state.exhausted[index] ? text + SPENT : text;
	});
	const head = withSeed && state.seed ? `${state.seed}:` : '';
	return `${head}${columns.join(PILE_SEPARATOR)}${SECTION_SEPARATOR}${cells.join(PILE_SEPARATOR)}`;
}

/** One pile's cards and flags, before they are placed on a board. */
interface ReadPile {
	cards: { card: Card; down: boolean; boss: boolean }[];
	exhausted: boolean;
}

/**
 * Read one pile token. `*` and `^` mark the card after them face down and boss; in a pocket the
 * wounds are the bottom of the stack, so a face-down card may not sit above a face-up one. `!`
 * closes a pocket token only.
 */
function readPile(text: string, pocket: boolean): ReadPile | null {
	const cards: { card: Card; down: boolean; boss: boolean }[] = [];
	let exhausted = false;
	let faceUp = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === SPENT) {
			if (!pocket || exhausted || index !== text.length - 1) return null;
			exhausted = true;
			continue;
		}
		let down = false;
		let boss = false;
		while (text[index] === DOWN || text[index] === BOSS) {
			if (text[index] === DOWN) down = true;
			else boss = true;
			index += 1;
		}
		const card = cardFor(text[index]);
		if (!card) return null;
		if (pocket) {
			if (faceUp && down) return null;
			if (!down) faceUp = true;
			if (cards.length === 2) return null;
		}
		cards.push({ card, down, boss });
	}
	if (pocket && exhausted && !cards.length) return null;
	return { cards, exhausted };
}

/**
 * Read a boardstring back into a position, or null if the text is not one: a bad letter, a repeated
 * card, a column short — the named cards are checked, so a typo is refused rather than played.
 */
export function decodeBoard(text: string): TombState | null {
	const body = text.trim();
	if (!body) return null;

	// A crawl number is the one thing written before the board, and a puzzle simply has none.
	let seed = 0;
	let boardText = body;
	const colon = body.indexOf(':');
	if (colon >= 0) {
		const head = body.slice(0, colon);
		if (!/^\d{1,7}$/.test(head)) return null;
		seed = Number(head);
		boardText = body.slice(colon + 1);
	}

	const parts = boardText.split(SECTION_SEPARATOR);
	if (parts.length !== 2) return null;
	const columnTexts = parts[0].split(PILE_SEPARATOR);
	const cellTexts = parts[1].split(PILE_SEPARATOR);
	if (columnTexts.length !== TOMB_CASCADE_COUNT) return null;
	if (cellTexts.length < DRAFT_CELL_COUNT || cellTexts.length > 9) return null;

	const cards: Card[] = [];
	const seen = new Set<string>();
	let boss: Card | null = null;
	const place = (card: Card, location: CardLocation): boolean => {
		const id = shorthandCard(card);
		if (seen.has(id)) return false;
		seen.add(id);
		cards.push({ ...card, location });
		return true;
	};

	const hidden: string[] = [];
	for (let column = 0; column < columnTexts.length; column += 1) {
		const pile = readPile(columnTexts[column], false);
		if (!pile) return null;
		for (let row = 0; row < pile.cards.length; row += 1) {
			const { card, down, boss: marked } = pile.cards[row];
			if (down) hidden.push(shorthandCard(card));
			if (!place(card, { fixture: 'cascade', data: [column, row] })) return null;
			// One `^` in the whole string, on a card named once.
			if (marked) {
				if (boss) return null;
				boss = card;
			}
		}
	}

	const wounded: number[] = [];
	const exhausted: boolean[] = [];
	const pocketTops: (Card | null)[] = [];
	for (let cell = 0; cell < cellTexts.length; cell += 1) {
		const pile = readPile(cellTexts[cell], true);
		if (!pile) return null;
		wounded.push(pile.cards.filter((entry) => entry.down).length);
		exhausted.push(pile.exhausted);
		pocketTops.push(pile.cards.length ? pile.cards[pile.cards.length - 1].card : null);
		// The stack is written bottom first, so the last card is the one the pocket shows.
		for (let depth = 0; depth < pile.cards.length; depth += 1) {
			const { card, boss: marked } = pile.cards[depth];
			if (!place(card, { fixture: 'cell', data: [cell, depth] })) return null;
			if (marked) {
				if (boss) return null;
				boss = card;
			}
		}
	}

	// Every card the string did not name is home, dealt to the foundation its suit owns.
	for (const card of initializeDeckOfCards()) {
		if (seen.has(shorthandCard(card))) continue;
		if (!place(card, { fixture: 'foundation', data: [SuitList.indexOf(card.suit)] })) return null;
	}

	const game = new FreeCell({
		cellCount: cellTexts.length,
		cascadeCount: TOMB_CASCADE_COUNT,
		cards,
	});
	// A pocket shows its top card, and a PISORF stack seats two: the slot reads the deepest one.
	for (let cell = 0; cell < cellTexts.length; cell += 1) {
		let top: Card | null = null;
		for (const card of game.cards) {
			if (card.location.fixture !== 'cell' || card.location.data[0] !== cell) continue;
			if (!top || (top.location.data[1] ?? 0) < (card.location.data[1] ?? 0)) top = card;
		}
		game.cells[cell] = top;
	}

	// The party is the four drafted pockets: a role per pocket in draw order, its ability from the
	// suit of the card still sitting there. An empty pocket has converted, so its role is gone.
	const draft: DraftCard[] = [];
	pocketTops.slice(0, DRAFT_CELL_COUNT).forEach((card, cell) => {
		if (!card) return;
		const role = ROLES_BY_DRAW_ORDER[cell];
		const ability = abilityFor(role, card.suit);
		draft.push({
			cell,
			role,
			id: shorthandCard(card),
			suit: card.suit,
			name: ability.name,
			text: ability.text,
		});
	});
	// A Wizard's Dualcast gives the item slot a glyph's name at the deal, so a rebuilt board says the same.
	if (CLAUSES.wizardDualcast && draft.some((entry) => entry.role === 'class' && entry.name === 'Wizard')) {
		const item = draft.find((entry) => entry.role === 'consumable');
		if (item) {
			const glyph = abilityFor('glyph', item.suit);
			item.name = glyph.name;
			item.text = glyph.text;
		}
	}

	const kin = draft.find((entry) => entry.role === 'kin');
	// Constitution is a property of the deal, and the pocket it opened is the one thing the deal is missing:
	// a Dwarf on a track's own row is a Dwarf whose extra pocket was dealt.
	const constitution =
		CLAUSES.dwarfConstitution &&
		kin?.name === 'Dwarf' &&
		game.cells.length >= DRAFT_CELL_COUNT + FREE_CELL_COUNT.med;
	const reserveHeld = !game.cells[game.cells.length - 1];

	const state: TombState = {
		game,
		seed,
		hidden,
		draft,
		bossId: boss ? shorthandCard(boss) : null,
		bossSuit: boss ? boss.suit : null,
		constitution,
		exhausted,
		wounded,
		won: false,
		died: false,
		reserveHeld,
		trueBoss: false,
		score: null,
		armed: null,
		itemWindow: null,
		pickpocket: null,
		synthetic: null,
	};
	return { ...state, trueBoss: reserveHeld && bossSlain(state) };
}
