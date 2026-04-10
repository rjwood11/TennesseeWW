import { Fragment, useEffect, useMemo } from "react";
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
    const targetZoom = Math.min(12, currentZoom + 1);
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
      {items.map((item) => {
        const isSelected = selectedId === item.site.id;
        const center: [number, number] = [item.site.lat, item.site.lon];
        const markerStateKey = `${item.site.id}-${isSelected ? "selected" : "default"}`;

        return (
          <Fragment key={markerStateKey}>
            {isSelected ? (
              <CircleMarker
                center={center}
                radius={13}
                className="tnww-site-marker-halo"
                pathOptions={{
                  color: "#ffffff",
                  weight: 1.5,
                  opacity: 0.95,
                  fillColor: COLOR_BY_STATUS[item.status],
                  fillOpacity: 0.22,
                }}
                eventHandlers={{ click: () => onSelect(item.site.id) }}
              />
            ) : null}
            <CircleMarker
              center={center}
              radius={isSelected ? 9.5 : 7}
              className={isSelected ? "tnww-site-marker tnww-site-marker-selected" : "tnww-site-marker"}
              pathOptions={{
                color: isSelected ? "#ffffff" : "#000000",
                weight: isSelected ? 2.4 : 0.7,
                opacity: 1,
                fillColor: COLOR_BY_STATUS[item.status],
                fillOpacity: isSelected ? 1 : 0.9,
              }}
              eventHandlers={{ click: () => onSelect(item.site.id) }}
            >
              <Tooltip>{item.site.name}</Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
