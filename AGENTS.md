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
