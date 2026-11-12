/**
 * The solver, off the main thread.
 *
 * A search takes tens of seconds, so it runs in a worker the deal can terminate at any moment: the
 * player keeps playing while it looks, and swapping the deal throws the work away rather than letting
 * it finish into a stale answer. Both directions are lower bounds — a line proves the deal is winnable,
 * silence proves only that this budget did not find one.
 */
import { createTombState, type Difficulty } from './tombcrawl';
import { solveTomb } from './solver';

export interface SolverRequest {
	seed: number;
	difficulty: Difficulty;
	nodes: number;
	timeBudgetMs: number;
}

export interface SolverReply {
	seed: number;
	difficulty: Difficulty;
	solved: boolean;
	/** Moves in the line that was found, 0 when there is none. */
	moves: number;
	nodes: number;
	elapsedMs: number;
	/** The line itself, one printed label per move. */
	line: string[];
}

// The project's tsconfig is a DOM one, so `self` is a Window here: the worker API is reached through a
// narrow cast rather than dragging the whole webworker lib into the app's types.
const scope = self as unknown as {
	onmessage: ((event: MessageEvent<SolverRequest>) => void) | null;
	postMessage: (message: SolverReply) => void;
};

scope.onmessage = (event) => {
	const { seed, difficulty, nodes, timeBudgetMs } = event.data;
	const result = solveTomb({ seed, difficulty, nodes, timeBudgetMs, goal: 'clear' });
	scope.postMessage({
		seed,
		difficulty,
		solved: result.solved,
		moves: result.steps.length,
		nodes: result.nodes,
		elapsedMs: result.elapsedMs,
		line: result.steps.map((step) => step.label),
	});
};

/** Never read: it only keeps `createTombState` reachable for the worker's own type check. */
export const dealFor = createTombState;
