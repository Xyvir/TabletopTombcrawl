<script lang="ts">
	import { tick } from 'svelte';
	import { FreeCell } from './game/game';
import { PREVIOUS_ACTION_TYPE_IS_START_OF_GAME } from './game/move/history';
	import { getRankForCompare, shorthandCard, type Card, type CardLocation } from './game/card/card';
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

	const CELL_COUNT = 4;
	const CASCADE_COUNT = 8;
	const BASE = import.meta.env.BASE_URL;
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

	let game = $state<FreeCell>(deal());
	let seedInput = $state('');
	let mode = $state<'auto' | 'pick'>('auto');
	/** Legal-pile glow while dragging. Off by default: sharp lines, no chatter. */
	let glow = $state(false);
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

	const seed = $derived(dealSeed(game));
	const atStart = $derived(PREVIOUS_ACTION_TYPE_IS_START_OF_GAME.has(game.previousAction.type));
	const dragIds = $derived(new Set(drag?.cards ?? []));

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

	function cardRects() {
		const rects = new Map<string, DOMRect>();
		board?.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
			const id = el.dataset.card;
			// measure the picture, not the slot: a dragged cell card is translated inside its slot
			if (id) rects.set(id, visualRect(el));
		});
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

			const dx = prev.left - now.left;
			const dy = prev.top - now.top;
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
	function onBoardPointerDown(event: PointerEvent) {
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
		apply(game.setCursor(location).touch());
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
			const run = draggableRun(game, press.card.location);
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
				targets: dragMoves(game, run.location).map((move) => pileKey(move.location)),
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

	function dropTargetAt(x: number, y: number): CardLocation | null {
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
			const next = moveRun(game, from, to);
			if (next) {
				primaryId = shorthandCard(finished.card);
				applyFromDrag(next, before);
				return;
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
		// the deal itself is a history entry; undoing it would empty the board
		if (PREVIOUS_ACTION_TYPE_IS_START_OF_GAME.has(game.previousAction.type)) return;
		apply(game.undo({ toggleCursor: true }));
	}

	function newDeal() {
		clearClickMemory();
		const requested = Number.parseInt(seedInput, 10);
		const valid = Number.isFinite(requested) && requested >= 1 && requested <= 32000;
		apply(deal(valid ? requested : undefined));
		seedInput = '';
	}

	function replay() {
		flushPending();
		apply(deal(seed));
	}

	function toggleMode() {
		clearClickMemory();
		mode = mode === 'auto' ? 'pick' : 'auto';
	}

	function key(location: CardLocation) {
		return `${location.fixture}:${location.data.join('-')}`;
	}

	function img(card: Card) {
		const short = shorthandCard(card);
		return `${BASE}images/${short[0]}${short[1].toLowerCase()}.png`;
	}

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

	const selected = $derived(new Set(game.selection?.cards.map((card) => key(card.location)) ?? []));
	const targets = $derived(
		glow
			? new Set([
					...(game.availableMoves ?? []).map((m) => pileKey(m.location)),
					...(drag?.targets ?? []),
				])
			: new Set<string>()
	);
</script>

<div
	class="board"
	bind:this={board}
	role="application"
	aria-label="FreeCell board"
	onpointerdown={onBoardPointerDown}
>
	<header class="top">
		<div class="cells">
			{#each game.cells as card, i}
				{@const location = { fixture: 'cell' as const, data: [i] }}
				<button
					class="slot"
					class:selected={!!card && selected.has(key(location))}
					class:target={targets.has(pileKey(location))}
					data-drop={`cell:${i}`}
					data-card={card ? shorthandCard(card) : undefined}
					aria-label={`free cell ${i + 1}${card ? `, ${card.rank} of ${card.suit}` : ', empty'}`}
					onclick={(event) => (card ? tapCard(event, card) : tap(location))}
					onpointerdown={(event) => card && onCardPointerDown(event, card)}
				>
					{#if card}
						<img src={img(card)} alt="" draggable="false" style={cellImageStyle(card)} />
					{:else}
						<img class="blank" src={`${BASE}images/blank.png`} alt="" draggable="false" />
					{/if}
				</button>
			{/each}
		</div>

		<div class="foundations">
			{#each game.foundations as card, i}
				{@const location = { fixture: 'foundation' as const, data: [i] }}
				{@const stack = foundationStack(i)}
				<button
					class="slot"
					class:target={targets.has(pileKey(location))}
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
	</header>

	<div class="tableau">
		{#each game.tableau as cascade, col}
			<div
				class="cascade"
				class:empty={cascade.length === 0}
				class:target={targets.has(`cascade:${col}`)}
				data-drop={`cascade:${col}`}
			>
				<button
					class="cascade-hit"
					aria-label={`column ${col + 1}, ${cascade.length} cards`}
					onclick={() => tap({ fixture: 'cascade', data: [col, Math.max(0, cascade.length - 1)] })}
				></button>
				{#each cascade as card, i}
					<button
						class="card"
						class:selected={selected.has(key(card.location))}
						class:dragging={dragIds.has(shorthandCard(card))}
						style={cardStyle(card, i)}
						data-card={shorthandCard(card)}
						aria-label={`${card.rank} of ${card.suit}, column ${col + 1}, card ${i + 1} of ${cascade.length}`}
						onpointerdown={(event) => onCardPointerDown(event, card)}
						onclick={(event) => tapCard(event, card)}
					>
						<img src={img(card)} alt="" draggable="false" />
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<footer class="controls">
		<button class="btn" onclick={toggleMode}>
			Tap: {mode === 'auto' ? 'auto-move' : 'pick target'}
		</button>
		<button class="btn" aria-pressed={glow} onclick={() => (glow = !glow)}>
			Glow: {glow ? 'on' : 'off'}
		</button>
		<button class="btn" disabled={atStart} onclick={undoMove}>Undo</button>
		<button
			class="btn"
			onclick={() => (flushPending(), apply(game.autoFoundationAll({ anytime: true })))}
		>
			Auto to home
		</button>
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

	{#if game.win}
		<div class="win">
			<p>You won!</p>
			<button class="btn primary" onclick={newDeal}>New game</button>
		</div>
	{/if}
</div>
