/**
 * A win the solver found, written into `solutions/` beside the hand-played lines.
 *
 * A corpus row is a claim and a move count; the line behind it is the proof, and without it every later
 * question about that row — did it need the damage cap, does it still replay, is a shorter line hiding in
 * it — costs another search. So both producers of rows (the re-prover and the scanner) drop their lines
 * here as they find them, and `scripts/replay.ts` can check any of them against the rules in seconds.
 *
 * The printed `lines` are for reading. `actions` are the solver's own moves, kept because the printed
 * vocabulary reaches past the transcript grammar (`range 2D col 5 row 4`, `arm PISORF (cell 3) · col 4 with
 * col 6`): replaying the actions is what keeps a cached solution checkable rather than merely readable.
 */
import { writeFileSync } from 'node:fs';
import type { Difficulty } from '../src/tombcrawl';

export interface SolutionParty {
	role: string;
	name: string;
	suit: string;
}

export interface FoundLine {
	seed: number;
	difficulty: Difficulty;
	goal: 'boss' | 'clear';
	loadout: string;
	moves: number;
	party: SolutionParty[];
	lines: string[];
	actions: unknown[];
	nodes: number;
	/** What found it: the re-prover and the scanner are different questions about the same seed. */
	note: string;
}

/** One file per track and seed: a party is dealt per track, so the two never collide. */
export function writeSolution(found: FoundLine) {
	const body = {
		seed: found.seed,
		difficulty: found.difficulty,
		goal: found.goal,
		moves: found.moves,
		loadout: found.loadout,
		party: found.party.map((member) => member.name),
		found: new Date().toISOString().slice(0, 10),
		source: 'solver',
		note: `${found.note}, ${found.nodes.toLocaleString()} states`,
		lines: found.lines,
		actions: found.actions,
	};
	writeFileSync(
		`solutions/${found.difficulty}-${found.seed}.json`,
		JSON.stringify(body, null, '\t') + '\n'
	);
}
