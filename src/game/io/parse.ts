import { isEqual as _isEqual } from 'lodash';
import { Card, removeBraille } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { parseMovesFromHistory } from '@/game/move/history';

// XXX (refactor-restructure) parseHome
// XXX (refactor-restructure) parseTableau
// XXX (refactor-restructure) parseWin
// XXX (refactor-restructure) parseDeck

/**
	parse the history (shorthand) of the game \
	split out logic from {@linkcode FreeCell.prototype.parse}
*/
export function parseHistoryShorthand(
	print: string,
	lines: string[],
	popped: string,
	{
		cards,
		cellCount,
		cascadeCount,
		deckLength,
		actionText,
	}: {
		cards: Card[];
		cellCount: number;
		cascadeCount: number;
		deckLength: number;
		actionText: string;
	}
): { errorMessage?: string; replayGameForHistroy?: FreeCell } {
	const matchSeed = /:h shuffle32 (\d+)/.exec(popped);
	if (!matchSeed) {
		return { errorMessage: 'init with invalid history shuffle' };
	}

	const seed = parseInt(matchSeed[1], 10);
	if (isNaN(seed) || seed < 1 || seed > 32000) {
		return { errorMessage: 'init with invalid history seed' };
	}

	let replayGameForHistroy = new FreeCell({ cellCount, cascadeCount });
	replayGameForHistroy = replayGameForHistroy.shuffle32(seed);
	if (deckLength === 0) {
		replayGameForHistroy = replayGameForHistroy.dealAll();
	} else if (deckLength !== cards.length) {
		// XXX (optional-complexity) not valid gameplay, but like, we _do_ this in the tests, and accounting for this is fun
		replayGameForHistroy = replayGameForHistroy.dealAll({ demo: true, keepDeck: true });
	}

	// split will return [''] instead of []
	const moves = lines.length ? lines.reverse().join('').trim().split(/\s+/) : [];
	if (moves.length) {
		moves.forEach((move) => {
			replayGameForHistroy = replayGameForHistroy.moveByShorthand(move);
		});
	}

	// verify all args to `new FreeCell`
	const movesSeed = parseMovesFromHistory(replayGameForHistroy.history);

	// we just set this with an argument, it _cannot_ happen
	// if (replayGameForHistroy.cells.length !== cellCount) {
	// 	return { errorMessage: 'init with invalid history replay cell count' };
	// }

	// we just set this with an argument, it _cannot_ happen
	// if (replayGameForHistroy.tableau.length !== cascadeCount) {
	// 	return { errorMessage: 'init with invalid history replay cascade count' };
	// }

	if (replayGameForHistroy.deck.length !== deckLength) {
		return { errorMessage: 'init with invalid history replay deck length' };
	}

	// the order of the cards should be redundant, but if the cards don't match, lots of things will break
	// this also check "the complete current game state" (where all of the cards are)
	// (we've already parsed where all the cards should be, we are verifying that the moves produce the same result)
	if (!_isEqual(replayGameForHistroy.cards, cards)) {
		return { errorMessage: 'init with invalid history replay cards' };
	}

	// XXX (optional-complexity) verify cursor
	//  - we parse the history before the cursor
	//  - we would need to do that before parseHistoryShorthand
	//  - we could simply use the actionText to recover the cursor,
	//    but there is a separate optional complexity that uses the history to recover it more completely
	//  - (maybe we need to compromise and do both? verify the cursor if we have it, which will be most of the time)

	// XXX (optional-complexity) verify selection, availableMoves
	//  - we don't try to create the selection or availableMoves until after we've created a `game = new FreeCell`
	//  - … we would also need to _print_ the selection and availableMoves when we print the history
	// if (replayGameForHistroy.selection !== null) {
	// 	return { errorMessage: 'init with invalid history replay selection' };
	// }
	// if (replayGameForHistroy.availableMoves !== null) {
	// 	return { errorMessage: 'init with invalid history replay availableMoves' };
	// }

	// we've already parsed the action text, we are verifying that the moves produce the same result
	if (removeBraille(replayGameForHistroy.previousAction.text) !== actionText) {
		return { errorMessage: 'init with invalid history replay action text' };
	}

	// we just set this with an argument, it _cannot_ happen
	if (!movesSeed || movesSeed.seed !== seed) {
		return { errorMessage: 'init with invalid history replay seed' };
	}

	// we just replayed these moves, but if something broke along the way, they might be skipped
	if (!_isEqual(movesSeed.moves, moves)) {
		return { errorMessage: 'init with invalid history replay moves' };
	}

	// re-print the our game, confirm it matches the input
	const reprint = replayGameForHistroy.print({ includeHistory: true });
	if (reprint !== print) {
		if (reprint.trim() === print.trim()) {
			return { errorMessage: 'init with invalid history trailing whitespace' };
		}
		// prettier-ignore
		const trimLines = (str: string) => str.split('\n').map((line) => line.trimEnd()).join('\n');
		if (trimLines(reprint) === trimLines(print)) {
			return { errorMessage: 'init with invalid history whitespace lines' };
		}

		// not really sure how we could get this far…
		// …if I did, I'd check for that too and still have this unknown situation
		return { errorMessage: 'init with invalid history replay reprint' };
	}

	return { replayGameForHistroy };
}
