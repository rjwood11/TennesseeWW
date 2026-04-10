import { useEffect, useMemo, useState } from "react";
import { fetchTimeseries } from "../api/client";
import type { ForecastItem, TimeseriesItem } from "../api/types";

interface Props {
  item: ForecastItem | null;
  apiBase: string;
}

interface FlowPoint {
  date: string;
  flow: number;
  computedAt: string;
}

function val(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return Number(v).toFixed(2);
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function flowRating(v: unknown): string {
  if (typeof v !== "string" || !v) return "n/a";
  return v
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatSampleDate(value: string | null): string {
  if (!value) return "n/a";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

function formatSampleValue(value: number | null): string {
  if (value === null || value === undefined) return "n/a";
  return Number(value).toString();
}

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatLatestTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function flowPointsFromTimeseries(items: TimeseriesItem[]): FlowPoint[] {
  const byDate = new Map<string, { flow: number; computedAt: string }>();

  for (const item of items) {
    const flow = asNumber(item.drivers.flow);
    if (flow === null) continue;

    const date = item.computed_at.slice(0, 10);
    const existing = byDate.get(date);
    if (!existing || item.computed_at > existing.computedAt) {
      byDate.set(date, { flow, computedAt: item.computed_at });
    }
  }

  return Array.from(byDate.entries())
    .map(([date, point]) => ({ date, flow: point.flow, computedAt: point.computedAt }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
}

function FlowHistoryChart({ apiBase, siteId, siteName }: { apiBase: string; siteId: string; siteName: string }) {
  const [history, setHistory] = useState<TimeseriesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchTimeseries(apiBase, siteId, 30)
      .then((data) => {
        if (!active) return;
        setHistory(data.items ?? []);
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiBase, siteId]);

  const points = useMemo(() => flowPointsFromTimeseries(history), [history]);

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const width = 360;
    const height = 180;
    const left = 46;
    const right = 12;
    const top = 14;
    const bottom = 36;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const flows = points.map((point) => point.flow);
    const minFlow = Math.min(...flows);
    const maxFlow = Math.max(...flows);
    const padding = Math.max(5, (maxFlow - minFlow) * 0.12);
    const yMin = Math.max(0, minFlow - padding);
    const yMax = maxFlow + padding;
    const ySpan = Math.max(1, yMax - yMin);
    const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (flow: number) => top + ((yMax - flow) / ySpan) * plotHeight;
    const linePoints = points.map((point, index) => `${x(index)},${y(point.flow)}`).join(" ");
    const latestIndex = points.length - 1;
    const latestPoint = points[latestIndex];
    const tickValues = Array.from({ length: 4 }, (_, index) => yMin + (index / 3) * ySpan).reverse();

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      points,
      tickValues,
      linePoints,
      latestIndex,
      latestPoint,
      x,
      y,
    };
  }, [points]);

  if (loading) return <div className="tnww-flow-chart-empty">Loading gage flow...</div>;
  if (error) return <div className="tnww-flow-chart-empty">Flow history unavailable.</div>;
  if (!chart) return <div className="tnww-flow-chart-empty">No recent gage flow history available.</div>;

  return (
    <div className="tnww-flow-chart">
      <h4>USGS Flow, Last 7 Days</h4>
      <svg
        className="tnww-flow-chart-svg"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`USGS gage flow for ${siteName} over the last 7 days`}
      >
        {chart.tickValues.map((tick) => (
          <g key={`flow-y-${tick}`}>
            <line x1={chart.left} y1={chart.y(tick)} x2={chart.width - chart.right} y2={chart.y(tick)} className="tnww-flow-grid" />
            <text x={chart.left - 8} y={chart.y(tick) + 4} textAnchor="end" className="tnww-flow-axis-text">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        <line x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.height - chart.bottom} className="tnww-flow-axis-line" />
        <line
          x1={chart.left}
          y1={chart.height - chart.bottom}
          x2={chart.width - chart.right}
          y2={chart.height - chart.bottom}
          className="tnww-flow-axis-line"
        />
        <polyline points={chart.linePoints} className="tnww-flow-line" />
        {chart.points.map((point, index) => {
          const cx = chart.x(index);
          const cy = chart.y(point.flow);
          const isLatest = index === chart.latestIndex;

          return (
            <g key={`flow-point-${point.date}`}>
              {isLatest ? <circle cx={cx} cy={cy} r="7" className="tnww-flow-latest-halo" /> : null}
              <circle cx={cx} cy={cy} r={isLatest ? "4.5" : "3.2"} className={isLatest ? "tnww-flow-point latest" : "tnww-flow-point"} />
              <text x={cx} y={chart.height - chart.bottom + 16} textAnchor="middle" className="tnww-flow-axis-text">
                {formatAxisDate(point.date)}
              </text>
            </g>
          );
        })}
        <text
          x={18}
          y={chart.top + chart.plotHeight / 2}
          textAnchor="middle"
          className="tnww-flow-axis-title"
          transform={`rotate(-90 18 ${chart.top + chart.plotHeight / 2})`}
        >
          Flow (cfs)
        </text>
        <text x={chart.left + (chart.width - chart.left - chart.right) / 2} y={chart.height - 6} textAnchor="middle" className="tnww-flow-axis-title">
          Date
        </text>
      </svg>
      <div className="tnww-flow-chart-caption">
        Latest flow: {val(chart.latestPoint.flow)} cfs
        <span className="tnww-flow-chart-caption-time"> measured {formatLatestTimestamp(chart.latestPoint.computedAt)}</span>
      </div>
    </div>
  );
}

export default function SiteDetailsDrawer({ item, apiBase }: Props) {
  if (!item) return <div className="tnww-drawer">Select a site for details.</div>;

  return (
    <div className="tnww-drawer">
      <h3>{item.site.name}</h3>
      <p>
        <strong>Status:</strong> {item.status}
      </p>
      <p>
        <strong>
          Predicted <em>E. coli</em>:
        </strong>{" "}
        {item.pred_ecoli ?? "n/a"}
      </p>
      <p>
        <strong>Most Recent Sample:</strong> {formatSampleDate(item.sample_date)}: {formatSampleValue(item.sample_value)} CFUs
      </p>
      <div className="tnww-drivers">
        <h4>Site Details:</h4>
        <p>
          Gage Flow: {val(asNumber(item.drivers.flow))} cfs -{" "}
          <strong>
            <em>{flowRating(item.drivers.flow_rating)}</em>
          </strong>
        </p>
        <p>Gage Height: {val(asNumber(item.drivers.gage))} ft</p>
        <p>Rain (Past 24 Hours): {val(asNumber(item.drivers.rain_1d))} in</p>
      </div>
      <p>
        <a href={`https://waterdata.usgs.gov/monitoring-location/${item.gauge.usgs_site_no}/`} target="_blank" rel="noreferrer">
          View USGS Gauge {item.gauge.usgs_site_no}
        </a>
      </p>
      <FlowHistoryChart apiBase={apiBase} siteId={item.site.id} siteName={item.site.name} />
    </div>
  );
}
