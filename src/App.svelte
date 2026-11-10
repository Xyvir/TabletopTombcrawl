<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { FreeCell } from './game/game';
import { PREVIOUS_ACTION_TYPE_IS_START_OF_GAME } from './game/move/history';
	import {
		getRankForCompare,
		shorthandCard,
		type Card,
		type CardLocation,
		type CardSequence,
	} from './game/card/card';
	import {
		canDoubleTap,
		doubleTapCell,
		doubleTapTableau,
		dragMoves,
		draggableRun,
		foundationSchedule,
		ghostClick,
		homeAll,
		moveRun,
		rewindTo,
		tapCell,
		tapTableau,
		type TapResult,
	} from './interaction';
	import titleMark from './assets/title.svg?raw';
	import {
		MONSTERS,
		ROLE_LABEL,
		ROLE_WORD,
		abilityUsable,
		armedClick,
		armedDrop,
		attackPreview,
		attackWith,
		healPreview,
		auraActive,
		auraItem,
		canBuildOn,
		cellCardMovable,
		cellCards,
		chipBoundary,
		newlyHealed,
		newlyWounded,
		createTombState,
		currentLevel,
		FREE_CELL_COUNT,
		disarm,
		hp,
		maxHp,
		draftAt,
		emptyCells,
		freeCastReady,
		hasPassive,
		isBoss,
		isBossMinion,
		isFaceDown,
		imawalCanBury,
		moveCapacity,
		bossSlain,
		bossProtected,
		revealFaceDown,
		tombExit,
		tombFirstCell,
		tombHomeAll,
		tombMove,
		tombPar,
		tombRun,
		tombTapTargets,
		useAbility,
		type Difficulty,
		type TombState,
	} from './tombcrawl';

	const CELL_COUNT = 4;
	const CASCADE_COUNT = 8;
	/** The difficulty only moves the tomb track's free cells: 4, 3 or 2 of them. */
	const DIFFICULTIES: Difficulty[] = ['easy', 'med', 'hard'];
	const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', med: 'Med', hard: 'Hard' };
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
	const DOUBLE_CLICK_MS = 450;
	/** After the card flies, its old box still answers clicks for this long (the ghost clickbox). */
	const GHOST_MS = 250;
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

	/** Tabletop Tombcrawl is the table the app opens on; the toggle falls back to plain FreeCell. */
	const opening = createTombState();
	let variant = $state<'tomb' | 'vanilla'>('tomb');
	let tomb = $state<TombState | null>(opening);
	let tombHistory = $state<TombState[]>([]);
	/** Cards that just came out of the fog, drawn flipping face-up for one animation. */
	let flippingIds = $state<string[]>([]);
	/** Cards that just took a wound, turning face-down for one animation. */
	let woundingIds = $state<string[]>([]);
	/** Cards that just came back from a wound, turning face-up for one animation. */
	let healingIds = $state<string[]>([]);
	let tombSelected = $state<CardLocation | null>(null);
	/** The card under the pointer: a kill you are aiming at shows what it would cost first. */
	let tombHover = $state<CardLocation | null>(null);
	let tombLast: { id: string; time: number } | null = null;
	/** The last card a tomb tap moved, so a second click at the same spot can rewind it. */
	let tombMoved: { id: string; from: CardLocation; before: TombState; rect: DOMRect; time: number } | null = null;
	/** A whole-screen flash: gold for a level up, red for damage, a colour for each monster power. */
	type FlashKind = 'level' | 'damage' | 'heal' | 'poison' | 'mana' | 'burden';
	let flash = $state<{ kind: FlashKind; id: number } | null>(null);
	let game = $state<FreeCell>(opening.game);
	let seedInput = $state('');
	let mode = $state<'auto' | 'pick'>('auto');
	/** Difficulty sizes the tomb track's free cells; the classic board always keeps its four. */
	let difficulty = $state<Difficulty>('med');
	let board = $state<HTMLElement>();

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
	const healNext = $derived(new Set(tomb && tombHover ? healPreview(tomb, tombHover) : []));
	/** The card an aim would slay outright: it wears crossed swords until the pointer leaves. */
	const slayAt = $derived(!drag && preview?.legal ? aim : null);
	const tombHp = $derived(tomb ? hp(tomb) : 0);
	/** Empty free cells: each one is a single card away from being another heart. */
	const openSlots = $derived(tomb ? emptyCells(tomb).length : 0);
	/** Where the conversion chip sits: the boundary between ability slots and plain free cells. */
	const chipAt = $derived(tomb ? chipBoundary(tomb) : 0);
	const tombLevel = $derived(tomb ? currentLevel(tomb) : 0);
	const dragIds = $derived(new Set(drag?.cards ?? []));

	/**
	 * The hint over a spent item slot names the one suit that will restock it — except for an Orc,
	 * whose Scavenger takes any card at all.
	 */
	function itemSlotHint(state: TombState | null, suit: string): string {
		const feed = state && hasPassive(state, 'Orc') ? 'any card' : `a ${suit} card`;
		return `Exhausted item slot — play ${feed} here on your next action to remake the item. Miss it and this is an ordinary free cell.`;
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
				dy = (was.index - sits.index) * el.offsetHeight * 0.26;
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
		const inX = event.clientX >= r.left - 6 && event.clientX <= r.right + 6;
		const inY = event.clientY >= r.top - 6 && event.clientY <= r.bottom + 6;
		return inX && inY ? moved : null;
	}

	function onBoardPointerDown(event: PointerEvent) {
		// the footer is not felt: a press on a control never counts as a card or ghost click
		if ((event.target as HTMLElement | null)?.closest('.controls')) return;
		if (tomb) {
			const moved = tombGhostHit(event);
			if (!moved) return;
			if ((event.target as HTMLElement | null)?.closest('[data-card]')) return;
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
			if (tomb.armed) commit(disarm(tomb));
			return;
		}
		apply(game.setCursor(location).touch());
	}

	/* ---------- tabletop tombcrawl ---------- */

	const monsterName = (state: TombState) => (state.bossSuit ? MONSTERS[state.bossSuit].name : '');

	/** The boss reads as its monster and the suit it lives in: "Serpent of Hearts". */
	function bossTitle(state: TombState): string {
		const suit = state.bossSuit;
		if (!suit) return 'not revealed';
		return `${MONSTERS[suit].name} of ${suit[0].toUpperCase()}${suit.slice(1)}`;
	}

	/** The suit's monster and its power, e.g. "Gorgon — Burden: killing this exhausts your Consumable." */
	function auraTitle(state: TombState, withName = true) {
		if (!state.bossSuit) return '';
		const monster = MONSTERS[state.bossSuit];
		return `${withName ? `${monster.name} — ` : ''}${monster.power}: ${monster.text}`;
	}

	/** The monster power this move set off, if it killed one of the boss's minions. */
	function powerFlash(before: TombState, after: TombState): FlashKind | null {
		if (!after.bossSuit || !auraActive(before)) return null;
		const slain = after.game.cards.find((card) => {
			if (card.location.fixture !== 'foundation' || !isBossMinion(after, card)) return false;
			const was = before.game.cards.find((other) => shorthandCard(other) === shorthandCard(card));
			return !!was && was.location.fixture !== 'foundation';
		});
		if (!slain) return null;
		// Poison only bites when there is fog left to dig into.
		if (after.bossSuit === 'hearts') return after.hidden.length < before.hidden.length ? 'poison' : null;
		// Burden and Mana Burn need an item behind them to drain.
		if (auraItem(after) === null) return null;
		return after.bossSuit === 'clubs' ? 'burden' : 'mana';
	}

	function commit(next: TombState, before?: Map<string, DOMRect>) {
		if (!tomb) return;
		const revealed = tomb.hidden.filter((id) => !next.hidden.includes(id));
		const rects = before ?? cardRects();
		const power = powerFlash(tomb, next);
		// The track only flashes red when one of its cards turns face-down. A card leaving the track
		// (played to the board, converted home) costs a heart without costing a wound.
		const wounding = newlyWounded(tomb, next);
		const healing = newlyHealed(tomb, next);
		if (power) startFlash(power);
		else if (currentLevel(next) > currentLevel(tomb)) startFlash('level');
		else if (wounding.length) startFlash('damage');
		// A heal that comes with a level up is already gold: green is for the quiet repairs.
		else if (healing.length) startFlash('heal');
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
			// An armed IMAWAL can pick up a wounded card that would otherwise be locked.
			const parked = !cellCardMovable(state, index) && state.armed?.kind !== 'imawal';
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
			if ((!parked && !overfull && canBuildOn(state, run.cards, target)) || imawalCanBury(state, run.cards, target))
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
		if (next) commit(next);
		else shake(event.currentTarget as HTMLElement);
	}

	function tombClick(event: MouseEvent, card: Card) {
		const state = tomb;
		if (!state || state.won) return;
		const el = event.currentTarget as HTMLElement;
		const id = shorthandCard(card);

		if (state.armed) {
			const armed = armedClick(state, card.location);
			if (armed) {
				commit(armed);
				return;
			}
			// A Remedy, Revive or BYSSEPS holds no target: it waits for the action it covers, so the
			// click still has to do its ordinary job (dig the fog, select, move) — otherwise the item
			// in hand locks the whole board, including the dig that heals it.
			const waits = state.armed.kind === 'remedy' || state.armed.kind === 'revive' || state.armed.kind === 'sack';
			if (!waits) {
				shake(el);
				return;
			}
		}

		const now = Date.now();
		const double = tombLast?.id === id && now - tombLast.time < DOUBLE_CLICK_MS;
		tombLast = double ? null : { id, time: now };

		if (card.location.fixture === 'cell') {
			const index = card.location.data[0];
			if (double) {
				const home = attackWith(state, card.location);
				if (home) return void commit(home);
			} else if (abilityUsable(state, index)) {
				const used = useAbility(state, index);
				if (used) return void commit(used);
			}
			if (!cellCardMovable(state, index)) {
				shake(el);
				return;
			}
			tombSelected = card.location;
			return;
		}

		if (isFaceDown(state, card)) {
			// Digging is a click and nothing else: exposed cards for anyone, buried ones for an Elf.
			const revealed = revealFaceDown(state, card.location);
			if (revealed) return void commit(revealed);
			shake(el);
			return;
		}

		if (double) {
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

	function exitTomb() {
		if (!tomb) return;
		const exited = tombExit(tomb);
		if (exited) commit(exited);
	}

	function sendHome() {
		flushPending();
		if (tomb) {
			const next = tombHomeAll(tomb);
			if (next !== tomb) commit(next);
			return;
		}
		apply(homeAll(game));
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
			game = tomb.game;
		} else {
			tomb = null;
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
		if (!state || drag || !bossProtected(state)) return false;
		return cards.some((card) => isBoss(state, card));
	}

	function cardStyle(card: Card, i: number) {
		const base = `--i:${i};`;
		if (!drag || !dragIds.has(shorthandCard(card))) return base;
		return `${base}transform:translate(${drag.dx}px,${drag.dy}px) rotate(${drag.angle}deg);z-index:40;`;
	}

	function cellImageStyle(card: Card) {
		if (!drag || !dragIds.has(shorthandCard(card))) return '';
		return `transform:translate(${drag.dx}px,${drag.dy}px) rotate(${drag.angle}deg);z-index:40;pointer-events:none;`;
	}

	/* ---------- controls ---------- */

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

	function newDeal() {
		clearClickMemory();
		const requested = Number.parseInt(seedInput, 10);
		const valid = Number.isFinite(requested) && requested >= 1 && requested <= 32000;
		seedInput = '';
		if (variant === 'tomb') {
			tombHistory = [];
			tombSelected = null;
			tombLast = null;
			tomb = createTombState(valid ? requested : undefined, FREE_CELL_COUNT[difficulty]);
			game = tomb.game;
			return;
		}
		apply(deal(valid ? requested : undefined));
	}

	function replay() {
		flushPending();
		if (tomb) {
			tombHistory = [];
			tombSelected = null;
			tomb = createTombState(tomb.seed, FREE_CELL_COUNT[difficulty]);
			game = tomb.game;
			return;
		}
		apply(deal(seed));
	}

	function toggleMode() {
		clearClickMemory();
		mode = mode === 'auto' ? 'pick' : 'auto';
	}

	/**
	 * Difficulty only sizes the tomb track's free cells. The seed is reused, so the cards, the fog
	 * and the boss stay put and only the cell count changes. Locked once a move is made, unlocked
	 * again by undoing all the way back to the start.
	 */
	function setDifficulty(next: Difficulty) {
		if (next === difficulty || !atStart || !tomb) return;
		clearClickMemory();
		difficulty = next;
		tombHistory = [];
		tombSelected = null;
		tombLast = null;
		tombMoved = null;
		drag = null;
		flippingIds = [];
		tomb = createTombState(tomb.seed, FREE_CELL_COUNT[next]);
		game = tomb.game;
	}

	function key(location: CardLocation) {
		return `${location.fixture}:${location.data.join('-')}`;
	}

	function img(card: Card) {
		const short = shorthandCard(card);
		return `${BASE}images/${short[0]}${short[1].toLowerCase()}.png`;
	}

	/** Warm every picture once, so a flip never waits on a fetch or a decode. */
	function warmCardImages() {
		for (const name of CARD_IMAGES) {
			const image = new Image();
			image.src = `${BASE}images/${name}.png`;
			// decode() resolves once the bitmap itself is ready; a failure only costs a late picture
			void image.decode?.().catch(() => {});
		}
	}

	onMount(warmCardImages);

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

<div
	class="board"
	class:tomb={!!tomb}
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
		</defs>
	</svg>

	<header class="top" class:tomb={!!tomb}>
		{#if tomb}
			<div class="titlecard" role="img" aria-label="Tabletop Tombcrawl">
				<span class="titlemark">{@html titleMark}</span>
			</div>
		{/if}

		<div class="foundations" class:tomb={!!tomb}>
			{#each game.foundations as card, i}
				{@const location = { fixture: 'foundation' as const, data: [i] }}
				{@const stack = foundationStack(i)}
				<button
					class="slot"
					data-drop={`foundation:${i}`}
					aria-label={`foundation ${i + 1}${card ? `, ${card.rank} of ${card.suit}` : ', empty'}`}
					onclick={() => tap(location)}
				>
					{#if stack.length}
						{#each stack as stacked (shorthandCard(stacked))}
							<img src={img(stacked)} alt="" draggable="false" data-card={shorthandCard(stacked)} />
						{/each}
					{:else}
						<img class="blank" src={`${BASE}images/blank.png`} alt="" draggable="false" />
					{/if}
				</button>
			{/each}
		</div>

		<span class="gravesplit" aria-hidden="true"></span>

		<div class="cells" class:tomb={!!tomb} style={`--cell-count:${game.cells.length}`}>
			{#each game.cells as card, i}
				{@const location = { fixture: 'cell' as const, data: [i] }}
				{@const entry = tomb ? draftAt(tomb, i) : undefined}
				{@const pending = tomb?.itemWindow && tomb.itemWindow.cell === i ? tomb.itemWindow : undefined}
				{@const stack = tomb ? cellCards(tomb, i) : card ? [card] : []}
				{@const down = tomb ? Math.min(stack.length, tomb.wounded[i]) : 0}
				{@const wounded = down > 0 ? stack[down - 1] : null}
				{@const slaying = !!slayAt && key(slayAt) === key(location)}
				<button
					class="slot"
					class:selected={!!card && selected.has(key(location))}
					class:draft={!!entry}
					class:pending={!!pending}
					class:exhausted={!!tomb && tomb.exhausted[i]}
					class:stacked={stack.length > 1}
					class:wounded={!!wounded}
					class:armed={!!tomb?.armed && tomb.armed.cell === i}
					class:locked={!!card && !!tomb && isBoss(tomb, card) && bossProtected(tomb)}
					class:locking={!!preview?.locks.includes(i)}
					class:need={!!preview?.need.includes(i) || !!preview?.fatal}
					class:affinity={!!tomb && freeCastReady(tomb, i) && abilityUsable(tomb, i)}
					data-drop={`cell:${i}`}
					data-card={card ? shorthandCard(card) : undefined}
					data-role={entry ? entry.role : undefined}
					title={wounded
						? `Wounded ${wounded.rank} of ${wounded.suit} — face down. Heal it face up before it can be used.`
						: entry
							? `${entry.name} — ${ROLE_LABEL[entry.role]}.\n${entry.text}${
									tomb?.armed && tomb.armed.cell === i ? '\nClick to disarm.' : ''
								}`
							: pending
								? itemSlotHint(tomb, pending.suit)
								: undefined}
					aria-label={`free cell ${i + 1}${card ? `, ${card.rank} of ${card.suit}` : ', empty'}${entry ? `, ${ROLE_WORD[entry.role]}: ${entry.name}` : ''}`}
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
									<img class="flip-back" src={`${BASE}images/back.png`} alt="" draggable="false" />
								</span>
							{:else if mending}
								<span class="held flip up" class:deep={deeper} style={cellImageStyle(stacked)}>
									<img class="flip-front" src={img(stacked)} alt="" draggable="false" />
									<img class="flip-back" src={`${BASE}images/back.png`} alt="" draggable="false" />
								</span>
							{:else}
								<img
									class="held"
									class:deep={deeper}
									class:wound-next={woundPreview.has(shorthandCard(stacked))} class:heal-next={healNext.has(shorthandCard(stacked))}
									src={faceDown ? `${BASE}images/back.png` : img(stacked)}
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
					{/if}
					<span class="slay" class:on={slaying} aria-hidden="true">{@render swords()}</span>
					{#if entry}
						<span class="kind">{ROLE_WORD[entry.role]}</span>
						<span class="role">{entry.name}</span>
					{/if}
				</button>
			{/each}
			{#if !!tomb && chipAt > 0}
				<span
					class="chip"
					style={`--chip-index:${chipAt}`}
					title="Conversion tracker: the item slots to its left are your live abilities, and the free cells to its right are plain — they only hold a card. Each conversion walks the chip one slot left."
				></span>
			{/if}
		</div>

	</header>

	{#if tomb}
		<div class="tombhud">
			<span>Level {tombLevel}</span>
			<span
				class="hearts"
				title={openSlots
					? `${tombHp} of ${maxHp(tomb)} held, and ${openSlots} empty free cell${openSlots === 1 ? '' : 's'} worth a heart each`
					: `${tombHp} of ${maxHp(tomb)} held`}
			>HP {tombHp}{#if openSlots}<sup class="open">+{openSlots}</sup>{/if}/{maxHp(tomb)}</span
			>
			<span class="bosstag">Boss {bossTitle(tomb)}</span>
			<span
				class="par"
				title="Par: a full tomb is worth 460, and every card takes its own value off that as it goes home — aces one, court cards ten, kings twenty, and the boss king a hundred whether or not he has been uncovered. Lower is better."
			>Par {tombPar(tomb)}</span
			>
		</div>
	{/if}

	<div class="tableau">
		{#each game.tableau as cascade, col}
			<div
				class="cascade"
				class:empty={cascade.length === 0}
				class:bossColumn={bossColumn(cascade)}
				data-drop={`cascade:${col}`}
			>
				<button
					class="cascade-hit"
					aria-label={`column ${col + 1}, ${cascade.length} cards`}
					onclick={() => tap({ fixture: 'cascade', data: [col, Math.max(0, cascade.length - 1)] })}
				></button>
				{#each cascade as card, i}
					{@const down = !!tomb && isFaceDown(tomb, card)}
					{@const boss = !!tomb && isBoss(tomb, card)}
					{@const minion = !!tomb && isBossMinion(tomb, card)}
					{@const flipping = flippingIds.includes(shorthandCard(card))}
					{@const slaying = !!slayAt && key(slayAt) === key(card.location)}
					<button
						class="card"
						class:selected={selected.has(key(card.location))}
						class:dragging={dragIds.has(shorthandCard(card))}
						class:boss
						class:aura={minion && !down}
						class:locked={!!tomb && isBoss(tomb, card) && bossProtected(tomb)}
						class:down
						class:flipping
						style={cardStyle(card, i)}
						data-card={shorthandCard(card)}
						title={tomb && boss
							? `${monsterName(tomb)} King${bossProtected(tomb) ? ' — protected until one other king is slain' : ''}\n${auraTitle(tomb, false)}`
							: minion && !down && tomb
								? auraTitle(tomb)
								: undefined}
						aria-label={`${down ? 'face-down card' : `${card.rank} of ${card.suit}`}, column ${col + 1}, card ${i + 1} of ${cascade.length}`}
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
								<img class="flip-back" src={`${BASE}images/back.png`} alt="" draggable="false" />
							</span>
						{:else}
							<img src={down ? `${BASE}images/back.png` : img(card)} alt="" draggable="false" />
						{/if}
						<span class="slay" class:on={slaying} aria-hidden="true">{@render swords()}</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<footer class="controls">
		<button
			class="btn"
			aria-pressed={variant === 'tomb'}
			onclick={() => setVariant(variant === 'tomb' ? 'vanilla' : 'tomb')}
		>
			TT Variant: {variant === 'tomb' ? 'on' : 'off'}
		</button>
		<button class="btn" onclick={toggleMode}>
			Tap: {mode === 'auto' ? 'auto-move' : 'pick target'}
		</button>
		<div class="difficulty" role="group" aria-label={`Free cells ${FREE_CELL_COUNT[difficulty]}`}>
			{#each DIFFICULTIES as level (level)}
				<button
					class="btn"
					aria-pressed={difficulty === level}
					disabled={!tomb || !atStart}
					title={!tomb
						? 'Difficulty only sizes the tomb track: the classic board always keeps four free cells.'
						: atStart
							? `${FREE_CELL_COUNT[level]} free cells, ${FREE_CELL_COUNT[level] + 4} cells of HP`
							: 'Undo all the way back to the start to change difficulty.'}
					onclick={() => setDifficulty(level)}
				>
					{DIFFICULTY_LABEL[level]}
				</button>
			{/each}
		</div>
		<button class="btn" disabled={atStart} onclick={undoMove}>Undo</button>
		<button class="btn" onclick={sendHome}>
			Auto to home
		</button>
		<button class="btn" disabled={!tomb || !bossSlain(tomb) || tomb.won} onclick={exitTomb}>Exit</button>
		<button class="btn" onclick={replay}>Restart deal</button>

		<label class="seed">
			<span>Deal #</span>
			<input
				type="text"
				inputmode="numeric"
				placeholder={seed ? String(seed) : 'random'}
				bind:value={seedInput}
			/>
		</label>
		<button class="btn primary" onclick={newDeal}>New game</button>
		<span class="meta">{seed ? `deal ${seed}` : ''}</span>
	</footer>

	{#if flash}
		{#key flash.id}
			<div class="flash {flash.kind}" aria-hidden="true"></div>
		{/key}
	{/if}

	{#if (tomb && tomb.won) || (!tomb && game.win)}
		<div class="win">
			{#if tomb}
				<p>You escape the tomb — score {tomb.score}</p>
				<p class="win-note">
					Every card left off the foundation counts against you; court cards count as ten.
				</p>
			{:else}
				<p>You won!</p>
			{/if}
			<button class="btn primary" onclick={newDeal}>New game</button>
		</div>
	{/if}
</div>
