import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { ForecastItem, Status } from "../api/types";

const COLOR_BY_STATUS: Record<Status, string> = {
  Safe: "#39ff14",
  Advisory: "#f6c445",
  Caution: "#ff7a00",
  Warning: "#ff073a",
  NoData: "#9ca3af",
};

interface Props {
  items: ForecastItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FitToSites({ items }: { items: ForecastItem[] }) {
  const map = useMap();
  const bounds = useMemo(
    () => L.latLngBounds(items.map((item) => [item.site.lat, item.site.lon] as [number, number])),
    [items]
  );

  useEffect(() => {
    if (items.length > 0) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });
    }
  }, [bounds, items.length, map]);

  return null;
}

function FocusOnSelected({ items, selectedId }: { items: ForecastItem[]; selectedId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const selected = items.find((item) => item.site.id === selectedId);
    if (!selected) return;
    const currentZoom = map.getZoom();
    const targetZoom = Math.min(11, Math.max(10, currentZoom));
    map.flyTo([selected.site.lat, selected.site.lon], targetZoom, { duration: 0.5 });
  }, [items, map, selectedId]);

  return null;
}

export default function MapView({ items, selectedId, onSelect }: Props) {
  return (
    <MapContainer center={[36.15, -86.8]} zoom={9} className="tnww-map">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      <FitToSites items={items} />
      <FocusOnSelected items={items} selectedId={selectedId} />
      {items.map((item) => (
        <CircleMarker
          key={item.site.id}
          center={[item.site.lat, item.site.lon]}
          radius={selectedId === item.site.id ? 9 : 7}
          pathOptions={{ color: "#000000", weight: 0.7, fillColor: COLOR_BY_STATUS[item.status], fillOpacity: 0.9 }}
          eventHandlers={{ click: () => onSelect(item.site.id) }}
        >
          <Tooltip>{item.site.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
