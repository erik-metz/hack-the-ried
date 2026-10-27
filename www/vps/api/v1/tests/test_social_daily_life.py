import sys
import unittest
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock

if "psycopg_pool" not in sys.modules:
    sys.modules["psycopg_pool"] = MagicMock()
if "psycopg" not in sys.modules:
    sys.modules["psycopg"] = MagicMock()

from importlib.util import find_spec

if "fastapi" not in sys.modules and find_spec("fastapi") is None:
    class MockRouter:
        def get(self, *args, **kwargs):
            return lambda fn: fn
        def post(self, *args, **kwargs):
            return lambda fn: fn
        def patch(self, *args, **kwargs):
            return lambda fn: fn
        def put(self, *args, **kwargs):
            return lambda fn: fn
        def delete(self, *args, **kwargs):
            return lambda fn: fn
    mock_fastapi = MagicMock()
    mock_fastapi.APIRouter = lambda *args, **kwargs: MockRouter()
    mock_fastapi.Depends = lambda x: x
    mock_fastapi.Query = lambda default=None, **kwargs: default
    mock_fastapi.HTTPException = Exception
    mock_fastapi.status = MagicMock()
    sys.modules["fastapi"] = mock_fastapi

if "pydantic" not in sys.modules and find_spec("pydantic") is None:
    class MockBaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def __getattr__(self, name):
            return None
    mock_pydantic = MagicMock()
    mock_pydantic.BaseModel = MockBaseModel
    mock_pydantic.Field = lambda *args, **kwargs: kwargs.get("default", None)
    sys.modules["pydantic"] = mock_pydantic

if "dependencies" not in sys.modules:
    mock_dep = MagicMock()
    mock_dep.get_db_pool = MagicMock()
    mock_dep.verify_admin_key = MagicMock()
    mock_dep.verify_api_key = MagicMock()
    sys.modules["dependencies"] = mock_dep

from endpoints.social_daily_life import (
    get_cultural_events,
    get_regional_facilities,
    get_social_indicators,
    get_social_summary,
    get_waste_statistics,
)


def mock_pool_with_rows(rows_sequence):
    pool = MagicMock()
    conn = AsyncMock()
    cur = AsyncMock()

    cur.fetchall = AsyncMock(side_effect=rows_sequence)
    cur.execute = AsyncMock()

    conn.cursor = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=cur), __aexit__=AsyncMock()))
    pool.connection = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=conn), __aexit__=AsyncMock()))
    return pool, cur


class TestSocialDailyLife(unittest.IsolatedAsyncioTestCase):

    async def test_get_social_indicators(self):
        sample_rows = [
            {
                "id": 1,
                "municipality": "Bürstadt",
                "category": "employment",
                "metric_key": "unemployment_rate",
                "period": "2025",
                "period_date": date(2025, 12, 31),
                "value": 3.8,
                "unit": "%",
                "benchmark_value": 5.2,
                "dimension": "total",
                "source": "Bundesagentur für Arbeit",
                "source_url": None,
            }
        ]
        pool, _ = mock_pool_with_rows([sample_rows])
        res = await get_social_indicators(pool, municipality="Bürstadt", category="employment")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].municipality, "Bürstadt")
        self.assertEqual(res[0].value, 3.8)

    async def test_get_social_summary(self):
        stats_rows = [
            {"municipality": "Bürstadt", "metric_key": "unemployment_rate", "value": 3.7},
            {"municipality": "Bürstadt", "metric_key": "gp_doctors_per_10k", "value": 6.5},
            {"municipality": "Bürstadt", "metric_key": "total_clubs", "value": 72},
            {"municipality": "Lampertheim", "metric_key": "unemployment_rate", "value": 4.5},
            {"municipality": "Lampertheim", "metric_key": "gp_doctors_per_10k", "value": 6.9},
        ]
        waste_rows = [
            {"municipality": "Bürstadt", "recycling_rate_percent": 68.4, "kg_per_capita": 373.9},
            {"municipality": "Lampertheim", "recycling_rate_percent": 67.9, "kg_per_capita": 383.5},
        ]
        pool, _ = mock_pool_with_rows([stats_rows, waste_rows])
        res = await get_social_summary(pool)
        self.assertGreater(len(res), 0)
        buerstadt = next(r for r in res if r.municipality == "Bürstadt")
        self.assertEqual(buerstadt.unemployment_rate, 3.7)
        self.assertEqual(buerstadt.gp_doctors_per_10k, 6.5)
        self.assertEqual(buerstadt.total_clubs_count, 72)
        self.assertEqual(buerstadt.recycling_rate_percent, 68.4)

    async def test_get_waste_statistics(self):
        sample_rows = [
            {
                "id": 10,
                "municipality": "Bürstadt",
                "year": 2025,
                "fraction": "biomuell",
                "weight_tons": 2280.0,
                "kg_per_capita": 134.3,
                "recycling_rate_percent": 99.0,
                "source": "ZAKB",
            }
        ]
        pool, _ = mock_pool_with_rows([sample_rows])
        res = await get_waste_statistics(pool, municipality="Bürstadt", year=2025)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].fraction, "biomuell")
        self.assertEqual(res[0].kg_per_capita, 134.3)

    async def test_get_regional_facilities(self):
        sample_rows = [
            {
                "id": "fac-kamue-kulturzentrum",
                "name": "KAMÜ Kulturzentrum Bürstadt",
                "category": "culture_sports",
                "facility_type": "culture_center",
                "municipality": "Bürstadt",
                "district": "Kernstadt",
                "street_address": "Industriestraße 11",
                "postal_code": "68642",
                "latitude": 49.6457,
                "longitude": 8.4582,
                "phone": "06206 157980",
                "website": "https://kamue.me",
                "description": "Kulturzentrum Bürstadt",
                "opening_hours": {"Di-So": "16:00-22:00"},
                "extra_attributes": {"is_kamue_hub": True},
                "is_active": True,
            }
        ]
        pool, _ = mock_pool_with_rows([sample_rows])
        res = await get_regional_facilities(pool, category="culture_sports")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].id, "fac-kamue-kulturzentrum")
        self.assertEqual(res[0].category, "culture_sports")

    async def test_get_cultural_events(self):
        sample_rows = [
            {
                "id": "evt-kamue-hackathon-info",
                "title": "HackTheRied Hackathon Infoabend",
                "organizer": "KAMÜ Kulturzentrum",
                "venue_id": "fac-kamue-kulturzentrum",
                "venue_name": "KAMÜ Kulturzentrum Bürstadt",
                "municipality": "Bürstadt",
                "start_time": datetime(2026, 10, 15, 18, 30, tzinfo=UTC),
                "end_time": datetime(2026, 10, 15, 21, 30, tzinfo=UTC),
                "category": "workshop",
                "description": "Ried Hackathon Kickoff",
                "ticket_url": "https://kamue.me",
                "event_url": "https://kamue.me",
                "image_url": None,
                "street_address": "Mainstraße 1",
                "postal_code": "68642",
                "status": "scheduled",
                "is_free": True,
                "is_archived": False,
                "source": "kamue_events",
            }
        ]
        pool, _ = mock_pool_with_rows([sample_rows])
        res = await get_cultural_events(pool, municipality="Bürstadt")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].title, "HackTheRied Hackathon Infoabend")
        self.assertTrue(res[0].is_free)
        self.assertEqual(res[0].status, "scheduled")
        self.assertEqual(res[0].street_address, "Mainstraße 1")

    async def test_get_cultural_events_search_and_past(self):
        sample_rows = [
            {
                "id": "evt-bst-kerwe-2026",
                "title": "Bürstädter Kerwe",
                "organizer": "Stadt Bürstadt",
                "venue_id": None,
                "venue_name": "Marktplatz",
                "municipality": "Bürstadt",
                "start_time": datetime(2026, 10, 2, 17, 0, tzinfo=UTC),
                "end_time": datetime(2026, 10, 5, 23, 0, tzinfo=UTC),
                "category": "festival",
                "description": "Traditionelle Kerwe",
                "ticket_url": "https://www.buerstadt.de",
                "event_url": "https://www.buerstadt.de",
                "image_url": None,
                "street_address": "Rathausstraße 2",
                "postal_code": "68642",
                "status": "scheduled",
                "is_free": True,
                "is_archived": False,
                "source": "stadt_buerstadt",
            }
        ]
        pool, cur = mock_pool_with_rows([sample_rows])
        res = await get_cultural_events(pool, search="Kerwe", include_past=True)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].category, "festival")
        # Ensure query contains search parameters
        executed_query = cur.execute.call_args[0][0]
        self.assertIn("title ILIKE %s", executed_query)

    async def test_submit_cultural_event(self):
        from endpoints.social_daily_life import (
            CulturalEventCreate,
            submit_cultural_event,
        )
        payload = CulturalEventCreate(
            title="Freiwillige Feuerwehr Bürstadt Tag der offenen Tür",
            organizer="Freiwillige Feuerwehr Bürstadt",
            municipality="Bürstadt",
            venue_name="Feuerwehrgerätehaus Bürstadt",
            start_time=datetime(2026, 10, 25, 11, 0, tzinfo=UTC),
            end_time=datetime(2026, 10, 25, 18, 0, tzinfo=UTC),
            category="civic",
            description="Schauübungen, Fahrzeugausstellung und Bewirtung.",
            street_address="Röntgenstraße 1",
            postal_code="68642",
            latitude=49.642,
            longitude=8.455,
            is_free=True,
            expected_visitors=800,
        )
        returned_row = {
            "id": "user-12345678-feuerwehr-tag",
            "title": payload.title,
            "organizer": payload.organizer,
            "venue_id": None,
            "venue_name": payload.venue_name,
            "municipality": payload.municipality,
            "start_time": payload.start_time,
            "end_time": payload.end_time,
            "category": payload.category,
            "description": payload.description,
            "ticket_url": None,
            "event_url": None,
            "image_url": None,
            "street_address": payload.street_address,
            "postal_code": payload.postal_code,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "status": "scheduled",
            "is_free": True,
            "is_archived": False,
            "expected_visitors": 800,
            "source": "user_submission",
        }
        pool = MagicMock()
        conn = AsyncMock()
        cur = AsyncMock()
        cur.fetchone = AsyncMock(return_value=returned_row)
        conn.cursor = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=cur), __aexit__=AsyncMock()))
        pool.connection = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=conn), __aexit__=AsyncMock()))

        result = await submit_cultural_event(payload, pool)
        self.assertEqual(result.title, payload.title)
        self.assertEqual(result.source, "user_submission")
        self.assertEqual(result.expected_visitors, 800)


if __name__ == "__main__":
    unittest.main()
