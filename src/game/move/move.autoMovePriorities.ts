import type { MoveDestinationType, MoveSourceType } from '@/game/move/move';

type MoveDestinationTypePriority = Record<MoveDestinationType, number>;

/**
	higher priorities take precidence

	For each source type, priorities are unique values in the range `1..MoveDestinationTypeList.length`.
	- (unique) equal priorities make the result order-dependent
	- (value constrained) we will apply custom rule to boost these, so the max here needs to be obvious
*/
export const MoveDestinationTypePriorities: Record<MoveSourceType, MoveDestinationTypePriority> = {
	'cell:single': {
		'cell:empty': 1,
		'foundation:any': 2,
		'cascade:empty': 3,
		'cascade:sequence': 4,
	},
	'cascade:single': {
		'cell:empty': 3,
		'foundation:any': 2,
		'cascade:empty': 1,
		'cascade:sequence': 4,
	},
	'cascade:sequence': {
		'cell:empty': 1,
		'foundation:any': 2,
		'cascade:empty': 3,
		'cascade:sequence': 4,
	},
};

/** opening moves, moving low rank cards one at a time */
export const MoveDestinationTypePrioritiesForLowSingle: MoveDestinationTypePriority = {
	'cell:empty': 2,
	'foundation:any': 4,
	'cascade:empty': 1,
	'cascade:sequence': 3,
};

/** endgame-ish, moving a single king (not a sequence) */
export const MoveDestinationTypePrioritiesForKingSingle: MoveDestinationTypePriority = {
	'cell:empty': 1,
	'foundation:any': 4,
	'cascade:empty': 3,
	'cascade:sequence': 2, // e.g. onto a joker, KD→WC
};
