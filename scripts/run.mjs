/**
 * Run a TypeScript tool through Vite's module runner, so it sees the same aliases, TypeScript and
 * CommonJS interop the app does. Plain `node scripts/solve.ts` cannot: the rules import lodash, which
 * Node's ESM loader will not hand out named exports for.
 *
 * Usage: node scripts/run.mjs <path/to/tool.ts> [args...]
 */
import { createServer } from 'vite';

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
	console.error('usage: node scripts/run.mjs <tool.ts> [args...]');
	process.exit(1);
}

process.argv = [process.argv[0], entry, ...args];
const server = await createServer({
	// Vite opens a websocket even for a headless tool, and a sweep runs several of these at once: without
	// its own port every process past the first loses the socket and stalls with no progress at all.
	server: { middlewareMode: true, hmr: { port: Number(process.env.VITE_HMR_PORT ?? 24678) } },
	appType: 'custom',
	logLevel: 'error',
	// lodash is CommonJS with no named ESM exports, so it has to go through Vite's interop rather
	// than being externalised and loaded raw by Node.
	ssr: { noExternal: ['lodash'] },
	// A tool has no browser to hot-reload into, and sweeps run six of these at once: without this
	// every process past the first loses its HMR socket and the whole batch quietly does nothing.
	server: { middlewareMode: true, hmr: false },
});

try {
	await server.ssrLoadModule(`/${entry.replace(/^\.?\//, '')}`);
} catch (error) {
	console.error(error instanceof Error ? (error.stack ?? error.message) : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
