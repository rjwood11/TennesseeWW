import { useEffect, useMemo, useState } from "react";
import type { ForecastItem } from "../api/types";

interface Props {
  item: ForecastItem | null;
}

interface FlowPoint {
  timestamp: string;
  flow: number;
}

interface UsgsIvResponse {
  value?: {
    timeSeries?: Array<{
      values?: Array<{
        value?: Array<{
          value?: string;
          dateTime?: string;
        }>;
      }>;
    }>;
  };
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatLatestTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function fetchUsgsFlowHistory(siteNo: string): Promise<FlowPoint[]> {
  const params = new URLSearchParams({
    format: "json",
    sites: siteNo,
    parameterCd: "00060",
    period: "P7D",
    siteStatus: "all",
  });
  const response = await fetch(`https://waterservices.usgs.gov/nwis/iv/?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`USGS flow request failed: ${response.status}`);
  }

  const data = (await response.json()) as UsgsIvResponse;
  const values = data.value?.timeSeries?.flatMap((series) => series.values ?? []) ?? [];
  const points = values.flatMap((entry) => entry.value ?? []);

  return points
    .map((point) => {
      const flow = Number(point.value);
      return point.dateTime && Number.isFinite(flow) ? { timestamp: point.dateTime, flow } : null;
    })
    .filter((point): point is FlowPoint => point !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function FlowHistoryChart({ siteNo, siteName }: { siteNo: string; siteName: string }) {
  const [history, setHistory] = useState<FlowPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchUsgsFlowHistory(siteNo)
      .then((points) => {
        if (!active) return;
        setHistory(points);
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
  }, [siteNo]);

  const chart = useMemo(() => {
    if (history.length === 0) return null;

    const width = 360;
    const height = 180;
    const left = 46;
    const right = 12;
    const top = 14;
    const bottom = 36;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const times = history.map((point) => new Date(point.timestamp).getTime());
    const flows = history.map((point) => point.flow);
    const xMin = times[0];
    const xMax = times[times.length - 1];
    const xSpan = Math.max(1, xMax - xMin);
    const minFlow = Math.min(...flows);
    const maxFlow = Math.max(...flows);
    const padding = Math.max(5, (maxFlow - minFlow) * 0.12);
    const yMin = Math.max(0, minFlow - padding);
    const yMax = maxFlow + padding;
    const ySpan = Math.max(1, yMax - yMin);
    const x = (time: number) => left + ((time - xMin) / xSpan) * plotWidth;
    const y = (flow: number) => top + ((yMax - flow) / ySpan) * plotHeight;
    const linePoints = history.map((point) => `${x(new Date(point.timestamp).getTime())},${y(point.flow)}`).join(" ");
    const latestPoint = history[history.length - 1];
    const latestX = x(new Date(latestPoint.timestamp).getTime());
    const latestY = y(latestPoint.flow);
    const tickValues = Array.from({ length: 4 }, (_, index) => yMin + (index / 3) * ySpan).reverse();
    const startDate = new Date(history[0].timestamp);
    const endDate = new Date(latestPoint.timestamp);
    const dayTicks: string[] = [];
    const tickCursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    while (tickCursor <= endDate) {
      dayTicks.push(new Date(tickCursor).toISOString());
      tickCursor.setDate(tickCursor.getDate() + 1);
    }

    if (dayTicks.length === 0 || dayTicks[dayTicks.length - 1].slice(0, 10) !== endDate.toISOString().slice(0, 10)) {
      dayTicks.push(endDate.toISOString());
    }

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotHeight,
      tickValues,
      linePoints,
      latestPoint,
      latestX,
      latestY,
      x,
      y,
      dayTicks,
    };
  }, [history]);

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
        {chart.dayTicks.map((tick) => {
          const tickTime = new Date(tick).getTime();
          const tickX = chart.x(tickTime);

          return (
            <g key={`flow-x-${tick}`}>
              <line x1={tickX} y1={chart.top} x2={tickX} y2={chart.height - chart.bottom} className="tnww-flow-grid vertical" />
              <text x={tickX} y={chart.height - chart.bottom + 16} textAnchor="middle" className="tnww-flow-axis-text">
                {formatAxisDate(tick)}
              </text>
            </g>
          );
        })}
        <line x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.height - chart.bottom} className="tnww-flow-axis-line" />
        <line
          x1={chart.left}
          y1={chart.height - chart.bottom}
          x2={chart.width - chart.right}
          y2={chart.height - chart.bottom}
          className="tnww-flow-axis-line"
        />
        <polyline points={chart.linePoints} className="tnww-flow-line" />
        <circle cx={chart.latestX} cy={chart.latestY} r="7" className="tnww-flow-latest-halo" />
        <circle cx={chart.latestX} cy={chart.latestY} r="4.5" className="tnww-flow-point latest" />
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
        <span className="tnww-flow-chart-caption-time"> measured {formatLatestTimestamp(chart.latestPoint.timestamp)}</span>
      </div>
    </div>
  );
}

export default function SiteDetailsDrawer({ item }: Props) {
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
      <FlowHistoryChart siteNo={item.gauge.usgs_site_no} siteName={item.site.name} />
    </div>
  );
}
