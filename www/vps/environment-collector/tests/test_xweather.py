import unittest
from datetime import UTC, datetime, timedelta

from xweather import normalize_lightning, validate_response
from source import _xweather_retry_at


class XweatherTests(unittest.TestCase):
    def test_legacy_quota_cooldown_is_based_on_failure_time(self):
        received = datetime(2026, 10, 27, 18, tzinfo=UTC)
        self.assertEqual(_xweather_retry_at('HTTP 429', received), received + timedelta(minutes=15))
        self.assertEqual(_xweather_retry_at('HTTP 429 maxhits', received), received + timedelta(hours=24))

    def test_confirmed_empty_window(self):
        point = normalize_lightning({'success': True, 'error': {'code': 'warn_no_data'}, 'response': []},
                                    '2026-10-08T10:00:00+00:00', 49.6425, 8.4552, 25)
        self.assertEqual((point.strikes_count, point.period_seconds, point.source), (0, 300, 'xweather'))
        self.assertEqual(point.timestamp, datetime(2026, 10, 8, 10, tzinfo=UTC))

    def test_pulses_deduplicated_and_amperes_converted(self):
        row = {'id': 'one', 'loc': {'lat': 49.6425, 'long': 8.4552},
               'ob': {'timestamp': datetime(2026, 10, 8, 9, 59, tzinfo=UTC).timestamp(),
                      'pulse': {'peakamp': -12000}}}
        point = normalize_lightning({'success': True, 'response': [row, row]},
                                    '2026-10-08T10:00:00+00:00', 49.6425, 8.4552, 25)
        self.assertEqual((point.strikes_count, point.peak_current_max_ka), (1, 12))

    def test_denied_malformed_and_truncated_are_not_zero(self):
        for data in ({'success': False}, {'success': True},
                     {'success': True, 'response': [{}]*1000},
                     {'success': True, 'error': {'code': 'access_denied'}, 'response': []}):
            with self.subTest(data_keys=list(data)), self.assertRaises(ValueError):
                validate_response(data)
