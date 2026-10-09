"use client";
/**
 * Chart components (Recharts). All values arrive as integer minor units and
 * are formatted with the shared money formatter. Gains use the emerald token,
 * losses the red token; categorical series use a validated fixed-order palette.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateLabel, money, monthLabel } from "@/lib/format";

/** Label formats are passed by name because functions cannot cross the server/client boundary. */
export type LabelFormat = "shortDate" | "month" | "none";
function labeler(f: LabelFormat | undefined): (v: string) => string {
  if (f === "month") return monthLabel;
  if (f === "shortDate") return (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? dateLabel(d, { month: "short", day: "numeric" }) : d);
  return (v) => v;
}

export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const POS = "var(--positive)";
const NEG = "var(--negative)";
const GOLD = "var(--gold)";

type Row = Record<string, string | number | null>;

function TooltipBox({ title, lines }: { title: string; lines: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {lines.map((l) => (
        <p key={l.label} className="flex items-center gap-2 text-fg-muted">
          {l.color ? <span className="inline-block size-2 rounded-full" style={{ background: l.color }} /> : null}
          {l.label}: <span className="num text-fg">{l.value}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: false, fontSize: 11 } as const;

function moneyAxis(currency: string) {
  return { ...axisProps, width: 64, tickFormatter: (v: number) => money(Math.round(v), currency, { compact: true }) };
}

export function ChartFrame({ height = 260, children, label }: { height?: number; children: React.ReactElement; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Cumulative line (profit or balance) with crosshair tooltip. */
export function CumulativeChart({
  data,
  currency,
  valueKey,
  label,
  color = POS,
  height,
  format = "shortDate",
}: {
  data: Row[];
  currency: string;
  valueKey: string;
  label: string;
  color?: string;
  height?: number;
  format?: LabelFormat;
}) {
  const dateFormat = labeler(format);
  const id = `g-${valueKey}`;
  return (
    <ChartFrame height={height} label={label}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={dateFormat} minTickGap={32} />
        <YAxis {...moneyAxis(currency)} />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <Tooltip
          cursor={{ stroke: "var(--border-strong)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={dateFormat(String(payload[0].payload.date))}
                lines={[{ label, value: money(Number(payload[0].value), currency), color }]}
              />
            ) : null
          }
        />
        <Area type="monotone" dataKey={valueKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 4 }} isAnimationActive={false} />
      </AreaChart>
    </ChartFrame>
  );
}

/** Gold balance line for bankroll growth. */
export function BalanceChart(props: { data: Row[]; currency: string; height?: number; format?: LabelFormat }) {
  return <CumulativeChart {...props} valueKey="balance" label="Bankroll" color={GOLD} />;
}

/** Bars coloured by sign (gains emerald, losses red). */
export function SignedBars({
  data,
  currency,
  xKey,
  valueKey,
  label,
  height,
  horizontal = false,
  format = "none",
}: {
  data: Row[];
  currency: string;
  xKey: string;
  valueKey: string;
  label: string;
  height?: number;
  horizontal?: boolean;
  format?: LabelFormat;
}) {
  const xFormat = labeler(format);
  const h = height ?? (horizontal ? Math.max(160, data.length * 34 + 20) : 240);
  return (
    <ChartFrame height={h} label={label}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...moneyAxis(currency)} />
            <YAxis type="category" dataKey={xKey} {...axisProps} width={110} tickFormatter={xFormat} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormat} minTickGap={8} />
            <YAxis {...moneyAxis(currency)} />
          </>
        )}
        <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} stroke="var(--border-strong)" />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={xFormat(String(payload[0].payload[xKey]))} lines={[{ label, value: money(Number(payload[0].value), currency, { signed: true }) }]} />
            ) : null
          }
        />
        <Bar dataKey={valueKey} radius={4} maxBarSize={36} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={Number(d[valueKey]) >= 0 ? POS : NEG} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Neutral magnitude bars (e.g. expense categories, counts). */
export type ValueFormat = "money" | "count" | "pct" | "hours";
function valueFormatter(f: ValueFormat, currency?: string): (v: number) => string {
  if (f === "money") return (v) => money(v, currency ?? "CAD", { compact: true });
  if (f === "pct") return (v) => `${v.toFixed(1)}%`;
  if (f === "hours") return (v) => `${(v / 60).toFixed(1)}h`;
  return (v) => v.toLocaleString("en-CA");
}

export function MagnitudeBars({
  data,
  xKey,
  valueKey,
  label,
  valueFormat,
  currency,
  height,
  color = SERIES[0],
}: {
  data: Row[];
  xKey: string;
  valueKey: string;
  label: string;
  /** Named, because functions cannot be passed from Server Components. */
  valueFormat: ValueFormat;
  currency?: string;
  height?: number;
  color?: string;
}) {
  const format = valueFormatter(valueFormat, currency);
  return (
    <ChartFrame height={height ?? Math.max(160, data.length * 34 + 20)} label={label}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => format(Number(v))} />
        <YAxis type="category" dataKey={xKey} {...axisProps} width={120} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={String(payload[0].payload[xKey])} lines={[{ label, value: format(Number(payload[0].value)) }]} /> : null)} />
        <Bar dataKey={valueKey} fill={color} radius={4} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

/** Histogram with sign-coloured bins. */
export function HistogramChart({ data, currency }: { data: { from: number; to: number; count: number }[]; currency: string }) {
  const rows = data.map((b) => ({ ...b, label: `${money(b.from, currency, { compact: true })} – ${money(b.to, currency, { compact: true })}` }));
  return (
    <ChartFrame height={240} label="Distribution of session results">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="from" {...axisProps} tickFormatter={(v) => money(Number(v), currency, { compact: true })} minTickGap={16} />
        <YAxis {...axisProps} allowDecimals={false} width={32} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={String(payload[0].payload.label)} lines={[{ label: "Results", value: String(payload[0].value) }]} /> : null)} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.to <= 0 ? NEG : POS} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Per-result bars with a rolling-average line overlay (same axis). */
export function ResultsWithAverage({ data, currency, window }: { data: { i: number; date: string; net: number; avg: number | null }[]; currency: string; window: number }) {
  return (
    <ChartFrame height={260} label={`Session results with ${window}-session rolling average`}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="i" {...axisProps} minTickGap={24} />
        <YAxis {...moneyAxis(currency)} />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`#${payload[0].payload.i} · ${payload[0].payload.date}`}
                lines={[
                  { label: "Result", value: money(Number(payload[0].payload.net), currency, { signed: true }) },
                  ...(payload[0].payload.avg !== null ? [{ label: `${window}-session avg`, value: money(Math.round(Number(payload[0].payload.avg)), currency, { signed: true }), color: GOLD }] : []),
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="net" maxBarSize={10} radius={2} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.net >= 0 ? POS : NEG} fillOpacity={0.6} />
          ))}
        </Bar>
        <Line dataKey="avg" stroke={GOLD} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Drawdown (distance below the running peak) as a red area. */
export function DrawdownChart({ data, currency, format = "shortDate" }: { data: { date: string; drawdown: number }[]; currency: string; format?: LabelFormat }) {
  const dateFormat = labeler(format);
  return (
    <ChartFrame height={200} label="Drawdown from peak">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={dateFormat} minTickGap={32} />
        <YAxis {...moneyAxis(currency)} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={dateFormat(String(payload[0].payload.date))} lines={[{ label: "Below peak", value: money(Number(payload[0].value), currency) }]} /> : null)} />
        <Area type="stepAfter" dataKey="drawdown" stroke={NEG} strokeWidth={1.5} fill={NEG} fillOpacity={0.15} isAnimationActive={false} />
      </AreaChart>
    </ChartFrame>
  );
}

/** Monte Carlo fan chart: 5–95% and 25–75% bands with the median. */
export function FanChart({ data, currency }: { data: { session: number; p5: number; p25: number; p50: number; p75: number; p95: number }[]; currency: string }) {
  const rows = data.map((d) => ({ ...d, outer: [d.p5, d.p95], inner: [d.p25, d.p75] }));
  return (
    <ChartFrame height={280} label="Simulated bankroll range">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="session" {...axisProps} minTickGap={24} />
        <YAxis {...moneyAxis(currency)} domain={["auto", "auto"]} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`After ${payload[0].payload.session} sessions (estimate)`}
                lines={[
                  { label: "95th pct", value: money(payload[0].payload.p95, currency) },
                  { label: "Median", value: money(payload[0].payload.p50, currency), color: GOLD },
                  { label: "5th pct", value: money(payload[0].payload.p5, currency) },
                ]}
              />
            ) : null
          }
        />
        <Area dataKey="outer" stroke="none" fill={SERIES[0]} fillOpacity={0.12} isAnimationActive={false} />
        <Area dataKey="inner" stroke="none" fill={SERIES[0]} fillOpacity={0.25} isAnimationActive={false} />
        <Line dataKey="p50" stroke={GOLD} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Two-series grouped bars (e.g. live vs online) by group, with legend. */
export function MiniLine({ data, valueKey, currency }: { data: Row[]; valueKey: string; currency: string }) {
  return (
    <ChartFrame height={160} label="Trend">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => (currency ? money(Number(v), currency, { compact: true }) : String(v))} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={String(payload[0].payload.label)} lines={[{ label: "Value", value: currency ? money(Number(payload[0].value), currency) : String(payload[0].value) }]} /> : null)} />
        <Line dataKey={valueKey} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ChartFrame>
  );
}
