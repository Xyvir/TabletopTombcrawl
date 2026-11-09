import { afterAll, describe, expect, test } from 'vitest';
import { CardLocation } from '@/game/card/card';
import { ACTION_TEXT_EXAMPLES, pullActionTextExamples } from '@/game/catalog/actionText-examples';
import { getCardsFromInvalid, parsePreviousActionType, PreviousAction } from '@/game/move/history';

describe('game/history.getCardsFromInvalid', () => {
	describe('specific cases', () => {
		const actionTextExamples = Object.keys(ACTION_TEXT_EXAMPLES).filter((actionText) => parsePreviousActionType(actionText).type === 'invalid');
		afterAll(() => {
			expect(actionTextExamples).toEqual([]);
		});

		test.each`
			actionText                            | result
			${'touch stop'}                       | ${{ fromShorthands: [], toShorthands: [] }}
			${'invalid move 86 7D→9C'}            | ${{ fromShorthands: ['7D'], toShorthands: ['9C'] }}
			${'invalid move 75 6D-5S-4D-3C→7C'}   | ${{ fromShorthands: ['6D', '5S', '4D', '3C'], toShorthands: ['7C'] }}
			${'invalid move hc AC→cell'}          | ${{ fromShorthands: ['AC'], toShorthands: [], pileShorthands: [{ fixture: 'cell', data: [2] }] }}
			${'invalid move 1c KC-QD-JC→cell'}    | ${{ fromShorthands: ['KC', 'QD', 'JC'], toShorthands: [], pileShorthands: [{ fixture: 'cell', data: [2] }] }}
			${'invalid move kb 6H→cell'}          | ${{ fromShorthands: ['6H'], toShorthands: [], pileShorthands: [{ fixture: 'cell', data: [1] }] }}
			${'invalid move ah 3C→foundation'}    | ${{ fromShorthands: ['3C'], toShorthands: [], pileShorthands: [{ fixture: 'foundation', data: [0] }] }}
			${'invalid move 1h 9C→foundation'}    | ${{ fromShorthands: ['9C'], toShorthands: [], pileShorthands: [{ fixture: 'foundation', data: [0] }] }}
			${'invalid move ah⡂ 3C→foundation'}   | ${{ fromShorthands: ['3C'], toShorthands: [], pileShorthands: [{ fixture: 'foundation', data: [2] }] }}
			${'invalid move 1⡁h⡂ 9C→foundation'}  | ${{ fromShorthands: ['9C'], toShorthands: [], pileShorthands: [{ fixture: 'foundation', data: [2] }] }}
			${'invalid move 2h TH→AH'}            | ${{ fromShorthands: ['TH'], toShorthands: ['AH'] }}
			${'invalid move 13 KC-QD-JC→cascade'} | ${{ fromShorthands: ['KC', 'QD', 'JC'], toShorthands: [], pileShorthands: [{ fixture: 'cascade', data: [2, 0] }] }}
			${'invalid move k1 KH→cascade'}       | ${{ fromShorthands: ['KH'], toShorthands: [], pileShorthands: [{ fixture: 'cascade', data: [0, 0] }] }}
			${'invalid move bk 6C→deck'}          | ${{ fromShorthands: ['6C'], toShorthands: [], pileShorthands: [{ fixture: 'deck', data: [99] }] }}
			${'invalid move hk TD→deck'}          | ${{ fromShorthands: ['TD'], toShorthands: [], pileShorthands: [{ fixture: 'deck', data: [99] }] }}
			${'invalid move 4k 6D→deck'}          | ${{ fromShorthands: ['6D'], toShorthands: [], pileShorthands: [{ fixture: 'deck', data: [99] }] }}
			${'invalid move 2k TC-9D-8C→deck'}    | ${{ fromShorthands: ['TC', '9D', '8C'], toShorthands: [], pileShorthands: [{ fixture: 'deck', data: [99] }] }}
		`('$actionText', ({ actionText, result }: { actionText: string; result: ReturnType<typeof getCardsFromInvalid> }) => {
			pullActionTextExamples(actionTextExamples, actionText);
			const previousAction: PreviousAction = {
				text: actionText,
				type: 'invalid',
			};
			expect(getCardsFromInvalid(previousAction)).toEqual(result);
		});
	});

	describe('other cases', () => {
		test.each`
			actionText                     | result
			${'invalid move tableau→deck'} | ${{ fromShorthands: [], toShorthands: [] }}
		`('$actionText', ({ actionText, result }: { actionText: string; cursor: CardLocation; result: ReturnType<typeof getCardsFromInvalid> }) => {
			const previousAction: PreviousAction = {
				text: actionText,
				type: 'invalid',
			};
			expect(getCardsFromInvalid(previousAction)).toEqual(result);
		});
	});
});
