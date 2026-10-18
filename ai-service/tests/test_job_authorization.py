import os
import unittest
import ast
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import main


class JobAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"AI_SERVICE_TOKEN": "worker-test-secret"})
        self.environment.start()
        self.queue_patch = patch.object(main, "r")
        self.queue = self.queue_patch.start()
        self.client = TestClient(main.app)
        self.payload = {"assetId": 2, "jobType": "auto_tag"}

    def tearDown(self):
        self.client.close()
        self.queue_patch.stop()
        self.environment.stop()

    def test_missing_and_wrong_credentials_do_not_enqueue(self):
        self.assertEqual(self.client.post("/jobs", json=self.payload).status_code, 401)
        for headers in [{"X-AI-Service-Token": "wrong"}, {"Authorization": "Bearer browser-token"}]:
            self.assertEqual(self.client.post("/jobs", json=self.payload, headers=headers).status_code, 403 if "X-AI-Service-Token" in headers else 401)
        self.queue.lpush.assert_not_called()

    def test_unconfigured_service_fails_closed(self):
        with patch.dict(os.environ, {"AI_SERVICE_TOKEN": ""}):
            self.assertEqual(self.client.post("/jobs", json=self.payload, headers={"X-AI-Service-Token": "worker-test-secret"}).status_code, 503)
        self.queue.lpush.assert_not_called()

    def test_trusted_service_enqueues_once(self):
        result = self.client.post("/jobs", json=self.payload, headers={"X-AI-Service-Token": "worker-test-secret"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["status"], "queued")
        self.queue.lpush.assert_called_once()

    def test_invalid_asset_id_does_not_enqueue(self):
        result = self.client.post("/jobs", json={"assetId": 0, "jobType": "auto_tag"}, headers={"X-AI-Service-Token": "worker-test-secret"})
        self.assertEqual(result.status_code, 422)
        self.queue.lpush.assert_not_called()

    def test_health_remains_available_without_service_credentials(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.queue.lpush.assert_not_called()

    def test_production_worker_connection_has_no_idle_read_deadline(self):
        # Execute the production connection expression without importing and
        # loading the worker's models, or connecting to a real Redis queue.
        source = Path(main.__file__).with_name("worker.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        assignment = next(node for node in tree.body if isinstance(node, ast.Assign)
                          and any(isinstance(target, ast.Name) and target.id == "r" for target in node.targets))
        expression = ast.Expression(assignment.value)
        client = eval(compile(expression, "worker.py", "eval"), {"redis": main.redis})
        self.assertIn("socket_timeout", client.connection_pool.connection_kwargs)
        self.assertIsNone(client.connection_pool.connection_kwargs["socket_timeout"])
        client.close()


if __name__ == "__main__":
    unittest.main()
