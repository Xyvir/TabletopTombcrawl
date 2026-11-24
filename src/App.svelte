<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { FreeCell } from './game/game';
import { PREVIOUS_ACTION_TYPE_IS_START_OF_GAME } from './game/move/history';
	import {
		getRankForCompare,
		shorthandCard,
		type Card,
		type CardLocation,
		type CardSequence,
		type Suit,
	} from './game/card/card';
	import {
		canDoubleTap,
		doubleTapCell,
		doubleTapTableau,
		dragMoves,
		draggableRun,
		foundationSchedule,
		ghostClick,
		moveRun,
		rewindTo,
		tapCell,
		tapTableau,
		type TapResult,
	} from './interaction';
	import { describeStep, transcript } from './notation';
	import { playMoveSfx, playSfx, setSfxEnabled } from './sfx';
	import { readPreference, writePreference } from './prefs';
	import type { SolverReply } from './solver.worker';
	import { markLayout, readLayouts, type LayoutRecord } from './progress';
	import './trellis.css';
	import titleMark from './assets/title.svg?raw';
	import {
		MONSTERS,
		TOMBS,
		ROLE_LABEL,
		ROLE_WORD,
				abilityFor,
		abilityUsable,
		pickpocketUsable,
		afflictionFired,
		afflictionTargets,
		armedClick,
		armedDrop,
		attackPreview,
		attackWith,
		healPreview,
		auraActive,
		auraItemOf,
		carriesPower,
		canBuildOn,
		canRevealFaceDown,
		cellCardMovable,
		cellCards,
		cardAt,
		canConvert,
		chipBoundary,
		conversionHeals,
		conversionTarget,
		mugTarget,
		convertChip,
		CLAUSES,
		convertibleCell,
		newlyHealed,
		newlyWounded,
		createTombState,
		currentLevel,
		DRAFT_CELL_COUNT,
		FREE_CELL_COUNT,
		TOMB_RULES,
		GOLD_TOTAL,
		goldMultiplier,
		goldScore,
		goldValue,
		tombGold,
		reserveCell,
		draftAbility,
		isDualcastItem,
		stoneCell,
		trueBossKill,
		trueClear,
		disarm,
		hp,
		draftAt,
		elfSight,
		emptyCells,
		unpick,
		hasPassive,
		foundationTopRank,
		phantomRank,
		isBoss,
		levelUpGraves,
		isBossMinion,
		isFaceDown,
		cydsteppCanBury,
		moveCapacity,
		bossSlain,
		bossProtected,
		kingsHome,
		revealFaceDown,
		tombExit,
		tombFirstCell,
		tombMove,
		tombPar,
		tombRun,
		tombTapTargets,
		useAbility,
		woundedCanGoHome,
		type Difficulty,
		type TombState,
	} from './tombcrawl';
	import { decodeBoard } from './boardstate';

	const CELL_COUNT = 4;
	const CASCADE_COUNT = 8;
	/**
	 * One crawl, one track. The tomb is designed around the med board — four drafted items, three free
	 * pockets and no damage cap — so there is no difficulty to choose and nothing to slide.
	 */
	const TRACK: Difficulty = 'med';
	const BASE = import.meta.env.BASE_URL;
	/**
	 * Every face plus the two backs. A card coming out of the fog shows its face for the first time
	 * mid-turn, so the picture has to be fetched and decoded before the animation needs it.
	 */
	const CARD_IMAGES = [
		'back',
		'blank',
		...[...'A23456789TJQK'].flatMap((rank) => [...'shdc'].map((suit) => `${rank}${suit}`)),
	];
	/** How long a move is held so a double click can still be recognised. */
	const DOUBLE_TAP_MS = 150;
	/** How long after that a second click can still rewind an applied move into a double click. */
	const DOUBLE_CLICK_MS = 500;
	/**
	 * After the card flies, its old box still answers clicks for this long (the ghost clickbox). It
	 * has to last as long as the double-click window: a shorter box means the second click lands on
	 * felt the game has already forgotten, and the double is simply missed.
	 */
	const GHOST_MS = DOUBLE_CLICK_MS;
	/** The ghost box is padded, because a second click rarely lands on the same pixel. */
	const GHOST_PAD = 14;
	/** Pixels a pointer must travel before a press becomes a drag. */
	const DRAG_THRESHOLD = 6;
	/** Normal card flight. */
	const FLIGHT_MS = 190;
	/** The automatic home chain gets a beat before it starts, then takes turns card by card. */
	const FOUNDATION_WARMUP_MS = 240;
	const FOUNDATION_GAP_MS = 40;
	const FOUNDATION_FLIGHT_MS = 250;
	/** A card coming out of the fog squashes, shows its face, then opens back out. */
	const FLIP_MS = 210;
	/** Purity turns the mouth of a hallway over, so each card waits this long for the one before it. */
	const TURN_STAGGER_MS = 70;
	/**
	 * A restart puts the fog back on cards that were dug out, and they turn over in the air on the way home.
	 * The turn waits until the flight is under way so the card leaves as a face, and a hallway starts a beat
	 * after the one to its left: the fog sweeps across the board instead of eight cards blinking at once.
	 */
	const REFOG_DELAY_MS = 60;
	const REFOG_STAGGER_MS = 14;
	/** How long a banner holds the screen before it clears. */
	const FANFARE_MS = 2200;
	/** A level up is the smallest banner and clears quickly, so a run of levels can each be read. */
	const LESSER_FANFARE_MS = 1300;

	/** Tabletop Tombcrawl is the table the app opens on; the toggle falls back to plain FreeCell. */
	const opening = createTombState();
	let variant = $state<'tomb' | 'vanilla'>('tomb');
	let tomb = $state<TombState | null>(opening);
	let tombHistory = $state<TombState[]>([]);
	/** The reset pill waiting on a yes or no: `new` deals a fresh crawl, `restart` the same one again. */
	let pendingReset = $state<'new' | 'restart' | null>(null);
	/** The fatal blow waiting on a yes or no: the card the player double-clicked, if taking it ends the crawl. */
	let pendingDeath = $state<CardLocation | null>(null);
	/** The end-crawl pill waiting on a yes or no: leaving is a decision, and one tap should not make it. */
	let pendingExit = $state(false);
	/**
	 * The session so far, read back off the undo history: one printed line per move, in the solver's
	 * vocabulary, so a playtest transcript can be set next to a simulated one. Undo rewinds both.
	 */
	const recordedSteps = $derived.by(() => {
		if (!tomb) return [];
		const states = [...tombHistory, tomb];
		const steps: { label: string; state: TombState }[] = [];
		for (let index = 1; index < states.length; index++) {
			const label = describeStep(states[index - 1], states[index]);
			if (label) steps.push({ label, state: states[index] });
		}
		return steps;
	});
	/** Cards that just came out of the fog, drawn flipping face-up for one animation. */
	let flippingIds = $state<string[]>([]);
	/** Cards that just took a wound, turning face-down for one animation. */
	let woundingIds = $state<string[]>([]);
	/** Cards that just came back from a wound, turning face-up for one animation. */
	let healingIds = $state<string[]>([]);
	/**
	 * Cards a spell just turned face down, and how long each waits before it turns. A fogged hallway
	 * turns over from the unburied card downwards, so the sweep reads as one gesture rather than a shuffle.
	 */
	let turningDelays = $state<Record<string, number>>({});
	let tombSelected = $state<CardLocation | null>(null);
	/** The card under the pointer: a kill you are aiming at shows what it would cost first. */
	let tombHover = $state<CardLocation | null>(null);
	let tombLast: { id: string; time: number } | null = null;
	/**
	 * The ability the last click took in hand, so the second click of a double can take it back: a glyph or
	 * item answers a single click by arming (or drinking), and a quick pair would otherwise only arm and
	 * then disarm. The record is kept even for a Potion, which resolves without ever setting `armed`, so
	 * every card in hand can answer a double the way a tableau card does.
	 */
	let tombArmed: { id: string; location: CardLocation; before: TombState; after: TombState } | null = null;
	/** The last card a tomb tap moved, so a second click at the same spot can rewind it. */
	let tombMoved: { id: string; from: CardLocation; before: TombState; rect: DOMRect; time: number } | null = null;
	/** A whole-screen flash: gold for a level up, red for damage, a colour for each monster power. */
	type FlashKind = 'level' | 'damage' | 'heal' | 'venom' | 'mana' | 'mug';
	let flash = $state<{ kind: FlashKind; id: number } | null>(null);
	/**
	 * The three moments that change what a run is: the tomb finds its boss, the boss dies, and the tomb is
	 * emptied. A deal can open with no boss — a king under the fog is not the boss until the fog lifts off
	 * it — so the first of the three is the one that can catch a crawl by surprise.
	 *
	 * Two lesser beats take the same banner at a smaller size: the first General (the kill that opens the
	 * boss to the blade) and a level up, which is frequent enough to read as punctuation rather than news.
	 */
	type FanfareKind = 'reveal' | 'boss' | 'tomb' | 'general' | 'level';
	const FANFARE_TEXT: Record<FanfareKind, string> = {
		reveal: 'Boss Revealed!',
		boss: 'Boss Slain!',
		tomb: 'Tomb Cleared!',
		general: 'General Slain!',
		level: 'Level Up!',
	};
	let fanfare = $state<{ kind: FanfareKind; id: number; level?: number } | null>(null);
	/** The boss note joins the status bar once its banner has cleared, so the two never talk at once. */
	let bossNoted = $state(false);
	let game = $state<FreeCell>(opening.game);
	let seedInput = $state('');
	let mode = $state<'auto' | 'pick'>('auto');
	const difficulty: Difficulty = TRACK;
	let board = $state<HTMLElement>();

	/**
	 * The background solvability check for the deal on the table. It runs in a worker once the player has
	 * made a move, so a fresh page is not quietly burning a core, and the answer is only ever a lower
	 * bound: a line proves the deal is winnable, no line proves nothing.
	 */
	type Probe = { seed: number; difficulty: Difficulty; status: 'searching' } | ({ status: 'done' } & SolverReply);
	const PROBE_NODES = 800_000;
	// The clock has to outlast the node budget: a search cut off by time reports its silence as an answer
	// about the deal, so it is set to let eight hundred thousand nodes finish on a laptop core.
	const PROBE_MS = 60_000;
	let probe = $state<Probe | null>(null);
	let probeWorker: Worker | null = null;
	/** The deal already being looked at, so a move does not restart the search. */
	let probedKey = '';
	/** The deal whose last answer has already been retired from the bar. */
	let clearedKey = '';

	/** Retire the last answer: its deal is gone, so its line or its silence says nothing about this one. */
	function clearProbe() {
		probeWorker?.terminate();
		probeWorker = null;
		probe = null;
		probedKey = '';
		clearedKey = '';
	}

	/** A phone's core is worth more than this answer: the search runs on a pointer with a mouse. */
	function probesAtAll() {
		return typeof Worker !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;
	}

	function startProbe(seed: number, level: Difficulty) {
		probeWorker?.terminate();
		probeWorker = null;
		if (!probesAtAll()) {
			probe = null;
			return;
		}
		probe = { seed, difficulty: level, status: 'searching' };
		const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<SolverReply>) => {
			worker.terminate();
			if (probeWorker === worker) probeWorker = null;
			const reply = event.data;
			// The deal may have changed while the search ran: a late answer for another seed is dropped.
			if (probe && probe.seed === reply.seed && probe.difficulty === reply.difficulty) probe = { ...reply, status: 'done' };
		};
		worker.postMessage({ seed, difficulty: level, nodes: PROBE_NODES, timeBudgetMs: PROBE_MS });
		probeWorker = worker;
	}

	$effect(() => {
		const deal = tomb;
		if (!deal || variant !== 'tomb') {
			clearProbe();
			return;
		}
		const key = `${deal.seed}:${difficulty}`;
		if (key !== clearedKey) {
			// A new deal retires the old answer straight away, before anyone has moved: the board that
			// answer described is gone, so leaving it up would be a reading of a different game.
			clearedKey = key;
			probedKey = '';
			probeWorker?.terminate();
			probeWorker = null;
			probe = null;
		}
		// Only a run that has started: the opening deal is a seed nobody chose to play yet.
		if (!recordedSteps.length) return;
		// A pasted board without a crawl number is a puzzle: there is no deal behind it for the search
		// to read, and an answer about seed 0 would be an answer about a different board.
		if (!deal.seed) return;
		if (key === probedKey) return;
		probedKey = key;
		// The seed list already holds the proof for its own deals, solved to their par: re-deriving a
		// published seed would spend a core answering a question the corpus answers already.
		if (entriesByLayout.get(loadoutOf(deal))?.seed === deal.seed) {
			probe = null;
			return;
		}
		startProbe(deal.seed, difficulty);
	});

	const probeLabel = $derived.by(() => {
		if (!probe) return '';
		if (probe.status === 'searching') return 'Solver: looking';
		if (!probe.solved) return `Solver: no line in ${Math.round(probe.nodes / 1000)}k`;
		return `Solver: winnable in ${probe.moves}`;
	});

	/* ---------- the layout trellis ---------- */
	type CorpusEntry = {
		loadout: string;
		boss: string | null;
		seed: number;
		moves: number;
		difficulty: string;
		goal: string;
		party: { role: string; name: string; suit: string }[];
		/** When the solver proved this deal; entries older than the column itself carry null. */
		at?: string | null;
	};
	type CorpusFile = {
		difficulty: string;
		goal: string;
		rules: string;
		keys: number;
		entries: CorpusEntry[];
		/**
		 * The shortest line the solver found for each goal a party has been solved for, kept per track:
		 * `found[key].hard.clear` is a hard clear, which a med one says nothing about. Artifacts written
		 * before tracks were kept hold one flat record per party, read as med.
		 */
		found?: Record<
			string,
			Partial<Record<Difficulty, { boss?: { seed: number; moves: number }; clear?: { seed: number; moves: number } }>> & {
				boss?: { seed: number; moves: number };
				clear?: { seed: number; moves: number };
			}
		>;
		/**
		 * Parties whose best crawl has no win yet: the furthest a search got on a seed that does match
		 * the loadout. Kept per track, and dropped the moment a win lands on that square.
		 */
		placeholders?: Record<
			string,
			Partial<Record<Difficulty, { seed: number; score: number | null; at?: string | null }>>
		>;
		missing: string[];
	};
	/** Draw order: the corpus keys a party the same way, one letter per role. */
	const SUITS = ['hearts', 'clubs', 'diamonds', 'spades'] as const;
	const SUIT_GLYPH: Record<string, string> = { hearts: '♥', clubs: '♣', diamonds: '♦', spades: '♠' };
	let layoutOpen = $state(false);
	let sheetEl = $state<HTMLElement>();
	let corpus = $state<CorpusFile | null>(null);
	// Opening the sheet moves the focus onto it, so Escape and the arrow-free grid work from the keyboard.
	$effect(() => {
		if (!layoutOpen) return;
		void tick().then(() => sheetEl?.focus());
	});
	let progress = $state<Map<string, LayoutRecord>>(new Map());
	/**
	 * The party the deal was dealt, kept for the whole run. It cannot be read off `tomb` when it is
	 * needed: a cleared tomb has sent every drafted card home, and a converted card leaves the draft
	 * for good, so a 100% clear would record itself under an empty loadout and never reach the trellis.
	 */
	let dealLayout = $state('');
	/** The sheet reads the med corpus: one track means one claim per party, and no tier to tab through. */
	const layoutDifficulty: Difficulty = TRACK;
	const difficultyOfEntry = (entry: CorpusEntry) => (entry.difficulty as Difficulty) ?? 'med';
	/** Where a track's rows are kept. The sheet reads the med corpus: one baseline, one claim per party. */
	const entriesByLayout = $derived(
		new Map(
			(corpus?.entries ?? [])
				.filter((entry) => difficultyOfEntry(entry) === layoutDifficulty)
				.map((entry) => [entry.loadout, entry])
		)
	);
	/** The square's best no-win crawl, on the track the sheet is showing. */
	const placeholderFor = (key: string) => corpus?.placeholders?.[key]?.[layoutDifficulty];
	// A typed seed belongs to a square only at the track it was solved on, which is the track on screen.
	const entriesBySeed = $derived(
		new Map(
			(corpus?.entries ?? [])
				.filter((entry) => difficultyOfEntry(entry) === difficulty)
				.map((entry) => [entry.seed, entry])
		)
	);
	/**
	 * The trellis square this deal belongs to, if any. A layout is not enough: a random deal of the same
	 * party is not the corpus deal, so selecting it would leave the sheet pointing at a run it cannot
	 * describe. Only the seed says which square a board belongs to, and a fresh deal has none.
	 */
	const layoutForSeed = (seed: number | undefined) => (seed === undefined ? '' : (entriesBySeed.get(seed)?.loadout ?? ''));
	const currentLayout = $derived(dealLayout);
	const ROLE_ORDER = ['kin', 'class', 'glyph', 'consumable'] as const;
	type SuitName = (typeof SUITS)[number];
	const SUIT_BY_LETTER: Record<string, SuitName> = { h: 'hearts', c: 'clubs', d: 'diamonds', s: 'spades' };
	/** The square the pointer or the keyboard is on, so the panel can read its party out. */
	let hovered = $state<string | null>(null);
	/** Typed-code entry: double-click the preview code to type a loadout like `hsds`. */
	let codeEditing = $state(false);
	let codeDraft = $state('');
	let codeInputEl = $state<HTMLInputElement | null>(null);

	function openCodeEdit() {
		codeDraft = inspectedKey.toUpperCase();
		codeEditing = true;
		void tick().then(() => codeInputEl?.select());
	}

	function confirmCodeEdit(start: boolean) {
		const clean = codeDraft.toLowerCase().replace(/[^hcds]/g, '').slice(0, 4);
		if (clean.length === 4) hovered = clean;
		codeEditing = false;
		if (start && clean.length === 4) {
			const key = clean;
		const entry = entriesByLayout.get(key);
		if (entry) startLayout(entry);
		else if (placeholderFor(key)) startPlaceholder(key);
		else hovered = key;
		}
	}
	const inspectedKey = $derived(hovered || currentLayout || 'hhhh');
	const inspected = $derived.by(() => {
		if (inspectedKey.length !== 4) return null;
		const suits = {} as Record<(typeof ROLE_ORDER)[number], SuitName>;
		ROLE_ORDER.forEach((role, index) => {
			suits[role] = SUIT_BY_LETTER[inspectedKey[index] ?? 'h'] ?? 'hearts';
		});
		return suits;
	});
	/** What the solver has proved for the square being read out, per goal, with its shortest line. */
	const inspectedProof = $derived.by(() => {
		const entry = entriesByLayout.get(inspectedKey);
		// Proofs are kept per track. Artifacts written before that was true hold the med ones flat, so a
		// flat record is read as med rather than as a party with no proofs at all.
		const proofs = corpus?.found?.[inspectedKey] as
			| (Partial<Record<'boss' | 'clear', { seed: number; moves: number }>> & Record<string, unknown>)
			| undefined;
		const known = (proofs?.[layoutDifficulty] ?? proofs) as
			| Partial<Record<'boss' | 'clear', { seed: number; moves: number }>>
			| undefined;
		const boss = known?.boss ?? (entry?.goal === 'boss' ? { seed: entry.seed, moves: entry.moves } : undefined);
		const clear = known?.clear ?? (entry?.goal === 'clear' ? { seed: entry.seed, moves: entry.moves } : undefined);
		return { boss, clear };
	});
	/** The entry behind the readout, so the panel can date the seed it shows. */
	const inspectedEntry = $derived(entriesByLayout.get(inspectedKey));
	/** The best no-win crawl on the square being read out, if it has one. */
	const inspectedPlaceholder = $derived(placeholderFor(inspectedKey));

	/** A party's four drafted suits in role order, letters only, e.g. `hcds`. */
	function loadoutOf(state: TombState | null): string {
		if (!state) return '';
		return [...state.draft]
			.sort((a, b) => a.cell - b.cell)
			.map((entry) => entry.suit[0])
			.join('');
	}

	/**
	 * A square is cleared, boss-killed, playable (a win is known), a placeholder (a seed matches but no
	 * win yet), or missing entirely. The placeholder is the light grey: the party is dealt, the crawl is
	 * real, and nobody has beaten it at this track.
	 */
	function layoutStatus(key: string): 'cleared' | 'boss' | 'playable' | 'placeholder' | 'missing' {
		const held = progress.get(`${layoutDifficulty}:${key}`)?.status;
		if (held === 'clear') return 'cleared';
		if (held === 'boss') return 'boss';
		if (entriesByLayout.has(key)) return 'playable';
		return placeholderFor(key) ? 'placeholder' : 'missing';
	}

	/** The square's state in words, for the screen reader and the readout. */
	function statusWord(key: string) {
		const status = layoutStatus(key);
		return status === 'placeholder' ? 'seed only, no win yet' : status;
	}

	function openLayout() {
		codeEditing = false;
		layoutOpen = true;
	}

	function closeLayout() {
		codeEditing = false;
		layoutOpen = false;
	}

	/**
	 * Start a placeholder's crawl: a seed is known and the party matches, so the square is a real board
	 * even though nobody has beaten it. The trellis reads it as unfilled until a win lands on it.
	 */
	function startPlaceholder(key: string) {
		const filler = placeholderFor(key);
		if (!filler) return;
		layoutOpen = false;
		seedInput = String(filler.seed);
		clearClickMemory();
		tombHistory = [];
		tombSelected = null;
		tombLast = null;
					tomb = createTombState(filler.seed, FREE_CELL_COUNT[layoutDifficulty]);
		dealLayout = loadoutOf(tomb);
		game = tomb.game;
		void tick().then(() => startDeal());
	}

	/** Start the corpus deal for a party: the same rules the corpus was solved under. */
	function startLayout(entry: CorpusEntry) {
		layoutOpen = false;
		seedInput = '';
		clearClickMemory();
		tombHistory = [];
		tombSelected = null;
		tombLast = null;
		tomb = createTombState(entry.seed, FREE_CELL_COUNT[layoutDifficulty]);
		dealLayout = loadoutOf(tomb);
		game = tomb.game;
		void tick().then(() => startDeal());
	}

	/**
	 * Remember what this run has achieved for its party. Only two moments count: the boss going home,
	 * and the tomb coming bare. A layout keeps its best mark, so a replay that does worse changes
	 * nothing.
	 */
	async function recordRun(state: TombState) {
		const key = dealLayout || loadoutOf(state);
		const status: LayoutRecord['status'] | null = tombPar(state) === 0 ? 'clear' : bossSlain(state) ? 'boss' : null;
		if (!status) return;
		// The crawl only deals one track, so the mark is keyed by it directly: reading the track off the
		// board miskeys Dwarf crawls, whose extra pocket looks like a whole easier track.
		const level: Difficulty = layoutDifficulty;
		const id = `${level}:${key}`;
		const held = progress.get(id)?.status;
		if (held === 'clear' || (held === 'boss' && status === 'boss')) return;
		const record: LayoutRecord = { id, loadout: key, difficulty: level, status, seed: state.seed, at: Date.now() };
		progress = new Map(progress).set(id, record);
		await markLayout(record);
	}

	onMount(() => {
		let alive = true;
		void (async () => {
			try {
				const response = await fetch(`${BASE}corpus.json`);
				if (response.ok && alive) corpus = (await response.json()) as CorpusFile;
			} catch {
				// no corpus file simply leaves every square without a seed to play
			}
			const saved = await readLayouts();
			if (alive) progress = saved;
		})();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				layoutOpen = false;
				pendingReset = null;
				pendingDeath = null;
				pendingExit = false;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			alive = false;
			window.removeEventListener('keydown', onKey);
		};
	});

	type PendingTap = {
		id: string;
		el: HTMLElement;
		location: CardLocation;
		rect: DOMRect;
		result: TapResult;
		timer: ReturnType<typeof setTimeout>;
	};
	type Press = { card: Card; x: number; y: number; dragged: boolean };

	let pending: PendingTap | null = null;
	/** Last click that shook or selected, so a quick second click can still act as a double. */
	let lastTap: { id: string; time: number } | null = null;
	/** A single click that already moved a card; a second click rewinds it into a double click. */
	let lastMove: {
		id: string;
		time: number;
		location: CardLocation;
		rect: DOMRect;	} | null = null;
	/** The card the user actually moved, so it flies before the automatic chain. */
	let primaryId: string | null = null;

	let press: Press | null = null;
	let suppressClickUntil = 0;

	/** Live drag: which cards are under the pointer, where they came from, and legal piles. */
	let drag = $state<{
		cards: string[];
		from: CardLocation;
		dx: number;
		dy: number;
		angle: number;
		lastX: number;
		targets: string[];
	} | null>(null);

	const seed = $derived(tomb ? tomb.seed : dealSeed(game));
	const atStart = $derived(
		tomb ? tombHistory.length === 0 : PREVIOUS_ACTION_TYPE_IS_START_OF_GAME.has(game.previousAction.type)
	);
	/** The card being aimed at: a dragged run first, then the hovered card, then the picked one. */
	const aim = $derived(tomb ? (drag?.from ?? tombHover ?? tombSelected) : null);
	const preview = $derived(tomb && aim ? attackPreview(tomb, aim) : null);
	/** The track cards an aimed kill would turn face-down, marked red before the blow lands. */
	const woundPreview = $derived(new Set(preview?.wounds ?? []));
	/** The track cards digging the hovered fog would turn back up, marked green before it is spent. */
	/** The chip is hovered: its pending mending is drawn on the track. */
	let chipHover = $state(false);
	const healNext = $derived(
		new Set([
			...(tomb && tombHover ? healPreview(tomb, tombHover) : []),
			// Hovering the chip prices the conversion the same way hovering the fog prices a dig.
			...(tomb && chipHover && canConvert(tomb) ? conversionHeals(tomb) : []),
		])
	);
	/**
	 * The cards the affliction of the hovered monster is aimed at: the fog a Viper would lift, the slot a
	 * Bandit would convert, the card a Gorgon would turn down, the glyphs a Wraith would spend. An
	 * armed Remedy turns the whole aura off, and the warning goes with it, since the move it covers would
	 * not do any of it.
	 */
	const afflictionIds = $derived.by(() => {
		if (!tomb || !tombHover) return new Set<string>();
		const card = cardAt(tomb.game, tombHover);
		return new Set(card ? afflictionTargets(tomb, card) : []);
	});
	/** The card an aim would slay outright: it wears crossed swords until the pointer leaves. */
	const slayAt = $derived(!drag && preview?.legal ? aim : null);
	/** Touch sheets have no hover to ask with, so the tomb names its own kills: every legally
	 * slayable hallway card wears its mark without being aimed at. Pockets keep the tap-to-see flow,
	 * so the track stays a control panel rather than a second tomb. */
	let coarsePointer = $state(false);
	const slayableIds = $derived.by(() => {
		if (!tomb || drag || !coarsePointer) return new Set<string>();
		const ids = new Set<string>();
		for (const card of tomb.game.cards) {
			if (card.location.fixture !== 'cascade') continue;
			if (attackPreview(tomb, card.location).legal) ids.add(key(card.location));
		}
		return ids;
	});
	/**
	 * An aim the delver would not survive: `fatal` is exactly "the track cannot pay this bill", whether or
	 * not filling an empty cell first would make change. The card being hit keeps its swords, because the
	 * blow itself is on offer; the bill is written across the pockets it would take instead.
	 */
	const fatalAim = $derived(!drag && !!preview?.fatal);
	/** The graves where the next card home takes the level up, lit yellow before it is played. */
	const levelUp = $derived(new Set(tomb ? levelUpGraves(tomb) : []));
	const tombHp = $derived(tomb ? hp(tomb) : 0);
	/**
	 * The track read as pockets rather than as hearts: every pocket holding a card, wounded or not. A
	 * wound turns a filled pocket face-down, so `tombHp` over this is the hearts left over the pockets
	 * they were dealt in — four drafted ones to begin with — and empty cells are counted apart.
	 */
	const filledPockets = $derived(tomb ? tomb.game.cells.filter((card) => !!card).length : 0);
	/** Empty free cells: each one is a single card away from being another heart. */
	const openSlots = $derived(tomb ? emptyCells(tomb).length : 0);
	/** Where the Hero Chip sits: the boundary between hero aspects and plain pockets. */
	const chipAt = $derived(tomb ? chipBoundary(tomb) : 0);
	/**
	 * The conversion a drag would spend, marked on the chip itself: a card in hand with no grave open to it
	 * has only one way out of its aspect, and that way is a conversion — the aspect goes plain and the chip walks
	 * a step left. Only the aspect the chip has reached can leave at all, so the ones behind it (locked by the
	 * conversion order) say nothing at all, and a Thief's Pickpocket is the exception: he plays the item into
	 * a hallway and the aspect waits on its refill instead, so the chip stays put and has nothing to warn about.
	 */
	const conversionPreview = $derived.by(() => {
		if (!tomb || !aim || aim.fixture !== 'cell') return false;
		const cell = aim.data[0];
		const entry = draftAt(tomb, cell);
		if (!entry || cell !== convertibleCell(tomb)) return false;
		// a card with no gap over it can neither be picked up nor played out: there is no price to warn about
		if ((tomb.wounded[cell] ?? 0) > 0) return false;
		// a card with a grave open to it is a home, not a slot spent
		if (attackPreview(tomb, aim).legal) return false;
		return !(CLAUSES.thiefPickpocket && entry.role === 'consumable' && hasPassive(tomb, 'Thief'));
	});
	/**
	 * The chip's own `!`, mounted on the token and nowhere else. Hovering the chip is the whole question —
	 * what would a conversion spend, and what does it mend — so the mark answers on the hover and the mend
	 * lights up on the track beside it. A bandit under the pointer puts it there too: Mug walks the chip a
	 * step left with no heal, and the aspect it takes never moves, so the chip is the only card-shaped thing
	 * that happens. A wounded aspect locks both, and neither has anything to warn about then.
	 */
	const chipWarning = $derived.by(() => {
		if (!tomb) return false;
		if (chipHover) return canConvert(tomb);
		if (!tombHover || tomb.bossSuit !== 'spades') return false;
		const card = cardAt(tomb.game, tombHover);
		return !!card && carriesPower(tomb, card) && auraActive(tomb) && !!mugTarget(tomb);
	});
	const tombLevel = $derived(tomb ? currentLevel(tomb) : 0);
	/** What the dungeon has yielded, out of the hundred a bare tomb pays. */
	const tombGoldNow = $derived(tomb ? tombGold(tomb) : 0);
	/**
	 * The gold on the bar. While the boss king is still under the fog the tomb's suit is unknown, so no card has a fixed
	 * price and the count is a guess — the bar owns up to that and reads ? of a hundred.
	 */
	const tombGoldShown = $derived(tomb && !tomb.bossId ? '?' : `${tombGoldNow}`);
	/** What gold pays here: twice after a true boss kill, three times for a bare tomb with the pocket intact. */
	const tombMult = $derived(tomb ? goldMultiplier(tomb) : 1);
	/** The scored reading, so a clean crawl can read past a hundred. */
	const tombScoreNow = $derived(tomb ? goldScore(tomb) : 0);
	const dragIds = $derived(new Set(drag?.cards ?? []));
	/**
	 * The end-of-crawl reckoning. A finished crawl is read back as four numbers (moves, gold, and whether the
	 * boss or the whole tomb fell) and set beside whatever a machine managed on the same party, so a human
	 * line is never just a score in a vacuum.
	 */
	const endMoves = $derived(recordedSteps.length);
	const endGold = $derived(tomb ? tombGoldNow : 0);
	const endMult = $derived(tomb ? tombMult : 1);
	/** Out of a hundred, so the multiplier is what carries a win past a hundred percent. */
	const endPercent = $derived(Math.round((tomb ? tombScoreNow : 0)));
	const endCleared = $derived(tomb ? tombPar(tomb) === 0 : false);
	const endBoss = $derived(tomb ? bossSlain(tomb) : false);
	/** The optional third win: the same result with the reserve pocket never used. */
	const endTrueClear = $derived(tomb ? trueClear(tomb) : false);
	const endTrueBoss = $derived(tomb ? trueBossKill(tomb) : false);
	/** The crawl ended on a blow the party could not afford: the reckoning says how the delver went. */
	const endDied = $derived(tomb ? tomb.died : false);
	// The crawl only deals one track: reading it off the board miskeys Dwarf crawls the same way the
	// progress mark did, and the end panel would compare against the wrong tier.
	const endTrack: Difficulty = layoutDifficulty;
	/** The corpus row for this party on this track, if the seed sheet has one. */
	const endCorpus = $derived(
		(corpus?.entries ?? []).find((entry) => entry.loadout === (dealLayout || loadoutOf(tomb)) && difficultyOfEntry(entry) === endTrack) ??
			null
	);
	const endProbe = $derived(probe && probe.status === 'done' ? probe : null);
	/** How a machine's line sits against the delver's: shorter is the only comparison that means anything. */
	function againstTheirs(moves: number, mine = endMoves) {
		const gap = mine - moves;
		if (gap === 0) return 'the same count';
		return gap > 0 ? `${gap} shorter` : `${-gap} longer`;
	}

	/**
	 * The hint over a spent slot names what will restock it: the one suit it lost, any card at all when a
	 * Thief's Pickpocket was won with a kill, or any card but that suit when he emptied it into the crypt.
	 */
	function itemSlotHint(state: TombState | null, suit: string): string {
		const takes = state?.itemWindow?.takes;
		const feed =
			takes === 'any' ? 'any card' : takes === 'other' ? 'a card of another suit' : `a ${suit} card`;
		return `Spent item pocket — play ${feed} here on your next action to restock it. Anything else converts this pocket.`;
	}

	/**
	 * Whether a kill on this card is a shot rather than a swing. The Elf shoots over cover, so an
	 * exposed card is still a card he can walk up to: it keeps the crossed swords, and the bolt is for
	 * the card under a lane of number cards that no hand can reach yet.
	 */
	function shotAt(state: TombState | null, at: CardLocation | null): boolean {
		if (!state || !at || at.fixture !== 'cascade') return false;
		const column = state.game.tableau[at.data[0]] ?? [];
		if (at.data[1] >= column.length - 1) return false;
		return elfSight(state, at);
	}

	function deal(requested?: number): FreeCell {
		return new FreeCell({ cellCount: CELL_COUNT, cascadeCount: CASCADE_COUNT })
			.shuffle32(requested)
			.dealAll();
	}

	function dealSeed(g: FreeCell): number | undefined {
		const line = g.history.find((h) => h.startsWith('shuffle deck'));
		const match = line?.match(/\((\d+)\)/);
		return match ? Number(match[1]) : undefined;
	}

	/* ---------- animation: FLIP between game states ---------- */

	function visualRect(el: HTMLElement) {
		return (el.querySelector('img') ?? el).getBoundingClientRect();
	}

	/**
	 * The cards already sitting at home when a board was measured. Keyed by that measurement, so a
	 * drop can keep the shot it took at the start of its drag.
	 */
	const homeAt = new WeakMap<Map<string, DOMRect>, Set<string>>();

	/**
	 * Where each cascade card sits, keyed by the same measurement as its rect: its column and its
	 * place in that column's stack. A card that stays in its column can only move by whole steps.
	 */
	const placeAt = new WeakMap<Map<string, DOMRect>, Map<string, { col: number; index: number }>>();

	function columnPlace(el: HTMLElement) {
		const cascade = el.closest<HTMLElement>('.cascade');
		if (!cascade) return undefined;
		const col = Number(cascade.dataset.drop?.split(':')[1]);
		const index = Number(el.style.getPropertyValue('--i'));
		return Number.isFinite(col) && Number.isFinite(index) ? { col, index } : undefined;
	}

	/**
	 * The step a stack is actually drawn with, read from the board rather than assumed. The stylesheet
	 * shortens the step once a column runs out of box, so a flight between two cards in the same
	 * column has to ask where the neighbours sit or it would land past its place.
	 */
	function stackStep(el: HTMLElement): number {
		const column = el.closest<HTMLElement>('.cascade');
		const cards = column?.querySelectorAll<HTMLElement>('.card');
		if (cards && cards.length > 1) return cards[1].offsetTop - cards[0].offsetTop;
		return el.offsetHeight * 0.26;
	}

	function cardRects() {
		const rects = new Map<string, DOMRect>();
		const home = new Set<string>();
		const places = new Map<string, { col: number; index: number }>();
		board?.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
			const id = el.dataset.card;
			// measure the picture, not the slot: a dragged cell card is translated inside its slot
			if (id) rects.set(id, visualRect(el));
			if (id && el.closest('.foundations')) home.add(id);
			const place = id ? columnPlace(el) : undefined;
			if (id && place) places.set(id, place);
		});
		homeAt.set(rects, home);
		placeAt.set(rects, places);
		return rects;
	}

	function animateFrom(before: Map<string, DOMRect>, next?: FreeCell, primary?: string | null) {
		if (!board) return;
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

		// Only chained auto-foundation waits; a deliberate move to a foundation stays snappy.
		const autoHome =
			next?.previousAction.type === 'move-foundation' ||
			next?.previousAction.type === 'auto-foundation';
		const home = autoHome
			? foundationSchedule(
					next!.cards
						.filter((card) => card.location.fixture === 'foundation')
						.map((card) => shorthandCard(card)),
					primary,
					{
						warmup: FOUNDATION_WARMUP_MS,
						gap: FOUNDATION_GAP_MS,
						flight: FLIGHT_MS,
						homeFlight: FOUNDATION_FLIGHT_MS,
					}
				)
			: new Map<string, { delay: number; duration: number }>();

		board.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
			if (typeof el.animate !== 'function') return;
			const now = visualRect(el);
			const prev = el.dataset.card ? before.get(el.dataset.card) : undefined;
			// A card that was already home has nowhere to fly from: only the trip that just happened
			// earns the flight, or every later action would fly it in again from the pile it left.
			if (el.dataset.card && el.closest('.foundations') && homeAt.get(before)?.has(el.dataset.card)) return;

			if (!prev) {
				el.animate(
					[
						{ opacity: 0, transform: 'translateY(-10px)' },
						{ opacity: 1, transform: 'none' },
					],
					{ duration: 160, easing: 'ease-out' }
				);
				return;
			}

			let dx = prev.left - now.left;
			let dy = prev.top - now.top;
			// A card that stayed in its column only ever moves by whole stack steps, so take that flight
			// from the step count. The measured rect is where the card was *drawn*, which is still the
			// middle of an earlier flight when a move lands on top of one — starting from that stale spot
			// threw the card off the bottom of the screen before letting it climb back into place.
			const was = el.dataset.card ? placeAt.get(before)?.get(el.dataset.card) : undefined;
			const sits = columnPlace(el);
			if (was && sits && was.col === sits.col) {
				dx = 0;
				dy = (was.index - sits.index) * stackStep(el);
			}
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

			el.getAnimations().forEach((animation) => animation.cancel());
			el.style.zIndex = '30';

			const schedule = el.dataset.card ? home.get(el.dataset.card) : undefined;
			const delay = schedule?.delay ?? 0;
			const duration = schedule?.duration ?? FLIGHT_MS;
			// a bit of sideways tilt mid-flight, guaranteed to land perfectly vertical
			const tilt = Math.max(-6, Math.min(6, dx * 0.07));
			const flight = el.animate(
				[
					{ transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)` },
					{
						transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) rotate(${-tilt * 0.45}deg)`,
						offset: 0.6,
					},
					{ transform: 'none' },
				],
				{
					duration,
					delay,
					// hold the card at its old spot during the warmup instead of snapping home
					fill: 'backwards',
					easing: 'cubic-bezier(.2,.8,.2,1)',
				}
			);
			flight.finished
				.then(() => {
					el.style.zIndex = '';
				})
				.catch(() => {
					el.style.zIndex = '';
				});
		});
	}

	function startFlash(kind: FlashKind) {
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		flash = { kind, id: (flash?.id ?? 0) + 1 };
		setTimeout(
			() => {
				if (flash?.kind === kind) flash = null;
			},
			kind === 'level' ? 700 : 500
		);
	}

	function startFanfare(kind: FanfareKind, noteBoss = kind === 'boss', level?: number) {
		const done = () => {
			if (fanfare?.kind === kind) fanfare = null;
			if (noteBoss) bossNoted = true;
		};
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			// With no banner to wait for, the note is simply information and lands at once.
			if (noteBoss) bossNoted = true;
			return;
		}
		fanfare = { kind, id: (fanfare?.id ?? 0) + 1, level };
		setTimeout(done, kind === 'level' ? LESSER_FANFARE_MS : FANFARE_MS);
	}

	function shake(el?: HTMLElement | null) {
		if (!el || typeof el.animate !== 'function') return;
		el.getAnimations().forEach((animation) => animation.cancel());
		el.animate(
			[
				{ transform: 'translateX(0)' },
				{ transform: 'translateX(-6px)' },
				{ transform: 'translateX(6px)' },
				{ transform: 'translateX(-4px)' },
				{ transform: 'translateX(3px)' },
				{ transform: 'translateX(-1px)' },
				{ transform: 'translateX(0)' },
			],
			// ease-out so displacement is felt on the first frame, not eased into
			{ duration: 150, easing: 'ease-out' }
		);
	}

	/** Every state change goes through here, so the old positions are captured first. */
	function apply(next: FreeCell) {
		const before = cardRects();
		const primary = primaryId;
		// any state change invalidates a rewindable click
		primaryId = null;
		lastMove = null;
		game = next;
		void tick().then(() => animateFrom(before, next, primary));
	}

	/** After a drop, animate from where the cards were released, not from their old pile. */
	function applyFromDrag(next: FreeCell, before: Map<string, DOMRect>) {
		const primary = primaryId;
		primaryId = null;
		lastMove = null;
		game = next;
		void tick().then(() => animateFrom(before, next, primary));
	}

	/* ---------- click / double click ---------- */

	function applyResult(result: TapResult, el?: HTMLElement | null, primary?: string | null) {
		primaryId = primary ?? null;
		if (result.outcome === 'moved' || result.outcome === 'selected') apply(result.game);
		else {
			primaryId = null;
			if (result.outcome === 'shook') shake(el);
		}
	}

	function computeSingle(card: Card): TapResult {
		return card.location.fixture === 'cell' ? tapCell(game, card.location) : tapTableau(game, card.location);
	}

	function clearClickMemory() {
		if (pending) clearTimeout(pending.timer);
		pending = null;
		lastTap = null;
		lastMove = null;
		tombMoved = null;
		tombArmed = null;
	}

	function flushPending() {
		if (!pending) return;
		clearTimeout(pending.timer);
		const click = pending;
		pending = null;
		applyResult(click.result, click.el);
	}

	function doubleFrom(location: CardLocation, before: FreeCell): TapResult {
		return location.fixture === 'cell'
			? doubleTapCell(before, location)
			: doubleTapTableau(before, location);
	}

	/**
	 * The card has left the click point, so a second click can land on empty felt. Credit it to the
	 * card that just flew (ghost clickbox) and route it to the free cell / double-click action.
	 */
	/** A click on the felt where a card used to sit still belongs to that card (ghost clickbox). */
	function tombGhostHit(event: PointerEvent) {
		const moved = tombMoved;
		if (!moved || Date.now() - moved.time > GHOST_MS) return null;
		const r = moved.rect;
		const inX = event.clientX >= r.left - GHOST_PAD && event.clientX <= r.right + GHOST_PAD;
		const inY = event.clientY >= r.top - GHOST_PAD && event.clientY <= r.bottom + GHOST_PAD;
		return inX && inY ? moved : null;
	}

	function onBoardPointerDown(event: PointerEvent) {
		// the footer is not felt: a press on a control never counts as a card or ghost click
		if ((event.target as HTMLElement | null)?.closest('.controls')) return;
		if (tomb) {
			const moved = tombGhostHit(event);
			if (!moved) return;
			// The card below slides up into the box the moved card just left, so testing the pointer
			// against cards made the ghost box answer only on the exposed strip: a double click landed
			// on the card underneath and read as a single click. Claim the press whenever it is really
			// the second click on the card that moved; a fresh click on any other card is still its own.
			const onCard = (event.target as HTMLElement | null)?.closest('[data-card]');
			if (onCard && tombLast?.id !== moved.id) return;
			event.preventDefault();
			event.stopPropagation();
			tombMoved = null;
			tombLast = null;
			tombSelected = null;
			suppressClickUntil = Date.now() + 120;
			// the hop the first click made was a guess: send the card home instead
			const home = attackWith(moved.before, moved.from);
			if (home) {
				commit(home);
				// and take the hop out of history, so undo goes back before it
				tombHistory = tombHistory.slice(0, -1);
			}
			return;
		}

		if (pending) return;
		const move = lastMove;
		if (!move || !ghostClick(move, event.clientX, event.clientY, Date.now(), GHOST_MS)) return;
		if ((event.target as HTMLElement | null)?.closest('[data-card]')) return;

		event.preventDefault();
		event.stopPropagation();
		lastMove = null;
		lastTap = null;
		suppressClickUntil = Date.now() + 120;
		applyResult(doubleFrom(move.location, rewindTo(game, move.id, move.location)), undefined, move.id);
	}

	function tapCard(event: MouseEvent, card: Card) {
		event.stopPropagation();
		if (Date.now() < suppressClickUntil) return;

		const el = event.currentTarget as HTMLElement;

		if (tomb) {
			tombClick(event, card);
			return;
		}

		if (mode === 'pick') {
			apply(game.setCursor(card.location).touch());
			return;
		}

		const id = shorthandCard(card);
		const location = { ...card.location };
		const rect = el.getBoundingClientRect();

		// second click while the single move is still held: cancel it and take the double action
		if (pending?.id === id) {
			clearTimeout(pending.timer);
			const click = pending;
			pending = null;
			lastTap = null;
			lastMove = null;
			applyResult(doubleFrom(click.location, game), el, id);
			return;
		}
		// second click after the single move landed: rewind it, then take the double action
		if (lastMove?.id === id && Date.now() - lastMove.time < DOUBLE_CLICK_MS) {
			const move = lastMove;
			lastMove = null;
			lastTap = null;
			applyResult(doubleFrom(move.location, rewindTo(game, move.id, move.location)), el, id);
			return;
		}
		if (lastTap?.id === id && Date.now() - lastTap.time < DOUBLE_CLICK_MS) {
			lastTap = null;
			applyResult(doubleFrom(location, game), el, id);
			return;
		}
		if (pending) flushPending();

		const result = computeSingle(card);

		// A move that could still be a double click waits out the window, so the card stays under
		// the cursor and the second click can reach it. Everything else answers immediately.
		if (result.outcome === 'moved' && canDoubleTap(game, card)) {
			lastTap = null;
			pending = {
				id,
				el,
				location,
				rect,
				result,
				timer: setTimeout(() => {
					pending = null;
					applyResult(result, el, id);
					lastMove = { id, time: Date.now(), location, rect };
				}, DOUBLE_TAP_MS),
			};
			return;
		}

		applyResult(result, el, result.outcome === 'moved' ? id : null);
		lastMove = result.outcome === 'moved' ? { id, time: Date.now(), location, rect } : null;
		lastTap = result.outcome === 'shook' || result.outcome === 'selected' ? { id, time: Date.now() } : null;
	}

	function tap(location: CardLocation) {
		if (Date.now() < suppressClickUntil) return;
		flushPending();
		if (tomb) {
			tombSelected = null;
			// Clicking the empty felt puts a two-click spell's first pick down before it puts the spell away.
			const dropped = unpick(tomb);
			if (dropped) commit(dropped);
			else if (tomb.armed) commit(disarm(tomb));
			return;
		}
		apply(game.setCursor(location).touch());
	}

	/* ---------- tabletop tombcrawl ---------- */

	/**
	 * The boss reads as its name, its monster and the suit it lives in: "Medusa, Gorgon Boss of Clubs". The word is
	 * the post, not the card: Medusa is not a king, and the off-suit kings answer to her as Generals of their suits,
	 * so the tomb's own king is the same rank of title one step up rather than a king among generals.
	 */
	function bossTitle(state: TombState): string {
		const suit = state.bossSuit;
		if (!suit) return 'not revealed';
		const monster = MONSTERS[suit];
		return `${monster.boss}, ${monster.name} Boss of ${suit[0].toUpperCase()}${suit.slice(1)}`;
	}

	/** The tomb's full name, for a status line with the room for it: "Cairn of Vipers (♥)". */
	function tombFullTitle(state: TombState): string {
		const suit = state.bossSuit;
		if (!suit) return 'Tomb (?)';
		return `${TOMBS[suit]} (${SUIT_GLYPH[suit]})`;
	}

	/**
	 * The same name by its monster alone, "Viper (♥)": a phone's status line is a third of the width and the
	 * full name is a phrase, so the stylesheet swaps to this one on the narrow screens. Both carry the boss's
	 * own title in the tooltip.
	 */
	function tombTitle(state: TombState): string {
		const suit = state.bossSuit;
		if (!suit) return 'Tomb (?)';
		return `${MONSTERS[suit].name} (${SUIT_GLYPH[suit]})`;
	}

	/**
	 * Every card that carries no power is the tomb's ordinary filler, and its suit names its colour.
	 * Deliberately not named after the deal's monster: a rat is a rat in every tomb.
	 */
	const FODDER: Record<Suit, string> = {
		spades: 'Black Rat',
		hearts: 'Brown Rat',
		clubs: 'Grey Rat',
		diamonds: 'Red Rat',
	};

	/**
	 * Who a carrier answers to, and how far up the monster's own ranks it sits. Rank colours the flavour
	 * only — ace to five is a lesser monster, six to nine carries no prefix, ten to queen a greater one,
	 * and a king of any other suit is the boss's General. None of it changes a rule.
	 */
	function carrierName(state: TombState, card: Card) {
		if (!state.bossSuit) return '';
		const monster = MONSTERS[state.bossSuit].name;
		if (card.rank === 'king')
			return `${MONSTERS[state.bossSuit].boss}'s General of ${card.suit[0].toUpperCase()}${card.suit.slice(1)}`;
		const rank = getRankForCompare(card.rank);
		if (rank <= 4) return `Lesser ${monster}`;
		if (rank >= 9) return `Greater ${monster}`;
		return monster;
	}

	/**
	 * How big a rat is. The plain cards share the court's three ranges but not its words: a filler is
	 * graded the way a rat is measured, so it is small, medium or large and never lesser or greater.
	 */
	function ratName(card: Card) {
		const name = FODDER[card.suit];
		const rank = getRankForCompare(card.rank);
		if (rank <= 4) return `Small ${name}`;
		if (rank >= 9) return `Large ${name}`;
		return `Medium ${name}`;
	}

	/**
	 * The deal's one monster affliction, e.g. "Affliction: Mug — slaying this, or stashing it in a pocket,
	 * forces your conversion one step early: the chip walks left with no heal." The court and every other king wear it, so it is always read from the boss suit. A court card
	 * also carries the monster's one-line description; a General and the boss speak for themselves.
	 */
	function auraTitle(state: TombState, card: Card | null, withName = true) {
		if (!state.bossSuit) return '';
		const monster = MONSTERS[state.bossSuit];
		const line = `Affliction: ${monster.power} — ${monster.text}`;
		if (!withName) return line;
		const name = card ? carrierName(state, card) : monster.name;
		const blurb = card && card.rank !== 'king' ? `${monster.blurb}\n` : '';
		return `${name}\n${blurb}${line}`;
	}

	/**
	 * The last line of a card's tooltip: what the card pays when it is slain. Flat numbers, read off the deal, so
	 * the price of a card can be known before the blow rather than inferred from the bar afterwards.
	 */
	function goldNote(state: TombState, card: Card) {
		return `Drops ${goldValue(state, card)} gold on slay`;
	}

	/** The monster power this move set off, if it killed a card that carries one. */
	function powerFlash(before: TombState, after: TombState): FlashKind | null {
		if (!after.bossSuit || !auraActive(before)) return null;
		const slain = after.game.cards.find((card) => {
			if (card.location.fixture !== 'foundation' || !carriesPower(after, card)) return false;
			const was = before.game.cards.find((other) => shorthandCard(other) === shorthandCard(card));
			return !!was && was.location.fixture !== 'foundation';
		});
		if (!slain) return null;
		// Venom only bites when there is fog left to dig into.
		if (slain.suit === 'hearts') return after.hidden.length < before.hidden.length ? 'venom' : null;
		// Mug shows when the bandit forced the conversion: the chip walked left with no heal, so the draft shrinks.
		if (slain.suit === 'spades') return after.draft.length < before.draft.length ? 'mug' : null;
		// Stone Gaze is wounds, and the wound flash already answers for it; Mana Burn needs a glyph to drain.
		if (auraItemOf(after, slain) === null) return null;
		return 'mana';
	}

	/** The chip, clicked: the one conversion in the game, once the explicit rule is switched on. */
	function convertChipClick() {
		if (!tomb) return;
		const next = convertChip(tomb);
		if (next) commit(next);
	}

	function commit(next: TombState, before?: Map<string, DOMRect>) {
		if (!tomb) return;
		const wasHidden = new Set(tomb.hidden);
		const revealed = tomb.hidden.filter((id) => !next.hidden.includes(id));
		// Cards a spell fogged. A card already face down is not a card turning: only the newly hidden
		// ones get an animation, which is also why a hallway that is half fog turns half as long.
		const fogged = next.hidden.filter((id) => !wasHidden.has(id));
		const rects = before ?? cardRects();
		const power = powerFlash(tomb, next);
		// The track only flashes red when one of its cards turns face-down. A card leaving the track
		// (played to the board, converted home) costs a heart without costing a wound.
		const wounding = newlyWounded(tomb, next);
		const healing = newlyHealed(tomb, next);
		const leveled = currentLevel(next) > currentLevel(tomb);
		if (power) startFlash(power);
		else if (leveled) startFlash('level');
		else if (wounding.length) startFlash('damage');
		// A heal that comes with a level up is already gold: green is for the quiet repairs.
		else if (healing.length) startFlash('heal');
		// The boss appearing, the boss dying and the tomb emptying are the moments worth a banner. One move
		// can do two of them — the boss king is a card like any other — and then the bigger banner wins
		// while the kill is still noted once it clears.
		const foundBoss = !tomb.bossId && !!next.bossId;
		const killedBoss = !bossSlain(tomb) && bossSlain(next);
		// The first General is the kill that opens the boss to the blade, so it is worth a banner of its own;
		// the ones after it are ordinary kings going home.
		const slainGeneral = kingsHome(tomb) === 0 && kingsHome(next) > 0;
		const emptiedTomb = tombPar(next) === 0 && tombPar(tomb) > 0;
		if (killedBoss) bossNoted = false;
		if (emptiedTomb) startFanfare('tomb', killedBoss);
		else if (killedBoss) startFanfare('boss');
		else if (slainGeneral) startFanfare('general');
		else if (foundBoss) startFanfare('reveal');
		else if (leveled) startFanfare('level', false, currentLevel(next));
		// Sound, read off the same two boards as the flashes and banners above. Every true flag
		// plays, because a move that does two things should sound like two.
		const prev = tomb;
		const label = describeStep(prev, next);
		const wasLoc = new Map(prev.game.cards.map((card) => [shorthandCard(card), card.location]));
		const homedPrev = next.game.cards.filter(
			(card) => card.location.fixture === 'foundation' && wasLoc.get(shorthandCard(card))?.fixture !== 'foundation'
		);
		const spent = next.draft.find((entry) => next.exhausted[entry.cell] && !prev.exhausted[entry.cell]);
		// A glyph is exhausted the moment it is taken in hand, so its own arm move is not a use: arm.ogg is
		// the whole of that moment, for an item and a glyph alike. What a use sounds like is the ability
		// leaving the hand — a cast that resolved, a Potion or Elixir drunk, a Remedy spent on the action it
		// covered — and it sounds in the role's own voice.
		const armedNow = label?.startsWith('arm') ?? false;
		const resolved = prev.armed && !next.armed && next.exhausted[prev.armed.cell] ? prev.armed : null;
		const usedCell = resolved?.cell ?? (armedNow ? undefined : spent?.cell);
		const usedEntry = usedCell === undefined ? null : (prev.draft.find((entry) => entry.cell === usedCell) ?? null);
		/*
		 * A Wizard's item pocket holds a second glyph while Dualcast is live, so the sound has to follow the
		 * ability the slot is holding rather than the role the deal gave it: a cast out of that pocket is a glyph
		 * use, and the same pocket answers as an item again the moment the Wizard is stoned or wounded out.
		 */
		const usedIsGlyph = !!usedEntry && (usedEntry.role === 'glyph' || isDualcastItem(prev, usedEntry));
		// Take_damage counts the kill's clean bill only, read back off the board it was previewed on:
		// wounds the aura deals — Mana Burn on the glyph, a stashed Gorgon's gaze on the first passive
		// class — sound as affliction and nothing else, even when they land mid-slash.
		const killDamage = homedPrev.reduce((n, card) => {
			const at = wasLoc.get(shorthandCard(card));
			if (!at) return n;
			return n + attackPreview(prev, at).damage;
		}, 0);
		// Elf range sounds on every use: a buried kill, or a buried dig. Venom's fog-lift rides on
		// a kill or a stash, never on a dig, so a dig that lifts fog under the bolt is always his shot.
		const rangedDig =
			(label?.startsWith('dig') ?? false) &&
			revealed.some((id) => {
				const target = prev.game.cards.find((card) => shorthandCard(card) === id);
				return !!target && shotAt(prev, target.location);
			});
		playMoveSfx({
			homed: homedPrev.length > 0,
			// Generals are kings too: every king home, not just the boss, dies out loud.
			kingKilled: homedPrev.some((card) => card.rank === 'king'),
			ranged: homedPrev.some((card) => shotAt(prev, wasLoc.get(shorthandCard(card)) ?? null)) || rangedDig,
			dug: label?.startsWith('dig') ?? false,
			parked: label?.startsWith('park') ?? false,
			stepped: (label?.startsWith('move') ?? false) || (label?.startsWith('swap') ?? false),
			armed: armedNow,
			usedGlyph: usedIsGlyph,
			usedItem: !!usedEntry && !usedIsGlyph,
			converted: next.draft.length < prev.draft.length,
			leveled,
			bossFound: foundBoss,
			bossKilled: killedBoss,
			tombEmptied: emptiedTomb,
			damage: killDamage,
			// Sound wants every power the aura priced, not just the ones worth a flash:
			// a Gorgon kill doubles up with the slash, and a stash sets its power off too.
			afflicted: afflictionFired(tomb, next),
		});
		void recordRun(next);
		tombHistory = [...tombHistory, tomb];
		tomb = next;
		game = next.game;
		tombSelected = null;
		tombHover = null;
		primaryId = null;
		lastMove = null;
		if (revealed.length) {
			flippingIds = [...new Set([...flippingIds, ...revealed])];
			setTimeout(() => {
				flippingIds = flippingIds.filter((id) => !revealed.includes(id));
			}, FLIP_MS);
		}
		if (fogged.length) {
			// Order by hallway, then from the unburied card down: rows count upwards from the floor, so
			// the highest row of a hallway is the card with nothing on it.
			const ids = new Set(fogged);
			const turning = next.game.cards
				.filter((card) => card.location.fixture === 'cascade' && ids.has(shorthandCard(card)))
				.sort((a, b) => a.location.data[0] - b.location.data[0] || b.location.data[1] - a.location.data[1]);
			const delays: Record<string, number> = {};
			const turned = new Map<number, number>();
			for (const card of turning) {
				const hallway = card.location.data[0];
				const order = turned.get(hallway) ?? 0;
				turned.set(hallway, order + 1);
				delays[shorthandCard(card)] = order * TURN_STAGGER_MS;
			}
			if (Object.keys(delays).length) {
				turningDelays = { ...turningDelays, ...delays };
				const life = FLIP_MS + Math.max(...Object.values(delays));
				setTimeout(() => {
					turningDelays = Object.fromEntries(
						Object.entries(turningDelays).filter(([id]) => !(id in delays))
					);
				}, life);
			}
		}
		// a card that just took a wound turns face-down with the same animation, run backwards
		if (wounding.length) {
			woundingIds = [...new Set([...woundingIds, ...wounding])];
			setTimeout(() => {
				woundingIds = woundingIds.filter((id) => !wounding.includes(id));
			}, FLIP_MS);
		}
		// a healed card turns back face-up with the same animation, the other way round
		if (healing.length) {
			healingIds = [...new Set([...healingIds, ...healing])];
			setTimeout(() => {
				healingIds = healingIds.filter((id) => !healing.includes(id));
			}, FLIP_MS);
		}
		void tick().then(() => animateFrom(rects, next.game, null));
	}

	function tombDragRun(state: TombState, location: CardLocation): CardSequence | null {
		if (location.fixture === 'foundation') return null;
		if (location.fixture === 'cell') {
			// A plain scratch cell hands its card back; a drafted item waits for the chip to reach it.
			const index = location.data[0];
			const card = state.game.cells[index];
			if (!card) return null;
			// An armed CYDSTEPP can pick up a wounded card that would otherwise be locked.
			const parked = !cellCardMovable(state, index) && state.armed?.kind !== 'cydstepp';
			if (parked && !attackPreview(state, location).legal) return null;
			return { location, cards: [card], peekOnly: false };
		}
		// BURNDAYRAZ hands you a single card however deeply it lies: reaching under cover is the
		// spell's whole point, and the spell only ever burns the one card it was given.
		if (state.armed?.kind === 'burndayraz') {
			const held = tombRun(state, location);
			return held.length ? { location, cards: [held[0]], peekOnly: false } : null;
		}
		const run = tombRun(state, location);
		const column = state.game.tableau[location.data[0]] ?? [];
		if (!run.length || run[run.length - 1] !== column[column.length - 1]) return null;
		return { location, cards: run, peekOnly: false };
	}

	function tombDragTargets(state: TombState, location: CardLocation): string[] {
		const run = tombDragRun(state, location);
		if (!run) return [];
		const arm = state.armed;
		if (arm && arm.kind === 'pisorf') {
			// the whole pair goes into one open free cell
			return emptyCells(state).map((index) => `cell:${index}`);
		}
		if (arm && arm.kind === 'weytwut') {
			// a swap can take a card from any other column
			const fromColumn = location.fixture === 'cascade' ? location.data[0] : -1;
			return state.game.tableau
				.map((_, index) => index)
				.filter((index) => index !== fromColumn && (state.game.tableau[index]?.length ?? 0) > 0)
				.map((index) => `cascade:${index}`);
		}
		const keys: string[] = [];
		// A drafted item left of the chip, or a wounded cell, has no board targets.
		const parked = location.fixture === 'cell' && !cellCardMovable(state, location.data[0]);
		// A run longer than the free cells can hold only moves with the sack open.
		const overfull = run.cards.length > moveCapacity(state) && arm?.kind !== 'sack';
		state.game.tableau.forEach((column, index) => {
			const target = { fixture: 'cascade' as const, data: [index, Math.max(0, column.length - 1)] };
			if ((!parked && !overfull && canBuildOn(state, run.cards, target)) || cydsteppCanBury(state, run.cards, target))
				keys.push(`cascade:${index}`);
		});
		if (!parked && !overfull && run.cards.length === 1) emptyCells(state).forEach((index) => keys.push(`cell:${index}`));
		if (attackPreview(state, location).legal) {
			state.game.foundations.forEach((_, index) => keys.push(`foundation:${index}`));
		}
		return keys;
	}

	/** An empty free cell is only ever a target: for an armed PISORF it takes the whole pair. */
	function emptyCellClick(event: MouseEvent, location: CardLocation) {
		const state = tomb;
		if (!state || !state.armed) return tap(location);
		event.stopPropagation();
		const next = armedClick(state, location);
		if (next) return void commit(next);
		// An empty cell cannot partner a swap: the click puts the first card down and keeps the spell armed.
		const dropped = unpick(state);
		if (dropped) return void commit(dropped);
		shake(event.currentTarget as HTMLElement);
	}

	function tombClick(event: MouseEvent, card: Card) {
		const state = tomb;
		if (!state || state.won) return;
		const el = event.currentTarget as HTMLElement;
		const id = shorthandCard(card);

		const now = Date.now();
		const double = tombLast?.id === id && now - tombLast.time < DOUBLE_CLICK_MS;
		tombLast = double ? null : { id, time: now };

		// A card in hand answers a quick pair with the send-home a tableau card's double is: the first
		// click armed the glyph or drank the item, and this takes that click back, so the pair reads as one
		// action and the card goes home unspent. A card with no home keeps the click it already spent: the
		// second falls through to the ordinary armed click, which disarms.
		if (double && tombArmed?.id === id && state === tombArmed.after) {
			const arm = tombArmed;
			tombArmed = null;
			const home = attackWith(arm.before, arm.location);
			if (home) {
				commit(home);
				// the arm was never a move: undo goes back past the pair, not to its first click
				tombHistory = tombHistory.slice(0, -1);
				return;
			}
		}

		if (state.armed) {
			const armed = armedClick(state, card.location);
			if (armed) {
				commit(armed);
				return;
			}
			// A card that cannot partner the pick is a click off: put the first one down, spell still armed.
			const dropped = unpick(state);
			if (dropped) {
				commit(dropped);
				return;
			}
			// A Remedy or BYSSEPS holds no target: it waits for the action it covers, so the click still
			// has to do its ordinary job (dig the fog, select, move) — otherwise the item in hand locks
			// the whole board, including the dig that heals it.
			const waits = state.armed.kind === 'remedy' || state.armed.kind === 'sack';
			if (!waits) {
				shake(el);
				return;
			}
		}

		if (card.location.fixture === 'cell') {
			const index = card.location.data[0];
			if (double) {
				if (attackPreview(state, card.location).fatal) return void askDeath(card.location);
				const home = attackWith(state, card.location);
				if (home) return void commit(home);
				// The mirror of a tableau card falling back to a free cell: a plain cell's card goes to the
				// first column that will take it, so the double click can always answer on the way out.
				// An item is the exception: playing it out spends it for good, so that price is only ever
				// paid by a drag, where the player has already seen the card leave their hand.
				const column = draftAt(state, index)
					? undefined
					: tombDragTargets(state, card.location).find((key) => key.startsWith('cascade:'));
				const landed = column
					? tombMove(state, card.location, { fixture: 'cascade', data: [Number(column.split(':')[1])] })
					: null;
				if (landed) return void commit(landed);
				shake(el);
				return;
			}
			// The window is the one thing a spent pocket can still offer — Pickpocket refills from the
			// tableau — so the pick is asked beside the cast, or a spent item could never be armed.
			if (abilityUsable(state, index) || pickpocketUsable(state, index)) {
				const used = useAbility(state, index);
				if (used) {
					commit(used);
					// `$state` hands back a proxy, so the board the next click reads is not the object built
					// here: record the proxy the component will see, or the double's identity check can never
					// match and a target spell only ever disarms itself.
					tombArmed = { id, location: card.location, before: state, after: tomb ?? used };
					return;
				}
			}
			if (!cellCardMovable(state, index)) {
				shake(el);
				return;
			}
			tombSelected = card.location;
			return;
		}

		if (isFaceDown(state, card)) {
			// Digging is a click and nothing else: exposed cards for anyone, and anything an Elf's
			// lane of number cards reaches.
			const revealed = revealFaceDown(state, card.location);
			if (revealed) return void commit(revealed);
			shake(el);
			return;
		}

		if (double) {
			// A kill the party cannot afford is offered rather than refused: the confirm is the last move.
			if (attackPreview(state, card.location).fatal) return void askDeath(card.location);
			const home = attackWith(state, card.location);
			if (home) return void commit(home);
			const target = tombFirstCell(state);
			if (target) {
				const parked = tombMove(state, card.location, target);
				if (parked) return void commit(parked);
			}
			shake(el);
			return;
		}

		const targets = tombTapTargets(state, card.location);
		if (targets.length) {
			const moved = tombMove(state, card.location, targets[0]);
			if (moved) {
				tombMoved = {
					id,
					from: card.location,
					before: state,
					rect: el.getBoundingClientRect(),
					time: Date.now(),
				};
				return void commit(moved);
			}
		}
		tombSelected = card.location;
	}

	/** Eyes on the panel before the tomb is given up: the pill is one tap on a board holding a whole crawl. */
	function askExit() {
		if (!tomb || tomb.won) return;
		// A bare tomb has nothing left to give up: every card is home, so the pill banks the crawl on one
		// tap rather than asking about a board that no longer holds a decision.
		if (tombPar(tomb) === 0) return void exitTomb();
		pendingExit = true;
	}

	function takeExit() {
		pendingExit = false;
		exitTomb();
	}

	function exitTomb() {
		if (!tomb) return;
		const exited = tombExit(tomb);
		if (exited) {
			commit(exited);
			playSfx('exit');
		}
	}

	/** Copy the session, so it can be pasted beside a solver run on the same seed. */
	async function copyRecording() {
		if (!tomb) return;
		const text = transcript(tombHistory[0] ?? tomb, recordedSteps);
		// The background search's line rides along when it has one for this very deal, so the copy is
		// the session and the answer to it rather than the session alone.
		const found =
			probe && probe.status === 'done' && probe.solved && probe.seed === tomb.seed && probe.difficulty === difficulty
				? probe
				: null;
		const answer = found
			? [
					'',
					`solver  winnable in ${found.moves} moves  ·  ${found.nodes.toLocaleString()} states  ·  ${(found.elapsedMs / 1000).toFixed(1)}s`,
					...found.line.map((label: string, index: number) => `${String(index + 1).padStart(3)}  ${label}`),
				]
			: [];
		try {
			await navigator.clipboard.writeText([text, ...answer].join('\n'));
		} catch {
			// Clipboard needs a secure context: the panel text stays selectable by hand.
		}
	}

	function setVariant(next: 'tomb' | 'vanilla') {
		if (variant === next) return;
		clearClickMemory();
		tombHistory = [];
		tombSelected = null;
		tombLast = null;
		variant = next;
		if (next === 'tomb') {
			tomb = createTombState(undefined, FREE_CELL_COUNT[difficulty]);
		dealLayout = layoutForSeed(tomb.seed);
			game = tomb.game;
		} else {
			tomb = null;
			dealLayout = '';
			game = deal();
		}
	}

	/* ---------- drag ---------- */

	function pileKey(location: CardLocation) {
		return `${location.fixture}:${location.data[0]}`;
	}

	let angleFrame = 0;

	function reducedMotion() {
		return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
	}

	/**
	 * Drag inertia: pointer movement pushes a tilt, and every frame pulls it back to zero.
	 * Pointer stops, card settles dead vertical — no residual rotation at rest, ever.
	 */
	function startAngleLoop() {
		cancelAnimationFrame(angleFrame);
		const step = () => {
			if (!drag) return;
			drag.angle *= 0.9;
			if (Math.abs(drag.angle) < 0.05) drag.angle = 0;
			angleFrame = requestAnimationFrame(step);
		};
		angleFrame = requestAnimationFrame(step);
	}

	function stopAngleLoop() {
		cancelAnimationFrame(angleFrame);
		angleFrame = 0;
	}

	function onCardPointerDown(event: PointerEvent, card: Card) {
		if (card.location.fixture === 'foundation') return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		press = { card, x: event.clientX, y: event.clientY, dragged: false };
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
	}

	function onPointerMove(event: PointerEvent) {
		if (!press) return;
		const dx = event.clientX - press.x;
		const dy = event.clientY - press.y;

		if (!press.dragged) {
			if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			const run = tomb ? tombDragRun(tomb, press.card.location) : draggableRun(game, press.card.location);
			if (!run) return;
			clearClickMemory();
			press.dragged = true;
			drag = {
				cards: run.cards.map((card) => shorthandCard(card)),
				from: run.location,
				dx,
				dy,
				angle: 0,
				lastX: event.clientX,
				targets: tomb
					? tombDragTargets(tomb, run.location)
					: dragMoves(game, run.location).map((move) => pileKey(move.location)),
			};
			startAngleLoop();
			return;
		}

		if (drag) {
			drag.dx = dx;
			drag.dy = dy;
			if (!reducedMotion()) {
				const swing = Math.max(-9, Math.min(9, (event.clientX - drag.lastX) * 0.9));
				drag.lastX = event.clientX;
				drag.angle += (swing - drag.angle) * 0.5;
			}
		}
	}

	/**
	 * The exact card under the pointer. A drop normally means "this column", but BURNDAYRAZ burns the
	 * card it is pointed at however many cards are stacked on top of it, so a buried card's sliver is
	 * a target in its own right rather than a stand-in for the top of its column.
	 */
	function cardUnderPointer(x: number, y: number): CardLocation | null {
		const id = document.elementFromPoint(x, y)?.closest<HTMLElement>('.card')?.dataset.card;
		if (!id) return null;
		const card = game.cards.find((candidate) => shorthandCard(candidate) === id);
		return card?.location ?? null;
	}

	function dropTargetAt(x: number, y: number): CardLocation | null {
		if (tomb?.armed?.kind === 'burndayraz') {
			const aimed = cardUnderPointer(x, y);
			if (aimed) return aimed;
		}
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
		const drop = el?.dataset.drop;
		if (!drop) return null;
		const [fixture, index] = drop.split(':');
		if (fixture !== 'cell' && fixture !== 'foundation' && fixture !== 'cascade') return null;
		const i = Number(index);
		if (fixture === 'cascade') {
			return { fixture, data: [i, Math.max(0, (game.tableau[i]?.length ?? 1) - 1)] };
		}
		return { fixture, data: [i] };
	}

	function onPointerUp(event: PointerEvent) {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);

		const finished = press;
		press = null;
		stopAngleLoop();
		if (!finished?.dragged) return;

		suppressClickUntil = Date.now() + 350;
		const from = drag?.from;
		const to = dropTargetAt(event.clientX, event.clientY);
		// where the cards sit under the pointer, captured before the drag transform clears
		const before = cardRects();
		drag = null;

		if (from && to) {
			if (tomb) {
				// An armed ability answers the drop instead of moving the cards.
				const next = tomb.armed ? armedDrop(tomb, from, to) : tombMove(tomb, from, to);
				if (next) {
					commit(next, before);
					return;
				}
			} else {
				const next = moveRun(game, from, to);
				if (next) {
					primaryId = shorthandCard(finished.card);
					applyFromDrag(next, before);
					return;
				}
			}
			// illegal drop: put it back and shake, so the gesture always answers
			const id = shorthandCard(finished.card);
			void tick().then(() => shake(board?.querySelector<HTMLElement>(`[data-card="${id}"]`)));
			return;
		}

		// dropped on empty felt: snap back silently
		const id = shorthandCard(finished.card);
		void tick().then(() => shake(board?.querySelector<HTMLElement>(`[data-card="${id}"]`)));
	}

	/** The column holding the locked boss: its stacking context keeps the lean inside the column. */
	function bossColumn(cards: Card[]): boolean {
		const state = tomb;
		if (!state || !bossProtected(state)) return false;
		if (!cards.some((card) => isBoss(state, card))) return false;
		// Only the column a drag is coming from loses its stacking context, so the moving card can ride
		// over the board; every other column keeps the frozen king's lean contained to itself.
		return !cards.some((card) => dragIds.has(shorthandCard(card)));
	}

	function cardStyle(card: Card, i: number) {
		const base = `--i:${i};`;
		if (!drag || !dragIds.has(shorthandCard(card))) return base;
		return `${base}transform:translate(${drag.dx}px,${drag.dy}px) rotate(${drag.angle}deg);z-index:40;`;
	}

	function cellImageStyle(card: Card) {
		if (!drag || !dragIds.has(shorthandCard(card))) return '';
		// `animation:none` because a dragged card must follow the pointer: a float animation outranks an
		// inline transform in the cascade, so the card would drift where it stands instead.
		return `transform:translate(${drag.dx}px,${drag.dy}px) rotate(${drag.angle}deg);animation:none;z-index:40;pointer-events:none;`;
	}

	/* ---------- controls ---------- */

	/**
	 * Sound effects, off until the speaker pill says otherwise. The setting is kept in IndexedDB so it survives
	 * a reload, and written to localStorage as well, purely to seed the first paint: a database read is async,
	 * and a speaker that flips on a frame after the page opens reads as a setting the page had lost. The
	 * database wins when the two disagree, because it is the copy that outlives a cleared localStorage.
	 */
	function storedSfx(): boolean {
		try {
			return localStorage.getItem('tombcrawl.sfx') === '1';
		} catch {
			return false;
		}
	}
	function rememberSfx(on: boolean) {
		try {
			localStorage.setItem('tombcrawl.sfx', on ? '1' : '0');
		} catch {
			// A browser that forgets is still a browser that plays.
		}
		void writePreference('sfx', on);
	}
	let sfxOn = $state(storedSfx());
	$effect(() => {
		setSfxEnabled(sfxOn);
	});
	onMount(() => {
		void readPreference('sfx').then((stored) => {
			if (typeof stored !== 'boolean' || stored === sfxOn) return;
			sfxOn = stored;
			try {
				localStorage.setItem('tombcrawl.sfx', stored ? '1' : '0');
			} catch {
				// the database already has it
			}
		});
	});
	function toggleSfx() {
		sfxOn = !sfxOn;
		rememberSfx(sfxOn);
		// The tap that turns it on is the gesture, so the blip always lands.
		if (sfxOn) playSfx('arm');
	}

	function undoMove() {
		flushPending();
		if (tomb) {
			const previous = tombHistory.at(-1);
			if (!previous) return;
			const before = cardRects();
			tombHistory = tombHistory.slice(0, -1);
			tomb = previous;
			game = previous.game;
			tombSelected = null;
			void tick().then(() => animateFrom(before, previous.game, null));
			return;
		}
		// the deal itself is a history entry; undoing it would empty the board
		if (PREVIOUS_ACTION_TYPE_IS_START_OF_GAME.has(game.previousAction.type)) return;
		apply(game.undo({ toggleCursor: true }));
	}

	/**
	 * Starting over throws a run away, so the two pills ask first once a move has been made. A board still
	 * on its first position has nothing to lose and goes straight through, which is what makes the pills
	 * quick at the start of a crawl and deliberate once there is a line to lose.
	 */
	function askReset(kind: 'new' | 'restart') {
		// A queued tap is a move too: settle it before counting, or a fast second tap skips the question.
		flushPending();
		const moves = tomb ? tombHistory.length : 0;
		if (!moves) {
			if (kind === 'restart') replay();
			else newDeal();
			return;
		}
		pendingReset = kind;
	}

	function takeReset() {
		const kind = pendingReset;
		pendingReset = null;
		if (kind === 'restart') replay();
		else if (kind === 'new') newDeal();
	}

	/**
	 * A blow the party cannot afford is not simply refused: double-clicking it offers the last move of
	 * the crawl behind a yes or no, and taking it lands the card while the delver falls.
	 */
	function askDeath(location: CardLocation) {
		if (!tomb || tomb.won) return;
		if (!attackPreview(tomb, location).fatal) return;
		pendingDeath = location;
	}

	function takeDeath() {
		const at = pendingDeath;
		pendingDeath = null;
		if (!tomb || !at) return;
		const next = attackWith(tomb, at, false, true);
		if (next) commit(next);
	}

	/*
	 * The deal. Every card in the crawl starts as a back stacked on the title mark and is flung to the square
	 * it will occupy, which is the one moment the whole board can be read at once: four party cards, eight
	 * hallways, and how deep the fog runs. It is a flourish, not a reader — the board underneath is laid out
	 * and only hidden, so the flight lands on the exact rectangles the cards will keep, and a click anywhere
	 * ends it on the spot.
	 *
	 * The cards are dealt on a running stagger rather than one at a time: the next card leaves the mark while
	 * the one before it is still in the air, which is what makes fifty-two of them read as a deal and not as a
	 * queue. A card that will be known at the end of it — a hallway's bottom card, a party aspect — turns over
	 * as it lands, with the same turn the fogger uses when it puts a back on a card, run backwards.
	 */
	/*
	 * The pace is set to the sound. `deal.ogg` runs 1.49 s, and a deal that outlasts it reads as two things
	 * happening rather than one, so the whole schedule is sized to land the last card and hand the board over
	 * as the shuffle finishes: 45 card-slots of stagger, six row gaps and one flight come to about 1.43 s.
	 */
	/** Card to card inside a row: one hallway's cards follow each other into the air. */
	const DEAL_STAGGER_MS = 16;
	/**
	 * Row to row: a beat after the last card of a row has been dealt before the next row starts. Short enough that
	 * the rows still overlap in the air (a row's last card is barely off the mark when the next row opens), long
	 * enough that the rows are read as rows instead of one continuous diagonal stream of cards.
	 */
	const DEAL_ROW_GAP_MS = 64;
	const DEAL_FLIGHT_MS = 330;
	const DEAL_TURN_MS = 120;
	/** The beat between the last card landing and the layer dissolving: just enough to see the board arrive. */
	const DEAL_HANDOVER_MS = 60;
	/**
	 * Where in the flight a readable card starts to turn. Placed by the distance still to go rather than by clock
	 * time: the flight speeds up through its middle, so a turn timed at the halfway mark finds the card almost
	 * home already — at 0.6 it was 97% of the way in and read as a flip after landing. Measured at 0.2, the turn
	 * covers the last few percent of the mark to nine tenths of the trip and the face appears around three
	 * quarters of the way, so the card is plainly in the air while it turns.
	 */
	const DEAL_TURN_AT = 0.2;
	let dealing = $state(false);
	/** Bumped by every end and every start, so an awaited deal knows it has been superseded. */
	let dealRun = 0;
	let dealLayer: HTMLDivElement | null = null;
	let dealAnimations: Animation[] = [];
	let dealTimers: number[] = [];

	/** Ends the deal wherever it stands: every card snaps to the square it was flying to. */
	function endDeal() {
		// a deal that is still waiting on the deck sees this and gives up instead of starting over the top
		dealRun++;
		for (const timer of dealTimers) clearTimeout(timer);
		dealTimers = [];
		for (const animation of dealAnimations) animation.cancel();
		dealAnimations = [];
		dealLayer?.remove();
		dealLayer = null;
		dealing = false;
	}

	/**
	 * Hands the board over. The dealt cards are the same pictures the board's own cards are about to show, so
	 * the layer is not taken away but dissolved over the top of them: the labels, the chip and the boss-suit
	 * stains come up underneath while the flights still cover them, and what the player sees is the deal
	 * settling rather than a second board being switched on.
	 */
	function settleDeal() {
		const layer = dealLayer;
		if (!layer) {
			endDeal();
			return;
		}
		for (const timer of dealTimers) clearTimeout(timer);
		dealTimers = [];
		// the board is allowed to draw a frame before the layer goes translucent over it
		dealing = false;
		layer.style.pointerEvents = 'none';
		layer.removeEventListener('pointerdown', endDeal);
		for (const el of document.querySelectorAll<HTMLElement>(
			'.board .slot .kind, .board .slot .sash, .board .cells .chip'
		)) {
			el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
		}
		const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
		fade.finished.then(
			() => dealLayer === layer && endDeal(),
			() => undefined // a cancelled fade was a dismissal, which has already cleared the layer
		);
	}

	async function startDeal() {
		endDeal();
		if (!board || !tomb) return;
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		const run = dealRun;
		// the table is covered while the deck decodes, so the wait shows an empty board rather than a laid-out
		// one that then hides itself
		dealing = true;
		await (deckReady ?? warmCardImages());
		if (run !== dealRun) return;
		// the logo itself, not the button it sits in: the title card is a grid cell as wide as the header,
		// so measuring it would start every card from the middle of the page
		const mark =
			document.querySelector<HTMLElement>('.titlecard .titlemark svg') ??
			document.querySelector<HTMLElement>('.titlecard svg') ??
			document.querySelector<HTMLElement>('.titlecard .titlemark') ??
			document.querySelector<HTMLElement>('.titlecard');
		if (!mark) return endDeal();
		const origin = mark.getBoundingClientRect();
		const fogged = new Set(tomb.hidden);
		// measured before the board is hidden, on the rects the cards will actually keep
		const measured = [...board.querySelectorAll<HTMLElement>('[data-card]')]
			.map((el) => {
				const rect = visualRect(el);
				/*
				 * Dealt at the size the tableau lays a card out, not the size it happens to be drawn at: the boss
				 * king wears a 10% upsize, and a blow-up that only one card in the deck has would fly larger than
				 * the rest and settle back down as it lands. The layout box ignores the transform; the centre of
				 * the drawn rect keeps the card landing where the board will hold it.
				 */
				const width = el.offsetWidth || rect.width;
				const height = el.offsetHeight || rect.height;
				return {
					id: el.dataset.card ?? '',
					rect: {
						left: rect.left + (rect.width - width) / 2,
						top: rect.top + (rect.height - height) / 2,
						width,
						height,
					},
				};
			})
			.filter((spot) => spot.id && spot.rect.width > 0)
			.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
		if (!measured.length) return endDeal();
		/*
		 * Dealt across rows, not down columns. A row of the layout is not a row of the screen: the pockets,
		 * the party and each hallway open at their own height, so the cards are banded by their top first —
		 * anything within a third of a card's height of the band's first card belongs to that band — and read
		 * left to right inside it. A fan is dealt along the hallway rather than one hallway at a time, and the
		 * deal sweeps the table the way the eye reads it.
		 */
		/*
		 * How far apart two cards can sit in height and still be the same row. It is read off the board rather than
		 * fixed in pixels: the step from one rank of a fan to the next is the smallest gap between two cards that
		 * share a left, and a row may never be wider than a bit more than half of it — otherwise a wide screen
		 * folds two ranks of every hallway into one row and the deal stops reading as rows at all.
		 */
		const topsByLeft = new Map<number, number[]>();
		for (const spot of measured) {
			const key = Math.round(spot.rect.left);
			const tops = topsByLeft.get(key);
			if (tops) tops.push(spot.rect.top);
			else topsByLeft.set(key, [spot.rect.top]);
		}
		let fanStep = Number.POSITIVE_INFINITY;
		for (const tops of topsByLeft.values()) {
			tops.sort((a, b) => a - b);
			for (let i = 1; i < tops.length; i++) {
				const gap = tops[i] - tops[i - 1];
				if (gap > 1 && gap < fanStep) fanStep = gap;
			}
		}
		const bandTolerance = Number.isFinite(fanStep) ? fanStep * 0.6 : measured[0].rect.width * 0.35;
		const banded: { spot: (typeof measured)[number]; band: number }[] = [];
		let band = Number.NEGATIVE_INFINITY;
		for (const spot of measured) {
			if (spot.rect.top - band > bandTolerance) band = spot.rect.top;
			banded.push({ spot, band });
		}
		banded.sort((a, b) => a.band - b.band || a.spot.rect.left - b.spot.rect.left);
		const spots = banded.map((entry) => entry.spot);
		/*
		 * Rows are dealt one at a time: the cards of a row follow each other by the card stagger, and the next row
		 * only opens once the last card of this one is on its way, plus the gap. The delay is therefore not a card
		 * count but a time per row, which is what keeps the rows separate even though they are all in the air at once.
		 */
		const rowDelays: number[] = [];
		let clock = 0;
		for (let start = 0; start < banded.length; ) {
			let end = start;
			while (end + 1 < banded.length && banded[end + 1].band === banded[start].band) end++;
			for (let index = start; index <= end; index++) rowDelays[index] = clock + (index - start) * DEAL_STAGGER_MS;
			clock += (end - start) * DEAL_STAGGER_MS + DEAL_ROW_GAP_MS;
			start = end + 1;
		}

		const layer = document.createElement('div');
		layer.className = 'deal';
		layer.addEventListener('pointerdown', endDeal);
		const middle = [origin.left + origin.width / 2, origin.top + origin.height / 2];
		const started = performance.now();
		// the shuffle and the fling, once per deal, on the frame the first card leaves the mark
		playSfx('deal');
		spots.forEach((spot, index) => {
			const item = document.createElement('div');
			item.className = 'deal-card';
			item.style.left = `${spot.rect.left}px`;
			item.style.top = `${spot.rect.top}px`;
			item.style.width = `${spot.rect.width}px`;
			item.style.height = `${spot.rect.height}px`;
			const picture = document.createElement('img');
			picture.src = `${BASE}images/back.svg`;
			picture.alt = '';
			picture.draggable = false;
			item.appendChild(picture);
			layer.appendChild(item);

			const dx = middle[0] - (spot.rect.left + spot.rect.width / 2);
			const dy = middle[1] - (spot.rect.top + spot.rect.height / 2);
			const delay = rowDelays[index];
			dealAnimations.push(
				item.animate(
					[
						// no scaling anywhere: a card leaves the mark at the size it will be played at, so the
						// flight is a move and not a grow
						{ transform: `translate(${dx}px, ${dy}px) rotate(-9deg)`, opacity: 0.3 },
						{
							transform: `translate(${dx * 0.45}px, ${dy * 0.32}px) rotate(5deg)`,
							opacity: 1,
							offset: 0.45,
						},
						{ transform: 'none', opacity: 1 },
					],
					// a steadier curve than the drag flights use: those snap to a slot the player is aiming at, while
					// a dealt card has to stay in the air long enough to be seen turning over on the way
					{ duration: DEAL_FLIGHT_MS, delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }
				)
			);

			/*
			 * A card that will be readable when the dust settles turns over on the way in, not after it has
			 * landed: the turn starts around the last three fifths of the flight and is finished before the
			 * card settles, so it arrives face-up rather than sitting still and then flipping. The turn is
			 * scaled on the picture inside the flying card, because the card itself is already using its own
			 * transform for the flight and a second transform animation there would fight it.
			 */
			const face = `${BASE}images/${spot.id[0]}${spot.id[1].toLowerCase()}.png`;
			if (!fogged.has(spot.id)) {
				dealTimers.push(
					window.setTimeout(() => {
						dealAnimations.push(
							picture.animate(
								[
									{ transform: 'none' },
									{ transform: 'scaleX(0.04)', offset: 0.5 },
									{ transform: 'none' },
								],
								{ duration: DEAL_TURN_MS, easing: 'ease-in-out' }
							)
						);
						// the face is swapped at the edge-on frame, where a card would show neither side
						dealTimers.push(window.setTimeout(() => (picture.src = face), DEAL_TURN_MS / 2));
					}, delay + DEAL_FLIGHT_MS * DEAL_TURN_AT)
				);
			}
		});

		dealLayer = layer;
		document.body.appendChild(layer);
		dealing = true;
		// the last card's flight, its turn, and a beat to look at the board before it is handed over
		const total = performance.now() - started + rowDelays[rowDelays.length - 1] + DEAL_FLIGHT_MS + DEAL_HANDOVER_MS;
		dealTimers.push(window.setTimeout(settleDeal, total));
	}

	function newDeal() {
		clearClickMemory();
		pendingDeath = null;
		pendingExit = false;
		const requested = Number.parseInt(seedInput, 10);
		const valid = Number.isFinite(requested) && requested >= 1 && requested <= 32000;
		// A boardstring is a position rather than a deal: pasting one sets the crawl down on a board
		// somebody already reached, which is how a debug state or a hand-played line is continued.
		const pasted = variant === 'tomb' ? decodeBoard(seedInput) : null;
		seedInput = '';
		if (variant === 'tomb') {
			// New crawl clears the solver reading even when the same deal comes back: the player has
			// started again, and the bar should start again with them.
			clearProbe();
			tombHistory = [];
			tombSelected = null;
			tombLast = null;
			if (pasted) {
				// Nobody dealt this board, so no square on the sheet is its own.
				tomb = pasted;
				dealLayout = '';
				game = pasted.game;
				return;
			}
			tomb = createTombState(valid ? requested : undefined, FREE_CELL_COUNT[difficulty]);
			// A new deal leaves the sheet alone: a random seed is nobody's corpus square, and a typed one is
			// only a square if the corpus actually holds that deal.
			dealLayout = layoutForSeed(tomb.seed);
			game = tomb.game;
			void tick().then(() => startDeal());
			return;
		}
		apply(deal(valid ? requested : undefined));
	}

	/**
	 * A restart deals the same tomb, fog included, and every card flies back to the square it started on. A
	 * card that had been dug out leaves as a face and has a back to put on again, so it turns over in the air
	 * with the fogger's own animation (`turningDelays`): held off until the flight has started, and staggered
	 * by hallway so the cover reads as a wave. A card that was already face down keeps its back and never
	 * turns, and a card that goes back face down where it stood still turns, because the deal put its back on.
	 */
	function refogOnRestart(state: TombState, wasHidden: Set<string>) {
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		const fogging = new Set(state.hidden);
		const delays: Record<string, number> = {};
		for (const card of state.game.cards) {
			if (card.location.fixture !== 'cascade') continue;
			const id = shorthandCard(card);
			if (!fogging.has(id) || wasHidden.has(id)) continue;
			delays[id] = REFOG_DELAY_MS + card.location.data[0] * REFOG_STAGGER_MS;
		}
		if (!Object.keys(delays).length) return;
		turningDelays = { ...turningDelays, ...delays };
		const life = FLIP_MS + Math.max(...Object.values(delays));
		setTimeout(() => {
			// By delay rather than by key: a move made while these are still turning re-fogs a card with
			// the fogger's own turn, and that later one must not be cut short by this timer.
			turningDelays = Object.fromEntries(Object.entries(turningDelays).filter(([id, ms]) => delays[id] !== ms));
		}, life);
	}

	function replay() {
		flushPending();
		pendingDeath = null;
		pendingExit = false;
		if (tomb) {
			// Measured before the deal is put back, so every card has somewhere to fly home from.
			const before = cardRects();
			// Which cards were still in the fog: those are the ones that fly home wearing a back already.
			const wasHidden = new Set(tomb.hidden);
			tombHistory = [];
			tombSelected = null;
			// The same deal again, so the square it belongs to is unchanged.
			tomb = createTombState(tomb.seed, FREE_CELL_COUNT[difficulty]);
			game = tomb.game;
			const redealt = game;
			refogOnRestart(tomb, wasHidden);
			void tick().then(() => animateFrom(before, redealt, null));
			return;
		}
		apply(deal(seed));
	}

	function key(location: CardLocation) {
		return `${location.fixture}:${location.data.join('-')}`;
	}

	function img(card: Card) {
		const short = shorthandCard(card);
		return `${BASE}images/${short[0]}${short[1].toLowerCase()}.png`;
	}

	/** Warm every picture once, so a flip never waits on a fetch or a decode. */
	/**
	 * The deck's pictures, decoded once per page. `decode()` is the real gate and not a guess at a loading
	 * time: it resolves when the browser has the bitmap ready to paint, which is the thing a dealt card needs
	 * — downloading the bytes is not enough, and a card whose face is still being decoded lands blank while
	 * its flight goes on. The wait is capped so a picture that never decodes cannot hold the board hostage.
	 */
	let deckReady: Promise<void> | null = null;
	const DECK_WAIT_CAP_MS = 3000;

	function warmCardImages(): Promise<void> {
		if (deckReady) return deckReady;
		const decoded = CARD_IMAGES.map((name) => {
			const image = new Image();
			// the back is its own drawing rather than a face, and it is a vector: warm the file the board
			// actually asks for, or the deal's first frame is a broken picture waiting on a 404
			image.src = name === 'back' ? `${BASE}images/back.svg` : `${BASE}images/${name}.png`;
			return image.decode?.().catch(() => undefined) ?? Promise.resolve();
		});
		const cap = new Promise<void>((resolve) => {
			window.setTimeout(resolve, DECK_WAIT_CAP_MS);
		});
		deckReady = Promise.race([Promise.all(decoded).then(() => undefined), cap]);
		return deckReady;
	}

	onMount(warmCardImages);
	// the opening deal: the board is already laid out under the flight, so this only has to look at it
	onMount(() => {
		void tick().then(() => startDeal());
		return endDeal;
	});
	onMount(() => {
		const mq = window.matchMedia?.('(pointer: coarse)');
		if (!mq) return;
		const sync = () => (coarsePointer = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	/**
	 * Every card on one foundation, bottom to top. Rendering only the top card meant the pile was
	 * unmounted as soon as the next card left, so the foundation sat empty while that card flew
	 * and the arriving card had no card to land on.
	 */
	function foundationStack(index: number): Card[] {
		return game.cards
			.filter((card) => card.location.fixture === 'foundation' && card.location.data[0] === index)
			.sort((a, b) => getRankForCompare(a.rank) - getRankForCompare(b.rank));
	}

	const selected = $derived(
		tomb
			? new Set(tombSelected ? [key(tombSelected)] : [])
			: new Set(game.selection?.cards.map((card) => key(card.location)) ?? [])
	);
</script>

{#snippet swords()}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<g transform="rotate(45 12 12)">
			<path d="M12 1.6 14.1 5.2V13h-4.2V5.2z" fill="#e9f1f6" stroke="#3d4a55" stroke-width="0.55" />
			<rect x="8.2" y="13" width="7.6" height="1.9" rx="0.95" fill="#f4c96b" />
			<rect x="10.9" y="14.9" width="2.2" height="4.2" fill="#e5926f" />
			<circle cx="12" cy="20.4" r="1.4" fill="#f4c96b" />
		</g>
		<g transform="rotate(-45 12 12)">
			<path d="M12 1.6 14.1 5.2V13h-4.2V5.2z" fill="#e9f1f6" stroke="#3d4a55" stroke-width="0.55" />
			<rect x="8.2" y="13" width="7.6" height="1.9" rx="0.95" fill="#f4c96b" />
			<rect x="10.9" y="14.9" width="2.2" height="4.2" fill="#e5926f" />
			<circle cx="12" cy="20.4" r="1.4" fill="#f4c96b" />
		</g>
	</svg>
{/snippet}

{#snippet skull()}
	<!-- The bill, not the blow: this kill costs more hearts than the track holds. -->
	<img class="skull" src={`${BASE}images/skull.png`} alt="" draggable="false" />
{/snippet}

{#snippet bolt()}
	<!-- The archer's mark: the same kill, told as a shot down a lane instead of a swing. -->
	<img class="bolt" src={`${BASE}images/range-arrow.png`} alt="" draggable="false" />
{/snippet}

<div
	class="board"
	class:tomb={!!tomb}
	class:dealing
	bind:this={board}
	role="application"
	aria-label="FreeCell board"
	onpointerdown={onBoardPointerDown}
>
	<!--
		Boss and minion cards are tinted with a colour matrix applied to their own face image, not with
		a translucent layer stacked over the card. Both define the same blend the old overlay drew
		(alpha x purple), so the artwork carries the stain through flips, leans and any motion to come.
	-->
	<svg class="tints" aria-hidden="true" focusable="false">
		<defs>
			<filter id="tombMinion" color-interpolation-filters="sRGB">
				<feColorMatrix
					type="matrix"
					values="0.78 0 0 0 0.1035 0 0.78 0 0 0.0414 0 0 0.78 0 0.1639 0 0 0 1 0"
				/>
			</filter>
			<filter id="tombBoss" color-interpolation-filters="sRGB">
				<feColorMatrix
					type="matrix"
					values="0.58 0 0 0 0.2471 0 0.58 0 0 0.0988 0 0 0.58 0 0.42 0 0 0 1 0"
				/>
			</filter>
			<!--
				Pickpocket's window: the item card is washed the blue the interface keeps for a card that can still be
				somewhere it is not. Same shape as the tomb stains — a matrix on the artwork, so it turns and scales with
				the float — but pulled the other way: red comes down, blue goes up, and the pips stay dark against it.
			-->
			<filter id="tombStolen" color-interpolation-filters="sRGB">
				<feColorMatrix
					type="matrix"
					values="0.46 0 0 0 0.13 0 0.6 0 0 0.15 0 0 0.78 0 0.32 0 0 0 1 0"
				/>
			</filter>
		</defs>
	</svg>

	<header class="top" class:tomb={!!tomb}>
		{#if tomb}
			<button
				type="button"
				class="titlecard"
				onclick={openLayout}
				title="Choose a loadout: every arrangement the four roles can make, and how far you have got with it"
				aria-label="Tabletop Tombcrawl — choose a loadout"
			>
				<span class="titlemark">{@html titleMark}</span>
			</button>
		{/if}

		<div class="foundations" class:tomb={!!tomb}>
			{#each game.foundations as card, i}
				{@const location = { fixture: 'foundation' as const, data: [i] }}
				{@const stack = foundationStack(i)}
				{@const lifts = !!card && levelUp.has(card.suit)}
				<!-- thirteen cards is every rank of the suit: the pile has no gaps and nothing can follow -->
				{@const full = stack.length === 13}
				<!--
					The ranks this pile has passed over because the party holds them: a drafted card never comes
					home, so the grave builds above it, and the pile is further along than its face says.
				-->
				{@const skips = tomb && card && !full ? phantomRank(tomb, card.suit) - foundationTopRank(tomb, card.suit) : 0}
				<button
					class="slot"
					class:empty={!stack.length}
					class:levelup={lifts}
					class:full
					data-drop={`foundation:${i}`}
					title={[
						full ? 'This grave is full: every rank of this suit is home' : null,
						!full && lifts ? 'A card home here takes you to the next level' : null,
						!full && skips
							? `${skips === 1 ? 'The next rank is' : `The next ${skips} ranks are`} held by the party, so this grave builds above ${skips === 1 ? 'it' : 'them'}`
							: null,
					]
						.filter(Boolean)
						.join('. ') || undefined}
					aria-label={`grave ${i + 1}${card ? `, ${card.rank} of ${card.suit}` : ', empty'}${
						full ? ', full' : lifts ? ', the next card here levels you up' : ''
					}${skips ? `, skipping ${skips} rank${skips === 1 ? '' : 's'} the party holds` : ''}`}
					onclick={() => tap(location)}
				>
					{#if stack.length}
						{#each stack as stacked (shorthandCard(stacked))}
							<img src={img(stacked)} alt="" draggable="false" data-card={shorthandCard(stacked)} />
						{/each}
						{#if full}
							<img class="grave-back" src={`${BASE}images/back.svg`} alt="" draggable="false" />
						{/if}
					{:else}
						<img class="blank" src={`${BASE}images/blank.png`} alt="" draggable="false" />
					{/if}
					<!--
						Two chevrons, not the level-up arrow: this grave is not about to lift you a level, it has
						climbed past ranks the party is holding. Drawn on the slot rather than on the card, so no
						boss-suit wash can tint it, the way the affliction marks sit over the face and not in it.
					-->
					{#if skips}
						<span class="phantoms" aria-hidden="true">
							<svg viewBox="0 0 14 18" fill="none" stroke="#7cc0ff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
								<path d="M2 7.6 7 2.6 12 7.6" />
								<path d="M2 15.2 7 10.2 12 15.2" />
							</svg>
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<span class="gravesplit" aria-hidden="true"></span>

		<div class="cells" class:tomb={!!tomb} style={`--cell-count:${game.cells.length}`}>
			{#each game.cells as card, i}
				{@const location = { fixture: 'cell' as const, data: [i] }}
				{@const entry = tomb ? draftAt(tomb, i) : undefined}
				{@const stone = !!tomb && stoneCell(tomb, i)}
				{@const live = tomb && entry ? draftAbility(tomb, entry) : undefined}
				{@const pending = tomb?.itemWindow && tomb.itemWindow.cell === i ? tomb.itemWindow : undefined}
				{@const stack = tomb ? cellCards(tomb, i) : card ? [card] : []}
				{@const down = tomb ? Math.min(stack.length, tomb.wounded[i]) : 0}
				{@const wounded = down > 0 ? stack[down - 1] : null}
										{@const slaying = !!slayAt && key(slayAt) === key(location)}
						<!-- Every face-up pocket goes down when the track cannot pay, so each one wears the skull. -->
						{@const doomed = fatalAim && !wounded && stack.length > 0}
				<button
					class="slot"
					class:selected={!!card && selected.has(key(location))}
					class:aimed={!!card && !!tomb?.armed?.first && tomb.armed.first === shorthandCard(card)}
					class:draft={!!entry}
					class:pending={!!pending}
					// Red is for a spent item still sitting in its slot: an empty slot is the restock window's
					// gold, and once that window closes the chip stepping down says the item is gone.
					class:exhausted={!!tomb && tomb.exhausted[i] && !!entry}
								class:stacked={stack.length > 1}
					class:stone={stone}
					class:wounded={!!wounded}
					// The stain marks what a blow can reach: it follows a boss-suit card into a free cell as well as
					// down its column. A hero aspect is none of that — it cannot be slain, and the chip is the only
					// thing that can spend it — so the party wears no shade at all, the boss king's included. A
					// lavender aspect said "this one pays the tomb" about a card that never can.
					class:boss={!entry && !!card && !!tomb && isBoss(tomb, card)}
					class:aura={!entry && !!card && !!tomb && carriesPower(tomb, card) && !isBoss(tomb, card) && !down}
					class:armed={!!tomb?.armed && tomb.armed.cell === i}
					class:locked={!!card && !!tomb && isBoss(tomb, card) && bossProtected(tomb)}
					class:pickpocket={!!tomb && tomb.pickpocket === i}
					class:locking={!!preview?.locks.includes(i)}
					class:need={!!preview?.need.includes(i)}
					class:empty={!card}
					data-drop={`cell:${i}`}
					data-card={card ? shorthandCard(card) : undefined}
					data-role={entry ? entry.role : undefined}						title={stone
						// Constitution is off, so the pocket is shut for as long as he is face down. A card in it is still a
						// heart and still plays out; nothing new moves in until the wound heals.
						? `Stone pocket — Constitution is off while the Dwarf is face down.${
								card ? ' The card in it still plays out, but nothing can move into the pocket.' : ''
							}`
						: tomb && !card && i === reserveCell(tomb) && tomb.reserveHeld
						// The starred pocket says nothing about gold or multipliers: it is a riddle, and the answer is
						// the word "true" in the end-of-crawl line.
						? 'Keep this pocket empty, and the tomb tells the truth.'
						: wounded
							? `Wounded ${wounded.rank} of ${wounded.suit} — face down. ${
									tomb && woundedCanGoHome(tomb)
										? 'Heal it face up, or slay it straight to its grave, before you can use it.'
										: 'Heal it face up before you can use it.'
								}${tomb ? `\n${goldNote(tomb, wounded)}` : ''}`
						: entry
							? `${(live ?? entry).name} — ${ROLE_LABEL[entry.role]}.\n${(live ?? entry).text}${
									tomb?.armed && tomb.armed.cell === i ? '\nClick to disarm.' : ''
								}`
							: pending
								? itemSlotHint(tomb, pending.suit)
								: undefined}
					aria-label={`pocket ${i + 1}${card ? `, ${card.rank} of ${card.suit}` : ', empty'}${entry ? `, ${ROLE_WORD[entry.role]}: ${(live ?? entry).name}` : ''}${stone ? ', stone' : ''}`}
					onclick={(event) => (card ? tapCard(event, card) : emptyCellClick(event, location))}
					onpointerdown={(event) => card && onCardPointerDown(event, card)}
					onpointerenter={() => {
						if (tomb) tombHover = card ? location : null;
					}}
					onpointerleave={() => {
						tombHover = null;
					}}
				>
					{#if stack.length}
						{#each stack as stacked, depth (shorthandCard(stacked))}
							{@const faceDown = depth < down}
							{@const deeper = depth < stack.length - 1}
							{@const turning = faceDown && woundingIds.includes(shorthandCard(stacked))}
							{@const mending = !faceDown && healingIds.includes(shorthandCard(stacked))}
							{#if turning}
								<span class="held flip down" class:deep={deeper} style={cellImageStyle(stacked)}>
									<img class="flip-front" src={img(stacked)} alt="" draggable="false" />
									<img class="flip-back" src={`${BASE}images/back.svg`} alt="" draggable="false" />
								</span>
							{:else if mending}
								<span class="held flip up" class:deep={deeper} style={cellImageStyle(stacked)}>
									<img class="flip-front" src={img(stacked)} alt="" draggable="false" />
									<img class="flip-back" src={`${BASE}images/back.svg`} alt="" draggable="false" />
								</span>
							{:else}
								<img
									class="held"
									class:poked={faceDown}
									class:deep={deeper}
									class:wound-next={woundPreview.has(shorthandCard(stacked))} class:heal-next={healNext.has(shorthandCard(stacked))}
									src={faceDown ? `${BASE}images/back.svg` : img(stacked)}
									alt=""
									draggable="false"
									style={cellImageStyle(stacked)}
								/>
								{#if faceDown}
									<img class="held peek" class:deep={deeper} src={img(stacked)} alt="" draggable="false" />
								{/if}
							{/if}
						{/each}
					{:else}
						<img class="blank" src={`${BASE}images/blank.png`} alt="" draggable="false" />
						{#if pending}
							<!-- Which card would make an item here: the suit the slot lost, or the fan of four for a Thief's
							     Pickpocket. A pocket he emptied into the crypt keeps the same fan with the suit that left
							     hidden, so the reminder reads as three suits rather than being redrawn short. -->
							{#if pending.takes === 'same'}
								<span class="pips" aria-hidden="true">
									<span>{SUIT_GLYPH[pending.suit]}</span>
								</span>
							{:else}
								<span class="pips any" aria-hidden="true">
									{#each SUITS as suit (suit)}
										<span class:barred={pending.takes === 'other' && suit === pending.suit}
											>{SUIT_GLYPH[suit]}</span
										>
									{/each}
								</span>
							{/if}
						{/if}
					{/if}
					{#if doomed}
						<!-- The bill, drawn on the pocket it would take rather than over the whole track. -->
						<span class="doom" aria-hidden="true">{@render skull()}</span>
					{/if}
					<!-- The pocket an affliction is aimed at: a warning on the card, not a state of it. It stays
					     mounted so it can fade in and out the way the swords do. -->
					<span
						class="afflict"
						class:on={stack.some((stacked) => afflictionIds.has(shorthandCard(stacked)))}
						aria-hidden="true">!</span
					>
					<span
						class="slay"
						class:on={slaying}
						class:ranged={slaying && shotAt(tomb, location)}
						aria-hidden="true"
					>
						{#if slaying && shotAt(tomb, location)}{@render bolt()}{:else}{@render swords()}{/if}
					</span>
					{#if tomb && i === reserveCell(tomb) && tomb.reserveHeld && !stone}
						<!-- The reserve pocket: the optional third win, and nothing more. It goes out the moment a card
						     sits here, and it never comes back. -->
						<span class="reserve" aria-hidden="true"></span>
					{/if}
					{#if entry}
						<!--
							A spent aspect leaves the way it arrived, in reverse: the label fades and the ribbon
							shrinks back into the face it was tied round, so a conversion reads as the party's card
							being taken rather than a name blinking off. Only the label fades on its own; a ribbon
							that merely dimmed would still be lying across the card.
						-->
						<span class="kind" out:fade={{ duration: reducedMotion() ? 0 : 200, easing: cubicOut }}>
							{ROLE_WORD[entry.role]}
						</span>
						<!--
							The party's name is a ribbon tied round the card: the band is drawn wider than the face
							and the wrapper clips it, so its ends run into the card's own edges instead of past them.
						-->
						<span
							class="sash"
							out:scale={{ start: 0.55, opacity: 0, duration: reducedMotion() ? 0 : 260, easing: cubicOut }}
						><span class="role">{(live ?? entry).name}</span></span
						>
					{/if}
				</button>
			{/each}
			{#if !!tomb && chipAt > 0}
				{@const ready = canConvert(tomb)}
				{@const chipCard = conversionTarget(tomb)}
				<button
					type="button"
					class="chip"
					class:ready
					style={`--chip-index:${chipAt}`}
					disabled={!ready}
					title={ready
						? `Hero Chip: aspects to the left, pockets to the right.\nClick to convert '${chipCard?.name ?? 'the hero aspect'}': turn it into a pocket — its ability is gone for good — and mend one wound as a bonus. The card stays where it lies as a plain card, free to go home. A wounded aspect cannot be converted.`
						: conversionPreview
							? 'Playing this card out converts its slot: the chip walks one step left.'
							: 'Hero Chip: the hero aspects to its left are your live abilities, and the pockets to its right are plain — they only hold a card. Each conversion turns one aspect into a pocket.'}
					onclick={convertChipClick}
					onpointerenter={() => (chipHover = true)}
					onpointerleave={() => (chipHover = false)}
				>
					<!-- The chip's own warning: on its hover, and while a bandit under the pointer would spend the
					     aspect beside it. Mounted always, so it fades like an affliction's mark rather than popping in. -->
					<span class="alert" class:on={chipWarning} aria-hidden="true">!</span>
				</button>
			{/if}
		</div>

	</header>

	{#if tomb}
		<div class="tombhud">
			<span>Level {tombLevel}</span>
			<span
				class="hearts"
				title={`${tombHp} hearts left over ${filledPockets} filled pocket${filledPockets === 1 ? '' : 's'}${openSlots ? ` · ${openSlots} empty pocket${openSlots === 1 ? '' : 's'} worth a heart each` : ''}`}
			>HP {tombHp}/{filledPockets}{#if openSlots}<sup class="open"> +{openSlots}</sup>{/if}</span
			>
			<span class="tombstag" class:fallen={bossNoted && bossSlain(tomb)} title={bossTitle(tomb)}><span class="tomb-full">{tombFullTitle(tomb)}</span><span
					class="tomb-short"
				>{tombTitle(tomb)}</span
				></span
			>
			<!-- Status in dress, a button in fact: the move count is still the copy shortcut. -->
			<button
				class="moves"
				type="button"
				title="Copy this session to the clipboard, to paste beside a solver run on the same seed"
				onclick={copyRecording}
			>
				Moves ({recordedSteps.length})
			</button>
			<span
									class="score"
					title={`Gold: every card that goes home pays a flat price — a rat one, a boss-suit minion two, a General five, and the boss twenty-five whether or not it has been uncovered. A bare tomb is exactly a hundred, so the gold is also the percentage cleared.${tomb && !tomb.bossId ? ' The boss king is still under the fog, so the tomb\'s suit is unknown and no card is priced yet: the count reads ? until it is uncovered.' : ''}${tombMult > 1 ? ` A true boss kill pays ×${tombMult === 3 ? 3 : 2}, kept for the rest of the crawl; this one scores ${tombScoreNow}%.` : ' Leave the reserve pocket — the starred cell — untouched all deal to earn a true boss kill at ×2, and a true clear of the tomb at ×3.'}`}
				>Gold {tombGoldShown}<span class="out-of">/{GOLD_TOTAL}</span>{#if tombMult > 1}<span class="mult">×{tombMult}</span><span class="pct"> {tombScoreNow}%</span>{/if}</span
				>
			{#if probe}
				<span
					class="solve"
					class:searching={probe.status === 'searching'}
					title={probe.status === 'searching'
						? `A solver is looking for a line from this crawl in the background, on ${PROBE_NODES.toLocaleString()} states at most. It reports a line or says nothing.`
						: probe.solved
							? `The background search found a line of ${probe.moves} moves from this crawl in ${(probe.elapsedMs / 1000).toFixed(1)}s. Copy the session to take the line with it.`
							: `The background search spent ${probe.nodes.toLocaleString()} states and found no line. That is not proof this crawl is lost, only that this budget did not crack it.`}
				>{probeLabel}</span
				>
			{/if}
		</div>
	{/if}

	<div class="tableau">
		{#each game.tableau as cascade, col}
			<div
				class="cascade"
				class:empty={cascade.length === 0}
				class:bossColumn={bossColumn(cascade)}
				data-drop={`cascade:${col}`}
				style={`--n:${Math.max(0, cascade.length - 1)}`}
			>
				<button
					class="cascade-hit"
					aria-label={`hallway ${col + 1}, ${cascade.length} cards`}
					onclick={() => tap({ fixture: 'cascade', data: [col, Math.max(0, cascade.length - 1)] })}
				></button>
				{#each cascade as card, i}
					{@const down = !!tomb && isFaceDown(tomb, card)}
					{@const boss = !!tomb && isBoss(tomb, card)}
					{@const minion = !!tomb && isBossMinion(tomb, card)}
					{@const power = !!tomb && carriesPower(tomb, card)}
					{@const flipping = flippingIds.includes(shorthandCard(card))}
					{@const turning = turningDelays[shorthandCard(card)]}
					{@const slaying = !!slayAt && key(slayAt) === key(card.location)}
						{@const passiveSlay = slayableIds.has(key(card.location))}
						{@const marked = slaying || passiveSlay}
						{@const bolted = marked && shotAt(tomb, card.location)}
					<button
						class="card"
						class:selected={selected.has(key(card.location))}
						class:aimed={!!tomb?.armed?.first && tomb.armed.first === shorthandCard(card)}
						class:dragging={dragIds.has(shorthandCard(card))}
						class:boss
						class:aura={power && !down && !boss}
						// The card an affliction under the pointer would touch: stained as well as banged, so the
						// mark is findable on a face-down back that has a drawing of its own.
						class:afflicted={afflictionIds.has(shorthandCard(card))}
						class:locked={!!tomb && isBoss(tomb, card) && bossProtected(tomb)}
						class:down
						class:flipping
						style={cardStyle(card, i)}
						data-card={shorthandCard(card)}
													title={tomb && boss
								? `${bossTitle(tomb)}\n${
										// Once a General falls the shield is simply gone: naming its absence would describe an
										// ability the boss no longer has.
										bossProtected(tomb)
											? 'Invulnerable — cannot be slain until one of their Generals falls first.\n'
											: ''
									}Indomitable — cannot be moved except by a glyph.\n${auraTitle(tomb, null, false)}\n${goldNote(tomb, card)}`
							: power && !down && tomb
								? `${auraTitle(tomb, card)}\n${goldNote(tomb, card)}`
								: down && tomb
									? canRevealFaceDown(tomb, card.location)
										? 'Unexplored Room — dig it to heal a wound.'
										: 'Unexplored Room — buried. Dig the cards above it off first; the dig heals a wound.'
									: tomb
										? `${ratName(card)}\nA nondescript tomb rat.\nAffliction: None\n${goldNote(tomb, card)}`
										: undefined}
						aria-label={`${down ? 'fogged card' : `${card.rank} of ${card.suit}`}, hallway ${col + 1}, card ${i + 1} of ${cascade.length}`}
						onpointerdown={(event) => !down && onCardPointerDown(event, card)}
						onpointerenter={() => {
							if (tomb) tombHover = card.location;
						}}
						onpointerleave={() => {
							tombHover = null;
						}}
						onclick={(event) => tapCard(event, card)}
					>
						{#if flipping}
							<span class="flip">
								<img class="flip-front" src={img(card)} alt="" draggable="false" />
								<img class="flip-back" src={`${BASE}images/back.svg`} alt="" draggable="false" />
							</span>
						{:else if turning !== undefined}
							<span class="flip down" style={`--flip-delay: ${turning}ms`}>
								<img class="flip-front" src={img(card)} alt="" draggable="false" />
								<img class="flip-back" src={`${BASE}images/back.svg`} alt="" draggable="false" />
							</span>
						{:else}
							<img src={down ? `${BASE}images/back.svg` : img(card)} alt="" draggable="false" />
						{/if}
						<!-- The card an affliction is aimed at, mounted so the mark can fade rather than pop. -->
						<span
							class="afflict"
							class:on={afflictionIds.has(shorthandCard(card))}
							aria-hidden="true">!</span
						>
						<span
							class="slay"
							class:on={marked}
							class:ranged={bolted}
							aria-hidden="true"
						>
							{#if bolted}{@render bolt()}{:else}{@render swords()}{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<footer class="controls">
		<!-- Undo leads the whole row: playtesting puts it far ahead of every other pill in clicks. -->
		<button class="btn" disabled={atStart} onclick={undoMove}>Undo</button>
		<!-- The plain FreeCell switch is parked until an easter egg brings it back: wired, just hidden. -->
		<button
			class="btn"
			hidden
			aria-pressed={variant === 'tomb'}
			onclick={() => setVariant(variant === 'tomb' ? 'vanilla' : 'tomb')}
		>
			TT Variant: {variant === 'tomb' ? 'on' : 'off'}
		</button>
		<label class="seed">
			<span>Crawl #</span>
			<input
				type="text"
				title="A crawl number, or a pasted boardstring to set the board"
				autocapitalize="off"
				spellcheck="false"
				placeholder={seed ? String(seed) : 'random'}
				bind:value={seedInput}
			/>
		</label>
		<button class="btn primary" onclick={() => askReset('new')}>New crawl</button>
		<button class="btn" onclick={() => askReset('restart')}>Restart crawl</button>
		<!-- Leaving is the player's call at any point: the panel is the reckoning of the crawl so far, boss or no boss. -->
		<button class="btn" disabled={!tomb || tomb.won} onclick={askExit}>End crawl</button>
		<!-- The speaker pill: sound effects, off until this says otherwise. -->
		<button
			class="btn"
			aria-pressed={sfxOn}
			onclick={toggleSfx}
			title={`Sound effects are ${sfxOn ? 'on' : 'off'}`}
			aria-label="Toggle sound effects"
		>
			{#if sfxOn}🔊{:else}🔇{/if}<span class="sfx-label"> SFX</span>
		</button>
	</footer>

		{#if flash}
		{#key flash.id}
			<div class="flash {flash.kind}" aria-hidden="true"></div>
		{/key}
	{/if}

	{#if fanfare}
		{#key fanfare.id}
			<div class="fanfare {fanfare.kind}" role="status">
				<span>{FANFARE_TEXT[fanfare.kind]}</span>
				{#if fanfare.kind === 'level' && fanfare.level}
					<strong class="lvl">
						{TOMB_RULES.levelCap > 0 && fanfare.level >= TOMB_RULES.levelCap ? 'MAX' : fanfare.level}
					</strong>
				{/if}
			</div>
		{/key}
	{/if}

	{#if layoutOpen}
		<!-- Suppressed here; a click on the felt around the sheet closes it. -->
		<div
			class="layout-sheet"
			role="dialog"
			aria-modal="true"
			aria-label="Choose a loadout"
			tabindex="-1"
			bind:this={sheetEl}
			onkeydown={(event) => {
				if (event.key === 'Escape') closeLayout();
			}}
			onclick={(event) => {
				if (event.target === event.currentTarget) closeLayout();
			}}
		>
			<div class="layout-card">
				<header>
					<h2>Choose a loadout</h2>
				</header>
				<div class="layout-body" role="group" aria-label="The 256 loadouts" onmouseleave={() => (hovered = null)}>
					<div class="trellis">
						<span class="corner" style="grid-area: 1 / 1"></span>
						{#each SUITS as suit, suitIndex (suit)}
							<span
								class="tick top"
								class:red={suit === 'hearts' || suit === 'diamonds'}
								title={`Class skill — ${abilityFor('class', suit).text}`}
								style={`grid-area: 1 / ${2 + suitIndex}`}
							>
								<span class="glyph">{SUIT_GLYPH[suit]}</span>
								<span class="name">{abilityFor('class', suit).name}</span>
							</span>
						{/each}
						{#each SUITS as kin, kinIndex (kin)}
							<span
								class="tick side"
								class:red={kin === 'hearts' || kin === 'diamonds'}
								title={`Kin trait — ${abilityFor('kin', kin).text}`}
								style={`grid-area: ${2 + kinIndex} / 1`}
							>
								<span class="name">{abilityFor('kin', kin).name}</span>
								<span class="glyph">{SUIT_GLYPH[kin]}</span>
							</span>
							{#each SUITS as cls, clsIndex (cls)}
								<div
									class="block"
									aria-label={`kin ${kin}, class ${cls}`}
									style={`grid-area: ${2 + kinIndex} / ${2 + clsIndex}`}
								>
									{#each SUITS as glyph (glyph)}
										{#each SUITS as item (item)}
											{@const key = `${kin[0]}${cls[0]}${glyph[0]}${item[0]}`}
											{@const entry = entriesByLayout.get(key)}
											{@const filler = placeholderFor(key)}
											<button
												type="button"
												class="pip {layoutStatus(key)}"
												class:mine={key === currentLayout}
												disabled={!entry && !filler}
												onmouseenter={() => {
											if (!codeEditing) hovered = key;
										}}
												onfocus={() => {
											if (!codeEditing) hovered = key;
										}}
												onclick={() => (entry ? startLayout(entry) : startPlaceholder(key))}
																									title={`kin ${kin} · class ${cls} · glyph ${glyph} · item ${item}: ${
															entry
																? `seed ${entry.seed}, boss slain in ${entry.moves} moves${entry.at ? `, found ${entry.at.slice(0, 10)}` : ''}`
																: filler
																																			? `seed ${filler.seed}${filler.score === null ? '' : `, ${filler.score}/500 reached`} — no win yet`
																	: 'no seed found yet'
														}`}
													aria-label={`${key} ${statusWord(key)}`}
											></button>
										{/each}
									{/each}
								</div>
							{/each}
							<span class="margin side" style={`grid-column: 6; grid-row: ${2 + kinIndex}`}>
								{#each SUITS as glyph (glyph)}
									<span title={abilityFor('glyph', glyph).text}>{abilityFor('glyph', glyph).name}</span>
								{/each}
							</span>
						{/each}
						{#each SUITS as cls, clsIndex (cls)}
							<!--
								A Wizard's Dualcast makes the item aspect a second glyph, spelling from the suit of the card in it, so
								his block's four columns are four glyphs rather than four items: the bottom margin says what they are
								in his column, the way the side margin already names the first one.
							-->
							<span class="margin bottom" style={`grid-column: ${2 + clsIndex}; grid-row: 6`}>
								{#each SUITS as item (item)}
									{@const label = abilityFor(cls === 'clubs' ? 'glyph' : 'consumable', item)}
									<span title={label.text}>{label.name}</span>
								{/each}
							</span>
						{/each}
					</div>
					<aside class="layout-preview" aria-live="polite">
						{#if inspected}
							{#if codeEditing}
								<input
									class="code-edit"
									aria-label="Type a loadout code"
									bind:this={codeInputEl}
									bind:value={codeDraft}
									maxlength={4}
									autocapitalize="characters"
									autocomplete="off"
									spellcheck={false}
									oninput={() => {
										const clean = codeDraft.toLowerCase().replace(/[^hcds]/g, '').slice(0, 4);
										codeDraft = clean.toUpperCase();
										if (clean.length === 4) hovered = clean;
									}}
									onkeydown={(event) => {
										event.stopPropagation();
										if (event.key === 'Enter') confirmCodeEdit(true);
										else if (event.key === 'Escape') codeEditing = false;
										else if (event.key === 'Tab') codeEditing = false;
									}}
									onblur={() => confirmCodeEdit(false)}
								/>
							{:else}
								<h3
									title="Double-click to type a loadout code"
									ondblclick={openCodeEdit}
								>{inspectedKey.toUpperCase()}</h3>
							{/if}
							<ul>
								{#each ROLE_ORDER as role (role)}
									{@const suit = inspected[role]}
									<!--
										The pane reads the party back the way the board deals it, so a Wizard's item aspect spells
										rather than carrying a potion: the role is still the item pocket, the ability is the glyph.
								-->
									{@const shown = abilityFor(role === 'consumable' && inspected.class === 'clubs' ? 'glyph' : role, suit)}
									<li>
										<span class="role">{ROLE_WORD[role]}</span>
										<span class="glyph" class:red={suit === 'hearts' || suit === 'diamonds'}>{SUIT_GLYPH[suit]}</span>
										<span class="ability">{shown.name}</span>
									</li>
								{/each}
							</ul>
							<p class="preview-goals">
								<span class="goal">
									<span class="label">seed number</span>
									{#if inspectedEntry}
										{inspectedEntry.seed}
									{:else}
										<span class="none">no seed yet</span>
									{/if}
								</span>
								<span class="goal">
									<span class="label">date found</span>
									{#if inspectedEntry?.at}
										{inspectedEntry.at.slice(0, 10)}
									{:else if inspectedEntry}
										<span class="none">before dates were kept</span>
									{:else}
										<span class="none">no seed yet</span>
									{/if}
								</span>
								<span class="goal">
									<span class="label">boss kill</span>
									{#if inspectedProof.boss}
										{inspectedProof.boss.moves} turns{#if inspectedEntry && inspectedProof.boss.seed !== inspectedEntry.seed}<span class="aside">seed {inspectedProof.boss.seed}</span>{/if}
									{:else}
										<span class="none">not found</span>
									{/if}
								</span>
								<span class="goal">
									<span class="label">tomb clear</span>
									{#if inspectedProof.clear}
										{inspectedProof.clear.moves} turns{#if inspectedEntry && inspectedProof.clear.seed !== inspectedEntry.seed}<span class="aside">seed {inspectedProof.clear.seed}</span>{/if}
									{:else}
										<span class="none">not found</span>
									{/if}
								</span>
								{#if !inspectedEntry && inspectedPlaceholder}
									<span class="goal placeholder-note">
										<span class="label">no win yet</span>
										{#if inspectedPlaceholder.score === null}seed {inspectedPlaceholder.seed}{:else}{inspectedPlaceholder.score}/500 reached on seed {inspectedPlaceholder.seed}{/if}
									</span>
								{/if}
							</p>
						{/if}
					</aside>
				</div>
				<div class="legend">
					<span><i class="cleared"></i>tomb cleared</span>
					<span><i class="boss"></i>boss killed</span>
					<span><i class="playable"></i>playable</span>
					<span><i class="placeholder"></i>seed, no win yet</span>
					<span><i class="missing"></i>no seed yet</span>
				</div>
			</div>
		</div>
	{/if}

	{#if pendingReset && tomb}
		<!-- The run being given up is worth one question: both pills are a single tap on a board holding a layer
		     of play. The row says how much is at stake rather than asking in the abstract. -->
		<div class="win confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-ask">
			<p id="confirm-ask">{pendingReset === 'restart' ? 'Restart this crawl?' : 'Start a new crawl?'}</p>
			<p class="confirm-note">
				You will lose your current progress of {tombHistory.length}
				{tombHistory.length === 1 ? 'move' : 'moves'}.
			</p>
			<div class="confirm-row">
				<button class="btn primary" onclick={takeReset}>Yes</button>
				<button class="btn" onclick={() => (pendingReset = null)}>No</button>
			</div>
		</div>
	{/if}

	{#if pendingDeath && tomb}
		<!-- The one move that ends the crawl on purpose: the blow still lands, and the reckoning says how. -->
		<div class="win confirm" role="dialog" aria-modal="true" aria-labelledby="death-ask">
			<p id="death-ask">You will die, are you sure?</p>
			<p class="confirm-note">
				You will lose your current progress of {tombHistory.length}
				{tombHistory.length === 1 ? 'move' : 'moves'}.
			</p>
			<div class="confirm-row">
				<button class="btn primary" onclick={takeDeath}>Yes</button>
				<button class="btn" onclick={() => (pendingDeath = null)}>No</button>
			</div>
		</div>
	{/if}

	{#if pendingExit && tomb}
		<!-- Leaving early is a decision like the fatal blow: the reckoning is whatever the crawl earned. -->
		<div class="win confirm" role="dialog" aria-modal="true" aria-labelledby="exit-ask">
			<p id="exit-ask">End this crawl?</p>
			<p class="confirm-note">
				You will lose your current progress of {tombHistory.length}
				{tombHistory.length === 1 ? 'move' : 'moves'}.
			</p>
			<div class="confirm-row">
				<button class="btn primary" onclick={takeExit}>Yes</button>
				<button class="btn" onclick={() => (pendingExit = false)}>No</button>
			</div>
		</div>
	{/if}

	{#if (tomb && tomb.won) || (!tomb && game.win)}
		<div class="win">
			{#if tomb}
				<p>{endDied ? 'You Died Fighting' : endCleared ? 'All Gold Retrieved!' : 'You Escape Alive.'}</p>
				<!-- The reckoning: the two numbers are the headline, their words sit underneath, and the
				     sentence around them stays small. -->
				<div class="win-earned">
					<span class="said">you earned</span>
					<span class="fig gold"><span class="n">{endGold}</span><span class="k">gold</span></span>
					<span class="said">in</span>
					<span class="fig steps"><span class="n">{endMoves}</span><span class="k">moves</span></span>
				</div>
				{#if endMult > 1}
					<div class="win-figures">
						<div class="fig"><span class="n">×{endMult}</span><span class="k">{endPercent}% score</span></div>
					</div>
				{/if}
				{#if !endDied}
					<!-- A death has no result to label and no line to compare: the numbers above are the reckoning. -->
					<p class="win-note">
						{endCleared
							? endTrueClear
								? 'true clear tomb'
								: 'tomb cleared'
							: endBoss
								? endTrueBoss
									? 'true boss kill'
									: 'boss slain'
								: 'no boss kill'}
					</p>
					{#if endCorpus || endProbe}
						<!-- One benchmark line only: a recorded crawl outranks the live search, which is not even run
						     when the seed sheet already holds an answer. -->
						<p class="win-bench">
							<span class="who">benchmark</span>
							{#if endCorpus}
								{#if endCorpus.seed !== tomb.seed}seed {endCorpus.seed} · {/if}{endCorpus.moves} steps, {endCorpus.goal ===
								'clear'
									? 'tomb cleared'
									: 'boss slain'} — {againstTheirs(endCorpus.moves)}
							{:else if endProbe}
								solver · {endProbe.solved
									? `${endProbe.moves} steps, tomb cleared — ${againstTheirs(endProbe.moves)}`
									: `no line in ${endProbe.nodes.toLocaleString()} states`}
							{/if}
						</p>
					{/if}
				{/if}
			{:else}
				<p>You won!</p>
			{/if}
			<button class="btn primary" onclick={newDeal}>New crawl</button>
		</div>
	{/if}
</div>
