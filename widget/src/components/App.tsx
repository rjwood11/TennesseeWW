import { useEffect, useMemo, useState } from "react";
import { fetchForecast } from "../api/client";
import type { ForecastItem, Status } from "../api/types";
import MapView from "./MapView";
import SiteList from "./SiteList";
import SiteDetailsDrawer from "./SiteDetailsDrawer";
import Legend from "./Legend";
import Disclaimer from "./Disclaimer";
import LastUpdated from "./LastUpdated";
import TimeseriesChart from "./TimeseriesChart";

const STATUS_RANK: Record<Status, number> = {
  Warning: 0,
  Caution: 1,
  Advisory: 2,
  Safe: 3,
  NoData: 4,
};

interface Props {
  apiBase: string;
}

export default function App({ apiBase }: Props) {
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>(new Date().toISOString());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchForecast(apiBase)
      .then((data) => {
        setItems(data.items);
        setGeneratedAt(data.generated_at);
        if (data.items.length > 0) setSelectedId(data.items[0].site.id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiBase]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.site.name.localeCompare(b.site.name)),
    [items]
  );

  const selected = sorted.find((x) => x.site.id === selectedId) ?? null;

  return (
    <div className="tnww-widget">
      <div className="tnww-header">
        <h2>Tennessee Water Watch</h2>
        <LastUpdated value={generatedAt} />
      </div>
      {loading && <div className="tnww-loading">Loading latest conditions...</div>}
      {error && <div className="tnww-error">{error}</div>}
      {!loading && !error && (
        <>
          <Legend />
          <div className="tnww-layout">
            <MapView items={sorted} selectedId={selectedId} onSelect={setSelectedId} />
            <SiteList items={sorted} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="tnww-bottom">
            <SiteDetailsDrawer item={selected} />
            <TimeseriesChart apiBase={apiBase} siteId={selectedId} siteName={selected?.site.name ?? "Selected Site"} />
          </div>
          <Disclaimer />
        </>
      )}
    </div>
  );
}
