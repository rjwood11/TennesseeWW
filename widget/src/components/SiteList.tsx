import type { ForecastItem } from "../api/types";

interface Props {
  items: ForecastItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SiteList({ items, selectedId, onSelect }: Props) {
  return (
    <div className="tnww-list">
      {items.map((item) => (
        <button
          key={item.site.id}
          className={`tnww-list-item ${selectedId === item.site.id ? "is-selected" : ""}`}
          onClick={() => onSelect(item.site.id)}
          type="button"
        >
          <div className="tnww-site-name">{item.site.name}</div>
          <div className={`tnww-status tnww-status-${item.status.toLowerCase()}`}>{item.status}</div>
        </button>
      ))}
    </div>
  );
}
