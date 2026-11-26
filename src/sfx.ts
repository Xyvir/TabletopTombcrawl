// Sound effects for Tabletop Tombcrawl. Off by default; the speaker pill in the
// footer toggles it. Every file lives in /audio (not /audio/misc) and is named
// for the event it scores, so the mapping below is the whole design.
//
// Each play mints its own Audio element, so events that land on the same move
// overlap the way the board does: a boss kill rings while the king's own slay
// still sounds. Kills cycle slash1-3 without repeating the last one.
import afflictionUrl from '../audio/affliction.ogg?url';
import armUrl from '../audio/arm.ogg?url';
import arrowUrl from '../audio/arrow.ogg?url';
import bossClearUrl from '../audio/boss_kill_dungeon_clear.ogg?url';
import bossRevealUrl from '../audio/boss_reveal.ogg?url';
import convertUrl from '../audio/convert_draft.ogg?url';
import dealUrl from '../audio/deal.ogg?url';
import disarmUrl from '../audio/disarm.ogg?url';
import exitUrl from '../audio/exit_crawl.ogg?url';
import kingDiesUrl from '../audio/king_dies.ogg?url';
import levelUrl from '../audio/level_up.ogg?url';
import mendUrl from '../audio/mend2.ogg?url';
import slash1Url from '../audio/slash1.ogg?url';
import slash2Url from '../audio/slash2.ogg?url';
import slash3Url from '../audio/slash3.ogg?url';
import stashUrl from '../audio/stash_move_to_pocket.ogg?url';
import stepUrl from '../audio/step_move_to_hallway.ogg?url';
import takeDamageUrl from '../audio/take_damage.ogg?url';
import useGlyphUrl from '../audio/use_glyph.ogg?url';
import useItemUrl from '../audio/use_item.ogg?url';

export type SfxName =
	| 'affliction'
	| 'arm'
	| 'arrow'
	| 'bossClear'
	| 'bossReveal'
	| 'convert'
	| 'deal'
	| 'disarm'
	| 'exit'
	| 'kingDies'
	| 'level'
	| 'mend'
	| 'stash'
	| 'step'
	| 'takeDamage'
	| 'useGlyph'
	| 'useItem';

const URLS: Record<SfxName, string> = {
	affliction: afflictionUrl,
	arm: armUrl,
	arrow: arrowUrl,
	bossClear: bossClearUrl,
	bossReveal: bossRevealUrl,
	convert: convertUrl,
	deal: dealUrl,
	disarm: disarmUrl,
	exit: exitUrl,
	kingDies: kingDiesUrl,
	level: levelUrl,
	mend: mendUrl,
	stash: stashUrl,
	step: stepUrl,
	takeDamage: takeDamageUrl,
	useGlyph: useGlyphUrl,
	useItem: useItemUrl,
};

const SLASH_URLS = [slash1Url, slash2Url, slash3Url];

let enabled = false;
let lastSlash = -1;
let warmed = false;

/** The footer pill owns this: true from the toggle, false until then. */
export function setSfxEnabled(on: boolean) {
	enabled = on;
	if (on && !warmed) {
		warmed = true;
		// Fetch and decode while the toggle click is still the gesture, so the
		// first real move never waits on the network.
		for (const url of Object.values(URLS)) {
			try {
				const el = new Audio();
				el.src = url;
				el.preload = 'auto';
				el.load();
			} catch {
				// No audio in this context (tests, SSR): staying silent is correct.
			}
		}
	}
}

function out(url: string, rate = 1) {
	if (!enabled) return;
	try {
		const el = new Audio(url);
		if (rate !== 1) {
			// Speed carries pitch once the browser is told not to preserve it, which is the whole trick: no
			// pitch-shifting filter, just the same file played a little faster and so a little higher.
			const pitchable = el as HTMLAudioElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };
			pitchable.preservesPitch = false;
			pitchable.mozPreservesPitch = false;
			pitchable.webkitPreservesPitch = false;
			el.playbackRate = rate;
		}
		void el.play().catch(() => {});
	} catch {
		// Playback can fail without a gesture or a device; the move already landed.
	}
}

/** One named effect, for the footer's own toggle blip and the exit pill. */
export function playSfx(name: SfxName) {
	out(URLS[name]);
}

/** Gap between repeated blows, so three wounds read as three hits and not one louder one. */
const TAKE_DAMAGE_GAP_MS = 200;

function outDelayed(url: string, delayMs: number) {
	if (!enabled) return;
	try {
		setTimeout(() => out(url), delayMs);
	} catch {
		// No timers here (SSR): the move already landed.
	}
}

/**
 * Wounds land one blow at a time: three damage is the sound three times, staggered. Each replay
 * mints its own Audio element like every other play, and `out` re-checks the toggle at fire time,
 * so switching the speaker off mid-stagger silences the blows still waiting.
 */
export function playTakeDamage(times: number) {
	if (!enabled) return;
	const n = Math.max(0, Math.floor(times));
	for (let i = 0; i < n; i++) outDelayed(URLS.takeDamage, i * TAKE_DAMAGE_GAP_MS);
}

/**
 * The step: one foot, then the other. Games alternate a step's pitch so a run does not sound like one sound
 * repeated, and the same file a shade higher is enough — 15% up is a different foot, not a different sound.
 * The alternation is per session, like the slash cycle, so a walk still alternates after a reload.
 */
const STEP_PITCH = 1.15;
// starts high so the first step of a session is the file as recorded and the second is the shifted foot
let stepHigh = true;

export function playStepSfx() {
	stepHigh = !stepHigh;
	out(URLS.step, stepHigh ? STEP_PITCH : 1);
}

/** A kill: slash1-3, never the same one twice in a row. */
export function playSlash() {
	let pick = Math.floor(Math.random() * SLASH_URLS.length);
	if (pick === lastSlash) pick = (pick + 1 + Math.floor(Math.random() * (SLASH_URLS.length - 1))) % SLASH_URLS.length;
	lastSlash = pick;
	out(SLASH_URLS[pick]);
}

/**
 * Everything one committed move can sound like, read off the two boards by the
 * caller (which already has the helpers). Every true flag plays; nothing here
 * is exclusive, because a move that does two things should sound like two.
 */
export interface MoveSfx {
	/** A card went home. */
	homed: boolean;
	/** Elf range used, on a buried kill or a buried dig: the bow plays over the slash or the step. */
	ranged: boolean;
	/** A king went home, general or boss: king_dies plays over the slash. */
	kingKilled: boolean;
	/** The kill's clean bill: take_damage replays once per point, staggered. Aura wounds — including Petrify's extra point — sound only as affliction. */
	damage: number;
	/** Fog lifted: the revealed card steps into its hallway. */
	dug: boolean;
	/** A card was parked into a pocket. */
	parked: boolean;
	/** A card stepped down a hallway, or two cards traded places. */
	stepped: boolean;
	/** An ability was taken in hand: a glyph and the party's item both answer to arm.ogg. */
	armed: boolean;
	/** The armed ability was put down again unused: arm.ogg run backwards, since nothing else happened. */
	disarmed: boolean;
	/** The ability left the hand and resolved: a glyph cast, a flask drunk, a Remedy covering its action. */
	usedGlyph: boolean;
	/** The same moment, for everything the party carries that is not a glyph. */
	usedItem: boolean;
	/** A drafted pocket converted to plain storage. */
	converted: boolean;
	leveled: boolean;
	bossFound: boolean;
	bossKilled: boolean;
	tombEmptied: boolean;
	/** A monster power fired (Mug, Fear, Petrify, Mana Burn). */
	afflicted: boolean;
	/**
	 * A wound mended and a card came back up: the chip's conversion bounty, a level up's repair, the glyph's
	 * own wound closed by a flask. Any mend, wherever it came from — the layering can be thinned later.
	 */
	mended: boolean;
}

export function playMoveSfx(f: MoveSfx) {
	if (!enabled) return;
	// Boss kill and tomb clear are the same file on purpose: when one move does
	// both, it plays twice and the overlap is the fanfare.
	if (f.bossKilled) playSfx('bossClear');
	if (f.tombEmptied) playSfx('bossClear');
	if (f.bossFound) playSfx('bossReveal');
	if (f.leveled) playSfx('level');
	if (f.ranged) playSfx('arrow');
	if (f.homed) playSlash();
	if (f.kingKilled) playSfx('kingDies');
	if (f.damage > 0) playTakeDamage(f.damage);
	if (f.afflicted) playSfx('affliction');
	if (f.converted) playSfx('convert');
	if (f.mended) playSfx('mend');
	if (f.armed) playSfx('arm');
	if (f.disarmed) playSfx('disarm');
	if (f.usedGlyph) playSfx('useGlyph');
	if (f.usedItem) playSfx('useItem');
	if (f.parked) playSfx('stash');
	if (f.stepped || f.dug) playStepSfx();
}
