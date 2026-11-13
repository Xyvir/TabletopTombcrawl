# Tombcrawl lingo

One word per concept, everywhere a player can read it. This is a working glossary, not a spec: it says
what copy should call a thing, so tooltips, the HUD, the loadout sheet and the rules text stop inventing
synonyms. Code may keep its own names (`cell`, `cascade`, `foundation`, `park`) — copy never shows them.

Two rules for this file:

- **A term is settled only when it is in copy.** Everything under *Proposals* is a candidate, not a decision.
- **One idea, one word.** If a second word is tempting, it goes in *Rejected* with the reason, so it does
  not come back in six months.

---

## Nouns

| Term | Means | Standard / FreeCell name |
| --- | --- | --- |
| **Status track** | The whole row of pockets: health, party and storage in one line. Directional — wounds fill from the right, the party sits at the left. | free cells + cells |
| **Pocket** | One spot on the status track. Holds one card in every mode: storage, party claim, or a wound. | one free cell |
| **Tomb** | The eight hallways where the cards lie, face-up and under fog. The play area. | the tableau |
| **Hallway** | One column of the tomb, dug from its mouth downwards. Eight per deal. | one column / cascade |
| **Deal** | One whole board: the tomb, the status track and the graveyard. "Restart deal". | the deal / the game |
| **Graveyard** | The four piles a card goes to when it is slain. Where the dead lie. | foundations |
| **Grave** | One suit's pile in the graveyard. Four graves, one per suit, filling in rank order. | one foundation |
| **Boss** | The king that ends the run when slain. | the protected king |
| **Court** | The boss suit's ace through queen. Carries the deal's aura. | boss-suit minions |
| **General** | A king of any other suit. Carries the deal's aura too. | off-suit king |
| **Rat** | Any card with no power: outside the boss suit and off the king's rank. | plain card |
| **Aura** | The deal's one monster power, worn by the court and the kings. | monster power |
| **Wound** | One face-down card on the status track. The board marks it with a band-aid. | lost HP |
| **Dig** | Turning over a face-down card in the tomb. Heals. | reveal / flip |
| **Unexplored room** | A face-down card in the tomb, before it is dug. | fogged card |
| **Delver** | The player. Not "you" in rules text, "the delver" where a subject is needed. | player |

A **deal** is the whole board; the **tomb** is only the part you play in. Copy that means everything on the
table says deal, and copy that means the eight hallways says tomb — "a card in the tomb", "the tomb empties".

A pocket is the same word in all three of its jobs — that is the point of choosing it over `slot` or
`cell`. The role word (`Kin`, `Class`, `Glyph`, `Item`) says which kind of pocket it is when that matters:
*party pocket* for the four at the left, *empty pocket* for storage.

Monster names are per suit and never per card: Bandit (spades, Weakness), Serpent (hearts, Poison),
Gorgon (clubs, Burden), Wraith (diamonds, Mana Burn). Their courts are graded *Lesser* (ace–5), bare
(6–9) and *Greater* (10–Q); that ladder is flavour only.

---

## Verbs

Four verbs cover every way a card moves, and copy uses only these.

| Verb | Means | Standard / FreeCell name | In code |
| --- | --- | --- | --- |
| **Slay** | Send a card to its grave. An attack that survives the HP bill and a plain play straight to the graveyard are both slays; "the kill" is only the attack. | send home / auto-foundation | `attackWith`, `canSendHome` |
| **Stash** | Send a card from the tomb into a pocket, to wait there. | move to a free cell | `tombMove` to a cell, "park" |
| **Restock** | Claim a waiting party pocket: the card played in becomes the party thing that lives there, or remakes the one that owned the pocket before. | refill the item | `itemWindow` |
| **Convert** | Give up a party pocket's claim. The restock window lapses, a party card is stashed out to the tomb or slain, and the pocket becomes ordinary storage. | lose the drafted card | `convertibleCell`, consumed draft |

Notes that follow from those:

- **Restock is an opportunity, conversion is a cost.** A party card that leaves opens the pocket for one
  action; play the matching card in that action and you restock, do anything else and you convert. The
  copy should say which one the player is about to do, never "use the item or lose it".
- **A slain party card converts its own pocket.** The thing that lived there is dead, so the pocket is
  plain from then on — slay and convert can both happen on one move.
- **Stash is the code's "park".** The aura still fires on it: a stashed carrier sets off its power where it
  lies. Copy says stash; nothing in copy says park.

---

### Queued for the copy pass

Copy that still uses the standard name, each a one-line change:

- `aria-label="free cell 2"` — becomes `pocket 2`; `foundation 2` becomes `grave 2`; `column 3, 5 cards`
  becomes `hallway 3, 5 cards`.
- The exhausted pocket: "Exhausted item slot — play a ♣ card here… Miss it and this is an ordinary free
  cell." — becomes restock/convert: "Play a ♣ card here to restock it. Anything else converts this pocket."
- The frozen boss: "the foundation stays shut until one other king is home" — becomes "the graveyard stays
  shut until another king lies in it".
- Thief's Bounty: "the single most advanced foundation still in play" — becomes "the deepest grave".
- Every "send home" and "played home" — becomes slay. Every "free cell" — becomes pocket.

---

## Proposals

Not in copy yet. Ranked by how much the current word hurts.

| Now | Proposal | Why |
| --- | --- | --- |
| moves | **steps** | The track metaphor makes a move a step; "Moves (0)" is the last mechanical word in the HUD. |

---

## Rejected

- **Shaft** for a hallway — a shaft is only the hole; a hallway is the corridor you dig along, and it matches
  the tomb's architecture: eight corridors off one burial hall.
- **Tomb floor** for the tomb — superseded the moment the tomb became the tableau itself.
- **Lane** for a hallway (an Elf's lane) — one more word for the same strip. An Elf digs down a hallway.
- **Vault / crypt** for the graveyard — a card is *slain* to get there, so the destination sounds like
  burial, not storage. The board's own CSS already called that row the graveyard and counted four graves.
- **Slot / cell / pouch / socket / station** for a pocket — slot reads as UI furniture, cell is the FreeCell
  word and means prison, pouch implies bulk, socket only fits the party mode, station says where a card sits
  rather than that it holds something.
- **Lay to rest** for a slay — superseded: slay is one verb for kill and burial, and two words for it was the
  synonym problem this file exists to fix.
- **Goon / Grunt / Mook** for plain cards — Rat won: a creature in a tomb, not a soldier. Soldiers collide
  with King and General.
- **Minion** for plain cards — already means "carries the aura" in the code and in the tint's own explanation.
- **Lesser / Greater** for the whole deck — the ladder stays inside the court; a Rat is never "lesser".
- Listing exceptions in per-card copy (Priest's Vigil on every fogged card, the Remedy clause on every aura
  line) — the tooltip answers one question, not every edge case.

---

## Copy rules

1. A tooltip answers the question the player is asking at that moment. For a plain card that is *will this
   hurt me*; for fog it is *what does digging buy*; for a carrier it is *what will this cost*.
2. Short beats complete. One clause of exception is already too much.
3. Never name a rank, suit or role the card face does not show.
4. Fantasy words carry the mechanic; mechanical words (HP, level, score) stay mechanical because the HUD is
   a scoreboard.
5. Anything in copy that is not in this file is a bug in this file — add it, or cut it.
