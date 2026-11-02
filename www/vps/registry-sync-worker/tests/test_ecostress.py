"""Temperature calibration, georeferenced masks, bounded downloads and archive replay."""

import io
import json
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api/v1"))

import httpx
import numpy as np
import pytest
from db_support import DatabaseCase
from ecostress import import_ecostress, parse_granules
from ecostress_raster import HOST, LAYERS, asset_url, download_assets, read_crop
from measurement_migration import install
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

GID = "ECOv003_L2T_LSTE_46799_011_32UMA_20261006T131100_01"


def catalog():
    return {"feed": {"entry": [{"id": "G-test-LPCLOUD", "producer_granule_id": GID,
                              "time_start": "2026-10-06T13:11:00.533Z", "updated": "2026-10-07T00:00:00Z",
                              "boxes": ["49.54 8.33 49.75 8.58"],
                              "links": [{"rel": "http://esipfed.org/ns/fedsearch/1.1/data#", "href": f"https://{HOST}/lp-prod-protected/ECO_L2T_LSTE.003/{GID}/{GID}_{key}.tif"} for key in LAYERS]}]}}


def scene():
    return parse_granules(json.dumps(catalog()), datetime(2026, 10, 8, tzinfo=UTC))[0]


def rasters(packed=False, scale=0.02, cloudy=False, mismatch=False):
    values = {"LST": np.array([[300, 310, 320], [290, np.nan, 300]], dtype="float32"),
              "QC": np.full((2, 3), 49152, dtype="uint16"),
              "cloud": np.array([[0, 1, 0], [0, 0, 0]], dtype="uint8"),
              "water": np.array([[0, 0, 1], [0, 0, 0]], dtype="uint8")}
    values["QC"][1, 0] = 49153  # mandatory QA suspect, excluded
    if cloudy:
        values["cloud"][:] = 1
    if packed:
        values["LST"] = (np.nan_to_num(values["LST"]) / 0.02).astype("uint16")
    files = {}
    for key, array in values.items():
        with MemoryFile() as memory:
            with memory.open(driver="GTiff", width=3, height=2, count=1,
                             dtype=str(array.dtype), crs="EPSG:32632",
                             transform=from_origin(455000, 5500000, 140 if mismatch and key == "cloud" else 70, 70),
                             nodata=0 if key == "LST" and packed else None) as dst:
                dst.write(array, 1)
                if key == "LST":
                    dst.units = ("K",)
                    if packed:
                        dst.scales = (scale,)
            files[key] = memory.read()
    return files


def test_native_geotiff_masks_kelvin_and_npz_replay():
    stats, body, _, meta = read_crop(scene(), rasters())
    assert stats["valid_pixels"] == 2 and stats["aoi_pixels"] == 6
    assert abs(stats["mean_celsius"] - 26.85) < 1e-5
    assert meta["resolution_m"] == 70 and meta["calibration"]["scale"] == 1
    with np.load(io.BytesIO(body), allow_pickle=False) as crop:
        assert np.isnan(crop["lst_celsius"][0, 1])
        assert crop["valid"].sum() == 2
        assert json.loads(str(crop["metadata"]))["stats"] == stats
    packed = read_crop(scene(), rasters(packed=True))[0]
    assert packed == stats


def test_fail_closed_on_unknown_calibration_and_grid():
    with pytest.raises(ValueError, match="explicit scale"):
        read_crop(scene(), rasters(packed=True, scale=1))
    with pytest.raises(ValueError, match="grid mismatch"):
        read_crop(scene(), rasters(mismatch=True))
    assert read_crop(scene(), rasters(cloudy=True))[0]["mean_celsius"] is None


def test_catalog_contract_and_asset_host():
    data = catalog()
    assert scene()["tile"] == "32UMA"
    data["feed"]["entry"][0]["time_start"] = "2099-01-01T00:00:00Z"
    with pytest.raises(ValueError, match="acquisition"):
        parse_granules(json.dumps(data))
    with pytest.raises(ValueError, match="asset URL"):
        asset_url(f"https://evil.example/{GID}_LST.tif", GID, "LST")
    missing = catalog()
    missing["feed"]["entry"][0]["links"].pop()
    with pytest.raises(ValueError, match="missing"):
        parse_granules(json.dumps(missing))


@pytest.mark.asyncio
async def test_download_rejects_auth_redirect_and_oversize_without_leaking_token():
    requests = []
    def redirect(request):
        requests.append(request)
        return httpx.Response(302, headers={"location": "https://urs.earthdata.nasa.gov/login"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(redirect)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await download_assets(client, scene(), "test-secret")
    assert len(requests) == 1 and requests[0].url.host == HOST
    assert requests[0].headers["authorization"] == "Bearer test-secret"
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, headers={"content-length": str(33 * 1024 * 1024)}))) as client:
        with pytest.raises(ValueError, match="budget"):
            await download_assets(client, scene(), "test-secret")


class EcostressPersistenceTests(DatabaseCase):
    async def test_metadata_only_then_crop_and_idempotent_reimport(self):
        await install(self.conn)
        source = {"id": "nasa-ecostress", "url": "https://cmr.earthdata.nasa.gov/search/granules.json"}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=catalog()))) as client:
            with patch.dict("os.environ", {"ECOSTRESS_RASTER_ENABLED": "false", "EARTHDATA_TOKEN": ""}):
                assert await import_ecostress(self.conn, client, source) == "success"
            assert await self.scalar("SELECT count(*) FROM entities WHERE entity_type='ecostress_scene'") == 1
            assert await self.scalar("SELECT count(*) FROM readings") == 0
            async def files(*args):
                return rasters()
            with patch.dict("os.environ", {"ECOSTRESS_RASTER_ENABLED": "true", "EARTHDATA_TOKEN": "test-secret"}), patch("ecostress.download_assets", side_effect=files) as download:
                await import_ecostress(self.conn, client, source)
                await import_ecostress(self.conn, client, source)
                assert download.call_count == 1
            assert await self.scalar("SELECT count(*) FROM collection_attempts WHERE source_id='nasa-ecostress:raster' AND status='success'") == 1
            assert await self.scalar("SELECT count(*) FROM readings") == 1
            archived = await self.scalar("SELECT body FROM collected_file_assets WHERE content_type='application/x-npz'")
            with np.load(io.BytesIO(bytes(archived)), allow_pickle=False) as crop:
                assert crop["valid"].sum() == 2

            from endpoints.satellite import (
                download_ecostress_crop,
                get_ecostress_scenes,
                get_ecostress_tile,
            )
            from fastapi import HTTPException
            from psycopg.rows import dict_row, tuple_row
            conn = self.conn
            class Pool:
                @asynccontextmanager
                async def connection(self):
                    yield conn
            self.conn.row_factory = dict_row
            try:
                data = await get_ecostress_scenes(Pool(), limit=20)
                assert data["scenes"][0]["raster"]["stats"]["valid_pixels"] == 2
                response = await download_ecostress_crop(scene()["id"], Pool())
                assert response.body == bytes(archived)
                tile = await get_ecostress_tile(scene()["id"], 14, 8573, 5581, Pool())
                from PIL import Image
                image = Image.open(io.BytesIO(tile.body))
                assert image.size == (256, 256) and image.mode == "RGBA"
                assert image.getchannel("A").getbbox() is not None
                with pytest.raises(HTTPException) as invalid:
                    await get_ecostress_tile(scene()["id"], 20, 0, 0, Pool())
                assert invalid.value.status_code == 400
                await self.conn.execute("UPDATE collection_attempts SET status='failed' WHERE source_id='nasa-ecostress:raster' AND status='success'")
                with pytest.raises(HTTPException) as failure:
                    await download_ecostress_crop(scene()["id"], Pool())
                assert failure.value.status_code == 503
            finally:
                self.conn.row_factory = tuple_row


def test_cloud_only_temperature_tile_remains_transparent():
    from ecostress_tiles import render_temperature_tile
    from PIL import Image
    body = read_crop(scene(), rasters(cloudy=True))[1]
    image = Image.open(io.BytesIO(render_temperature_tile(body, 14, 8573, 5581)))
    assert image.getchannel("A").getbbox() is None


def test_cmr_dateline_false_positive_is_excluded_before_asset_download():
    data = catalog()
    entry = data["feed"]["entry"][0]
    distant = json.loads(json.dumps(entry))
    distant["producer_granule_id"] = "ECOv003_L2T_LSTE_46790_013_01UBR_20261006T004351_02"
    distant["boxes"] = ["49.4908693 -179.6840982 50.521347 178.8567195"]
    distant["links"] = []
    data["feed"]["entry"].append(distant)
    scenes = parse_granules(json.dumps(data))
    assert len(scenes) == 1 and scenes[0]["tile"] == "32UMA"


@pytest.mark.asyncio
async def test_signed_nasa_redirect_strips_credentials_and_logs(caplog):
    import logging

    from ecostress_raster import DOWNLOAD_HOST
    requests = []
    def serve(request):
        requests.append(request)
        if request.url.host == HOST:
            suffix = request.url.path.removeprefix("/lp-prod-protected/")
            location = f"https://{DOWNLOAD_HOST}/s3-{'a' * 32}/lp-prod-protected.s3.us-west-2.amazonaws.com/{suffix}?Signature=signed-secret"
            return httpx.Response(303, headers={"location": location})
        assert "authorization" not in request.headers and "cookie" not in request.headers
        return httpx.Response(200, content=b"II*\x00test")
    with caplog.at_level(logging.INFO, logger="httpx"):
        async with httpx.AsyncClient(transport=httpx.MockTransport(serve), cookies={"session": "private-cookie"}) as client:
            assert set(await download_assets(client, scene(), "test-secret")) == set(LAYERS)
    assert len(requests) == 8
    assert "signed-secret" not in caplog.text and "test-secret" not in caplog.text
