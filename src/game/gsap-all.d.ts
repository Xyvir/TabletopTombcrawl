// `gsap/all` is the documented "everything" entry point, but it ships no declaration file.
// Re-export the real typings so `gsap.core.Timeline`, `gsap.TweenVars`, etc. still resolve.
declare module 'gsap/all' {
	import { gsap } from 'gsap';
	export { gsap };
	export const Draggable: unknown;
}
