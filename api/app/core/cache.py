from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

from app.domain.schemas import ForecastRow


class SqliteCache:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS forecast_latest (
                    site_id TEXT PRIMARY KEY,
                    computed_at TEXT NOT NULL,
                    observed_at_usgs TEXT,
                    drivers_json TEXT NOT NULL,
                    pred_ecoli INTEGER,
                    status TEXT NOT NULL,
                    sample_date TEXT,
                    sample_value REAL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS forecast_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    site_id TEXT NOT NULL,
                    computed_at TEXT NOT NULL,
                    pred_ecoli INTEGER,
                    status TEXT NOT NULL,
                    drivers_json TEXT NOT NULL
                )
                """
            )

    def upsert_latest(self, row: ForecastRow) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO forecast_latest
                    (site_id, computed_at, observed_at_usgs, drivers_json, pred_ecoli, status, sample_date, sample_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(site_id) DO UPDATE SET
                    computed_at=excluded.computed_at,
                    observed_at_usgs=excluded.observed_at_usgs,
                    drivers_json=excluded.drivers_json,
                    pred_ecoli=excluded.pred_ecoli,
                    status=excluded.status,
                    sample_date=excluded.sample_date,
                    sample_value=excluded.sample_value
                """,
                (
                    row.site_id,
                    row.computed_at.isoformat(),
                    row.observed_at_usgs.isoformat() if row.observed_at_usgs else None,
                    json.dumps(row.drivers_json),
                    row.pred_ecoli,
                    row.status,
                    row.sample_date,
                    row.sample_value,
                ),
            )

    def append_history(self, row: ForecastRow) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO forecast_history
                    (site_id, computed_at, pred_ecoli, status, drivers_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    row.site_id,
                    row.computed_at.isoformat(),
                    row.pred_ecoli,
                    row.status,
                    json.dumps(row.drivers_json),
                ),
            )

    def get_latest(self) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute("SELECT * FROM forecast_latest").fetchall()

    def get_history(self, site_id: str, days: int) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                """
                SELECT *
                FROM forecast_history
                WHERE site_id = ?
                  AND computed_at >= datetime('now', ?)
                ORDER BY computed_at DESC
                """,
                (site_id, f"-{int(days)} days"),
            ).fetchall()

    def get_last_computed_at(self) -> datetime | None:
        with self.connect() as conn:
            row = conn.execute("SELECT MAX(computed_at) AS computed_at FROM forecast_latest").fetchone()
            if not row or not row["computed_at"]:
                return None
            return datetime.fromisoformat(row["computed_at"])
