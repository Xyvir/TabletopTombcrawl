import { shorthandCard, type Card, type CardLocation } from './game/card/card';
import {
	CLAUSES,
	FREE_CELL_COUNT,
	abilityUsable,
	armedClick,
	attackWith,
	bossSlain,
	canBuildOn,
	canRevealFaceDown,
	cellCardMovable,
	abilityFor,
	createTombState,
	currentLevel,
	draftAt,
	emptyCells,
	elfSight,
	hasPassive,
	hp,
	cydsteppCanBury,
	isFaceDown,
	maxHp,
	moveCapacity,
	parCleared,
	pisorfPair,
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
 * Which driver runs the search. `flat` is the original single-objective policy (best-first, beam, greedy or the
 * beam-then-best hybrid); `two-phase` is the organizing-then-cashing-in driver below. The engine is an option rather
 * than a replacement so the two can be run side by side on the same deal, which is the only honest way to say one is
 * better: `scripts/compare-engines.ts`.
 */
export type SolverEngine = 'flat' | 'two-phase' | 'fallback';

/**
 * One legal action, in a form that can be replayed through the real rules. Keeping the action rather
 * than only a description is what lets a solution be checked: the printed line is those moves, and
 * every one of them is applied by `applyAction` to arrive at the states shown.
 */
export type SolverAction =
	| { kind: 'dig'; at: CardLocation }
	| { kind: 'home'; at: CardLocation; reach?: boolean }
	| { kind: 'move'; from: CardLocation; to: CardLocation }
	| { kind: 'arm'; cell: number }
	/**
	 * PISORF and WEYTWUT are aimed with a second and third click, so the search cannot reach them one
	 * ply at a time: arming and then moving is not what the rules accept. Each is one action here, and
	 * `applyAction` plays the clicks through the rules exactly as a hand would.
	 */
	| { kind: 'pisorf'; cell: number; from: CardLocation; to: number }
	| { kind: 'weytwut'; cell: number; a: CardLocation; b: CardLocation }
	/** Purity aims at a hallway rather than a card, so its arm and its aim are one action too. */
	| { kind: 'purity'; cell: number; column: number };

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
		case 'pisorf': {
			const armed = useAbility(state, action.cell);
			if (!armed) return null;
			const taken = armedClick(armed, action.from);
			if (!taken) return null;
			return armedClick(taken, { fixture: 'cell', data: [action.to] });
		}
		case 'weytwut': {
			const armed = useAbility(state, action.cell);
			if (!armed) return null;
			const first = armedClick(armed, action.a);
			if (!first) return null;
			return armedClick(first, action.b);
		}
		case 'purity': {
			const armed = useAbility(state, action.cell);
			if (!armed) return null;
			return armedClick(armed, { fixture: 'cascade', data: [action.column, 0] });
		}
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
	// Eager labels, measured against a lazy getter: the getter's closure and accessor shape cost more
	// than the strings it saved (37.7s against 26.9s on seed 31107), so the label stays a plain field.
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

	// An Elf's ranged shot: a card down a lane of exposed number cards is killed where it lies.
	if (hasPassive(state, 'Elf')) {
		for (const card of state.game.cards) {
			if (card.location.fixture !== 'cascade' || isFaceDown(state, card)) continue;
			const pile = state.game.tableau[card.location.data[0]] ?? [];
			if (pile[pile.length - 1] === card) continue;
			if (!elfSight(state, card.location)) continue;
			add(
				{ kind: 'home', at: card.location, reach: true },
				`range  ${cardName(card)} ${where(card.location)} row ${card.location.data[1] + 1}`,
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
				const buried = cydsteppCanBury(state, run, target);
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
			const buried = cydsteppCanBury(state, [card], target);
			if (!buried && !canBuildOn(state, [card], target)) continue;
			add(
				{ kind: 'move', from: cell(slot), to: target },
				moveLabel([card], cell(slot), target, buried),
				tombMove(state, cell(slot), target)
			);
		}
	}

	/*
	 * Casting. BYSSEPS, CYDSTEPP, BURNDAYRAZ, a Remedy or a Purity arm and then wait for the move that
	 * spends them, so arming is a move of its own. PISORF and WEYTWUT are aimed at what they act on with
	 * a second click, and the rules refuse a plain move while they are armed, so their arm and their aim
	 * are generated as one action; an Elixir mends the glyph and has no target at all.
	 */
	for (let slot = 0; slot < state.game.cells.length; slot++) {
		const entry = draftAt(state, slot);
		if (!entry || !abilityUsable(state, slot)) continue;
		if (entry.name === 'PISORF') {
			// A proper pair at the bottom of a column, parked whole in a free cell: two cards and two
			// hearts for one cast, which is the strongest thing the spell does.
			const open = emptyCells(state);
			for (let c = 0; c < state.game.tableau.length; c++) {
				const pile = state.game.tableau[c] ?? [];
				if (pile.length < 2) continue;
				const from = column(c, pile.length - 2);
				const pair = pisorfPair(state, from);
				if (!pair) continue;
				for (const to of open) {
					const action = { kind: 'pisorf' as const, cell: slot, from, to };
					add(
						action,
						`${armLabel(entry.name, slot)} · ${pair.map(cardName).join(' ')} ${where(from)} to cell ${to + 1}`,
						applyAction(state, action)
					);
				}
			}
			continue;
		}
		if (entry.name === 'WEYTWUT') {
			// Two exposed cards trade places: the way a high card is put down and a low one brought up,
			// which is also how a column top is cleared for the Elf's shot.
			const exposed: CardLocation[] = [];
			for (let c = 0; c < state.game.tableau.length; c++) {
				const pile = state.game.tableau[c] ?? [];
				if (pile.length) exposed.push(column(c, pile.length - 1));
			}
			for (let i = 0; i < state.game.cells.length; i++) if (state.game.cells[i]) exposed.push(cell(i));
			for (let i = 0; i < exposed.length; i++) {
				for (let j = i + 1; j < exposed.length; j++) {
					const a = exposed[i];
					const b = exposed[j];
					// two cards in free cells trading places is the same board with a ply wasted
					if (a.fixture === 'cell' && b.fixture === 'cell') continue;
					const action = { kind: 'weytwut' as const, cell: slot, a, b };
					add(action, `${armLabel(entry.name, slot)} · ${where(a)} with ${where(b)}`, applyAction(state, action));
				}
			}
			continue;
		}
		if (entry.name === 'Purity') {
			// Purity names a hallway, so arming it and aiming it are one action, one per column.
			for (let col = 0; col < state.game.tableau.length; col++) {
				const action = { kind: 'purity' as const, cell: slot, column: col };
				add(action, `${armLabel(entry.name, slot)} · ${where(column(col, 0))}`, applyAction(state, action));
			}
			continue;
		}
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
	/** Which driver to run. Defaults to the flat one, so every existing caller keeps the old behaviour. */
	engine?: SolverEngine;
	/**
	 * The two-phase driver's spend: the fraction of the node budget the organizing phase may use before the cashing-in
	 * phase gets what is left. Half by default; a board that arrives already dug out wants it lower.
	 */
	phaseSplit?: number;
	/**
	 * The `fallback` driver's first pass: the fraction of the budget the flat search may have before the phases take
	 * over. Four tenths by default, because the deals the flat search cracks, it cracks in hundreds of states, and the
	 * deals it grinds on are exactly the ones worth handing to the phases.
	 */
	warmUp?: number;
	/**
	 * What the two-phase driver hands over. `best` (the default) gives the cash-in pass the organizing pass's best board
	 * whatever it looks like; `finishable` walks the organizing line back to the deepest board that still has a home on
	 * it. The test is real — on 154116 at a 1M cash-in the unrationed handoff is a dead board, and `finishable` does move
	 * off it — but it gives up more progress than the dead board cost (par 449 against the dead board's own 427), so the
	 * default is the plain handoff.
	 */
	handoff?: 'best' | 'finishable';
	/**
	 * Overrides for the objective inside one pass. The two-phase driver uses them to score a board by how well it is
	 * *ordered* rather than by par, which is not a goal the game has and so is not a `Goal`.
	 */
	target?: (state: TombState) => boolean;
	score?: (state: TombState) => number;
	/** States to examine before giving up. */
	nodes?: number;
	/** Keep N states per ply instead of best-first order. Breadth forces progress; 0 disables. */
	beamWidth?: number;
	/**
	 * Search order: best-first (default), breadth by ply (beamWidth), greedy depth-first, or the
	 * default policy of a beam followed by best-first on what is left of the budget.
	 */
	strategy?: 'best' | 'beam' | 'dfs' | 'hybrid';
	/**
	 * How long a board stays "already seen". A beam forgets between plies by default, which lets a
	 * winning line walk back onto a board it has stood on and spend moves that buy nothing; `all`
	 * remembers the whole search, so a line can never repeat a position, at the cost of some breadth.
	 */
	dedupe?: 'ply' | 'all';
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
	/** Branches dropped as a worse twin of a position already reached, by which clause. */
	pruned?: { spent: number; fog: number };
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
	/**
	 * A Potion in hand, priced in the hearts the track is missing: it is a heal-all, so what it is
	 * worth is exactly what the delver has lost.
	 */
	potion: number;
	/**
	 * A spent item slot waiting to be fed: worth the best item the rules would let it be remade into,
	 * which is where an Orc's Scavenger pays, since he may feed any suit and so can forge a Potion out
	 * of a hearts card the dungeon never dealt him.
	 */
	restock: number;
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
	// Zero on purpose, and measured rather than assumed. A free cell is storage, and the search already
	// pays for one whenever a card waiting in it is a card the foundations want (`reach`); a term of its
	// own buys nothing else. Pricing storage was tried on 2026-11-13 to see whether PISORF would then be
	// chosen: empty columns at 20 and a cell holding a pair at 6 turned 27 of 27 cast offers into an
	// improvement over the board before them, and the search spent its budget hoarding space instead —
	// 1 win against the old weights' 6 across 40 corpus deals at 250k, and still 1 win with the column
	// worth only 5. A cast is not worth more because the board it leaves is emptier; it is worth more
	// only when that emptiness is what the next few moves can use.
	room: 0,
	// No penalty at all: a tight deal's winning endgame runs on the last heart, and charging for it
	// cost seeds 2 and 5 their clears — both are one card from home at a two-heart board, and both
	// close in about twenty seconds once the charge is gone.
	lowHearts: 0,
	// Hearts are the bottleneck every failed line bleeds out on, and the item economy is the only way
	// to make more of them: a Potion is worth the hearts the track is missing, since its heal-all is
	// exactly that many, and a slot that could be fed into one is worth the same at a discount, since
	// forging it costs a move and a card.
	potion: 4,
	restock: 2,
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
		// An Elf shoots down a lane of exposed number cards: cover he can see over is no cover, so a
		// wanted card in his line is reachable now rather than buried under the cost of digging it out.
		else if (elfSight(state, card.location)) reach++;
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

/**
 * What remaking an item is worth on this board. Hearts are the currency every tight deal runs out of,
 * so a heal-all is priced in the hearts the track is missing; a Remedy or a Revive buys one action the
 * rules would otherwise refuse; an Elixir only mends the glyph, which a level up does for free.
 */
function itemWorth(name: string, missing: number): number {
	switch (name) {
		case 'Potion':
			return missing;
		case 'Remedy':
		case 'Purity':
			return 1;
		default:
			return 0;
	}
}

/**
 * The item economy, which the foundation terms cannot see: a Potion is a bank of hearts, and a spent
 * slot waiting to be fed is the chance to forge another one. Weighting only the item in hand would
 * leave the feed itself unpriced, so an open slot is scored as what it could still become, now.
 */
function itemPull(state: TombState): { potion: number; restock: number } {
	const missing = Math.max(0, maxHp(state) - hp(state));
	let potion = 0;
	for (const entry of state.draft) {
		// A spent item is not a bank: drinking it has to wait for a refill.
		if (entry.name !== 'Potion' || state.exhausted[entry.cell] || !state.game.cells[entry.cell]) continue;
		potion = Math.max(potion, missing);
	}
	let restock = 0;
	const window = state.itemWindow;
	if (window) {
		// Everyone else must feed the suit the slot just lost; a Thief takes any card at all.
		for (const suit of window.any ? SUITS : [window.suit]) {
			restock = Math.max(restock, itemWorth(abilityFor(window.role, suit).name, missing));
		}
	}
	return { potion, restock };
}

/** How good a position looks, as the weighted sum of everything the tuner can move. */
/**
 * The board's own value: how close a position is to the goal. Exported so a sweep can rank one deal's best
 * board against another's and spend its deep budget on the candidates that got somewhere.
 */
export function scoreOf(state: TombState, goal: Goal = 'clear'): number {
	const w = SCORE_WEIGHTS;
	const blocked = foundationPull(state);
	const hearts = hp(state);
	// A track down to its last card is scored badly: there is nothing left to spend on a kill.
	const reserve = hearts <= 1 ? -w.lowHearts : 0;
	// A clear run has no boss term at all: its objective is every card, which the foundations
	// already measure, and adding a king's position would only pull the line away from that.
	const boss = goal === 'boss' ? bossPull(state) : { open: 0, depth: 0, kings: 0 };
	// The item bank is weighed whatever the goal is: hearts are what either objective is paid for in.
	const items = itemPull(state);
	return (
		(500 - tombPar(state)) * w.clear +
		currentLevel(state) * w.level +
		(48 - state.hidden.length) * w.fog +
		blocked.reach * w.reach +
		hearts * w.hearts -
		blocked.buried * w.buried +
		emptyCells(state).length * w.room +
		reserve +
		items.potion * w.potion +
		items.restock * w.restock +
		boss.open * w.bossOpen +
		boss.kings * w.kings -
		boss.depth * w.bossDepth
	);
}

/** A canonical key for the board, fog and bookkeeping included, so equal positions collapse. */
/**
 * The identity of a position, as a 64-bit hash.
 *
 * This used to print the whole board: a ~330-character string built with map/join per state, measured
 * at 33us — a quarter of the search's entire per-state budget before the hash table even looked at it.
 * Two mixed 32-bit lanes over the same fields answer the same question in 16 characters and no
 * per-card strings. Over a few million states the chance of two positions colliding is about 1e-7, and
 * a collision only makes the search skip a position it would otherwise have reached twice.
 */
const FIXTURE_CODE: Record<string, number> = { cascade: 1, cell: 2, foundation: 3, deck: 4 };

export function stateKey(state: TombState): string {
	return hashBoard(state, true, true);
}

/**
 * The same board with the spent bits left out, so a position reached with an item spent and the same position
 * reached with it still available share a key. Exhaustion gates the ability and nothing else — the spent card can
 * still be played out of its slot — so the unspent twin has every move the spent one has, and is better to be in.
 * `spentMask` says which cells are spent, which is what orders the two.
 */
export function boardKey(state: TombState): string {
	return hashBoard(state, false, true);
}

/**
 * The board with the fog left out of the key: two positions that differ only in which cards have been dug share
 * it. "Less dug" is a heuristic rather than a rule — a face-down card is a heal, a Venom target and a fogged
 * column, while a revealed one is a playable card and a clogged hallway — so this is ordered, not proven, and it
 * lives behind `CLAUSES.fogDominance` until a sweep says it pays.
 */
export function fogKey(state: TombState): string {
	return hashBoard(state, true, false);
}

/** Which cards are face down, as a bit per card in the deal's own order. */
export function fogMask(state: TombState, index: Map<string, bigint>): bigint {
	let mask = 0n;
	for (const id of state.hidden) mask |= index.get(id) ?? 0n;
	return mask;
}

export function spentMask(state: TombState): number {
	let bits = 0;
	for (let index = 0; index < state.exhausted.length; index++) if (state.exhausted[index]) bits |= 1 << index;
	return bits;
}

function hashBoard(state: TombState, withSpent: boolean, withFog: boolean): string {
	let a = 0x811c9dc5;
	let b = 0x9e3779b9;
	const mix = (value: number) => {
		a = Math.imul(a ^ value, 0x01000193) >>> 0;
		b = Math.imul(b ^ (value + 0x9e37), 0x85ebca6b) >>> 0;
		b = (b ^ (b >>> 13)) >>> 0;
	};
	const mixText = (text: string) => {
		for (let index = 0; index < text.length; index++) mix(text.charCodeAt(index));
		mix(text.length);
	};
	// Card order is stable across a deal's children, so a position's card list is the same sequence
	// every time it is reached: hashing the locations in order identifies the board.
	for (const card of state.game.cards) {
		const { fixture, data } = card.location;
		mix(FIXTURE_CODE[fixture] * 256 + (data[0] ?? 0) * 16 + (data[1] ?? 0));
	}
	if (withFog) {
		for (const id of state.hidden) mixText(id);
		mix(state.hidden.length);
	}
	if (withSpent) mix(spentMask(state));
	for (const count of state.wounded) mix(count);
	for (const entry of state.draft) {
		mix(entry.cell);
		mixText(entry.id);
	}
	if (state.armed) {
		mixText(state.armed.kind);
		mix(state.armed.cell);
		if (state.armed.first) mixText(state.armed.first);
	}
	if (state.itemWindow) {
		mix(state.itemWindow.cell * 32 + (state.itemWindow.any ? 1 : 0));
		mixText(state.itemWindow.role);
		mixText(state.itemWindow.suit);
	}
	return `${a.toString(16)}:${b.toString(16)}`;
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
	// First, before any pass can recurse: the driver delegates to flat passes, and a pass that carried `engine`
	// would delegate back to the driver for ever.
	if (options.engine === 'two-phase') return solveTwoPhase(options);
	if (options.engine === 'fallback') return solveFallback(options);
	const goal: Goal = options.goal ?? 'clear';
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);
	const budget = Math.max(1000, options.nodes ?? 200_000);
	const depth = Math.max(1, options.depth ?? 220);
	const deadline = options.timeBudgetMs ?? 90_000;
	const began = Date.now();
	const capacity = 12_000;
	// The objective, in one place: a plain pass scores by par and stops on the goal; a driver's pass can score by
	// something the game does not have a word for (an ordered tomb) and stop when the board is organized.
	const value = options.score ?? ((board: TombState) => scoreOf(board, goal));
	const reached = options.target ?? ((board: TombState) => isGoal(board, goal));

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
		if (!second.solved && value(second.best) < value(first.best)) {
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
	const firstValue = value(start);
	const first: Node = { state: start, path: null, score: firstValue, value: firstValue, depth: 0 };
	open.push(first);
	const seen = new Set<string>([stateKey(start)]);
	/**
	 * Per board (spent bits excluded), the fewest spent cells any way of reaching it has managed. A state that
	 * arrives with a spent cell its twin did not have is strictly worse and cannot add a move the twin lacked, so
	 * it is dropped before it costs an expansion.
	 */
	const leastSpent = new Map<string, number>();
	/** Per board (fog excluded), the most cards any way of reaching it has left face down. */
	const mostFog = new Map<string, bigint>();
	const fogIndex = new Map<string, bigint>();
	start.game.cards.forEach((card, index) => fogIndex.set(shorthandCard(card), 1n << BigInt(index)));
	let best = first;
	let nodes = 1;
	let deepest = 0;
	let timedOut = false;
	const pruned = { spent: 0, fog: 0 };

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
		pruned,
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
			if (reached(node.state)) return finish(true, node.path, node.state);
			if (node.depth >= depth) continue;

			const children: Node[] = [];
			for (const move of generateMoves(node.state)) {
				nodes++;
				const path: PathLink = { action: move.action, label: move.label, prev: node.path };
				if (reached(move.next)) {
					deepest = Math.max(deepest, node.depth + 1);
					return finish(true, path, move.next);
				}
				const key = stateKey(move.next);
				if (visited.has(key)) continue;
				visited.add(key);
				const childValue = value(move.next);
				const child: Node = { state: move.next, path, value: childValue, score: childValue, depth: node.depth + 1 };
				if (childValue > best.value) best = child;
				children.push(child);
			}
			children.sort((a, b) => a.value - b.value);
			for (const child of children) stack.push(child);
			// A depth-first stack can hoard states; stop rather than eat the machine.
			if (stack.length > 40_000) break;
			options.onProgress?.({ nodes, open: stack.length, best: best.value, depth: deepest, elapsedMs: Date.now() - began });
		}
		return finish(reached(best.state), best.path, best.state);
	}

	// Beam mode: every ply advances, and only the best boards of that ply survive. Best-first can
	// stall in a plateau it can never climb out of; breadth at least keeps moving forward.
	const width = options.beamWidth ?? 0;
	if (width > 0) {
		let frontier: Node[] = [first];
		// Across the whole search, a repeated board is dropped: the line that wins cannot loop.
		const seenAll = options.dedupe === 'all' ? new Set<string>([stateKey(start)]) : null;
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
					if (reached(move.next)) {
						deepest = Math.max(deepest, ply + 1);
						return finish(true, path, move.next);
					}
					const key = stateKey(move.next);
					if (seen.has(key)) continue;
					seen.add(key);
					if (seenAll) {
						if (seenAll.has(key)) continue;
						seenAll.add(key);
					}
					const childValue = value(move.next);
					const child: Node = { state: move.next, path, value: childValue, score: childValue, depth: ply + 1 };
					children.push(child);
					if (childValue > best.value) best = child;
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
		return finish(reached(best.state), best.path, best.state);
	}

	while (open.size) {
		if (nodes >= budget) break;
		if (Date.now() - began > deadline) {
			timedOut = true;
			break;
		}

		const node = open.pop()!;
		deepest = Math.max(deepest, node.depth);
		if (reached(node.state)) return finish(true, node.path, node.state);
		if (node.depth >= depth) continue;

		for (const move of generateMoves(node.state)) {
			nodes++;
								const path: PathLink = { action: move.action, label: move.label, prev: node.path };
			if (reached(move.next)) {
				deepest = Math.max(deepest, node.depth + 1);
				return finish(true, path, move.next);
			}
			const key = stateKey(move.next);
			if (seen.has(key)) continue;
			if (CLAUSES.fogDominance) {
				const board = fogKey(move.next);
				const fog = fogMask(move.next, fogIndex);
				const held = mostFog.get(board);
				// Every face-down card of this position was already face down in that one, and that one kept more:
				// this state has spent a dig the other had not, which is the trade this clause is willing to take.
				if (held !== undefined && (held & fog) === fog && held !== fog) {
					pruned.fog += 1;
					continue;
				}
				if (held === undefined || (fog & ~held) !== 0n) mostFog.set(board, fog);
			}
			if (CLAUSES.spentDominance) {
				const board = boardKey(move.next);
				const spent = spentMask(move.next);
				const held = leastSpent.get(board);
				// A cell spent here that the earlier arrival still had in hand: everything reachable from this state
				// was reachable from that one, so the branch is a worse twin and stops here.
				if (held !== undefined && (spent & ~held) !== 0) {
					pruned.spent += 1;
					continue;
				}
				if (held === undefined || (held & ~spent) !== 0) leastSpent.set(board, spent);
			}
			seen.add(key);
			const score = value(move.next);
			const child: Node = {
				state: move.next,
				path,
				value: score,
				// Equal boards are common, so a small depth cost keeps the search from wandering through
				// shuffles that gain nothing when a shorter line of the same value exists.
				score: score - (node.depth + 1) * 0.5,
				depth: node.depth + 1,
			};
			if (child.value > best.value) best = child;
			open.push(child);
		}

		// Keep the frontier bounded: the worst boards waiting are the ones nobody will want.
		while (open.size > capacity) open.pop();
		options.onProgress?.({ nodes, open: open.size, best: best.value, depth: deepest, elapsedMs: Date.now() - began });
	}

	return finish(reached(best.state), best.path, best.state);
}

/**
 * How ordered the tomb is: the number of cards that sit on a card one rank above them in the other colour, which is
 * the only arrangement the rules pay anything for. A face-down card breaks the run it is part of, so a buried column
 * scores nothing until it is dug out — which is the point of measuring order rather than counting cards.
 */
export function orderedRuns(state: TombState): number {
	let joins = 0;
	for (const pile of state.game.tableau) {
		for (let index = 1; index < pile.length; index++) {
			const below = pile[index - 1];
			const above = pile[index];
			if (rankNumber(above.rank) !== rankNumber(below.rank) - 1) continue;
			if (isRed(above) === isRed(below)) continue;
			joins += 1;
		}
	}
	return joins;
}

const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

/**
 * The organizing phase's price list. It is deliberately not par: an ordered tomb with its fog lifted and its track
 * alive is worth more here than one that has bought two foundations with a heart and a buried column, because the
 * second phase is what turns order into foundations and it needs both the information and the health to do it.
 *
 * The terms and their reasons:
 * - **fog** pays well, because a dig is the only unconditional heal in the game and every dug card is a card the
 *   second phase can plan with rather than guess at — but see the decay below, which is what stops this term from
 *   buying the whole tomb at once.
 * - **level** pays as it does everywhere, since a level is a heal, a glyph refresh and a rank at once.
 * - **hearts** pay more here than in the flat score, which prices them at 4: this phase exists to arrive alive.
 * - **order** pays for the runs above, which is the arrangement the second phase cashes in.
 * - **room** pays a little, for the storage the arranging needs.
 * - **par** starts at a token weight so the phase can never buy progress with the other terms early, and rises towards
 *   **cash** as the fog goes, because a tomb that is nearly read is a tomb whose remaining moves should be homes.
 *   This is the ration, and it is the shape a hand-played crawl actually has: on seed 154116 the human's first
 *   foundation lands at ply 2 and their tenth by ply 56, interleaved with the digs the whole way, and they reach fog
 *   0 with the level already at 6 rather than at 1.
 * - **lowHearts** is a real charge here, unlike in the flat score: arriving at the cash-in with one heart is arriving
 *   unable to pay for it.
 */
export const ORGANIZE_WEIGHTS = {
	fog: 8,
	level: 30,
	hearts: 8,
	reach: 12,
	room: 4,
	order: 6,
	buried: 2,
	par: 1,
	/**
	 * The ration, in two prices. **decay** is how much of a dig's price is given back by the time the tomb is fully read
	 * (0 = every dig costs the full **fog** weight, 1 = the last dig costs half), and **cash** is what a par point is
	 * worth at that same moment (0 = a token, 7 = nearly the cash-in price). Both at 0 is the unrationed phase, and that
	 * is the default because it is the one that measured best across the corpus deals tried.
	 *
	 * Measured on the same four seeds at 150k a pass, as `two-phase` alone:
	 * - no ration: 3054 in 121 moves and 150250 in 119, the short deals lost.
	 * - `decay: 1, cash: 7`: 4 and 12 won (112, 121), 3054 and 150250 lost (par 327, 55).
	 * - `decay: 1, cash: 3`: 150250 in 83 moves — 36 shorter than the unrationed line — and nothing else.
	 * - `decay: 1, cash: 7, hearts: 18`: 4 and 12 won, 150250 at par 182, 3054 at par 297.
	 * So a ration is not a free improvement: the deals the two-phase arm was uniquely good at are the ones it hurts,
	 * and the deals it helps are the ones the flat arm already takes. It stays a knob until something measures better.
	 *
	 * Where it does pay is the handoff itself. On seed 154116 the unrationed phase hands over a dug tomb at level 6 and par
	 * 427 that a million states cannot move off par 427 — the board is read and arranged but unfinishable — while the
	 * rationed one hands over fog 6 at seven hearts with par 492 and the cash-in pass reaches **par 386**, the furthest
	 * any arm has taken that deal (flat's best is 434 at a million states).
	 */
	cash: 0,
	decay: 0,
	/**
	 * What a card the foundations want *right now* is worth once the tomb is fully read. It rides on top of **reach**,
	 * so it is the late value of a board that can still be finished rather than one that is merely read: `reach` 0 at the
	 * handoff means there is no home on the board at all, and a phase that hands over one of those has spent the whole
	 * arranging budget buying a position the cash-in pass cannot open.
	 *
	 * Off by default, and deliberately: at 12 the phases lose the two deals they are uniquely good at — 3054 falls from a
	 * 121-move win to par 370 and 150250 from 119 to par 301 — while gaining only seed 12, which the flat arm already
	 * takes in a thousand states. The handoff gate below gets the same guarantee for nothing.
	 */
	ready: 0,
	lowHearts: 40,
};

/**
 * The organizing phase's score, rationed by how much of the tomb is already read.
 *
 * A flat dig price is the whole reason the first version of this phase failed: it bought a dug tomb at level 1 with par
 * still at 491, which is a board that has read every card and arranged nothing, and the cash-in pass could make
 * nothing of it. So the price of a dig decays with the tomb — the *marginal* price of the next dig is what matters, and
 * here it falls linearly from the full **fog** weight to half of it by the time every card is up — while the price of a
 * par point climbs from the token **par** weight to **cash**. Early on that means digs are the best thing on the board
 * by a wide margin; late, a foundation is worth nearly as much as it is in the cash-in pass, so the phase starts
 * interleaving homes on its own.
 *
 * The absolute weight only matters against the other terms, which is why this is a blend of two prices rather than a
 * pair of numbers to tune against each other: at the start of a crawl a dig is worth `fog` and a par point is worth
 * `par`, and at the end a dig is worth `fog / 2` and a par point is worth `cash`.
 */
export function organizeScoreFor(hiddenAtStart: number): (state: TombState) => number {
	return (state: TombState) => {
		const w = ORGANIZE_WEIGHTS;
		const remaining = state.hidden.length;
		const dug = Math.max(0, hiddenAtStart - remaining);
		const share = hiddenAtStart > 0 ? Math.min(1, dug / hiddenAtStart) : 1;
		const blocked = foundationPull(state);
		const hearts = hp(state);
		return (
			dug * w.fog * (1 - (share * w.decay) / 2) +
			currentLevel(state) * w.level +
			hearts * w.hearts +
			blocked.reach * (w.reach + w.ready * share) +
			emptyCells(state).length * w.room +
			orderedRuns(state) * w.order -
			blocked.buried * w.buried +
			(500 - tombPar(state)) * (w.par + w.cash * share) -
			(hearts <= 1 ? w.lowHearts : 0)
		);
	};
}

/**
 * The two-phase driver: organize, then cash in.
 *
 * A single flat score has to answer "is this board better" for both halves of a crawl at once, and it cannot: the
 * opening of a long win is thirty moves of digging and stacking that change par by nothing, and any frontier that
 * prices par will walk away from it. So the first pass is scored on *order* — fog lifted, runs joined, hearts kept,
 * levels gained — and the second pass starts from the board that pass reached and is scored on par as usual. Nothing
 * about the rules changes between the passes; only what the search is asked to value.
 *
 * The split is honest about its trade: the first pass cannot use the whole budget, because a search that organizes
 * perfectly and then has twenty states left to cash in has proved nothing. `phaseSplit` gives the organizing phase
 * half the nodes by default, and the cash-in pass gets everything the first did not spend.
 *
 * The first pass deliberately has no stopping condition of its own — not "the fog is gone". Measured on seed 154116,
 * a dug-out target fires after 56 moves and a thousand states, with the level at 1 and the par still at 496, and the
 * handoff board is worse than useless: the cash-in pass then grinds for three hundred thousand states without ever
 * getting home. Digging is cheap for a search; it is the *foundations* that are expensive, and a phase that stops as
 * soon as the tomb is read stops before the expensive part. So the first pass spends its share and hands over the
 * best-organized board it found, whatever that is.
 */
/**
 * The handoff test. A board is only worth handing to the cash-in pass if a home is actually on it: `reach` is the count
 * of cards the foundations want that can be played there and then, and a board with none of them is a board the second
 	 * pass can only shuffle — measured on seed 154116, a million states off exactly that board moved par by nothing.
	 *
	 * It costs nothing where the organizing pass already hands over a live board (seeds 3054 and 150250 at 150k are
	 * unchanged with the gate on and off) and it never chooses a board the pass would not have chosen when that board is
	 * finishable, so it is on by default; the price that keeps a *live* board lates in the phase is `ready`, which
	 * measured worse on those same two deals and stays at 0.
	 *
	 * So the driver walks its own organizing line back from the best board and takes the deepest board with a home on it,
 * rather than the best board regardless. The walk is free: the line is already in hand, and each of its steps carries its
 * state.
 */
function finishableHandoff(best: TombState, steps: SolveStep[]): TombState {
	if (foundationPull(best).reach > 0) return best;
	for (let index = steps.length - 1; index >= 0; index--) {
		const board = steps[index].state;
		if (foundationPull(board).reach > 0) return board;
	}
	return best;
}

export function solveTwoPhase(options: SolveOptions = {}): SolveResult {
	const goal: Goal = options.goal ?? 'clear';
	const began = Date.now();
	const budget = Math.max(2000, options.nodes ?? 200_000);
	const deadline = options.timeBudgetMs ?? 90_000;
	const share = Math.min(0.85, Math.max(0.15, options.phaseSplit ?? 0.5));
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);

	const organize = solveTomb({
		state: start,
		goal,
		engine: 'flat',
		strategy: 'best',
		depth: options.depth,
		nodes: Math.round(budget * share),
		timeBudgetMs: Math.round(deadline * 0.6),
		score: organizeScoreFor(start.hidden.length),
	});

	const handoff = options.handoff === 'finishable' ? finishableHandoff(organize.best, organize.bestSteps) : organize.best;
	const cashIn = solveTomb({
		state: handoff,
		goal,
		engine: 'flat',
		strategy: options.strategy === 'hybrid' ? 'best' : options.strategy,
		beamWidth: options.beamWidth,
		depth: options.depth,
		nodes: Math.max(1000, budget - organize.nodes),
		timeBudgetMs: Math.max(2000, deadline - organize.elapsedMs),
	});

	const organized = handoff === organize.best ? organize.bestSteps : organize.bestSteps.slice(0, organize.bestSteps.findIndex((step) => step.state === handoff) + 1);
	const cashed = cashIn.solved ? cashIn.steps : cashIn.bestSteps;
	const cashBoard = cashIn.best;
	// The better final board decides when neither pass won: a dug tomb that never got cashed in is still the better
	// answer to show than the board the first pass started from.
	const takeCash = cashIn.solved || scoreOf(cashBoard, goal) >= scoreOf(organize.best, goal);
	return {
		goal,
		solved: cashIn.solved,
		steps: cashIn.solved ? [...organized, ...cashed] : [],
		best: cashIn.solved ? cashBoard : takeCash ? cashBoard : organize.best,
		bestSteps: cashIn.solved || takeCash ? [...organized, ...cashed] : organized,
		plies: organized.length + cashIn.plies,
		nodes: organize.nodes + cashIn.nodes,
		elapsedMs: Date.now() - began,
		timedOut: organize.timedOut || cashIn.timedOut,
		pruned: {
			spent: (organize.pruned?.spent ?? 0) + (cashIn.pruned?.spent ?? 0),
			fog: (organize.pruned?.fog ?? 0) + (cashIn.pruned?.fog ?? 0),
		},
	};
}

/**
 * Flat first, phases second: the two drivers above are better at different deals, and the comparison says so plainly.
 * Over the same eight seeds at 150k states, the flat search cracks the short deals in a couple of thousand states and
 * never touches the long ones, while the two-phase driver wins two deals the flat search cannot reach at all — and
 * loses both of the short ones, because it spends its organizing half-budget on a tomb that did not need reading.
 *
 * So this driver buys the short end with a cheap first pass and then hands the long end to the phases with everything
 * the first pass did not spend. It is strictly the better arm of the two on paper, and the cost is honest: an
 * unsolved deal now pays for both attempts.
 */
export function solveFallback(options: SolveOptions = {}): SolveResult {
	const goal: Goal = options.goal ?? 'clear';
	const began = Date.now();
	const budget = Math.max(2000, options.nodes ?? 200_000);
	const deadline = options.timeBudgetMs ?? 90_000;
	const warm = Math.min(0.8, Math.max(0.1, options.warmUp ?? 0.4));
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);

	const flat = solveTomb({
		...options,
		state: start,
		engine: 'flat',
		nodes: Math.max(1000, Math.round(budget * warm)),
		timeBudgetMs: Math.round(deadline * 0.6),
	});
	if (flat.solved) return flat;

	const phased = solveTwoPhase({
		...options,
		state: start,
		nodes: Math.max(1000, budget - flat.nodes),
		timeBudgetMs: Math.max(2000, deadline - flat.elapsedMs),
	});
	const spend = { nodes: flat.nodes + phased.nodes, elapsedMs: Date.now() - began };
	if (phased.solved) return { ...phased, ...spend };
	const flatBetter = scoreOf(flat.best, goal) >= scoreOf(phased.best, goal);
	return {
		...phased,
		...spend,
		solved: false,
		steps: [],
		best: flatBetter ? flat.best : phased.best,
		bestSteps: flatBetter ? flat.bestSteps : phased.bestSteps,
		timedOut: flat.timedOut || phased.timedOut,
	};
}

/** A one-line summary of a board, for the printed solution's trailing column. */
export function boardSummary(state: TombState): string {
	return `fog ${state.hidden.length}  hp ${hp(state)}/${maxHp(state)}  lvl ${currentLevel(state)}  par ${tombPar(state)}  ${parCleared(state).toFixed(1)}%`;
}
