"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Rows } from "@/lib/decimal";
import { FULL, cellLabel, isWhole, placeLabel } from "@/lib/decimal";

/**
 * One colour per decimal level (row): a rainbow walk around the OKLCH hue
 * wheel, ~17% (61.2°) per level — green, teal, blue, magenta, red, amber —
 * so the 7th level lands just past green again without quite repeating.
 * OKLCH lightness is perceptual, so holding it fixed keeps every level equally
 * bright (no glaring yellow next to a heavy blue).
 */
const HUE_START = 150;
const HUE_STEP = 61.2;
const LIGHTNESS = 0.58;
const CHROMA = 0.16;

const TEXT_DARK = "#17203a";
const TEXT_LIGHT = "#ffffff";

const srgbToLinear = (x: number) =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

function oklchToLinearRgb(L: number, C: number, hueDeg: number): number[] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB hex, lowering chroma (keeping lightness + hue) if out of gamut. */
function oklchToHex(L: number, C: number, hueDeg: number): string {
  const inGamut = (rgb: number[]) => rgb.every((v) => v >= 0 && v <= 1);
  let rgb = oklchToLinearRgb(L, C, hueDeg);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb(L, mid, hueDeg))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearRgb(L, lo, hueDeg);
  }
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

const levelColorCache = new Map<number, string>();

export function levelColor(level: number): string {
  let color = levelColorCache.get(level);
  if (!color) {
    color = oklchToHex(LIGHTNESS, CHROMA, (HUE_START + level * HUE_STEP) % 360);
    levelColorCache.set(level, color);
  }
  return color;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    srgbToLinear(c / 255)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A readable text colour to sit on top of a level colour (higher WCAG contrast wins). */
export function textOn(color: string): string {
  const y = luminance(color);
  const onLight = 1.05 / (y + 0.05);
  const onDark = (y + 0.05) / (luminance(TEXT_DARK) + 0.05);
  return onLight >= onDark ? TEXT_LIGHT : TEXT_DARK;
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
        {whole
          ? "1 whole — click to break it back up: 9 tenths plus a full row of ten hundredths."
          : isFullRow
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
