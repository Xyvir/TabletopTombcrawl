import { describe, expect, test } from 'vitest';
import { BOTTOM_OF_CASCADE } from '@/game/constants';
import { CardLocation } from '@/game/card/card';
import { FreeCell } from '@/game/game';
import { calcCursorActionText } from '@/game/move/move';

describe('game/move.calcCursorActionText', () => {
	/**
		This is not an exhaustive test of the arguments.
		This is an exhaustive test of the cardSuffix conditions/logic within.
	*/
	describe('shorthandLocation / shorthandPile variations', () => {
		describe('deck with card', () => {
			const game = new FreeCell();

			describe('standard', () => {
				test.each`
					d0    | actionText
					${0}  | ${'cursor set k⡀ AC'}
					${1}  | ${'cursor set k⡁ AD'}
					${50} | ${'cursor set k⡲ KH'}
					${51} | ${'cursor set k⡳ KS'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					const location: CardLocation = { fixture: 'deck', data: [d0] };
					expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
					expect(game.setCursor(location).previousAction.text).toBe(actionText);
					expect(game.setCursor(location).cursor).toEqual(location);
				});
			});

			describe('clamp', () => {
				test.each`
					d0    | actionText
					${-2} | ${'cursor set k⡀ AC'}
					${-1} | ${'cursor set k⡀ AC'}
					${52} | ${'cursor set k⡳ KS'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					const location: CardLocation = { fixture: 'deck', data: [d0] };
					expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
					expect(game.setCursor(location).previousAction.text).toBe(actionText);
					expect(game.setCursor(location).cursor).not.toEqual(location);
				});
			});
		});

		describe('deck w/o card', () => {
			const game = new FreeCell().dealAll();

			describe('standard', () => {
				test.each`
					d0   | actionText
					${0} | ${'cursor set k'}
					${1} | ${'cursor set k'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					const location: CardLocation = { fixture: 'deck', data: [d0] };
					expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
					expect(game.setCursor(location).previousAction.text).toBe(actionText);
					expect(game.setCursor(location).cursor).toEqual({ fixture: 'deck', data: [0] });
				});
			});
		});

		describe('cell with card', () => {
			describe('1 cell', () => {
				const game = new FreeCell({ cellCount: 1 }).dealAll({ demo: true });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a 2C'}
						${1}  | ${'cursor set a 2C'}
						${2}  | ${'cursor set a 2C'}
						${3}  | ${'cursor set a 2C'}
						${4}  | ${'cursor set a 2C'}
						${5}  | ${'cursor set a 2C'}
						${6}  | ${'cursor set a 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('4 cells', () => {
				const game = new FreeCell({ cellCount: 4 }).dealAll({ demo: true });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a 2S'}
						${1} | ${'cursor set b 2H'}
						${2} | ${'cursor set c 2D'}
						${3} | ${'cursor set d 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a 2S'}
						${4}  | ${'cursor set d 2C'}
						${5}  | ${'cursor set d 2C'}
						${6}  | ${'cursor set d 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('6 cells', () => {
				const game = new FreeCell({ cellCount: 6 }).dealAll({ demo: true });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a 3D'}
						${1} | ${'cursor set b 3C'}
						${2} | ${'cursor set c 2S'}
						${3} | ${'cursor set d 2H'}
						${4} | ${'cursor set e 2D'}
						${5} | ${'cursor set f 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a 3D'}
						${6}  | ${'cursor set f 2C'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});
		});

		describe('cell w/o card', () => {
			describe('1 cell', () => {
				const game = new FreeCell({ cellCount: 1 });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a'}
						${1}  | ${'cursor set a'}
						${2}  | ${'cursor set a'}
						${3}  | ${'cursor set a'}
						${4}  | ${'cursor set a'}
						${5}  | ${'cursor set a'}
						${6}  | ${'cursor set a'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('4 cells', () => {
				const game = new FreeCell({ cellCount: 4 });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a'}
						${1} | ${'cursor set b'}
						${2} | ${'cursor set c'}
						${3} | ${'cursor set d'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a'}
						${4}  | ${'cursor set d'}
						${5}  | ${'cursor set d'}
						${6}  | ${'cursor set d'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('6 cells', () => {
				const game = new FreeCell({ cellCount: 6 });

				describe('standard', () => {
					test.each`
						d0   | actionText
						${0} | ${'cursor set a'}
						${1} | ${'cursor set b'}
						${2} | ${'cursor set c'}
						${3} | ${'cursor set d'}
						${4} | ${'cursor set e'}
						${5} | ${'cursor set f'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp', () => {
					test.each`
						d0    | actionText
						${-1} | ${'cursor set a'}
						${6}  | ${'cursor set f'}
					`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cell', data: [d0] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});
		});

		describe('cascade with card', () => {
			describe('4 cascades', () => {
				const game = new FreeCell({ cascadeCount: 4 }).dealAll();

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1⡀ KS'}
						${1} | ${0} | ${'cursor set 2⡀ KH'}
						${2} | ${0} | ${'cursor set 3⡀ KD'}
						${3} | ${0} | ${'cursor set 4⡀ KC'}
						${0} | ${1} | ${'cursor set 1⡁ QS'}
						${1} | ${1} | ${'cursor set 2⡁ QH'}
						${2} | ${1} | ${'cursor set 3⡁ QD'}
						${3} | ${1} | ${'cursor set 4⡁ QC'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1⡌ AS'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2⡌ AH'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3⡌ AD'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4⡌ AC'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1⡀ KS'}
						${4}  | ${0} | ${'cursor set 4⡀ KC'}
						${5}  | ${0} | ${'cursor set 4⡀ KC'}
						${6}  | ${0} | ${'cursor set 4⡀ KC'}
						${7}  | ${0} | ${'cursor set 4⡀ KC'}
						${8}  | ${0} | ${'cursor set 4⡀ KC'}
						${9}  | ${0} | ${'cursor set 4⡀ KC'}
						${10} | ${0} | ${'cursor set 4⡀ KC'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('8 cascades', () => {
				const game = new FreeCell({ cascadeCount: 8 }).dealAll();

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1⡀ KS'}
						${1} | ${0} | ${'cursor set 2⡀ KH'}
						${2} | ${0} | ${'cursor set 3⡀ KD'}
						${3} | ${0} | ${'cursor set 4⡀ KC'}
						${4} | ${0} | ${'cursor set 5⡀ QS'}
						${5} | ${0} | ${'cursor set 6⡀ QH'}
						${6} | ${0} | ${'cursor set 7⡀ QD'}
						${7} | ${0} | ${'cursor set 8⡀ QC'}
						${0} | ${1} | ${'cursor set 1⡁ JS'}
						${1} | ${1} | ${'cursor set 2⡁ JH'}
						${2} | ${1} | ${'cursor set 3⡁ JD'}
						${3} | ${1} | ${'cursor set 4⡁ JC'}
						${4} | ${1} | ${'cursor set 5⡁ TS'}
						${5} | ${1} | ${'cursor set 6⡁ TH'}
						${6} | ${1} | ${'cursor set 7⡁ TD'}
						${7} | ${1} | ${'cursor set 8⡁ TC'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1⡆ AS'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2⡆ AH'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3⡆ AD'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4⡆ AC'}
						${4} | ${BOTTOM_OF_CASCADE} | ${'cursor set 5⡅ 2S'}
						${5} | ${BOTTOM_OF_CASCADE} | ${'cursor set 6⡅ 2H'}
						${6} | ${BOTTOM_OF_CASCADE} | ${'cursor set 7⡅ 2D'}
						${7} | ${BOTTOM_OF_CASCADE} | ${'cursor set 8⡅ 2C'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1⡀ KS'}
						${8}  | ${0} | ${'cursor set 8⡀ QC'}
						${9}  | ${0} | ${'cursor set 8⡀ QC'}
						${10} | ${0} | ${'cursor set 8⡀ QC'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('10 cascades', () => {
				const game = new FreeCell({ cascadeCount: 10 }).dealAll();

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1⡀ KS'}
						${1} | ${0} | ${'cursor set 2⡀ KH'}
						${2} | ${0} | ${'cursor set 3⡀ KD'}
						${3} | ${0} | ${'cursor set 4⡀ KC'}
						${4} | ${0} | ${'cursor set 5⡀ QS'}
						${5} | ${0} | ${'cursor set 6⡀ QH'}
						${6} | ${0} | ${'cursor set 7⡀ QD'}
						${7} | ${0} | ${'cursor set 8⡀ QC'}
						${8} | ${0} | ${'cursor set 9⡀ JS'}
						${9} | ${0} | ${'cursor set 0⡀ JH'}
						${0} | ${1} | ${'cursor set 1⡁ JD'}
						${1} | ${1} | ${'cursor set 2⡁ JC'}
						${2} | ${1} | ${'cursor set 3⡁ TS'}
						${3} | ${1} | ${'cursor set 4⡁ TH'}
						${4} | ${1} | ${'cursor set 5⡁ TD'}
						${5} | ${1} | ${'cursor set 6⡁ TC'}
						${6} | ${1} | ${'cursor set 7⡁ 9S'}
						${7} | ${1} | ${'cursor set 8⡁ 9H'}
						${8} | ${1} | ${'cursor set 9⡁ 9D'}
						${9} | ${1} | ${'cursor set 0⡁ 9C'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1⡅ AD'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2⡅ AC'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3⡄ 3D'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4⡄ 3C'}
						${4} | ${BOTTOM_OF_CASCADE} | ${'cursor set 5⡄ 2S'}
						${5} | ${BOTTOM_OF_CASCADE} | ${'cursor set 6⡄ 2H'}
						${6} | ${BOTTOM_OF_CASCADE} | ${'cursor set 7⡄ 2D'}
						${7} | ${BOTTOM_OF_CASCADE} | ${'cursor set 8⡄ 2C'}
						${8} | ${BOTTOM_OF_CASCADE} | ${'cursor set 9⡄ AS'}
						${9} | ${BOTTOM_OF_CASCADE} | ${'cursor set 0⡄ AH'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1⡀ KS'}
						${10} | ${0} | ${'cursor set 0⡀ JH'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});
		});

		describe('cascade w/o card', () => {
			describe('4 cascades', () => {
				const game = new FreeCell({ cascadeCount: 4 });

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1'}
						${1} | ${0} | ${'cursor set 2'}
						${2} | ${0} | ${'cursor set 3'}
						${3} | ${0} | ${'cursor set 4'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${1}                 | ${'cursor set 1'}
						${1} | ${1}                 | ${'cursor set 2'}
						${2} | ${1}                 | ${'cursor set 3'}
						${3} | ${1}                 | ${'cursor set 4'}
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1'}
						${4}  | ${0} | ${'cursor set 4'}
						${5}  | ${0} | ${'cursor set 4'}
						${6}  | ${0} | ${'cursor set 4'}
						${7}  | ${0} | ${'cursor set 4'}
						${8}  | ${0} | ${'cursor set 4'}
						${9}  | ${0} | ${'cursor set 4'}
						${10} | ${0} | ${'cursor set 4'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('8 cascades', () => {
				const game = new FreeCell({ cascadeCount: 8 });

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1'}
						${1} | ${0} | ${'cursor set 2'}
						${2} | ${0} | ${'cursor set 3'}
						${3} | ${0} | ${'cursor set 4'}
						${4} | ${0} | ${'cursor set 5'}
						${5} | ${0} | ${'cursor set 6'}
						${6} | ${0} | ${'cursor set 7'}
						${7} | ${0} | ${'cursor set 8'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${1}                 | ${'cursor set 1'}
						${1} | ${1}                 | ${'cursor set 2'}
						${2} | ${1}                 | ${'cursor set 3'}
						${3} | ${1}                 | ${'cursor set 4'}
						${4} | ${1}                 | ${'cursor set 5'}
						${5} | ${1}                 | ${'cursor set 6'}
						${6} | ${1}                 | ${'cursor set 7'}
						${7} | ${1}                 | ${'cursor set 8'}
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4'}
						${4} | ${BOTTOM_OF_CASCADE} | ${'cursor set 5'}
						${5} | ${BOTTOM_OF_CASCADE} | ${'cursor set 6'}
						${6} | ${BOTTOM_OF_CASCADE} | ${'cursor set 7'}
						${7} | ${BOTTOM_OF_CASCADE} | ${'cursor set 8'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1'}
						${8}  | ${0} | ${'cursor set 8'}
						${9}  | ${0} | ${'cursor set 8'}
						${10} | ${0} | ${'cursor set 8'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});

			describe('10 cascades', () => {
				const game = new FreeCell({ cascadeCount: 10 });

				describe('standard', () => {
					test.each`
						d0   | d1   | actionText
						${0} | ${0} | ${'cursor set 1'}
						${1} | ${0} | ${'cursor set 2'}
						${2} | ${0} | ${'cursor set 3'}
						${3} | ${0} | ${'cursor set 4'}
						${4} | ${0} | ${'cursor set 5'}
						${5} | ${0} | ${'cursor set 6'}
						${6} | ${0} | ${'cursor set 7'}
						${7} | ${0} | ${'cursor set 8'}
						${8} | ${0} | ${'cursor set 9'}
						${9} | ${0} | ${'cursor set 0'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).toEqual(location);
					});
				});

				describe('clamp d1', () => {
					test.each`
						d0   | d1                   | actionText
						${0} | ${1}                 | ${'cursor set 1'}
						${1} | ${1}                 | ${'cursor set 2'}
						${2} | ${1}                 | ${'cursor set 3'}
						${3} | ${1}                 | ${'cursor set 4'}
						${4} | ${1}                 | ${'cursor set 5'}
						${5} | ${1}                 | ${'cursor set 6'}
						${6} | ${1}                 | ${'cursor set 7'}
						${7} | ${1}                 | ${'cursor set 8'}
						${8} | ${1}                 | ${'cursor set 9'}
						${9} | ${1}                 | ${'cursor set 0'}
						${0} | ${BOTTOM_OF_CASCADE} | ${'cursor set 1'}
						${1} | ${BOTTOM_OF_CASCADE} | ${'cursor set 2'}
						${2} | ${BOTTOM_OF_CASCADE} | ${'cursor set 3'}
						${3} | ${BOTTOM_OF_CASCADE} | ${'cursor set 4'}
						${4} | ${BOTTOM_OF_CASCADE} | ${'cursor set 5'}
						${5} | ${BOTTOM_OF_CASCADE} | ${'cursor set 6'}
						${6} | ${BOTTOM_OF_CASCADE} | ${'cursor set 7'}
						${7} | ${BOTTOM_OF_CASCADE} | ${'cursor set 8'}
						${8} | ${BOTTOM_OF_CASCADE} | ${'cursor set 9'}
						${9} | ${BOTTOM_OF_CASCADE} | ${'cursor set 0'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});

				describe('clamp d0', () => {
					test.each`
						d0    | d1   | actionText
						${-1} | ${0} | ${'cursor set 1'}
						${10} | ${0} | ${'cursor set 0'}
					`('$d0,$d1', ({ d0, d1, actionText }: { d0: number; d1: number; actionText: string }) => {
						const location: CardLocation = { fixture: 'cascade', data: [d0, d1] };
						expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
						expect(game.setCursor(location).previousAction.text).toBe(actionText);
						expect(game.setCursor(location).cursor).not.toEqual(location);
					});
				});
			});
		});

		describe('foundation with card', () => {
			const game = new FreeCell().dealAll({ demo: true });

			describe('standard', () => {
				test.each`
					d0   | actionText
					${0} | ${'cursor set h⡀ AS'}
					${1} | ${'cursor set h⡁ AH'}
					${2} | ${'cursor set h⡂ AD'}
					${3} | ${'cursor set h⡃ AC'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					const location: CardLocation = { fixture: 'foundation', data: [d0] };
					expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
					expect(game.setCursor(location).previousAction.text).toBe(actionText);
					expect(game.setCursor(location).cursor).toEqual(location);
				});
			});
		});

		describe('foundation w/o card', () => {
			const game = new FreeCell();

			describe('standard', () => {
				test.each`
					d0   | actionText
					${0} | ${'cursor set h⡀'}
					${1} | ${'cursor set h⡁'}
					${2} | ${'cursor set h⡂'}
					${3} | ${'cursor set h⡃'}
				`('$d0', ({ d0, actionText }: { d0: number; actionText: string }) => {
					const location: CardLocation = { fixture: 'foundation', data: [d0] };
					expect(calcCursorActionText(game, 'set', location)).toBe(actionText);
					expect(game.setCursor(location).previousAction.text).toBe(actionText);
					expect(game.setCursor(location).cursor).toEqual(location);
				});
			});
		});
	});
});
