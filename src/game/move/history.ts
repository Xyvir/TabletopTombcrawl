import { BOTTOM_OF_CASCADE } from '@/game/constants';
import {
	Card,
	CardLocation,
	CardSH,
	cloneCards,
	findCard,
	getSequenceAt,
	initializeDeckOfCards,
	isFixture,
	LocationSH,
	parseShorthandCard,
	parseShorthandLocation,
	parseShorthandPile,
	PileSH,
	shorthandPile,
	shorthandSequence,
	sortCardsOG,
} from '@/game/card/card';
import {
	DEFAULT_CURSOR_LOCATION,
	FreeCell,
	INIT_CURSOR_LOCATION,
	NUMBER_OF_FOUNDATIONS,
} from '@/game/game';
import { moveCards } from '@/game/move/move';

export type PreviousActionType =
	| 'init'
	| 'shuffle'
	| 'deal'
	| 'cursor'
	| 'select'
	| 'deselect'
	| 'move'
	| 'auto-foundation' // can be it's own history item, collapsed in standard gameplay
	| 'move-foundation' // move + auto-foundation
	| 'invalid'
	// IDEA (deck) (history) (move-foundation) add a PreviousActionType of 'illegal' or 'illegal-move'
	//  - e.g. gameFunction === 'recall-or-bury'
	//  - e.g. move card off foundation
	//  - then we can stop using "invalid move xx xxx" of type "move"
	// | 'illegal'
	| 'juice';

/**
	Does this action type change the positions of the cards?
	Every piece of metadata within a game should change the hud in some way,
	but these actions change the game board / game state.

	Moving the cursor will produce a new {@linkcode FreeCell},
	but these actions change {@linkcode FreeCell.cards} (and deck, cells, foundations, tableau).
*/
export const PREVIOUS_ACTION_TYPE_IN_HISTORY = new Set<PreviousActionType>([
	'init',
	'shuffle',
	'deal',
	'move',
	'move-foundation',
	'auto-foundation',
]);

/**
	Primarily for {@linkcode GameFunction} of `undo` and `restart`.
	These action types are effectively "game start."
*/
export const PREVIOUS_ACTION_TYPE_IS_START_OF_GAME = new Set<PreviousActionType>([
	'init',
	'shuffle',
	'deal',
]);

/**
	@deprecated XXX (techdebt) seems like a duplicate of {@linkcode PREVIOUS_ACTION_TYPE_IN_HISTORY}
*/
export const PREVIOUS_ACTION_TYPE_IS_MOVE = new Set<PreviousActionType>([
	'move',
	'move-foundation',
	'auto-foundation',
]);

/**
	- REVIEW (techdebt) (animation) is newGame even valid?
	   - then it'll just be, like, a new game
	   - should we have a special animation for this?
*/
export type GameFunction =
	// user actions
	| 'undo'
	| 'restart'
	| 'newGame'
	| 'drag-drop'
	// gameplay actions
	| 'check-can-flourish'
	| 'check-can-flourish52'
	| 'recall-or-bury';

export interface PreviousAction {
	/**
		human readable (loosely speaking) string
		contains all you need to know about the action that just occured

		all other properties can be computed from it
		all other properties are cached for ease of use
	*/
	text: string;

	// REVIEW (techdebt) is it actually useful to cache type with PreviousAction?
	//  - should it just be `export type PreviousAction = string;`
	//  - depends on if we need to add anything else to PreviousAction, like `affected: Card[]` ?
	type: PreviousActionType;

	/**
		just the cards that moved during an in-between step (i.e. move -> auto-foundation)

		For example: a user performs a move: `move 2⡆a 4S→cell`,
		and the system chains on: `auto-foundation 56 AH,2H`,
		producing a final combined move of `move 2⡆a 4S→cell (auto-foundation 56 AH,2H)`.
		`tweenCards` contains the location of 4S after the user move, before the final location produced by the system move.

		We are keeping track of which cards we part of "move",
		specifically so we have {@linkcode Card.location},
		so we can use that for animations.
		All cards that are part of the first move must be in tweenCards,
		so we can perform a two-part animation.

		- TODO (techdebt) (combine-move-auto-foundation) (refactor-rename) currently only used for move-foundation
		   - maybe we should rename this variable?
		   - maybe we can always list "these are the cards that moved during this action" \
		     'move-foundation' has 2 sets of moves, what then?

		- TODO (terminal) (settings) add an option to skip this calculation
		   - for non-animated interfaces

		@see {@linkcode getCardsThatMoved}
	*/
	tweenCards?: Card[];

	/** for non-standard gameplay (e.g. undo) */
	gameFunction?: GameFunction;
}

// TODO (techdebt) should we verify Pile/Location, Shorthand, Fixture when we parse with these regex values?
//  - i.e. the helper methods return PileSH, should we also check isPileSH?
//  - do we need to up our i/o game and handle parsing garbage?
//  - red team: is it possible to make a game explode?
//  - is this just "better error messages earlier?"
//  - should we enable "more comprehensive errors" during `FreeCell.parse`, but not during, say, `undo`
//  - we treat this text as a structured "source of truth" that human readable (it could have been a json object)
//  - "move_regex" is basically a "decode" action
//  - every actionText is an "encode" action (e.g. `calcMoveActionText`, but literally every `ACTION_TEXT_EXAMPLES`)
const SHORTHAND_FROM_TO_REGEX =
	/^([abcdefhk1234567890])([\u2840-\u28FF]?)([abcdefhk1234567890])([\u2840-\u28FF]?)$/;
const MOVE_REGEX =
	/^move ([abcdefhk1234567890])([\u2840-\u28FF]?)([abcdefhk1234567890])([\u2840-\u28FF]?) ([\w-]+)→(\S+)$/;
const AUTO_FOUNDATION_REGEX = /^(auto-foundation|flourish|flourish52) (\w+) (\S+)$/;
const MOVE_FOUNDATION_REGEX =
	/^move ([abcdefhk1234567890])([\u2840-\u28FF]?)([abcdefhk1234567890])([\u2840-\u28FF]?) ([\w-]+)→(\S+) \((auto-foundation|flourish|flourish52) (\w+) (\S+)\)$/;
const CURSOR_REGEX =
	/^cursor (set|up|left|down|right|stop)( wrap)?( ([abcdefhk1234567890][\u2840-\u28FF]?))?( (\w\w))?$/;
const SELECT_REGEX =
	/^(select|peek|deselect)( ([abcdefhk1234567890])([\u2840-\u28FF]?))? ([\w-]+)$/;
// XXX (parse) (refactor) there isn't a good reason for JUICE_FLASH_REGEX to be here
//  - maybe it should be in juice
//  - maybe it should be in parse?
//  - it just follows the pattern of parsing actionText
const JUICE_FLASH_REGEX = /^juice flash \*?(\w\w(,\w\w)*)\*?$/;

/**
	quick-and-dirty check to ensure that, during game replays from history, the `moveByShorthand` actually occurred
	@example expect(game.moveByShorthand(move).previousAction.text).toMatch(spotCheckMoveRegex(move));
*/
export function spotCheckMoveRegex(shorthandMove: string) {
	return new RegExp(`^move ${shorthandMove[0]}.?${shorthandMove[1]}.?`);
}

/**
	read {@linkcode PreviousAction.text} which has the full context of what was moved
	we can use this text to replaying a move, or (more importantly) undoing a move
*/
export function parseAndUndoPreviousActionText(game: FreeCell, actionText: string): Card[] | null {
	switch (parsePreviousActionType(actionText).type) {
		case 'init':
			// silent failure
			// it's not wrong to attempt an undo, it just doesn't do anything
			// cannot undo past this
			return null;
		case 'shuffle':
			// we don't have a chain of shuffles in the history, so we can just reset to initial values
			// (there is some sugar where we can shuffle -> init -> shuffle, but that basically replaces the shuffle, it does not stack)
			// if there _were_ multiple shuffles in the history, this would be invalid
			// but we have to assume there are not
			return initializeDeckOfCards();
		case 'deal':
			return unDealAll(game);
		case 'move':
			return undoMove(game, actionText);
		case 'auto-foundation':
			return undoAutoFoundation(game, actionText).cards;
		case 'move-foundation':
			return undoMove(undoAutoFoundation(game, actionText), actionText);
		case 'cursor':
		case 'select':
		case 'deselect':
		case 'juice':
			// no change, just pop the history item
			// …how did this end up in the history in the first place?
			return game.cards;
		case 'invalid':
			// silent failure
			// these shouldn't be in the history in the first place
			// canot undo past these (stuck with them in the history)
			return null;
	}
}

/**
	Where should the cursor be _after_ a move?

	We pass in `cards` instead of `game` because
	in the cases we need this,
	we are building a new game state and want the cursor before we `game.__clone`

	this is only ever used as `parseCursorFromHistoryActionText`,
	even though we can support all† actions
*/
export function parseCursorFromPreviousActionText(
	actionText: string | undefined,
	cards: Card[]
): CardLocation | undefined {
	if (!actionText) return undefined;
	switch (parsePreviousActionType(actionText).type) {
		case 'init':
		case 'shuffle':
			if (!cards.some(({ location }) => location.fixture === 'deck')) {
				return DEFAULT_CURSOR_LOCATION;
			}
			return INIT_CURSOR_LOCATION;
		case 'deal':
			if (/^deal \d+ cards?/.test(actionText)) return INIT_CURSOR_LOCATION;
			return DEFAULT_CURSOR_LOCATION;
		case 'move-foundation':
		case 'move': {
			const { toLocation, fromShorthand, toShorthand } = parseActionTextMove(actionText);
			const cursor = parseShorthandLocation(toLocation);
			switch (cursor.fixture) {
				case 'deck':
					// we don't move cards to the deck in practice
					// moving to `k` is enough for now (no need to look for toShorthand within the deck)
					// REVIEW (motivation) (deck) look for toShorthand within the deck
					break;
				case 'cell':
					// each cell identifies it's own d0
					break;
				case 'foundation': {
					// XXX (techdebt) (test) parseCursorFromPreviousActionText needs _way_ more exhaustive testing
					//  - RS→foundation, RS→RS
					//  - for arbitrary ace positions and collisions
					//  - where the source suit may or may not be in the foundation
					//  - where the source suit may or may not match the destination suit

					if (toShorthand === 'foundation') {
						const shorthand = parseShorthandCard(fromShorthand);
						const foundation_d0 = [];
						while (foundation_d0.length < NUMBER_OF_FOUNDATIONS)
							foundation_d0.push(foundation_d0.length);
						let foundation_match: Card | undefined = undefined;
						for (const card of cards) {
							if (card.location.fixture === 'foundation') {
								if (card.suit === shorthand?.suit) foundation_match = card;
								const idx = foundation_d0.indexOf(card.location.data[0]);
								if (idx > -1) foundation_d0.splice(idx, 1);
							}
						}

						if (foundation_match) {
							cursor.data[0] = foundation_match.location.data[0];
						} else {
							cursor.data[0] = foundation_d0[0];
						}
					} else {
						const shorthand = parseShorthandCard(toShorthand);
						const card = findCard(cards, shorthand);
						if (cursor.fixture !== card.location.fixture) {
							// TODO (parse) (refactor-no-throw) maybe just fallback to a default?
							throw new Error(
								`invalid move actionText fixture "${actionText}" for cards w/ ${JSON.stringify(card)}`
							);
						}
						cursor.data[0] = card.location.data[0];
					}
					break;
				}
				case 'cascade':
					if (toShorthand !== 'cascade') {
						const shorthand = parseShorthandCard(toShorthand);
						const card = findCard(cards, shorthand);
						if (card.location.fixture !== 'foundation') {
							if (cursor.fixture !== card.location.fixture) {
								// TODO (parse) (refactor-no-throw) maybe just fallback to a default?
								throw new Error(
									`invalid move actionText fixture "${actionText}" for cards w/ ${JSON.stringify(card)}`
								);
							} else if (cursor.data[0] !== card.location.data[0]) {
								// TODO (parse) (refactor-no-throw) maybe just fallback to a default?
								throw new Error(
									`invalid move actionText cascade "${actionText}" for cards w/ ${JSON.stringify(card)}`
								);
							}
							cursor.data[1] = card.location.data[1];
						}
					}
					break;
			}
			return cursor;
		}
		case 'select':
		case 'deselect': {
			const { p, fromShorthand } = parseActionTextSelect(actionText);
			const shorthand = parseShorthandCard(fromShorthand);
			const card = findCard(cards, shorthand);
			if (p) {
				const cursor = parseShorthandPile(p);
				if (cursor.fixture !== card.location.fixture) {
					// XXX (techdebt) (parse) (refactor-no-throw) do we really even need to get the cursor and check against the card?
					throw new Error(
						`invalid move actionText fixture "${actionText}" for cards w/ ${JSON.stringify(card)}`
					);
				}
			}
			return card.location;
		}
		case 'invalid':
			if (actionText === 'invalid undo tween') {
				return undefined;
			}
			if (actionText === 'invalid move tableau→deck') {
				return { fixture: 'deck', data: [BOTTOM_OF_CASCADE] };
			}
			if (actionText.startsWith('invalid')) {
				return parseCursorFromPreviousActionText(actionText.substring(8), cards);
			}
			return undefined;
		case 'cursor': {
			const { p, shorthand } = parseActionTextCursor(actionText);
			if (shorthand) {
				const card = findCard(cards, parseShorthandCard(shorthand));
				return card.location;
			}
			if (p) {
				const cursor = parseShorthandLocation(p);
				if (cursor.fixture === 'cascade') cursor.data[1] = 0;
				return cursor;
			}
			return undefined;
		}
		case 'auto-foundation':
			return undefined;
		case 'juice':
			return DEFAULT_CURSOR_LOCATION;
	}
	// XXX (parse) (refactor-no-throw) just delete it?
	// throw new Error(`invalid actionText '${actionText}' or 'invalid ${actionText}'`);
}

/**
	Where should the cursor be _before_ a move?

	this is only ever used as `parseAltCursorFromHistoryActionText`,
	even though we can support all† actions
*/
export function parseAltCursorFromPreviousActionText(
	actionText: string | undefined,
	cards: Card[]
): CardLocation | undefined {
	if (!actionText) return undefined;
	switch (parsePreviousActionType(actionText).type) {
		case 'init':
		case 'shuffle':
		case 'deal':
			if (!cards.some(({ location }) => location.fixture === 'deck')) {
				return DEFAULT_CURSOR_LOCATION;
			}
			return INIT_CURSOR_LOCATION;
		case 'move-foundation':
		case 'move': {
			const { fromLocation } = parseActionTextMove(actionText);
			const cursor = parseShorthandLocation(fromLocation);
			// deck isn't standard gameplay (so `data: [0]` is fine, if we see it)
			// cell is already accurate
			// foundation can't be `from` in an move (so `data: [0]` is fine, if we see it)
			// cascade needs to be "the last card" (since we can only move from the bottom)
			//  - so `data: [x, 99]` is fine
			return cursor;
		}
		case 'select':
		case 'deselect': {
			const { p, fromShorthand } = parseActionTextSelect(actionText);
			const shorthand = parseShorthandCard(fromShorthand);
			const card = findCard(cards, shorthand);
			if (p) {
				const cursor = parseShorthandPile(p);
				if (cursor.fixture !== card.location.fixture) {
					// XXX (techdebt) (parse) (refactor-no-throw) do we really even need to get the cursor and check against the card?
					throw new Error(
						`invalid move actionText fixture "${actionText}" for cards w/ ${JSON.stringify(card)}`
					);
				}
			}
			return card.location;
		}
		case 'invalid':
			if (actionText === 'invalid undo tween') {
				return undefined;
			}
			if (actionText === 'invalid move tableau→deck') {
				return undefined;
			}
			if (actionText.startsWith('invalid')) {
				return parseAltCursorFromPreviousActionText(actionText.substring(8), cards);
			}
			return undefined;
		case 'cursor':
		case 'auto-foundation':
			return undefined;
		case 'juice':
			return DEFAULT_CURSOR_LOCATION;
	}
	// XXX (parse) (refactor-no-throw) just delete it?
	// throw new Error(`invalid actionText '${actionText}' or 'invalid ${actionText}'`);
}

export function _parseShorthandMove(shorthandMove: string) {
	const match = SHORTHAND_FROM_TO_REGEX.exec(shorthandMove);
	if (match) {
		const [, fromPile, fc, toPile, tc] = match;
		return {
			fromPile: fromPile as PileSH,
			fromLocation: (fromPile + (fc || '')) as LocationSH,
			toPile: toPile as PileSH,
			toLocation: (toPile + (tc || '')) as LocationSH,
		};
	}
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error(`invalid shorthandMove ${shorthandMove}`);
}

function parseActionTextMove(actionText: string) {
	const result = _parseActionTextMove(actionText) ?? _parseActionTextMoveFoundation(actionText);
	if (result) return result;
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('invalid move actionText: ' + actionText);
}

function _parseActionTextMove(actionText: string) {
	const match = MOVE_REGEX.exec(actionText);
	if (match) {
		const [, fromPile, fc, toPile, tc, fromShorthand, toShorthand] = match;
		return {
			fromPile: fromPile as PileSH,
			fromLocation: (fromPile + (fc || '')) as LocationSH,
			toPile: toPile as PileSH,
			toLocation: (toPile + (tc || '')) as LocationSH,
			fromShorthand,
			toShorthand,
		};
	}
	return undefined;
}

function _parseActionTextAutoFoundation(actionText: string) {
	const match = AUTO_FOUNDATION_REGEX.exec(actionText);
	if (match) {
		const [, , piles, autoShorthand] = match;
		return {
			piles: piles.split('') as PileSH[],
			autoShorthand: autoShorthand.split(',') as CardSH[],
		};
	}
	return undefined;
}

function _parseActionTextMoveFoundation(actionText: string) {
	const match = MOVE_FOUNDATION_REGEX.exec(actionText);
	if (match) {
		const [, fromPile, fc, toPile, tc, fromShorthand, toShorthand, , piles, autoShorthand] = match;
		return {
			fromPile: fromPile as PileSH,
			fromLocation: (fromPile + (fc || '')) as LocationSH,
			toPile: toPile as PileSH,
			toLocation: (toPile + (tc || '')) as LocationSH,
			fromShorthand,
			toShorthand,
			piles: piles.split('') as PileSH[],
			autoShorthand: autoShorthand.split(',') as CardSH[],
		};
	}
	return undefined;
}

function parseActionTextCursor(actionText: string) {
	const match = CURSOR_REGEX.exec(actionText);
	if (match) {
		const [, text, wrap, , shMove, , shCard] = match as (string | undefined)[];
		return { text, wrap: !!wrap, p: shMove as LocationSH | undefined, shorthand: shCard };
	}
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('invalid cursor actionText: ' + actionText);
}

function parseActionTextSelect(actionText: string) {
	const match = SELECT_REGEX.exec(actionText);
	if (match) {
		const [, , , shMove, , fromShorthand] = match;
		return { p: shMove as PileSH | undefined, fromShorthand };
	}
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('invalid de/select actionText: ' + actionText);
}

export function parseActionTextJuiceFlash(actionText: string) {
	const match = JUICE_FLASH_REGEX.exec(actionText);
	if (match) {
		const [, shs] = match;
		return {
			shs: shs.split(',') as CardSH[],
		};
	}
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('invalid juice actionText: ' + actionText);
}

function parseActionTextInvalidMove(actionText: string) {
	if (actionText.startsWith('invalid ')) {
		return parseActionTextMove(actionText.substring(8));
	}
	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('not "invalid move" actionText: ' + actionText);
}

interface PaH {
	action: PreviousAction;
	history: string[];
}

export function appendActionToHistory(action: PreviousAction, history: string[]): PaH {
	if (!PREVIOUS_ACTION_TYPE_IN_HISTORY.has(action.type)) {
		return { action, history };
	}

	const collapsed = collapseHistory(action, history);
	if (collapsed) {
		return collapsed;
	}

	return { action, history: [...history, action.text] };
}

/** collapse history */
function collapseHistory(action: PreviousAction, history: string[]): PaH | undefined {
	const previousText = history.at(-1);
	if (previousText && action.type === 'move') {
		// p may not be a move
		const p = _parseActionTextMove(previousText);
		if (p) {
			// action.type should parse, the condition is just a formality
			const a = _parseActionTextMove(action.text);
			if (a) {
				const { fromPile: pfp, fromLocation: pfl, toPile: ptp, fromShorthand: pfs } = p;
				const {
					fromPile: afp,
					toPile: atp,
					toLocation: atl,
					fromShorthand: afs,
					toShorthand: ats,
				} = a;
				if (ptp === afp && pfs === afs) {
					// move 34 KH→cascade
					// move 43 KH→cascade
					if (pfp === atp) {
						const nextAction = parsePreviousActionType(history.at(-2) ?? 'init');
						if (action.gameFunction) nextAction.gameFunction = action.gameFunction; // preserve drag-drop
						return {
							action: nextAction,
							history: history.slice(0, -1),
						};
					}

					// move 34 KH→cascade
					// move 35 KH→cascade
					const actionText = `move ${pfl}${atl} ${pfs}→${ats}`;
					const nextAction: PreviousAction = { text: actionText, type: 'move' };
					if (action.gameFunction) nextAction.gameFunction = action.gameFunction; // preserve drag-drop
					return {
						action: nextAction,
						history: history.slice(0, -1).concat(actionText),
					};
				}
			}
		}
	}
	return undefined;
}

function undoMove(game: FreeCell, actionText: string): Card[] {
	const { fromPile, toPile, fromShorthand } = parseActionTextMove(actionText);

	// we don't actually need to parse this if we only care about the first card
	// const fromShorthands = fromShorthand.split('-');
	// const firstFromShorthand = fromShorthands[0];
	// if (!firstFromShorthand) throw new Error('no card to move: ' + actionText);

	const firstCardSH = parseShorthandCard(fromShorthand);
	const firstCard = findCard(game.cards, firstCardSH);
	if (shorthandPile(firstCard.location) !== toPile)
		// TODO (parse) (refactor-no-throw) instead of throwing, maybe return undefined to represent noop
		throw new Error(
			'invalid first card pile: ' +
				actionText +
				'; ' +
				shorthandPile(firstCard.location) +
				' !== ' +
				toPile
		);

	const sequence = getSequenceAt(game, firstCard.location);
	if (shorthandSequence(sequence) !== fromShorthand)
		// TODO (parse) (refactor-no-throw) instead of throwing, maybe return undefined to represent noop
		throw new Error(
			'invalid sequence: ' +
				actionText +
				'; ' +
				shorthandSequence(sequence) +
				' !== ' +
				fromShorthand
		);
	const location = parseShorthandPile(fromPile);

	return moveCards(game, sequence, location);
}

function parseActionTextAutoFoundation(actionText: string) {
	const match =
		_parseActionTextAutoFoundation(actionText) ?? _parseActionTextMoveFoundation(actionText);
	if (match) {
		const { piles, autoShorthand } = match;
		// type === 'auto-foundation' || type === 'flourish' || type === 'flourish52'
		const froms = piles.map((p) => parseShorthandPile(p));
		const shorthands = autoShorthand.map((s) => parseShorthandCard(s));
		if (froms.length !== shorthands.length) {
			// REVIEW (parse) (refactor-no-throw) where is this used?
			throw new Error('invalid move actionText: ' + actionText);
		}
		return { froms, shorthands };
	}

	// REVIEW (parse) (refactor-no-throw) where is this used?
	throw new Error('invalid move actionText: ' + actionText);
}

function undoAutoFoundation(game: FreeCell, actionText: string): FreeCell {
	const { froms, shorthands } = parseActionTextAutoFoundation(actionText);

	const cards = cloneCards(game.cards);
	const tableauLengths = game.tableau.map((cascade) => cascade.length);

	while (froms.length) {
		const from = froms.pop();
		const shorthand = shorthands.pop();
		const card = findCard(cards, shorthand);
		// REVIEW (parse) (refactor-no-throw) where is this used?
		if (!from || !shorthand) throw new Error('invalid move actionText: ' + actionText);

		if (card.location.fixture !== 'foundation') {
			// REVIEW (parse) (refactor-no-throw) where is this used?
			throw new Error(
				`Undoing auto-foundation of card not in foundation? ${JSON.stringify(card.location)}`
			);
		}

		switch (from.fixture) {
			case 'cascade':
				from.data[1] = tableauLengths[from.data[0]];
				tableauLengths[from.data[0]]++;
				card.location = from;
				break;
			case 'cell':
				card.location = from;
				break;
			case 'deck':
			case 'foundation':
				// REVIEW (move-foundation) (parse) (refactor-no-throw) just implment it? could be fun
				//  - you can still complain in comments
				throw new Error(`Invalid auto-foundation card destination: ${JSON.stringify(from)}`);
		}
	}

	// this is just connective glue because undoMove and moveCards both need a full `game`
	// should not appear in print
	return game.__clone({
		action: {
			text: 'invalid undo tween',
			type: 'invalid',
			gameFunction: 'undo',
		},
		cards,
	});
}

// XXX (techdebt) it's weird to change the `firstWord` of `actionText`
//  - I keep coming back to this idea
//  - specifically for flourish/flourish52 being an alias of auto-foundation
//  - maybe `hand-jammed` should be `init hand-jammed`
//  - maybe `touch stop` should be `invalid select`
export function parsePreviousActionType(actionText: string): PreviousAction {
	const firstWord = actionText.split(' ')[0];
	// some abnormal cases where the firstWord does not match the type
	if (firstWord === 'hand-jammed') return { text: actionText, type: 'init' };
	if (firstWord === 'copy-pasta') return { text: actionText, type: 'init' };
	if (firstWord === 'touch') return { text: actionText, type: 'invalid' };
	if (firstWord === 'peek') return { text: actionText, type: 'select' };
	if (firstWord === 'flourish52') return { text: actionText, type: 'auto-foundation' };
	if (firstWord === 'flourish') return { text: actionText, type: 'auto-foundation' };

	// move + auto-foundation → move-foundation
	if (firstWord === 'move' && actionText.at(-1) === ')') {
		if (actionText.includes('(auto-foundation')) {
			return { text: actionText, type: 'move-foundation' };
		}
		if (actionText.includes('(flourish52')) {
			return { text: actionText, type: 'move-foundation' };
		}
		if (actionText.includes('(flourish')) {
			return { text: actionText, type: 'move-foundation' };
		}
	}

	const action: PreviousAction = { text: actionText, type: firstWord as PreviousActionType };

	if (firstWord === 'invalid') {
		if (/^invalid move (\S*k\S*) /.test(actionText) || actionText === 'invalid move tableau→deck') {
			action.gameFunction = 'recall-or-bury';
		} else if (actionText.startsWith('invalid undo')) {
			// should not appear in print
			action.gameFunction = 'undo';
		}
	} else if (firstWord === 'juice') {
		if (actionText.endsWith('*')) {
			action.gameFunction = 'check-can-flourish52';
		} else {
			action.gameFunction = 'check-can-flourish';
		}
	}

	return action;
}

/** XXX (techdebt) do we need to do any more type checking? I suppose we could just improve the regex */
export function parsePreviousActionMoveShorthands(actionText: string) {
	const match = _parseActionTextMoveFoundation(actionText);

	if (match) {
		const { fromShorthand, autoShorthand } = match;
		return {
			moveShorthands: fromShorthand.split('-'),
			autoFoundationShorthands: autoShorthand,
		};
	}

	// we don't need special animations/shorthands for regular moves
	// the default animations are already good enough
	// (it's just one card or a sequence)
	// match = _parseActionTextMove(actionText);

	return {};
}

export function parseMovesFromHistory(history: string[]): { seed: number; moves: string[] } | null {
	if (history[1] && parsePreviousActionType(history[1]).type !== 'deal') return null;
	const matchSeed = /shuffle deck \((\d+)\)/.exec(history[0]);
	if (!matchSeed) return null;
	const seed = parseInt(matchSeed[1], 10);
	const moves: string[] = [];
	// const moves = history.map((actionText) => { … }).filter((m) => m);
	for (const actionText of history) {
		if (actionText.startsWith('invalid ')) {
			return null;
		}

		// parseActionTextMove, but allow null for shuffle, deal, etc
		const move = parseMoveFromActionText(actionText);
		if (move) {
			moves.push(move);
		}
	}
	return { seed, moves };
}

export function parseMoveFromActionText(actionText: string): `${PileSH}${PileSH}` | null {
	const match = _parseActionTextMove(actionText) ?? _parseActionTextMoveFoundation(actionText);
	if (match) {
		const { fromPile, toPile } = match;
		return `${fromPile}${toPile}`;
	}

	return null;
}

/** just the cards that moved */
export function getCardsThatMoved(game: FreeCell): Card[] {
	if (game.previousAction.type !== 'move') return [];
	const { fromShorthand } = parseActionTextMove(game.previousAction.text);
	return fromShorthand.split('-').map((rs) => findCard(game.cards, parseShorthandCard(rs)));
}

export function getCardsFromInvalid(previousAction: PreviousAction): {
	fromShorthands: string[];
	toShorthands: string[];
	pileShorthands?: CardLocation[];
} {
	if (previousAction.text === 'touch stop') {
		return { fromShorthands: [], toShorthands: [] };
	}
	if (previousAction.text === 'invalid move tableau→deck') {
		return { fromShorthands: [], toShorthands: [] };
	}
	const { toLocation, fromShorthand, toShorthand } = parseActionTextInvalidMove(
		previousAction.text
	);
	const fromShorthands = fromShorthand.split('-');
	if (toShorthand.length === 2 || toShorthand.includes('-')) {
		// TODO (motivation) (animation) if attempting to stack onto a sequence, shake the whole sequence
		//  - should we add the whole sequence to the actionText, instead of just the one destination card?
		return { fromShorthands, toShorthands: toShorthand.split('-') };
	} else if (isFixture(toShorthand)) {
		// `toShorthand` could be 'cell' or 'cascade' or 'foundation' and not an actual shorthand
		return {
			fromShorthands,
			toShorthands: [],
			pileShorthands: [parseShorthandLocation(toLocation)],
		};
	}
	// super invalid, e.g. 'invalid move 12 asdf→asdf'
	return { fromShorthands, toShorthands: [toShorthand] };
}

/**
	symmetric pair to {@linkcode FreeCell.dealAll}
*/
export function unDealAll(game: FreeCell): Card[] {
	// compiling everything into the deck, and then to be sorted like game.cards
	const deckOfCards: Card[] = [];

	// there shouldn't be any leftover cards in the deck (this is "invalid gameplay" to undeal now)
	game.deck.forEach((card) => {
		deckOfCards.push({ ...card, location: { fixture: 'deck', data: [deckOfCards.length] } });
	});

	// there shouldn't be any cards in the foundation (this is "invalid gameplay" to undeal now)
	for (let idx = game.foundations.length - 1; idx >= 0; idx--) {
		const card = game.foundations.at(idx);
		if (card) {
			deckOfCards.push({ ...card, location: { fixture: 'deck', data: [deckOfCards.length] } });
		}
	}

	// there shouldn't be any cards in the foundation (this is "invalid gameplay" to undeal now)
	for (let idx = game.cells.length - 1; idx >= 0; idx--) {
		const card = game.cells.at(idx);
		if (card) {
			deckOfCards.push({ ...card, location: { fixture: 'deck', data: [deckOfCards.length] } });
		}
	}

	const maxCascadeLength = game.tableau.reduce((ret, cascade) => Math.max(cascade.length, ret), 0);
	for (let d1 = maxCascadeLength; d1 >= 0; d1--) {
		for (let c = game.tableau.length - 1; c >= 0; c--) {
			const card = game.tableau[c].at(d1);
			if (card) {
				deckOfCards.push({ ...card, location: { fixture: 'deck', data: [deckOfCards.length] } });
			}
		}
	}

	// deck is going to be used _as_ "cards" to construct the next FreeCell state
	// we must arrange the list in the order of the OG cards (game.cards),
	// this is _not_ the deck tableau (game.deck)
	sortCardsOG(game, deckOfCards);

	if (deckOfCards.length !== game.cards.length) {
		// TODO (optimize) (refactor-no-throw) (test) this shouldn't happen
		//  - maybe just return an initialized deck?
		//  - maybe only throw when NODE_ENV === 'test'
		throw new Error(
			`incomplete implementation -- missing some cards (${deckOfCards.length} / ${game.cards.length})`
		);
	}

	return deckOfCards;
}

export function recoverTweenCards(game: FreeCell) {
	if (
		game.previousAction.type === 'move-foundation' &&
		!game.previousAction.tweenCards &&
		history.length
	) {
		const result = _parseActionTextMoveFoundation(game.previousAction.text);
		if (result) {
			const { fromLocation, toLocation, fromShorthand, autoShorthand } = result;
			const fromShorthands = fromShorthand.split('-');
			const hasCardsInBothPhases = autoShorthand.some((sh) => fromShorthands.includes(sh));

			if (!hasCardsInBothPhases) {
				// no overlapping cards, so where they are now is accurate
				game.previousAction.tweenCards = fromShorthands.map((rs) =>
					findCard(game.cards, parseShorthandCard(rs))
				);
			} else {
				// cards moved in both steps, it's non-trivial to recover their originals state
				// (e.g. 52-card flourish, moving moved that fourth (or first) card to auto-foundation)
				const redid = game
					.undo({ skipActionPrev: true })
					.moveByShorthand(fromLocation + toLocation, { autoFoundation: false });
				game.previousAction.tweenCards = getCardsThatMoved(redid);
			}
		}
	}
}
