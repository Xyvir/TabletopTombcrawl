/*
	this file is not part of standard gameplay,
	it's supplemental things _just for fun_,
	layered in on top of gameplay, but does not change the game rules
*/

import { BOTTOM_OF_CASCADE } from '@/game/constants';
import {
	Card,
	CardLocation,
	CardSequence,
	findCard,
	getSequenceAt,
	getSuitForCompare,
	sortCardsBySuitAndRank,
	Suit,
	SuitList,
} from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { calcMoveActionText, moveCards } from '@/game/move/move';

export const juice = { canFlourish, canFlourish52 };

/**
	checks if it's even possible to flourish

	meant for the start of the game
*/
function canFlourish(game: FreeCell): Card[] {
	if (game.deck.length) return [];
	// cells don't matter for this
	if (game.foundations.every((card) => !!card)) return [];
	// the way we check requries this many cascades
	if (game.tableau.length < SuitList.length + 1) return [];

	const exclude = new Set<Suit>();
	const allCascadeAces = SuitList
		// aces are first in the list, so findCard will return quickly
		.map((suit) => findCard(game.cards, { suit, rank: 'ace' }))
		// only consider aces in play (aces shouldn't be in a cell, so we can ignore them)
		.filter((card) => card.location.fixture === 'cascade');
	if (allCascadeAces.length === 0) return [];

	// isLocationEqual
	// XXX (flourish-anim) do cards in a cell count as danglingAces?
	const danglingAces = allCascadeAces.filter(
		(card) => card === game.tableau[card.location.data[0]].at(-1)
	);
	if (danglingAces.length) {
		// if any aces exposed at start, then any of them will do
		// (it doesn't matter which you move first, they _all_ auto-foundation immediately)
		const g = game.$selectCard(danglingAces[0]).touchByPile('h');
		if (g.win) {
			return danglingAces.sort(_sortAces);
		}

		// exclude every ace in the foundation
		g.cards.forEach((card) => {
			if (card.rank === 'ace' && card.location.fixture === 'foundation') {
				exclude.add(card.suit);
			}
		});
	}

	game = _collectCellsToDeck(game);
	game = _collectCardsTillAceToDeck(game); // ¿minor optimization (less to move later)?

	const aces: Card[] = [];
	allCascadeAces.forEach((card) => {
		const g = _organizeCardsExcept(game, card);
		if (g.$selectCard(card).touchByPile('h').win) {
			aces.push(card);

			// exclude every other ace above it in the same column
			// if something is going to flourish, it'd be the bottom one
			g.tableau[card.location.data[0]].forEach((c) => {
				if (c.rank === 'ace' && c.suit !== card.suit) {
					exclude.add(c.suit);
				}
			});
		}
	});

	return aces.filter((card) => !exclude.has(card.suit)).sort(_sortAces);
}

/**
	checks if it's possible to flourish _all_ fo the cards

	meant for the start of the game
*/
function canFlourish52(game: FreeCell): Card[] {
	if (game.deck.length) return [];
	// cells don't matter for this
	if (game.foundations.some((card) => !!card)) return [];

	/*
	if (
		!SuitList.every((suit) =>
			findCard(game.cards, { suit, rank: 'ace' }).location.fixture === 'cascade'
		)
	) {
		return [];
	}
	const danglingAces: Card[] = [];
	game.tableau.forEach((cascade) => {
		const last_card = cascade.at(-1);
		if (last_card?.rank === 'ace') {
			danglingAces.push(last_card);
		}
	});
	*/

	const allCascadeAces = SuitList
		// aces are first in the list, so findCard will return quickly
		.map((suit) => findCard(game.cards, { suit, rank: 'ace' }))
		// only consider aces in play (aces shouldn't be in a cell, so we can ignore them)
		.filter((card) => card.location.fixture === 'cascade');
	// all aces must be in the tableau
	if (allCascadeAces.length !== SuitList.length) return [];

	// isLocationEqual
	const danglingAces = allCascadeAces.filter(
		(card) => card.location.data[1] === game.tableau[card.location.data[0]].length - 1
	);
	if (danglingAces.length) {
		// if any aces exposed at start, then any of them will do
		// (it doesn't matter which you move first, they _all_ auto-foundation immediately)
		if (game.$selectCard(danglingAces[0]).touchByPile('h').win) {
			return danglingAces.sort(_sortAces);
		} else {
			return [];
		}
	}

	game = _collectCellsToDeck(game);
	game = _collectCardsTillAceToDeck(game);

	const selectionsToTry: CardSequence[] = [];
	const emptyPiles: CardLocation[] = [];
	for (let c_idx = 0; c_idx < game.tableau.length; c_idx++) {
		const s = game
			.setCursor({ fixture: 'cascade', data: [c_idx, BOTTOM_OF_CASCADE] })
			.touch().selection;
		if (s) {
			selectionsToTry.push(s);
		} else {
			emptyPiles.push({ fixture: 'cascade', data: [c_idx, 0] });
		}
	}

	if (selectionsToTry.length === 0) return [];
	if (emptyPiles.length < SuitList.length) return [];

	sortCardsBySuitAndRank(game.deck);
	game = _spreadDeckToEmptyPiles(game, emptyPiles);

	const aces: Card[] = [];
	selectionsToTry.forEach((selectionToTry) => {
		// try the move
		if (game.$touchAndMove(selectionToTry.location).win) {
			// return the ace
			const [d0, d1] = selectionToTry.location.data;
			const card = game.tableau[d0].at(d1 - 1);
			// REVIEW (joker) rules with jokers are weird, so this may not work right
			if (card?.rank === 'ace') {
				aces.push(card);
			}
		}
	});

	return aces.sort(_sortAces);
}

export function _collectCellsToDeck(game: FreeCell): FreeCell {
	const cards: Card[] = [];
	game.cells.forEach((cell) => {
		if (cell) cards.push(cell);
	});
	if (cards.length) {
		game = _moveCardsToDeck(game, {
			location: { fixture: 'cell', data: [0] },
			cards,
			peekOnly: true,
		});
	}
	return game;
}

/**
	"If we dealt with every card, _except_ for this ace, could it flourish?"

	Take everything off the board except for the one ace in question,
	organize those cards so they can auto-foundation.
	Now it's just a matter of moving that ace and see if we can win.

	There is probably an easier way of, like, marching up the cascade with some kind of heuristic.
	But that assumes game settings.
	This kind of 'simulation" is probably more robust.

	Contains all the magic for {@linkcode canFlourish}.
*/
export function _organizeCardsExcept(game: FreeCell, card: Card) {
	const [cardD0, cardD1] = card.location.data;
	const cardsToMove: Card[] = [];

	// deal with each cascade, update game as we go
	for (let d0 = 0; d0 < game.tableau.length; d0++) {
		const cascade = game.tableau[d0];
		if (!cascade.at(-1)) {
			// the cascade is empty
			// skip it
			continue;
		} else if (cardD0 !== d0) {
			// our card is not in this cascade
			// move the entire column
			Array.prototype.unshift.apply(cardsToMove, cascade);
		} else if (!cascade.at(cardD1 + 1)) {
			// the ace is the last card
			// there's nothing to move
			continue;
		} else {
			// move everything after the ace
			Array.prototype.unshift.apply(cardsToMove, cascade.slice(cardD1 + 1));
		}
	}

	game = _moveCardsToDeck(game, {
		location: { fixture: 'foundation', data: [0] },
		cards: cardsToMove,
		peekOnly: true,
	});

	const emptyPiles: CardLocation[] = [];
	for (let d0 = game.tableau.length - 1; d0 >= 0; d0--) {
		if (d0 !== cardD0) {
			emptyPiles.push({ fixture: 'cascade', data: [d0, 0] });
		}
	}
	sortCardsBySuitAndRank(game.deck);
	game = _spreadDeckToEmptyPiles(game, emptyPiles);

	return game;
}

// REVIEW (joker) rules with jokers are weird, so this may not work right
export function _collectCardsTillAceToDeck(game: FreeCell): FreeCell {
	const cardsToMove: Card[] = [];
	for (const cascade of game.tableau) {
		if (!cascade.at(-1)) continue; // if the cascade is empty, skip this one
		if (cascade.at(-1)?.rank === 'ace') continue; // if the bottom card is an ace
		if (cascade.at(-2)?.rank === 'ace') continue; // if the second to last cards is an ace, this cascade is finished
		if (cascade.length < 3) continue; // only 2 cards and neither is an ace

		// march down to find the a card that's 1 after the ace
		let d1 = cascade.length - 1;
		while (d1 > 0 && cascade[d1 - 2]?.rank !== 'ace') {
			d1--;
		}

		Array.prototype.unshift.apply(cardsToMove, cascade.slice(d1));
	}

	game = _moveCardsToDeck(game, {
		location: { fixture: 'foundation', data: [0] }, // this is unused, and it's a bunch of cards across all cascades
		cards: cardsToMove,
		peekOnly: true,
	});

	return game;
}

function _spreadDeckToEmptyPiles(g: FreeCell, emptyPiles: CardLocation[]): FreeCell {
	// unshuffle deck
	// sortCardsBySuitAndRank(g.deck);

	// put deck on board, split by suit
	emptyPiles.forEach((emptyPile) => {
		// TODO (deck) (test) we deal from the middle
		//  - e.g. const last_card = g.deck.at(0);
		//  - this isn't a valid move, and we probably won't do it
		//  - but it will help ensure moveCards + deck representation is sound
		//  - we _had_ a bug about the deck having gaps
		//  - this will help test that those gaps do not come back
		const last_card = g.deck.at(-1);
		if (last_card) {
			const cards = g.deck.filter((card) => card.suit === last_card.suit);
			const selection: CardSequence = {
				location: last_card.location,
				cards: cards,
				peekOnly: true,
			};
			g = _moveDeckToBoard(g, selection, emptyPile);
		}
	});

	return g;
}

function _sortAces(a: Card, b: Card) {
	// sort by suit (low to high)
	const sa = getSuitForCompare(a.suit);
	const sb = getSuitForCompare(b.suit);
	return sa - sb;
}

function _moveCardsToDeck(game: FreeCell, selection: CardSequence): FreeCell {
	if (!selection.cards.length) return game;
	const to: CardLocation = { fixture: 'deck', data: [(game.deck.length || 1) - 1] };
	const cards = moveCards(game, selection, to);
	const actionText = 'invalid move tableau→deck';
	return game.__clone({
		action: { text: actionText, type: 'move', gameFunction: 'recall-or-bury' },
		cards,
		cursor: to,
	});
}

function _moveDeckToBoard(game: FreeCell, selection: CardSequence, to: CardLocation): FreeCell {
	if (!selection.cards.length) return game;
	const cards = moveCards(game, selection, to);
	const actionText = 'invalid ' + calcMoveActionText(selection, getSequenceAt(game, to));
	return game.__clone({
		action: { text: actionText, type: 'move', gameFunction: 'recall-or-bury' },
		cards,
		cursor: to,
	});
	// return game
	// 	.setCursor(to)
	// 	.$setSelection(selection, { gameFunction: 'recall-or-bury' })
	// 	.touch({ gameFunction: 'recall-or-bury' });
}
