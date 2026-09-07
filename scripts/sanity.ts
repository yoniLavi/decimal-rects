/**
 * Sanity checks for the decimal model with stable "full" rows and promotion.
 * Run with: node scripts/sanity.ts   (requires Node ≥ 23.6)
 */
import assert from "node:assert/strict";
import {
  appendBlock,
  cellLabel,
  clickPiece,
  decimalString,
  detectPeriod,
  digitsOf,
  fractionParts,
  initialRows,
  isFull,
  isWhole,
  normalized,
  placeLabel,
  promote,
  pushNext,
  rowsEqual,
  setCount,
  windowOf,
} from "../lib/decimal.ts";

// --- the 0.43 story ---------------------------------------------------------

let rows = initialRows();
assert.deepEqual(rows, [0], "starts as one blank tenths row");
assert.equal(decimalString(rows), "0");

rows = setCount(rows, 0, 4);
assert.equal(decimalString(rows), "0.4");
assert.deepEqual(fractionParts(rows), { num: "4", den: "10", digits: 1 });

rows = pushNext(rows)!;
assert.deepEqual(rows, [4, 0], "new row opens blank");
rows = setCount(rows, 1, 3);
assert.equal(decimalString(rows), "0.43");
assert.deepEqual(fractionParts(rows), { num: "43", den: "100", digits: 2 });

// --- zero digits & deep reads ------------------------------------------------

assert.equal(decimalString(setCount(pushNext(initialRows())!, 1, 7)), "0.07");
assert.equal(decimalString([4, 0, 3]), "0.403");
assert.equal(decimalString([0]), "0");

// --- full rows are STABLE states (they don't vanish) ------------------------

assert.deepEqual(setCount([4, 0], 1, 10), [4, 10], "ten hundredths = a full row");
assert.ok(isFull([4, 10], 1));
assert.ok(!isFull([4, 3], 1));
assert.equal(decimalString([4, 10]), "0.5", "readout still exact while the row is full");
assert.deepEqual(normalized([4, 10]), [5]);
assert.deepEqual(fractionParts([4, 10]), { num: "5", den: "10", digits: 1 });

// clicking the dashed 10th piece fills the row and stays put (idempotent)
assert.deepEqual(clickPiece([4, 3], 1, 9), [4, 10], "fill the row to full");
assert.equal(clickPiece([4, 10], 1, 9), null, "already full — click is a no-op");
assert.equal(decimalString([4, 10]), "0.5", "a full row's value is still exact");

// filling a row to full swallows any finer rows inside it
assert.deepEqual(clickPiece([4, 3, 5], 1, 9), [4, 10], "thousandths absorbed");
assert.equal(pushNext([4, 10]), null, "a full row can't be split — promote first");

// ordinary piece clicks still behave (truncate / extend / step back to zero)
assert.deepEqual(clickPiece([4, 3], 1, 2), [4, 2], "tip of the run steps back one");
assert.deepEqual(clickPiece([4, 3], 1, 3), [4, 4], "clicking a blank piece extends");
assert.deepEqual(clickPiece([4, 1], 1, 0), [4, 0], "digit can shrink to 0");
assert.deepEqual(clickPiece([4, 10], 1, 5), [4, 6], "click a piece of a full row to reduce it");

// --- promotion ---------------------------------------------------------------

assert.deepEqual(promote([4, 10]), [5], "ten of these become one of the row above");
assert.equal(decimalString(promote([4, 10])!), "0.5", "promotion preserves the value");
assert.equal(promote([10]), null, "the whole bar has nothing above it");
assert.equal(promote([4, 5]), null, "a partial row can't be promoted");
assert.deepEqual(promote([9, 9, 10]), [9, 10]);
assert.deepEqual(promote(promote([9, 9, 10])!), [10], "nines cascade all the way to 1");
assert.ok(isWhole([10]));
assert.equal(decimalString([9, 10]), "1");

// whole bar
assert.deepEqual(clickPiece([9], 0, 9), [10], "ten tenths → the full bar");
assert.equal(clickPiece([10], 0, 9), null, "whole bar is inert");

// --- windows & labels --------------------------------------------------------

assert.deepEqual(windowOf([4, 3], 0), { lo: "0", hi: "1" });
assert.deepEqual(windowOf([4, 3], 1), { lo: "0.4", hi: "0.5" });
assert.deepEqual(windowOf([4, 3], 2), { lo: "0.43", hi: "0.44" });

assert.equal(cellLabel([4, 3], 1, 2), "0.43", "labels show the value the click marks");
assert.equal(cellLabel([4, 3], 0, 4), "0.5");
assert.equal(cellLabel([0, 7], 1, 0), "0.01");
assert.equal(cellLabel([4, 3], 1, 9), "0.5", "10th piece marks the completed slice");
assert.equal(cellLabel([4], 0, 9), "1", "ten tenths mark 1 whole");
assert.equal(cellLabel([9, 0], 1, 9), "1");

assert.equal(placeLabel(1), "0.1");
assert.equal(placeLabel(2), "0.01");
assert.equal(placeLabel(5), "0.00001");

// --- repeating detection & appending -----------------------------------------

assert.equal(detectPeriod([4, 3]), null);
const p1 = detectPeriod([3, 3, 3]);
assert.ok(p1 && p1.p === 1 && p1.reducedNum === 1 && p1.reducedDen === 3, "333 → 1/3");
assert.deepEqual(appendBlock([3, 3, 3], [3]), [3, 3, 3, 3]);

// --- no precision loss however deep ------------------------------------------

const deep = Array(40).fill(7);
assert.equal(decimalString(deep), "0." + "7".repeat(40));
assert.equal(fractionParts(deep).den.length, 41);

assert.ok(rowsEqual([1, 2], [1, 2]));
assert.ok(!rowsEqual([1, 2], [1, 2, 0]));
assert.deepEqual(digitsOf([4, 3, 0]), [4, 3]);
assert.deepEqual(digitsOf([4, 10]), [5]);

console.log("All decimal-model sanity checks passed ✓");
