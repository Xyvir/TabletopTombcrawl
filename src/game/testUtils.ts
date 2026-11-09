import { gsap } from 'gsap/all';
import { type Mock, vi } from 'vitest';
import { shorthandLocation, shorthandPile } from '@/game/card/card';
import { AvailableMove } from '@/game/move/move';

export function spyOnGsap(_gsap: typeof gsap) {
	const gsapToSpy = vi.spyOn(_gsap, 'to');
	const gsapSetSpy = vi.spyOn(_gsap, 'set');
	const gsapFromSpy = vi.spyOn(_gsap, 'from');
	const fromToSpy = vi.fn();
	const toSpy = vi.fn();
	const setSpy = vi.fn();
	const addLabelSpy = vi.fn();
	const addSpy = vi.fn();
	const timeScaleSpy = vi.fn();
	const killTweensOfSpy = vi.fn();
	let timelineOnComplete: gsap.Callback | undefined;
	const consoleDebugSpy = vi.mocked(console.debug); // mocked in `test_mocks` be we want it as a standard check here

	vi.spyOn(_gsap, 'timeline').mockImplementation((vars: gsap.TimelineVars | undefined) => {
		timelineOnComplete = vars?.onComplete;
		const timelineMock: unknown = {
			fromTo: fromToSpy,
			to: toSpy,
			set: setSpy,
			addLabel: addLabelSpy,
			add: addSpy,
			timeScale: timeScaleSpy,
			killTweensOf: killTweensOfSpy,
		};
		return timelineMock as gsap.core.Timeline;
	});

	function mockReset(runOnComplete = true) {
		if (timelineOnComplete && runOnComplete) {
			timelineOnComplete();
		}

		gsapToSpy.mockReset();
		gsapSetSpy.mockReset();
		gsapFromSpy.mockReset();
		fromToSpy.mockReset();
		toSpy.mockReset();
		setSpy.mockReset();
		addLabelSpy.mockReset();
		addSpy.mockReset();
		timeScaleSpy.mockReset();
		killTweensOfSpy.mockReset();
		consoleDebugSpy.mockReset();
	}

	function mockCallTimes(): Record<string, number> {
		return Object.entries({
			gsapToSpy,
			gsapSetSpy,
			gsapFromSpy,
			fromToSpy,
			toSpy,
			setSpy,
			addLabelSpy,
			addSpy,
			timeScaleSpy,
			killTweensOfSpy,
			consoleDebugSpy,
		} as Record<string, Mock>).reduce<Record<string, number>>((acc, [key, spy]) => {
			const length = spy.mock.calls.length;
			if (length > 0) {
				acc[key] = length;
			}
			return acc;
		}, {});
	}

	// REVIEW (techdebt) can we add more helper functions and remove the spies?
	return {
		// gsap spies
		gsapToSpy,
		gsapSetSpy,
		gsapFromSpy,
		fromToSpy,
		toSpy,
		setSpy,
		addLabelSpy,
		addSpy,
		timeScaleSpy,
		killTweensOfSpy,
		// others
		timelineOnComplete,
		consoleDebugSpy,
		// helper functions
		mockReset,
		mockCallTimes,
	};
}

export function getCardIdsFromSpy(spy: Mock): string[] {
	return spy.mock.calls.map(([cardIdSelector]) => cardIdSelector as string);
}

export function getPropertiesFromSpy(spy: Mock): Record<string, number> {
	return accumulateGsapTweenVars(
		spy.mock.calls.map(([, properties]) => properties as gsap.TweenVars)
	);
}
export function getPropertiesFromFromToSpy(spy: Mock): {
	from: Record<string, number>;
	to: Record<string, number>;
} {
	const from = accumulateGsapTweenVars(
		spy.mock.calls.map(([, properties]) => properties as gsap.TweenVars)
	);
	const to = accumulateGsapTweenVars(
		spy.mock.calls.map(([, , properties]) => properties as gsap.TweenVars)
	);
	return { from, to };
}

function accumulateGsapTweenVars(list: gsap.TweenVars[]): Record<string, number> {
	const counts = list.reduce<Record<string, number>>((acc, properties) => {
		Object.keys(properties).forEach((key) => {
			acc[key] = (acc[key] || 0) + 1;
		});
		return acc;
	}, {});
	// not a property being animated
	delete counts.duration;
	delete counts.ease;
	return counts;
}

export function availableMovesMinimized(availableMoves: AvailableMove[] | null, all = false) {
	if (!availableMoves) return null;
	if (!availableMoves.length) return [];
	return availableMoves
		.filter(({ priority }) => all || priority > 0)
		.map(({ location, moveDestinationType, priority }) => [
			moveDestinationType === 'cascade:empty'
				? shorthandPile(location)
				: shorthandLocation(location),
			...(all ? [moveDestinationType] : []),
			priority,
		]);
}
