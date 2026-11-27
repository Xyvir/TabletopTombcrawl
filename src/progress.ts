/**
 * What the player has done with a layout, kept in IndexedDB so the trellis still knows it after a
 * reload. Two results matter: the boss died, or the whole tomb came home. A layout keeps its best
 * result, so a later worse attempt never takes the mark away.
 */
import { LAYOUT_STORE, openTombcrawlDb } from './db';

export type LayoutStatus = 'boss' | 'clear';

export interface LayoutRecord {
	/** `difficulty:loadout`, because one party has a different result at each track size. */
	id: string;
	/** The four drafted suits in role order, e.g. `hcds` — the same key the corpus uses. */
	loadout: string;
	/** The track the result was earned on: a hard clear is a different claim from a med one. */
	difficulty: string;
	status: LayoutStatus;
	seed: number;
	at: number;
}

/**
 * Run one request and answer when its transaction has actually committed: a write resolved on its
 * own success event can still be lost if the database is closed before the transaction settles.
 */
const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
	const db = await openTombcrawlDb();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(LAYOUT_STORE, mode);
		const request = run(transaction.objectStore(LAYOUT_STORE));
		let result: T;
		request.onsuccess = () => {
			result = request.result as T;
		};
		request.onerror = () => reject(request.error ?? new Error('the progress store refused a request'));
		transaction.oncomplete = () => {
			db.close();
			resolve(result);
		};
		transaction.onerror = () => {
			db.close();
			reject(transaction.error ?? new Error('the progress store transaction failed'));
		};
		transaction.onabort = () => {
			db.close();
			reject(transaction.error ?? new Error('the progress store transaction aborted'));
		};
	});
};

/** Every layout the player has a result on. Storage being unavailable simply reads as no results. */
export async function readLayouts(): Promise<Map<string, LayoutRecord>> {
	try {
		const rows = await withStore<LayoutRecord[]>('readonly', (store) => store.getAll());
		return new Map(rows.map((row) => [row.id, row]));
	} catch (error) {
		// Storage being unavailable is not an error the player can act on, but a silent one is a bug report
		// waiting to happen: the trellis then only knows this session's marks, and that should be in the log.
		console.warn('tombcrawl: saved results could not be read', error);
		return new Map();
	}
}

/** Remember a layout's best result. Private browsing and switched-off storage are not an error. */
export async function markLayout(record: LayoutRecord): Promise<void> {
	try {
		await withStore('readwrite', (store) => store.put(record));
	} catch (error) {
		// the trellis still shows this session's marks; they just do not survive a reload
		console.warn('tombcrawl: a result could not be saved', error);
	}
}
