/**
 * What the player has done with a layout, kept in IndexedDB so the trellis still knows it after a
 * reload. Two results matter: the boss died, or the whole tomb came home. A layout keeps its best
 * result, so a later worse attempt never takes the mark away.
 */
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

const DB_NAME = 'tombcrawl';
const STORE = 'layouts';
const DB_VERSION = 2;

const openDb = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('this browser has no IndexedDB'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		// A refused upgrade leaves the database on its old version, and every later open fails the same way.
		request.onblocked = () => reject(new Error('another tab is holding the progress store open'));
		request.onupgradeneeded = () => {
			const db = request.result;
			const transaction = request.transaction as IDBTransaction;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'id' });
				return;
			}
			// Version 1 keyed a result by its party alone, which cannot tell a med win from a hard one.
			// The store is rebuilt around `id` and every old row is carried over as a med result, since that
			// is the track the app played before this existed.
			//
			// The rows are read first and written back only once the old store is gone: a handle to a
			// deleted store throws on `openCursor`, and an exception in here aborts the whole upgrade —
			// which left every later read and write failing silently, so marks never survived a reload.
			const old = transaction.objectStore(STORE);
			const carried: LayoutRecord[] = [];
			const cursor = old.openCursor();
			cursor.onsuccess = () => {
				const row = cursor.result;
				if (row) {
					const value = row.value as Partial<LayoutRecord>;
					if (value.loadout) {
						const difficulty = value.difficulty ?? 'med';
						carried.push({ ...(value as LayoutRecord), difficulty, id: `${difficulty}:${value.loadout}` });
					}
					row.continue();
					return;
				}
				db.deleteObjectStore(STORE);
				const store = db.createObjectStore(STORE, { keyPath: 'id' });
				for (const record of carried) store.put(record);
			};
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('could not open the progress store'));
	});

/**
 * Run one request and answer when its transaction has actually committed: a write resolved on its
 * own success event can still be lost if the database is closed before the transaction settles.
 */
const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(STORE, mode);
		const request = run(transaction.objectStore(STORE));
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
