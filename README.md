# Fill the Unit

An interactive Next.js toy for learning **decimal place value** by literally
filling up a rectangle that is worth **1**.

Build a decimal digit by digit: a stack of *zoom rows*, one per decimal place,
each row magnifying the next blank slice of the unit to full width. Every fill
updates a live readout with the exact decimal (and its fraction), so a kid can
*see* what `0.43` or `0.333…` really means.

Try it: **http://localhost:3000** after `pnpm dev`.

## Try these

- **0.43** — fill 4 tenths, tap *Split*, fill 3 hundredths in the next tenth.
- **0.25** — two tenths plus five hundredths; readout shows `25/100` — a quarter.
- **0.333…** — fill 3, split, fill 3, split, fill 3… the digits keep repeating
  and the app suggests `0.(3)… = 1/3`.
- **0.999… = 1** — fill nine in every row, fill the deepest row's 10th piece,
  tap **▲ Promote**, and watch each full row bubble up until the bar is **1 whole**.

## The model

- **Rows are decimal digits.** `[4, 3]` means `0.43`. Row 1 is the whole unit in
  tenths; each row below zooms into the *next blank slice* of the row above
  (`0.1 → 0.01 → 0.001 → …`) and is drawn full-width, so pieces never shrink —
  you can refine to any depth.
- **Fill from the left.** Pieces form one run; tapping a piece sets the run to
  end right after it (further right adds, further left removes, clicking the
  run's tip steps it back so digits can shrink to 0). Clicking any row edits
  just that digit — digits below it stay (they are part of the number).
- **Colours per level** (blue = tenths, green = hundredths, amber =
  thousandths…). A higher row's partially-used piece shows the finer rows'
  colours nested inside it, so you can see where every digit came from. Fills
  are drawn pixel-exact, so edges end exactly at the true value.
- **Full rows are stable.** Clicking a row's dashed 10th piece fills it
  completely; it stays visible as a completed slice (`1 whole`, `one 0.1`,
  `one 0.01`, …) instead of disappearing. Nothing moves until you tap
  **▲ Promote: ten of these → one of the row above**, which flashes the row
  that gains the piece. If that row also reaches ten it stays full and the
  promotion continues automatically — a cascade of flashes (this is how
  `0.999…` rolls up to `1`).
- **Exact everywhere.** Values are computed from digit strings/BigInts — no
  float drift however deep you go. A full row's readout is always correct
  (`[4, 10]` reads `0.5`), and repeating digits are detected with their exact
  rational (`0.(3)… = 1/3`).
- Row labels ("0.43"…) show the value a click will mark; the dashed 10th piece
  is labelled with the slice it completes.

## Project layout

```
lib/decimal.ts        pure model — Rows state, click/promote/split operations,
                      exact decimal + fraction + repeating-period helpers
components/RowBar.tsx SVG row renderer (pixel-exact nested fills, labels,
                      "full slice" captions, pulse flash) + level palette
app/page.tsx          the app: readout chrome, rows, controls, promote
                      cascade, examples
app/globals.css       styling
scripts/sanity.ts     pure-model tests (run with plain Node)
```

## Run it

```bash
pnpm install
pnpm dev          # → http://localhost:3000
```

Production:

```bash
pnpm build && pnpm start
```

Model tests (no browser — needs Node ≥ 23.6 for TypeScript type stripping):

```bash
node scripts/sanity.ts
```

## Ideas to extend

- Repeating-decimal bar notation in the readout (0.3̅) and digit-grouping in a
  long repeating block.
- Spoken feedback ("three hundredths!"), preset challenges ("make exactly
  0.37"), and a two-dimensional hundred-square view.
- Reduced-fraction display alongside the power-of-ten fraction.
