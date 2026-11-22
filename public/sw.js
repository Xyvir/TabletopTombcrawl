/*
 * A service worker so the game installs and opens without a network.
 *
 * Assets are hashed and never change under a given name, so they are served from the cache first.
 * Documents go to the network first, so a new build lands on the next load, with whatever the cache
 * holds as the offline fallback. Nothing here touches another origin: the corpus and the cards are all
 * same-origin files.
 */
const CACHE = 'tombcrawl-shell-v1';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	// The worker itself is the browser's to fetch: a cached copy could never be replaced.
	if (url.pathname.endsWith('/sw.js')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const hit = await cache.match(request);
			if (hit && request.mode !== 'navigate') return hit;

			try {
				const response = await fetch(request);
				if (response.ok && response.type === 'basic') cache.put(request, response.clone());
				return response;
			} catch {
				if (hit) return hit;
				if (request.mode === 'navigate') {
					const shell = await cache.match(new URL('./index.html', self.registration.scope).href);
					if (shell) return shell;
				}
				return new Response('offline', { status: 503, headers: { 'content-type': 'text/plain' } });
			}
		})()
	);
});
