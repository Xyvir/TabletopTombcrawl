/**
 * Small settings that have to outlive a reload, kept in IndexedDB beside the app's other memory.
 *
 * IndexedDB rather than another key in localStorage because that is where this app already keeps what a
 * reload must not take away (`progress.ts`), and because a browser that refuses localStorage still offers a
 * database. The database is its own rather than a new store in `tombcrawl`: versioning the progress database
 * means walking its upgrade path, and a preference has no business in the way of the one migration that
 * already has a comment about being easy to get wrong.
 */
const DB_NAME = 'tombcrawl-prefs';
const DB_VERSION = 1;
const STORE = 'prefs';

const openDb = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('this browser has no IndexedDB'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onblocked = () => reject(new Error('another tab is holding the preferences store open'));
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('could not open the preferences store'));
	});

/**
 * Read one preference, answering null when it has never been set or storage is unavailable. The caller
 * decides what "never set" means; a missing row is not a missing feature.
 */
export async function readPreference(key: string): Promise<unknown> {
	try {
		const db = await openDb();
		return await new Promise<unknown>((resolve, reject) => {
			const transaction = db.transaction(STORE, 'readonly');
			const request = transaction.objectStore(STORE).get(key);
			let value: unknown = null;
			request.onsuccess = () => {
				value = request.result ?? null;
			};
			request.onerror = () => reject(request.error ?? new Error('the preferences store refused a read'));
			// resolve on commit, not on the request: a read that is not settled when the connection closes
			// is the same mistake the progress store has a comment about
			transaction.oncomplete = () => {
				db.close();
				resolve(value);
			};
			transaction.onabort = () => {
				db.close();
				reject(transaction.error ?? new Error('the preferences read aborted'));
			};
		});
	} catch {
		// Private windows and switched-off storage are not an error the player can act on.
		return null;
	}
}

/** Write one preference. Storage being unavailable only costs the next reload, never the current tap. */
export async function writePreference(key: string, value: unknown): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE, 'readwrite');
			transaction.objectStore(STORE).put(value, key);
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onerror = () => {
				db.close();
				reject(transaction.error ?? new Error('the preferences store refused a write'));
			};
			transaction.onabort = () => {
				db.close();
				reject(transaction.error ?? new Error('the preferences write aborted'));
			};
		});
	} catch {
		// the setting still holds for this session
	}
}
