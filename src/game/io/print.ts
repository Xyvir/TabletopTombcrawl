import {
	Card,
	CardLocation,
	CardSequence,
	isLocationEqual,
	removeBraille,
	shorthandCard,
} from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { parseMovesFromHistory } from '@/game/move/history';

/**
	print the home row of the game board \
	split out logic from {@linkcode FreeCell.prototype.print}

	- XXX (optimize) optimize
*/
export function printHome(
	game: FreeCell,
	cursor = game.cursor,
	selection = game.selection
): string {
	let str = '';
	if (
		cursor.fixture === 'cell' ||
		selection?.location.fixture === 'cell' ||
		cursor.fixture === 'foundation' ||
		selection?.location.fixture === 'foundation'
	) {
		// cells
		// prettier-ignore
		str += game.cells
				.map((card, idx) => `${getPrintSeparator({ fixture: 'cell', data: [idx] }, cursor, selection)}${shorthandCard(card)}`)
				.join('');

		// collapsed col between
		if (isLocationEqual(cursor, { fixture: 'foundation', data: [0] })) {
			str += '>';
		} else if (
			selection &&
			isLocationEqual(selection.location, { fixture: 'cell', data: [game.cells.length - 1] })
		) {
			str += '|';
		} else if (
			selection &&
			isLocationEqual(selection.location, { fixture: 'foundation', data: [0] })
		) {
			str += '|';
		} else {
			str += ' ';
		}

		// foundation (minus first col)
		// prettier-ignore
		str += game.foundations
				.map((card, idx) => `${idx === 0 ? '' : getPrintSeparator({ fixture: 'foundation', data: [idx] }, cursor, selection)}${shorthandCard(card)}`)
				.join('');

		// last col
		if (
			selection &&
			isLocationEqual(selection.location, {
				fixture: 'foundation',
				data: [game.foundations.length - 1],
			})
		) {
			str += '|';
		} else {
			str += ' ';
		}
	} else {
		// if no cursor/selection in home row
		str += ' ' + game.cells.map((card) => shorthandCard(card)).join(' ');
		str += ' ' + game.foundations.map((card) => shorthandCard(card)).join(' ');
		str += ' ';
	}
	return str;
}

/**
	print the tableau of the game board \
	split out logic from {@linkcode FreeCell.prototype.print}
*/
export function printTableau(
	game: FreeCell,
	cursor = game.cursor,
	selection = game.selection,
	flashCards = game.flashCards
): string {
	let str = '';
	const max = Math.max(...game.tableau.map((cascade) => cascade.length));
	const hasSelection =
		cursor.fixture === 'cascade' ||
		selection?.location.fixture === 'cascade' ||
		flashCards?.some((card) => card.location.fixture === 'cascade');
	for (let i = 0; i === 0 || i < max; i++) {
		if (hasSelection) {
			str +=
				'\n' +
				game.tableau
					.map((cascade, idx) => {
						const c = getPrintSeparator(
							{ fixture: 'cascade', data: [idx, i] },
							cursor,
							selection,
							flashCards
						);
						return c + shorthandCard(cascade[i]);
					})
					.join('') +
				getPrintSeparator(
					{ fixture: 'cascade', data: [game.tableau.length, i] },
					null,
					selection,
					flashCards
				);
		} else {
			// if no cursor/selection in game row
			str += '\n ' + game.tableau.map((cascade) => shorthandCard(cascade[i])).join(' ') + ' ';
		}
	}
	return str;
}

/**
	print the win message, if applicable \
	split out logic from {@linkcode FreeCell.prototype.print}

	- REVIEW (joker) where do we put them? - auto-arrange them in the cells? move them back to the deck (hide them)?
*/
export function printWin(game: FreeCell): string {
	if (game.win) {
		// XXX (gameplay) (hud) different messages depending on how you win
		const msg = game.winIsFlourish52
			? game.tableau.length > 6
				? 'A M A Z I N G !'
				: 'AMAZING !'
			: game.tableau.length > 6
				? 'Y O U   W I N !'
				: 'YOU WIN !';

		const lineLength = game.tableau.length * 3 + 1;
		const paddingLength = (lineLength - msg.length - 2) / 2;
		const spaces = '                               '; // enough spaces for 10 cascadeCount
		const padding = '                            '.substring(0, paddingLength);
		return (
			'\n:' +
			padding +
			msg +
			padding +
			(paddingLength === padding.length ? '' : ' ') +
			':' +
			'\n' +
			spaces.substring(0, lineLength)
		);
	}
	return '';
}

/**
	print the deck (row) of the game \
	split out logic from {@linkcode FreeCell.prototype.print}

	- XXX (optimize) optimize
*/
export function printDeck(
	game: FreeCell,
	cursor = game.cursor,
	selection = game.selection
): string {
	if (game.deck.length) {
		if (cursor.fixture === 'deck' || selection?.location.fixture === 'deck') {
			// using for-of entries to catch gaps (.map will skip gaps)
			const strs = [];
			for (const [idx, card] of game.deck.entries()) {
				strs.push(
					`${getPrintSeparator({ fixture: 'deck', data: [idx] }, cursor, selection)}${shorthandCard(card)}`
				);
			}
			const deckStr = strs.reverse().join('');
			const lastCol = getPrintSeparator({ fixture: 'deck', data: [-1] }, null, selection);
			return `${deckStr}${lastCol}`;
		} else {
			// if no cursor/selection in deck
			// using for-of to catch gaps (.map will skip gaps)
			const strs = [];
			for (const card of game.deck) {
				strs.push(shorthandCard(card));
			}
			const deckStr = strs.reverse().join(' ');
			return ` ${deckStr} `;
		}
	} else if (cursor.fixture === 'deck') {
		return `>   `;
	} else {
		return '';
	}
}

/**
	print the history of the game \
	split out logic from {@linkcode FreeCell.prototype.print}

	- BUG (history) (parse) (print) (settings) (shorthandMove-mismatch) standard move notation can only be used when `limit = 'opp+1'` for all moves
		- e.g. if (movesSeed && isStandardRuleset)
	- XXX (optimize) optimize
*/
export function printHistory(game: FreeCell, skipLasgamet = false): string {
	let str = '';
	const movesSeed = parseMovesFromHistory(game.history);
	if (movesSeed) {
		// print the history (shorthand) of the game
		// ---
		// print the last valid action, _not_ previousAction.text
		// the previous action could be a cursor movement, or a canceled touch action (touch stop)
		// TODO (history) (print) remove the last action - not needed for save/reload
		if (!skipLasgamet) str += `\n ${removeBraille(game.history.at(-1))}`;
		str += `\n:h shuffle32 ${movesSeed.seed}`;
		let movesStr = '';
		while (movesSeed.moves.length) {
			movesStr += '\n ' + movesSeed.moves.splice(0, game.tableau.length).join(' ') + ' ';
		}
		str += removeBraille(movesStr);
	} else {
		// print the history (lines) of the game
		// ---
		// if we don't know where we started or shorthand is otherwise invalid,
		// we can still print out all the actions we do know about
		game.history
			.slice(0)
			.reverse()
			.forEach((actionText) => {
				str += '\n ' + actionText;
			});
	}
	return str;
}

function getPrintSeparator(
	location: CardLocation,
	cursor: CardLocation | null,
	selection: CardSequence | null,
	flashCards: Card[] | null = null
) {
	if (cursor && isLocationEqual(location, cursor)) {
		return '>';
	}
	if (selection) {
		if (isLocationEqual(location, selection.location)) {
			return '|';
		}
		if (location.fixture !== 'cascade') {
			const shift = location.fixture === 'deck' ? 1 : -1;
			if (
				isLocationEqual(
					{ fixture: location.fixture, data: [location.data[0] + shift] },
					selection.location
				)
			) {
				return '|';
			}
		} else {
			if (
				location.data[0] === selection.location.data[0] ||
				location.data[0] - 1 === selection.location.data[0]
			) {
				if (
					location.data[1] >= selection.location.data[1] &&
					location.data[1] < selection.location.data[1] + selection.cards.length
				) {
					return '|';
				}
			}
		}
	}
	if (flashCards?.length) {
		if (flashCards.some((card) => isLocationEqual(location, card.location))) {
			return '*';
		}
		const shifted: CardLocation = {
			fixture: 'cascade',
			data: [location.data[0] - 1, location.data[1]],
		};
		if (flashCards.some((card) => isLocationEqual(shifted, card.location))) {
			return '*';
		}
	}
	return ' ';
}
