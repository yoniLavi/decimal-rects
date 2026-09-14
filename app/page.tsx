"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RowBar, { levelColor } from "@/components/RowBar";
import type { Rows } from "@/lib/decimal";
import {
  appendBlock,
  breakWhole,
  clickPiece,
  decimalString,
  detectPeriod,
  fractionParts,
  initialRows,
  isWhole,
  placeLabel,
  placeName,
  promote,
  pushNext,
  rowsEqual,
  windowOf,
} from "@/lib/decimal";

const HISTORY_LIMIT = 120;

export default function DecimalPage() {
  const [rows, setRows] = useState<Rows>(() => initialRows());
  const [history, setHistory] = useState<Rows[]>([]);
  const [width, setWidth] = useState(0);
  const [flash, setFlash] = useState<{ row: number; token: number } | null>(null);
  const flashTokenRef = useRef(0);
  const [cascading, setCascading] = useState(false);
  const busyRef = useRef(false);
  const cascadeTimersRef = useRef<number[]>([]);

  // Stop any half-finished promote cascade on unmount.
  useEffect(() => {
    return () => {
      busyRef.current = false;
      cascadeTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Latest-value refs so pointer handlers never read stale state.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const historyRef = useRef(history);
  historyRef.current = history;

  const strokeRef = useRef<{
    active: boolean;
    idx: number;
    appliedJ: number;
    changed: boolean;
  }>({ active: false, idx: -1, appliedJ: -1, changed: false });
  const touchRef = useRef<{ idx: number; j: number; at: number } | null>(null);
  const rowsElRef = useRef<HTMLDivElement | null>(null);

  const whole = isWhole(rows);
  const bottomIdx = rows.length - 1;
  const dec = useMemo(() => decimalString(rows), [rows]);
  const frac = useMemo(() => fractionParts(rows), [rows]);
  const period = useMemo(() => detectPeriod(rows), [rows]);

  // Measure the width available to the row bars: the content box of a row
  // card, i.e. the rows column minus each card's horizontal padding + border.
  useEffect(() => {
    const el = rowsElRef.current;
    if (!el) return;
    const update = () => {
      let w = el.getBoundingClientRect().width;
      const card = el.querySelector<HTMLElement>(".row");
      if (card) {
        const cs = getComputedStyle(card);
        w -=
          parseFloat(cs.paddingLeft) +
          parseFloat(cs.paddingRight) +
          parseFloat(cs.borderLeftWidth) +
          parseFloat(cs.borderRightWidth);
      }
      setWidth(Math.max(0, Math.floor(w)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // ---- state helpers -------------------------------------------------------

  function pushHistory(prev: Rows) {
    const next = [...historyRef.current, prev].slice(-HISTORY_LIMIT);
    historyRef.current = next;
    setHistory(next);
  }

  function commit(next: Rows) {
    rowsRef.current = next;
    setRows(next);
  }

  /** Apply one piece click; returns whether the state changed. */
  function applyPiece(idx: number, j: number, recordHistory: boolean): boolean {
    const prev = rowsRef.current;
    const next = clickPiece(prev, idx, j);
    if (!next || rowsEqual(next, prev)) return false;
    if (recordHistory) pushHistory(prev);
    commit(next);
    return true;
  }

  /** Clicking "1 whole" breaks it back up — the inverse of the last promote. */
  function breakUpWhole() {
    const next = breakWhole(rowsRef.current);
    if (!next) return;
    pushHistory(rowsRef.current);
    commit(next);
    flashRow(1); // the new full row of ten hundredths
  }

  function beginStroke(idx: number, j: number) {
    if (busyRef.current) return;
    // A single tap, not a drag stroke: the rows under the pointer change shape.
    if (isWhole(rowsRef.current)) return breakUpWhole();
    if (!applyPiece(idx, j, true)) return; // deliberate no-op (e.g. 10th piece on a full row)
    strokeRef.current = { active: true, idx, appliedJ: j, changed: true };
  }

  function handleRowDown(x: number, isTouch: boolean, idx: number) {
    if (busyRef.current) return;
    if (x < 0 || x >= 1) return;
    const j = Math.min(9, Math.floor(x * 10));
    if (isTouch) {
      touchRef.current = { idx, j, at: Date.now() };
      return;
    }
    beginStroke(idx, j);
  }

  function handleRowMove(x: number, idx: number) {
    if (busyRef.current) return;
    const s = strokeRef.current;
    if (!s.active || idx !== s.idx) return;
    if (x < 0 || x >= 1) return;
    const j = Math.min(9, Math.floor(x * 10));
    if (j === s.appliedJ) return;
    s.appliedJ = j;
    applyPiece(idx, j, false);
  }

  function handleRowUp(isTouch: boolean) {
    const s = strokeRef.current;
    if (s.active) {
      s.active = false;
      return;
    }
    if (isTouch && touchRef.current) {
      const t = touchRef.current;
      touchRef.current = null;
      if (Date.now() - t.at < 700) beginStroke(t.idx, t.j);
    }
  }

  function handleRowCancel() {
    strokeRef.current.active = false;
    touchRef.current = null;
  }

  // ---- structure operations ------------------------------------------------

  function splitNext() {
    if (busyRef.current || whole || bottomFull) return;
    const next = pushNext(rowsRef.current);
    if (!next) return;
    pushHistory(rowsRef.current);
    commit(next);
  }

  function repeatPattern() {
    if (busyRef.current) return;
    if (!period) return;
    const base = period.block;
    const next = appendBlock(rowsRef.current, base);
    if (!next || rowsEqual(next, rowsRef.current)) return;
    pushHistory(rowsRef.current);
    commit(next);
  }

  function undo() {
    if (busyRef.current) return;
    const h = historyRef.current;
    if (h.length === 0) return;
    const prev = h[h.length - 1];
    historyRef.current = h.slice(0, -1);
    setHistory(historyRef.current);
    commit(prev);
  }

  function clearAll() {
    if (busyRef.current) return;
    if (rowsRef.current.length === 1 && rowsRef.current[0] === 0) return;
    pushHistory(rowsRef.current);
    commit(initialRows());
  }

  function loadPreset(digits: number[]) {
    if (busyRef.current) return;
    pushHistory(rowsRef.current);
    commit(digits);
  }

  // ---- promote cascade -------------------------------------------------------

  function clearCascadeTimers() {
    cascadeTimersRef.current.forEach((t) => window.clearTimeout(t));
    cascadeTimersRef.current = [];
  }

  function flashRow(row: number) {
    flashTokenRef.current += 1;
    setFlash({ row, token: flashTokenRef.current });
  }

  /**
   * Promote a full bottom row up one level; if that makes the row above full
   * too, keep promoting — each level flashes in turn, so 0.999… bubbles all
   * the way up into 1 whole.
   */
  function doPromote() {
    if (busyRef.current) return;
    const cur = rowsRef.current;
    if (isWhole(cur)) return;
    if (cur.length < 2 || cur[cur.length - 1] !== 10) return;
    pushHistory(cur); // one undo step for the whole cascade
    busyRef.current = true;
    setCascading(true);
    clearCascadeTimers();

    const finish = () => {
      busyRef.current = false;
      setCascading(false);
      clearCascadeTimers();
    };

    const step = () => {
      const c = rowsRef.current;
      if (c.length < 2 || isWhole(c)) return finish();
      const next = promote(c);
      if (!next || rowsEqual(next, c)) return finish();
      flashRow(Math.max(0, c.length - 2)); // the row that gains the piece
      commit(next);
      const after = rowsRef.current;
      if (after.length > 1 && after[after.length - 1] === 10) {
        cascadeTimersRef.current.push(window.setTimeout(step, 460));
      } else {
        finish();
      }
    };

    step();
  }

  // Ctrl/Cmd+Z and Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- UI strings ----------------------------------------------------------

  const lastDigit = rows[rows.length - 1];
  const bottomFull = !whole && rows.length > 1 && lastDigit === 10;
  const splitDisabled = whole || bottomFull || cascading;
  const splitTitle = whole
    ? "The unit bar is completely full — that's 1 whole"
    : bottomFull
      ? "This row is full first — promote it to the level above"
      : `Opens a new row: the next blank ${placeLabel(rows.length)} slice, magnified and split into 10`;
  const fracTooLong = !whole && frac.num !== "0" && frac.digits > 12;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Fill the Unit</h1>
          <p className="subtitle">
            Build a decimal digit by digit. Each row zooms into the next blank
            slice, and the readout always shows the exact number you&apos;ve made.
          </p>
        </div>
        <div className="chip-row">
          <span className="chip-label">Examples:</span>
          <button
            className="btn"
            onClick={() => loadPreset([4, 3])}
            disabled={cascading}
            title="4 tenths + 3 hundredths"
          >
            0.43
          </button>
          <button
            className="btn"
            onClick={() => loadPreset([2, 5])}
            disabled={cascading}
            title="2 tenths + 5 hundredths = a quarter"
          >
            0.25
          </button>
          <button
            className="btn"
            onClick={() => loadPreset(Array(6).fill(3))}
            disabled={cascading}
            title="Watch 3 keep repeating"
          >
            0.333…
          </button>
        </div>
      </header>

      {/* chrome: the number that lives above the unit rows */}
      <section className="readout-card">
        <div className="readout-side">
          <span className="readout-label">the number so far</span>
          <div className={`readout-value ${frac.digits > 8 ? "small" : ""}`}>{dec}</div>
        </div>
        <div className="readout-eq">
          <span className="eq-symbol">=</span>
          <div className="readout-side">
            <span className="readout-label">as a fraction</span>
            {whole ? (
              <div className="note" style={{ fontSize: 16 }}>
                the whole bar — one unit
              </div>
            ) : frac.num === "0" ? (
              <div className="note" style={{ fontSize: 16 }}>
                nothing filled yet — click pieces to fill
              </div>
            ) : fracTooLong ? (
              <div className="note" style={{ fontSize: 15 }}>
                fraction has {frac.digits} digits (denominator 10^{frac.digits})
              </div>
            ) : (
              <div className="readout-fraction">
                {frac.num} / {frac.den}
              </div>
            )}
          </div>
        </div>
      </section>

      {period && (
        <section className="period-card">
          <div>
            <span className="period-say">
              Looks like <b>{period.blockStr}</b> keeps repeating — if it went on
              forever, <b>0.({period.blockStr})…</b> ={" "}
              <b>
                {period.reducedNum}/{period.reducedDen}
              </b>
              .
            </span>
            <span className="note">
              {" "}
              (so 0.333… = 1/3 — it never quite lands on 1)
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={repeatPattern}
            disabled={cascading}
          >
            ＋ repeat {period.blockStr} again
          </button>
        </section>
      )}

      <section className="stage">
        <div className="rows" ref={rowsElRef}>
          {rows.map((_, idx) => {
            const isBottom = idx === bottomIdx;
            const rowFull = idx === bottomIdx && rows[idx] === 10;
            const win = windowOf(rows, idx);
            return (
              <div key={idx} className={isBottom ? "row active" : "row"}>
                <div className="row-head">
                  <span className="row-title">
                    <span
                      className="swatch"
                      style={{ background: levelColor(idx) }}
                      aria-hidden
                    />
                    {idx + 1}. {placeName(idx + 1)}{" "}
                    <span className="muted">({placeLabel(idx + 1)} pieces)</span>
                  </span>
                  <span className="row-slice muted">
                    {idx === 0
                      ? "the whole unit 0 → 1"
                      : `slice ${win.lo} → ${win.hi} of the unit`}
                  </span>
                  {rowFull ? (
                    whole ? (
                      <span className="badge">full bar — that&apos;s 1 whole · click it to break it up</span>
                    ) : (
                      <span className="badge">full — tap ▲ Promote to move it up</span>
                    )
                  ) : isBottom ? (
                    <span className="badge">your row — split continues here</span>
                  ) : (
                    <span className="badge-lite">earlier digit — click to change it</span>
                  )}
                </div>
                {width > 0 ? (
                  <RowBar
                    rows={rows}
                    idx={idx}
                    width={width}
                    height={52}
                    flash={flash}
                    onDown={(x, t) => handleRowDown(x, t, idx)}
                    onMove={(x) => handleRowMove(x, idx)}
                    onUp={(t) => handleRowUp(t)}
                    onCancel={handleRowCancel}
                  />
                ) : (
                  <div style={{ height: 52, background: "#fbfcfd", borderRadius: 6 }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="control-row">
          {bottomFull ? (
            <button
              className="btn btn-primary big"
              onClick={doPromote}
              disabled={cascading}
              title="Ten of these pieces make one piece of the row above — watch them bubble up (and keep bubbling if a row hits ten)."
            >
              ▲ Promote: ten {placeLabel(rows.length)} pieces → one{" "}
              {placeLabel(rows.length - 1)} in the row above
            </button>
          ) : (
            <button
              className="btn btn-primary big"
              onClick={splitNext}
              disabled={splitDisabled}
              title={splitTitle}
            >
              ＋ Split the next blank {placeLabel(rows.length)} into ten{" "}
              {placeLabel(rows.length + 1)} pieces
            </button>
          )}
          {whole && (
            <span className="note">
              The bar is full — that&apos;s exactly 1 whole. Click it to break it back up, or Clear to build again.
            </span>
          )}
          {bottomFull && !cascading && (
            <span className="note">
              Full row — ten of these equal one piece in the row above.
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button
            className="btn"
            onClick={undo}
            disabled={history.length === 0 || cascading}
          >
            ↩ Undo
          </button>
          <button className="btn btn-danger" onClick={clearAll} disabled={cascading}>
            Clear
          </button>
        </div>

        <hr className="rule" />

        <p className="hint">
          <b>How it works:</b> fill pieces from the left — tap the piece where you
          want the run of filled pieces to end. Each row shows the next decimal
          place: tap{" "}
          <b>Split the next blank…</b> to zoom into the slice right after your
          run and open the next digit (0.1 → 0.01 → 0.001 → … as often as you like —
          rows never shrink). Each level has its own colour (see the dot on each row):
          in a row&apos;s partially-used piece you can see the finer rows&apos;
          colours nested inside, so higher rows show exactly where the extra digits
          came from. Tapping any row edits just that one digit — digits you&apos;ve
          already set below it stay part of the number (change the tenths of 0.43
          to 5 and it becomes 0.53). The dashed 10th piece at a row&apos;s end fills
          that row completely — it stays visible as a full slice (just like{" "}
          <b>1 whole</b> is the full top row). Then tap <b>▲ Promote</b> to bubble
          ten of these up into one piece of the row above. Undo = Ctrl/Cmd+Z.
        </p>
      </section>

      <footer className="note">
        <span>
          Want to show your kid a repeating decimal? Build <b>0.333…</b>: fill 3
          tenths, split, fill 3 hundredths, split, fill 3 thousandths… watch the
          readout get longer while each row shows the same “3 filled, a sliver
          left” pattern. Try the <b>0.333…</b> example and the repeat button. For
          <b> 0.999… = 1</b>: fill nine in every row, click the dashed 10th piece
          on the deepest row, then tap <b>▲ Promote</b> — each full row bubbles
          into the next, cascading all the way up into <b>1 whole</b>.
        </span>
      </footer>
    </div>
  );
}
