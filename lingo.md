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
| **Crawl** | One whole board: the tomb, the status track and the graveyard. The run, start to finish. "Restart crawl", "Crawl #12345". | the deal / the game |
| **Graveyard** | The four piles a card goes to when it is slain. Where the dead lie. | foundations |
| **Grave** | One suit's pile in the graveyard. Four graves, one per suit, filling in rank order. | one foundation |
| **Boss** | The king that ends the run when slain, titled *<Name>, <Monster> Boss of <Suit>* — "Medusa, Gorgon Boss of Clubs". Boss is the post, not the card: the off-suit kings rank below her as Generals of theirs, and Medusa is never called a king. | the protected king |
| **Court** | The boss suit's ace through queen. Carries the deal's affliction. | boss-suit minions |
| **General** | A king of any other suit, named *<Boss>'s General of <Suit>* — "JORMUNGANDR's General of Clubs". Carries the deal's affliction too. | off-suit king |
| **Rat** | Any card with no power: outside the boss suit and off the king's rank. The suit names its colour: **Black Rat** (spades), **Grey Rat** (clubs), **Brown Rat** (hearts), **Red Rat** (diamonds). Its rank measures it *Small* (ace–5), *Medium* (6–9) or *Large* (10–Q). A tooltip reads *A nondescript tomb rat.* and **Affliction: None**. | plain card |
| **Affliction** | The deal's one monster power — Mug, Venom, Stone Gaze or Mana Burn — worn by the court and the kings. Copy introduces it as *Affliction: <name> — …*. `aura` stays the code's word. | monster power |
| **Wound** | The unit of damage: one face-down card on the status track. Copy says wounds, never HP. The board marks it with a band-aid. | lost HP |
| **Dig** | Turning over a face-down card in the tomb. Heals. | reveal / flip |
| **Unexplored room** | A face-down card in the tomb, before it is dug. | fogged card |
| **Delver** | The player. Not "you" in rules text, "the delver" where a subject is needed. | player |

A **crawl** is the whole board; the **tomb** is only the part you play in. Copy that means everything on the
table says crawl, and copy that means the eight hallways says tomb — "a card in the tomb", "the tomb empties".

One crawl *is* the whole game, the way one floor is the whole of a Desktop Dungeons run, which is why the
word works as both the sit-down and the board. "New crawl" drafts a fresh party and a fresh seed,
"Restart crawl" replays the one you have, and "End crawl" is how a crawl is left once the boss is down.

A pocket is the same word in all three of its jobs — that is the point of choosing it over `slot` or
`cell`. The role word (`Kin`, `Class`, `Glyph`, `Item`) says which kind of pocket it is when that matters:
*party pocket* for the four at the left, *empty pocket* for storage.

Every ability in the game names both where it comes from and what kind of thing it is, and those two words
are fixed. Copy says **trait** only of a kin, **skill** only of a class, **affliction** only of a monster,
**spell** only of a glyph, **effect** only of an item — so the source is never in doubt, and a phrase like
"the item's spell" cannot happen.

| Source | The thing it gives | When it works | Example |
| --- | --- | --- | --- |
| Kin | **trait** | always on, while the card is unwounded | Adept |
| Class | **skill** | always on, while the card is unwounded | Strength |
| Monster | **affliction** | the deal's one, worn by the court and the kings | Mana Burn |
| Glyph | **spell** | armed, spent by the action it is armed for, refreshed on a level up | PISORF |
| Item | **effect** | spent once, then restocked after it is slain | Potion |

The role labels on the pockets carry the same four words, so a hover teaches the pairing without a rules
page: *Kin trait*, *Class skill*, *Glyph spell*, *Item effect*.

The passive words follow grammar too, which keeps the convention from having to be rehearsed every time. A
**class skill** is a noun naming the thing the delver does — Pickpocket, Vigil, Arcana, Strength. A **kin
trait** is an adjective describing the delver — Hawkeyed, Stout, Adept, Bloodthirsty — and every kin word is
one, so the convention holds without an exception to remember.
new kin trait should be one.

**The boss king** wears two shields, and they lift separately. *Invulnerable* keeps him out of any grave until
one of his Generals falls first; once one does, a blade reaches him. *Indomitable* never lifts: no hand moves
him for the whole crawl, and only a glyph does — a run that would carry him is refused the same way. Every
glyph that moves a card can move him, and CYDSTEPP alone can set him down in an empty hallway, which spends it.

Monster names are per suit and never per card: Bandit (spades, Mug), Viper (hearts, Venom),
Gorgon (clubs, Stone Gaze), Wraith (diamonds, Mana Burn).

The right-most free cell is the **reserve pocket**, marked with a gold star: it takes cards like any other, but the
star goes out for the rest of the deal the first time anything sits in it. Finishing with it up is the optional
third win — a **true boss kill**, or a **true clear tomb** — and the end of a crawl says so in those words. It is
never required, and it changes no rule.

It does pay: a true boss kill is **×2** gold for the rest of the crawl, a true clear tomb **×3**, and since a bare
tomb is a hundred, the score reads past a hundred — 200% for the boss's way and 300% for the whole tomb. A clean kill
and then the pocket spent only ever caps at 200%: what the kill earned is kept, the third step is not. An ordinary
win is still a plain 100%.

The tomb you are in is named for its type and its monster, never for its boss: Barrow of Bandits (spades),
Cairn of Vipers (hearts), Catacomb of Gorgons (clubs), Crypt of Wraiths (diamonds), and Tomb of Darkness (?) for a
deal whose suit is not known yet. The status bar carries that name; the boss keeps its own name in the tooltip
on its card. Each one has a single descriptive line above its
affliction — *A scallywag looking to loot the tomb.* — which is flavour and never a rule; the affliction
line below it is the rule. A General and the boss carry no description, because they answer to the monster
rather than being one. Their courts are graded *Lesser* (ace–5), bare
(6–9) and *Greater* (10–Q). The rats take those same three ranges and give them their own words — *Small*,
*Medium*, *Large* — so the two ladders never borrow from each other. Both are flavour only.

---

## Verbs

Four verbs cover every way a card moves, and copy uses only these.

| Verb | Means | Standard / FreeCell name | In code |
| --- | --- | --- | --- |
| **Slay** | Send a card to its grave. Every route is a slay: the attack that pays HP, the plain play straight to the graveyard, and a glyph that carries a card there. | send home / auto-foundation | `attackWith`, `canSendHome` |
| **Stash** | Send a card from the tomb into a pocket, to wait there. | move to a free cell | `tombMove` to a cell, "park" |
| **Restock** | Claim a waiting party pocket: the card played in becomes the party thing that lives there, or remakes the one that owned the pocket before. | refill the item | `itemWindow` |
| **Convert** | Give up a party pocket's claim. The restock window lapses, a party card is stashed out to the tomb or slain, and the pocket becomes ordinary storage. | lose the drafted card | `convertibleCell`, consumed draft |

Notes that follow from those:

- **Restock is an opportunity, conversion is a cost.** A party card that leaves opens the pocket for one
  action; play the matching card in that action and you restock, do anything else and you convert. The
  copy should say which one the player is about to do, never "use the item or lose it".
- **A slain party card converts its own pocket.** The thing that lived there is dead, so the pocket is
  plain from then on — slay and convert can both happen on one move.
- **Stash is the code's "park".** The affliction still fires on it: a stashed carrier sets off its power where it
  lies. Copy says stash; nothing in copy says park.

### Slay vs kill

**Kill** is reserved for one event: a monster ending the delver. No card is ever killed — cards are slain.

- Today a kill cannot happen. A slay whose HP bill would take the delver to zero is refused, and the board
  says so with the skull instead of the crossed swords: the icon means *this would kill you*, not *this is
  a kill*.
- The word stays reserved on purpose. Dying to a monster is the natural end of a run under Dungeon Dice and
  dungeon ascendance, so kill is the verb those rules will need; spending it on cards now would leave the
  game with no word for the death that ends a run.

---

### Queued for the copy pass

Copy that still uses the standard name, each a one-line change:

- `aria-label="free cell 2"` — becomes `pocket 2`; `foundation 2` becomes `grave 2`; `column 3, 5 cards`
  becomes `hallway 3, 5 cards`.
- The exhausted pocket: "Exhausted item slot — play a ♣ card here… Miss it and this is an ordinary free
  cell." — becomes restock/convert: "Play a ♣ card here to restock it. Anything else converts this pocket."
- Elf's Hawkeyed and the Viper's power still say `column` — become hallway.
- The frozen boss: "the foundation stays shut until one other king is home" — becomes "the graveyard stays
  shut until another king lies in it".
- Every "send home" and "played home" — becomes slay. Every "free cell" — becomes pocket.

---

## Proposals

Not in copy yet. Ranked by how much the current word hurts.

| Now | Proposal | Why |
| --- | --- | --- |
| moves | **steps** | The track metaphor makes a move a step; "Moves (0)" is the last mechanical word in the HUD. |

---

## Rejected

- **Expedition / excursion / scenario / campaign** for a crawl — expedition and excursion are a mouthful for
  something restarted forty times an hour, scenario promises authored content, and campaign promises a
  sequence of boards the game does not have.
- **Delve** for a crawl — collides with **delver**, the player: "the delve's delver" is clumsy, and the two
  words would be one root doing two jobs.
- **Kill** for a card — reserved for the delver's death. Cards are slain; the skull marks a slay refused for
  being a kill.
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
- **Minion** for plain cards — already means "carries the affliction" in the code and in the tint's explanation.
- **One ladder of words for both families** — a court and a rat sharing *Small* / *Medium* / *Large* read as a
  rule (is a small Gorgon as weak as a small rat?) and left a rat "large" next to a "lesser" Gorgon. Two
  ladders over the same three ranges: the court is *Lesser* / bare / *Greater*, the rats are *Small* /
  *Medium* / *Large*.
- Listing exceptions in per-card copy (Priest's Vigil on every fogged card, the Remedy clause on every affliction
  line) — the tooltip answers one question, not every edge case.

---

## Copy rules

1. A tooltip answers the question the player is asking at that moment. For a plain card that is *will this
   hurt me*; for fog it is *what does digging buy*; for a carrier it is *what will this cost*.
2. Short beats complete. One clause of exception is already too much.
3. Never name a rank, suit or role the card face does not show.
4. Fantasy words carry the mechanic; mechanical words (HP, level) stay mechanical because the HUD is a
   scoreboard — except the purse, which is **gold**.
5. Say **wounds**, not HP. HP belongs to the HUD readout alone, because the status track is health, party and
   storage at once and "HP" flattens all three.
6. Anything in copy that is not in this file is a bug in this file — add it, or cut it.

---

## Settled by argument

- **Dig** is the verb; *unexplored* survives only in the name of the card, "Unexplored Room".
- **Fog** is a card not yet dug; **buried** is a card under another. "Face-down" is code; copy says fog.
- **Exhaust** is the verb, **spent** is the status, **refresh** is what a glyph does when it comes back.
  Three words, three jobs — the Gorgon exhausts your item, the item sits there spent, the glyph refreshes.
- **Heal**, never mend.
- **Level** and "level up" stay. Depth was rejected: it is Desktop Dungeons' word, not this tomb's.
- **Status track**, always, never "the track".
- **Crawl** for a playthrough, always; "run" is banned in that sense. A *run of cards* stays a run — that is
  the sequence, not the game.
- **Loadout** is the configuration: the four party spots plus the crawl seed that proves them. The sheet
  says "Choose a loadout".
- **Gold** is what the tomb pays, and it is a flat price per card: a rat one, a boss-suit minion two, a General
  five, and the boss king twenty-five. A bare tomb is exactly a hundred, so the gold is read as a percentage
  without a percent sign beside it. "Score" was the code's word for it. The end of a crawl reads back its gold,
  its moves and whether the boss or the whole tomb fell, beside whatever the corpus and the solver managed on the
  same party. *Par* is the legacy "negative" reading the solver works in — a card is worth its rank, court fifteen,
  a king twenty, and the boss a hundred, so the number goes down as the tomb empties. It appears to the player in
  one place only: "best par N" on a layout square the solver has reached but not won.

### Kept as is

- LEVEL, HP and GOLD in the HUD, and Easy / Med / Hard.
- Kin, Class, Glyph, Item, and their passive / active labels.
- The reference board's "FreeCell" name. It is an homage to the game this one is built from, not a leak.
