/**
 * The crawl in progress, kept in IndexedDB so a reload, a closed tab or a paused evening comes back to the
 * same board and the same recorder.
 *
 * One session at a time is the whole point: the store holds a single record, `crawl`, and it is cleared when
 * a new crawl, a restart or a new loadout replaces the board, so there is never a second position to choose
 * between on the way back in.
 *
 * A `TombState` is a plain object except for its `FreeCell`, so the snapshot keeps every field and writes the
 * game as the three things that reconstruct it: its cards (each already carrying its location), its printed
 * history, and the action that produced it. `restoreState` hands those to the same constructor `decodeBoard`
 * uses, which is what keeps a reloaded board identical to a reloaded *game* rather than merely a similar one.
 */
import { FreeCell } from './game/game';
import type { PreviousAction } from './game/move/history';
import type { Card } from './game/card/card';
import { type Difficulty, type DraftCard, type RestockTakes, type TombState } from './tombcrawl';

const DB_NAME = 'tombcrawl';
const STORE = 'session';
const RECORD = 'crawl';
/** Bumped when a field changes shape: an old record is dropped rather than half-read. */
const VERSION = 1;

/** The board as it has to be written: cards with their places, and the move log behind them. */
interface GameSnapshot {
	cellCount: number;
	cascadeCount: number;
	cards: Card[];
	history: string[];
	action: PreviousAction;
}

export interface StateSnapshot {
	seed: number;
	hidden: string[];
	draft: DraftCard[];
	bossId: string | null;
	bossSuit: TombState['bossSuit'];
	constitution: boolean;
	exhausted: boolean[];
	wounded: number[];
	won: boolean;
	died: boolean;
	reserveHeld: boolean;
	trueBoss: boolean;
	score: number | null;
	armed: TombState['armed'];
	itemWindow: { cell: number; role: DraftCard['role']; suit: Card['suit']; takes: RestockTakes } | null;
	pickpocket: number | null;
	game: GameSnapshot;
}

export interface SavedSession {
	version: number;
	/** When the write happened, so the caller can tell a fresh record from a stale one. */
	at: number;
	difficulty: Difficulty;
	/** The move recorder: every position the crawl has stood on, oldest first, before the current one. */
	history: StateSnapshot[];
	current: StateSnapshot;
}

const plainCard = (card: Card): Card => ({
	rank: card.rank,
	suit: card.suit,
	location: { fixture: card.location.fixture, data: [...card.location.data] },
});

export function snapshotState(state: TombState): StateSnapshot {
	return {
		seed: state.seed,
		hidden: [...state.hidden],
		draft: state.draft.map((entry) => ({ ...entry })),
		bossId: state.bossId,
		bossSuit: state.bossSuit,
		constitution: state.constitution,
		exhausted: [...state.exhausted],
		wounded: [...state.wounded],
		won: state.won,
		died: state.died,
		reserveHeld: state.reserveHeld,
		trueBoss: state.trueBoss,
		score: state.score,
		armed: state.armed ? { ...state.armed } : null,
		itemWindow: state.itemWindow ? { ...state.itemWindow } : null,
		pickpocket: state.pickpocket,
		game: {
			cellCount: state.game.cells.length,
			cascadeCount: state.game.tableau.length,
			cards: state.game.cards.map(plainCard),
			history: [...state.game.history],
			action: { ...state.game.previousAction },
		},
	};
}

export function restoreState(snapshot: StateSnapshot): TombState {
	const { game: saved } = snapshot;
	const game = new FreeCell({
		cellCount: saved.cellCount,
		cascadeCount: saved.cascadeCount,
		cards: saved.cards.map(plainCard),
		action: { ...saved.action },
		history: [...saved.history],
	});
	// A pocket shows the card it buried last: the constructor seats them in array order, and a PISORF
	// stack seats two, so the slot has to read the deepest one — the same pass `decodeBoard` makes.
	for (let cell = 0; cell < saved.cellCount; cell += 1) {
		let top: Card | null = null;
		for (const card of game.cards) {
			if (card.location.fixture !== 'cell' || card.location.data[0] !== cell) continue;
			if (!top || (top.location.data[1] ?? 0) < (card.location.data[1] ?? 0)) top = card;
		}
		game.cells[cell] = top;
	}
	return {
		game,
		seed: snapshot.seed,
		hidden: [...snapshot.hidden],
		draft: snapshot.draft.map((entry) => ({ ...entry })),
		bossId: snapshot.bossId,
		bossSuit: snapshot.bossSuit,
		constitution: snapshot.constitution,
		exhausted: [...snapshot.exhausted],
		wounded: [...snapshot.wounded],
		won: snapshot.won,
		died: snapshot.died,
		reserveHeld: snapshot.reserveHeld,
		trueBoss: snapshot.trueBoss,
		score: snapshot.score,
		armed: snapshot.armed ? { ...snapshot.armed } : null,
		itemWindow: snapshot.itemWindow ? { ...snapshot.itemWindow } : null,
		pickpocket: snapshot.pickpocket,
		synthetic: null,
	};
}

/** One store, one record: every write replaces the crawl that was there. */
function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDatabase().then(
		(database) =>
			new Promise<T>((resolve, reject) => {
				const transaction = database.transaction(STORE, mode);
				const request = run(transaction.objectStore(STORE));
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
				transaction.oncomplete = () => database.close();
				transaction.onerror = () => reject(transaction.error);
			})
	);
}

/** A browser without IndexedDB (or a private window that refuses it) simply has no saved crawl. */
const canStore = () => typeof indexedDB !== 'undefined';

export async function saveSession(session: SavedSession): Promise<void> {
	if (!canStore()) {
		console.warn('[tombcrawl] no IndexedDB on this browser: the crawl cannot be kept past a reload');
		return;
	}
	try {
		await transact('readwrite', (store) => store.put(session, RECORD));
	} catch (error) {
		// A refused write costs the next reload its board, not this one its game — but it has to say
		// so, or a reload that deals fresh looks like the feature is missing rather than the store.
		console.warn('[tombcrawl] the crawl could not be kept:', error);
	}
}

export async function loadSession(): Promise<SavedSession | null> {
	if (!canStore()) return null;
	try {
		const saved = await transact<SavedSession | undefined>('readonly', (store) => store.get(RECORD));
		if (!saved || saved.version !== VERSION || !saved.current) return null;
		return saved;
	} catch (error) {
		console.warn('[tombcrawl] the kept crawl could not be read back:', error);
		return null;
	}
}

export async function clearSession(): Promise<void> {
	if (!canStore()) return;
	try {
		await transact('readwrite', (store) => store.delete(RECORD));
	} catch {
		// Nothing to clear is the same as cleared.
	}
}
