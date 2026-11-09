import { omit as _omit } from 'lodash';
import { beforeEach, describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';

describe('game/history.recoverTweenCards', () => {
	describe('no card overlap', () => {
		const game = new FreeCell({ cellCount: 6, cascadeCount: 10 }).shuffle32(25759).dealAll().moveByShorthand('42').moveByShorthand('4a');
		beforeEach(() => {
			expect(game.print()).toBe(
				'' + //
					'>JH                2H          \n' +
					' 2C 4D 2S QS 7D 6S QD 4H TC KD \n' +
					' 5C 9D 5D KH QH TD 8D 6H JC JD \n' +
					' 3S 7C 3D    AS 2D 5S AC 9S 3H \n' +
					' KC 8S 4S    6C KS QC 9C 5H 8C \n' +
					' TH AD JS       6D 7S 4C 7H 3C \n' +
					' 8H TS                         \n' +
					'    9H                         \n' +
					' move 4a JH→cell (auto-foundation 45 AH,2H)'
			);
			expect(game.previousAction).toEqual({
				text: 'move 4⡃a JH→cell (auto-foundation 45 AH,2H)',
				type: 'move-foundation',
				tweenCards: [{ rank: 'jack', suit: 'hearts', location: { fixture: 'cell', data: [0] } }],
			});
			expect(game.history).toEqual(['shuffle deck (25759)', 'deal all cards', 'move 4⡄2⡅ 9H→TS', 'move 4⡃a JH→cell (auto-foundation 45 AH,2H)']);
		});

		test('undo', () => {
			const gameUndid = game.moveByShorthand('ab').undo();
			expect(gameUndid.previousAction).toEqual({
				text: 'move 4⡃a JH→cell (auto-foundation 45 AH,2H)',
				type: 'move-foundation',
				tweenCards: [{ rank: 'jack', suit: 'hearts', location: { fixture: 'cell', data: [0] } }],
				gameFunction: 'undo',
			});
			expect(_omit(gameUndid, 'previousAction.gameFunction')).toEqual(_omit(game, 'previousAction.gameFunction'));
		});

		test('parse', () => {
			const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
			expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
			expect(gameWithHist).toEqual(game);

			const gameNoHist = FreeCell.parse(game.print());
			expect(gameNoHist.print()).toBe(game.print());
			expect(gameNoHist.history).toEqual(['init without history', 'move 4⡃a JH→cell (auto-foundation 45 AH,2H)']);
			expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
		});
	});

	describe('card overlap', () => {
		const game = new FreeCell().shuffle32(6893).dealAll().moveByShorthand('82');
		beforeEach(() => {
			expect(game.print()).toBe(
				'' + //
					'             AD 2S       \n' +
					' 9C 8D 8C 4D KS 5D 5H 4H \n' +
					' QD 6D AH 5C TC JC 8S 7H \n' +
					' 6S 3D 2D KC 6C 2C 2H 9H \n' +
					' 6H 3C TS QS TH 8H 5S AC \n' +
					' 4C KD TD JH 9S 7D 9D JS \n' +
					' 7S>QC 3H 4S QH 7C       \n' +
					' KH    JD 3S             \n' +
					' move 82 AD→2S (auto-foundation 272 AD,AS,2S)'
			);
			expect(game.previousAction).toEqual({
				text: 'move 8⡅2⡆ AD→2S (auto-foundation 272 AD,AS,2S)',
				type: 'move-foundation',
				tweenCards: [{ rank: 'ace', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 7] } }],
			});
			expect(game.history).toEqual(['shuffle deck (6893)', 'deal all cards', 'move 8⡅2⡆ AD→2S (auto-foundation 272 AD,AS,2S)']);
		});

		test('undo', () => {
			const gameUndid = game.moveByShorthand('21').undo();
			expect(gameUndid.previousAction).toEqual({
				text: 'move 8⡅2⡆ AD→2S (auto-foundation 272 AD,AS,2S)',
				type: 'move-foundation',
				tweenCards: [{ rank: 'ace', suit: 'diamonds', location: { fixture: 'cascade', data: [1, 7] } }],
				gameFunction: 'undo',
			});
			expect(_omit(gameUndid, 'previousAction.gameFunction')).toEqual(_omit(game, 'previousAction.gameFunction'));
		});

		test('parse', () => {
			const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
			expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
			expect(gameWithHist).toEqual(game);

			const gameNoHist = FreeCell.parse(game.print());
			expect(gameNoHist.print()).toBe(game.print());
			expect(gameNoHist.history).toEqual(['init without history', 'move 8⡅2⡆ AD→2S (auto-foundation 272 AD,AS,2S)']);
			expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
		});
	});

	describe('move-foundation from useCardPositionAnimations', () => {
		describe('one and one', () => {
			const game = new FreeCell().shuffle32(5).dealAll().moveByShorthand('53');
			beforeEach(() => {
				expect(game.previousAction).toEqual({
					text: 'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)',
					type: 'move-foundation',
					tweenCards: [{ rank: '6', suit: 'hearts', location: { fixture: 'cascade', data: [2, 7] } }],
				});
			});

			test('undo', () => {
				const gameUndid = game.moveByShorthand('1a').undo();
				expect(gameUndid.previousAction).toEqual({
					text: 'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)',
					type: 'move-foundation',
					tweenCards: [{ rank: '6', suit: 'hearts', location: { fixture: 'cascade', data: [2, 7] } }],
					gameFunction: 'undo',
				});
				expect(_omit(gameUndid, 'previousAction.gameFunction')).toEqual(_omit(game, 'previousAction.gameFunction'));
			});

			test('parse', () => {
				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.print()).toBe(game.print());
				expect(gameNoHist.history).toEqual(['init without history', 'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)']);
				expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
			});
		});

		describe('selection goes to foundation', () => {
			const game = FreeCell.parse(
				'' + //
					' 4S 7S 2S    AH          \n' +
					' 8D 6C JS 3D 3H    8C 6S \n' +
					' 2H 9S QC 9C 7D    9H JD \n' +
					' 2C AC 5D 5C TS    QH KH \n' +
					' TH 6D 5H 4H TD    AD 6H \n' +
					' 7H 8S KS 3S KC   >AS|3C \n' +
					'    2D KD    QD    8H 4C \n' +
					'    5S QS    JC    7C    \n' +
					'    4D JH                \n' +
					'       TC                \n' +
					'       9D                \n' +
					' select 7 AS'
			).$touchAndMove({ fixture: 'cascade', data: [6, 5] });
			beforeEach(() => {
				expect(game.history).toEqual(['init without history', 'move 7⡅6 8H-7C→cascade (auto-foundation 77c AS,AD,2S)']);
				expect(game.previousAction).toEqual({
					text: 'move 7⡅6 8H-7C→cascade (auto-foundation 77c AS,AD,2S)',
					type: 'move-foundation',
					tweenCards: [
						{ rank: '8', suit: 'hearts', location: { fixture: 'cascade', data: [5, 0] } },
						{ rank: '7', suit: 'clubs', location: { fixture: 'cascade', data: [5, 1] } },
					],
				});
			});

			test('undo', () => {
				const gameUndid = game.moveByShorthand('1c').undo();
				expect(gameUndid.previousAction).toEqual({
					text: 'move 7⡅6 8H-7C→cascade (auto-foundation 77c AS,AD,2S)',
					type: 'move-foundation',
					tweenCards: [
						{ rank: '8', suit: 'hearts', location: { fixture: 'cascade', data: [5, 0] } },
						{ rank: '7', suit: 'clubs', location: { fixture: 'cascade', data: [5, 1] } },
					],
					gameFunction: 'undo',
				});
				expect(_omit(gameUndid, 'previousAction.gameFunction')).toEqual(_omit(game, 'previousAction.gameFunction'));
			});

			test('parse', () => {
				const gameWithHist = FreeCell.parse(game.print({ includeHistory: true }));
				expect(gameWithHist.print({ includeHistory: true })).toBe(game.print({ includeHistory: true }));
				expect(gameWithHist).toEqual(game);

				const gameNoHist = FreeCell.parse(game.print());
				expect(gameNoHist.print()).toBe(game.print());
				expect(gameNoHist.history).toEqual(['init without history', 'move 7⡅6 8H-7C→cascade (auto-foundation 77c AS,AD,2S)']);
				expect(_omit(gameNoHist, 'history')).toEqual(_omit(game, 'history'));
			});
		});
	});
});
