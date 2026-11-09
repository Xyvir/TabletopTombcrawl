import { omit as _omit } from 'lodash';
import { describe, expect, test } from 'vitest';
import { FreeCell } from '@/game/game';

describe('game.$checkCanFlourish', () => {
	test('noop', () => {
		const game = new FreeCell().shuffle32(3).dealAll();
		expect(game.$checkCanFlourish()).toBe(game);
	});

	// this is bad form if it happens in practice
	// but if it does, well, the game state should be the same
	// but between the dealAll and $checkCanFlourish, it might happen
	test('twice in a row', () => {
		const once = new FreeCell().shuffle32(5).dealAll().$checkCanFlourish();
		const twice = once.$checkCanFlourish();
		expect(once).not.toBe(twice);
		expect(once).toEqual(twice);
	});

	// it would be _fun_ but it's way too much optional-complexity to support selection+flashCards
	test('skips if selection', () => {
		const game = new FreeCell().shuffle32(5).dealAll().touchByPile('1').$checkCanFlourish();
		expect(game.print()).toBe(
			'' + //
				'                         \n' +
				' AH 8S 2D QS 4C 9H 2S 3D \n' +
				' 5C AS 9C KH 4D 2C 3C 4S \n' +
				' 3S 5D KC 3H KD 5H 6S 8D \n' +
				' TD 7S JD 7H 8H JH JC 7D \n' +
				' 5S QH 8C 9D KS QD 4H AC \n' +
				' 2H TC TH 6D 6H 6C QC JS \n' +
				'>9S|AD 7C TS             \n' +
				' select 1 9S'
		);

		// TODO (motivation) (flourish-anim) if we refresh page, we want to keep the selection
		expect(FreeCell.parse(game.print()).$checkCanFlourish().print()).toEqual(game.print());
		// expect(FreeCell.parse(game.print({ includeHistory: true })).$checkCanFlourish().print()).toEqual(game.print());
		expect(
			FreeCell.parse(game.print({ includeHistory: true }))
				.$checkCanFlourish()
				.print()
		).toEqual(
			'' + //
				'>                        \n' +
				'*AH*8S 2D QS 4C 9H 2S 3D \n' +
				' 5C*AS*9C KH 4D 2C 3C 4S \n' +
				' 3S 5D KC 3H KD 5H 6S 8D \n' +
				' TD 7S JD 7H 8H JH JC 7D \n' +
				' 5S QH 8C 9D KS QD 4H AC \n' +
				' 2H TC TH 6D 6H 6C QC JS \n' +
				' 9S AD 7C TS             \n' +
				' juice flash AH,AS'
		);
	});

	describe('check-can-flourish', () => {
		test('deep check', () => {
			let game = new FreeCell().shuffle32(5).dealAll();
			expect(game.print()).toBe(
				'' + //
					'>                        \n' +
					' AH 8S 2D QS 4C 9H 2S 3D \n' +
					' 5C AS 9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' deal all cards'
			);
			game = game.$checkCanFlourish();
			// mark canFlourish
			expect(game.print()).toBe(
				'' + //
					'>                        \n' +
					'*AH*8S 2D QS 4C 9H 2S 3D \n' +
					' 5C*AS*9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' juice flash AH,AS'
			);
			expect(game.print({ includeHistory: true })).toBe(
				'' + //
					'                         \n' +
					' AH 8S 2D QS 4C 9H 2S 3D \n' +
					' 5C AS 9C KH 4D 2C 3C 4S \n' +
					' 3S 5D KC 3H KD 5H 6S 8D \n' +
					' TD 7S JD 7H 8H JH JC 7D \n' +
					' 5S QH 8C 9D KS QD 4H AC \n' +
					' 2H TC TH 6D 6H 6C QC JS \n' +
					' 9S AD 7C TS             \n' +
					' deal all cards\n' +
					':h shuffle32 5'
			);
			expect(_omit(game, 'cards', 'deck', 'cells', 'foundations', 'tableau')).toMatchSnapshot();

			// make sure the parse game is the same-ish (and doesn't blow up)
			let copy = game.__copy();
			expect(copy).not.toBe(game);
			expect(copy.flashCards).toBe(game.flashCards);
			expect(copy.previousAction).not.toBe(game.previousAction);
			expect(copy.history).not.toBe(game.history);
			expect(copy).toEqual(game);
			let parsed = FreeCell.parse(game.print());
			// parsed is missing some info
			expect(parsed.flashCards).toEqual([
				{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [0, 0] } },
				{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
			]);
			expect(parsed.history).toEqual(['init without history']);
			expect(parsed.previousAction).toEqual({
				text: 'juice flash AH,AS',
				type: 'juice',
				gameFunction: 'check-can-flourish',
			});
			expect(copy.flashCards).toEqual([
				{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [0, 0] } },
				{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
			]);
			expect(copy.previousAction).toEqual({
				text: 'juice flash AH,AS',
				type: 'juice',
				gameFunction: 'check-can-flourish',
			});
			expect(copy.history).toEqual(['shuffle deck (5)', 'deal all cards']);

			expect(copy).toEqual(game);
			expect(_omit(parsed, 'history')).toEqual(_omit(copy, 'history'));
			expect(_omit(parsed, 'history')).toEqual(_omit(game, 'history'));

			// make sure the parse game is the same-ish (and doesn't blow up)
			copy = game.__copy();
			expect(copy).not.toBe(game);
			expect(copy.flashCards).toBe(game.flashCards);
			expect(copy.previousAction).not.toBe(game.previousAction);
			expect(copy.history).not.toBe(game.history);
			expect(copy).toEqual(game);
			parsed = FreeCell.parse(game.print({ includeHistory: true }));
			// parsed is missing some info
			expect(parsed.flashCards).toBe(null);
			expect(parsed.history).toEqual(['shuffle deck (5)', 'deal all cards']);
			expect(parsed.previousAction).toEqual({
				text: 'deal all cards',
				type: 'deal',
			});
			expect(copy.flashCards).toEqual([
				{ rank: 'ace', suit: 'hearts', location: { fixture: 'cascade', data: [0, 0] } },
				{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [1, 1] } },
			]);
			expect(copy.previousAction).toEqual({
				text: 'juice flash AH,AS',
				type: 'juice',
				gameFunction: 'check-can-flourish',
			});
			expect(copy.history).toEqual(['shuffle deck (5)', 'deal all cards']);

			expect(copy).toEqual(game);
			expect(_omit(parsed, 'history', 'previousAction', 'flashCards')).toEqual(_omit(copy, 'history', 'previousAction', 'flashCards'));
			expect(_omit(parsed, 'history', 'previousAction', 'flashCards')).toEqual(_omit(game, 'history', 'previousAction', 'flashCards'));
		});

		describe('does not impact game', () => {
			test('move w/w/o', () => {
				const withJuice = new FreeCell().shuffle32(5).dealAll().$checkCanFlourish().moveByShorthand('53');
				const withoutJuice = new FreeCell()
					.shuffle32(5)
					.dealAll()
					// does not include $checkCanFlourish
					.moveByShorthand('53');
				expect(withJuice).toEqual(withoutJuice);
				expect(withJuice.print()).toBe(
					'' + //
						'             AD          \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D    6C QC JS \n' +
						' 9S   >7C TS             \n' +
						'       6H                \n' +
						' move 53 6H→7C (auto-foundation 2 AD)'
				);
			});

			test('undo after move', () => {
				const withJuice = new FreeCell().shuffle32(5).dealAll().$checkCanFlourish().moveByShorthand('53').undo();
				const withoutJuice = new FreeCell()
					.shuffle32(5)
					.dealAll()
					// does not include $checkCanFlourish
					.moveByShorthand('53')
					.undo();
				expect(withJuice).toEqual(withoutJuice);
				expect(withJuice.print()).toBe(
					'' + //
						'>                        \n' +
						' AH 8S 2D QS 4C 9H 2S 3D \n' +
						' 5C AS 9C KH 4D 2C 3C 4S \n' +
						' 3S 5D KC 3H KD 5H 6S 8D \n' +
						' TD 7S JD 7H 8H JH JC 7D \n' +
						' 5S QH 8C 9D KS QD 4H AC \n' +
						' 2H TC TH 6D 6H 6C QC JS \n' +
						' 9S AD 7C TS             \n' +
						' deal all cards'
				);
			});

			test('undo during', () => {
				const withJuice = new FreeCell()
					.shuffle32(5)
					.dealAll()
					.$checkCanFlourish()
					// no move, just an undo
					.undo();
				const withoutJuice = new FreeCell()
					.shuffle32(5)
					.dealAll()
					// does not include $checkCanFlourish
					.undo();
				expect(withJuice).toEqual(withoutJuice);
				expect(withJuice.print()).toBe(
					'' + //
						'                         \n' +
						'                         \n' +
						':d>AH 8S 2D QS 4C 9H 2S 3D 5C AS 9C KH 4D 2C 3C 4S 3S 5D KC 3H KD 5H 6S 8D TD 7S JD 7H 8H JH JC 7D 5S QH 8C 9D KS QD 4H AC 2H TC TH 6D 6H 6C QC JS 9S AD 7C TS \n' +
						' shuffle deck (5)'
				);
			});
		});
	});

	describe('check-can-flourish52', () => {
		test('deep check', () => {
			let game = new FreeCell().shuffle32(23190).dealAll();
			expect(game.print()).toBe(
				'' + //
					'>                        \n' +
					' TS 6C AC 3C 4C 2C 3H 4H \n' +
					' JD AH AD 6S QC 4S 8H 6D \n' +
					' 2D 3D AS TC 3S 5S TH TD \n' +
					' JH 8D 8S JC KD 9C 7H 9H \n' +
					' 2S 7S 7C 5D 4D KH QH 8C \n' +
					' QD 5H 5C 2H KS JS QS 9D \n' +
					' 6H 9S KC 7D             \n' +
					' deal all cards'
			);
			game = game.$checkCanFlourish();
			// mark canFlourish
			expect(game.print()).toBe(
				'' + //
					'>                        \n' +
					' TS 6C AC 3C 4C 2C 3H 4H \n' +
					' JD AH AD 6S QC 4S 8H 6D \n' +
					' 2D 3D*AS*TC 3S 5S TH TD \n' +
					' JH 8D 8S JC KD 9C 7H 9H \n' +
					' 2S 7S 7C 5D 4D KH QH 8C \n' +
					' QD 5H 5C 2H KS JS QS 9D \n' +
					' 6H 9S KC 7D             \n' +
					' juice flash *AS*'
			);
			expect(game.print({ includeHistory: true })).toBe(
				'' + //
					'                         \n' +
					' TS 6C AC 3C 4C 2C 3H 4H \n' +
					' JD AH AD 6S QC 4S 8H 6D \n' +
					' 2D 3D AS TC 3S 5S TH TD \n' +
					' JH 8D 8S JC KD 9C 7H 9H \n' +
					' 2S 7S 7C 5D 4D KH QH 8C \n' +
					' QD 5H 5C 2H KS JS QS 9D \n' +
					' 6H 9S KC 7D             \n' +
					' deal all cards\n' +
					':h shuffle32 23190'
			);
			expect(_omit(game, 'cards', 'deck', 'cells', 'foundations', 'tableau')).toMatchSnapshot();

			// make sure the parse game is the same-ish (and doesn't blow up)
			let copy = game.__copy();
			let parsed = FreeCell.parse(game.print());
			// parsed is missing some info
			expect(parsed.flashCards).toEqual([{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [2, 2] } }]);
			expect(parsed.history).toEqual(['init without history']);
			expect(parsed.previousAction).toEqual({
				text: 'juice flash *AS*',
				type: 'juice',
				gameFunction: 'check-can-flourish52',
			});
			expect(copy.flashCards).toEqual([{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [2, 2] } }]);
			expect(copy.previousAction).toEqual({
				text: 'juice flash *AS*',
				type: 'juice',
				gameFunction: 'check-can-flourish52',
			});
			expect(copy.history).toEqual(['shuffle deck (23190)', 'deal all cards']);

			expect(copy).toEqual(game);
			expect(_omit(parsed, 'history')).toEqual(_omit(copy, 'history'));
			expect(_omit(parsed, 'history')).toEqual(_omit(game, 'history'));

			// make sure the parse game is the same-ish (and doesn't blow up)
			copy = game.__copy();
			parsed = FreeCell.parse(game.print({ includeHistory: true }));
			// parsed is missing some info
			expect(parsed.flashCards).toBe(null);
			expect(parsed.history).toEqual(['shuffle deck (23190)', 'deal all cards']);
			expect(parsed.previousAction).toEqual({
				text: 'deal all cards',
				type: 'deal',
			});
			expect(copy.flashCards).toEqual([{ rank: 'ace', suit: 'spades', location: { fixture: 'cascade', data: [2, 2] } }]);
			expect(copy.previousAction).toEqual({
				text: 'juice flash *AS*',
				type: 'juice',
				gameFunction: 'check-can-flourish52',
			});
			expect(copy.history).toEqual(['shuffle deck (23190)', 'deal all cards']);

			expect(copy).toEqual(game);
			expect(_omit(parsed, 'history', 'previousAction', 'flashCards')).toEqual(_omit(copy, 'history', 'previousAction', 'flashCards'));
			expect(_omit(parsed, 'history', 'previousAction', 'flashCards')).toEqual(_omit(game, 'history', 'previousAction', 'flashCards'));
		});
	});
});
