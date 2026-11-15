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

What it buys and costs, on the five review questions: fun and synergy go up (Bloodrush makes the trigger free, a
ranged kill counts, a Burden hit becomes survivable, and the flask competes with the glyph for the arm), while
intuitive-to-remember goes down a point or so (it becomes the fourth armed item, needs a two-object table state,
and carries one exception). Today's card is the easiest in the game and the least interesting to time.

Measurement, if it is tried: a `potionOnSlay` clause, a variant file switching it on, then `scripts/ab.ts` over the
rows whose party holds a Potion — 51 of the 204 published entries, and 17 of the 67 missing squares are the hearts
item — comparing wins, move counts, and "wounds healed per use" read off the lines. Watch the Orc/Potion pair
specifically: Bloodrush makes the trigger cost nothing.

## The Fighter/Human swap (adopted)

The two class/kin passives traded places, because each was doing the other's job. A Fighter who ignores his
weakest grave now carries **Strength** (a skill: send a card home skipping one missing rank), and the Human who
reads his level off three graves carries **Determined** (a trait: ignore your lowest grave). Nothing about the
mechanics changed — only who holds which, and the names, so a class skill stays a noun and a kin trait stays an
adjective. See `lingo.md` for that convention.

The cost was measured before it was taken and again after: of the 155 corpus rows with a live proof, 75 kept one.
Every party holding exactly one of the two lost every line (Human-only 33 of 33, Fighter-only 44 of 44), because
the line's opening play was the ability it no longer has; the 16 rows holding both kept 13, and the 62 rows
holding neither were untouched. The 359 dead lines went to `solutions/archive/`, not out of the repository.

## A published win carries its line

`MODE=merge` publishes a row only when `solutions/` holds a line for that seed (same track). A row whose line
is gone — archived by a rule change, or never written — becomes a placeholder: the square keeps its seed, so the
party is still dealt and playable, but the trellis stops listing it as a win. That makes the demotion automatic
rather than a list to maintain: a sweep that wins the square writes a line, and the next merge promotes it back.
After the Fighter/Human swap the corpus stands at 116 proved keys and 140 placeholder squares.
