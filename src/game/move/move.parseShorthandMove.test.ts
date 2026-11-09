import { describe, expect, test } from 'vitest';
import { CardLocation, PileSH } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { parseShorthandMove } from '@/game/move/move';

describe('move.parseShorthandMove', () => {
	test('valid move', () => {
		const game = new FreeCell().shuffle32(1).dealAll();
		expect(parseShorthandMove(game, '1a')).toEqual([
			{ fixture: 'cascade', data: [0, 6] },
			{ fixture: 'cell', data: [0] },
		]);
	});

	test('invalid move', () => {
		const game = new FreeCell().shuffle32(1).dealAll();
		expect(parseShorthandMove(game, '12')).toEqual([
			{ fixture: 'cascade', data: [0, 6] },
			{ fixture: 'cascade', data: [1, 6] },
		]);
	});

	describe('various from piles', () => {
		const game = FreeCell.parse(
			'' + //
				'    TH 4H    2S 2H AC    \n' +
				' 9H 5H TC 9D    2D 8S 5S \n' +
				' QH KS 8H AD    3D 5C 6H \n' +
				' KH 6D 3S QS       4S 4C \n' +
				' 8C JC 7S 2C       JD KD \n' +
				'    7H 3H 6C       7D 9S \n' +
				'    4D    5D       6S QC \n' +
				'    3C    KC          JH \n' +
				'          QD          TS \n' +
				'          JS             \n' +
				'          TD             \n' +
				'          9C             \n' +
				'          8D             \n' +
				'          7C             \n' +
				' move a8 TS→JH\n' +
				':h shuffle32 11737\n' +
				' 2a 14 13 64 68 5b 54 34 \n' +
				' 32 57 5c a8 '
		);

		test.each`
			pileSh | from_location
			${'a'} | ${{ fixture: 'cell', data: [0] }}
			${'b'} | ${{ fixture: 'cell', data: [1] }}
			${'c'} | ${{ fixture: 'cell', data: [2] }}
			${'d'} | ${{ fixture: 'cell', data: [3] }}
			${'e'} | ${null}
			${'f'} | ${null}
			${'h'} | ${{ fixture: 'foundation', data: [0] }}
			${'1'} | ${{ fixture: 'cascade', data: [0, 3] }}
			${'2'} | ${{ fixture: 'cascade', data: [1, 5] }}
			${'3'} | ${{ fixture: 'cascade', data: [2, 4] }}
			${'4'} | ${{ fixture: 'cascade', data: [3, 10] }}
			${'5'} | ${{ fixture: 'cascade', data: [4, 0] }}
			${'6'} | ${{ fixture: 'cascade', data: [5, 1] }}
			${'7'} | ${{ fixture: 'cascade', data: [6, 4] }}
			${'8'} | ${{ fixture: 'cascade', data: [7, 5] }}
			${'9'} | ${null}
			${'0'} | ${null}
		`('$pileSh 5', ({ pileSh, from_location }: { pileSh: PileSH; from_location: CardLocation | null }) => {
			const result = from_location ? [from_location, { fixture: 'cascade', data: [4, 0] }] : null;
			expect(parseShorthandMove(game, `${pileSh}5`)).toEqual(result);
		});
	});
});
