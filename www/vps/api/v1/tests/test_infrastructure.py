import sys
import unittest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

if "psycopg_pool" not in sys.modules:
    sys.modules["psycopg_pool"] = MagicMock()
if "psycopg" not in sys.modules:
    sys.modules["psycopg"] = MagicMock()

from endpoints.infrastructure import (
    get_broadband_coverage,
    get_emf_sites,
    get_energy_summary,
    get_ev_charging_stations,
    get_road_conditions,
    get_wifi_hotspots,
)


class InfrastructureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.cursor = MagicMock()
        self.cursor.fetchall = AsyncMock(return_value=[])
        self.cursor.execute = AsyncMock()
        self.cursor.fetchone = AsyncMock(return_value=(False,))
        self.conn = MagicMock()
        self.conn.cursor.return_value.__aenter__.return_value = self.cursor
        self.pool = MagicMock()
        self.pool.connection.return_value.__aenter__.return_value = self.conn

    async def test_get_road_conditions(self):
        now = datetime.now(UTC)
        self.cursor.fetchall.return_value = [
            (
                "rc-bst-mainstr",
                "Mainstraße",
                "gemeindestrasse",
                "Bürstadt",
                "Kernstadt",
                1.8,
                "sehr_gut",
                0,
                "none",
                "asphalt",
                now,
                "zakb_fleet_ai",
                [[49.643, 8.451], [49.646, 8.454]],
            )
        ]

        result = await get_road_conditions(self.pool)
        self.assertEqual(result.summary.total_segments, 1)
        self.assertEqual(result.summary.average_condition_grade, 1.8)
        self.assertEqual(result.summary.good_condition_pct, 100.0)
        self.assertEqual(len(result.segments), 1)
        self.assertEqual(result.segments[0].road_name, "Mainstraße")
        self.assertEqual(result.segments[0].condition_grade, 1.8)

    async def test_get_energy_summary(self):
        self.cursor.fetchall.return_value = [
            (
                "nrg-zakb-huettenfeld-pv",
                "ZAKB Solarpark Hüttenfeld",
                "solar_pv",
                "ZAKB",
                "Lampertheim",
                "Heidenfahrt 1",
                49.5965,
                8.5845,
                3200.0,
                3400.0,
                "2018-06-01",
                "SEE984729104821",
                "Solarpark",
            ),
            (
                "nrg-zakb-buerstadt-biogas",
                "ZAKB Biogasanlage Bürstadt",
                "biogas",
                "ZAKB",
                "Bürstadt",
                "Außerhalb Biogasanlage 1",
                49.6385,
                8.4480,
                1200.0,
                8400.0,
                "2016-11-01",
                "SEE910293847561",
                "Biogasanlage",
            ),
        ]

        result = await get_energy_summary(self.pool)
        self.assertEqual(result.total_installed_capacity_kw, 4400.0)
        self.assertTrue(result.current_total_power_kw > 0)
        self.assertEqual(len(result.facilities), 2)
        self.assertIn("biogas", result.by_type_kw)

    async def test_get_broadband_coverage(self):
        self.cursor.fetchall.return_value = [
            (
                "bb-bst-gewerbe-ost",
                "Bürstadt",
                "Kernstadt",
                "Gewerbegebiet Ost",
                "ftth_fibre",
                1000,
                500,
                "active_available",
                100.0,
                "Deutsche Glasfaser",
                "2024-06-30",
                [[49.644, 8.456], [49.648, 8.465]],
            )
        ]

        result = await get_broadband_coverage(self.pool)
        self.assertEqual(result.total_areas, 1)
        self.assertEqual(result.active_fibre_areas, 1)
        self.assertEqual(result.areas[0].primary_provider, "Deutsche Glasfaser")

    async def test_get_ev_charging_stations(self):
        self.cursor.fetchall.return_value = [
            (
                "ev-bst-bahnhof",
                "DE*PWK*E009182",
                "Pfalzwerke Schnellladepark Bürstadt Bahnhof",
                "Pfalzwerke ecopower",
                "Wilhelminenstraße 2",
                "Bürstadt",
                "Kernstadt",
                49.6453,
                8.4580,
                4,
                150.0,
                True,
                ["CCS", "Type2"],
                True,
                3,
                1,
                "live_ocpi",
            )
        ]

        result = await get_ev_charging_stations(self.pool)
        self.assertEqual(result.total_stations, 1)
        self.assertEqual(result.total_charge_points, 4)
        self.assertEqual(result.available_charge_points, 3)
        self.assertEqual(result.fast_charging_stations, 1)

    async def test_get_wifi_hotspots(self):
        self.cursor.fetchall.return_value = [
            (
                "wifi-bst-marktplatz",
                "Hessen-WLAN Historisches Rathaus & Marktplatz",
                "Hessen-WLAN",
                "Stadt Bürstadt",
                "market_square",
                "Marktplatz 1",
                "Bürstadt",
                49.6414,
                8.4546,
                "outdoor",
                "captive_terms_only",
                100,
                True,
            )
        ]

        result = await get_wifi_hotspots(self.pool)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].ssid, "Hessen-WLAN")
        self.assertEqual(result[0].municipality, "Bürstadt")

    async def test_emf_sites_use_key_lookups_with_core_storage(self):
        self.cursor.fetchone.return_value = {"ready": True}
        await get_emf_sites(self.pool)
        sql = self.cursor.execute.call_args_list[1].args[0]
        self.assertIn("LEFT JOIN measurement_heads h", sql)
        self.assertIn("LEFT JOIN LATERAL", sql)
        self.assertNotIn("latest_readings", sql)

    async def test_get_emf_sites(self):
        meta = {
            "fid": 8812,
            "stob_nr": "200528",
            "stob_date": "1.12.2025",
            "method_stob": "feldtheoretisch",
            "providers": ["Telekom", "Vodafone"],
            "antenna_count": 6,
        }
        self.cursor.fetchall.return_value = [
            (
                "bnetza:emf:8812",
                "Funkanlage STOB 200528",
                meta,
                49.5947,
                8.4683,
                24.5,
                5.2,
                6,
            )
        ]

        result = await get_emf_sites(self.pool)
        self.assertEqual(result.total_sites, 1)
        self.assertEqual(result.providers, {"Telekom": 1, "Vodafone": 1})
        self.assertEqual(len(result.sites), 1)
        site = result.sites[0]
        self.assertEqual(site.id, "bnetza:emf:8812")
        self.assertEqual(site.name, "Funkanlage STOB 200528")
        self.assertEqual(site.fid, 8812)
        self.assertEqual(site.latitude, 49.5947)
        self.assertEqual(site.longitude, 8.4683)
        self.assertEqual(site.max_height_m, 24.5)
        self.assertEqual(site.max_safety_distance_h_m, 5.2)
        self.assertEqual(site.antenna_count, 6)
        # Production connections use psycopg's dict_row factory.
        self.cursor.fetchall.return_value = [dict(zip(
            ("id", "name", "metadata", "latitude", "longitude", "max_height_m", "max_sa_h_m", "antenna_count"),
            (site.id, site.name, meta, 49.5947, 8.4683, 24.5, 5.2, 6),
        ))]
        dict_result = await get_emf_sites(self.pool)
        self.assertEqual(dict_result, result)


if __name__ == "__main__":
    unittest.main()

