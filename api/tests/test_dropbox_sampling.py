from io import BytesIO

import pandas as pd

from app.domain.schemas import Site
from app.providers.dropbox_sampling import _latest_reported_sample, _load_sampling_df, _matching_sampling_rows, _normalize_name


def _site(site_id: str, name: str, river: str = "Harpeth River") -> Site:
    return Site(
        id=site_id,
        name=name,
        river=river,
        lat=36.0,
        lon=-86.0,
        base_gauge_id="g_test",
    )


def test_normalize_name_handles_blank_values():
    assert _normalize_name(float("nan")) == ""
    assert _normalize_name(None) == ""
    assert _normalize_name("Hwy 70 Boat Launch") == "hwy70boatlaunch"
    assert _normalize_name("Highway 100 Boat Launch") == "hwy100boatlaunch"


def test_load_sampling_df_handles_blank_location_cells():
    buf = BytesIO()
    pd.DataFrame(
        {
            "Date": ["2026-06-16", "2026-06-15"],
            "Location": [float("nan"), "Hwy 70 Boat Launch"],
            "E.coli": [10, ">20"],
        }
    ).to_excel(buf, index=False)

    result = _load_sampling_df(buf.getvalue())

    assert result is not None
    assert result["loc_norm"].tolist() == ["", "hwy70boatlaunch"]
    assert result["sample_value"].tolist() == [10.0, 20.0]


def test_latest_reported_sample_skips_zero_values():
    buf = BytesIO()
    pd.DataFrame(
        {
            "Date": ["2026-06-16", "2026-06-09", "2026-06-02"],
            "Location": ["Hwy 70 Boat Launch", "Hwy 70 Boat Launch", "Hwy 70 Boat Launch"],
            "E.coli": [0, 42, 100],
        }
    ).to_excel(buf, index=False)

    result = _load_sampling_df(buf.getvalue())

    assert result is not None
    assert _latest_reported_sample(result) == {"sample_date": "2026-06-09", "sample_value": 42.0}


def test_latest_reported_sample_returns_none_when_only_zero_or_blank_values():
    buf = BytesIO()
    pd.DataFrame(
        {
            "Date": ["2026-06-16", "2026-06-09"],
            "Location": ["Hwy 70 Boat Launch", "Hwy 70 Boat Launch"],
            "E.coli": [0, ""],
        }
    ).to_excel(buf, index=False)

    result = _load_sampling_df(buf.getvalue())

    assert result is not None
    assert _latest_reported_sample(result) is None


def test_matching_sampling_rows_supports_new_display_names_and_legacy_locations():
    buf = BytesIO()
    pd.DataFrame(
        {
            "Date": ["2026-06-16", "2026-06-15"],
            "Location": ["Highway 100 Boat Launch", "Richland Creek Greenway"],
            "E.coli": [10, 20],
        }
    ).to_excel(buf, index=False)

    result = _load_sampling_df(buf.getvalue())

    assert result is not None
    hwy100 = _site("hwy100", "Harpeth - Hwy 100 Boat Launch")
    richland = _site("richland", "Richland Creek - McCabe Park", river="Richland Creek")
    assert _matching_sampling_rows(result, hwy100)["sample_value"].tolist() == [10.0]
    assert _matching_sampling_rows(result, richland)["sample_value"].tolist() == [20.0]
