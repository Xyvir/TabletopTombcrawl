import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte()],
	// relative base so the build can be served from any subpath (GitHub Pages)
	base: './',
	// GitHub Pages serves this repository from master /docs
	build: { outDir: 'docs', emptyOutDir: true },
	resolve: {
		alias: { '@': path.resolve(import.meta.dirname, './src') },
	},
	test: {
		alias: { '@': path.resolve(import.meta.dirname, './src') },
		environment: 'jsdom',
		clearMocks: true,
		restoreMocks: true,
		exclude: ['**/node_modules/**', '**/dist/**'],
	},
});
