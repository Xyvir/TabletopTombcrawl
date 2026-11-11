/**
 * What the player has done with a layout, kept in IndexedDB so the trellis still knows it after a
 * reload. Two results matter: the boss died, or the whole tomb came home. A layout keeps its best
 * result, so a later worse attempt never takes the mark away.
 */
export type LayoutStatus = 'boss' | 'clear';

export interface LayoutRecord {
	/** The four drafted suits in role order, e.g. `hcds` — the same key the corpus uses. */
	loadout: string;
	status: LayoutStatus;
	seed: number;
	at: number;
}

const DB_NAME = 'tombcrawl';
const STORE = 'layouts';
const DB_VERSION = 1;

const openDb = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('this browser has no IndexedDB'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'loadout' });
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
		return new Map(rows.map((row) => [row.loadout, row]));
	} catch {
		return new Map();
	}
}

/** Remember a layout's best result. Private browsing and switched-off storage are not an error. */
export async function markLayout(record: LayoutRecord): Promise<void> {
	try {
		await withStore('readwrite', (store) => store.put(record));
	} catch {
		// the trellis still shows this session's marks; they just do not survive a reload
	}
}
