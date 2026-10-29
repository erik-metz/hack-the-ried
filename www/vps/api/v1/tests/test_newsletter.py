import unittest
from unittest.mock import AsyncMock, MagicMock

from endpoints.newsletter import (
    NewsletterSignup,
    list_subscribers,
    remove_subscriber,
    signup,
)
from fastapi import HTTPException


def database_pool():
    connection = MagicMock()
    connection.__aenter__ = AsyncMock(return_value=connection)
    connection.__aexit__ = AsyncMock(return_value=None)
    connection.execute = AsyncMock()
    connection.fetchall = AsyncMock(return_value=[])
    pool = MagicMock()
    pool.connection.return_value = connection
    return pool, connection


class NewsletterTests(unittest.IsolatedAsyncioTestCase):
    async def test_signup_normalizes_email_and_records_consent_version(self):
        pool, connection = database_pool()
        await signup(NewsletterSignup(email="  Person@Example.org ", consent=True), pool)
        query, params = connection.execute.await_args.args
        self.assertIn("ON CONFLICT (email, category)", query)
        self.assertEqual(params, ("person@example.org", "2026-10-27-v1", "newsletter", None, None, None))

    async def test_workshop_signup_uses_its_own_category_and_consent_version(self):
        pool, connection = database_pool()
        await signup(NewsletterSignup(email="person@example.org", consent=True,
                                       category="sensor-workshop", name="Alex", location="Bürstadt"), pool)
        _, params = connection.execute.await_args.args
        self.assertEqual(params, ("person@example.org", "sensor-workshop-2026-10-29-v1",
                                  "sensor-workshop", "Alex", "Bürstadt", None))

    async def test_signup_requires_consent(self):
        pool, connection = database_pool()
        with self.assertRaises(HTTPException) as error:
            await signup(NewsletterSignup(email="person@example.org", consent=False), pool)
        self.assertEqual(error.exception.status_code, 400)
        connection.execute.assert_not_awaited()

    async def test_invalid_email_is_rejected(self):
        with self.assertRaises(ValueError):
            NewsletterSignup(email="not-an-email", consent=True)

    async def test_admin_list_only_queries_active_entries(self):
        pool, connection = database_pool()
        await list_subscribers("admin", pool)
        query = connection.execute.await_args.args[0]
        self.assertIn("unsubscribed_at IS NULL", query)

    async def test_remove_deletes_the_subscriber_address(self):
        pool, connection = database_pool()
        from endpoints.newsletter import NewsletterRemoval

        await remove_subscriber(NewsletterRemoval(email="Person@Example.org"), "admin", pool)
        query, params = connection.execute.await_args.args
        self.assertIn("DELETE FROM newsletter_subscribers", query)
        self.assertEqual(params, ("person@example.org",))


if __name__ == "__main__":
    unittest.main()
