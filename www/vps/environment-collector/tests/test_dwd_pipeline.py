"""DWD fields must survive the full polling boundary and retain real missingness."""
import asyncio
import bz2
import struct
import io
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from config import Settings
from main import poll_cycle
from normalize import (
    NormalizedEnvironment,
    NormalizedForecast,
    NormalizedRadar,
    normalize,
    parse_radolan_rw,
)


def radar_bytes(value, header=None):
    header = header or b'RW071710100001026PR E-01INT  60GP 900x 900'
    grid = bytearray(900 * 900 * 2)
    struct.pack_into('<H', grid, (292 * 900 + 406) * 2, value)
    return header + b'\x03' + grid


def test_radar_missing_flags_are_not_dry_measurements():
    for value in (0x2000, 0x4000, 0x8000):
        assert parse_radolan_rw(radar_bytes(value), 49.6425, 8.4552) is None
    assert parse_radolan_rw(radar_bytes(0), 49.6425, 8.4552).precipitation_mm == 0
    assert parse_radolan_rw(radar_bytes(0x1000 | 25), 49.6425, 8.4552).precipitation_mm == 2.5
    assert parse_radolan_rw(radar_bytes(3000), 49.6425, 8.4552).precipitation_mm == 300


def test_radar_invalid_header_and_compression_do_not_invent_time():
    for data in (b'BZhbroken', b'RWbad\x03', radar_bytes(25, b'RW071710100009926PR E-01GP 900x 900')):
        assert parse_radolan_rw(data, 49.6425, 8.4552) is None
    raw = radar_bytes(25)
    point = parse_radolan_rw(bz2.compress(raw), 49.6425, 8.4552)
    assert point.timestamp == datetime(2026, 10, 7, 17, 10, tzinfo=UTC)
    assert point.precipitation_mm == 2.5


def test_poll_cycle_retains_all_normalized_optional_sources():
    async def run():
        now = datetime(2026, 10, 7, 17, tzinfo=UTC)
        radar = NormalizedRadar('weather-radolan-ried', 2.5, now, 49.6425, 8.4552)
        forecast = NormalizedForecast('dwd-mosmix-10729', now, temperature_c=15)
        environment = NormalizedEnvironment([object()], [object()], [radar], [forecast])
        conn = AsyncMock()
        connection = AsyncMock()
        connection.__aenter__.return_value = conn
        persist = AsyncMock(return_value={'radar_metrics': 1, 'forecast_metrics': 1})
        with patch('main.normalize', return_value=environment), patch('main.psycopg.AsyncConnection.connect', return_value=connection), patch('main.persist_environment_data', persist):
            result = await poll_cycle(None, Settings(db={}), raw={'archived': True})
        assert persist.await_args.kwargs['radar'] == [radar]
        assert persist.await_args.kwargs['forecasts'] == [forecast]
        assert 'dwd_radolan' in result['source_coverage']
        assert 'dwd_mosmix' in result['source_coverage']
    asyncio.run(run())


def test_live_radolan_header_accepts_adjacent_metadata_tokens():
    raw = radar_bytes(0, b'RW071720100001026BY1620153VS 3SW   2.29.1PR E-01INT  60GP 900x 900MF 00000001MS 70<asb,boo> ' )
    result = parse_radolan_rw(bz2.compress(raw), 49.6425, 8.4552)
    assert result.precipitation_mm == 0
    assert result.timestamp == datetime(2026, 10, 7, 17, 20, tzinfo=UTC)


def test_current_odim_hdf5_radolan_composite():
    h5py = __import__("pytest").importorskip("h5py")
    np = __import__("pytest").importorskip("numpy")
    Transformer = __import__("pytest").importorskip("pyproj").Transformer

    lat, lon = 49.6425, 8.4552
    projection = "+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +datum=WGS84 +units=m +no_defs"
    forward = Transformer.from_crs("EPSG:4326", projection, always_xy=True)
    inverse = Transformer.from_crs(projection, "EPSG:4326", always_xy=True)
    x, y = forward.transform(lon, lat)
    ul_lon, ul_lat = inverse.transform(x - 1000, y + 1000)
    stream = io.BytesIO()
    with h5py.File(stream, "w") as radar:
        radar.attrs["Conventions"] = "ODIM_H5/V2_3"
        dataset = radar.create_group("dataset1")
        what = dataset.create_group("what")
        what.attrs["enddate"] = "20261027"
        what.attrs["endtime"] = "170000"
        data = dataset.create_group("data1")
        data.create_dataset("data", data=np.array([[99, 99, 99], [99, 250, 99], [99, 99, 99]], dtype="u2"))
        info = data.create_group("what")
        for key, value in {"quantity": "ACRR", "gain": 0.01, "offset": 0,
                           "nodata": 65535, "undetect": 0}.items():
            info.attrs[key] = value
        where = radar.create_group("where")
        for key, value in {"UL_lat": ul_lat, "UL_lon": ul_lon, "xscale": 1000,
                           "yscale": 1000, "xsize": 3, "ysize": 3,
                           "projdef": projection}.items():
            where.attrs[key] = value
    result = parse_radolan_rw(stream.getvalue(), lat, lon)
    assert result.precipitation_mm == 2.5
    assert result.timestamp == datetime(2026, 10, 27, 17, tzinfo=UTC)


def test_environment_default_url_uses_current_radolan_format():
    with patch.dict("os.environ", {}, clear=True):
        settings = Settings.from_env()
    assert settings.radolan_url.endswith("raa01-rw_10000-latest-dwd---bin.hdf5")


def test_missing_lightning_download_does_not_create_zero_strikes():
    assert normalize({}, Settings(db={})).lightning is None
