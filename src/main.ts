import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const app = mount(App, { target: document.getElementById('app')! });

// The installable shell: the worker caches the built assets, so an installed copy opens without a network.
// A refused registration is not worth a word — the game is the same either way.
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		void navigator.serviceWorker.register('./sw.js').catch(() => {});
	});
}

export default app;
