"""Lightweight local AWS Lambda contract tests, with AWS calls mocked (no account needed)."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1] / 'infra' / 'lambda'


def load(name):
    spec = importlib.util.spec_from_file_location(name, BASE / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **kwargs):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[(Bucket, Key)])}


class PipelineContractTests(unittest.TestCase):
    def test_ingest_preserves_real_usgs_shape_in_private_s3(self):
        sample = json.loads((BASE.parents[1] / 'data' / 'usgs-reference.geojson').read_text())
        # A fixture extracted from a public USGS feed (not invented synthetic records).
        fake_s3 = FakeS3()
        fake_boto3 = types.SimpleNamespace(client=lambda name: fake_s3)

        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, _size):
                return json.dumps(sample).encode()

        with patch.dict(sys.modules, {'boto3': fake_boto3}), patch.dict(os.environ, {'DATA_BUCKET': 'test-quakelens-data'}), patch('urllib.request.urlopen', return_value=FakeResponse()):
            result = load('ingest').handler({}, None)
            self.assertEqual(result['statusCode'], 200)
            stored = json.loads(fake_s3.objects[('test-quakelens-data', 'earthquakes/latest.geojson')])
            self.assertEqual(len(stored['features']), 15)
            self.assertIn('quakelensFetchedAt', stored['metadata'])
            read_result = load('read').handler({'routeKey': 'GET /earthquakes'}, None)
            self.assertEqual(read_result['statusCode'], 200)
            self.assertEqual(json.loads(read_result['body'])['type'], 'FeatureCollection')

    def test_bad_usgs_payload_does_not_overwrite_good_data(self):
        fake_s3 = FakeS3()
        fake_boto3 = types.SimpleNamespace(client=lambda name: fake_s3)
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, _): return b'{"features":[]}'
        with patch.dict(sys.modules, {'boto3': fake_boto3}), patch.dict(os.environ, {'DATA_BUCKET': 'test-quakelens-data'}), patch('urllib.request.urlopen', return_value=FakeResponse()):
            with self.assertRaises(ValueError):
                load('ingest').handler({}, None)
        self.assertFalse(fake_s3.objects)


if __name__ == '__main__':
    unittest.main()
