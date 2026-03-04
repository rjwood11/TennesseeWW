export type Status = "Safe" | "Advisory" | "Caution" | "Warning" | "NoData";

export interface Gauge {
  id: string;
  label: string;
  usgs_site_no: string;
}

export interface Site {
  id: string;
  name: string;
  river: string;
  lat: number;
  lon: number;
  base_gauge_id: string;
  tdec_site_id: string | null;
}

export interface ForecastItem {
  site: Site;
  gauge: Gauge;
  computed_at: string;
  observed_at_usgs: string | null;
  pred_ecoli: number | null;
  status: Status;
  drivers: Record<string, number | string | Record<string, number | null> | null>;
  sample_date: string | null;
  sample_value: number | null;
}

export interface ForecastResponse {
  generated_at: string;
  items: ForecastItem[];
}

export interface TimeseriesItem {
  id: number;
  site_id: string;
  computed_at: string;
  pred_ecoli: number | null;
  status: Status;
  drivers: Record<string, number | string | Record<string, number | null> | null>;
}

export interface TimeseriesResponse {
  site_id: string;
  days: number;
  items: TimeseriesItem[];
}

export interface ChartMeasuredPoint {
  sample_date: string;
  sample_value: number | null;
  status: Status;
}

export interface ChartPredictedPoint {
  sample_date: string;
  pred_ecoli: number | null;
  status: Status;
}

export interface SiteChartResponse {
  site_id: string;
  days: number;
  measured: ChartMeasuredPoint[];
  predicted: ChartPredictedPoint[];
  thresholds: {
    safe: number;
    advisory: number;
    caution: number;
  };
}
