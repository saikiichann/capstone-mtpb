/* ------------------------------------------------------------------
   REPORT CHARTS — drawn on a <canvas> so the same picture can be
   downloaded as a PNG and placed in the report PDF.

   - Day-by-day: grouped bars, Recorded (blue) vs Released (orange).
   - Breakdowns: horizontal bars (one series) with the count at the end.

   Series colors are a validated categorical pair (CVD-safe, ≥3:1 on
   white). Text stays in neutral ink; color only marks the bars.
------------------------------------------------------------------ */
import type { CountRow, DayRow } from "./enforcementReport";

export const CHART_COLORS = { recorded: "#2a78d6", released: "#eb6834" };

const INK = "#111827";
const INK_2 = "#4B5563";
const INK_3 = "#9CA3AF";
const GRID = "#EEF0F3";
const AXIS = "#D1D5DB";
const FONT = '"Inter", "Segoe UI", Arial, sans-serif';

type Heading = { title?: string; subtitle?: string };

/** A hi-DPI canvas sized in CSS pixels. */
const makeCanvas = (width: number, height: number, scale: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  return { canvas, ctx };
};

const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

/** Bar with 4px rounded data-end (top for vertical, right for horizontal). */
const bar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  end: "top" | "right"
) => {
  if (w <= 0 || h <= 0) return;
  const r = Math.min(4, end === "top" ? w / 2 : h / 2, end === "top" ? h : w);
  ctx.beginPath();
  if (end === "top") {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x, y + h);
  }
  ctx.closePath();
  ctx.fill();
};

/** Integer axis ticks: 0, step, 2·step … ≥ max (about 4–5 ticks). */
const niceTicks = (max: number): number[] => {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
};

/** Title + subtitle; returns the y where the plot area may start. */
const drawHeading = (ctx: CanvasRenderingContext2D, heading: Heading, x: number, y: number) => {
  let top = y;
  if (heading.title) {
    ctx.fillStyle = INK;
    ctx.font = font(16, 700);
    ctx.textAlign = "left";
    ctx.fillText(heading.title, x, top + 9);
    top += 24;
  }
  if (heading.subtitle) {
    ctx.fillStyle = INK_2;
    ctx.font = font(12);
    ctx.textAlign = "left";
    ctx.fillText(heading.subtitle, x, top + 7);
    top += 20;
  }
  return top + (heading.title || heading.subtitle ? 8 : 0);
};

const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
};

// ---------------------------------------------------------------------------
// DAY-BY-DAY (grouped vertical bars)
// ---------------------------------------------------------------------------
export const renderDayChart = (
  days: DayRow[],
  opts: Heading & { width?: number; height?: number; scale?: number } = {}
): HTMLCanvasElement => {
  const width = opts.width ?? 960;
  const height = opts.height ?? 360;
  const { canvas, ctx } = makeCanvas(width, height, opts.scale ?? 2);
  const pad = { left: 44, right: 16, bottom: 34 };

  let top = drawHeading(ctx, opts, 16, 14);

  // Legend (always present for two series)
  const legend = [
    { label: "Recorded", color: CHART_COLORS.recorded },
    { label: "Released", color: CHART_COLORS.released },
  ];
  ctx.font = font(12);
  let lx = pad.left;
  legend.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(lx + 5, top + 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK_2;
    ctx.textAlign = "left";
    ctx.fillText(item.label, lx + 15, top + 6);
    lx += 15 + ctx.measureText(item.label).width + 20;
  });
  top += 26;

  const plot = {
    x: pad.left,
    y: top,
    w: width - pad.left - pad.right,
    h: height - top - pad.bottom,
  };
  const max = Math.max(1, ...days.map((d) => Math.max(d.recorded, d.released)));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const yOf = (v: number) => plot.y + plot.h - (v / yMax) * plot.h;

  // Grid + y labels
  ctx.font = font(11);
  ticks.forEach((t) => {
    const y = Math.round(yOf(t)) + 0.5;
    ctx.strokeStyle = t === 0 ? AXIS : GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = INK_3;
    ctx.textAlign = "right";
    ctx.fillText(String(t), plot.x - 8, y);
  });

  // Bars
  const slot = plot.w / Math.max(1, days.length);
  const gap = 2;
  const barW = Math.max(2, Math.min(22, (slot * 0.72 - gap) / 2));
  days.forEach((d, i) => {
    const cx = plot.x + slot * i + slot / 2;
    [
      { v: d.recorded, color: CHART_COLORS.recorded, x: cx - barW - gap / 2 },
      { v: d.released, color: CHART_COLORS.released, x: cx + gap / 2 },
    ].forEach(({ v, color, x }) => {
      if (v <= 0) return;
      ctx.fillStyle = color;
      bar(ctx, x, yOf(v), barW, plot.y + plot.h - yOf(v), "top");
    });
  });

  // X labels — skip some so they never collide
  ctx.font = font(11);
  ctx.fillStyle = INK_2;
  ctx.textAlign = "center";
  const widest = Math.max(...days.map((d) => ctx.measureText(d.label).width), 1);
  const every = Math.max(1, Math.ceil((widest + 12) / slot));
  days.forEach((d, i) => {
    if (i % every !== 0) return;
    ctx.fillText(d.label, plot.x + slot * i + slot / 2, plot.y + plot.h + 16);
  });

  return canvas;
};

// ---------------------------------------------------------------------------
// BREAKDOWN (horizontal bars)
// ---------------------------------------------------------------------------
export const renderBreakdownChart = (
  rows: CountRow[],
  opts: Heading & { width?: number; limit?: number; scale?: number; color?: string } = {}
): HTMLCanvasElement => {
  const width = opts.width ?? 960;
  const shown = rows.slice(0, opts.limit ?? 10);
  const rowH = 34;
  const headingH = (opts.title ? 24 : 0) + (opts.subtitle ? 20 : 0) + (opts.title || opts.subtitle ? 8 : 0);
  const height = 14 + headingH + Math.max(1, shown.length) * rowH + 16;
  const { canvas, ctx } = makeCanvas(width, height, opts.scale ?? 2);

  const top = drawHeading(ctx, opts, 16, 14);

  ctx.font = font(12);
  const labelW = Math.min(
    width * 0.36,
    Math.max(80, ...shown.map((r) => ctx.measureText(r.name).width)) + 12
  );
  const valueW = 70;
  const x0 = 16 + labelW;
  const plotW = width - x0 - valueW - 16;
  const max = Math.max(1, ...shown.map((r) => r.count));

  if (shown.length === 0) {
    ctx.fillStyle = INK_3;
    ctx.textAlign = "left";
    ctx.fillText("No records for this period.", 16, top + rowH / 2);
    return canvas;
  }

  shown.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    ctx.font = font(12);
    ctx.fillStyle = INK;
    ctx.textAlign = "right";
    ctx.fillText(ellipsize(ctx, r.name, labelW - 12), x0 - 10, cy);

    // track + bar
    ctx.fillStyle = "#F1F3F5";
    bar(ctx, x0, cy - 7, plotW, 14, "right");
    ctx.fillStyle = opts.color ?? CHART_COLORS.recorded;
    bar(ctx, x0, cy - 7, Math.max(4, (r.count / max) * plotW), 14, "right");

    ctx.font = font(12, 600);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(String(r.count), x0 + plotW + 10, cy);
    ctx.font = font(11);
    ctx.fillStyle = INK_3;
    ctx.fillText(`${Math.round(r.share * 100)}%`, x0 + plotW + 10 + ctx.measureText(String(r.count)).width + 14, cy);
  });

  return canvas;
};

// ---------------------------------------------------------------------------
// DOWNLOAD
// ---------------------------------------------------------------------------
export const downloadCanvasPng = (canvas: HTMLCanvasElement, filename: string): void => {
  canvas.toBlob((blob) => {
    if (!blob) {
      alert("Couldn't create the chart image. Please try again.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
};

/** "Top locations" → "Top_Locations" for file names. */
export const chartFileName = (chart: string, tag: string): string =>
  `MTPB_${chart.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${tag}.png`;
