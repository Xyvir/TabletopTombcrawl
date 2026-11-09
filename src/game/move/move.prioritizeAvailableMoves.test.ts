import { describe, expect, test } from 'vitest';
import { availableMovesMinimized } from '@/game/testUtils';
import { FreeCell } from '@/game/game';
import { closestAvailableMovesPriority, linearAvailableMovesPriority } from '@/game/move/move';

describe('prioritizeAvailableMoves', () => {
	describe('linearAvailableMovesPriority', () => {
		describe('1 count', () => {
			const positions = [0];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[1]}
				${0}         | ${[0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => linearAvailableMovesPriority(1, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('4 count', () => {
			const positions = [0, 1, 2, 3];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[4, 3, 2, 1]}
				${0}         | ${[0, 7, 6, 5]}
				${1}         | ${[4, 0, 6, 5]}
				${2}         | ${[4, 3, 0, 5]}
				${3}         | ${[4, 3, 2, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => linearAvailableMovesPriority(4, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('8 count', () => {
			const positions = [0, 1, 2, 3, 4, 5, 6, 7];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[8, 7, 6, 5, 4, 3, 2, 1]}
				${0}         | ${[0, 15, 14, 13, 12, 11, 10, 9]}
				${1}         | ${[8, 0, 14, 13, 12, 11, 10, 9]}
				${2}         | ${[8, 7, 0, 13, 12, 11, 10, 9]}
				${3}         | ${[8, 7, 6, 0, 12, 11, 10, 9]}
				${4}         | ${[8, 7, 6, 5, 0, 11, 10, 9]}
				${5}         | ${[8, 7, 6, 5, 4, 0, 10, 9]}
				${6}         | ${[8, 7, 6, 5, 4, 3, 0, 9]}
				${7}         | ${[8, 7, 6, 5, 4, 3, 2, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => linearAvailableMovesPriority(8, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('10 count', () => {
			const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]}
				${0}         | ${[0, 19, 18, 17, 16, 15, 14, 13, 12, 11]}
				${1}         | ${[10, 0, 18, 17, 16, 15, 14, 13, 12, 11]}
				${5}         | ${[10, 9, 8, 7, 6, 0, 14, 13, 12, 11]}
				${8}         | ${[10, 9, 8, 7, 6, 5, 4, 3, 0, 11]}
				${9}         | ${[10, 9, 8, 7, 6, 5, 4, 3, 2, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => linearAvailableMovesPriority(10, d0, sourceD0))).toEqual(priorities);
			});
		});
	});

	//** closest: what it does */
	describe('closestAvailableMovesPriority', () => {
		describe('1 count', () => {
			const positions = [0];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[2]}
				${0}         | ${[0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => closestAvailableMovesPriority(1, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('4 count', () => {
			const positions = [0, 1, 2, 3];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[8, 6, 4, 2]}
				${0}         | ${[0, 6, 4, 2]}
				${1}         | ${[5, 0, 6, 4]}
				${2}         | ${[3, 5, 0, 6]}
				${3}         | ${[1, 3, 5, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => closestAvailableMovesPriority(4, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('8 count', () => {
			const positions = [0, 1, 2, 3, 4, 5, 6, 7];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[16, 14, 12, 10, 8, 6, 4, 2]}
				${0}         | ${[0, 14, 12, 10, 8, 6, 4, 2]}
				${1}         | ${[13, 0, 14, 12, 10, 8, 6, 4]}
				${2}         | ${[11, 13, 0, 14, 12, 10, 8, 6]}
				${3}         | ${[9, 11, 13, 0, 14, 12, 10, 8]}
				${4}         | ${[7, 9, 11, 13, 0, 14, 12, 10]}
				${5}         | ${[5, 7, 9, 11, 13, 0, 14, 12]}
				${6}         | ${[3, 5, 7, 9, 11, 13, 0, 14]}
				${7}         | ${[1, 3, 5, 7, 9, 11, 13, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => closestAvailableMovesPriority(8, d0, sourceD0))).toEqual(priorities);
			});
		});

		describe('10 count', () => {
			const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
			test.each`
				sourceD0     | priorities
				${undefined} | ${[20, 18, 16, 14, 12, 10, 8, 6, 4, 2]}
				${0}         | ${[0, 18, 16, 14, 12, 10, 8, 6, 4, 2]}
				${1}         | ${[17, 0, 18, 16, 14, 12, 10, 8, 6, 4]}
				${5}         | ${[9, 11, 13, 15, 17, 0, 18, 16, 14, 12]}
				${8}         | ${[3, 5, 7, 9, 11, 13, 15, 17, 0, 18]}
				${9}         | ${[1, 3, 5, 7, 9, 11, 13, 15, 17, 0]}
			`('sourceD0: $sourceD0', ({ sourceD0, priorities }: { sourceD0: number | undefined; priorities: number[] }) => {
				expect(positions.map((d0) => closestAvailableMovesPriority(10, d0, sourceD0))).toEqual(priorities);
			});
		});
	});

	//** closest: when to use it */
	describe('linear vs closest', () => {
		// start at 0, move to stacked, move to another sequence (3S -> 4D,4H)
		test('across sequences from empty', () => {
			let game = FreeCell.parse(
				'' + //
					'             KC 8D 8H TS \n' +
					'    KS QD>JS    QH KH    \n' +
					'                         \n' +
					' hand-jammed'
			);
			game = game.touch();
			expect(game.previousAction.text).toBe('select 4⡀ JS');
			expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
				['a', 'cell:empty', -1],
				['b', 'cell:empty', -1],
				['c', 'cell:empty', -1],
				['d', 'cell:empty', -1],
				['h⡃', 'foundation:any', -1],
				['1', 'cascade:empty', -1],
				['3⡀', 'cascade:sequence', 13],
				['5', 'cascade:empty', -1],
				['6⡀', 'cascade:sequence', 12],
				['8', 'cascade:empty', -1],
			]);
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['3⡀', 13],
				['6⡀', 12],
			]);
			game = game.autoMove({ autoFoundation: false });
			// if we don't move down, we select the sequence, we want to move the solo card for now
			expect(game.touch().previousAction.text).toBe('select 3⡀ QD-JS');
			game = game.moveCursor('down').touch();
			expect(game.previousAction.text).toBe('select 3⡁ JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['6⡀', 11]]);
			game = game.autoMove({ autoFoundation: false }).moveCursor('down').touch();
			expect(game.previousAction.text).toBe('select 6⡁ JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['3⡀', 6]]);
			expect(game.print()).toBe(
				'' + //
					'             KC 8D 8H TS \n' +
					'    KS QD       QH KH    \n' +
					'               >JS|      \n' +
					':d KD QS JH JD TH TD 9H 9D \n' +
					' select 6 JS'
			);
		});

		// 3S is on a 5 or something (3S -> 4D,4H)
		test('across sequences from invalid', () => {
			let game = FreeCell.parse(
				'' + //
					'             KC 8D 8H TS \n' +
					'    KS QD       QH KH    \n' +
					'                  >JS    \n' +
					' hand-jammed'
			);
			game = game.touch();
			expect(game.previousAction.text).toBe('select 7⡁ JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['3⡀', 7],
				['6⡀', 13],
			]);
			game = game.autoMove({ autoFoundation: false });
			// if we don't move down, we select the sequence, we want to move the solo card for now
			expect(game.touch().previousAction.text).toBe('select 6⡀ QH-JS');
			game = game.moveCursor('down').touch();
			expect(game.previousAction.text).toBe('select 6⡁ JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['3⡀', 6]]);
			game = game.autoMove({ autoFoundation: false }).moveCursor('down').touch();
			expect(game.previousAction.text).toBe('select 3⡁ JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['6⡀', 11]]);
			expect(game.print()).toBe(
				'' + //
					'             KC 8D 8H TS \n' +
					'    KS QD       QH KH    \n' +
					'      >JS|               \n' +
					':d KD QS JH JD TH TD 9H 9D \n' +
					' select 3 JS'
			);
		});

		// start at 0, move to stacked, move to another sequence (3S -> 4D ??)
		test('empty to one sequence', () => {
			let game = FreeCell.parse(
				'' + //
					'             KC JD JH TS \n' +
					'       KS>QD    QH KH    \n' +
					'          JS             \n' +
					' hand-jammed'
			);
			game = game.touch();
			expect(game.previousAction.text).toBe('select 4⡀ QD-JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['3⡀', 13]]);
			game = game.autoMove({ autoFoundation: false });
			// if we don't move down, we select the larger sequence
			expect(game.touch().previousAction.text).toBe('select 3⡀ KS-QD-JS');
			game = game.moveCursor('down').touch();
			expect(game.previousAction.text).toBe('select 3⡁ QD-JS');
			expect(availableMovesMinimized(game.availableMoves, true)).toEqual([
				['1', 'cascade:empty', 11],
				['2', 'cascade:empty', 13],
				['4', 'cascade:empty', 14],
				['5', 'cascade:empty', 12],
				['8', 'cascade:empty', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 4⡀ QD-JS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([['3⡀', 13]]);
			expect(game.print()).toBe(
				'' + //
					'             KC JD JH TS \n' +
					'       KS>QD|   QH KH    \n' +
					'         |JS|            \n' +
					':d KD QS \n' +
					' select 4 QD-JS'
			);
		});

		// 3S is on at some root (3S -> empty,empty)
		test('across empty from empty', () => {
			let game = FreeCell.parse(
				'' + //
					' QS KC KD KH JS \n' +
					'      >KS       \n' +
					' hand-jammed'
			);
			expect(game.cells.length).toBe(1);
			expect(game.tableau.length).toBe(5);
			game = game.touch();
			expect(game.previousAction.text).toBe('select 3⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['4', 7],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 4⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['3', 3],
				['5', 6],
			]);
			expect(game.print()).toBe(
				'' + //
					' QS KC KD KH JS \n' +
					'         >KS|   \n' +
					' select 4 KS'
			);
		});

		// 3S is on a 5 or something (3S -> empty,empty)
		test('across empty from invalid', () => {
			let game = FreeCell.parse(
				'' + //
					' QS KC KD QH JS \n' +
					'       KH       \n' +
					'      >KS       \n' +
					' hand-jammed'
			);
			expect(game.cells.length).toBe(1);
			expect(game.tableau.length).toBe(5);
			game = game.touch();
			expect(game.previousAction.text).toBe('select 3⡁ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 7],
				['4', 8],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 4⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 5⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['4', 2],
			]);
			// …do an extra lap because of deprecated king→cascade:empty rightJustifyAvailableMovesPriority
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 1⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['2', 9],
				['4', 7],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 2⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['4', 7],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 4⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['5', 6],
			]);
			game = game.autoMove({ autoFoundation: false }).touch();
			expect(game.previousAction.text).toBe('select 5⡀ KS');
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['1', 5],
				['2', 4],
				['4', 2],
			]);
			expect(game.print()).toBe(
				'' + //
					' QS KC KD QH JS \n' +
					'       KH   >KS|\n' +
					' select 5 KS'
			);
		});

		// TODO (joker) moving a 3S, there is 4D,4H,JD,JH
		test.todo('across joker sequences');
	});

	test('king to foundation', () => {
		const game = FreeCell.parse(
			'' +
				'             QH QC 2D    \n' +
				' AS            >KC KH KS \n' +
				' KD                QS QD \n' +
				'                   JD JS \n' +
				'                   TS TD \n' +
				'                   9D 9S \n' +
				'                   8S 8D \n' +
				'                   7D 7S \n' +
				'                   6S 6D \n' +
				'                   5D 5S \n' +
				'                   4S 4D \n' +
				'                   3D 3S \n' +
				'                   2S    \n' +
				' move 68 QD-JS-TD-9S-8D-7S-6D-5S-4D-3S→KS'
		).touch({ autoMove: false });
		expect(game.previousAction).toEqual({
			text: 'select 6⡀ KC',
			type: 'select',
		});
		expect(availableMovesMinimized(game.availableMoves)).toEqual([['h⡁', 3]]);
		expect(game.autoMove().print()).toBe(
			'' +
				'             QH>KC 2D    \n' +
				' AS                KH KS \n' +
				' KD                QS QD \n' +
				'                   JD JS \n' +
				'                   TS TD \n' +
				'                   9D 9S \n' +
				'                   8S 8D \n' +
				'                   7D 7S \n' +
				'                   6S 6D \n' +
				'                   5D 5S \n' +
				'                   4S 4D \n' +
				'                   3D 3S \n' +
				'                   2S    \n' +
				' move 6h KC→QC'
		);
		expect(game.autoMove().print()).toBe(game.clearSelection().$touchAndMove().print());
	});

	describe('prioritize moving cards to a completed sequence', () => {
		describe('prioritize longer if both are royal piles', () => {
			test('previous test a', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC 8D 8H TS \n' +
						'       KS>JS    QH KH    \n' +
						'       QD                \n' +
						' hand-jammed'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 4⡀ JS',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['3⡁', 2],
					['6⡀', 1],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 4⡀3⡁ JS→QD');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('JS').autoMove().previousAction.text).toBe('move 4⡀6⡀ JS→QH');
			});

			test('previous test b', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC 8D 8H TS \n' +
						'       KS       QH KH    \n' +
						'       QD         >JS    \n' +
						' hand-jammed'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 7⡁ JS',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['3⡁', 2],
					['6⡀', 1],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 7⡁3⡁ JS→QD');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('JS').autoMove().previousAction.text).toBe('move 7⡁6⡀ JS→QH');
			});
		});

		describe('traced #1', () => {
			test('cursor set 7 JH', () => {
				const game = FreeCell.parse(
					'' +
						'    3D       2C AS       \n' +
						' JD 2D QS JC 5D 7H 7C TC \n' +
						' KD KC    5S AD QC KH 9H \n' +
						' 2S KS    QD JS    AH 8S \n' +
						' 4C 5C    QH 4H    4D 7D \n' +
						' 3S TD    TH 3C   >JH 6C \n' +
						' 6D 9C    9S 2H    TS 5H \n' +
						' 6S 8D    8H       9D 4S \n' +
						'    7S             8C 3H \n' +
						'    6H                   \n' +
						' cursor set 7 JH'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 7⡄ JH-TS-9D-8C',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['3⡀', 2],
					['6⡁', 1],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 7⡄3⡀ JH-TS-9D-8C→QS');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('JH').autoMove().previousAction.text).toBe('move 7⡄6⡁ JH-TS-9D-8C→QC');
			});
		});

		describe('traced #617', () => {
			test('cursor set d 3D', () => {
				// this one isn't building on a king (or queen/jack)
				// so we shouldn't use this type of priority
				const game = FreeCell.parse(
					'' +
						' KS 4D 6D>3D 3C 2S       \n' +
						' 7D AD 5C 6S 9D 8C JD AH \n' +
						' TD 7S QD 5D 8S 8H    KH \n' +
						' TH QC 3H 4S 7H 8D    TC \n' +
						' KD 5H 9S    6C 7C    JS \n' +
						' 4C QS 9C       6H       \n' +
						'    JH 2H       5S       \n' +
						'    TS KC       4H       \n' +
						'    9H QH       3S       \n' +
						'       JC       2D       \n' +
						' cursor set d 3D'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select d 3D',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1⡄', 8],
					['4⡂', 5],
				]);
				expect(game.autoMove().previousAction.text).toBe('move d1⡄ 3D→4C');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('3D').autoMove().previousAction.text).toBe('move d4⡂ 3D→4S');
			});
		});

		describe('traced #23190', () => {
			test('cursor set 1 JH', () => {
				const game = FreeCell.parse(
					'' +
						'       QD KS             \n' +
						' TS 6C AC 3C KD 2C KC 4H \n' +
						' JD AH AD 6S QC 4S QH 6D \n' +
						' 2D 3D AS TC    5S JS TD \n' +
						'>JH 8D 8S JC    9C TH 9H \n' +
						'    7S 7H 5D    KH 9S 8C \n' +
						'    5H    2H    QS 8H 9D \n' +
						'    4C    7D       7C    \n' +
						'    3H             6H    \n' +
						'    2S             5C    \n' +
						'                   4D    \n' +
						'                   3S    \n' +
						' cursor set 1 JH'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 1⡃ JH',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['5⡁', 2],
					['6⡅', 1],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 1⡃5⡁ JH→QC');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('JH').autoMove().previousAction.text).toBe('move 1⡃6⡅ JH→QS');
			});

			test('cursor set 1 TS', () => {
				const game = FreeCell.parse(
					'' +
						'       QD KS             \n' +
						'>TS 6C AC 3C KD 2C KC 4H \n' +
						'    AH AD 6S QC 4S QH 6D \n' +
						'    3D AS TC JH 5S JS TD \n' +
						'    8D 8S JC    9C TH 9H \n' +
						'    7S 7H 5D    KH 9S 8C \n' +
						'    5H    2H    QS 8H 9D \n' +
						'    4C    7D    JD 7C    \n' +
						'    3H             6H    \n' +
						'    2S             5C    \n' +
						'                   4D    \n' +
						'                   3S    \n' +
						'                   2D    \n' +
						' cursor set 1 TS'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 1⡀ TS',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['5⡂', 2],
					['6⡆', 1],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 1⡀5⡂ TS→JH');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('TS').autoMove().previousAction.text).toBe('move 1⡀6⡆ TS→JD');
			});

			test('cursor set 4 6S', () => {
				const game = FreeCell.parse(
					'' +
						'       5D 2H             \n' +
						' KS 6C AC 3C KD 2C KC 4H \n' +
						' QD AH AD>6S QC 4S QH 6D \n' +
						' JC 3D AS    JH 5S JS TD \n' +
						'    8D 8S    TS 9C TH 9H \n' +
						'    7S 7H    9D KH 9S    \n' +
						'    5H       8C QS 8H    \n' +
						'    4C       7D JD 7C    \n' +
						'    3H          TC 6H    \n' +
						'    2S             5C    \n' +
						'                   4D    \n' +
						'                   3S    \n' +
						'                   2D    \n' +
						' cursor set 4 6S'
				).touch();
				expect(game.previousAction).toEqual({
					text: 'select 4⡁ 6S',
					type: 'select',
				});
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['3⡄', 1],
					['5⡆', 2],
				]);
				expect(game.autoMove().previousAction.text).toBe('move 4⡁5⡆ 6S→7D');
				// move again, uses other option, collapses move
				expect(game.autoMove().$selectCard('6S').autoMove().previousAction.text).toBe('move 4⡁3⡄ 6S→7H');
			});
		});

		test('freeplay #26359', () => {
			const game = FreeCell.parse(
				'' +
					'    KD KH    AS          \n' +
					' JC 9H 6S 7D KS 3C 4S 5H \n' +
					' 3H 5D QS 2S QH AH KC 2H \n' +
					' AD 4C 5S 7H JS 6C 5C 8D \n' +
					' 3S 9D JD AC TH TC QC 8S \n' +
					' QD    2D 7C 9S 2C 8C 7S \n' +
					'       6D 6H    3D 4H 4D \n' +
					'       TD JH             \n' +
					'       9C TS             \n' +
					'       8H                \n' +
					' move 23 8H→9C\n' +
					':h shuffle32 26359\n' +
					' 24 53 5a 52 52 5b 5c a5 \n' +
					' 25 15 23 '
			)
				.undo()
				.touchByPile('2');
			expect(game.history.length).toBe(12);
			expect(game.previousAction).toEqual({
				text: 'select 2⡄ 8H',
				type: 'select',
			});
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['3⡇', 1], // this is what happened, move 23 8H→9C
				['5⡄', 2], // this is preferred, move 25 8H→9S
			]);
			expect(game.autoMove().previousAction.text).toBe('move 2⡄5⡄ 8H→9S');
			// move again, uses other option, collapses move
			expect(game.autoMove().$selectCard('8H').autoMove().previousAction.text).toBe('move 2⡄3⡇ 8H→9C');
		});

		test('freeplay #29327', () => {
			const game = FreeCell.parse(
				'' +
					' 2C                      \n' +
					' 3C TD 3H KC 7S AC QH 6H \n' +
					' AH 8C 5S    TH 6S TS KD \n' +
					' 8D 9S QC    2D 4C 9D AS \n' +
					' 5H 4H KS    JH KH 7D AD \n' +
					' 4S 3S QD    TC QS JS JC \n' +
					' 3D 2H       9H JD    9C \n' +
					' 2S          8S       8H \n' +
					'             7H       7C \n' +
					'             6C       6D \n' +
					'             5D       5C \n' +
					'                      4D \n' +
					' move b3 QD→KS\n' +
					':h shuffle32 29327\n' +
					' 56 58 4a 48 37 4b 43 24 \n' +
					' 12 41 24 27 17 68 6c 46 \n' +
					' 35 32 12 71 75 c4 b3 '
			)
				.undo()
				.touchByPile('b');
			expect(game.history.length).toBe(24);
			expect(game.previousAction).toEqual({
				text: 'select b QD',
				type: 'select',
			});
			expect(availableMovesMinimized(game.availableMoves)).toEqual([
				['3⡃', 1], // this is what happened, move 23 8H→9C
				['4⡀', 2], // this is preferred, move 25 8H→9S
			]);
			expect(game.autoMove().previousAction.text).toBe('move b4⡀ QD→KC');
			// move again, uses other option, collapses move
			expect(game.autoMove().$selectCard('QD').autoMove().previousAction.text).toBe('move b3⡃ QD→KS');
		});
	});

	describe('*:single→foundation, if opp+2 would auto-foundation', () => {
		test('previous test, cascade:single→foundation', () => {
			const game = FreeCell.parse(
				'' + //
					'             KC JD JH TS \n' +
					'    KD KS>JS    QH KH    \n' +
					'    QS QD                \n' +
					' hand-jammed'
			);
			expect(game.touch().autoMove({ autoFoundation: false }).print()).toBe(
				'' + //
					'             KC JD JH>JS \n' +
					'    KD KS       QH KH    \n' +
					'    QS QD                \n' +
					' move 4h JS→TS'
			);
			expect(game.$touchAndMove().print()).toBe(
				'' + //
					'             KC KD KH>KS \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 4h JS→TS (auto-foundation 362273 QD,QH,QS,KD,KH,KS)'
			);
		});

		test('previous test, cascade:sequence→foundation', () => {
			const game = FreeCell.parse(
				'' + //
					'             KC JD 9H TS \n' +
					' JH KD KS>JS    QH KH    \n' +
					'    QS QD TH             \n' +
					' hand-jammed'
			);
			expect(game.touch().autoMove({ autoFoundation: false }).print()).toBe(
				'' + //
					'             KC JD 9H TS \n' +
					' JH KD KS       QH KH    \n' +
					'    QS>QD                \n' +
					'       JS                \n' +
					'       TH                \n' +
					' move 43 JS-TH→QD'
			);
			expect(game.$touchAndMove().print()).toBe(
				'' + //
					'            >KC KD KH KS \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 43 JS-TH→QD (auto-foundation 333122637 TH,JS,QD,JH,QS,KD,QH,KS,KH)'
			);
		});

		test('previous test, cascade:sequence→foundation targetted directly', () => {
			const game = FreeCell.parse(
				'' + //
					'             KC JD 9H TS \n' +
					' JH KD KS>JS    QH KH    \n' +
					'    QS QD TH             \n' +
					' hand-jammed'
			);
			expect(game.touch().touchByPile('h', { autoFoundation: false }).print()).toBe(
				'' + //
					'             KC JD>TH TS \n' +
					' JH KD KS JS    QH KH    \n' +
					'    QS QD                \n' +
					' move 4h TH→9H'
			);
			expect(game.touch().touchByPile('h').print()).toBe(
				'' + //
					'             KC KD>KH KS \n' +
					'                         \n' +
					':    Y O U   W I N !    :\n' +
					'                         \n' +
					' move 4h TH→9H (auto-foundation 14362273 JH,JS,QD,QH,QS,KD,KH,KS)'
			);
		});

		test('traced #10347', () => {
			// we can safely move 3C to the founcation
			// 2D is up, 2H will auto-foundation as soon as it's revealed
			// AS, 2S, 3S are entirely unrelated to 3C
			// AS will auto-foundation
			// 2S may need to stack on 3D, 3H, which are both still in play
			const gameExample = FreeCell.parse(
				'' + //
					' 9H 4D    TH 3C 2D AH    \n' +
					' 5S AS 9C 6D QS QD 6C 6S \n' +
					' KH 6H 7C 2S JH    5D 5H \n' +
					' 8S 7H JS 3S       4C    \n' +
					' 2H 7D TC 3H       3D    \n' +
					' 5C KD 8H KC             \n' +
					' 4S QC KS                \n' +
					' 4H JD QH                \n' +
					'    TS JC                \n' +
					'    9D TD                \n' +
					'    8C 9S                \n' +
					'       8D                \n' +
					'       7S                \n' +
					' move 6h 3C→2C\n' +
					':h shuffle32 10347\n' +
					' 3a 53 53 83 73 72 76 72 \n' +
					' 42 42 67 5b 5c 57 56 8d \n' +
					' 85 85 83 a3 62 c8 6a 68 \n' +
					' 6h '
			);
			expect(gameExample.history.length).toBe(27);
			expect(gameExample.previousAction.text).toBe('move 6⡁h⡀ 3C→2C');

			const game = gameExample.undo();
			expect(game.previousAction.text).toBe('move 6⡂8⡀ 5H→6S');
			expect(availableMovesMinimized(game.touchByPile('6').availableMoves, true)).toEqual([
				['c', 'cell:empty', -1],
				['h⡀', 'foundation:any', 4],
				['1⡆', 'cascade:sequence', -1],
			]);
			expect(game.moveByShorthand('6c').previousAction.text).toBe('move 6⡁c 3C→cell');
			expect(game.moveByShorthand('6h').previousAction.text).toBe('move 6⡁h⡀ 3C→2C');
			expect(game.moveByShorthand('61').previousAction.text).toBe('move 6⡁1⡆ 3C→4H');

			// this is what we want
			expect(game.$touchAndMove('3C').previousAction.text).toBe('move 6⡁h⡀ 3C→2C');
		});

		describe('bugfix: too greedy', () => {
			test('traced #4335 a', () => {
				const game = FreeCell.parse(
					'' + //
						' 7S 7D 3C 2H 2S AD 2C    \n' +
						' KH KD    QS 7C KS 3H 2D \n' +
						' AH 8H    JD 6H KC 8S 5S \n' +
						' 4D 3S    TS 5C QD 4H TC \n' +
						' 8D 4S    9D    JS QC 5H \n' +
						' 6D 6S          TD JH 9H \n' +
						' 8C QH                9S \n' +
						' 7H JC                   \n' +
						' 6C TH                   \n' +
						' 5D 9C                   \n' +
						' 4C                      \n' +
						' 3D                      \n' +
						' move 36 TD→JS\n' +
						':h shuffle32 4335\n' +
						' 32 72 63 6a 61 41 4b 47 \n' +
						' 46 41 4c 4d b4 d4 56 5b \n' +
						' 54 31 34 53 5d d5 a3 35 \n' +
						' 3a 3d 36 '
				);
				expect(game.history.length).toBe(29);
				expect(game.previousAction.text).toBe('move 3⡀6⡃ TD→JS');
				expect(availableMovesMinimized(game.touchByPile('c').availableMoves, true)).toEqual([
					['h⡂', 'foundation:any', -1],
					['3', 'cascade:empty', 12],
				]);
				expect(game.moveByShorthand('ch').previousAction.text).toBe('move ch⡂ 3C→2C');
				expect(game.moveByShorthand('c3').previousAction.text).toBe('move c3 3C→cascade');

				// in a previous life, this is what happened when you $touchAndMove('3C')
				expect(game.$touchAndMove('3C').previousAction.text).not.toBe('move ch⡂ 3C→2C');
				expect(game.moveByShorthand('c3').$touchAndMove('3C').previousAction.text).not.toBe('move ch⡂ 3C→2C');

				// we don't want to put up 3C because… 3S is not available to stack
				const gameResult = game.$touchAndMove('3C');
				expect(gameResult.previousAction.text).toBe('move c3 3C→cascade');

				// because the next move we want is
				const gameNext = gameResult.$touchAndMove('2H');
				expect(gameNext.previousAction.text).toBe('move d3⡀ 2H→3C');
				expect(gameNext.print()).toBe(
					'' + //
						' 7S 7D       2S AD 2C    \n' +
						' KH KD>3C QS 7C KS 3H 2D \n' +
						' AH 8H 2H JD 6H KC 8S 5S \n' +
						' 4D 3S    TS 5C QD 4H TC \n' +
						' 8D 4S    9D    JS QC 5H \n' +
						' 6D 6S          TD JH 9H \n' +
						' 8C QH                9S \n' +
						' 7H JC                   \n' +
						' 6C TH                   \n' +
						' 5D 9C                   \n' +
						' 4C                      \n' +
						' 3D                      \n' +
						' move d3 2H→3C'
				);
			});

			test('traced #10712', () => {
				const gameExample = FreeCell.parse(
					'' + //
						' KS TH       2H 3D 4C    \n' +
						' 4S    8S 9C KC 8D 3H JC \n' +
						' 5D    7D AS QC 7C 2S 6C \n' +
						' TS    6S KH 7H 6H    9H \n' +
						' JD    5H KD    5S    QS \n' +
						' QH       TC    4H    JH \n' +
						' QD       9D             \n' +
						' JS       8C             \n' +
						' TD                      \n' +
						' 9S                      \n' +
						' 8H                      \n' +
						' 7S                      \n' +
						' 6D                      \n' +
						' 5C                      \n' +
						' 4D                      \n' +
						' 3S                      \n' +
						' move 5h 4C→3C\n' +
						':h shuffle32 10712\n' +
						' 38 6a 81 6b 6c 61 31 31 \n' +
						' 53 68 81 b8 2h 42 34 7b \n' +
						' 7d a6 36 c3 26 2a 32 b3 \n' +
						' 23 21 d1 5b 5h '
				);
				expect(gameExample.history.length).toBe(31);
				// in a previous life, this is what happened when you $touchAndMove('4C')
				expect(gameExample.previousAction.text).toBe('move 5⡃h⡂ 4C→3C');

				const game = gameExample.undo();
				expect(game.previousAction.text).toBe('move 5⡄b TH→cell');
				expect(availableMovesMinimized(game.touchByPile('5').availableMoves, true)).toEqual([
					['c', 'cell:empty', -1],
					['d', 'cell:empty', -1],
					['h⡂', 'foundation:any', -1],
					['2', 'cascade:empty', -1],
					['3⡃', 'cascade:sequence', 11],
				]);
				expect(game.moveByShorthand('5c').previousAction.text).toBe('move 5⡃c 4C→cell');
				expect(game.moveByShorthand('5d').previousAction.text).toBe('move 5⡃d 4C→cell');
				expect(game.moveByShorthand('5h').previousAction.text).toBe('move 5⡃h⡂ 4C→3C');
				expect(game.moveByShorthand('52').previousAction.text).toBe('move 5⡃2 4C→cascade');
				expect(game.moveByShorthand('53').previousAction.text).toBe('move 5⡃3⡃ 4C→5H');

				// we don't want to put up 4C because… 4S is not available to stack
				const gameResult = game.$touchAndMove('4C');
				expect(gameResult.previousAction.text).toBe('move 5⡃3⡃ 4C→5H');

				// because the next move we want is
				const gameNext = gameResult.$touchAndMove('3H');
				expect(gameNext.previousAction.text).toBe('move 7⡀3⡄ 3H-2S→4C');
				expect(gameNext.print()).toBe(
					'' + //
						' KS TH       2H 3D 3C    \n' +
						' 4S    8S 9C KC 8D    JC \n' +
						' 5D    7D AS QC 7C    6C \n' +
						' TS    6S KH 7H 6H    9H \n' +
						' JD    5H KD    5S    QS \n' +
						' QH   >4C TC    4H    JH \n' +
						' QD    3H 9D             \n' +
						' JS    2S 8C             \n' +
						' TD                      \n' +
						' 9S                      \n' +
						' 8H                      \n' +
						' 7S                      \n' +
						' 6D                      \n' +
						' 5C                      \n' +
						' 4D                      \n' +
						' 3S                      \n' +
						' move 73 3H-2S→4C'
				);
			});

			test('traced #27521', () => {
				const gameExample = FreeCell.parse(
					'' + //
						' 7S    JH    3D          \n' +
						' TH 7D 8D 5S KH 9C JS 9S \n' +
						' KS 8S TD 4C QS KC AS 8H \n' +
						' 9D 5H 4D 6D JD QD QH 7C \n' +
						' 6S    AC 3C TC JC AH    \n' +
						' 2C    4S    9H    KD    \n' +
						' TS    6H    8C    QC    \n' +
						' 3H    5C    7H          \n' +
						' 2S    4H    6C          \n' +
						'       3S    5D          \n' +
						'       2H                \n' +
						' move 4h 3D→2D\n' +
						':h shuffle32 27521\n' +
						' 6a 5b 56 5c 56 5d c5 45 \n' +
						' b4 d4 5b 5c a5 65 6a 6d \n' +
						' c6 b6 85 3b 83 8c 82 a2 \n' +
						' 8a 81 d8 b8 a8 23 7a 27 \n' +
						' 25 45 4h '
				);
				expect(gameExample.history.length).toBe(37);
				// in a previous life, this is what happened when you $touchAndMove('3D')
				expect(gameExample.previousAction.text).toBe('move 4⡄h⡀ 3D→2D');

				const game = gameExample.undo();
				expect(game.previousAction.text).toBe('move 4⡅5⡅ 7H-6C-5D→8C');
				expect(availableMovesMinimized(game.touchByPile('4').availableMoves, true)).toEqual([
					['b', 'cell:empty', 3],
					['d', 'cell:empty', 1],
					['h⡀', 'foundation:any', -1],
				]);
				expect(game.moveByShorthand('4b').previousAction.text).toBe('move 4⡄b 3D→cell');
				expect(game.moveByShorthand('4d').previousAction.text).toBe('move 4⡄d 3D→cell');
				expect(game.moveByShorthand('4h').previousAction.text).toBe('move 4⡄h⡀ 3D→2D');

				// we still need 3D in play because we may need it to stack 2C,2S; they cannot auto-foundation yet
				const gameResult = game.$touchAndMove('3D');
				expect(gameResult.previousAction.text).toBe('move 4⡄b 3D→cell');
				expect(gameResult.print()).toBe(
					'' + //
						' 7S>3D JH    2D          \n' +
						' TH 7D 8D 5S KH 9C JS 9S \n' +
						' KS 8S TD 4C QS KC AS 8H \n' +
						' 9D 5H 4D 6D JD QD QH 7C \n' +
						' 6S    AC 3C TC JC AH    \n' +
						' 2C    4S    9H    KD    \n' +
						' TS    6H    8C    QC    \n' +
						' 3H    5C    7H          \n' +
						' 2S    4H    6C          \n' +
						'       3S    5D          \n' +
						'       2H                \n' +
						' move 4b 3D→cell'
				);
			});

			test('traced #30255', () => {
				const gameExample = FreeCell.parse(
					'' + //
						' JS 3C 6D    2H 4S 3D    \n' +
						' 4H 6H 9C 7S AC TC KC    \n' +
						' TH 5C 8H 7C 5H KH       \n' +
						' KS 4D    4C 7H 5S       \n' +
						' QD       QH JH 9D       \n' +
						' JC       QC KD 8S       \n' +
						' TD       6C QS          \n' +
						' 9S       3H JD          \n' +
						' 8D       2C TS          \n' +
						'             9H          \n' +
						'             8C          \n' +
						'             7D          \n' +
						'             6S          \n' +
						'             5D          \n' +
						' move 8h 4S→3S\n' +
						':h shuffle32 30255\n' +
						' 27 75 27 32 1a 18 31 35 \n' +
						' 85 35 3b 23 25 65 27 24 \n' +
						' 8c 78 78 a2 7h 72 12 16 \n' +
						' 81 87 8a 8h '
				);
				expect(gameExample.history.length).toBe(30);
				// in a previous life, this is what happened when you $touchAndMove('4S')
				expect(gameExample.previousAction.text).toBe('move 8⡀h⡁ 4S→3S');

				const game = gameExample.undo();
				expect(game.previousAction.text).toBe('move 8⡁a JS→cell');
				expect(availableMovesMinimized(game.touchByPile('8').availableMoves, true)).toEqual([
					['d', 'cell:empty', -1],
					['h⡁', 'foundation:any', -1],
					['5⡌', 'cascade:sequence', 9],
				]);
				expect(game.moveByShorthand('8d').previousAction.text).toBe('move 8⡀d 4S→cell');
				expect(game.moveByShorthand('8h').previousAction.text).toBe('move 8⡀h⡁ 4S→3S');
				expect(game.moveByShorthand('85').previousAction.text).toBe('move 8⡀5⡌ 4S→5D');

				// there is a 4C around, but it's not available yet
				const gameResult = game.$touchAndMove('4S');
				expect(gameResult.previousAction.text).toBe('move 8⡀5⡌ 4S→5D');

				// because the next move we want is
				const gameNext = gameResult.$touchAndMove('3H');
				expect(gameNext.previousAction.text).toBe('move 4⡆5⡍ 3H-2C→4S');
				expect(gameNext.print()).toBe(
					'' + //
						' JS 3C 6D    2H 3S 3D    \n' +
						' 4H 6H 9C 7S AC TC KC    \n' +
						' TH 5C 8H 7C 5H KH       \n' +
						' KS 4D    4C 7H 5S       \n' +
						' QD       QH JH 9D       \n' +
						' JC       QC KD 8S       \n' +
						' TD       6C QS          \n' +
						' 9S          JD          \n' +
						' 8D          TS          \n' +
						'             9H          \n' +
						'             8C          \n' +
						'             7D          \n' +
						'             6S          \n' +
						'             5D          \n' +
						'            >4S          \n' +
						'             3H          \n' +
						'             2C          \n' +
						' move 45 3H-2C→4S'
				);
			});
		});

		describe('bugfix: not greedy enough', () => {
			test('traced #4335 b', () => {
				const gameExample = FreeCell.parse(
					'' + //
						'    9D 5H 5S AS 3C 2H 2D \n' +
						' KH KD       2S KS 3H    \n' +
						' QS 8H       7C KC 8S    \n' +
						' JH 3S       6H QD 4H    \n' +
						' TC 4S       TS JS QC    \n' +
						' 9H 6S       7D TD JD    \n' +
						' 8C QH       6C 9C       \n' +
						' 7H JC       5D 8D       \n' +
						'    TH       4C 7S       \n' +
						'    9S       3D 6D       \n' +
						'                5C       \n' +
						'                4D       \n' +
						' move a5 3D→4C\n' +
						':h shuffle32 4335\n' +
						' 83 32 18 3a 3b 13 31 12 \n' +
						' 16 35 4c 41 41 54 62 c6 \n' +
						' 65 46 45 4h 76 26 47 84 \n' +
						' 8c 81 41 8d a5 '
				);
				expect(gameExample.history.length).toBe(31);
				// in a previous life, this is what happened when you $touchAndMove('4C')
				expect(gameExample.previousAction.text).toBe('move a5⡇ 3D→4C');

				const game = gameExample.undo();
				expect(game.previousAction.text).toBe('move 8⡁d 5S→cell (auto-foundation 8 2D)');
				expect(availableMovesMinimized(game.touchByPile('a').availableMoves, true)).toEqual([
					['h⡃', 'foundation:any', 1],
					['3', 'cascade:empty', -1],
					['4', 'cascade:empty', -1],
					['5⡇', 'cascade:sequence', -1],
					['8', 'cascade:empty', -1],
				]);
				expect(game.moveByShorthand('ah').previousAction.text).toBe('move ah⡃ 3D→2D');
				expect(game.moveByShorthand('a3').previousAction.text).toBe('move a3 3D→cascade');
				expect(game.moveByShorthand('a4').previousAction.text).toBe('move a4 3D→cascade');
				expect(game.moveByShorthand('a5').previousAction.text).toBe('move a5⡇ 3D→4C');
				expect(game.moveByShorthand('a8').previousAction.text).toBe('move a8 3D→cascade');

				const gameResult = game.$touchAndMove('3D');
				expect(gameResult.previousAction.text).toBe('move ah⡃ 3D→2D');
				expect(gameResult.print()).toBe(
					'' + //
						'    9D 5H 5S AS 3C 2H>3D \n' +
						' KH KD       2S KS 3H    \n' +
						' QS 8H       7C KC 8S    \n' +
						' JH 3S       6H QD 4H    \n' +
						' TC 4S       TS JS QC    \n' +
						' 9H 6S       7D TD JD    \n' +
						' 8C QH       6C 9C       \n' +
						' 7H JC       5D 8D       \n' +
						'    TH       4C 7S       \n' +
						'    9S          6D       \n' +
						'                5C       \n' +
						'                4D       \n' +
						' move ah 3D→2D'
				);
			});

			test('traced #28307', () => {
				const gameExample = FreeCell.parse(
					'' + //
						'    8D JS    4H 2S 3C 3D \n' +
						'    QD 4D 9D JD KH 7C TS \n' +
						'    8C 6D 6C QH QC 5D 4C \n' +
						'    KD 6H JC 8H    KS KC \n' +
						'    7H 4S 3S QS    9C 5H \n' +
						'    TH 9S 5C 9H    5S 7S \n' +
						'       TD    8S       6S \n' +
						'       JH    7D          \n' +
						'       TC                \n' +
						' move ah 4H→3H\n' +
						':h shuffle32 28307\n' +
						' 6a 63 16 15 45 1b 1c 1h \n' +
						' ah '
				);
				expect(gameExample.history.length).toBe(11);
				// this is the desired behavior
				expect(gameExample.previousAction.text).toBe('move ah⡀ 4H→3H');

				const game = gameExample.undo();
				expect(game.previousAction.text).toBe('move 1⡁h⡂ 3C→2C (auto-foundation 14 2D,3D)');
				expect(availableMovesMinimized(game.touchByPile('a').availableMoves, true)).toEqual([
					['d', 'cell:empty', -1],
					['h⡀', 'foundation:any', 4],
					['1', 'cascade:empty', -1],
					['4⡄', 'cascade:sequence', -1],
					['7⡄', 'cascade:sequence', -1],
				]);
				expect(game.moveByShorthand('ad').previousAction.text).toBe('move ad 4H→cell');
				expect(game.moveByShorthand('ah').previousAction.text).toBe('move ah⡀ 4H→3H');
				expect(game.moveByShorthand('a1').previousAction.text).toBe('move a1 4H→cascade');
				expect(game.moveByShorthand('a4').previousAction.text).toBe('move a4⡄ 4H→5C');
				expect(game.moveByShorthand('a7').previousAction.text).toBe('move a7⡄ 4H→5S');

				expect(game.$touchAndMove('4H').previousAction.text).toBe('move ah⡀ 4H→3H');

				const gameFurtherBack = game.undo();
				expect(gameFurtherBack.print()).toBe(
					'' + //
						' 4H 8D>JS    3H 2S 2C AD \n' +
						' 2D QD 4D 9D JD KH 7C TS \n' +
						' 3C 8C 6D 6C QH QC 5D 4C \n' +
						'    KD 6H JC 8H    KS KC \n' +
						'    7H 4S 3S QS    9C 5H \n' +
						'    TH 9S 5C 9H    5S 7S \n' +
						'       TD 3D 8S       6S \n' +
						'       JH    7D          \n' +
						'       TC                \n' +
						' move 1c JS→cell'
				);

				// here, it shouldn't go up yet, since we _might_ need to stack 4H-3S-2D
				expect(gameFurtherBack.moveByShorthand('a4').previousAction.text).toBe('invalid move a4⡅ 4H→3D');
				expect(gameFurtherBack.moveByShorthand('a7').previousAction.text).toBe('move a7⡄ 4H→5S');
				expect(gameFurtherBack.moveByShorthand('ah').previousAction.text).toBe('move ah⡀ 4H→3H');
				expect(gameFurtherBack.$touchAndMove('4H').previousAction.text).toBe('move a7⡄ 4H→5S');
			});
		});
	});

	/**
		the situations where this is useful is vanishing small
		it may be where we want the cards (roughly, for some styles of play)
		more often than not it feels wrong or jarring
		we collapse consecutive moves, so it's not like it impacts history
		the implemenation is easy, but it's not trivial
		all in all, it's just not with it

		const useRightJustify =
			// kings
			moving_card.rank === 'king' &&
			// going to an empty cascade
			moveDestinationType === 'cascade:empty' &&
			// from "not the cascades" (cell, foundation, deck)
			// from the cascades, but not already at the root
			(moving_card.location.data.at(1) === undefined || moving_card.location.data.at(1) !== 0);

		@see linearAvailableMovesPriority
		@see closestAvailableMovesPriority
	*/
	describe('deprecated king→cascade:empty rightJustifyAvailableMovesPriority', () => {
		describe('MoveSourceType', () => {
			test('deck', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						':d>KH|\n' +
						' hand-jammed'
				);
				expect(game.selection).toEqual({
					location: { fixture: 'deck', data: [0] },
					cards: [{ rank: 'king', suit: 'hearts', location: { fixture: 'deck', data: [0] } }],
					peekOnly: true,
				});
				// cannot move from the deck
				expect(availableMovesMinimized(game.availableMoves)).toEqual([]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						':d>KH|\n' +
						' peek k KH'
				);
				// unless we use a game function
				expect(game.clearSelection().moveByShorthand('k1', { gameFunction: 'recall-or-bury' }).print()).toBe(
					'' + //
						'             KC KD TH KS \n' +
						'>KH       JH             \n' +
						'          QH             \n' +
						' invalid move k1 KH→cascade'
				);
			});

			test('cell', () => {
				const game = FreeCell.parse(
					'' + //
						'>KH|         KC KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						' hand-jammed'
				);
				// this is what it would be if we were to implement it
				// (this is what it was when did for a hot second)
				expect(availableMovesMinimized(game.availableMoves)).not.toEqual([
					['1', 1],
					['2', 2],
					['3', 3],
					['5', 5],
					['6', 6],
					['7', 7],
					['8', 8],
				]);
				expect(game.clearSelection().$touchAndMove().print()).not.toBe(
					'' + //
						'             KC KD TH KS \n' +
						'          JH         >KH \n' +
						'          QH             \n' +
						' move a8 KH→cascade'
				);
				// instead, just keep the status quo
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1', 16],
					['2', 14],
					['3', 12],
					['5', 8],
					['6', 6],
					['7', 4],
					['8', 2],
				]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH KS \n' +
						'>KH       JH             \n' +
						'          QH             \n' +
						' move a1 KH→cascade'
				);
			});

			test('foundation', () => {
				const game = FreeCell.parse(
					'' + //
						' KH         >KC|KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						' hand-jammed'
				);
				expect(game.selection).toEqual({
					location: { fixture: 'foundation', data: [0] },
					cards: [{ rank: 'king', suit: 'clubs', location: { fixture: 'foundation', data: [0] } }],
					peekOnly: true,
				});
				// cannot move off the foundation
				expect(availableMovesMinimized(game.availableMoves)).toEqual([]);
				// cannot select the foundation
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						' KH         >KC KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						' touch stop'
				);
				// unless we have a special flag
				expect(game.clearSelection().touch({ allowSelectFoundation: true }).print()).toBe(
					'' + //
						' KH         >KC|KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						' peek h KC'
				);
			});

			test('cascade:single (∈ cascade:empty)', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC KD TH KS \n' +
						'>KH|      JH             \n' +
						'          QH             \n' +
						' hand-jammed'
				);
				// no (king already on root)
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['2', 15],
					['3', 14],
					['5', 12],
					['6', 11],
					['7', 10],
					['8', 9],
				]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH KS \n' +
						'   >KH    JH             \n' +
						'          QH             \n' +
						' move 12 KH→cascade'
				);
			});

			test('cascade:single (∈ cascade:sequence)', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC KD TH KS \n' +
						'          JH             \n' +
						'          QH             \n' +
						'         >KH|            \n' +
						' hand-jammed'
				);
				// this is what it would be if we were to implement it
				// (this is what it was when did for a hot second)
				expect(availableMovesMinimized(game.availableMoves)).not.toEqual([
					['1', 1],
					['2', 2],
					['3', 3],
					['5', 5],
					['6', 6],
					['7', 7],
					['8', 8],
				]);
				expect(game.clearSelection().$touchAndMove().print()).not.toBe(
					'' + //
						'             KC KD TH KS \n' +
						'          JH         >KH \n' +
						'          QH             \n' +
						' move 48 KH→cascade'
				);
				// instead, just keep the status quo
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1', 9],
					['2', 11],
					['3', 13],
					['5', 14],
					['6', 12],
					['7', 10],
					['8', 8],
				]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH KS \n' +
						'          JH>KH          \n' +
						'          QH             \n' +
						' move 45 KH→cascade'
				);
			});

			test('cascade:sequence (∈ cascade:empty)', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC KD TH JS \n' +
						'   >KH|   JH KS          \n' +
						'   |QS|   QH             \n' +
						' hand-jammed'
				);
				// no (king already on root)
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1', 8],
					['3', 14],
					['6', 11],
					['7', 10],
					['8', 9],
				]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH JS \n' +
						'      >KH JH KS          \n' +
						'       QS QH             \n' +
						' move 23 KH-QS→cascade'
				);
			});

			test('cascade:sequence (∈ cascade:sequence)', () => {
				const game = FreeCell.parse(
					'' + //
						'             KC KD TH JS \n' +
						'          JH KS          \n' +
						'          QH>KH|         \n' +
						'            |QS|         \n' +
						' hand-jammed'
				);
				// this is what it would be if we were to implement it
				// (this is what it was when did for a hot second)
				expect(availableMovesMinimized(game.availableMoves)).not.toEqual([
					['1', 1],
					['2', 2],
					['3', 3],
					['6', 6],
					['7', 7],
					['8', 8],
				]);
				expect(game.clearSelection().$touchAndMove().print()).not.toBe(
					'' + //
						'             KC KD TH JS \n' +
						'          JH KS      >KH \n' +
						'          QH          QS \n' +
						' move 58 KH-QS→cascade'
				);
				// instad, just keep the status quo
				expect(availableMovesMinimized(game.availableMoves)).toEqual([
					['1', 7],
					['2', 9],
					['3', 11],
					['6', 14],
					['7', 12],
					['8', 10],
				]);
				expect(game.clearSelection().$touchAndMove().print()).toBe(
					'' + //
						'             KC KD TH JS \n' +
						'          JH KS>KH       \n' +
						'          QH    QS       \n' +
						' move 56 KH-QS→cascade'
				);
			});
		});
	});
});
