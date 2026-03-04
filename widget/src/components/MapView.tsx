import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { ForecastItem, Status } from "../api/types";

const COLOR_BY_STATUS: Record<Status, string> = {
  Safe: "#22c55e",
  Advisory: "#fde047",
  Caution: "#fb923c",
  Warning: "#ef4444",
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

export default function MapView({ items, selectedId, onSelect }: Props) {
  return (
    <MapContainer center={[36.15, -86.8]} zoom={9} className="tnww-map">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      <FitToSites items={items} />
      {items.map((item) => (
        <CircleMarker
          key={item.site.id}
          center={[item.site.lat, item.site.lon]}
          radius={selectedId === item.site.id ? 9 : 7}
          pathOptions={{ color: COLOR_BY_STATUS[item.status], fillOpacity: 0.9 }}
          eventHandlers={{ click: () => onSelect(item.site.id) }}
        >
          <Tooltip>{item.site.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
