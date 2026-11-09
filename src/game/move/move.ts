import { BOTTOM_OF_CASCADE } from '@/game/constants';
import {
	Card,
	CardLocation,
	CardSequence,
	cloneCards,
	findCard,
	getCardAt,
	getRankForCompare,
	getSequenceAt,
	isAdjacent,
	isRed,
	parseShorthandLocation,
	parseShorthandPile,
	PileSH,
	shorthandCard,
	shorthandLocation,
	shorthandPile,
	shorthandSequence,
	Suit,
} from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { _parseShorthandMove, PreviousActionType } from '@/game/move/history';
import {
	MoveDestinationTypePriorities,
	MoveDestinationTypePrioritiesForKingSingle,
	MoveDestinationTypePrioritiesForLowSingle,
} from '@/game/move/move.autoMovePriorities';

/* *********** */
/* DEFINITIONS */
/* *********** */

/**
	used to determind {@linkcode MoveDestinationTypePriorities}

	we only categorize "valid moves", not "any given selection"

	Moving cards from the deck isn't a standard move.
	With intention, GameFunction: 'recall-or-bury' allows 'deck' as a MoveSourceType.

	Moving cards from the foundation ins't a standard move.
	REVIEW (move-foundation) update this comment if/when we impl it
*/
export type MoveSourceType = 'cell:single' | 'cascade:single' | 'cascade:sequence';

/**
	used to determind {@linkcode MoveDestinationTypePriorities}

	we only categorize "valid moves", not "any given destination"

	Moving cards to the deck isn't a standard move.
	With intention, GameFunction: 'recall-or-bury' allows 'deck' as a MoveDestinationType.
*/
const MoveDestinationTypeList = [
	'cell:empty',
	'foundation:any',
	'cascade:empty',
	'cascade:sequence',
] as const;
export type MoveDestinationType = (typeof MoveDestinationTypeList)[number];

/**
	{@linkcode MoveDestinationTypePriorities} is good as a general rule of thumb,
	but in some special/edge cases, we want to deviate

	we aren't hair-splicing the {@linkcode AvailableMove.priority},
	we are picking which {@linkcode MoveDestinationType} is best

	this is simple, in concept, but gnarly to look at

	- TODO (drag-and-drop) (test) test drag-and-drop for every MoveSourceType ⨉ MoveDestinationType
*/
function calcMoveDestinationTypePriority(
	game: FreeCell,
	selection: CardSequence,
	moveSourceType: MoveSourceType
) {
	if (selection.cards.length === 1) {
		const moving_card = selection.cards[0];
		if (moving_card.rank === 'king') {
			// TODO (joker) don't forget to test with jokers
			return MoveDestinationTypePrioritiesForKingSingle;
		}
		if (moving_card.rank === 'ace' || moving_card.rank === '2') {
			return MoveDestinationTypePrioritiesForLowSingle;
		}

		// XXX (optimize) (settings) skip this clause if game settings are opp+2|oppopp+1, opp+2, or none
		if (moveSourceType === 'cell:single' || moveSourceType === 'cascade:single') {
			if (foundationCanAcceptCards(game, moving_card.suit, 'opp+2|oppopp+1')) {
				return {
					...MoveDestinationTypePriorities[moveSourceType],
					'foundation:any': MoveDestinationTypeList.length + 1,
				};
			}
		}
	}

	return MoveDestinationTypePriorities[moveSourceType];
}

export interface AvailableMove {
	/** where we could move the selection */
	location: CardLocation;

	/**
		helps us think about priorities / communicate settings / sort move order
		while we have a single moveSourceType (the selection),
		we can have multiple moveDestinationTypes within the list of availableMoves
	*/
	moveDestinationType: MoveDestinationType;

	/**
		helps pick the best move for "auto-foundation"

		if we are going to visualize them debug mode, we need to have it precomputed

		we really only need a boolean for "best" since auto-move will only pick the one,
		having the numbers is better for testing
	*/
	priority: number;
}

// TODO (gameplay) (settings) these _exist_, but we need to be able to pick them
export type AutoFoundationLimit =
	// allow all cards that can
	// i.e. 3H KS KD KC
	| 'none'

	// 3s are set, allow 4s and 5s, allow black 7 since black 5s are up (since black 6s can)
	// i.e. 3H 5S 7D 5C
	| 'opp+2'

	// 3s are set, allow the 4s and 5s, red 6s IFF black 5s are up
	// i.e. 3H 5S 6D 5C
	// (the best we can safely do)
	| 'opp+2|oppopp+1'

	// 3s are set, allow the 4s, red 5s IFF black 5s are up
	// i.e. 3H 4S 5D 4C
	// (this is standard gameplay)
	| 'opp+1'

	// 3s are set, allow the 4s and 5s, but not 6s
	// i.e. 3H 5S 5D 5C
	| 'rank+1'

	// 3s are set, allow the 4s before any 5
	// i.e. 3H 4S 4D 4C
	| 'rank';

/* *************** */
/* COUNTING THINGS */
/* *************** */

export function countEmptyCells(game: FreeCell): number {
	return game.cells.reduce((ret, card) => ret + (card ? 0 : 1), 0);
}

export function countEmptyFoundations(game: FreeCell): number {
	return game.foundations.reduce((ret, card) => ret + (card ? 0 : 1), 0);
}

export function countEmptyCascades(game: FreeCell): number {
	return game.tableau.reduce((ret, cascade) => ret + (cascade.length ? 0 : 1), 0);
}

export function countCardsInFoundations(game: FreeCell): number {
	return game.cards.filter((card) => card.location.fixture === 'foundation').length;
	// return game.cards.reduce((ret, card) => ret + (card.location.fixture === 'foundation' ? 1 : 0), 0);
}

/**
	To move a sequence, you need to be able to move all of the cards individually.
	But that's lame, so we can "pretend" to move them for you using empty cells and empty cascades.

	max sequence height:
	`2^m * (n + 1)`, `m` = empty cascades, `n` = empty cells
*/
export function maxMovableSequenceLength(game: FreeCell): number {
	return Math.pow(2, countEmptyCascades(game)) * (countEmptyCells(game) + 1);
}

/* ************** */
/* CHECK CAN MOVE */
/* ************** */

export function foundationCanAcceptCards(
	game: FreeCell,
	index: number | Suit,
	limit: AutoFoundationLimit
): boolean {
	if (typeof index !== 'number') {
		index = game.foundations.findIndex((foundationCard) => foundationCard?.suit === index);
	}
	if (!(index in game.foundations)) return false;
	if (
		game.selection?.location.fixture === 'foundation' &&
		game.selection.location.data[0] === index
	) {
		return false;
	}

	const card = game.foundations[index];
	if (!card) return true; // empty can always accept an ace
	if (limit !== 'rank' && card.rank === 'ace') return true; // we will never want to "hold a 2 so we can stack aces"
	if (card.rank === 'king') return false; // king is last, so nothing else can be accepted
	const card_rank_idx = getRankForCompare(card.rank);

	switch (limit) {
		case 'none':
			return true;
		case 'rank':
			return game.foundations.every(
				(c) => c === card || (c ? getRankForCompare(c.rank) : -1) >= card_rank_idx
			);
		case 'rank+1':
			return game.foundations.every(
				(c) => c === card || (c ? getRankForCompare(c.rank) : -1) + 1 >= card_rank_idx
			);
		case 'opp+1':
			return getFoundationRankForColor(game, card) >= card_rank_idx;
		case 'opp+2':
			return getFoundationRankForColor(game, card) + 1 >= card_rank_idx;

		// reads: opp+2 given oppopp+1
		// but really is: opp+2 AND oppopp+1
		case 'opp+2|oppopp+1': {
			// opp+2
			if (!(getFoundationRankForColor(game, card) + 1 >= card_rank_idx)) {
				return false;
			}

			// oppopp+1
			return game.cards
				.filter(
					(oppositeCard) =>
						isRed(oppositeCard.suit) !== isRed(card.suit) && oppositeCard.rank === card.rank
				)
				.every((oppositeCard) => {
					if (oppositeCard.location.fixture === 'foundation') return true;
					if (oppositeCard.rank === 'ace') return true;
					return foundationCanAcceptCards(game, oppositeCard.suit, 'opp+1');
				});
		}
	}
}

/** helper for foundationCanAcceptCards */
function getFoundationRankForColor(game: FreeCell, card: Card): number {
	const ranks: Record<Suit, number> = {
		clubs: -1,
		diamonds: -1,
		hearts: -1,
		spades: -1,
	};
	game.foundations.forEach((c) => {
		if (c) ranks[c.suit] = getRankForCompare(c.rank);
	});
	const foundation_rank_for_color = isRed(card.suit)
		? Math.min(ranks.clubs, ranks.spades)
		: Math.min(ranks.diamonds, ranks.hearts);
	return foundation_rank_for_color;
}

export function canStackFoundation(
	foundation_card: Card | null,
	moving_card: Card,
	laxAdjacent = false
): boolean {
	if (moving_card.location.fixture === 'foundation') {
		return false;
	}

	if (!foundation_card && moving_card.rank === 'ace') {
		return true;
	} else if (
		foundation_card &&
		foundation_card.suit === moving_card.suit &&
		(laxAdjacent || isAdjacent({ min: foundation_card.rank, max: moving_card.rank }))
	) {
		return true;
	}
	return false;
}

function canStackCascade(tail_card: Card, moving_card: Card): boolean {
	return (
		isRed(tail_card.suit) !== isRed(moving_card.suit) &&
		isAdjacent({ min: moving_card.rank, max: tail_card.rank })
	);
}

/* ************ */
/* FIND/DO MOVE */
/* ************ */

export function findAvailableMoves(
	game: FreeCell,
	selection?: CardSequence | null
): AvailableMove[] {
	const availableMoves: AvailableMove[] = [];
	if (!selection) {
		selection = game.selection;
	}

	if (!selection || selection.peekOnly) {
		return availableMoves;
	}

	const head_card = selection.cards[0];

	if (selection.cards.length === 1) {
		game.cells.forEach((card, idx) => {
			if (!card) {
				availableMoves.push({
					location: { fixture: 'cell', data: [idx] },
					moveDestinationType: 'cell:empty',
					priority: -1,
				});
			}
		});

		game.foundations.forEach((card, idx) => {
			if (canStackFoundation(card, head_card)) {
				availableMoves.push({
					location: { fixture: 'foundation', data: [idx] },
					moveDestinationType: 'foundation:any',
					priority: -1,
				});
			}
		});
	}

	const mmsl = maxMovableSequenceLength(game);
	game.tableau.forEach((cascade, idx) => {
		const tail_card = cascade[cascade.length - 1];
		if (!cascade.length) {
			if (selection.cards.length <= mmsl / 2) {
				availableMoves.push({
					location: { fixture: 'cascade', data: [idx, cascade.length] },
					moveDestinationType: 'cascade:empty',
					priority: -1,
				});
			}
		} else if (canStackCascade(tail_card, head_card) && selection.cards.length <= mmsl) {
			availableMoves.push({
				location: { fixture: 'cascade', data: [idx, cascade.length - 1] },
				moveDestinationType: 'cascade:sequence',
				priority: -1,
			});
		}
	});

	prioritizeAvailableMoves(game, selection, availableMoves);

	return availableMoves;
}

/**
	this is the cornerstone for click-to-move

	@modifies `availableMoves.priority`
*/
function prioritizeAvailableMoves(
	game: FreeCell,
	selection: CardSequence,
	availableMoves: AvailableMove[]
): void {
	if (!availableMoves.length) return;

	const moveSourceType = getMoveSourceType(selection);
	if (!moveSourceType) return;

	const sourceD0 = selection.location.data[0];
	const MoveDestinationTypePriority = calcMoveDestinationTypePriority(
		game,
		selection,
		moveSourceType
	);

	// pick our favorite destination type
	const moveDestinationType = availableMoves.reduce((ret, { moveDestinationType: next }) => {
		if (MoveDestinationTypePriority[next] > MoveDestinationTypePriority[ret]) return next;
		return ret;
	}, availableMoves[0].moveDestinationType);

	// filter down to just these ones (all other will remain -1)
	availableMoves = availableMoves.filter(
		(availableMove) => availableMove.moveDestinationType === moveDestinationType
	);

	// TODO (controls) (optional-complexity) "on base of Cascade" when picking a sequence to stack
	//  - prioritize king
	//  - then Cascade
	//  - then height
	//  - then nearest
	switch (moveDestinationType) {
		case 'cell:empty': {
			const useSourceD0 = moveSourceType === 'cell:single' ? sourceD0 : undefined;
			availableMoves.forEach((availableMove) => {
				availableMove.priority = linearAvailableMovesPriority(
					game.cells.length,
					availableMove.location.data[0],
					useSourceD0
				);
			});
			break;
		}

		case 'foundation:any': {
			availableMoves.forEach((availableMove) => {
				availableMove.priority = linearAvailableMovesPriority(
					game.foundations.length,
					availableMove.location.data[0]
				);
			});
			break;
		}

		case 'cascade:sequence': {
			if (availableMoves.length === 2) {
				const one = availableMoveIsRoyalPile(game, availableMoves[0]);
				const two = availableMoveIsRoyalPile(game, availableMoves[1]);
				if (one.isPile && !two.isPile) {
					availableMoves[0].priority = 2;
					availableMoves[1].priority = 1;
					break;
				} else if (!one.isPile && two.isPile) {
					availableMoves[0].priority = 1;
					availableMoves[1].priority = 2;
					break;
				} else if (one.isPile && two.isPile) {
					if (one.length > two.length) {
						availableMoves[0].priority = 2;
						availableMoves[1].priority = 1;
						break;
					} else if (one.length < two.length) {
						availableMoves[0].priority = 1;
						availableMoves[1].priority = 2;
						break;
					}
				}
			}
		}
		// eslint-disable-next-line no-fallthrough -- cascade:sequence and cascade:empty generally have the same logic; but cascade:sequence first fusses with the availableMove priority
		case 'cascade:empty': {
			const moving_card = selection.cards[0];
			const moveFromAsDestType: MoveDestinationType =
				selection.location.data[1] === 0 ? 'cascade:empty' : 'cascade:sequence';
			// if we are moving from/to the same type, then use linear
			// if we are moving to a different type, then use closest
			let useLinear = moveFromAsDestType === moveDestinationType;
			// if we are moving from an invalid spot (we can't move back here), then use closest
			if (moveFromAsDestType === 'cascade:sequence' && selection.location.fixture === 'cascade') {
				const [d0, d1] = moving_card.location.data;
				const tail_card = game.tableau[d0][d1 - 1];
				if (!canStackCascade(tail_card, moving_card)) {
					useLinear = false;
				}
			}

			const sourceD0OrNah =
				moveSourceType === 'cascade:single' || moveSourceType === 'cascade:sequence'
					? sourceD0
					: undefined;

			availableMoves.forEach((availableMove) => {
				if (useLinear) {
					availableMove.priority = linearAvailableMovesPriority(
						game.tableau.length,
						availableMove.location.data[0],
						sourceD0OrNah
					);
				} else {
					availableMove.priority = closestAvailableMovesPriority(
						game.tableau.length,
						availableMove.location.data[0],
						sourceD0OrNah
					);
				}
			});
			break;
		}
	}
}

function getMoveSourceType(selection: CardSequence): MoveSourceType | undefined {
	switch (selection.location.fixture) {
		case 'deck':
		case 'foundation':
			return undefined;
		case 'cell':
			return 'cell:single';
		case 'cascade':
			return selection.cards.length === 1 ? 'cascade:single' : 'cascade:sequence';
	}
}

function availableMoveIsRoyalPile(game: FreeCell, availableMove: AvailableMove) {
	const sequence = getSequenceAt(game, {
		fixture: 'cascade',
		data: [availableMove.location.data[0], 0],
	});
	const isRoyal =
		sequence.cards[0].rank === 'king' ||
		sequence.cards[0].rank === 'queen' ||
		sequence.cards[0].rank === 'jack';
	const isPile = sequence.cards.length === game.tableau[availableMove.location.data[0]].length;

	return { isPile: isRoyal && isPile, length: sequence.cards.length };
}

/**
	always pick moves to the right, wrapping along the right edge
	e.g. 3210654
*/
export function linearAvailableMovesPriority(
	cascadeCount: number,
	d0: number,
	sourceD0?: number
): number {
	let priority = cascadeCount - d0;
	if (sourceD0 !== undefined) {
		if (d0 > sourceD0) {
			priority += cascadeCount;
		} else if (d0 === sourceD0) {
			priority = 0;
		}
	}
	return priority;
}

export function rightJustifyAvailableMovesPriority(
	cascadeCount: number,
	d0: number,
	sourceD0?: number
): number {
	if (sourceD0 !== undefined && d0 === sourceD0) {
		return 0;
	}
	return d0 + 1;
}

/**
	pick the closest move
	e.g.: 1350642
*/
export function closestAvailableMovesPriority(
	cascadeCount: number,
	d0: number,
	sourceD0?: number
): number {
	if (sourceD0 === undefined) return (cascadeCount - d0) * 2;
	if (sourceD0 === d0) return 0;
	return cascadeCount * 2 - Math.abs(sourceD0 - d0) * 2 - (sourceD0 > d0 ? 1 : 0);
}

/**
	moves the card sequence `from` onto `to`
	single card onto cell/foundation, at the end of the cascade

	this does not check for `availableMoves`
	there are a lot of ways you can come to valid moves
	this just _does_ it for you

	likewise, when you "undo", it's inherently an invalid move
	(forwards creates order, backwards creates disorder)
*/
export function moveCards(game: FreeCell, from: CardSequence, to: CardLocation): Card[] {
	if (from.cards.length === 0) {
		return game.cards;
	}
	if (from.cards.length > 1 && !(to.fixture === 'cascade' || to.fixture === 'deck')) {
		// you can only move multiple cards to a cascade
		// (you can move multiple cards to the deck, too, bcuz why not)
		return game.cards;
	}

	const cards = cloneCards(game.cards);
	const from_cards = from.cards.map((fc) => findCard(cards, fc));

	switch (to.fixture) {
		case 'deck': {
			// we can, in theory, move cards to the deck
			// this isn't standard gameplay
			const d0 = Math.max(0, Math.min(to.data[0], game.deck.length - 1));

			// make space for the from_cards
			cards.forEach((card) => {
				if (card.location.fixture === 'deck') {
					if (card.location.data[0] > d0) {
						card.location = {
							fixture: 'deck',
							data: [card.location.data[0] + from_cards.length],
						};
					}
				}
			});

			// put in the from cards
			const shift = game.deck.length ? 0 : -1;
			from_cards.forEach((card, idx) => {
				card.location = {
					fixture: 'deck',
					data: [d0 - idx + from_cards.length + shift],
				};
			});
			break;
		}
		case 'cell':
			from_cards[0].location = to;
			break;
		case 'foundation':
			from_cards[0].location = to;
			break;
		case 'cascade': {
			// move the selection to the end of the cascade
			const d0 = to.data[0];
			const d1 = game.tableau[to.data[0]].length;
			from_cards.forEach((card, idx) => {
				card.location = {
					fixture: 'cascade',
					data: [d0, d1 + idx],
				};
			});
			break;
		}
	}

	if (from.location.fixture === 'deck') {
		// shift all the cards
		const d0 = from.location.data[0];
		cards.forEach((card) => {
			if (card.location.fixture === 'deck') {
				if (card.location.data[0] > d0) {
					card.location = {
						fixture: 'deck',
						data: [card.location.data[0] - from_cards.length],
					};
				}
			}
		});
	}

	return cards;
}

export function autoFoundationCards(
	game: FreeCell,
	limit: AutoFoundationLimit
): { cards: Card[]; moved: Card[] } {
	game = game.__copy();
	const moved: Card[] = [];

	// keep going as long as we move cards
	let keepGoing = true;
	while (keepGoing) {
		keepGoing = false;

		// try every foundation again
		for (let f_idx = 0; f_idx < game.foundations.length; f_idx++) {
			const f_card = game.foundations[f_idx];
			let canAccept = foundationCanAcceptCards(game, f_idx, limit);

			// try cells
			if (canAccept) {
				for (const c_card of game.cells) {
					const canMoveCellToFoundation =
						c_card && canStackFoundation(f_card, c_card) && !game.selection?.cards.includes(c_card);
					if (canMoveCellToFoundation) {
						moved.push({ ...c_card });
						game.cells[c_card.location.data[0]] = null;
						c_card.location = {
							fixture: 'foundation',
							data: [f_idx],
						};
						game.foundations[f_idx] = c_card;
						keepGoing = true;
						canAccept = false;
						break;
					}
				}
			}

			// try last card in each cascade
			if (canAccept) {
				for (const cascade of game.tableau) {
					const c_card = cascade.at(-1);
					const canMoveCascadeToFoundation =
						c_card && canStackFoundation(f_card, c_card) && !game.selection?.cards.includes(c_card);
					if (canMoveCascadeToFoundation) {
						moved.push({ ...c_card });
						game.tableau[c_card.location.data[0]].pop();
						c_card.location = {
							fixture: 'foundation',
							data: [f_idx],
						};
						game.foundations[f_idx] = c_card;
						keepGoing = true;
						canAccept = false;
						break;
					}
				}
			}
		}
	}

	return { cards: game.cards, moved };
}

/* ************* */
/* PRINT / PARSE */
/* ************* */

export function calcMoveActionText(from: CardSequence, to: CardSequence): string {
	const from_location = from.cards[0].location;
	const to_card: Card | undefined = to.cards.at(to.cards.length - 1);
	const to_location = to_card?.location ?? to.location;
	const to_sh =
		!!to_card || to_location.fixture === 'foundation'
			? shorthandLocation(to_location)
			: shorthandPile(to_location);
	const to_sequence = to_card ? shorthandCard(to_card) : to_location.fixture;
	const shorthandMove = `${shorthandLocation(from_location)}${to_sh}`;
	return `move ${shorthandMove} ${shorthandSequence(from)}→${to_sequence}`;
}

export function calcAutoFoundationActionText(
	moved: Card[],
	isFlourish: boolean,
	isFlourish52: boolean
): string {
	const movedCardsStr = moved.map((card) => shorthandCard(card)).join(',');
	const movedPilesStr = moved.map((card) => shorthandPile(card.location)).join('');
	const firstWord = isFlourish52 ? 'flourish52' : isFlourish ? 'flourish' : 'auto-foundation';
	return `${firstWord} ${movedPilesStr} ${movedCardsStr}`;
}

/**
	we don't need it in set/stop either,
	but it does make a few things nicer to validate for having it there
	(e.g. $toggleCursor)

	// TODO (actionText) (coords) (test) unit tests should match move text from/to
	//  - the `to` should be the same

	@param location - where the cursor will be, it may not match `game.cursor`
*/
export function calcCursorActionText(
	game: FreeCell,
	suffix: string,
	location: CardLocation
): string {
	location = game.__clampCursor(location);
	const card = getCardAt(game, location);
	const cardSuffix = card ? ` ${shorthandCard(card)}` : '';
	switch (location.fixture) {
		case 'deck':
			return `cursor ${suffix} ${card ? shorthandLocation(location) : shorthandPile(location)}${cardSuffix}`;
		case 'cell':
			return `cursor ${suffix} ${shorthandPile(location)}${cardSuffix}`;
		case 'cascade':
			return `cursor ${suffix} ${card ? shorthandLocation(location) : shorthandPile(location)}${cardSuffix}`;
		case 'foundation':
			return `cursor ${suffix} ${shorthandLocation(location)}${cardSuffix}`;
	}
	return `cursor ${suffix}`;
}

type ActionTypesForSelect = Extract<PreviousActionType, 'select' | 'deselect'>;
export function calcSelectActionText(sequence: CardSequence, type: ActionTypesForSelect): string {
	const verb = sequence.peekOnly && type === 'select' ? 'peek' : type;
	return verb + ' ' + shorthandLocation(sequence.location) + ' ' + shorthandSequence(sequence);
}

/**
	To parse a move correctly, we need the full game state AND the shorthand (from/to positions).
	Since shorthandMove is only for replaying a game (moving forwards), we only need the shorthand.
	In contrast, we cannot use this for undo/replay backwards.
	Moving forwards, we can deduce which cards where moved, moving the maximum _allowable_ cards.
	Moving backwards, the moves are "invalid", so we can't know which parts of sequences need to be split.

	[Standard FreeCell Notation](https://www.solitairelaboratory.com/solutioncatalog.html)

	Free cells (upper row, left side) are named (left to right) a, b, c, d, [e, f]. \
	Home (upper row, right) is h. \
	Initial columns (lower row, left to right) are named 1 through 8, [9, 0].

	Example Moves:
	1. Column one to column three: 13
	2. Second freecell (b) to column five: b5
	3. Column 4 to first (leftmost) freecell: 4a
	4. Third freecell to home: ch \
	etc.

	@see {@linkcode parseShorthandPileForSelect}
	@see {@linkcode parseShorthandPileForMove}
	@param shorthandMove `${PileSH}${PileSH}` or `${LocationSH}${LocationSH}`
*/
export function parseShorthandMove(
	game: FreeCell,
	shorthandMove: string
): [CardLocation, CardLocation] | null {
	const { fromPile, fromLocation, toPile, toLocation } = _parseShorthandMove(shorthandMove);

	if (fromPile !== fromLocation || toPile !== toLocation) {
		// optimization for when shorthandMove includes coords
		return [parseShorthandLocation(fromLocation), parseShorthandLocation(toLocation)];
	}

	const from_location = parseShorthandPileForSelect(game, fromPile);
	if (!from_location) return null;
	const selection = getSequenceAt(game, from_location);
	const to_location = parseShorthandPileForMove(game, toPile, selection);
	if (!to_location) return null;

	if (to_location.fixture === 'cascade') {
		// clamp
		to_location.data[1] = Math.max(0, game.tableau[to_location.data[0]].length - 1);
	}

	// clean up from_location based on MoveSourceType
	// (pick the right starting sequence)
	if (from_location.fixture === 'cascade') {
		// REVIEW (techdebt) (controls) text: "invalid board size", this isn't just a key press
		//  - we need an altrenate return type or soemthing
		//  - formulate the error message in whatever calls this…
		if (from_location.data[0] >= game.tableau.length)
			from_location.data[0] = game.tableau.length - 1;

		// clamp
		from_location.data[1] = Math.max(0, game.tableau[from_location.data[0]].length - 1);

		if (to_location.fixture === 'cascade') {
			// adjust selection until stackable on destination
			const tail_card = game.tableau[to_location.data[0]].at(to_location.data[1]);
			let d1 = from_location.data[1];
			if (tail_card) {
				// moving to cascade:sequence, pick rank we can stack
				while (
					d1 > 0 &&
					!canStackCascade(tail_card, game.tableau[from_location.data[0]][d1]) &&
					canStackCascade(
						game.tableau[from_location.data[0]][d1 - 1],
						game.tableau[from_location.data[0]][d1]
					)
				) {
					d1--;
				}
			} else {
				// moving to cascade:empty, move entire sequence
				// while adhearing to the max sequence length
				const mmsl = maxMovableSequenceLength(game) / 2;
				while (
					d1 > 0 &&
					from_location.data[1] - d1 + 1 < mmsl &&
					canStackCascade(
						game.tableau[from_location.data[0]][d1 - 1],
						game.tableau[from_location.data[0]][d1]
					)
				) {
					d1--;
				}
			}
			from_location.data[1] = d1;
		}
	}

	// clean up to_location based on MoveDestinationType
	// (pick the right foundation idx)
	if (to_location.fixture === 'foundation') {
		// adjust selection until stackable on destination
		// i.e. 2S can stack on AS, find that foundation
		// i.e. AC can go in any _empty_ foundation, find that one
		const from_sequence = getSequenceAt(game, from_location);
		const tail_card = from_sequence.cards[from_sequence.cards.length - 1];
		let d0 = to_location.data[0];
		while (
			d0 < game.foundations.length &&
			!canStackFoundation(game.foundations[d0], tail_card, true)
		) {
			d0++;
		}
		to_location.data[0] = d0;
	}

	return [from_location, to_location];
}

/**
	find the largest possible sequence at this location

	this happens without regard to selection,
	and is independent of other moves (we don't know what will happen next)

	@see {@linkcode parseShorthandMove}
	@see {@linkcode parseShorthandPileForMove}
*/
export function parseShorthandPileForSelect(game: FreeCell, pileSh: PileSH): CardLocation | null {
	const from_location = parseShorthandPile(pileSh);

	// verify location wrt game - e.g. cellCount,cascadeCount
	switch (from_location.fixture) {
		case 'deck':
			// deck isn't standard gameplay (it's not a location to move from/to), but even IFF we do, __clampCursor can handle it
			// each index is NOT getting it's own letter, so iff we can pick any place, it'll be the start or end or by numberical value so why _not_ just clamp it
			// top card in deck
			from_location.data[0] = game.deck.length - 1;
			break;
		case 'cell':
			// REVIEW (techdebt) (controls) text: "invalid board size", this isn't just a key press
			//  - we shouldn't just ignore it, we should provide feedback
			if (from_location.data[0] >= game.cells.length) return null;
			break;
		case 'foundation':
			// there is only one 'h' for foundation
			// d0 === 0
			// REVIEW (techdebt) why can't we just return null here?
			//  - this should be invalid
			//  - `allowSelectFoundation` does not apply in this context
			break;

		case 'cascade': {
			if (from_location.data[0] >= game.tableau.length) return null;

			// clamp
			from_location.data[1] = game.tableau[from_location.data[0]].length - 1;

			// adjust selection to largest sequence
			let d1 = from_location.data[1];
			// moving to cascade:empty, move entire sequence
			// while adhearing to the max sequence length
			while (
				d1 > 0 &&
				canStackCascade(
					game.tableau[from_location.data[0]][d1 - 1],
					game.tableau[from_location.data[0]][d1]
				)
			)
				d1--;
			from_location.data[1] = d1;
			break;
		}
	}

	return from_location;
}

/**
	find the move destination

	pre-req: game already has a selection
	(required for 'h')
	(if there is no selection, you should call {@linkcode parseShorthandPileForSelect}) instead

	@see {@linkcode parseShorthandMove}
	@see {@linkcode parseShorthandPileForSelect}
*/
export function parseShorthandPileForMove(
	game: FreeCell,
	pileSh: PileSH,
	selection: CardSequence | null = game.selection
): CardLocation | null {
	if (!selection) return null;
	// const from_location = game.selection.location;
	const to_location = parseShorthandPile(pileSh);

	// verify location wrt game - e.g. cellCount,cascadeCount
	switch (to_location.fixture) {
		case 'deck':
			// deck isn't standard gameplay (it's not a location to move from/to), but even IFF we do, __clampCursor can handle it
			// each index is NOT getting it's own letter, so iff we can pick any place, it'll be the start or end or by numberical value so why _not_ just clamp it
			// top card in deck
			to_location.data[0] = BOTTOM_OF_CASCADE;
			break;
		case 'cell':
			if (to_location.data[0] >= game.cells.length) return null;
			break;
		case 'foundation': {
			// adjust selection until stackable on destination
			// i.e. 2S can stack on AS, find that foundation
			// i.e. AC can go in any _empty_ foundation, find that one
			const tail_card = selection.cards[selection.cards.length - 1];
			let d0 = 0;
			while (
				d0 < game.foundations.length &&
				!canStackFoundation(game.foundations[d0], tail_card, true)
			) {
				d0++;
			}
			to_location.data[0] = d0;
			break;
		}

		case 'cascade':
			if (to_location.data[0] >= game.tableau.length) return null;

			// clamp
			to_location.data[1] = Math.max(0, game.tableau[to_location.data[0]].length - 1);
			break;
	}

	return to_location;
}
