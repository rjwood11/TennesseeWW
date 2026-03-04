import type { ForecastResponse, SiteChartResponse, TimeseriesResponse } from "./types";

function normalizedBase(apiBase: string): string {
  return apiBase.replace(/\/$/, "");
}

function isStaticBase(apiBase: string): boolean {
  const base = normalizedBase(apiBase);
  if (base === "." || base === "" || base.startsWith("./") || base.startsWith("../")) return true;
  if (base.startsWith("/")) return base.endsWith("/static-api");
  try {
    const parsed = new URL(base);
    return parsed.pathname.endsWith("/static-api");
  } catch {
    return false;
  }
}

async function fetchJsonWithFallback<T>(
  preferredUrl: string,
  fallbackUrl: string,
  label: string,
  allowFallback: (status: number) => boolean = (status) => status >= 400
): Promise<T> {
  const preferredRes = await fetch(preferredUrl, { headers: { Accept: "application/json" } });
  if (preferredRes.ok) return (await preferredRes.json()) as T;

  if (!allowFallback(preferredRes.status)) {
    throw new Error(`${label} request failed: ${preferredRes.status}`);
  }

  const fallbackRes = await fetch(fallbackUrl, { headers: { Accept: "application/json" } });
  if (fallbackRes.ok) return (await fallbackRes.json()) as T;
  throw new Error(`${label} request failed: ${preferredRes.status} (fallback ${fallbackRes.status})`);
}

export async function fetchForecast(apiBase: string): Promise<ForecastResponse> {
  const base = normalizedBase(apiBase);
  const staticUrl = `${base}/v1/forecast.json`;
  const dynamicUrl = `${base}/v1/forecast`;
  return isStaticBase(apiBase)
    ? fetchJsonWithFallback<ForecastResponse>(staticUrl, dynamicUrl, "Forecast")
    : fetchJsonWithFallback<ForecastResponse>(dynamicUrl, staticUrl, "Forecast");
}

export async function fetchTimeseries(apiBase: string, siteId: string, days = 14): Promise<TimeseriesResponse> {
  const base = normalizedBase(apiBase);
  const staticUrl = `${base}/v1/timeseries/${siteId}.json`;
  const dynamicUrl = `${base}/v1/timeseries?${new URLSearchParams({ site_id: siteId, days: String(days) }).toString()}`;

  if (isStaticBase(apiBase)) {
    const data = await fetchJsonWithFallback<TimeseriesResponse>(staticUrl, dynamicUrl, "Timeseries");
    return { ...data, items: (data.items ?? []).slice(0, Math.max(1, days)) };
  }

  return fetchJsonWithFallback<TimeseriesResponse>(dynamicUrl, staticUrl, "Timeseries");
}

export async function fetchSiteChart(
  apiBase: string,
  siteId: string,
  options?: { days?: number; includePredictions?: boolean; startDate?: string; endDate?: string }
): Promise<SiteChartResponse> {
  const base = normalizedBase(apiBase);
  const params = new URLSearchParams({
    site_id: siteId,
    days: String(options?.days ?? 5000),
    include_predictions: String(Boolean(options?.includePredictions)),
  });
  if (options?.startDate) params.set("start_date", options.startDate);
  if (options?.endDate) params.set("end_date", options.endDate);

  const staticUrl = `${base}/v1/site-chart/${siteId}.json`;
  const dynamicUrl = `${base}/v1/site-chart?${params.toString()}`;

  if (isStaticBase(apiBase)) {
    const data = await fetchJsonWithFallback<SiteChartResponse>(staticUrl, dynamicUrl, "Site chart");
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

  return fetchJsonWithFallback<SiteChartResponse>(dynamicUrl, staticUrl, "Site chart");
}
