import { useState } from "react";
import { fetchSiteChart } from "../api/client";
import type { ForecastItem } from "../api/types";

interface Props {
  apiBase: string;
  items: ForecastItem[];
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Disclaimer({ apiBase, items }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(): Promise<void> {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const charts = await Promise.all(
        items.map(async (item) => {
          const data = await fetchSiteChart(apiBase, item.site.id, { includePredictions: false });
          return data.measured
            .filter((point) => point.sample_value !== null)
            .map((point) => ({
              date: point.sample_date,
              location: item.site.name,
              ecoliValue: String(point.sample_value),
            }));
        })
      );

      const rows = charts
        .flat()
        .sort((a, b) => a.date.localeCompare(b.date) || a.location.localeCompare(b.location));

      const csv = [
        "Date,Location,E. coli Value",
        ...rows.map((row) => [row.date, row.location, row.ecoliValue].map(csvEscape).join(",")),
      ].join("\r\n");

      const today = new Date().toISOString().slice(0, 10);
      downloadTextFile(`tnww-measured-ecoli-${today}.csv`, csv);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="tnww-disclaimer">
      <span>Conditions are model-based screening guidance and not a substitute for direct sampling.</span>
      <button type="button" className="tnww-disclaimer-action" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? "Preparing CSV..." : "Download Measured E. coli CSV"}
      </button>
      <a className="tnww-disclaimer-action" href="https://github.com/rjwood11/TennesseeWW" target="_blank" rel="noreferrer">
        Methodology
      </a>
      {downloadError ? <div className="tnww-disclaimer-error">CSV download failed: {downloadError}</div> : null}
    </div>
  );
}
