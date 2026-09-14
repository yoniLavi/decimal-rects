/**
 * Pure model for building decimals digit by digit with nested zoom rows.
 *
 * The unit bar (worth exactly 1) is shown as a stack of ROWS, one per decimal
 * digit, each row = a single slice of the unit magnified to full width:
 *
 *   Row 1 (tenths):     the whole unit [0,1), split into 10 × 0.1
 *   Row 2 (hundredths): the next blank 0.1 slice, split into 10 × 0.01
 *   Row 3 (thousandths):the next blank 0.01 slice, split into 10 × 0.001
 *   … and so on, as deep as you like — pieces never shrink because every row
 *     is drawn at full width.
 *
 * State is a Rows array holding one digit per row:
 *
 *   [4]        → 0.4   (four tenths)
 *   [4, 3]     → 0.43  (…plus three hundredths inside the next blank tenth)
 *   [4, 10]    → the hundredths row is FULL — ten 0.01 pieces (the row shows
 *                as one complete 0.1 slice; readout 0.5). Full rows stay
 *                visible instead of vanishing: "promote" moves them up.
 *
 * A digit is 0…9, or 10 only for the LAST (bottom) row meaning "this row is
 * full" (a completed slice awaiting promotion). rows = [10] is the whole bar.
 *
 * Windows always derive from the digits above them (Row k+1 magnifies piece
 * digits[k] of Row k), so rows re-derive whenever higher digits change.
 * Readouts (decimal / fraction / pattern detection) are computed on a
 * carry-normalised copy — promoting or filling never loses precision.
 */

export type Rows = number[];

/** A digit of 10 = "this (bottom) row is completely full". */
export const FULL = 10;

export function initialRows(): Rows {
  return [0];
}

/** The whole bar is full: [10]. */
export function isWhole(rows: Rows): boolean {
  return rows.length === 1 && rows[0] === FULL;
}

/** Row `idx` is completely full (a completed slice, always the bottom row). */
export function isFull(rows: Rows, idx: number): boolean {
  return idx === rows.length - 1 && (rows[idx] ?? 0) === FULL;
}

export function rowsEqual(a: Rows, b: Rows): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function isAllZero(a: number[]): boolean {
  return a.every((d) => d === 0);
}

function trimDecimalString(s: string): string {
  let t = s;
  if (t.includes(".")) {
    t = t.replace(/0+$/, "").replace(/\.$/, "");
  }
  return t === "" ? "0" : t;
}

/** Propagate full rows (10) upward on a copy; used only for readouts. */
function carryUp(rows: Rows): Rows {
  if (isWhole(rows)) return [FULL];
  const r = rows.slice();
  for (let i = r.length - 1; i >= 1; i--) {
    while (r[i] >= FULL) {
      r[i] -= FULL;
      r[i - 1] += 1;
    }
  }
  if (r[0] >= FULL) return [FULL];
  return r;
}

/**
 * Carry-normalised copy of the state for readouts: full rows bubble up, then
 * meaningless trailing zeros are dropped. Never mutates the state itself.
 */
export function normalized(rows: Rows): Rows {
  if (isWhole(rows)) return [FULL];
  const r = carryUp(rows);
  while (r.length > 1 && r[r.length - 1] === 0) r.pop();
  return r;
}

/** Digits used by readouts (≤ 9, trailing zeros trimmed). */
export function digitsOf(rows: Rows): number[] {
  if (isWhole(rows)) return [FULL];
  const n = normalized(rows);
  if (n.length === 1 && n[0] === FULL) return [FULL];
  return n;
}

/** Exact decimal string for the built value, e.g. "0.43" (or "1"). */
export function decimalString(rows: Rows): string {
  if (isWhole(rows)) return "1";
  const d = digitsOf(rows);
  if (d.length === 1 && d[0] === FULL) return "1";
  if (isAllZero(d)) return "0";
  return trimDecimalString("0." + d.join(""));
}

export interface FractionParts {
  num: string;
  den: string;
  /** number of decimal places (denominator exponent) */
  digits: number;
}

/** Exact fraction num/10^digits for the built value (BigInt-safe). */
export function fractionParts(rows: Rows): FractionParts {
  if (isWhole(rows)) return { num: "1", den: "1", digits: 0 };
  const d = digitsOf(rows);
  if (d.length === 1 && d[0] === FULL) return { num: "1", den: "1", digits: 0 };
  const s = d.join("");
  if (isAllZero(d)) return { num: "0", den: "1", digits: 0 };
  const digits = s.length; // leading zeros still count as places (0.07 → /100)
  const num = BigInt(s).toString();
  const den = "1" + "0".repeat(digits);
  return { num, den, digits };
}

/** Short label for one piece of place i (1-based): 0.1, 0.01, 0.001, … */
export function placeLabel(i: number): string {
  if (i === 1) return "0.1";
  return "0." + "0".repeat(i - 1) + "1";
}

const NAMES = [
  "",
  "tenths",
  "hundredths",
  "thousandths",
  "ten-thousandths",
  "hundred-thousandths",
  "millionths",
];

export function placeName(i: number): string {
  return NAMES[i] ?? `10⁻${i} pieces`;
}

/**
 * Open the next row (digit for the next finer place). Not possible when the
 * bottom row is full — promote it first — or when the bar is 1 whole.
 */
export function pushNext(rows: Rows): Rows | null {
  if (isWhole(rows)) return null;
  if (isFull(rows, rows.length - 1)) return null;
  return rows.concat([0]);
}

/**
 * Set digit `idx` to `count` (0..10) directly, dropping any rows below when
 * the row becomes full (they are swallowed by the completed slice).
 */
export function setCount(rows: Rows, idx: number, count: number): Rows {
  if (idx < 0 || idx >= rows.length || count < 0 || count > FULL) return rows;
  const base = count === FULL ? rows.slice(0, idx + 1) : rows.slice();
  base[idx] = count;
  return base;
}

/**
 * Effect of clicking piece `j` (0-based) of row `idx`. Returns the new rows,
 * or null when nothing should change.
 *
 *  • j 0..8, blank piece → fill the run through it (digit j+1)
 *  • j 0..8, filled piece → truncate the run to end right after it
 *    (digit j+1); clicking the tip of the run (the last filled piece)
 *    steps the run back by one instead, so a digit can shrink to 0
 *  • j = 9 (the dashed 10th piece) → fill this row completely (digit 10).
 *    The row stays visible as a full slice — it does NOT vanish or bubble on
 *    its own; use promote() for that. Clicking it again on a full row does
 *    nothing (idempotent).
 */
export function clickPiece(rows: Rows, idx: number, j: number): Rows | null {
  if (idx < 0 || idx >= rows.length || j < 0 || j > 9) return null;
  if (isWhole(rows)) return null; // the completed whole bar is inert
  const d = rows[idx] ?? 0;
  let count: number;
  if (j === 9) {
    if (d === FULL) return null; // already full — no change (idempotent)
    count = FULL;
  } else if (j < d) {
    count = j === d - 1 ? d - 1 : j + 1; // tip → step back one; else truncate
  } else {
    count = j + 1;
  }
  if (count === d) return null;
  const base = count === FULL ? rows.slice(0, idx + 1) : rows.slice();
  base[idx] = count;
  return base;
}

/**
 * Promote a full bottom row: its ten pieces become one piece in the row
 * above. Returns null when there is nothing to promote (no full bottom row,
 * or the bar is already the whole 1). If the parent reaches 10 it is now a
 * full row too — call promote again for the next level of the cascade.
 */
export function promote(rows: Rows): Rows | null {
  if (isWhole(rows)) return null;
  const last = rows.length - 1;
  if (rows[last] !== FULL) return null;
  if (last === 0) return null;
  const r = rows.slice(0, last);
  r[last - 1] += 1;
  return r;
}

/**
 * The inverse of promoting into 1 whole: break the whole bar back up so its
 * last tenth becomes a full row of ten hundredths, [10] → [9, 10]. Promote
 * puts it back together. Returns null unless the bar is 1 whole.
 */
export function breakWhole(rows: Rows): Rows | null {
  if (!isWhole(rows)) return null;
  return [FULL - 1, FULL];
}

/** Window of row `idx` (the slice of the unit that row magnifies). */
export function windowOf(rows: Rows, idx: number, max = 12): { lo: string; hi: string } {
  if (idx === 0) return { lo: "0", hi: "1" };
  const prefix = rows.slice(0, idx);
  if (prefix.length > max) {
    return { lo: formatDigits(prefix, max), hi: "…" };
  }
  return {
    lo: formatDigits(prefix, 1000),
    hi: formatDigits(incrementDigits(prefix), 1000),
  };
}

/**
 * Label for cell `cell` of row `idx`: the decimal that will be marked when
 * the cell is clicked — the value the whole number takes (carried) once this
 * row holds cell+1 pieces. E.g. "0.43", and cell 9 of a hundredths row in
 * 0.4… shows "0.5" (filling the row completes one 0.1).
 */
export function cellLabel(rows: Rows, idx: number, cell: number): string {
  const prefix = idx === 0 ? [] : rows.slice(0, idx);
  const withDigit = prefix.concat([cell + 1]);
  return decimalString(withDigit);
}

function formatDigits(a: number[], max: number): string {
  if (a.length === 0) return "0";
  if (isAllZero(a)) return "0";
  const shown = a.length > max ? a.slice(0, max) : a;
  const s = shown.join("");
  const base = trimDecimalString("0." + s);
  return a.length > max ? base + "…" : base;
}

function incrementDigits(a: number[]): number[] {
  if (a.length === 0) return [1];
  const out = a.slice();
  let i = out.length - 1;
  while (i >= 0) {
    if (out[i] < 9) {
      out[i] += 1;
      return out;
    }
    out[i] = 0;
    i--;
  }
  return [1, ...out];
}

export interface Period {
  /** length of the repeating block */
  p: number;
  /** the repeating digit block */
  block: number[];
  blockStr: string;
  /** reduced rational for the infinite repeating decimal 0.(block) */
  reducedNum: number;
  reducedDen: number;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/**
 * If the digits laid down so far are exactly a repetition of some block
 * (with at least two full copies plus one extra digit), return that period so
 * the UI can hint at a repeating decimal. Exactness: all m digits must equal
 * block[i mod p] — a pure repetition from the first digit.
 */
export function detectPeriod(rows: Rows): Period | null {
  const d = digitsOf(rows);
  const m = d.length;
  if (m < 3 || d[0] === FULL) return null;
  for (let p = 1; p <= Math.floor(m / 2); p++) {
    if (m < 2 * p + 1) continue;
    let ok = true;
    for (let i = 0; i < m; i++) {
      if (d[i] !== d[i % p]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const block = d.slice(0, p);
    let b = 0;
    for (const x of block) b = b * 10 + x;
    const den = Math.pow(10, p) - 1;
    const g = gcd(b, den);
    return {
      p,
      block,
      blockStr: block.join(""),
      reducedNum: b / g,
      reducedDen: den / g,
    };
  }
  return null;
}

/** Append one more copy of `block` to the digit rows (onto the trimmed base). */
export function appendBlock(rows: Rows, block: number[]): Rows | null {
  if (block.length === 0) return null;
  const base = digitsOf(rows);
  if (base[0] === FULL) return null;
  return base.concat(block);
}
