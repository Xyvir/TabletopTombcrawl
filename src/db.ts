/**
 * One database for the two things the app keeps across a reload: the crawl in progress and the marks on
 * the trellis.
 *
 * IndexedDB versions a whole database, not a store, so both stores have to be opened at the same version
 * and created by the same upgrade. They were not: `session.ts` opened `tombcrawl` at version 1 and
 * `progress.ts` opened it at version 2, and whichever opened second was refused. After the first visit the
 * database was always at 2, so `open(1)` threw a VersionError on every later load: a kept crawl could not
 * be read back, and on a browser whose progress store had already made the database, it could not be
 * written either.
 */
const DB_NAME = 'tombcrawl';
/**
 * 1: the layouts store keyed by loadout, plus the crawl.
 * 2: layouts keyed by `difficulty:loadout`.
 * 3: one upgrade that owns both stores, so either module can open first.
 */
const DB_VERSION = 3;

export const CRAWL_STORE = 'session';
export const LAYOUT_STORE = 'layouts';

export function openTombcrawlDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('this browser has no IndexedDB'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		// A refused upgrade leaves the database on its old version, and every later open fails the same way.
		request.onblocked = () => reject(new Error('another tab is holding the tomb crawl store open'));
		request.onupgradeneeded = (event) => {
			const db = request.result;
			const transaction = request.transaction as IDBTransaction;
			// The crawl is one record under a fixed key, so its store has none of its own.
			if (!db.objectStoreNames.contains(CRAWL_STORE)) db.createObjectStore(CRAWL_STORE);
			if (!db.objectStoreNames.contains(LAYOUT_STORE)) {
				db.createObjectStore(LAYOUT_STORE, { keyPath: 'id' });
				return;
			}
			if (event.oldVersion >= 2) return;
			// Version 1 keyed a result by its party alone, which cannot tell a med win from a hard one.
			// The store is rebuilt around `id` and every old row is carried over as a med result, since that
			// is the track the app played before this existed.
			//
			// The rows are read first and written back only once the old store is gone: a handle to a
			// deleted store throws on `openCursor`, and an exception in here aborts the whole upgrade —
			// which left every later read and write failing silently, so marks never survived a reload.
			const old = transaction.objectStore(LAYOUT_STORE);
			const carried: unknown[] = [];
			const cursor = old.openCursor();
			cursor.onsuccess = () => {
				const row = cursor.result;
				if (row) {
					const value = row.value as { loadout?: string; difficulty?: string };
					if (value.loadout) {
						const difficulty = value.difficulty ?? 'med';
						carried.push({ ...(value as object), difficulty, id: `${difficulty}:${value.loadout}` });
					}
					row.continue();
					return;
				}
				db.deleteObjectStore(LAYOUT_STORE);
				const store = db.createObjectStore(LAYOUT_STORE, { keyPath: 'id' });
				for (const record of carried) store.put(record);
			};
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('could not open the tomb crawl store'));
	});
}
