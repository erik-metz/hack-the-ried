"""Real GeoTIFF windows, calibration, pixel statistics and PostgreSQL archive replay."""

import copy
import hashlib
import io
import json
import math
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api/v1"))

import httpx
import numpy as np
from db_support import DatabaseCase
from measurement_migration import install
from psycopg.rows import dict_row, tuple_row
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from satellite import import_satellite, parse_satellite_scenes
from satellite_raster import BANDS, HOST, asset_manifest, read_scene
from satellite_raster_tiles import render_preview, render_tile


def scene():
    feature = {
        "id": "S2B_T32UMV_20261005T102902_L2A",
        "collection": "sentinel-2-c1-l2a",
        "properties": {"datetime": "2026-10-05T10:37:16Z", "eo:cloud_cover": 0},
        "assets": {},
    }
    for key in (*BANDS, "scl"):
        feature["assets"][key] = {
            "href": f"https://{HOST}/sentinel-2-c1-l2a/test/{key}.tif",
            "raster:bands": [
                {
                    "nodata": 0,
                    **({"scale": 0.0001, "offset": -0.1} if key != "scl" else {}),
                }
            ],
        }
    return feature


def fixture(feature=None, ten_meter=False):
    feature = feature or scene()
    files = {}
    # Red values differ between clear pixels: mean of ratios differs from ratio of means.
    base = {"blue": 1500, "green": 1800, "red": 1700, "nir": 5500, "swir16": 2500}
    for key in (*BANDS, "scl"):
        memory = MemoryFile()
        array = np.full(
            (2, 3), base.get(key, 4), dtype="uint16" if key != "scl" else "uint8"
        )
        if key == "scl":
            array = np.array([[4, 3, 5], [6, 11, 4]], dtype="uint8")
        if key == "red":
            array[0, 2] = 3000
            array[1, 2] = 0  # nodata excluded
        resolution = 20
        if ten_meter and key not in ("scl", "swir16"):
            array = np.repeat(np.repeat(array, 2, axis=0), 2, axis=1)
            # Nonuniform subpixels whose mean is the original 20-m value.
            nonzero = array != 0
            array[0::2] = np.where(nonzero[0::2], array[0::2] + 100, 0)
            array[1::2] = np.where(nonzero[1::2], array[1::2] - 100, 0)
            resolution = 10
        with memory.open(
            driver="GTiff",
            width=array.shape[1],
            height=array.shape[0],
            count=1,
            dtype=str(array.dtype),
            crs="EPSG:32632",
            transform=from_origin(455000, 5500000, resolution, resolution),
            nodata=0,
        ) as dst:
            dst.write(array, 1)
        files[feature["assets"][key]["href"]] = memory
    try:
        return read_scene(feature, opener=lambda href: files[href].open())
    finally:
        for memory in files.values():
            memory.close()


def test_real_geotiff_calibration_mask_pixel_ratios_and_pngs():
    stats, body, sha, metadata = fixture()
    assert stats["aoi_pixels"] == 6 and stats["clear_pixels"] == 3
    expected = (2 * ((0.45 - 0.07) / (0.45 + 0.07)) + (0.45 - 0.2) / (0.45 + 0.2)) / 3
    assert abs(stats["indices"]["ndvi"]["mean"] - expected) < 1e-6
    assert stats["indices"]["ndvi"]["valid_pixels"] == 3
    assert metadata["assets"]["red"]["offset"] == -0.1
    assert hashlib.sha256(body).hexdigest() == sha
    with np.load(io.BytesIO(body), allow_pickle=False) as archive:
        assert np.isnan(archive["ndvi"][0, 1]) and np.isnan(archive["ndvi"][1, 2])
    for layer in ("rgb", "ndvi"):
        assert render_preview(body, layer).startswith(b"\x89PNG")
        assert render_tile(body, layer, 0, 0, 0).startswith(b"\x89PNG")


def test_web_mercator_tiles_show_the_actual_crop_only_at_its_location():
    from PIL import Image
    from rasterio.warp import transform

    _, body, _, meta = fixture()
    lon, lat = transform(meta["crs"], "EPSG:4326", [455030], [5499980])
    z = 14
    x = int((lon[0] + 180) / 360 * 2**z)
    y = int((1 - math.asinh(math.tan(math.radians(lat[0]))) / math.pi) / 2 * 2**z)
    ndvi = np.array(Image.open(io.BytesIO(render_tile(body, "ndvi", z, x, y))))
    rgb = np.array(Image.open(io.BytesIO(render_tile(body, "rgb", z, x, y))))
    outside = np.array(Image.open(io.BytesIO(render_tile(body, "ndvi", z, 0, 0))))
    assert (ndvi[:, :, 3] > 0).any()
    assert not (outside[:, :, 3] > 0).any()
    assert not np.array_equal(rgb, ndvi)


def test_ten_meter_bands_are_averaged_onto_native_scl_grid():
    coarse = fixture()[0]
    fine = fixture(ten_meter=True)[0]
    assert fine["aoi_pixels"] == coarse["aoi_pixels"]
    assert (
        abs(fine["indices"]["ndvi"]["mean"] - coarse["indices"]["ndvi"]["mean"]) < 1e-6
    )


def test_strict_assets_and_no_cover_based_or_invalid_time_fallback():
    feature = scene()
    for key, value in [
        ("href", "https://example.org/a.tif"),
        ("raster:bands", [{"nodata": 0}]),
    ]:
        bad = copy.deepcopy(feature)
        bad["assets"]["red"][key] = value
        try:
            asset_manifest(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid asset accepted")
    feature["properties"]["s2:vegetation_percentage"] = 90
    _, scenes, _, _ = parse_satellite_scenes(
        json.dumps({"features": [feature]}).encode()
    )
    assert scenes[0]["ndviMean"] is None and scenes[0]["droughtStressedAreaHa"] is None
    feature["properties"]["datetime"] = "not-a-time"
    assert not parse_satellite_scenes(json.dumps({"features": [feature]}).encode())[1]


class RasterDatabaseTests(DatabaseCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await install(self.conn)

    async def test_import_archive_replay_and_actual_api_tiles_export(self):
        feature = scene()
        body = json.dumps({"features": [feature]}).encode()
        source = {
            "id": "copernicus-sentinel2",
            "url": "https://earth-search.aws.element84.com/v1/search",
            "max_age_seconds": 604800,
        }
        calls = []

        def reader(feat):
            calls.append(feat["id"])
            return fixture(feat)

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=body)
            )
        ) as client:
            with patch("satellite.read_scene", side_effect=reader):
                await import_satellite(self.conn, client, source)
                await import_satellite(self.conn, client, source)
        self.assertEqual(len(calls), 1)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='ndvi_mean'"
            ),
            1,
        )
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM collection_attempts WHERE source_id='copernicus-sentinel2:raster' AND status='success'"
            ),
            1,
        )
        from endpoints.satellite import (
            download_satellite_data,
            get_satellite_scenes,
            get_satellite_tile,
        )

        conn = self.conn

        class Pool:
            @asynccontextmanager
            async def connection(self):
                yield conn

        self.conn.row_factory = dict_row
        data = await get_satellite_scenes(Pool(), limit=20)
        self.assertIsNone(data["scenes"][0]["droughtStressedAreaHa"])
        self.assertAlmostEqual(
            data["scenes"][0]["ndviMean"], fixture()[0]["indices"]["ndvi"]["mean"]
        )
        tile = await get_satellite_tile("latest", 0, 0, 0, Pool(), layer="ndvi")
        self.assertEqual(tile.status_code, 200)
        self.assertTrue(tile.body.startswith(b"\x89PNG"))
        export = await download_satellite_data(
            Pool(), start="2026-10-05", end="2026-10-05", layer="all", format="zip"
        )
        import zipfile

        with zipfile.ZipFile(io.BytesIO(export.body)) as archive:
            self.assertEqual(
                len([n for n in archive.namelist() if n.endswith(".png")]), 2
            )
            self.assertEqual(
                len([n for n in archive.namelist() if n.endswith(".npz")]), 1
            )
            self.assertEqual(
                json.loads(archive.read("manifest.json"))["missing_rasters"], []
            )
        self.conn.row_factory = tuple_row
        feature["assets"]["red"]["file:checksum"] = "provider-correction"
        corrected = json.dumps({"features": [feature]}).encode()
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=corrected)
            )
        ) as client:
            with patch("satellite.read_scene", side_effect=reader):
                await import_satellite(self.conn, client, source)
        self.assertEqual(len(calls), 2)
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id WHERE d.metric='ndvi_mean'"
            ),
            2,
        )
        # A corrupted archive can never be rendered as if the receipt were valid.
        await self.conn.execute(
            "UPDATE collected_file_assets SET body=%s WHERE content_type='application/x-npz'",
            (b"tampered",),
        )
        self.conn.row_factory = dict_row
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as failure:
            await get_satellite_tile("latest", 0, 0, 0, Pool(), layer="ndvi")
        self.assertEqual(failure.exception.status_code, 503)
        self.conn.row_factory = tuple_row

    async def test_failed_new_raster_never_publishes_proxy_or_invented_scene(self):
        feature = scene()
        body = json.dumps({"features": [feature]}).encode()
        source = {
            "id": "copernicus-sentinel2",
            "url": "https://earth-search.aws.element84.com/v1/search",
        }
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=body)
            )
        ) as client:
            with patch("satellite.read_scene", side_effect=OSError("unavailable")):
                await import_satellite(self.conn, client, source)
        data = await self.scalar(
            "SELECT data FROM collected_datasets WHERE dataset='environment/satellite/scenes'"
        )
        self.assertIsNone(data["scenes"][0]["ndviMean"])
        self.assertEqual(
            await self.scalar(
                "SELECT count(*) FROM measurement_definitions WHERE metric='ndvi_mean'"
            ),
            0,
        )
