import { BOTTOM_OF_CASCADE } from '@/game/constants';
import { CardLocation } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { PreviousAction } from '@/game/move/history';
import { calcCursorActionText } from '@/game/move/move';

export type KeyboardArrowDirection = 'up' | 'right' | 'left' | 'down';

// TODO (controls) (gameplay) (keyboard) actually play the game and see what's not quite right
//  - "up wrap" and "down wrap" to cascade should move to the "first card of the last sequence"
//  - move to the bottom card, then "cast upwards" while the cards can stack
export function moveCursorWithBasicArrows(
	game: FreeCell,
	dir: KeyboardArrowDirection
): { action: PreviousAction; cursor: CardLocation } {
	const {
		fixture,
		data: [d0, d1],
	} = game.cursor;
	switch (fixture) {
		case 'cell':
			switch (dir) {
				case 'up':
					break;
				case 'left':
					if (d0 <= 0)
						return {
							action: { text: 'cursor left wrap', type: 'cursor' },
							cursor: { fixture: 'foundation', data: [game.foundations.length - 1] },
						};
					return {
						action: { text: 'cursor left', type: 'cursor' },
						cursor: { fixture, data: [d0 - 1] },
					};
				case 'right': {
					if (d0 >= game.cells.length - 1)
						return {
							action: { text: 'cursor right wrap', type: 'cursor' },
							cursor: { fixture: 'foundation', data: [0] },
						};
					return {
						action: { text: 'cursor right', type: 'cursor' },
						cursor: { fixture, data: [d0 + 1] },
					};
				}
				case 'down':
					return {
						action: { text: 'cursor down wrap', type: 'cursor' },
						cursor: { fixture: 'cascade', data: [d0, BOTTOM_OF_CASCADE] },
					};
			}
			break;
		case 'foundation':
			switch (dir) {
				case 'up':
					break;
				case 'left':
					if (d0 <= 0)
						return {
							action: { text: 'cursor left wrap', type: 'cursor' },
							cursor: { fixture: 'cell', data: [game.cells.length - 1] },
						};
					return {
						action: { text: 'cursor left', type: 'cursor' },
						cursor: { fixture, data: [d0 - 1] },
					};
				case 'right': {
					if (d0 >= game.foundations.length - 1)
						return {
							action: { text: 'cursor right wrap', type: 'cursor' },
							cursor: { fixture: 'cell', data: [0] },
						};
					return {
						action: { text: 'cursor right', type: 'cursor' },
						cursor: { fixture, data: [d0 + 1] },
					};
				}
				case 'down':
					return {
						action: { text: 'cursor down wrap', type: 'cursor' },
						cursor: {
							fixture: 'cascade',
							data: [game.tableau.length - game.foundations.length + d0, BOTTOM_OF_CASCADE],
						},
					};
			}
			break;
		case 'cascade':
			switch (dir) {
				case 'up':
					if (d1 <= 0) {
						// (card | stop | fond) vs (ccaarrdd | fond)
						//  0123   4567   89ab      01234567   89ab
						if (d0 < game.cells.length) {
							return {
								action: { text: 'cursor up wrap', type: 'cursor' },
								cursor: { fixture: 'cell', data: [d0] },
							};
						}
						if (game.tableau.length - 1 - d0 < game.foundations.length) {
							return {
								action: { text: 'cursor up wrap', type: 'cursor' },
								cursor: {
									fixture: 'foundation',
									data: [game.foundations.length - (game.tableau.length - d0)],
								},
							};
						}
						if (d0 === game.cells.length) {
							// wrap the one (cut the corner)
							return {
								action: { text: 'cursor up wrap', type: 'cursor' },
								cursor: { fixture: 'cell', data: [d0 - 1] },
							};
						}
						if (game.tableau.length - 1 - d0 === game.foundations.length) {
							// wrap the one (cut the corner)
							return {
								action: { text: 'cursor up wrap', type: 'cursor' },
								cursor: { fixture: 'foundation', data: [0] },
							};
						}
						return {
							action: { text: calcCursorActionText(game, 'stop', game.cursor), type: 'cursor' },
							cursor: game.cursor,
						};
					}
					return {
						action: { text: 'cursor up', type: 'cursor' },
						cursor: { fixture, data: [d0, d1 - 1] },
					};
				case 'left':
					// if d1 is too large, it will be fixed with __clampCursor
					if (d0 <= 0)
						return {
							action: { text: 'cursor left wrap', type: 'cursor' },
							cursor: { fixture: 'cascade', data: [game.tableau.length - 1, d1] },
						};
					return {
						action: { text: 'cursor left', type: 'cursor' },
						cursor: { fixture, data: [d0 - 1, d1] },
					};
				case 'right':
					// if d1 is too large, it will be fixed with __clampCursor
					if (d0 >= game.tableau.length - 1)
						return {
							action: { text: 'cursor right wrap', type: 'cursor' },
							cursor: { fixture: 'cascade', data: [0, d1] },
						};
					return {
						action: { text: 'cursor right', type: 'cursor' },
						cursor: { fixture, data: [d0 + 1, d1] },
					};
				case 'down':
					if (d1 >= game.tableau[d0].length - 1) {
						if (game.deck.length) {
							// REVIEW (controls) (gameplay) (keyboard) should we spread the cursor?
							//  - like how the cells map to the start of the tableau,
							//  - and the foundation maps to the end of the tableau
							//  - should we do some scaling/interpolation math?
							return {
								action: { text: 'cursor down wrap', type: 'cursor' },
								cursor: { fixture: 'deck', data: [game.deck.length - 1 - d0] },
							};
						}
						break;
					}
					return {
						action: { text: 'cursor down', type: 'cursor' },
						cursor: { fixture, data: [d0, d1 + 1] },
					};
			}
			break;
		case 'deck':
			switch (dir) {
				case 'up':
					// if d0 is wrong, it will be fixed with __clampCursor
					// d1 will be fixed with __clampCursor
					// REVIEW (controls) (gameplay) (keyboard) spread up/down between cascade and deck?
					//  - i.e. use the cascade to jump multiple cards in the deck
					return {
						action: { text: 'cursor up wrap', type: 'cursor' },
						cursor: {
							fixture: 'cascade',
							data: [Math.max(game.deck.length - 1, 0) - d0, BOTTOM_OF_CASCADE],
						},
					};
				case 'left':
					// left and right are reversed in the deck
					if (d0 === game.deck.length - 1 || game.deck.length === 0) {
						return {
							action: { text: 'cursor left wrap', type: 'cursor' },
							cursor: { fixture, data: [0] },
						};
					}
					return {
						action: { text: 'cursor left', type: 'cursor' },
						cursor: { fixture, data: [d0 + 1] },
					};
				case 'right':
					// left and right are reversed in the deck
					if (game.deck.length === 0) {
						return {
							action: { text: 'cursor right wrap', type: 'cursor' },
							cursor: { fixture, data: [0] },
						};
					}
					if (d0 === 0) {
						return {
							action: { text: 'cursor right wrap', type: 'cursor' },
							cursor: { fixture, data: [game.deck.length - 1] },
						};
					}
					return {
						action: { text: 'cursor right', type: 'cursor' },
						cursor: { fixture, data: [d0 - 1] },
					};
				case 'down':
					break;
			}
			break;
	}

	// noop
	const actionText = calcCursorActionText(game, 'stop', game.cursor);
	return { action: { text: actionText, type: 'cursor' }, cursor: game.cursor };
}
