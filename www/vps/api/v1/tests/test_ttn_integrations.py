"""HTTP routing and authentication at the shared TTN webhook boundary."""

import copy
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from dependencies import get_db_pool
from endpoints import ttn_integrations
from fastapi import FastAPI, HTTPException


class TtnWebhookTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {
            "TTN_APPLICATION_ID": "test-app",
            "TTN_WEBHOOK_USERNAME": "test-user",
            "TTN_WEBHOOK_PASSWORD": "test-password",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.pool = object()
        app = FastAPI()
        app.include_router(ttn_integrations.router, prefix="/api/v1")
        app.dependency_overrides[get_db_pool] = lambda: self.pool
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)
        self.body = {
            "end_device_ids": {"device_id": "test-device", "application_ids": {"application_id": "test-app"}},
            "uplink_message": {"f_port": 10, "decoded_payload": {}},
        }

    async def post(self, body=None, auth=("test-user", "test-password")):
        return await self.client.post("/api/v1/integrations/ttn/uplink", json=body or self.body, auth=auth)

    async def test_routes_sensor_and_gps_to_separate_storage_handlers(self):
        with patch.object(ttn_integrations.sensor_integrations, "receive_sensor_uplink", new_callable=AsyncMock) as sensor, \
                patch.object(ttn_integrations.gps_tracker, "receive_gps_uplink", new_callable=AsyncMock) as gps:
            sensor.return_value = {"status": "accepted", "kind": "sensor"}
            gps.return_value = {"status": "accepted", "kind": "gps"}
            self.assertEqual((await self.post()).json()["kind"], "sensor")
            sensor.assert_awaited_once()
            gps.assert_not_awaited()
            sensor.reset_mock()
            self.body["uplink_message"]["f_port"] = 44
            self.assertEqual((await self.post()).json()["kind"], "gps")
            gps.assert_awaited_once()
            sensor.assert_not_awaited()
            self.assertIs(gps.await_args.args[2], self.pool)

    async def test_feedback_and_unknown_ports_are_acknowledged_without_storage(self):
        with patch.object(ttn_integrations.sensor_integrations, "receive_sensor_uplink", new_callable=AsyncMock) as sensor, \
                patch.object(ttn_integrations.gps_tracker, "receive_gps_uplink", new_callable=AsyncMock) as gps:
            for port in [0, 42, 43, 99]:
                self.body["uplink_message"]["f_port"] = port
                response = await self.post()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "ignored")
            sensor.assert_not_awaited()
            gps.assert_not_awaited()

    async def test_auth_and_application_allowlist_apply_even_to_feedback(self):
        self.body["uplink_message"]["f_port"] = 42
        self.assertEqual((await self.post(auth=None)).status_code, 401)
        self.assertEqual((await self.post(auth=("test-user", "wrong"))).status_code, 401)
        self.body["end_device_ids"]["application_ids"]["application_id"] = "other-app"
        self.assertEqual((await self.post()).status_code, 403)
        with patch.dict(os.environ, {"TTN_APPLICATION_ID": ""}):
            self.assertEqual((await self.post()).status_code, 503)

    async def test_invalid_envelopes_are_rejected(self):
        for port in [None, True, "44", -1, 256]:
            self.body["uplink_message"]["f_port"] = port
            self.assertEqual((await self.post()).status_code, 422)
        for field in ["end_device_ids", "uplink_message"]:
            body = copy.deepcopy(self.body)
            body[field] = []
            self.assertEqual((await self.post(body)).status_code, 422)

    async def test_known_port_validation_errors_are_not_silently_acknowledged(self):
        # Run the real sensor validator: invalid measurements must not reach SQL.
        self.assertEqual((await self.post()).status_code, 422)
        self.body["uplink_message"]["f_port"] = 44
        with patch.object(ttn_integrations.gps_tracker, "receive_gps_uplink", new_callable=AsyncMock) as gps:
            gps.side_effect = HTTPException(422, "Invalid GPS packet")
            self.assertEqual((await self.post()).status_code, 422)
