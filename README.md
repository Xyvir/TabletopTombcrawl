# FreeCell

A FreeCell game in Svelte 5 + TypeScript, with the rules engine kept separate from the board so a
rule *variant* can be added without rewriting the UI.

## Provenance and licences

- **Rules engine:** `src/game/**` is vendored from [spinnytea/freecell](https://github.com/spinnytea/freecell),
  which is released into the public domain (Unlicense — see [LICENSE](LICENSE)). The rules code and its
  ~2,250 tests are unchanged; the only edits are import shims:
  - `@/app/components/cards/constants` → `src/game/constants.ts` (the engine only needed `BOTTOM_OF_CASCADE`)
  - `@/utils` → `src/game/utils.ts`
  - `@/app/testUtils` → `src/game/testUtils.ts`
- **Card art:** `public/images/` came with the original fork of this project. Confirm its provenance
  before publishing under your own name.
- **UI:** `src/App.svelte`, `src/app.css` and `src/main.ts` are new.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # rules engine suite (2,255 tests)
npm run build    # static site in dist/, relative asset paths (host at any subpath)
```

## Layout

| Path | Role |
| --- | --- |
| `src/game/card/card.ts` | cards, suits, ranks, locations, shorthand notation |
| `src/game/move/move.ts` | move legality, available moves, destination priorities |
| `src/game/move/history.ts` | undo/redo, action text, replays |
| `src/game/game.ts` | the `FreeCell` state machine — every action returns a new game |
| `src/App.svelte` | the board, and tap-to-move wiring |

The engine is immutable: `game.setCursor(loc).touch()` returns a new `FreeCell` rather than mutating
the current one, which is why the Svelte side is just `game = game.setCursor(loc).touch()`.

## Controls

- **Drag a card or a stack** — press and drag: the whole valid run at that card lifts, tilts with
  the pointer's sideways motion (inertia, decaying to dead vertical), and an illegal drop snaps
  back with a shake. Cards stay draggable even with nowhere legal to go, so the board always
  answers the touch. Legal-pile highlighting is **off by default**; the footer's `Glow` button
  turns it on.
- **Single click (auto-move mode)** — moves *only the exposed card*, never a run, and only onto a
  **tableau build**. It never sends a card to a foundation or a free cell. A buried card that has a
  real super-move available shakes (drag or double click instead); otherwise the click just selects
  it. No tableau target ⇒ shake.
- **Double click** — sends the card **home to its foundation** when that is legal; otherwise a lone
  exposed card goes to the first empty free cell, and a run gets the super-move.
- **Click a free-cell card** — builds it back onto the tableau. Double click sends it home first,
  falling back to the tableau only when no foundation move exists.
- **Tap: pick target** — click selects a card, then click a destination. Dragging still works.

A single-click move is held for 150 ms in case the click becomes a double click. Once it has flown,
another 250 ms of "ghost clickbox" covers the space it used to occupy, so a second click on empty
felt is still credited to that card and routed to the free cell instead.The only animation delay in the game is the auto-foundation chain, which queues its cards one after
another (240 ms beat before the first, then strictly sequential flights).

Moves animate with a FLIP transition measured from the previous DOM positions, so every pile change
(cascade, cell, foundation) is animated without the UI knowing any rules. Cards pick up a brief
sideways tilt mid-flight and always land perfectly vertical; new deals fade in. Cards sent home by
an auto-foundation take turns: the first waits 240 ms, and each later card starts only once the
previous one has landed, so two cards never fly home at the same time. `prefers-reduced-motion` disables all of it.

Undo, auto-to-home, restart and deal numbers (the standard 1–32,000 Microsoft deals) are in the footer.

## Solver

`src/solver.ts` searches a deal with best-first search over the real rules: every move it offers is
replayed through `tombMove`, `attackWith`, `revealFaceDown` or `useAbility`, so a line it reports is
a line the game accepts. The CLI is run through Vite (`scripts/run.mjs`) because the vendored rules
import lodash as CommonJS, which plain `node` cannot load by named export.

```sh
npm run solve -- --seed 4242                # one deal, printed move by move
npm run solve -- --seeds 1-50               # a range, one summary line each
npm run solve -- --seed 4242 --goal boss    # stop at the boss kill instead of 100%
npm run solve -- --seed 4242 --time 300 --nodes 2000000   # look harder
```

Each line of a printed solution is one move: what it did, then the fog, hearts, level, par and
cleared percentage after it. A found line proves the deal winnable; finding none does not prove the
opposite — it is a lower bound at the stated budget. PISORF, WEYTWUT and the Elixir are not armed by
the search yet, so a line that needs one of them will be missed.
