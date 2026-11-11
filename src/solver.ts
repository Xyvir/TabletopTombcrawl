import { shorthandCard, type Card, type CardLocation } from './game/card/card';
import {
	FREE_CELL_COUNT,
	abilityUsable,
	attackWith,
	bossSlain,
	canBuildOn,
	canRevealFaceDown,
	cellCardMovable,
	createTombState,
	currentLevel,
	draftAt,
	emptyCells,
	hp,
	imawalCanBury,
	isFaceDown,
	maxHp,
	moveCapacity,
	parCleared,
	revealFaceDown,
	bossProtected,
	tombMove,
	tombPar,
	tombRun,
	useAbility,
	type Difficulty,
	type TombState,
} from './tombcrawl';
import { armLabel, cardName, digLabel, homeLabel, moveLabel, parkLabel, where } from './notation';

export type Goal = 'clear' | 'boss';

/**
 * One legal action, in a form that can be replayed through the real rules. Keeping the action rather
 * than only a description is what lets a solution be checked: the printed line is those moves, and
 * every one of them is applied by `applyAction` to arrive at the states shown.
 */
export type SolverAction =
	| { kind: 'dig'; at: CardLocation }
	| { kind: 'home'; at: CardLocation; reach?: boolean }
	| { kind: 'move'; from: CardLocation; to: CardLocation }
	| { kind: 'arm'; cell: number };

export interface SolverMove {
	action: SolverAction;
	/** How the move reads in a printed solution. */
	label: string;
	next: TombState;
}

/** Replay an action through the rules themselves, so the search cannot invent a move. */
export function applyAction(state: TombState, action: SolverAction): TombState | null {
	switch (action.kind) {
		case 'dig':
			return revealFaceDown(state, action.at);
		case 'home':
			return attackWith(state, action.at, action.reach);
		case 'move':
			return tombMove(state, action.from, action.to);
		case 'arm':
			return useAbility(state, action.cell);
	}
}

/* ---------------------------------------------------------------- labels */

const column = (index: number, row = 0): CardLocation => ({ fixture: 'cascade', data: [index, row] });
const cell = (index: number): CardLocation => ({ fixture: 'cell', data: [index] });

/* --------------------------------------------------------- move generation */

/**
 * Every legal action worth taking from a state. Spells that need a second, separate aim — PISORF,
 * WEYTWUT, and the Elixir's target — are not armed here: arming one without modelling its target
 * would burn a ply and leave the search holding it.
 */
export function generateMoves(state: TombState): SolverMove[] {
	const moves: SolverMove[] = [];
	const add = (action: SolverAction, label: string, next: TombState | null) => {
		if (next && next !== state) moves.push({ action, label, next });
	};

	// The fog hides half the deck, so a dig is always a real choice.
	for (const card of state.game.cards) {
		if (!isFaceDown(state, card) || !canRevealFaceDown(state, card.location)) continue;
		add({ kind: 'dig', at: card.location }, digLabel(card, card.location), revealFaceDown(state, card.location));
	}

	// Anything exposed on a column top, or lying in a free cell, may go home.
	for (const card of state.game.cards) {
		if (card.location.fixture === 'foundation' || card.location.fixture === 'deck') continue;
		if (isFaceDown(state, card)) continue;
		if (card.location.fixture === 'cascade') {
			const pile = state.game.tableau[card.location.data[0]] ?? [];
			if (pile[pile.length - 1] !== card) continue;
		}
		add({ kind: 'home', at: card.location }, homeLabel(card), attackWith(state, card.location));
	}

	// BURNDAYRAZ reaches under cover: a buried card it can see is one it can send home.
	if (state.armed?.kind === 'burndayraz') {
		for (const card of state.game.cards) {
			if (card.location.fixture !== 'cascade' || isFaceDown(state, card)) continue;
			const pile = state.game.tableau[card.location.data[0]] ?? [];
			if (pile[pile.length - 1] === card) continue;
			add(
				{ kind: 'home', at: card.location, reach: true },
				`burn  ${cardName(card)} ${where(card.location)} row ${card.location.data[1] + 1}`,
				attackWith(state, card.location, true)
			);
		}
	}

	// A run the free cells could carry, from any card that reaches the top of its column.
	const capacity = state.armed?.kind === 'sack' ? Number.POSITIVE_INFINITY : moveCapacity(state);
	for (let c = 0; c < state.game.tableau.length; c++) {
		const pile = state.game.tableau[c] ?? [];
		for (let row = 0; row < pile.length; row++) {
			const run = tombRun(state, column(c, row));
			if (!run.length || run[run.length - 1] !== pile[pile.length - 1]) continue;
			if (run.length > capacity) continue;
			for (let t = 0; t < state.game.tableau.length; t++) {
				if (t === c) continue;
				const target = column(t, Math.max(0, (state.game.tableau[t] ?? []).length - 1));
				const buried = imawalCanBury(state, run, target);
				if (!buried && !canBuildOn(state, run, target)) continue;
				add(
					{ kind: 'move', from: column(c, row), to: target },
					moveLabel(run, column(c, row), target, buried),
					tombMove(state, column(c, row), target)
				);
			}
		}
	}

	// A single top card parked into an empty free cell.
	const open = emptyCells(state);
	for (let c = 0; c < state.game.tableau.length; c++) {
		const pile = state.game.tableau[c] ?? [];
		const top = pile[pile.length - 1];
		if (!top || isFaceDown(state, top)) continue;
		for (const slot of open) {
			const from = column(c, pile.length - 1);
			add({ kind: 'move', from, to: cell(slot) }, parkLabel(top, from, cell(slot)), tombMove(state, from, cell(slot)));
		}
	}

	// A card in a free cell back onto the board.
	for (let slot = 0; slot < state.game.cells.length; slot++) {
		const card = state.game.cells[slot];
		if (!card || !cellCardMovable(state, slot)) continue;
		for (let t = 0; t < state.game.tableau.length; t++) {
			const target = column(t, Math.max(0, (state.game.tableau[t] ?? []).length - 1));
			const buried = imawalCanBury(state, [card], target);
			if (!buried && !canBuildOn(state, [card], target)) continue;
			add(
				{ kind: 'move', from: cell(slot), to: target },
				moveLabel([card], cell(slot), target, buried),
				tombMove(state, cell(slot), target)
			);
		}
	}

	// Arming: the spell is spent by whichever move uses it.
	for (let slot = 0; slot < state.game.cells.length; slot++) {
		const entry = draftAt(state, slot);
		if (!entry || !abilityUsable(state, slot)) continue;
		if (entry.name === 'PISORF' || entry.name === 'WEYTWUT' || entry.name === 'Elixir') continue;
		add({ kind: 'arm', cell: slot }, armLabel(entry.name, slot), useAbility(state, slot));
	}

	return moves;
}

/* -------------------------------------------------------------- searching */

interface PathLink {
	action: SolverAction;
	label: string;
	prev: PathLink | null;
}

interface Node {
	state: TombState;
	path: PathLink | null;
	/** Heap order: the board's value, nudged towards shallower lines on ties. */
	score: number;
	/** The board's own value, used to remember the best position seen. */
	value: number;
	depth: number;
}

export interface SolveStep {
	action: SolverAction;
	label: string;
	/** The board after this move, produced by replaying it through the rules. */
	state: TombState;
}

export interface SolveOptions {
	seed?: number;
	state?: TombState;
	difficulty?: Difficulty;
	goal?: Goal;
	/** States to examine before giving up. */
	nodes?: number;
	/** Keep N states per ply instead of best-first order. Breadth forces progress; 0 disables. */
	beamWidth?: number;
	/**
	 * Search order: best-first (default), breadth by ply (beamWidth), greedy depth-first, or the
	 * default policy of a beam followed by best-first on what is left of the budget.
	 */
	strategy?: 'best' | 'beam' | 'dfs' | 'hybrid';
	/** Longest line the search will follow. */
	depth?: number;
	timeBudgetMs?: number;
	onProgress?: (info: { nodes: number; open: number; best: number; depth: number; elapsedMs: number }) => void;
}

export interface SolveResult {
	goal: Goal;
	solved: boolean;
	/** The winning line, empty when nothing was found. */
	steps: SolveStep[];
	/** The best board reached, and the line that reaches it — useful when the search fails. */
	best: TombState;
	bestSteps: SolveStep[];
	/** Depth of the deepest line followed. */
	plies: number;
	nodes: number;
	elapsedMs: number;
	timedOut: boolean;
}

const isGoal = (state: TombState, goal: Goal): boolean =>
	goal === 'boss' ? bossSlain(state) : state.game.cards.every((card) => card.location.fixture === 'foundation');

/**
 * Score weights, in the open so the search can be measured rather than guessed at: the tuning script
 * rewrites them, and nothing else in the game depends on their values.
 */
export interface ScoreWeights {
	/** Par gained: the objective itself. */
	clear: number;
	/** Levels reached: a level is a heal, a glyph refresh and a rank all at once. */
	level: number;
	/** Cards the foundations are waiting on that can be played there right now. */
	reach: number;
	/** How deeply each card the foundations are waiting on is buried. */
	buried: number;
	/** Hearts: the currency for playing a card above your level, and for taking a card out of a cell. */
	hearts: number;
	/** Fog lifted: a full clear needs every card face up. */
	fog: number;
	/** Empty cells: storage, which here is also the track the hearts are made of. */
	room: number;
	/**
	 * Penalty for a track down to its last heart. It is a weight rather than a constant because the
	 * endgame of a tight deal runs there on purpose: taking the last card out of a cell costs a heart,
	 * so the winning line visits boards this penalty makes ugly.
	 */
	lowHearts: number;
	/** The boss king exposed on a column top with nothing protecting it: the kill is a move away. */
	bossOpen: number;
	/** Each card standing between the boss king and the top of its column. */
	bossDepth: number;
	/** Kings home: each one is what unfreezes a protected boss king. */
	kings: number;
}

export const SCORE_WEIGHTS: ScoreWeights = {
	clear: 10,
	level: 30,
	reach: 12,
	buried: 6,
	hearts: 4,
	fog: 3,
	room: 0,
	// No penalty at all: a tight deal's winning endgame runs on the last heart, and charging for it
	// cost seeds 2 and 5 their clears — both are one card from home at a two-heart board, and both
	// close in about twenty seconds once the charge is gone.
	lowHearts: 0,
	// A boss run is decided by one card, so the weights that see it are the ones that turn a survey
	// into a plan: an exposed, unprotected king is nearly the win; a buried one costs a dig per card
	// above it; and every king already home is one step closer to unfreezing that king.
	// Swept against seeds 2, 4 and 12 at a 300k hybrid gate: seed 12 solves in ~1,300 states with
	// these and never without them, seed 4 solves either way, and a heavy setting (70/9/22) loses
	// seed 12 again — the boss term helps until it starts overriding the foundations.
	bossOpen: 40,
	bossDepth: 5,
	kings: 10,
};

const SUITS = ['hearts', 'clubs', 'diamonds', 'spades'] as const;
type SolverSuit = (typeof SUITS)[number];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const rankNumber = (rank: string) => RANKS.indexOf(rank) + 1;

/**
 * What the foundations are owed. `reach` counts the next card of a suit when it can be played there
 * and then — the one measure that rewards setting a card up rather than merely having room for it.
 * `buried` counts what stands in the way of each card the foundations want: cards above it, and four
 * more for a card still face down, since it has to be dug out first. A card that was drafted can
 * never come home, so its suit is stalled for the rest of the run.
 */
function foundationPull(state: TombState): { reach: number; buried: number } {
	const tops: Record<SolverSuit, number> = { hearts: 0, clubs: 0, diamonds: 0, spades: 0 };
	for (const card of state.game.cards) {
		if (card.location.fixture !== 'foundation') continue;
		const rank = rankNumber(card.rank);
		if (rank > tops[card.suit]) tops[card.suit] = rank;
	}
	const wanted = new Map<SolverSuit, number>();
	for (const suit of SUITS) if (tops[suit] < 13) wanted.set(suit, tops[suit] + 1);
	let reach = 0;
	let buried = 0;
	for (const card of state.game.cards) {
		const want = wanted.get(card.suit);
		if (want === undefined || card.location.fixture === 'foundation' || rankNumber(card.rank) !== want) continue;
		wanted.delete(card.suit);
		if (card.location.fixture === 'cell') {
			reach++;
			continue;
		}
		const pile = state.game.tableau[card.location.data[0]] ?? [];
		const above = Math.max(0, pile.length - 1 - card.location.data[1]);
		if (above === 0 && !isFaceDown(state, card)) reach++;
		else buried += above + (isFaceDown(state, card) ? 4 : 0);
	}
	buried += wanted.size * 6;
	return { reach, buried };
}

/**
 * What a boss kill is still owed. The objective of a boss run is a single card, and the foundations
 * say nothing about it: a king can sit exposed while par barely moves. So the search is told how far
 * the king is from the top of its column, whether it is free to be taken, and how many kings are
 * already home — because a protected king stays frozen until one other king goes home first.
 */
function bossPull(state: TombState): { open: number; depth: number; kings: number } {
	const kings = state.game.cards.filter(
		(card) => card.rank === 'king' && card.location.fixture === 'foundation'
	).length;
	if (!state.bossId) return { open: 0, depth: 0, kings };
	const boss = state.game.cards.find(
		(card) => card.rank === 'king' && card.location.fixture === 'cascade' && !isFaceDown(state, card)
	);
	if (!boss) return { open: 0, depth: 0, kings };
	const pile = state.game.tableau[boss.location.data[0]] ?? [];
	const above = Math.max(0, pile.length - 1 - boss.location.data[1]);
	// An exposed king is only worth aiming at once the freeze is lifted; until then, kings home is
	// the measure that matters, so an exposed but protected king is worth no more than a buried one.
	const open = above === 0 && !bossProtected(state) ? 1 : 0;
	return { open, depth: above, kings };
}

/** How good a position looks, as the weighted sum of everything the tuner can move. */
function scoreOf(state: TombState, goal: Goal = 'clear'): number {
	const w = SCORE_WEIGHTS;
	const blocked = foundationPull(state);
	const hearts = hp(state);
	// A track down to its last card is scored badly: there is nothing left to spend on a kill.
	const reserve = hearts <= 1 ? -w.lowHearts : 0;
	// A clear run has no boss term at all: its objective is every card, which the foundations
	// already measure, and adding a king's position would only pull the line away from that.
	const boss = goal === 'boss' ? bossPull(state) : { open: 0, depth: 0, kings: 0 };
	return (
		(500 - tombPar(state)) * w.clear +
		currentLevel(state) * w.level +
		(48 - state.hidden.length) * w.fog +
		blocked.reach * w.reach +
		hearts * w.hearts -
		blocked.buried * w.buried +
		emptyCells(state).length * w.room +
		reserve +
		boss.open * w.bossOpen +
		boss.kings * w.kings -
		boss.depth * w.bossDepth
	);
}

/** A canonical key for the board, fog and bookkeeping included, so equal positions collapse. */
function stateKey(state: TombState): string {
	const cards = state.game.cards
		.map((card) => `${card.location.fixture[0]}${card.location.data.join('.')}${isFaceDown(state, card) ? 'f' : ''}`)
		.join('|');
	const slots = state.game.cells.map((card) => (card ? 'x' : '-')).join('');
	const draft = state.draft.map((entry) => `${entry.cell}:${entry.id}`).join(',');
	const armed = state.armed ? `${state.armed.kind}${state.armed.cell}${state.armed.first ?? ''}` : '';
	const window = state.itemWindow ? `${state.itemWindow.cell}${state.itemWindow.role}${state.itemWindow.suit}` : '';
	return `${cards}#${slots}#${state.exhausted.map(Number).join('')}#${state.wounded.join('')}#${draft}#${armed}#${window}`;
}

/** Walk a path back from the start through the rules, so each printed state is earned by a move. */
function stepsFrom(start: TombState, path: PathLink | null): SolveStep[] {
	const chain: PathLink[] = [];
	for (let link = path; link; link = link.prev) chain.push(link);
	chain.reverse();
	const steps: SolveStep[] = [];
	let state = start;
	for (const link of chain) {
		const next = applyAction(state, link.action);
		if (!next) break;
		steps.push({ action: link.action, label: link.label, state: next });
		state = next;
	}
	return steps;
}

/** A binary heap on score, so the most promising board is always the next one examined. */
class NodeHeap {
	private readonly items: Node[] = [];

	get size(): number {
		return this.items.length;
	}

	push(node: Node): void {
		this.items.push(node);
		let index = this.items.length - 1;
		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (this.items[parent].score >= this.items[index].score) break;
			[this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
			index = parent;
		}
	}

	pop(): Node | null {
		if (!this.items.length) return null;
		const top = this.items[0];
		const last = this.items.pop()!;
		if (this.items.length) {
			this.items[0] = last;
			let index = 0;
			for (;;) {
				const left = index * 2 + 1;
				const right = left + 1;
				let best = index;
				if (left < this.items.length && this.items[left].score > this.items[best].score) best = left;
				if (right < this.items.length && this.items[right].score > this.items[best].score) best = right;
				if (best === index) break;
				[this.items[best], this.items[index]] = [this.items[index], this.items[best]];
				index = best;
			}
		}
		return top;
	}
}

/**
 * Best-first search for a winning line: always expand the most promising board, keep a set of
 * positions already seen, and follow the line that reaches the goal. Deterministic, and the result
 * is a line you can read and replay rather than a bare verdict.
 */
export function solveTomb(options: SolveOptions = {}): SolveResult {
	const goal: Goal = options.goal ?? 'clear';
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);
	const budget = Math.max(1000, options.nodes ?? 200_000);
	const depth = Math.max(1, options.depth ?? 220);
	const deadline = options.timeBudgetMs ?? 90_000;
	const began = Date.now();
	const capacity = 12_000;

	// The shipped policy: survey with a beam, then grind with best-first on what is left of the budget.
	// A beam cracks the deals whose winning line is a long, patient grind (seed 12881 med needs 135
	// moves and spends the first hundred gaining nothing), while best-first is better on the shallow
	// ones, where a beam of any useful width spreads itself too thin to reach the last few moves.
	if (options.strategy === 'hybrid') {
		const first = solveTomb({
			...options,
			strategy: 'beam',
			beamWidth: options.beamWidth ?? 300,
			timeBudgetMs: Math.round(deadline * 0.6),
			nodes: Math.max(1000, Math.round(budget * 0.6)),
		});
		if (first.solved) return first;
		const second = solveTomb({
			...options,
			strategy: 'best',
			beamWidth: 0,
			timeBudgetMs: Math.max(2000, deadline - first.elapsedMs),
			nodes: Math.max(1000, budget - first.nodes),
		});
		if (!second.solved && scoreOf(second.best, goal) < scoreOf(first.best, goal)) {
			// The beam's board was better, but both passes paid for it: report the whole spend.
			return {
				...first,
				nodes: first.nodes + second.nodes,
				elapsedMs: first.elapsedMs + second.elapsedMs,
				timedOut: first.timedOut || second.timedOut,
			};
		}
		return second;
	}

	const open = new NodeHeap();
	const firstValue = scoreOf(start, goal);
	const first: Node = { state: start, path: null, score: firstValue, value: firstValue, depth: 0 };
	open.push(first);
	const seen = new Set<string>([stateKey(start)]);
	let best = first;
	let nodes = 1;
	let deepest = 0;
	let timedOut = false;

	const finish = (solved: boolean, path: PathLink | null, state: TombState): SolveResult => ({
		goal,
		solved,
		steps: solved ? stepsFrom(start, path) : [],
		best: state,
		bestSteps: stepsFrom(start, path),
		plies: deepest,
		nodes,
		elapsedMs: Date.now() - began,
		timedOut,
	});

	// Depth-first with the best board on top of the stack: dives long lines instead of surveying the
	// whole frontier, which is what this game needs — most of a solution is rearrangement that gains
	// nothing until it exposes a card worth playing.
	if (options.strategy === 'dfs') {
		const stack: Node[] = [first];
		const visited = new Set<string>([stateKey(start)]);
		while (stack.length) {
			if (nodes >= budget) break;
			if (Date.now() - began > deadline) {
				timedOut = true;
				break;
			}
			const node = stack.pop()!;
			deepest = Math.max(deepest, node.depth);
			if (isGoal(node.state, goal)) return finish(true, node.path, node.state);
			if (node.depth >= depth) continue;

			const children: Node[] = [];
			for (const move of generateMoves(node.state)) {
				nodes++;
				const path: PathLink = { action: move.action, label: move.label, prev: node.path };
				if (isGoal(move.next, goal)) {
					deepest = Math.max(deepest, node.depth + 1);
					return finish(true, path, move.next);
				}
				const key = stateKey(move.next);
				if (visited.has(key)) continue;
				visited.add(key);
				const value = scoreOf(move.next, goal);
				const child: Node = { state: move.next, path, value, score: value, depth: node.depth + 1 };
				if (value > best.value) best = child;
				children.push(child);
			}
			children.sort((a, b) => a.value - b.value);
			for (const child of children) stack.push(child);
			// A depth-first stack can hoard states; stop rather than eat the machine.
			if (stack.length > 40_000) break;
			options.onProgress?.({ nodes, open: stack.length, best: best.value, depth: deepest, elapsedMs: Date.now() - began });
		}
		return finish(isGoal(best.state, goal), best.path, best.state);
	}

	// Beam mode: every ply advances, and only the best boards of that ply survive. Best-first can
	// stall in a plateau it can never climb out of; breadth at least keeps moving forward.
	const width = options.beamWidth ?? 0;
	if (width > 0) {
		let frontier: Node[] = [first];
		for (let ply = 0; ply < depth; ply++) {
			if (nodes >= budget) break;
			if (Date.now() - began > deadline) {
				timedOut = true;
				break;
			}
			const seen = new Set<string>();
			const children: Node[] = [];
			for (const node of frontier) {
				for (const move of generateMoves(node.state)) {
					nodes++;
					const path: PathLink = { action: move.action, label: move.label, prev: node.path };
					if (isGoal(move.next, goal)) {
						deepest = Math.max(deepest, ply + 1);
						return finish(true, path, move.next);
					}
					const key = stateKey(move.next);
					if (seen.has(key)) continue;
					seen.add(key);
					const value = scoreOf(move.next, goal);
					const child: Node = { state: move.next, path, value, score: value, depth: ply + 1 };
					children.push(child);
					if (value > best.value) best = child;
				}
			}
			deepest = Math.max(deepest, ply + 1);
			if (!children.length) break;
			children.sort((a, b) => b.value - a.value);
			frontier = children.slice(0, width);
			options.onProgress?.({
				nodes,
				open: frontier.length,
				best: best.value,
				depth: deepest,
				elapsedMs: Date.now() - began,
			});
		}
		return finish(isGoal(best.state, goal), best.path, best.state);
	}

	while (open.size) {
		if (nodes >= budget) break;
		if (Date.now() - began > deadline) {
			timedOut = true;
			break;
		}

		const node = open.pop()!;
		deepest = Math.max(deepest, node.depth);
		if (isGoal(node.state, goal)) return finish(true, node.path, node.state);
		if (node.depth >= depth) continue;

		for (const move of generateMoves(node.state)) {
			nodes++;
			const path: PathLink = { action: move.action, label: move.label, prev: node.path };
			if (isGoal(move.next, goal)) {
				deepest = Math.max(deepest, node.depth + 1);
				return finish(true, path, move.next);
			}
			const key = stateKey(move.next);
			if (seen.has(key)) continue;
			seen.add(key);
			const value = scoreOf(move.next, goal);
			const child: Node = {
				state: move.next,
				path,
				value,
				// Equal boards are common, so a small depth cost keeps the search from wandering through
				// shuffles that gain nothing when a shorter line of the same value exists.
				score: value - (node.depth + 1) * 0.5,
				depth: node.depth + 1,
			};
			if (child.value > best.value) best = child;
			open.push(child);
		}

		// Keep the frontier bounded: the worst boards waiting are the ones nobody will want.
		while (open.size > capacity) open.pop();
		options.onProgress?.({ nodes, open: open.size, best: best.value, depth: deepest, elapsedMs: Date.now() - began });
	}

	return finish(isGoal(best.state, goal), best.path, best.state);
}

/** A one-line summary of a board, for the printed solution's trailing column. */
export function boardSummary(state: TombState): string {
	return `fog ${state.hidden.length}  hp ${hp(state)}/${maxHp(state)}  lvl ${currentLevel(state)}  par ${tombPar(state)}  ${parCleared(state).toFixed(1)}%`;
}
