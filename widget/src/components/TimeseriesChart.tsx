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
  Safe: "#39ff14",
  Advisory: "#f6c445",
  Caution: "#ff7a00",
  Warning: "#ff073a",
  NoData: "#9ca3af",
};

function asDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMonthShort(value: Date): string {
  return value.toLocaleDateString(undefined, { month: "short" });
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
  const height = 340;
  const left = 70;
  const right = 20;
  const top = 20;
  const bottom = 88;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const pointDates = useMemo(
    () =>
      points.map((p) => {
        const date = new Date(`${p.sample_date}T12:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
      }),
    [points]
  );

  const xMin = pointDates[0]?.getTime() ?? 0;
  const xMax = pointDates[pointDates.length - 1]?.getTime() ?? 0;
  const xSpan = Math.max(1, xMax - xMin);

  const x = (date: Date): number => {
    if (pointDates.length <= 1) return left + plotWidth / 2;
    return left + ((date.getTime() - xMin) / xSpan) * plotWidth;
  };
  const y = (value: number): number => top + ((yMax - value) / yMax) * plotHeight;

  const monthTicks = useMemo(() => {
    if (pointDates.length === 0) return [];
    const uniqueMonths = new Map<string, Date>();
    for (const d of pointDates) {
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!uniqueMonths.has(key)) uniqueMonths.set(key, new Date(d.getFullYear(), d.getMonth(), 1, 12));
    }
    return Array.from(uniqueMonths.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [pointDates]);

  const monthLabelTicks = useMemo(() => {
    if (monthTicks.length === 0) return [];
    const minSpacingPx = 24;
    const selected: Date[] = [];
    let lastX = -Infinity;

    for (let idx = 0; idx < monthTicks.length; idx += 1) {
      const tick = monthTicks[idx];
      const tickX = x(tick);
      const isLast = idx === monthTicks.length - 1;
      if (selected.length === 0 || tickX - lastX >= minSpacingPx || isLast) {
        selected.push(tick);
        lastX = tickX;
      }
    }

    return selected;
  }, [monthTicks, xMin, xMax, xSpan, plotWidth]);

  const yearTicks = useMemo(() => {
    if (pointDates.length === 0 || !pointDates[0] || !pointDates[pointDates.length - 1]) return [];
    const start = pointDates[0];
    const end = pointDates[pointDates.length - 1];
    const ticks: Array<{ year: number; date: Date }> = [];
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      const jan1 = new Date(year, 0, 1, 12);
      const tickDate = jan1 < start ? new Date(start) : jan1;
      if (tickDate <= end) ticks.push({ year, date: tickDate });
    }
    return ticks;
  }, [pointDates]);

  const measuredSegments = useMemo(() => {
    const segments: string[] = [];
    let currentYear: number | null = null;
    let current: string[] = [];

    for (let idx = 0; idx < points.length; idx += 1) {
      const point = points[idx];
      const d = pointDates[idx];
      if (!d) continue;
      const year = d.getFullYear();
      const coord = `${x(d)},${y(point.sample_value)}`;

      if (currentYear === null || year === currentYear) {
        current.push(coord);
      } else {
        if (current.length >= 2) segments.push(current.join(" "));
        current = [coord];
      }
      currentYear = year;
    }

    if (current.length >= 2) segments.push(current.join(" "));
    return segments;
  }, [points, pointDates, xMin, xMax, xSpan, yMax]);

  const predictedSegments = useMemo(() => {
    const segments: string[] = [];
    let currentYear: number | null = null;
    let current: string[] = [];

    for (let idx = 0; idx < points.length; idx += 1) {
      const point = points[idx];
      const pred = predictedByDate.get(point.sample_date);
      const d = pointDates[idx];

      if (!d || !pred || pred.pred_ecoli === null) {
        if (current.length >= 2) segments.push(current.join(" "));
        current = [];
        currentYear = null;
        continue;
      }

      const year = d.getFullYear();
      const coord = `${x(d)},${y(pred.pred_ecoli)}`;

      if (currentYear === null || year === currentYear) {
        current.push(coord);
      } else {
        if (current.length >= 2) segments.push(current.join(" "));
        current = [coord];
      }
      currentYear = year;
    }

    if (current.length >= 2) segments.push(current.join(" "));
    return segments;
  }, [points, pointDates, predictedByDate, xMin, xMax, xSpan, yMax]);

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

            {measuredSegments.map((segment, index) => (
              <polyline key={`measured-segment-${index}`} points={segment} className="tnww-trend-line measured" />
            ))}
            {showPredicted &&
              predictedSegments.map((segment, index) => (
                <polyline key={`predicted-segment-${index}`} points={segment} className="tnww-trend-line predicted" />
              ))}

            {points.map((point, idx) => (
              <circle
                key={`${point.sample_date}-measured`}
                cx={pointDates[idx] ? x(pointDates[idx]) : left + plotWidth / 2}
                cy={y(point.sample_value)}
                r="4"
                fill={STATUS_COLORS[point.status]}
                stroke="#000000"
                strokeWidth="0.8"
              />
            ))}

            {showPredicted &&
              points.map((point, idx) => {
                const pred = predictedByDate.get(point.sample_date);
                if (!pred || pred.pred_ecoli === null) return null;
                return (
                  <circle
                    key={`${point.sample_date}-pred`}
                    cx={pointDates[idx] ? x(pointDates[idx]) : left + plotWidth / 2}
                    cy={y(pred.pred_ecoli)}
                    r="3.2"
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth="0.8"
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

            {monthTicks.map((tick) => (
              <g key={`xmonth-${tick.toISOString()}`}>
                <line x1={x(tick)} y1={top + plotHeight} x2={x(tick)} y2={top + plotHeight + 3} className="tnww-axis-tick minor" />
              </g>
            ))}

            {monthLabelTicks.map((tick) => (
              <text
                key={`xmonth-label-${tick.toISOString()}`}
                x={x(tick)}
                y={top + plotHeight + 14}
                textAnchor="middle"
                className="tnww-axis-text tnww-axis-month-text"
                transform={`rotate(45 ${x(tick)} ${top + plotHeight + 14})`}
              >
                {formatMonthShort(tick)}
              </text>
            ))}

            {yearTicks.map((tick) => (
              <g key={`xyear-${tick.year}`}>
                <line x1={x(tick.date)} y1={top + plotHeight} x2={x(tick.date)} y2={top + plotHeight + 6} className="tnww-axis-tick" />
                <text
                  x={x(tick.date)}
                  y={top + plotHeight + 30}
                  textAnchor="middle"
                  className="tnww-axis-text tnww-axis-year-text"
                  transform={`rotate(45 ${x(tick.date)} ${top + plotHeight + 30})`}
                >
                  {tick.year}
                </text>
              </g>
            ))}

            <text x={left / 2} y={top + plotHeight / 2} textAnchor="middle" className="tnww-axis-title" transform={`rotate(-90 ${left / 2} ${top + plotHeight / 2})`}>
              E. coli (MPN/100 mL)
            </text>
            <text x={left + plotWidth / 2} y={height - 4} textAnchor="middle" className="tnww-axis-title">
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
