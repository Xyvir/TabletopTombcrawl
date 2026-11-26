import { getRankForCompare, shorthandCard, type Card, type CardLocation } from './game/card/card';
import {
	CLAUSES,
	FREE_CELL_COUNT,
	abilityUsable,
	cellTopWounded,
	armedClick,
	attackWith,
	bossSlain,
	isBoss,
	canBuildOn,
	cardAt,
	canRevealFaceDown,
	immobileBoss,
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
	canConvert,
	conversionTarget,
	convertChip,
	convertibleCell,
	pickpocketUsable,
	restockSuits,
	revealFaceDown,
	bossProtected,
	tombMove,
	tombPar,
	tombRun,
	useAbility,
	type Difficulty,
	type TombState,
} from './tombcrawl';
import {
	armLabel,
	cardName,
	convertLabel,
	digLabel,
	homeLabel,
	moveLabel,
	parkLabel,
	pickpocketLabel,
	where,
} from './notation';

export type Goal = 'clear' | 'boss';

/**
 * Which driver runs the search. `flat` is the original single-objective policy (best-first, beam, greedy or the
 * beam-then-best hybrid); `two-phase` is the organizing-then-cashing-in driver below. The engine is an option rather
 * than a replacement so the two can be run side by side on the same deal, which is the only honest way to say one is
 * better: `scripts/compare-engines.ts`.
 */
export type SolverEngine = 'flat' | 'two-phase' | 'fallback' | 'plan' | 'modes';

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
	| { kind: 'purity'; cell: number; column: number }
	/** The Hero Chip, clicked: one hero aspect spent for one wound. */
	| { kind: 'convert' }
	/** Pickpocket, armed on the item pocket and aimed at an exposed card. */
	| { kind: 'pickpocket'; cell: number; at: CardLocation };

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
		case 'convert':
			return convertChip(state);
		case 'pickpocket': {
			const armed = useAbility(state, action.cell);
			if (!armed) return null;
			return armedClick(armed, action.at);
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

	// The explicit conversion: the Hero Chip spends the hero aspect beside it for one wound.
	if (canConvert(state)) {
		const entry = conversionTarget(state);
		if (entry) add({ kind: 'convert' }, convertLabel(entry.name, entry.cell), convertChip(state));
	}

	// Pickpocket's window: the item pocket trades with any exposed card of the tableau.
	if (state.pickpocket !== null && pickpocketUsable(state, state.pickpocket)) {
		const slot = state.pickpocket;
		for (let c = 0; c < state.game.tableau.length; c++) {
			const pile = state.game.tableau[c] ?? [];
			const top = pile[pile.length - 1];
			if (!top || isFaceDown(state, top)) continue;
			const at = column(c, pile.length - 1);
			const action = { kind: 'pickpocket' as const, cell: slot, at };
			add(action, pickpocketLabel(top, at), applyAction(state, action));
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
	/**
	 * Allowed moves inside one pass. The modes driver uses it to fence each phase into its own kind of
	 * work — homes home, digs heal, sorts arrange — so a sorting phase can never spend the fog a heal
	 * phase banks on. Flat passes without it behave exactly as before. The state is the board the move
	 * would leave from, so a gate can read what the move costs (a convert that heals nothing, for one).
	 */
	allow?: (action: SolverAction, state?: TombState) => boolean;
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
		// Everyone else must feed the suit the slot just lost; a Thief who won the pocket with a kill takes any
		// card at all, though one he emptied into the crypt only takes another suit (see restockSuits).
		for (const suit of restockSuits(window)) {
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
 * it. "Less dug" is a heuristic rather than a rule — a face-down card is a heal and a fogged column, while a
 * revealed one is a playable card and a clogged hallway — so this is ordered, not proven, and it
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
		const window = state.itemWindow;
		// The three window widths are different positions: one takes a suit, one any card, one any but a suit.
		mix(window.cell * 32 + (window.takes === 'any' ? 1 : window.takes === 'other' ? 2 : 0));
		mixText(window.role);
		mixText(window.suit);
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
	if (options.engine === 'plan') return solvePlanned(options);
	if (options.engine === 'modes') return solveModes(options);
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
	const allow = options.allow;

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
				if (allow && !allow(move.action, node.state)) continue;
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
					if (allow && !allow(move.action, node.state)) continue;
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
			if (allow && !allow(move.action, node.state)) continue;
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

/**
 * The release-order planner: a clear is 48 ordered events — every foundation rank is gated on the one
 * before it — so instead of pricing boards by how much par they hold, this driver prices them by how
 * close the *next* cards are to coming home, frees the cheapest one with a short focused search, and
 * repeats. Par cannot see that plan at all: the opening of a long human win is ninety moves of digging
 * and stacking that change par by almost nothing, which is exactly why a frontier that prices par walks
 * away from it. Release cost can see it, because every dig and every parked card is one move closer to
 * a home. The phases chain because a home never comes back out of a foundation.
 */
interface PlanNeed {
	suit: SolverSuit;
	rank: number;
}

/**
 * A card's rank as a number, on the game's own words. The solver's `rankNumber` reads the short names
 * (`'A'`, `'J'`) while cards carry the full ones (`'ace'`, `'jack'`), so it scores every face card as zero;
 * the planner needs the real numbers, and this is where it gets them. (That older quirk is load-bearing
 * for the flat weights now, so it stays where it is.)
 */
const planRank = (card: Card): number => getRankForCompare(card.rank) + 1;

/** The top of each foundation grave: what each suit has already paid. */
export function planTops(state: TombState): Record<SolverSuit, number> {
	const tops: Record<SolverSuit, number> = { hearts: 0, clubs: 0, diamonds: 0, spades: 0 };
	for (const card of state.game.cards) {
		if (card.location.fixture !== 'foundation') continue;
		const rank = planRank(card);
		if (rank >= 1 && rank <= 13 && rank > tops[card.suit]) tops[card.suit] = rank;
	}
	return tops;
}

/**
 * The cards the foundations are waiting on: the lowest unhomed rank of each suit, skipping a suit whose
 * card is held by the party. A drafted card can never come home, so its suit is stalled for the rest of
 * the run and planning around it would be planning a line that does not exist.
 */
export function planNeeds(state: TombState, tops: Record<SolverSuit, number>): PlanNeed[] {
	const drafted = new Set(state.draft.map((entry) => entry.id));
	const needs: PlanNeed[] = [];
	for (const suit of SUITS) {
		if (tops[suit] >= 13) continue;
		// A drafted card counts as already home: it opens the rank above it and never withholds the ranks
		// below, so a suit whose next card is held by the party is not stalled — the card above the phantom is
		// homeable by the skip rule and is the suit's real need. Dropping the whole suit here is how a track
		// with four phantom-blocked suits stops at 37 homes with an empty needs list and no miss to show for
		// it; worse, it is the standing invitation to play the draft out of its slots to unstall by hand.
		let rank = tops[suit] + 1;
		while (rank <= 13) {
			const card = state.game.cards.find(
				(candidate) => candidate.suit === suit && planRank(candidate) === rank && candidate.location.fixture !== 'foundation',
			);
			if (!card) break;
			if (!drafted.has(shorthandCard(card))) {
				needs.push({ suit, rank });
				break;
			}
			rank++;
		}
	}
	return needs;
}

/** What a release is measured against: the graves, the room, and what a home may still cost. */
interface ReleaseContext {
	tops: Record<SolverSuit, number>;
	free: number;
	level: number;
	hearts: number;
	lagging: number;
	leading: number;
}

/**
 * Estimated moves to get a needed card home: its cover, its fog, whether there is anywhere to put the
 * cover — and whether the track can pay the home itself. A home costs a heart per rank above the level and
 * the track spends every heart but the last, so a parked card the level cannot afford is not a free home but
 * a trap: it scores zero cover with nothing left to do. Pricing that in is what keeps the gradient pointed
 * at the cover that can actually move. Advancing the lagging grave is priced as progress on its own, because
 * that is what a level is read off, and a level is a heal.
 */
function releaseCost(state: TombState, need: PlanNeed, context: ReleaseContext): number | null {
	const card = state.game.cards.find(
		(candidate) => candidate.suit === need.suit && planRank(candidate) === need.rank && candidate.location.fixture !== 'foundation',
	);
	// No such card off the foundation: it is already home, which is not a price but the absence of one.
	if (!card) return null;
	const price = Math.max(0, need.rank - context.level);
	const bill = price > context.hearts - 1 ? 40 : price * 2;
	// The level is read off the lowest grave, and every home above it is paid in wounds: climbing a high
	// grave while another lags is how a track bleeds out at level 3 with four wounded cells. The pull toward
	// the lagging grave scales with the spread, so an even tomb plans freely and a lopsided one corrects.
	const ahead = -6 * (context.leading - context.tops[need.suit]);
	const loc = card.location;
	if (loc.fixture === 'cell') return bill + ahead;
	if (loc.fixture !== 'cascade') return 8 + bill + ahead;
	const pile = state.game.tableau[loc.data[0]] ?? [];
	let above = 0;
	let fog = 0;
	let homable = 0;
	for (let index = loc.data[1] + 1; index < pile.length; index++) {
		above++;
		const cover = pile[index];
		if (isFaceDown(state, cover)) fog++;
		else if (planRank(cover) === context.tops[cover.suit] + 1) homable++;
	}
	const self = isFaceDown(state, card) ? 3 : 0;
	const deficit = Math.max(0, above - homable - context.free - 2);
	// The cover count assumes the pile top can be taken hold of — parked, dug, homed or built on. A top that
	// nothing can move (a queen with no king out, an unliftable boss) makes the need beneath unreachable, and
	// a release priced as moves is a lie the search pays for by burying the rest of the board against it:
	// phase 4 on 154116 spent 32 moves and 10k states digging at an ace under an immovable queen and left a
	// tomb with one legal move. Price the lie as what it is and the planner works the suits that can move.
	if (above > 0 && !pileTopMovable(state, loc.data[0], context)) return 500 + bill + ahead;
	return above * 2 + fog + self + deficit * 6 + bill + ahead;
}

/**
 * Whether anything can take hold of a pile's top card. The check is exact for the single top: a run's landing
 * is read off its bottom card, which is the top, and a lone card always fits the carry limit — so longer runs
 * never open a landing the top alone lacks. (A lonelier rulebook would also ask after PISORF pairs and armed
 * WEYTWUT foggings; those move two cards where one would do, and the search finds them when they pay.)
 */
function pileTopMovable(state: TombState, pileIndex: number, context: ReleaseContext): boolean {
	const pile = state.game.tableau[pileIndex] ?? [];
	const top = pile[pile.length - 1];
	if (!top) return true;
	// A dig takes hold of fog, and an armed moving glyph takes hold of the boss: those are the tomb's two ways
	// past a top no hand can shift. Anything else immobile is stuck until the board changes around it.
	if (isFaceDown(state, top)) return true;
	if (isBoss(state, top)) return !immobileBoss(state, top);
	if (emptyCells(state).length > 0) return true;
	// Home takes hold of a wanted card the track can pay; the bill already prices the ones it cannot.
	if (planRank(top) === context.tops[top.suit] + 1 && planRank(top) - context.level <= context.hearts - 1) return true;
	for (let index = 0; index < state.game.tableau.length; index++) {
		if (index === pileIndex) continue;
		if (canBuildOn(state, [top], { fixture: 'cascade', data: [index, 0] })) return true;
	}
	return false;
}

/** Every suit's release price on one board, for the trace. */
export function planCosts(state: TombState): { suit: string; rank: number; cost: number | null }[] {
	const context = releaseContext(state);
	const out: { suit: string; rank: number; cost: number | null }[] = [];
	for (const suit of SUITS) {
		if (context.tops[suit] >= 13) continue;
		out.push({ suit, rank: context.tops[suit] + 1, cost: releaseCost(state, { suit, rank: context.tops[suit] + 1 }, context) });
	}
	return out;
}

/** The context a release is measured against, read off the board it starts from. */
function releaseContext(state: TombState): ReleaseContext {
	const tops = planTops(state);
	return {
		tops,
		free: emptyCells(state).length,
		level: currentLevel(state),
		hearts: hp(state),
		lagging: Math.min(tops.hearts, tops.clubs, tops.diamonds, tops.spades),
		leading: Math.max(tops.hearts, tops.clubs, tops.diamonds, tops.spades),
	};
}

/**
 * Foreign cards squatting in draft slots: the slot's tool is out and something else sits where it lay. A draft
 * slot below the chip does not hand its card back — conversions run in order — so a parked card there is
 * locked until the chip arrives, and on 2769 the planner fills all four slots (boss included) and triple-misses
 * with the ace it needs to move on locked underneath. Plain pockets hand back freely; the score says so.
 */
function squatters(state: TombState): number {
	let squatting = 0;
	for (const entry of state.draft) {
		const card = state.game.cells[entry.cell];
		if (card && shorthandCard(card) !== entry.id) squatting++;
	}
	return squatting;
}

/**
 * Cards the boss is sitting on: unhomed, undrafted cards beneath it in its column. Lifting the boss is the
 * only way to release them short of slaying it, and the landing it needs (a queen to build on, or a fogged
 * column to bury onto) disappears as the tomb clears — so the price of leaving it grows while the means
 * shrink. The human line lifts KH on ply 11, before anything is trapped; every planner stall so far has been
 * a needed card under an unmoved boss with no fog left to bury it onto. Pricing the blockage is what gets the
 * boss moved on time: the lift is two moves (arm, lift) that no home-chasing gradient will ever buy.
 */
function bossBlockedCount(state: TombState): number {
	if (!state.bossId || bossSlain(state)) return 0;
	const boss = state.game.cards.find((card) => isBoss(state, card));
	if (!boss || boss.location.fixture !== 'cascade') return 0;
	const pile = state.game.tableau[boss.location.data[0]] ?? [];
	const drafted = new Set(state.draft.map((entry) => entry.id));
	let blocked = 0;
	for (let index = 0; index < boss.location.data[1]; index++) {
		const card = pile[index];
		if (card && !drafted.has(shorthandCard(card))) blocked++;
	}
	return blocked;
}

/**
 * Royalty sitting under the boss: jacks and better, the cards every suit needs last. A boss on low cards is a
 * midgame blockage — the suits demand those cards soon and the phases dig them out as a matter of course. A
 * boss on royalty is an endgame blockage wearing a midgame face: nothing demands a jack until ten homes are
 * in, by which time the lifts are spent and the fog is gone. On 154116 the planner lifts KH onto an exposed
 * JH at move 21 (five blockers for one — the count says it is a bargain) and never lifts it off again.
 */
function royaltyBlocked(state: TombState): number {
	if (!state.bossId || bossSlain(state)) return 0;
	const boss = state.game.cards.find((card) => isBoss(state, card));
	if (!boss || boss.location.fixture !== 'cascade') return 0;
	const pile = state.game.tableau[boss.location.data[0]] ?? [];
	const drafted = new Set(state.draft.map((entry) => entry.id));
	let blocked = 0;
	for (let index = 0; index < boss.location.data[1]; index++) {
		const card = pile[index];
		if (card && !drafted.has(shorthandCard(card)) && planRank(card) >= 11) blocked++;
	}
	return blocked;
}

/**
 * Whether a lift is on the table right now: a CYDSTEPP home in its slot and ready to arm. Using a glyph never
 * moves its card, so one ready glyph is lifts without end — but only while it is ready; an exhausted glyph
 * waits on a level and a spent one never comes back, and an unblock phase with no lift in it is budget burnt
 * for nothing. Other glyphs cannot lift, and kin, class and consumables convert by leaving.
 */
function liftReady(state: TombState): boolean {
	for (const entry of state.draft) {
		if (entry.name !== 'CYDSTEPP') continue;
		const card = state.game.cells[entry.cell];
		if (!card || shorthandCard(card) !== entry.id) continue;
		if (abilityUsable(state, entry.cell)) return true;
	}
	return false;
}

/**
 * CYDSTEPPS not ready to lift: exhausted by a bury, or spent as a build. Arming one for routine cover is
 * cheap in the moment and ruinous in hindsight — on 154116 the move-15 bury spends the freshness the
 * move-22 re-lift needs, and the endgame dies with both glyphs home but neither ready. Twelve a head while
 * the boss is still unsafe, because a level refreshes what a bury spends: the price comes off on its own,
 * so lines that lift after levelling pay nothing and lines that bury before levelling pay for the risk.
 */
function dullGlyphs(state: TombState): number {
	let dull = 0;
	for (const entry of state.draft) {
		if (entry.name !== 'CYDSTEPP') continue;
		const card = state.game.cells[entry.cell];
		if (!card || shorthandCard(card) !== entry.id || state.exhausted[entry.cell]) dull++;
	}
	return dull;
}

/**
 * The party the phase started with: every draft entry's card and cell. A draft card that leaves its cell is
 * spent — the entry is consumed and no level brings it back — and the planner spends them like spare builds:
 * on 154116 it plays out both CYDSTEPPS and the Wizard midgame, and the endgame then needs a lift no hand
 * can make (c7[JH KH], par 130, three cards from home). The human never plays an item out in 131 moves; the
 * score charges thirty a head for the ones that leave, which is what a firing line full of homes still
 * cannot pay. The baseline rides the phase because restocks and conversions legitimately rewrite the draft —
 * what matters is only whether the tools the phase started with are still in their slots.
 */




/** The planner's price, taken apart for the trace. */
export function planBreakdown(state: TombState): {
	cheapest: number;
	hp: number;
	par: number;
	reach: number;
	hidden: number;
	level: number;
	blocked: number;
	squat: number;
	dull: number;
	spent: number;
	order: number;
} {
	const context = releaseContext(state);
	let cheapest = 0;
	let found = false;
	for (const suit of SUITS) {
		if (context.tops[suit] >= 13) continue;
		const cost = releaseCost(state, { suit, rank: context.tops[suit] + 1 }, context);
		if (cost === null) continue;
		if (!found || cost < cheapest) {
			cheapest = cost;
			found = true;
		}
	}
	return {
		cheapest,
		hp: hp(state),
		par: 500 - tombPar(state),
		reach: foundationPull(state).reach,
		hidden: state.hidden.length,
		level: currentLevel(state),
		blocked: bossBlockedCount(state),
		squat: squatters(state),
		// Party spent: conversions and draft cards played out shrink the draft for good (a restock
		// feed is the only way one comes back). Midgame that is the endgame fuel burnt for one
		// heart; late, with the tomb nearly home, it is the gesture itself. The score prices it,
		// not the move, so the search feels the empty slot on every board after it.
		spent: Math.max(0, 4 - state.draft.length),
		// Arrangement the release price cannot see: runs already joined on the board. The cheapest
		// home leads, but two boards one home away are not equal when one of them has the next
		// three covers already stacked — that is the sorting the human intersperses with the
		// homing to keep fogged cards playable instead of stranding them behind cover.
		order: orderedRuns(state),
		// Freshness is worth protecting only when there is a spare to keep: a lone CYDSTEPP is the whole
		// lifting corps, and taxing its every routine bury reroutes the tomb around a tool it cannot spare
		// (150250: par 214 to 460 with the tax on, exactly 214 with it off). Two or more may spell each other
		// while one stays ready, which is the only arrangement the re-lift can count on.
		// A lone CYDSTEPP pays this too, and on 150250 the reroute lands worse (par 214 to 460, still lost)
		// while on 2769 it lands better (lost to a 120-move win) — the same tight use-level cycle, lucky in
		// one tomb and unlucky in another. No count of glyphs carves that difference, so the price stays
		// unconditional and the next sweep adjudicates it by squares, not pars.
		dull: state.bossId && !bossSlain(state) && bossBlockedCount(state) > 0 ? dullGlyphs(state) : 0,
	};
}

/**
 * The planner's price: how close the closest home is, in estimated moves. Everything else is small change
 * beside it — hearts to stay alive, a little par so opportunistic progress is still progress, reach for the
 * homes already on the board, fog gone, levels gained. One price per board, and the cheapest home leads.
 */
function planScore(state: TombState): number {
	const parts = planBreakdown(state);
	// Endgame fuel, priced: a spent party slot costs most at full hearts on a fresh tomb and
	// least when the track is empty and the foundations are nearly full. A midgame convert for
	// one heart (+1.5 here) never pays its slot back, so the search digs or sorts instead; a
	// last-heart convert with par nearly gone costs little more than the heart it mends, which is
	// the human's own endgame. Progress is par banked over a full clear (~480); hearts are the
	// share of the track still alive.
	const progress = Math.min(1, Math.max(0, parts.par / 480));
	const heartShare = maxHp(state) > 0 ? hp(state) / maxHp(state) : 1;
	const spentPrice = parts.spent * (10 + 12 * heartShare + 8 * (1 - progress));
	return (
		-parts.cheapest * 6 +
		parts.hp * 1.5 +
		parts.par * 0.2 +
		parts.reach * 2 -
		parts.hidden * 0.5 +
		parts.level * 2 +
		parts.order * 3 -
		spentPrice +
		// An empty cell is a place to put cover; a whisper of it keeps a gridlocked board from scoring standing
		// still above the move that would unlock it. More than a whisper buys hoarding instead (measured: 3/cell
		// stalls seed 154116 at 6 homes where 1/cell walks past), because the planner starts keeping cells empty
		// rather than spending them on the release. The flat score prices room at zero and means it.
		emptyCells(state).length * 1 -
		// A card under the boss is a card no hand can touch until the boss moves or dies, and the lift needs a
		// landing that the clearing tomb destroys. Each blocked card prices the lift the search will not buy
		// on a home gradient, so the boss moves while there is still somewhere to put it — and what it must
		// never do is sit down on fresh cards: the human's own lifts never raise the count, and a firing line
		// that parks the boss onto an unhomed jack has traded two homes now for a tomb that cannot finish.
		// Measured: at 8 the planner still takes that trade on 154116 and strands JH under KH three cards
		// from home; at 25 it leaves the boss where it lies. Bend, not break — a tomb with nowhere safe for
		// the boss still lets the search touch it, at a price.
		bossBlockedCount(state) * 25 -
		// A plain pocket hands its card back; a draft slot below the chip does not, so a foreign card parked
		// there is locked until the chip arrives. Eight a squatter keeps the parking in the pockets, where a
		// later phase can still take hold of it — the human's parks never touch the party's slots at all.
		parts.squat * 8 -
		// A wounded draft slot, priced like a squatter: the ability is locked either way, and the
		// convertible one holds the whole conversion chain hostage. Eight is the squat price, so a
		// wound that locks a lived-in slot reads the same as a stranger sitting in it.
		// A glyph spent on routine cover while the boss is unsafe is the re-lift thrown away: twelve a dull
		// head, which a bury's handful cannot pay but a level wipes clean. Bend, not break — a tomb whose
		// only way forward is a bury still buries, and the lift that moves the boss pays it gladly.
		// (Sign corrected: dull glyphs cost, never pay — the old `+` rewarded spending the freshness.)
		parts.dull * 12
	);
}

/**
 * A need whose card sits wounded in a pocket: the wound has to be healed face up first, so no
 * cover-clearing makes it payable — only a heal unlocks it. Cascade fog is not a lock (a dig reads
 * it); a wounded pocket is, until something mends it. Phases that demand a locked lagging grave burn
 * doubled budget chasing an illegal home and quit with budget unspent: seed 822 sits 91 moves in at
 * par 453 with 92k of 200k spent, S4 wounded in its cell while H5 and C5 lie exposed, because the
 * lagging-only end condition cannot see the homes it is allowed to take.
 */
function needWoundLocked(state: TombState, need: PlanNeed): boolean {
	const card = state.game.cards.find(
		(candidate) => candidate.suit === need.suit && planRank(candidate) === need.rank && candidate.location.fixture !== 'foundation',
	);
	if (!card || card.location.fixture !== 'cell') return false;
	return cellTopWounded(state, card.location.data[0]);
}

/**
 * Free the cheapest home, then look again. Each phase is a short best-first search scored by release cost
 * and stopping the moment any needed card goes home or the boss falls. Three phases in a row with no new
 * home means the plan is stuck, and the driver stops rather than grinding the same cover forever.
 */
export function solvePlanned(options: SolveOptions = {}): SolveResult {
	const goal: Goal = options.goal ?? 'clear';
	// A boss run's objective is one card, so the due is the boss suit's chain plus whatever lags the level
	// that prices the kill — the release machinery is the same, but the driver stops at the slay instead of
	// demanding the bare tomb. That is the whole difference: same phases, narrower due, earlier stop.
	const bossRun = goal === 'boss';
	const began = Date.now();
	const budget = Math.max(10_000, options.nodes ?? 2_000_000);
	const deadline = options.timeBudgetMs ?? 600_000;
	const basePhase = Math.min(40_000, Math.max(10_000, Math.round(budget / 60)));
	let phaseBudget = basePhase;
	// Homes stood at the last unblock miss: a lift with no landing today may have one after the next home,
	// but never before, so the attempt waits on progress instead of burning budget every iteration.
	let homesAtUnblockMiss = -1;
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);
	const isClear = (state: TombState) => state.game.cards.every((card) => card.location.fixture === 'foundation');
	const isWon = (state: TombState) => (bossRun ? bossSlain(state) : isClear(state));

	let state = start;
	const line: SolveStep[] = [];
	let nodes = 0;
	let failures = 0;
	let homes = state.game.cards.filter((card) => card.location.fixture === 'foundation').length;
	let timedOut = false;

	for (let phase = 0; phase < 150; phase++) {
		if (isWon(state)) {
			return {
				goal,
				solved: true,
				steps: line,
				best: state,
				bestSteps: line,
				plies: line.length,
				nodes,
				elapsedMs: Date.now() - began,
				timedOut,
			};
		}
		if (nodes >= budget || Date.now() - began > deadline) {
			timedOut = Date.now() - began > deadline;
			break;
		}
		const tops = planTops(state);
		const needs = planNeeds(state, tops);
		const bossAlive = !!state.bossId && !bossSlain(state);
		// No break when the needs run out: with every grave topped there is no next card, but the low cards
		// skipped over by phantoms may still lie about the tomb, exposed and homeable. The phase runs anyway
		// with an empty due, and the target below ends it on any home (mop-up). If nothing is homeable the
		// phase misses, and three misses stop the driver. (A fully homed tomb never reaches here: isClear at
		// the loop top already returned the win.)
		const startLevel = currentLevel(state);
		const startHp = hp(state);
		const startBlocked = bossBlockedCount(state);
		const startHomes = homes;
		// The boss sits on royalty: jacks and better, the cards every suit needs last. Nothing demands them
		// until the tomb is nearly empty, by which time the lifts are spent and the fog is gone — so the lift
		// happens now, before the home phases, while a glyph is ready and the tomb is still fogged. The human's
		// own line does exactly this on 154116: lifts KH onto JH at ply 12, then lifts it straight off again
		// at ply 28 and digs the jack out from underneath. The count-based target below cannot see the job —
		// any landing buries the count deeper — so this phase scores royalty, not bodies, and ends the moment
		// no jack or better lies under the boss. A miss costs nothing and changes nothing: the lift may be
		// impossible yet and possible after the next home, so only a home re-arms the attempt and failures
		// never hear of it.
		if (bossAlive && royaltyBlocked(state) > 0 && liftReady(state) && homes !== homesAtUnblockMiss) {
			const startRoyalty = royaltyBlocked(state);
		const unblock = solveTomb({
				state,
				goal: 'clear',
				engine: 'flat',
				strategy: 'best',
				depth: 90,
				nodes: Math.min(2000, Math.max(500, budget - nodes)),
				timeBudgetMs: Math.max(2000, deadline - (Date.now() - began)),
				score: (board) => planScore(board) + 25 * bossBlockedCount(board) - 100 * royaltyBlocked(board),
				target: (board) => royaltyBlocked(board) < startRoyalty || bossSlain(board),
			});
			nodes += unblock.nodes;
			timedOut = timedOut || unblock.timedOut;
			if (unblock.solved) {
				for (const step of unblock.steps) line.push(step);
				state = unblock.steps.length ? unblock.steps[unblock.steps.length - 1].state : unblock.best;
				failures = 0;
				homes = state.game.cards.filter((card) => card.location.fixture === 'foundation').length;
				phaseBudget = basePhase;
				continue;
			}
			homesAtUnblockMiss = homes;
		}
		// The level is read off the lowest grave, so only a home on a lagging suit moves it — and a level is
		// a heal that makes every later home cheaper. A phase that ends on an exposed high card while another
		// suit lags is how a track climbs to D5/S5 at level 3 with four wounded cells. So the phase is only
		// over when a lagging grave moves (or the boss falls); other homes are welcome along the way — they
		// still count as progress — but they do not end the phase early.
		const floor = Math.min(tops.hearts, tops.clubs, tops.diamonds, tops.spades);
		const lagging = new Set(SUITS.filter((suit) => tops[suit] === floor));
		const owing = needs.filter((need) => lagging.has(need.suit));
		const lagDue = bossRun
			? needs.filter((need) => need.suit === state.bossSuit || lagging.has(need.suit))
			: owing.length
				? owing
				: needs;
		// A lagging grave that is entirely wound-locked cannot move no matter what the cover does: broaden
		// the phase to every need, so the exposed homes it is allowed to take still end the phase instead
		// of missing against an illegal one. Boards with an actionable lagging grave read exactly as before.
		const due = lagDue.length && lagDue.every((need) => needWoundLocked(state, need)) ? needs : lagDue;
		// A home costs a heart per rank above the level and the track spends every heart but the last, so a
		// phase that chases a home it cannot pay is a phase that grinds cover for nothing. When nothing owing
		// is payable, the phase heals instead: a dig is the only unconditional heal, and the track banks it.
		const affordable = due.filter((need) => Math.max(0, need.rank - startLevel) <= startHp - 1);
		// A wound-locked need reads affordable — its price is fine — but no heal short of the wound mending
		// makes it legal. Gate the heal target on what is actually actionable, so a phase stuck behind a
		// locked pocket may bank a dig or park instead of missing with the heal on the board.
		const actionable = affordable.filter((need) => !needWoundLocked(state, need));
		// The convert chain is the endgame the release target cannot see: once every suit is topped or
		// phantom-held, the only homes left are mop-ups, but a clean convertible aspect is a mend and a
		// step left on the chip at once — the self-mending finish (2769 strands with four wounded party
		// hearts because the pass walks past the clean potion window to home one more king). While the
		// tomb is nearly released and the party is nearly whole, phases end on the chip walking, not on
		// another home: the convert is the move the strand boards are each exactly one of short of.
		const startConvertible = convertibleCell(state);
		// Clear-goal only: a boss run ends at the slay, long before the convert chain matters, so
		// seeking converts there can only trade boss tempo for endgame fuel the goal never spends.
		const convertSeeking = !bossRun && needs.length <= 1 && state.draft.length >= 3 && startConvertible >= 0;

		const target = (board: TombState) =>
			(convertSeeking
				? convertibleCell(board) < startConvertible
				: due.some((need) => {
						const card = board.game.cards.find(
							(candidate) => candidate.suit === need.suit && planRank(candidate) === need.rank,
						);
						return card?.location.fixture === 'foundation';
					})) ||
			(bossAlive && bossSlain(board)) ||
			// A level is progress even when no grave advanced on paper: the track heals on it, and the next
			// expensive home gets cheaper. Levels never come back out of the foundations, so this cannot loop.
			currentLevel(board) > startLevel ||
			// Moving the boss off a deep column is progress with no home in it: the cards beneath become
			// diggable, and the landing the lift needs only exists while the tomb is still fogged. A phase may
			// end on the lift itself, because waiting for the home means waiting past the last bury target.
			(startBlocked > 0 && bossBlockedCount(board) < startBlocked) ||
			// With every grave topped there is no next card and no due, but the low cards skipped over by
			// phantoms still lie about the tomb — exposed, homeable, worth almost nothing, and the whole
			// finish. A phase that will not end on them stops at 40 homes with twelve one-movers on the
			// board; ending on any home mops them up, and homes never come back out.
			(due.length === 0 && board.game.cards.filter((card) => card.location.fixture === 'foundation').length > startHomes) ||
			// A phase stuck behind a locked need banks any heal — a dig, a park-minted heart — with no
			// further check, because the mint-then-home path has to end on the mint to walk it (205510:
			// gating the heal end on a reachability check strands its 123-move win past 22k states).
			(!actionable.length && hp(board) > startHp);
		const pass = solveTomb({
			state,
			goal: 'clear',
			engine: 'flat',
			strategy: 'best',
			depth: 90,
			nodes: Math.min(phaseBudget, Math.max(1000, budget - nodes)),
			// A phase that misses is telling the driver the release is deeper than the budget allowed: double
			// the next attempt rather than grinding the same cover at the same depth. A firing phase resets
			// to the base, because an easy home should stay cheap.
			timeBudgetMs: Math.max(2000, deadline - (Date.now() - began)),
			score: planScore,
			target,
		});
		nodes += pass.nodes;
		timedOut = timedOut || pass.timedOut;
		let walked = pass.solved ? pass.steps : pass.bestSteps;
		if (!pass.solved && !walked.some((step) => step.action.kind === 'home')) {
			// A miss whose best line banks nothing leaves the next phase exactly where this one
			// started, so three of them quit a tomb that still has homes on it (154116 stalls at
			// par 144 with homeable foundations on the board while the pass grinds its due). Take the
			// single best-scoring home instead: homes never come back out, so a greedy home on a miss
			// is certain progress, and the next phase re-plans from the richer board.
			const homing = generateMoves(state).filter((move) => move.action.kind === 'home');
			if (homing.length) {
				homing.sort((a, b) => planScore(b.next) - planScore(a.next));
				walked = [{ action: homing[0].action, label: homing[0].label, state: homing[0].next }];
			}
		}
		for (const step of walked) line.push(step);
		state = walked.length ? walked[walked.length - 1].state : pass.best;
		const now = state.game.cards.filter((card) => card.location.fixture === 'foundation').length;
		// A heal with no home is still progress — it banks what the next expensive home spends — but only the
		// affordable-gated phases may claim it, so a track at full hearts cannot spin on it forever.
		const healed = !actionable.length && hp(state) > startHp;
		const converted = convertibleCell(state) < startConvertible;
		const progressed = pass.solved || now > homes || (bossAlive && bossSlain(state)) || healed || converted;
		if (progressed) {
			failures = 0;
			homes = now;
			phaseBudget = basePhase;
		} else if (++failures >= 3) {
			break;
		} else {
			phaseBudget = Math.min(100_000, phaseBudget * 2);
		}
	}

	const cleared = isWon(state);
	return {
		goal,
		solved: cleared,
		steps: cleared ? line : [],
		best: state,
		bestSteps: line,
		plies: line.length,
		nodes,
		elapsedMs: Date.now() - began,
		timedOut,
	};
}

/**
 * The human's cycle as a driver: home what's payable, heal what's hurt, sort what's left — and bank
 * fog when the tomb runs dry. Each phase is fenced into its own kind of work, so a sorting phase can
 * never spend the facedown cards a heal phase banks on: digs happen only as heals (one a cycle, while
 * the track is hurt, never to spend a full bank up front), and arrangement is all tableau moves, parks
 * and spell lifts. A Purity refog is the midgame bank the plan gradient cannot see — burying a hallway's
 * mouth to re-dig it prints hearts — so the heal phases fence in the refog with the redigs, and the
 * score never has to learn to love fog. Three cycles with no new home or level mean the tomb is stuck,
 * and the driver stops rather than banking the same hallway forever.
 */
export function solveModes(options: SolveOptions = {}): SolveResult {
	const goal: Goal = options.goal ?? 'clear';
	const bossRun = goal === 'boss';
	const began = Date.now();
	const budget = Math.max(10_000, options.nodes ?? 2_000_000);
	const deadline = options.timeBudgetMs ?? 600_000;
	const start = options.state ?? createTombState(options.seed ?? 1, FREE_CELL_COUNT[options.difficulty ?? 'med']);
	const isWon = (state: TombState) => (bossRun ? bossSlain(state) : state.game.cards.every((card) => card.location.fixture === 'foundation'));
	const isHome = (action: SolverAction) => action.kind === 'home';
	const isHeal = (action: SolverAction) => action.kind === 'dig' || action.kind === 'arm';
	const isBank = (action: SolverAction) => action.kind === 'purity' || action.kind === 'dig';
	const isSort = (action: SolverAction) => action.kind === 'move' || action.kind === 'pisorf' || action.kind === 'weytwut';

	let state = start;
	const line: SolveStep[] = [];
	let nodes = 0;
	let failures = 0;
	let timedOut = false;
	let homes = state.game.cards.filter((card) => card.location.fixture === 'foundation').length;

	const take = (move: SolverMove) => {
		line.push({ action: move.action, label: move.label, state: move.next });
		state = move.next;
		nodes += 1;
	};
	const bestOf = (moves: SolverMove[]) =>
		[...moves].sort((a, b) => planScore(b.next) - planScore(a.next))[0];
	const search = (allow: (action: SolverAction) => boolean, target: ((state: TombState) => boolean) | undefined, phaseNodes: number) => {
		const result = solveTomb({
			state,
			goal,
			engine: 'flat',
			strategy: 'best',
			depth: 90,
			nodes: Math.min(phaseNodes, Math.max(1000, budget - nodes)),
			timeBudgetMs: Math.max(2000, deadline - (Date.now() - began)),
			score: planScore,
			target,
			allow,
		});
		nodes += result.nodes;
		timedOut = timedOut || result.timedOut;
		return result;
	};

	for (let cycle = 0; cycle < 150; cycle++) {
		if (isWon(state)) break;
		if (nodes >= budget || Date.now() - began > deadline) {
			timedOut = Date.now() - began > deadline;
			break;
		}
		const startHomes = homes;
		const startLevel = currentLevel(state);
		// Home everything payable, lagging suits first: the level is read off the lowest grave, so a
		// home on a leading suit while another lags is how a track climbs to D5/S5 at level 3 with four
		// wounded cells. Within the lagging band, best board wins — a home never comes back out.
		for (let guard = 0; guard < 53 && !isWon(state); guard++) {
			const open = generateMoves(state).filter((move) => isHome(move.action));
			if (!open.length) break;
			const tops = planTops(state);
			const floor = Math.min(tops.hearts, tops.clubs, tops.diamonds, tops.spades);
			const lagging = open.filter((move) => {
				const card = move.action.kind === 'home' ? cardAt(state.game, move.action.at) : undefined;
				return !!card && tops[card.suit] === floor;
			});
			take(bestOf(lagging.length ? lagging : open));
		}
		homes = state.game.cards.filter((card) => card.location.fixture === 'foundation').length;
		if (isWon(state)) break;
		// Hurt means heal, and a heal means exactly one dig or drink: fog is the bank, and a full bank
		// at full hearts stays banked rather than spent. Stuck at full hearts means scout instead: one
		// greedy dig to reveal what the homes need, because arrangement alone cannot read fog.
		if (hp(state) < maxHp(state)) {
			const startHp = hp(state);
			const found = search(isHeal, (board) => hp(board) > startHp, 2000);
			if (found.solved) {
				for (const step of found.steps) line.push(step);
				state = found.steps[found.steps.length - 1].state;
			}
		} else if (homes === startHomes) {
			const open = generateMoves(state).filter((move) => move.action.kind === 'dig');
			if (open.length) take(bestOf(open));
		}
		// Still hurt with no dig left is what the Purity is for: refog a worked hallway and re-dig it.
		// The search picks the hallway, and a plain dig wins the race wherever fog is left.
		if (!isWon(state) && hp(state) < maxHp(state) && !generateMoves(state).some((move) => move.action.kind === 'dig')) {
			const startHp = hp(state);
			const found = search(isBank, (board) => hp(board) > startHp, 3000);
			if (found.solved) {
				for (const step of found.steps) line.push(step);
				state = found.steps[found.steps.length - 1].state;
			}
		}
		// Sort with what's left: tableau moves, parks and lifts, never a dig. The best board wins even
		// when no home comes out of it — arrangement is the move, and the next cycle homes it.
		if (!isWon(state)) {
			const found = search(isSort, undefined, 3000);
			if (found.bestSteps.length) {
				for (const step of found.bestSteps) line.push(step);
				state = found.best;
			}
		}
		const progressed =
			homes > startHomes || currentLevel(state) > startLevel || (bossRun && bossSlain(state));
		if (progressed) {
			failures = 0;
		} else if (++failures >= 3) {
			break;
		}
	}

	const won = isWon(state);
	return {
		goal,
		solved: won,
		steps: won ? line : [],
		best: state,
		bestSteps: line,
		plies: line.length,
		nodes,
		elapsedMs: Date.now() - began,
		timedOut,
	};
}

/** A one-line summary of a board, for the printed solution's trailing column. */
export function boardSummary(state: TombState): string {
	return `fog ${state.hidden.length}  hp ${hp(state)}/${maxHp(state)}  lvl ${currentLevel(state)}  par ${tombPar(state)}  ${parCleared(state).toFixed(1)}%`;
}
