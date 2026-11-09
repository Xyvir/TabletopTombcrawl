/**
 * Port shim: in the upstream project this lived in `app/components/cards/constants.ts`
 * (a React/DOM module). The engine only ever needed this one value.
 *
 * Large enough that clampCursor always sorts it to the bottom:
 * 52 cards in a deck, at most ~19 tall in a standard game, 56 with jokers.
 *
 * @see {@linkcode BOTTOM_OF_CASCADE} note upstream: aces start at "1", so 2 is "102".
 */
export const BOTTOM_OF_CASCADE = 99;
