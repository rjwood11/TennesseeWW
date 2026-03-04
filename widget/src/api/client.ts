import type { ForecastResponse, SiteChartResponse, TimeseriesResponse } from "./types";

function normalizedBase(apiBase: string): string {
  return apiBase.replace(/\/$/, "");
}

function isStaticBase(apiBase: string): boolean {
  const base = normalizedBase(apiBase);
  return base === "." || base === "" || base.startsWith("./") || base.startsWith("../");
}

export async function fetchForecast(apiBase: string): Promise<ForecastResponse> {
  const base = normalizedBase(apiBase);
  const url = isStaticBase(apiBase) ? `${base}/v1/forecast.json` : `${base}/v1/forecast`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Forecast request failed: ${res.status}`);
  }
  return (await res.json()) as ForecastResponse;
}

export async function fetchTimeseries(apiBase: string, siteId: string, days = 14): Promise<TimeseriesResponse> {
  const base = normalizedBase(apiBase);
  if (isStaticBase(apiBase)) {
    const res = await fetch(`${base}/v1/timeseries/${siteId}.json`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Timeseries request failed: ${res.status}`);
    }
    const data = (await res.json()) as TimeseriesResponse;
    return { ...data, items: (data.items ?? []).slice(0, Math.max(1, days)) };
  }

  const params = new URLSearchParams({ site_id: siteId, days: String(days) });
  const res = await fetch(`${base}/v1/timeseries?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Timeseries request failed: ${res.status}`);
  }
  return (await res.json()) as TimeseriesResponse;
}

export async function fetchSiteChart(
  apiBase: string,
  siteId: string,
  options?: { days?: number; includePredictions?: boolean; startDate?: string; endDate?: string }
): Promise<SiteChartResponse> {
  const base = normalizedBase(apiBase);
  if (isStaticBase(apiBase)) {
    const res = await fetch(`${base}/v1/site-chart/${siteId}.json`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Site chart request failed: ${res.status}`);
    }
    const data = (await res.json()) as SiteChartResponse;
    const start = options?.startDate;
    const end = options?.endDate;
    const inRange = (d: string): boolean => {
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    };
    return {
      ...data,
      measured: (data.measured ?? []).filter((p) => inRange(p.sample_date)),
      predicted: options?.includePredictions ? (data.predicted ?? []).filter((p) => inRange(p.sample_date)) : [],
    };
  }

  const params = new URLSearchParams({
    site_id: siteId,
    days: String(options?.days ?? 5000),
    include_predictions: String(Boolean(options?.includePredictions)),
  });
  if (options?.startDate) params.set("start_date", options.startDate);
  if (options?.endDate) params.set("end_date", options.endDate);
  const res = await fetch(`${base}/v1/site-chart?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Site chart request failed: ${res.status}`);
  }
  return (await res.json()) as SiteChartResponse;
}
