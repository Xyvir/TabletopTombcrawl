# Tombcrawl lingo

One word per concept, everywhere a player can read it. This is a working glossary, not a spec: it says
what copy should call a thing, so tooltips, the HUD, the loadout sheet and the rules text stop inventing
synonyms. Code may keep its own names (`cell`, `cascade`, `foundation`) — copy never shows them.

Two rules for this file:

- **A term is settled only when it is in copy.** Everything under *Proposals* is a candidate, not a decision.
- **One idea, one word.** If a second word is tempting, it goes in *Rejected* with the reason, so it does
  not come back in six months.

---

## Settled

| Term | Means | Standard / FreeCell name |
| --- | --- | --- |
| **Status track** | The whole row of pockets: health, party and storage in one line. Directional — wounds fill from the right, the party sits at the left. | free cells + cells |
| **Tomb** | One dealt board. "The tomb" is the tableau and the deal together. | the deal / the game |
| **Deal** | Starting a tomb, and the tomb itself. "Restart deal". | deal |
| **Graveyard** | The four piles a card goes to when it is slain. Where the dead lie. | foundations |
| **Grave** | One suit's pile in the graveyard. Four graves, one per suit, filling in rank order. | one foundation |
| **Boss** | The king that ends the run when slain. | the protected king |
| **Court** | The boss suit's ace through queen. Carries the deal's aura. | boss-suit minions |
| **General** | A king of any other suit. Carries the deal's aura too. | off-suit king |
| **Rat** | Any card with no power: outside the boss suit and off the king's rank. | plain card |
| **Aura** | The deal's one monster power, worn by the court and the kings. | monster power |
| **Wound** | One face-down card on the status track. The board marks it with a band-aid. | lost HP |
| **Dig** | Turning over a face-down tableau card. Heals. | reveal / flip |
| **Unexplored room** | A face-down tableau card, before it is dug. | fogged card |
| **Delver** | The player. Not "you" in rules text, "the delver" where a subject is needed. | player |

Monster names are per suit and never per card: Bandit (spades, Weakness), Serpent (hearts, Poison),
Gorgon (clubs, Burden), Wraith (diamonds, Mana Burn). Their courts are graded *Lesser* (ace–5), bare
(6–9) and *Greater* (10–Q); that ladder is flavour only.

### Queued for the copy pass

Copy that still uses the standard name, each a one-line change:

- `aria-label="foundation 2"` — becomes `grave 2`, and so for the other three.
- The frozen boss: "the foundation stays shut until one other king is home" — becomes "the graveyard stays
  shut until another king lies in it".
- Thief's Bounty: "the single most advanced foundation still in play" — becomes "the deepest grave".
- The loadout and trellis copy, wherever it says a card is "sent home" — see *lay to rest* below.

---

## Open: the spot on the status track

**Recommendation: pocket.**

A pocket is the one property both modes share — it *holds one thing*. In storage mode it holds whatever
card you put there; in party mode it is claimed by a suit and its owner's ability lives in it; when a wound
lands, the pocket is what goes face-down. "Pocket" survives all three without changing meaning, which is
exactly what "cell" and "slot" fail to do in copy.

| Candidate | For | Against |
| --- | --- | --- |
| **pocket** | Holds one thing in every mode; fantasy without costume; short; pluralises as a collective ("the right pockets"). | Faint verb confusion ("pocket the card"). |
| slot | Honest, already the code word. | Reads as UI furniture, not as a tomb. Also collides with "slot" as a control. |
| cell | Already the code word; dungeon cells are thematic. | It is the FreeCell term being reskinned, and it reads as a prison, not a pocket. |
| pouch | Fantasy, holds things. | Implies bulk and capacity; a card in a pouch is odd. |
| socket | Perfect for party mode (a suit seated in a socket). | Nonsense for storage mode — you do not socket a stray card. |
| station / space | Fits "track" as board-game geometry (a track has stations). | Says where a thing sits, not that it holds anything. |

If "pocket" is taken, the fallback is **station** — it leans into the track metaphor instead of the
container metaphor, and the copy would then say "the rightmost station goes face-down".

### Copy that follows from it

- "A wound fills a pocket from the right." (not: "you lose a free cell")
- "The party's four cards sit in the leftmost pockets."
- "The dig mends a wound." (already shipped)
- aria: `pocket 3, king of hearts` (today it says `free cell 3`)
- Empty pocket, party pocket and storage pocket are all just **pocket**; the role word (`Kin`, `Glyph`,
  `Item`) says which kind it is when that matters.

---

## Proposals

Not in copy yet. Ranked by how much the current word hurts.

| Now | Proposal | Why |
| --- | --- | --- |
| column / cascade | **shaft** | The tomb's columns are vertical digs; "shaft" is directional and physical. "Column" is the FreeCell word and reads as spreadsheet. |
| send home / played home | **lay to rest** | The game already frames a kill as sending a card to its foundation. "Lay to rest" keeps the death metaphor instead of the domestic one. |
| moves | **steps** | The track metaphor makes a move a step; "Moves (0)" is the last mechanical word in the HUD. |
| tableau | **the tomb floor** | Only needed where "the tomb" is too broad: "the tomb floor" is where cards lie face-up. |

---

## Rejected

- **Vault / crypt** for the graveyard — settled as Graveyard because a card is *slain* to get there; a vault
  is storage and a crypt is the room, not the pile. The board already says "graveyard" in its own code
  (`gravesplit`, "four graves"), so the copy is catching up to the layout, not inventing a word.
- **Goon / Grunt / Mook** for plain cards — Rat won: a creature in a tomb, not a soldier. Soldiers collide
  with King and General.
- **Minion** for plain cards — already means "carries the aura" in the code and the tint's own explanation.
- **Lesser / Greater** for the whole deck — the ladder stays inside the court; a Rat is never "lesser".
- Listing exceptions in per-card copy (Priest's Vigil on every fogged card, the Remedy clause on every
  aura line) — the tooltip answers "will this hurt me?", not "what are all the edge cases".

---

## Copy rules

1. A tooltip answers the question the player is asking at that moment. For a plain card that is *will this
   hurt me*; for fog it is *what does digging buy*; for a carrier it is *what will this cost*.
2. Short beats complete. One clause of exception is already too much.
3. Never name a rank, suit or role the card face does not show.
4. Fantasy words carry the mechanic; mechanical words (HP, level, score) stay mechanical because the HUD is
   a scoreboard.
5. Anything in copy that is not in this file is a bug in this file — add it, or cut it.
