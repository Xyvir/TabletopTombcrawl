# Working notes

## Overlapping windows are the design, not a bug

DD and FreeCell both run on many small, overlapping windows of opportunity, and that is the shape this game
wants. A power that has nothing to do on a particular crawl is not a broken rule: the Hero Chip is
what turns a quiet slot into a decision, so an ability going idle is one more thing to weigh when the chip
moves, and the choice of when to spend it is the interesting part.

So do not retune a power, or reject a rule, because it can be inert on some seeds — including a Thief whose
bounty goes quiet once a grave fills. Argue a change from the windows it opens and closes, and measure it,
never from the fact that a given crawl never needed it. "This ability did nothing here" is not evidence.

## The app is allowed to make the table's free choices

The tabletop rules stay loose where loose is what a player can remember, and the app narrows those corners to keep
the desktop game un-fiddly. That is a deliberate split, not a drift: the two are the same game, and the concession
is only ever in *who makes a choice the rules leave open*.

- **Purity** may fog any three cards at a table. The app fogs the bottom three of one hallway, because a scatter
  across hallways is three aims for a card the player rarely wants.
- **Venom** may dig any face-down card without the heal, or take 1 extra damage. The app takes the dig for the
  player while there is any fog left — the deepest card, the rightmost hallway breaking a tie — and pays the
  damage only once there is nothing left to dig.

Two rules make a simplification like this safe. It picks among options the rules already allow, so it can never
make a move legal that the table would refuse. And the rule sheet keeps the loose wording, so a player moving from
the app to the mat is never taught a narrower rule than the one they will play. A concession that changes *what is
legal* rather than *which of the legal things happens* is a rules question first, not a UX one.

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
   The header's `free cells` is `cells.length - DRAFT_CELL_COUNT`, and a **Dwarf kin** opens the crawl one
   pocket wider than the track allows (Constitution), so a med Dwarf log prints **4 free cells over 8
   pockets** instead of 3 over 7. That is the deal being right, not a rule mismatch: `createTombState(seed,
   FREE_CELL_COUNT[track])` adds the pocket itself, so replay at the track's own count and expect the wider
   board. Hard stays the six-pocket deal, so any wider board still reads med. Seed 519's Dwarf clear is the
   case that raised it — a 4-free-cell header, 8 pockets in the deal, every move replayed at
   `FREE_CELL_COUNT.med` — and reading the count as the track's 3 would have called a correct line broken.
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

Both live hand-played lines replay on the current rules (154116: par 0, hp 0, 131 moves; 2769: par 0, hp 0, 145).
The two archived ones (737, 1984) still do not, and they fail early and plainly — 737 at step 27, 1984 at step 18 —
which is what the two-heart ceiling left behind them; they stay in `solutions/archive/` and their rows keep their
seeds on their squares as placeholders.

**Neither human line is reachable by the search, and the reason is scoring, not legality.** 154116's 131 moves were
checked against `generateMoves` at each of the human's own boards: every single one is generated, none missing. But 81
of the 131 land outside the search's own top three by `scoreOf`, some of them last of twenty at a negative score —
the human's opening is setup (dig, stack, park) which changes nothing about par, the term that pays 10 a point, and a
best-first frontier spends its budget on boards that already look better. At 1M states the clear-goal search reaches
par 434 at ply 118 on 154116 while the human finishes at par 0 in 131; on 2769 it stalls at par 160.

Weight and strategy sweeps were tried and none is worth taking: `fog: 8`, `buried: 4`, `clear: 6` and `hearts: 8` all
lose deals the search already wins (seed 12 and/or seed 4 at 150k), `level: 45` changes nothing on the targets, and
beam/dfs/hybrid all do worse on the targets while beam loses the controls. A fix has to change the *plan* — dig the
fog out first, then cash in — not the price of a board.

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

## Two engines, and the driver that takes both (adopted)

`solveTomb` takes an `engine`, so a second way of searching can sit beside the shipped one instead of replacing it:
the whole point is that the two can be run over the same deal at the same budget and the table decides. There are
three arms.

- **`flat`** (the default, and what every existing shard was built with): one objective, `scoreOf`, which prices a
  board by par and what is ready to go home.
- **`two-phase`**: an organizing pass scored on `organizeScore` — fog lifted, runs joined, hearts, levels, room, with
  par kept at a token weight — followed by a cash-in pass from the best board it reached, scored on par as usual. The
  first pass has *no* target of its own, deliberately: a "stop when the fog is gone" target fires on seed 154116 after
  56 moves and a thousand states, with the level at 1 and the par at 496, and that handoff board is worse than useless.
- **`fallback`**: the flat search with four tenths of the budget, then the phases with whatever is left. A deal the
  flat search cracks costs two thousand states and never reaches the phases; a deal it grinds on does.

`SEEDS=… BUDGET=… node scripts/run.mjs scripts/compare-engines.ts` runs the arms side by side (one line a seed,
then wins, mean moves, states and seconds); `ENGINE=two-phase` (or `fallback`) makes `scripts/fill.ts` fill a shard
with a different arm, which is how the comparison is done at corpus scale rather than over a handful of deals.

What it measured, at 150k states a pass on `clear`/med: over seeds 4, 12, 3054 and 150250 the flat search takes the
short two (2k and 1k states) and fails the long two at par 357 and 434; the phases lose the short two and win the long
two (121 and 119 moves); fallback takes all four for 215k states in all, and finds seed 3054 in 117 moves rather than
121. Over seeds 2, 4, 12, 3181, 2769, 154116, 3054, 150250 it is flat 2/8 and phases 2/8 on disjoint deals. So the
phases are a real engine — a couple of corpus deals only it cracks — and `fallback` is the arm to reach for when one
budget has to cover both kinds of deal.

### The ration: a decaying dig price (a knob, off by default)

`organizeScoreFor(hiddenAtStart)` prices a dig by a weight that **decays** with the tomb — `ORGANIZE_WEIGHTS.decay` is how
much of the price is given back by the time every card is read, and `ORGANIZE_WEIGHTS.cash` is what a par point is worth
at that same moment (0 = token, 7 = nearly the cash-in price). Both at 0 is the unrationed phase and the default, because
that is what measured best; `DECAY=1 CASH=3` on either runner turns the ration on.

A ration is not a free improvement, and the table says why: the deals the phases were uniquely good at are the ones it
hurts. Two-phase alone at 150k, four seeds: unrationed takes 3054 (121) and 150250 (119) and loses 4 and 12; `decay 1,
cash 7` wins 4 and 12 and loses 3054 and 150250 (par 327, 55); `decay 1, cash 3` takes 150250 in **83 moves**, 36 shorter
than the unrationed line, and nothing else; `decay 1, cash 7, hearts 18` wins 4 and 12 with 150250 at par 182 and 3054 at
par 297. Through `fallback` the unrationed phase is the only configuration that takes all four.

Where the ration does pay is the handoff. On 154116 the unrationed phase hands over a dug tomb at level 6 and par 427 that
a million states cannot move off par 427 — every card is read, the arrangement is gone, and there is no finish in it —
while the rationed phase hands over fog 6 at seven hearts with par 492 and reaches **par 386** through the cash-in pass,
the furthest any arm has taken that deal (flat's best is 434 at a million). That is the shape to build on: the handoff
has to stay *finishable*, and par parity with the human's board is not enough to be finishable.

### The finishability test (a knob, off by default)

The handoff can be gated: `handoff: 'finishable'` walks the organizing line back to the deepest board that still has a home
on it (`foundationPull(...).reach > 0`) instead of handing over the pass's best board regardless. The failure it is aimed
at is real — on 154116 at a 1M cash-in the unrationed handoff is a board with no home on it, and a million states off it
move par by nothing — and the gate does move off it. But it buys less than it gives up: gated, that run ends at par 449
against the dead board's own 427, because the earlier board it walks back to is further from home. So the default is the
plain handoff (`handoff: 'best'`).

Pricing the same idea into the phase instead — `ORGANIZE_WEIGHTS.ready`, which pays for a wanted card late in the pass —
is worse still: at 12 the phases lose the two deals they are uniquely good at (3054 falls from a 121-move win to par 370,
150250 from 119 to par 301) and gain only seed 12, which the flat arm takes in a thousand states. `ready` therefore ships
at 0. Both remain knobs for a later attempt that can afford to be selective about which handoff it wants.

### Chasing stragglers with the other arm

`node scripts/run.mjs scripts/stragglers.ts` writes a `MODE=solve` plan from the squares that have no win — one seed per
missing key, the seed its placeholder is offering, read as the deal reads today (a placeholder whose seed no longer deals
its own party is dropped, not counted). Then:

```
MODE=solve ENGINE=two-phase PLAN=corpus/plan-stragglers.json OUT=corpus/shard-twophase.json \
  BUDGET=200000 GOAL=boss node scripts/run.mjs scripts/corpus.ts
```

The runner skips every key the corpus already publishes, so this is a straggler hunt and nothing else. First hunt, 200k a
candidate, all 176 missing keys: **5 won** — `hchd` 2261 in 136 moves, `hdsh` 243 in 140, `hsds` 1532 in 119, `ddhd` 1706
in 120, `ddds` 153579 in 105 — every one a deal the flat arm never cracked at any budget tried. All five lines replay
(`med-2261.json`, `med-243.json`, `med-1532.json`, `med-1706.json`, `med-153579.json`), and the merge took the corpus from
80 keys to **85 of 256** with 171 placeholders left. That is the whole argument for keeping two arms: the second one is
finding squares, not just reading them differently.

A later double sweep ran all three methods over the stragglers and over fresh seeds above the walked ranges
(`scripts/fresh-plan.ts` buckets untried seeds per missing key, because `MODE=plan` buckets the lowest seeds,
which the fills already tried): flat and two-phase on boss goal, plan on clear, 200k apiece. It took the sheet from
88 to **142 of 256** with 114 placeholders left — plan won 48 of the 54 new squares (44 it alone cracks), flat 6,
two-phase 4. Every arm found squares the other two lost, which is the argument for sweeping all three. A later
plan-only sweep over the 114 stragglers and 221 fresh seeds with the freshness price took it to **149 of 256** —
7 new squares plus solver proofs on the two hand-played deals, one of them re-proving a retired seed. A second
plan-only sweep over 202 fresh seeds (400001–600000) for the 107 keys still missing took it to **168 of 256**. A third plan-only sweep over 174 fresh seeds
(600001–800000) for the 88 keys still missing took it to **186 of 256**. A fourth plan-only sweep over 134 fresh seeds
(800001–1000000) for the 70 keys still missing took it to **190 of 256** — only 4 wins, so the easy keys are thinning.

**Neither arm reaches the two hand-played lines.** At 600k states: 154116 par 457 (phases) and 440 (fallback), 2769
par 407 and 160, against a human par 0 in 131 and 145 moves. The diagnostic is the handoff, not the search: a search
left to organize buys a dug tomb and nothing else — fog 0 at 69 moves with the level at 3 and the par still at 491 —
while the human reached fog 0 around ply 96 with the level at 6 and the par already down to 428, having spent the
first ninety moves interleaving homes with digs. Digging is cheap for a search and foundations are not, which is
exactly the rationing a phase boundary gets wrong.

## A third arm: the release-order planner (adopted as an arm, not a replacement)

`solveTomb` takes `engine: 'plan'`: short best-first phases chained toward the next foundation card, each scored on
release cost (cover, fog, parking room, what the home itself costs) instead of par. A clear is 48 gated releases and
par cannot see the setup for them; the planner prices every dig and parked card as moves toward a home. A phase ends
on a needed home, a boss kill, a level, or a banked heal; three phaseless misses stop the driver. It runs beside the
other two in `compare-engines.ts` (`ENGINES=plan`) and changes nothing about them — one added export (`immobileBoss`)
aside, the flat and phase drivers are byte-identical, which is the condition for keeping it.

What it measured, 200k states a pass on `clear`/med over 4, 12, 1518, 328, 3054, 150250, 2769, 154116: wins 4 (93),
12 (132), 1518 (107), 328 (102), 2769 (120), and 154116 (115) — the last two no other arm has ever won, and the
154116 win beats the human's 131-move line. It loses 3054-med (par 226, never won by anyone) and 150250 (par 460).
The fixes that moved it there, each tied to a stall it sat in: phases end only on lagging-grave homes (climbing high
graves at level 3 is how a track bleeds out wounded); the boss prices per card it sits on (the human lifts KH on ply
11; every planner stall was a needed card under an unmoved boss); cover behind an immovable top prices as unreachable
rather than as moves; needs see through drafted phantoms to the rank the skip rule opens; an empty due ends the phase
on any home (twelve one-movers the flat score will not cross the tomb for); and unready CYDSTEPPS price twelve a head
while the boss is unsafe (see below). Priced and reverted along the way: room above a whisper, per-phase tool-keeping,
join rewards — the last actively fights homes, which is what ends a release, so it will not come back as a price —
and absolute tool-counting, a ban on playing tools out, and a last-glyph penalty, all of which the midgame routed
around into worse tombs. The tools are load-bearing builds; nothing that forbids spending them survives contact.

The endgame fix, from the human's own tips (bank in rank bands, level-heals cover wounds, park high cards in free
cells): arming a glyph for routine cover spends the freshness the re-lift needs, and exhaustion only refreshes on a
level — so a CYDSTEPP that cannot lift right now prices twelve a head while the boss sits on unhomed cards. The price
comes off on a level by itself, so lines that lift after levelling pay nothing and lines that bury before levelling pay
for the risk. On 154116 the search answers by parking the boss itself in a free cell at move 4 — the user's Q/K-cell
tip, executed by the search — and JH digs out normally; on 2769 by running tight arm-use-level cycles that never let
a draft slot clog. A dedicated royalty-unblock phase (boss on a jack or better, a fresh glyph home) stands by for
tombs where the lift is the play, but it has yet to fire on a measured seed — the freshness price keeps the glyph
ready so the normal phases find the lift themselves. Watch item: 150250 (lone glyph) reroutes worse with the price on
(par 214 to 460, still lost) while 2769 (lone glyph) reroutes better — no glyph count carves that difference, so the
price stays unconditional and the next sweep adjudicates it by squares, not pars. Two open stalls are the next leg:
3054 and 150250 die in the midgame with the release priced but unreachable. Diagnosed both at 200k with a board probe
(`corpus/diag-*.ts`, gitignored): neither is a pricing failure — both are endgame deadlocks the planner cannot see.
3054 reaches level 12 with 39 homes and quits with 120k of 200k unspent: its last two needs (6H, QS) sit face-up
in plain cells, priced payable, but both are wounded and med forbids homing a wound — while the party is spent
down to one Human, so no heal is coming; the level that would heal them needs a home, and the homes need the
heal. 150250 sits at level 3 with 13 homes: H3/C3 lie under 8-deep cover in one column with zero free cells to
park the dig-out, 5D is wounded in a cell, and the one legal home (8S, exposed) costs 5 hearts against 4. The
common blind spot: releaseCost/`affordable` treat a wounded-parked need as a payable home, so phases burn
doubled budget chasing an illegal home and the miss counter quits with budget unspent. Fix directions: exclude
wound-locked needs from `due` when no heal is available, prefer freeing a cell when the due's cover has nowhere
to go, and count par improvement against the miss counter. All three were tried on 2026-11-17 and reverted:
excluding wound-locked needs (Potion/dig/Elixir-for-glyph heal check) plus par-against-misses kept the six baseline
wins move-identical but moved 3054 par 226 to 246 with 150250 and 150309 unchanged, and pricing room at 6/cell under
a cover deficit lost 1518 and 2769 outright. The stalls are true deadlocks — no heal left anywhere in the tomb — not
targeting errors, so there is nothing for the planner to aim at instead. A 1M plan sweep over all 66 placeholders' own seeds
won nothing — these deals are hard, not under-searched. The engine's test replays its line
move by move without asserting a win, so the arm can change the line without changing the test.

The heal gate stays wound-only: a need leaves `actionable` only while its pocket is wounded, so a phase
stuck behind one banks a dig or park instead of missing with the heal on the board. A broader *workable*
gate (`needUnworkable`: buried under an immovable top, buried with nowhere for its cover, fogged where
no dig reaches) was tried and reverted: the immovable-top clause lets phases end early on a banked heal
and sidetracks 3054/150677/150738 into wound-gridlock stalemates the wound-only gate walks past
(3054: 59-move win in 543 states with it off, dead at 72 plies with it on), while its only reproduced
win is 822-clear rerouting 121 to 113 — wins beat pars, so the clause goes. Tried and reverted beside it:
a heal-end reachability check (`canHeal`: dig/level/convert listed, parking not) that strands 205510's
mint-then-home path — the phase must end on the park-minted heart to walk it, so the heal end stays
unconditional (123-move win unreachable in 22k states with the check, found in 15k without it); a convert
ban at full hearts (kills 822 outright and quits 2769 at ply 30 — the clogged board's only path goes
through the chip, so a ban just moves the quit earlier); a re-sweep of the 165 still-missing keys with the
restored gate at boss/200k (four workers, fixed code throughout) adds exactly one win — the remainder is
hard for the plan arm, not under-searched (1200155 burns 200k on plan/two-phase/fallback and 852k of 1M
plan without solving); a full-pocket cliff in `planScore` (−25 wins
2769 in 115 but breaks 822/12/154116 — the cap endgame legitimately fills pockets with wound banks, so
a room price cannot tell gridlock from banking); and broadening the due past wound-locked needs (bleeds
tracks out climbing high graves, exactly the failure the lagging-only rule was built to stop). `allow`
now also takes the board the move leaves from, so a future gate can price what a move costs; nothing
passes one yet.

### The miss that banks nothing (adopted 2026-11-23)

A miss whose best line banks no home leaves the next phase exactly where the last one started, so three
of them quit a tomb that still has homes on it. On a miss with no home anywhere in the walked line, the
driver now takes the single best-scoring home move instead of walking: homes never come back out, so it is
certain progress, and the next phase re-plans from the richer board rather than grinding the same
unreachable due again. It fires only when the walk banks nothing, so a phase that homes its way forward
walks exactly as before. Measured, recovery-only (no weight change), 200k: 154116-clear par 144 at 20k
states to par 29 alive (the furthest any arm has taken it — flat's best is 434 at a million), 2769-clear
from a par-35 dead end to 48 of 52 foundations before the endgame strand, 822-clear still 121, 3054-boss
still 59, 150250-boss still won; suite green at 2530. The wound term tried beside it — 8 per wound on draft
cells — bought 2769's early game (par 35 to par 175) but tripled seed-12's search past the solver test's
timeout and changed nothing on 154116, so it was reverted: pars on unwon deals do not buy a red suite.

What the two human deals now show is the endgame, not the release: 2769 reaches 48 foundations with its
four party hearts wounded-locked in draft slots and zero moves, and 154116 strands two wounded parked cards
(H9, SK) with no heal and no hearts. Both need one mend past the last wounding home and neither has any fog,
potion, level-up or convert left to make it — the same true-deadlock class as 3054/150250, and the human
lines (which drank the potion midgame and levelled past 12) cannot be replayed under the cap for the same
reason. The next fix is a mend budget — remaining fog/potion/level-ups/converts against wounds outstanding —
not another release price.

Sweeps with the recovery in, 200k a deal over all 173 missing placeholders: plan-clear wins none (the
November-16 plan sweep's 22 wins date from before the Mug rework, and none of its seeds re-solve now —
1038 sits at par 270–290 with the recovery on or off, so that drift is rules, not search); plan-boss wins 9
— hdsh 243 in 140, hshs 137 in 106, hsch 81319 in 81, chdd 800079 in 112, hhds 1000799 in 116, csdc 205184
in 104, sscc 23 in 104, sshd 1446 in 115, shsd 600213 in 121 — and the merge promotes all nine. 1518/328's
documented plan wins (107/102) no longer re-solve under the tree either, identically with the recovery on
and off; they are drift from the in-progress rule rework, not a regression.

Alternates sweep, 200k a deal, plan-boss: the 174 placeholder seeds gave nothing, but two fresh-or-archived
seeds per key (`corpus/alt-plan.ts`: archived woundlock-era winning seeds that still deal a missing key,
then fresh deals from 2000001 up, skipping tried seeds) won **28 new squares** — 20 fresh deals plus 8
archived seeds. All 28 lines replay under the current tree. Eight of the archived seeds sat in
`corpus/retired.json` from the ability re-sweep ("a 400k pass and then a 1M best-first pass both find
nothing"); the current planner re-proves them, so those eight rows were removed from the retired list and
the merge published all 28. Corpus: 82 → **110 of 256**, 146 missing. Convert-seeking in the driver is now
gated to clear-goal runs (`!bossRun`), so it cannot trade boss tempo for endgame fuel; boss baselines
3054/150250/243/81319 unchanged and the suite green.

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

## The ability rename (adopted)

The four kin traits and four class skills were renamed as one symmetric set: each is a single noun, with the
kin side naming the delver's nature and the class side naming their craft. Orc **Aggression** (was
Bloodthirsty), Elf **Perception** (Hawkeyed), Dwarf **Constitution** (Stout), Human **Intuition** (Adept),
Fighter **Powerstrike** (Strength), Wizard **Dualcast** (Arcana), Priest **Bloodgift** (Vigil), Thief
**Pickpocket** (unchanged). Nothing mechanical moved: the same eight abilities sit on the same suits in the
same roles, so no card's behaviour changed and no line was re-measured. The rename supersedes the
noun/adjective split the Fighter/Human swap leaned on — both halves are nouns now — and the clause keys
follow the new names (`orcAggression`, `wizardDualcast`, `dwarfConstitution`).

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
different slots. **Mug** (spades, Bandit) forces the conversion a step early — the chip walks one slot left
with no heal — on a slay or a park: the ability is spent, the card stays plain where it lies, and nothing
waits to remake the item. **Stone Gaze** (clubs, Gorgon) turns one card face down, the leftmost of the
party's kin and class that is still face up, and stops at the class — its window is the party's own two passives, one
per affliction, and a cell already wounded has nothing left to give, so the kin answers the first gorgon and the
class the second. Venom (hearts) stays knowledge and Mana Burn (diamonds) stays the glyphs, so no two afflictions price the same
thing: Mug prices the conversion itself — the ability early, and the heal it would have mended — instead of two
of them being the item and two being the glyph.

The monsters are the Bandit, the Viper, the Gorgon and the Wraith — the heart one was the Serpent until the
Venom rename. The status bar names the tombs they fill rather than the bosses: Barrow of Bandits (♠), Cairn of
Vipers (♥), Catacomb of Gorgons (♣), Crypt of Wraiths (♦), Tomb of Darkness (?) before the suit is known. A
boss's own name is a phrase long enough to crowd out the level, hearts, moves and gold either side of it, and it
still has its card's tooltip.

Three rules were settled while building it. Mug fires on a park as well as a kill: otherwise stashing a bandit is a
free way to switch its affliction off. An Arcana glyph is mugged exactly like a flask — the slot is the item slot
whatever it holds, which is why the Wizard's text now says the slot holds a glyph *in place of an item*. And a
wounded slot cannot be mugged: a wound turns the card face down and locks it, and a bandit has nothing to
convert in a locked pocket — the same bargain a Wraith offers, where a slot already paid for has nothing left
to take. That makes fighting while damaged a little cheaper in a spades tomb, which is the shape we want: the
way Mug is dodged is arriving wounded. A full row is no defence, because nothing moves — and neither is a manual
conversion, which the same lock refuses.

The board warns on what an affliction is aimed at: `afflictionTargets()` names the cards, and the interface draws a
see-through purple `!` on each while a carrier is under the pointer — the fog a Viper would lift, the card in the
slot a Bandit would convert, the card a Gorgon would turn down, the glyphs a Wraith would spend. The Gorgon's one
target is the leftmost passive still standing, read in draw order until the class, and it is the only warning a
stashed gorgon gets: a park has no attack preview to show the heart it costs. The gaze's card wears the purple `!`
and the blow's own wounds keep the red glow, so the two prices read as the two different things they are. A fogged
target gets a violet rim light around the card instead of a wash over the back, because the back is a drawing of
its own and swallows a tint. The mark itself is a dark purple outline with a faint white halo — pale violet
disappeared on a card already wearing the boss suit's lavender. An armed Remedy switches the aura off, so the
warnings go out with it: the preview only ever shows what would actually happen.

What it cost, measured before it was committed: every stored line was walked back through the rules, and 92 of
178 no longer replayed (spades 31 of 34, clubs 49 of 49, hearts 5 of 37, diamonds none). Those lines went to
`solutions/archive/` with a `-mug` suffix, not out of the repository, and the merge gate demoted the corpus from
138 proved keys to 73 — 183 placeholder squares for a sweep to win back.

### Venom is a choice (adopted 2026-11-25)

Venom reads as a choice now: **dig any face-down card without the heal, or take 1 extra damage.** At a table the
player picks. The app picks for them — the deepest fog, the rightmost hallway breaking a tie — and pays the wound
only once there is no fog left (`venomTarget`, `venomWounds`), which is the concession set out in "The app is allowed
to make the table's free choices", not a second rule.

What the tax costs, because it is charged per carrier: a dry hearts tomb takes a heart on every court card and every
king, the boss included. `attackPreview` now counts that wound on the bill, so the red glow and the fatal gate tell
the truth about it, and `attackWith` ends the crawl whenever the settled board has no hearts left rather than only
when the preview called the blow fatal. The cap's endgame tightens to match: four kings cost eight hearts, not four,
and the pinned Dwarf clear no longer clears on a board with no fog — each parked carrier pays a heart on the way into
the pocket, so the fourth pocket is a flat bank rather than the four hearts the old line counted on. The four tests
under "the level cap" state the new arithmetic instead of the old one, and a clear now has to carry fog into the
finish, which is the shape the rule was adopted for: the boss kill stays the road out, and the bare tomb is the hard
second win.

Measured on the stored lines the first time the rule went in: 95 of 150 transcripts still replay, and every one of
the 50 that died is a hearts tomb — 48 boss kills and 2 clears, stopping at the first dig or move the new venom
target no longer left open (median move 24, earliest 3). They went to `solutions/archive/` with a `-venom` suffix
and the merge gate demoted their squares: 126 entries with a win to 85, 145 proved rows to 97. No other suit moved,
which is what pinned the second bug — ending a crawl on any zero-heart board also killed every clear whose last
party card went home, so the death guard is back to `preview.fatal && hp === 0`, with the venom heart priced into
`attackPreview` where that gate can see it.

## The reserve pocket (adopted)

The right-most free cell — the Dwarf's extra one when he is in the party, since `reserveCell()` reads the track's own
length — is the **reserve pocket**, marked with a small gold star. It is not a rule: any card can go in it. What it
buys is an optional third win. If nothing has ever sat there, a boss kill reads **true boss kill** and a bare tomb
reads **true clear tomb** in the end-of-crawl panel; the ordinary win is unaffected, and the star is the only thing
that tells the player a rule they agreed to is still live.

The flag is sticky and lives on `TombState.reserveHeld`, set false by `noteReserve()` inside `settle()` and
`revealFaceDown()` — the two funnels every move passes through. Sticky matters: a card put into the pocket and taken
out again still ends the true win, or the pocket could be borrowed from all deal and only be guarded at the end. It
changes no legality, so no stored line moved, and `reserveHeld` is deliberately not part of any solver key — two
positions that differ only in the star are the same position to the search.

The star pays. A **true boss kill** multiplies gold by ×2 for the rest of the crawl and a **true clear tomb** by ×3, so
the bar reads past a hundred — 200% and 300% on the same hundred-gold table. `goldMultiplier`/`goldScore` are the
scored reading; `TombState.trueBoss` is the earned flag, set by `noteTrueBoss()` inside the same two funnels. It is
sticky and separate from `reserveHeld` on purpose: spending the pocket after a clean kill costs the third step, not
the second, so a clean kill followed by a bare tomb reads 200% and never 300%.

## Gold is a flat table (adopted)

The bar counts gold, and gold is arithmetic a player can do in their head: **a rat one, a boss-suit minion two, a
General five, and the boss twenty-five**. Thirty-six rats, twelve minions, three Generals and the boss are
fifty-two cards and exactly a hundred gold, so a bare tomb reads 100 and the number is already a percentage — the
separate `(14.4%)` reading that used to sit beside it is gone rather than repeated. Each card's tooltip says what
it pays ("Drops 2 gold on slay"), so the price of a card can be known before the blow.

Par survives, and it is the legacy *negative* reading: `tombPar`/`PAR_TOTAL`/`parValue` still score a card by how
deep it lay in the deck as well as whether it came home, because that is what the solver is guided by and what the
corpus proves lines against. Nothing on the board shows it; the one place it surfaces is the layout sheet's "best
par N" on a square the solver has reached but not won, because those scan numbers are par and cannot be converted
to gold. A deal that opens with no boss cannot reach 100 either way — four
kings at five and forty-eight rats at one is 68 — and that was already true of par, which opened every tomb on 500
and could only ever be paid 420 before a boss was revealed.

## A seed is never thrown away, and a two-track seed is preferred

The squares publish the shipped track only, but the merge keeps **every** proved seed in the artifact's `proved`
array: one row per `track|seed`, with its party, goal, length and date. A hard win is a proof of a real deal even
though it cannot be the square, a solution file whose shard row is gone is still a solvable seed, and a retired seed
keeps its line in `solutions/` regardless. Nothing that is solvable gets deleted to tidy the sheet — a row that is
not on a square today is what lets a preference be reviewed, or reversed, later.

Because the merge now reads hard rows, `found` carries them per track as well (`found[key].hard.boss`), which is
where the trellis pane finds a party's second goal when the sheet is showing the hard tier.

Seed choice: a party's med row is picked by goal (a clear beats a boss kill), then by whether the **same party is also
proved on another track** on that seed, then by the **longest** line. A seed that falls at both med and hard is likely
the gentler deal and carries two goals, so it is the seed worth putting on the square — but the goal still leads the
ordering, because the square is making a claim about this track first.

Longest, not shortest, is the whole point of the square: a short line says the solver happened to find the cheap
route, while a long one says the deal kept paying out for another fifty moves. That is the harder board and the more
interesting one to hand a player, so the sheet shows the longest proof it has and the solver's own best line per goal
stays in `found` where the pane can still read it.

A row's length and goal are not its own: where a seed has a line, the row takes both from the file, because a shard
text written months ago is a guess about a line that has since been replaced — and preferring long lines would
otherwise pick the stalest guess in the pile. Three seeds were published at 38–67 moves against proofs of 71–92 before
this landed.

For a square with **no** win, the placeholder keeps the seed a search got furthest on, measured as
`PAR_TOTAL - tombPar` out of 500 (higher is further in), so the deal offered to a human is the one a machine got
closest to cracking. The pane prints that as "N/500 reached", never as par — the two run in opposite directions.

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

## The level cap (adopted)

The delver's level tops out at **12** (`TOMB_RULES.levelCap`), so the last eight cards of a crawl are paid
in hearts rather than waved through: at 12 a queen costs nothing and a king one, the boss included, and the
level-up at the 48th card is gone along with the two above it. Nothing in the midgame moves — level 12 needs
all four jacks home — and the only rule a table has to remember is "the level stops at twelve". Damage
arithmetic, level-up heals and glyph refreshes are unchanged; a capped level simply stops supplying them.

Measured before it shipped, over the 112 published lines that still replay at all: 54 still win, and every
one of the 58 that break does so within ten moves of the end, holding 0.81 hearts on average. The change is
entirely the finish. A boss kill stays cheap (87% of the old boss lines survive; the General and the boss are
two hearts), while a clear now has to carry four hearts — or a dig — into the last four kings. Cap 11 prices
the court at two a card, which makes the boss and its General four hearts and a clear eleven more; it was
held back as the next notch if the finish still reads as light.

The banner says the number it reached, and MAX on the capped one, so the endgame reads as a progress bar
with a last rung rather than an open-ended climb.

### The cap's endgame arithmetic (measured)

A clear ends with the track empty of cards and of wounds, so the hearts a crawl spends are gone for good — and a
card killed *out of a pocket* costs two, not one: it leaves the track and the blow wounds what is left. A park
hands one back, so a parked card is worth nothing across the run. Rearranged, the healing a clear still needs is

    needed = Σ damage(remaining) + (0-damage cards in pockets) − hp

The last four kings at cap 12 are four damage against the four party cards that are the track's only hearts, so
the endgame is short by exactly four heals. Uncapped the same board is level 13 and a formality: twelve moves
(queens home, then the kings, then the party) run par 0 to bare, and capped the same twelve refuse move 8 — the
boss, holding one heart. Park-and-kill loops do not rescue it, because the park is exactly what the kill takes back.

Measured over custom boards (`corpus/state-probe.ts`, gitignored — one card per column, everything else home):

- **kings only, no potion, shipped track:** no clear. The search finds none in 200k states, and it cannot: four
  are owed and the endgame has no heal at all (the Elixir mends its glyph for one, the Purity has no fog).
- **kings only with a Potion:** still none, off by exactly one. The flask is the rightmost party card, so it can
  only bank the wounds that land in the pockets to its right — three — and it locks the moment a wound reaches it.
- **clubs (Stone Gaze), diamonds (Mana Burn), spades (Mug):** no better. The Gaze and the Burn add hearts to the
  bill; Mug shoves the flask out of its slot before it can be drunk.
- **the one window that wins:** a Dwarf (fourth pocket), a Fighter (so a king is homeable while its queen still
  sits in a pocket) and a Potion. Seventeen moves: park the four queens as a wound bank, kill the four kings into
  them, drink, then walk everything home against an empty bill. A clubs tomb closes it — the Gaze stones the Dwarf
  and the fourth pocket goes with him. Both ends of this are pinned in `src/tombcrawl.test.ts` under "the level
  cap": the four-heart bill, and the Dwarf's clear.

Neither engine finds any of these lines (`flat` and `plan`, 200k–400k states, including the trivially winnable
uncapped board): they cannot see "clear the queens first to lift the level" or "park as a wound bank". The clear
above is a hand-built line the rules verified, which is the same blind spot the two human lines show.
