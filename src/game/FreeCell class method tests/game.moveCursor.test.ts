import { describe, expect, test } from 'vitest';
import { CardLocation } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { KeyboardArrowDirection } from '@/game/move/keyboard';

describe('game.moveCursor', () => {
	describe('spot check some moves', () => {
		describe('not dealt', () => {
			const game = new FreeCell();
			test.each`
				start                                     | actual                                  | dir        | end                                     | actionText
				${{ fixture: 'deck', data: [49] }}        | ${{ fixture: 'deck', data: [49] }}      | ${'up'}    | ${{ fixture: 'cascade', data: [2, 0] }} | ${'cursor up wrap'}
				${{ fixture: 'deck', data: [0] }}         | ${{ fixture: 'deck', data: [0] }}       | ${'left'}  | ${{ fixture: 'deck', data: [1] }}       | ${'cursor left'}
				${{ fixture: 'deck', data: [0] }}         | ${{ fixture: 'deck', data: [0] }}       | ${'right'} | ${{ fixture: 'deck', data: [51] }}      | ${'cursor right wrap'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'left'}  | ${{ fixture: 'cascade', data: [7, 0] }} | ${'cursor left wrap'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'right'} | ${{ fixture: 'cascade', data: [1, 0] }} | ${'cursor right'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'up'}    | ${{ fixture: 'cell', data: [0] }}       | ${'cursor up wrap'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 0] }} | ${'down'}  | ${{ fixture: 'deck', data: [51] }}      | ${'cursor down wrap'}
			`(
				'$start.fixture $start.data $dir',
				({
					start,
					actual,
					dir,
					end,
					actionText,
				}: {
					start: CardLocation;
					actual: CardLocation;
					dir: KeyboardArrowDirection;
					end: CardLocation;
					actionText: string;
				}) => {
					let g = game.setCursor(start);
					expect(g.cursor).toEqual(actual);
					g = g.moveCursor(dir);
					expect(g.cursor).toEqual(end);
					expect(g.previousAction).toEqual({ text: actionText, type: 'cursor' });
				}
			);
		});

		describe('dealt', () => {
			const game = new FreeCell().dealAll();
			test.each`
				start                                     | actual                                  | dir        | end                                     | actionText
				${{ fixture: 'deck', data: [49] }}        | ${{ fixture: 'deck', data: [0] }}       | ${'up'}    | ${{ fixture: 'cascade', data: [0, 6] }} | ${'cursor up wrap'}
				${{ fixture: 'deck', data: [0] }}         | ${{ fixture: 'deck', data: [0] }}       | ${'left'}  | ${{ fixture: 'deck', data: [0] }}       | ${'cursor left wrap'}
				${{ fixture: 'deck', data: [0] }}         | ${{ fixture: 'deck', data: [0] }}       | ${'right'} | ${{ fixture: 'deck', data: [0] }}       | ${'cursor right wrap'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 6] }} | ${'left'}  | ${{ fixture: 'cascade', data: [7, 5] }} | ${'cursor left wrap'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 6] }} | ${'right'} | ${{ fixture: 'cascade', data: [1, 6] }} | ${'cursor right'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 6] }} | ${'up'}    | ${{ fixture: 'cascade', data: [0, 5] }} | ${'cursor up'}
				${{ fixture: 'cascade', data: [-1, 99] }} | ${{ fixture: 'cascade', data: [0, 6] }} | ${'down'}  | ${{ fixture: 'cascade', data: [0, 6] }} | ${'cursor stop 1⡆ AS'}
				${{ fixture: 'cascade', data: [3, 3] }}   | ${{ fixture: 'cascade', data: [3, 3] }} | ${'left'}  | ${{ fixture: 'cascade', data: [2, 3] }} | ${'cursor left'}
				${{ fixture: 'cascade', data: [3, 3] }}   | ${{ fixture: 'cascade', data: [3, 3] }} | ${'right'} | ${{ fixture: 'cascade', data: [4, 3] }} | ${'cursor right'}
				${{ fixture: 'cascade', data: [3, 3] }}   | ${{ fixture: 'cascade', data: [3, 3] }} | ${'up'}    | ${{ fixture: 'cascade', data: [3, 2] }} | ${'cursor up'}
				${{ fixture: 'cascade', data: [3, 3] }}   | ${{ fixture: 'cascade', data: [3, 3] }} | ${'down'}  | ${{ fixture: 'cascade', data: [3, 4] }} | ${'cursor down'}
			`(
				'$start.fixture $start.data $dir',
				({
					start,
					actual,
					dir,
					end,
					actionText,
				}: {
					start: CardLocation;
					actual: CardLocation;
					dir: KeyboardArrowDirection;
					end: CardLocation;
					actionText: string;
				}) => {
					let g = game.setCursor(start);
					expect(g.cursor).toEqual(actual);
					g = g.moveCursor(dir);
					expect(g.cursor).toEqual(end);
					expect(g.previousAction).toEqual({ text: actionText, type: 'cursor' });
				}
			);
		});
	});

	// TODO (controls) (keyboard) only cycle between places that have a card
	//  - up/left/down/right only work when that spot has a card
	//  - or relly, jump over the empty spaces
	//  - impl isn't trivial
	describe('no selection only moves to cards', () => {
		test.todo('what do these tests need / look like?');
	});

	// TODO (controls) (keyboard) (settings) only cycle between places that the selection can move
	//  - we pick a move by priority
	//  - we need to have the default ordering (or something) for picking the next cursor
	//  - left and right are easy
	//  - up and down are "interesting"
	describe('has selection only moves to valid locations', () => {
		test.todo('what do these tests need / look like?');
	});
});
