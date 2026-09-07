"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Rows } from "@/lib/decimal";
import { FULL, cellLabel, isWhole, placeLabel } from "@/lib/decimal";

/** One colour per decimal level (row). Blue = tenths, green = hundredths, … */
export const LEVEL_COLORS = [
  "#2563eb", // tenths
  "#059669", // hundredths
  "#d97706", // thousandths
  "#7c3aed", // ten-thousandths
  "#db2777", // hundred-thousandths
  "#0e7490", // millionths
  "#ea580c", // ten-millionths
  "#4f46e5", // hundred-millionths
];

export function levelColor(level: number): string {
  if (level < LEVEL_COLORS.length) return LEVEL_COLORS[level];
  // deeper levels: rotate hue so colours stay distinct
  const hue = (level * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 58% 45%)`;
}

function luminance(color: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return 0.35; // hsl fallback: mid-dark, white text is fine
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A readable text colour to sit on top of a level colour. */
export function textOn(color: string): string {
  return luminance(color) > 0.58 ? "#17203a" : "#ffffff";
}

interface Band {
  x: number;
  w: number;
  color: string;
}

/**
 * Colour of the level that "owns" position w (0…1, relative to the row's
 * window) — the deepest level whose piece covers that spot. Returns null
 * where the bar is empty.
 */
function colorAt(rows: Rows, level: number, w: number): string | null {
  if (isWhole(rows)) return levelColor(0);
  let l = level;
  let x = w;
  while (l < rows.length) {
    const d = rows[l] ?? 0;
    if (d >= 10) return levelColor(l);
    if (l - level > 11) return null; // far beyond pixel resolution
    const relStep = Math.pow(10, -(l - level + 1)); // one piece of level l, relative to this row's window
    const j = Math.floor(x / relStep + 1e-9);
    if (j < 0 || j > 9) return null;
    if (j < d) return levelColor(l); // inside a piece filled at this level
    if (j > d) return null; // beyond the value → empty
    x -= j * relStep; // boundary piece: descend into the finer rows
    l++;
  }
  return null;
}

/**
 * Pixel-exact coloured fill of a row's bar. Each pixel column takes the
 * colour of the deepest level touching its centre, so nothing is skipped and
 * the fill's right edge is exact to ±1 pixel (no zoom needed).
 */
function pixelBands(rows: Rows, level: number, width: number): Band[] {
  const W = Math.floor(width);
  if (W <= 0) return [];
  const colors: Array<string | null> = new Array(W);
  for (let c = 0; c < W; c++) {
    colors[c] = colorAt(rows, level, (c + 0.5) / W);
  }
  const out: Band[] = [];
  let start = 0;
  let cur = colors[0];
  for (let c = 1; c <= W; c++) {
    const col = c < W ? colors[c] : null;
    if (col !== cur) {
      if (cur !== null) out.push({ x: start, w: c - start, color: cur });
      start = c;
      cur = col;
    }
  }
  return out;
}

export interface RowBarProps {
  rows: Rows;
  /** 0-based row index (digit position idx+1) */
  idx: number;
  width: number;
  height?: number;
  cursor?: string;
  /** bump token: when it changes and row matches, the bar pulses (used for carries) */
  flash?: { row: number; token: number } | null;
  onDown: (x: number, isTouch: boolean) => void;
  onMove: (x: number) => void;
  onUp: (isTouch: boolean) => void;
  onCancel: () => void;
}

export default function RowBar({
  rows,
  idx,
  width,
  height = 52,
  cursor = "pointer",
  flash = null,
  onDown,
  onMove,
  onUp,
  onCancel,
}: RowBarProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pressedRef = useRef(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!flash || flash.row !== idx) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [flash, idx]);

  const whole = isWhole(rows);
  const own = rows[idx] ?? 0;
  /** this row is a completed (full) slice — only ever the bottom row */
  const isFullRow = own === FULL && idx === rows.length - 1;
  const cellW = width / 10;
  const ownColor = levelColor(idx);
  const full = isFullRow ? 10 : Math.min(own, 9);
  const labelText = textOn(ownColor);
  const zoneWide = cellW >= 44;

  const bands = useMemo(
    () => pixelBands(rows, idx, width),
    [rows, idx, width]
  );

  const labels = useMemo(() => {
    if (whole || isFullRow || cellW < 44) return [];
    const list: Array<{ x: number; text: string; dark: boolean }> = [];
    for (let s = 0; s < 10; s++) {
      const text = cellLabel(rows, idx, s);
      if (text.length > 14) continue;
      list.push({
        x: s * cellW + cellW / 2,
        text,
        dark: s < full, // fully covered by this row's colour
      });
    }
    return list;
  }, [whole, isFullRow, cellW, rows, idx, full]);

  function xFrom(clientX: number): number | null {
    const el = svgRef.current;
    if (!el || width <= 0) return null;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / width;
    if (!(x >= 0 && x < 1)) return null;
    return x;
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressedRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const x = xFrom(e.clientX);
    if (x !== null) onDown(x, e.pointerType === "touch");
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pressedRef.current) return;
    const x = xFrom(e.clientX);
    if (x !== null) onMove(x);
  }

  function handleUp(e: React.PointerEvent<SVGSVGElement>) {
    pressedRef.current = false;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    onUp(e.pointerType === "touch");
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        display: "block",
        touchAction: "pan-y",
        userSelect: "none",
        cursor,
        background: "#fbfcfd",
      }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => {
        pressedRef.current = false;
        onCancel();
      }}
      aria-label={
        isFullRow
          ? `Row ${idx + 1} is full`
          : `Decimal row ${idx + 1}: ${full} pieces filled`
      }
    >
      <title>
        {isFullRow
          ? `Row ${idx + 1} is full: ten of these pieces make one of the row above. Tap “Promote” to move it up.`
          : `Row ${idx + 1}: click a piece to set this digit (the run fills through it); click the edge of the run to step it back. The dashed 10th piece fills the row completely.`}
      </title>
      {/* coloured fill (own pieces + finer rows' contributions in the tail) */}
      {bands.map((b, i) => (
        <rect key={`b${i}`} x={b.x} y={0} width={b.w} height={height} fill={b.color} />
      ))}
      {/* "fill to full" zone (10th piece) on partial rows */}
      {!whole && !isFullRow && (
        <rect
          x={9 * cellW + 0.75}
          y={0.75}
          width={cellW - 1.5}
          height={height - 1.5}
          fill="none"
          stroke="#8b95a5"
          strokeWidth={1.3}
          strokeDasharray="5 4"
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* cell dividers */}
      {!isFullRow &&
        Array.from({ length: 9 }, (_, i) => (
          <line
            key={`l${i}`}
            x1={(i + 1) * cellW}
            y1={0}
            x2={(i + 1) * cellW}
            y2={height}
            stroke="rgba(148,163,184,0.55)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {/* piece numbers */}
      {labels.map((l, i) => (
        <text
          key={`t${i}`}
          x={l.x}
          y={height - 5}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={l.dark ? labelText : "#8b95a5"}
          pointerEvents="none"
        >
          {l.text}
        </text>
      ))}
      {/* full-slice caption, like "1 whole" on the top row */}
      {isFullRow && width > 160 && (
        <text
          x={width / 2}
          y={height / 2 + 5}
          textAnchor="middle"
          fontSize={17}
          fontWeight={800}
          fill={labelText}
          pointerEvents="none"
        >
          {idx === 0 ? "1 whole" : `one ${placeLabel(idx)}`}
        </text>
      )}
      {/* carry/promote flash */}
      {pulse && (
        <rect
          x={0.5}
          y={0.5}
          width={width - 1}
          height={height - 1}
          className="row-pulse"
          pointerEvents="none"
        />
      )}
      {/* outer border */}
      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        fill="none"
        stroke="#2c3542"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
