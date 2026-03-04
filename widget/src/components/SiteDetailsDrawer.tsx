import type { ForecastItem } from "../api/types";

interface Props {
  item: ForecastItem | null;
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
    </div>
  );
}
