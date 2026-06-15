from io import BytesIO

import pandas as pd

from app.providers.dropbox_sampling import _load_sampling_df, _normalize_name


def test_normalize_name_handles_blank_values():
    assert _normalize_name(float("nan")) == ""
    assert _normalize_name(None) == ""
    assert _normalize_name("Hwy 70 Boat Launch") == "hwy70boatlaunch"


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
