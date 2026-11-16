# Working notes

## Overlapping windows are the design, not a bug

DD and FreeCell both run on many small, overlapping windows of opportunity, and that is the shape this game
wants. A power that has nothing to do on a particular crawl is not a broken rule: the conversion chip is
what turns a quiet slot into a decision, so an ability going idle is one more thing to weigh when the chip
moves, and the choice of when to spend it is the interesting part.

So do not retune a power, or reject a rule, because it can be inert on some seeds — including a Thief whose
bounty goes quiet once a grave fills. Argue a change from the windows it opens and closes, and measure it,
never from the fact that a given crawl never needed it. "This ability did nothing here" is not evidence.

## Corpus status board

When the corpus status TUI is wanted (`node scripts/run.mjs scripts/status.ts`), launch it in its own
PowerShell window with `Start-Process powershell -NoExit -Command '...'`. Do not run it in Freebuff's
integrated terminal, and do not leave a chat-owned PTY copy of it running.

## A solution found by hand goes into the corpus

When the user plays out a crawl themselves and pastes the move log, record it: it is a proof the solver
has not produced, which makes it a baseline to refine the solver against, not just another row.

1. Read the seed, track, goal and move count off the log's header and footer (`seed 737 · med`, ending
   `par 0 100.0% · 136 moves`), and the party from the `draft`/party line — the loadout is one letter per
   role in draw order (kin, class, glyph, consumable).
2. Check the seed really deals that party before recording anything:
   `createTombState(seed, FREE_CELL_COUNT[track])` and read the four drafted suits. A log played under
   older rules may deal a different board now, and the corpus is keyed by what the seed deals today.
3. Add the row to `corpus/shard-human.json` — the merge reads every `scan-*`/`shard-*` file in `corpus/`,
   so one array holds every hand-played win. Give it the full row (`loadout`, `boss`, `seed`, `moves`,
   `difficulty`, `goal`, `party`, `at`) plus `"source": "human"`.
4. `MODE=merge node scripts/run.mjs scripts/corpus.ts`, then `npx vite build` and commit both
   `public/corpus.json` and `docs/`. A win on a placeholder square deletes that placeholder by itself, and
   the key leaves `missing`.
5. Say plainly what the solver does on that seed at the budgets tried. A human clear the solver cannot
   reach is the interesting case: it is the one thing that tells us where the search is blind, so report
   it as such rather than quietly recording the row.

`corpus/` is gitignored, so `shard-human.json` is a local working file like the scan shards: the published
`public/corpus.json` and its entry in `docs/` are what is kept in the repository.

## Hand-played lines live in `solutions/`

A corpus row keeps only the seed. When a player pastes the move log as well, the line itself goes into
`solutions/<seed>.json`: the seed, track, goal, move count, loadout, party, the date, and `lines` — one action
string per move, copied from the log without its columns (`home AS -> spades foundation`, `dig 8D col 8 row 5`,
`park 9H col 8 -> cell 5`, `move TD JS col 3 -> col 2`, `swap AS col 4 <-> 8D col 4`, `arm PISORF (cell 3)`,
`drop PISORF (cell 3)`). Columns, rows and cells in a log are 1-based; a run reads top card first, and the card
a hand takes hold of is the bottom one listed.

A solver line lives there too, as `<track>-<seed>.json` with `"source": "solver"`: both producers of rows write one
whenever a search wins — the re-prover in `scripts/verify.ts` and the scanner in `scripts/corpus.ts` — so the corpus
keeps the proof and not just the claim. Only wins are written; an unsolved search has no line to keep. That is the cache that
answers a question like *did this row need the damage cap* by replaying a stored line instead of paying for
another search. Those files carry `actions` beside `lines` — the solver's own moves — and `replay.ts` applies the
actions when they are present, because the printed vocabulary reaches past the transcript grammar (`range 2D col 5
row 4`, `arm PISORF (cell 3) · col 4 with col 6`) and a text-only cache could not be checked against the rules.

A line played under rules that no longer exist goes to `solutions/archive/` rather than out of the repository: it
stays readable, and the replay run only looks in `solutions/`, so a cap-era transcript can no longer be mistaken for a
live baseline. Both of the two-heart-ceiling crawls (737, 1984) live there.

`node scripts/run.mjs scripts/replay.ts` replays every file through the real rules and reports the first illegal
step. `FILES=solutions/737.json` checks one, `DEBUG=1` prints the board before each move. A line that no longer
replays is not a bug in the tool: it records a crawl played under rules that have since changed, which is worth
knowing before the line is used as a baseline.

## The Potion proposal, kept on file (not adopted)

The Potion is left exactly as it is — drink it, every wound heals, it turns face down — and it is being playtested
before anything moves. The alternative below is written down so it can be picked up later without re-deriving it.

Why it came up: wounds land from the rightmost cell inward, and the flask sits in the fourth drafted cell, the
nearer of the party's cards to that edge. Since a wounded card cannot be armed or used, the flask is knocked out
of hand before most of the party is, so its usable range is really "whatever is parked in the pockets to its
right" — three or four on med. It is the item that dies first and is needed last.

The proposal: **arm the Potion; the next successful slay drinks it** — every wound heals after the blow lands,
including a wound that same blow deals to the flask itself. Three amendments, if it is ever built:

1. Say *every wound*, not five. The track holds at most six or seven wounds and the one-to-spare rule means a
   delayed heal can never arrive as a resurrection, so a number is either meaningless or re-creates the ceiling
   problem the change exists to fix.
2. Keep it honest about fatality: the one-to-spare check happens on the kill, so an armed flask can never make
   an illegal slay legal. It is insurance after a blow, not the Revive that was removed.
3. Bound the "still fires if wounded" clause to the blow that drinks it, or the arm becomes unkillable insurance
   banked from turn one — and because `armed` is a single slot, it would also sit there blocking the glyph. Read
   it as: the drinking slay resolves its heal before `dropKnockedArm` can spill the flask; any other action that
   wounds it still knocks it out of hand.

What it buys and costs, on the five review questions: fun and synergy go up (Bloodthirsty makes the trigger free, a
ranged kill counts, a Burden hit becomes survivable, and the flask competes with the glyph for the arm), while
intuitive-to-remember goes down a point or so (it becomes the fourth armed item, needs a two-object table state,
and carries one exception). Today's card is the easiest in the game and the least interesting to time.

Measurement, if it is tried: a `potionOnSlay` clause, a variant file switching it on, then `scripts/ab.ts` over the
rows whose party holds a Potion — 51 of the 204 published entries, and 17 of the 67 missing squares are the hearts
item — comparing wins, move counts, and "wounds healed per use" read off the lines. Watch the Orc/Potion pair
specifically: Bloodthirsty makes the trigger cost nothing.

## The Fighter/Human swap (adopted)

The two class/kin passives traded places, because each was doing the other's job. A Fighter who ignores his
weakest grave now carries **Strength** (a skill: send a card home skipping one missing rank), and the Human who
reads his level off three graves carries **Adept** (a trait: ignore your lowest grave). Nothing about the
mechanics changed — only who holds which, and the names, so a class skill stays a noun and a kin trait stays an
adjective. See `lingo.md` for that convention.

The cost was measured before it was taken and again after: of the 155 corpus rows with a live proof, 75 kept one.
Every party holding exactly one of the two lost every line (Human-only 33 of 33, Fighter-only 44 of 44), because
the line's opening play was the ability it no longer has; the 16 rows holding both kept 13, and the 62 rows
holding neither were untouched. The 359 dead lines went to `solutions/archive/`, not out of the repository.

## The affliction swap (adopted)

The four monster powers now price four different things, where two of them used to price the same thing in
different slots. **Mug** (spades, Bandit) pushes the card in your item slot into the first free pocket to its
right, on a slay or a park, exactly as playing it out would: the slot converts, the chip steps past it, and
nothing waits to remake the item. **Stone Gaze** (clubs, Gorgon) is the old Weakness shape — a boss-suit minion
costs one rank more than its card says, and a park takes a heart — moved to the other suit. Venom (hearts) stays
knowledge and Mana Burn (diamonds) stays the glyphs, so the four currencies are hearts, space, spell slots and
knowledge instead of two of them being the item and two being the glyph.

The monsters are the Bandit, the Viper, the Gorgon and the Wraith — the heart one was the Serpent until the
Venom rename. The status bar names the tombs they fill rather than the bosses: Barrow of Bandits (♠), Cairn of
Vipers (♥), Catacomb of Gorgons (♣), Crypt of Wraiths (♦), Tomb of Darkness (?) before the suit is known. A
boss's own name is a phrase long enough to crowd out the level, hearts, moves and gold either side of it, and it
still has its card's tooltip.

Three rules were settled while building it. Mug fires on a park as well as a kill: otherwise stashing a bandit is a
free way to switch its affliction off. An Arcana glyph is mugged exactly like a flask — the slot is the item slot
whatever it holds, which is why the Wizard's text now says the slot holds a glyph *in place of an item*. And a
wounded slot cannot be mugged: a wound turns the card face down and locks it, and a bandit has nothing to shove
out of a locked pocket — the same bargain a Wraith offers, where a slot already paid for has nothing left to take.
That makes fighting while damaged a little cheaper in a spades tomb, which is the shape we want: the two ways Mug
is dodged are filling the row to its right (no free pocket, no shove) and arriving wounded.

The board warns on what an affliction is aimed at: `afflictionTargets()` names the cards, and the interface draws a
see-through purple `!` on each while a carrier is under the pointer — the fog a Viper would lift, the card in the
slot a Bandit would shove out, the card a Gorgon's rank would turn down, the glyphs a Wraith would spend. The Gorgon
one rides on the card the red glow already marks, which reinforces that the extra rank is the gaze's doing, and it
is the only warning a stashed gorgon gets: a park has no attack preview to show the heart it costs. A fogged
target gets a violet rim light around the card instead of a wash over the back, because the back is a drawing of
its own and swallows a tint. The mark itself is a dark purple outline with a faint white halo — pale violet
disappeared on a card already wearing the boss suit's lavender. An armed Remedy switches the aura off, so the
warnings go out with it: the preview only ever shows what would actually happen.

What it cost, measured before it was committed: every stored line was walked back through the rules, and 92 of
178 no longer replayed (spades 31 of 34, clubs 49 of 49, hearts 5 of 37, diamonds none). Those lines went to
`solutions/archive/` with a `-mug` suffix, not out of the repository, and the merge gate demoted the corpus from
138 proved keys to 73 — 183 placeholder squares for a sweep to win back.

## Gold is a flat table (adopted)

The bar counts gold, and gold is arithmetic a player can do in their head: **a rat one, a boss-suit minion two, a
General five, and the boss king twenty-five**. Thirty-six rats, twelve minions, three Generals and the boss are
fifty-two cards and exactly a hundred gold, so a bare tomb reads 100 and the number is already a percentage — the
separate `(14.4%)` reading that used to sit beside it is gone rather than repeated. Each card's tooltip says what
it pays ("Grants 2 gold on slay"), so the price of a card can be known before the blow.

Par survives, unchanged and unseen: `tombPar`/`PAR_TOTAL`/`parValue` still score a card by how deep it lay in the
deck as well as whether it came home, because that is the reading the solver is guided by and the corpus proves
lines against. Nothing on the board shows it. A deal that opens with no boss cannot reach 100 either way — four
kings at five and forty-eight rats at one is 68 — and that was already true of par, which opened every tomb on 500
and could only ever be paid 420 before a boss was revealed.

## A published win carries its line

`MODE=merge` publishes a row only when `solutions/` holds a line for that seed (same track). A row whose line
is gone — archived by a rule change, or never written — becomes a placeholder: the square keeps its seed, so the
party is still dealt and playable, but the trellis stops listing it as a win. That makes the demotion automatic
rather than a list to maintain: a sweep that wins the square writes a line, and the next merge promotes it back.
The corpus stands at 111 proved keys and 145 placeholder squares: the swap cost 119 rows their lines, and making the
boss's Indomitable shield outlast his Generals cost 37 more, since those lines moved him by hand once a king was
home. A re-solve of those squares won 18 of them back — 13 at 400k, 5 at 1M best-first — and a plan-driven sweep
that tried each stubborn loadout's *other* dealt seeds won 16 more at 200k, which is the cheaper lever: a new seed
is a different deal, so it does not have to carry the plan the old line did.
