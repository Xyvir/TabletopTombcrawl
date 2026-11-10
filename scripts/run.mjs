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
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error',
	// lodash is CommonJS with no named ESM exports, so it has to go through Vite's interop rather
	// than being externalised and loaded raw by Node.
	ssr: { noExternal: ['lodash'] },
});

try {
	await server.ssrLoadModule(`/${entry.replace(/^\.?\//, '')}`);
} catch (error) {
	console.error(error instanceof Error ? (error.stack ?? error.message) : error);
	process.exitCode = 1;
} finally {
	await server.close();
}
