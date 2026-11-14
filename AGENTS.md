# Working notes

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
