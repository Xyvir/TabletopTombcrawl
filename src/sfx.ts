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
import exitUrl from '../audio/exit_crawl.ogg?url';
import levelUrl from '../audio/level_up.ogg?url';
import slash1Url from '../audio/slash1.ogg?url';
import slash2Url from '../audio/slash2.ogg?url';
import slash3Url from '../audio/slash3.ogg?url';
import stashUrl from '../audio/stash_move_to_pocket.ogg?url';
import stepUrl from '../audio/step_move_to_hallway.ogg?url';
import useGlyphUrl from '../audio/use_glyph.ogg?url';
import useItemUrl from '../audio/use_item.ogg?url';

export type SfxName =
	| 'affliction'
	| 'arm'
	| 'arrow'
	| 'bossClear'
	| 'bossReveal'
	| 'convert'
	| 'exit'
	| 'level'
	| 'stash'
	| 'step'
	| 'useGlyph'
	| 'useItem';

const URLS: Record<SfxName, string> = {
	affliction: afflictionUrl,
	arm: armUrl,
	arrow: arrowUrl,
	bossClear: bossClearUrl,
	bossReveal: bossRevealUrl,
	convert: convertUrl,
	exit: exitUrl,
	level: levelUrl,
	stash: stashUrl,
	step: stepUrl,
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

function out(url: string) {
	if (!enabled) return;
	try {
		const el = new Audio(url);
		void el.play().catch(() => {});
	} catch {
		// Playback can fail without a gesture or a device; the move already landed.
	}
}

/** One named effect, for the footer's own toggle blip and the exit pill. */
export function playSfx(name: SfxName) {
	out(URLS[name]);
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
	/** A card went home. Ranged kills add the bow over (not under) the slash. */
	homed: boolean;
	ranged: boolean;
	/** Fog lifted: the revealed card steps into its hallway. */
	dug: boolean;
	/** A card was parked into a pocket. */
	parked: boolean;
	/** A card stepped down a hallway, or two cards traded places. */
	stepped: boolean;
	/** A spell or item was taken in hand. */
	armed: boolean;
	/** A glyph was cast; a flask, class or kin item was drunk or spent. */
	usedGlyph: boolean;
	usedItem: boolean;
	/** A drafted pocket converted to plain storage. */
	converted: boolean;
	leveled: boolean;
	bossFound: boolean;
	bossKilled: boolean;
	tombEmptied: boolean;
	/** A monster power fired (Mug, Venom, Stone Gaze, Mana Burn). */
	afflicted: boolean;
}

export function playMoveSfx(f: MoveSfx) {
	if (!enabled) return;
	// Boss kill and tomb clear are the same file on purpose: when one move does
	// both, it plays twice and the overlap is the fanfare.
	if (f.bossKilled) playSfx('bossClear');
	if (f.tombEmptied) playSfx('bossClear');
	if (f.bossFound) playSfx('bossReveal');
	if (f.leveled) playSfx('level');
	if (f.homed) {
		if (f.ranged) playSfx('arrow');
		playSlash();
	}
	if (f.afflicted) playSfx('affliction');
	if (f.converted) playSfx('convert');
	if (f.armed) playSfx('arm');
	if (f.usedGlyph) playSfx('useGlyph');
	if (f.usedItem) playSfx('useItem');
	if (f.parked) playSfx('stash');
	if (f.stepped || f.dug) playSfx('step');
}
