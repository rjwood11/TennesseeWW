import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSiteChart } from "../api/client";
import type { ChartMeasuredPoint, ChartPredictedPoint, Status } from "../api/types";

interface Props {
  apiBase: string;
  siteId: string | null;
  siteName: string;
}

const SHOW_MODEL_OVERLAY_TOGGLE = false;

const STATUS_COLORS: Record<Status, string> = {
  Safe: "#22c55e",
  Advisory: "#fde047",
  Caution: "#fb923c",
  Warning: "#ef4444",
  NoData: "#9ca3af",
};

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function asDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function niceStep(max: number): number {
  if (max <= 100) return 10;
  if (max <= 250) return 25;
  if (max <= 500) return 50;
  if (max <= 1000) return 100;
  if (max <= 2000) return 200;
  return 500;
}

export default function TimeseriesChart({ apiBase, siteId, siteName }: Props) {
  const [measured, setMeasured] = useState<ChartMeasuredPoint[]>([]);
  const [predicted, setPredicted] = useState<ChartPredictedPoint[]>([]);
  const [thresholds, setThresholds] = useState({ safe: 235, advisory: 350, caution: 750 });
  const [showPredicted, setShowPredicted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string>(() => asDateInput(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return asDateInput(d);
  });
  const initializedRangeForSite = useRef<string | null>(null);

  useEffect(() => {
    if (!siteId) {
      setMeasured([]);
      setPredicted([]);
      initializedRangeForSite.current = null;
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetchSiteChart(apiBase, siteId, {
      days: 5000,
      includePredictions: true,
    })
      .then((data) => {
        if (!alive) return;
        const measuredAll = data.measured ?? [];
        setMeasured(measuredAll);
        setPredicted(data.predicted ?? []);
        setThresholds(data.thresholds ?? { safe: 235, advisory: 350, caution: 750 });

        if (initializedRangeForSite.current !== siteId) {
          initializedRangeForSite.current = siteId;
          if (measuredAll.length > 0) {
            const sorted = [...measuredAll].sort((a, b) => a.sample_date.localeCompare(b.sample_date));
            setStartDate(sorted[0].sample_date);
            setEndDate(sorted[sorted.length - 1].sample_date);
          }
        }
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiBase, siteId]);

  useEffect(() => {
    if (startDate > endDate) {
      setError("Start date must be before or equal to end date.");
    } else if (error === "Start date must be before or equal to end date.") {
      setError(null);
    }
  }, [startDate, endDate, error]);

  const availableRange = useMemo(() => {
    if (measured.length === 0) return null;
    const sorted = [...measured].sort((a, b) => a.sample_date.localeCompare(b.sample_date));
    return { min: sorted[0].sample_date, max: sorted[sorted.length - 1].sample_date };
  }, [measured]);

  const points = useMemo(
    () =>
      measured
        .filter((p) => p.sample_date >= startDate && p.sample_date <= endDate)
        .filter((p) => p.sample_value !== null)
        .map((p) => ({ ...p, sample_value: p.sample_value as number }))
        .sort((a, b) => a.sample_date.localeCompare(b.sample_date)),
    [measured, startDate, endDate]
  );

  const predictedInRange = useMemo(
    () => predicted.filter((p) => p.sample_date >= startDate && p.sample_date <= endDate),
    [predicted, startDate, endDate]
  );

  const predictedByDate = useMemo(() => {
    const byDate = new Map<string, ChartPredictedPoint>();
    for (const p of predictedInRange) byDate.set(p.sample_date, p);
    return byDate;
  }, [predictedInRange]);

  const yMax = useMemo(() => {
    const values = points.map((p) => p.sample_value);
    const predValues = predictedInRange.map((p) => p.pred_ecoli).filter((v): v is number => typeof v === "number");
    const max = Math.max(...values, ...predValues, thresholds.caution);
    return Math.max(800, Math.ceil(max * 1.2));
  }, [points, predictedInRange, thresholds.caution]);

  const yTicks = useMemo(() => {
    const step = niceStep(yMax);
    const ticks: number[] = [];
    for (let value = 0; value <= yMax; value += step) {
      ticks.push(value);
    }
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
    return ticks;
  }, [yMax]);

  const width = 760;
  const height = 320;
  const left = 70;
  const right = 12;
  const top = 20;
  const bottom = 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const x = (index: number): number => {
    if (points.length <= 1) return left + plotWidth / 2;
    return left + (index / (points.length - 1)) * plotWidth;
  };
  const y = (value: number): number => top + ((yMax - value) / yMax) * plotHeight;

  const xTickIndices = useMemo(() => {
    if (points.length === 0) return [];
    const targetTicks = Math.min(8, points.length);
    if (targetTicks <= 1) return [0];
    const stride = Math.max(1, Math.floor((points.length - 1) / (targetTicks - 1)));
    const idx: number[] = [];
    for (let i = 0; i < points.length; i += stride) idx.push(i);
    if (idx[idx.length - 1] !== points.length - 1) idx.push(points.length - 1);
    return Array.from(new Set(idx));
  }, [points]);

  const measuredPath = points.map((point, idx) => `${x(idx)},${y(point.sample_value)}`).join(" ");
  const predictedPath = points
    .map((point, idx) => {
      const pred = predictedByDate.get(point.sample_date);
      return pred && pred.pred_ecoli !== null ? `${x(idx)},${y(pred.pred_ecoli)}` : null;
    })
    .filter((v): v is string => Boolean(v))
    .join(" ");

  return (
    <div className="tnww-timeseries">
      <div className="tnww-timeseries-head">
        <h4>E. coli Through Time: {siteName}</h4>
        {SHOW_MODEL_OVERLAY_TOGGLE && (
          <button type="button" className="tnww-toggle" onClick={() => setShowPredicted((prev) => !prev)}>
            {showPredicted ? "Hide Model Overlay" : "Show Model Overlay"}
          </button>
        )}
      </div>
      <div className="tnww-date-controls">
        <label>
          Start
          <input
            type="date"
            value={startDate}
            min={availableRange?.min}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={availableRange?.max}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      {loading && <div className="tnww-timeseries-empty">Loading chart...</div>}
      {error && <div className="tnww-timeseries-empty">{error}</div>}
      {!loading && !error && points.length === 0 && <div className="tnww-timeseries-empty">No measured sample history for this site.</div>}
      {!loading && !error && points.length > 0 && (
        <>
          <svg className="tnww-timeseries-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`E. coli measurements for ${siteName}`}>
            <line x1={left} y1={y(thresholds.safe)} x2={left + plotWidth} y2={y(thresholds.safe)} className="tnww-threshold-line safe" />
            <line
              x1={left}
              y1={y(thresholds.advisory)}
              x2={left + plotWidth}
              y2={y(thresholds.advisory)}
              className="tnww-threshold-line advisory"
            />
            <line
              x1={left}
              y1={y(thresholds.caution)}
              x2={left + plotWidth}
              y2={y(thresholds.caution)}
              className="tnww-threshold-line caution"
            />
            <text x={left + plotWidth - 4} y={Math.max(top + 11, y(thresholds.safe) - 4)} textAnchor="end" className="tnww-threshold-label safe">
              {`${Math.round(thresholds.safe)} MPN/100 mL`}
            </text>
            <text
              x={left + plotWidth - 4}
              y={Math.max(top + 11, y(thresholds.advisory) - 4)}
              textAnchor="end"
              className="tnww-threshold-label advisory"
            >
              {`${Math.round(thresholds.advisory)} MPN/100 mL`}
            </text>
            <text
              x={left + plotWidth - 4}
              y={Math.max(top + 11, y(thresholds.caution) - 4)}
              textAnchor="end"
              className="tnww-threshold-label caution"
            >
              {`${Math.round(thresholds.caution)} MPN/100 mL`}
            </text>

            <polyline points={measuredPath} className="tnww-trend-line measured" />
            {showPredicted && predictedPath && <polyline points={predictedPath} className="tnww-trend-line predicted" />}

            {points.map((point, idx) => (
              <circle
                key={`${point.sample_date}-measured`}
                cx={x(idx)}
                cy={y(point.sample_value)}
                r="4"
                fill={STATUS_COLORS[point.status]}
                stroke="#ffffff"
                strokeWidth="1.4"
              />
            ))}

            {showPredicted &&
              points.map((point, idx) => {
                const pred = predictedByDate.get(point.sample_date);
                if (!pred || pred.pred_ecoli === null) return null;
                return (
                  <circle
                    key={`${point.sample_date}-pred`}
                    cx={x(idx)}
                    cy={y(pred.pred_ecoli)}
                    r="3.2"
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth="1.6"
                  />
                );
              })}

            <line x1={left} y1={top} x2={left} y2={top + plotHeight} className="tnww-axis-line" />
            <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} className="tnww-axis-line" />

            {yTicks.map((tick) => (
              <g key={`ytick-${tick}`}>
                <line x1={left - 5} y1={y(tick)} x2={left} y2={y(tick)} className="tnww-axis-tick" />
                <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="tnww-axis-text">
                  {Math.round(tick)}
                </text>
              </g>
            ))}

            {xTickIndices.map((idx) => (
              <g key={`xtick-${idx}`}>
                <line x1={x(idx)} y1={top + plotHeight} x2={x(idx)} y2={top + plotHeight + 5} className="tnww-axis-tick" />
                <text x={x(idx)} y={height - 10} textAnchor="middle" className="tnww-axis-text">
                  {formatDate(points[idx].sample_date)}
                </text>
              </g>
            ))}

            <text x={left / 2} y={top + plotHeight / 2} textAnchor="middle" className="tnww-axis-title" transform={`rotate(-90 ${left / 2} ${top + plotHeight / 2})`}>
              E. coli (MPN/100 mL)
            </text>
            <text x={left + plotWidth / 2} y={height - 2} textAnchor="middle" className="tnww-axis-title">
              Date
            </text>
          </svg>
          <div className="tnww-timeseries-legend">
            <span className="measured">Measured</span>
            <span className="predicted">Model Predicted</span>
          </div>
        </>
      )}
      <div className="tnww-timeseries-caption">
        Thresholds in MPN/100 mL. Point colors match status (Safe, Advisory, Caution, Warning).
      </div>
    </div>
  );
}
