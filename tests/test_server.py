import json
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import server


class ExtractionTests(unittest.TestCase):
    def test_invalid_and_large_input(self):
        for data in [{}, {'text': ''}, {'text': 4}, {'text': 'x'*8001}, {'text': '\n'.join(['1 D']*41)}, {'text': '1 D', 'url': 'https://evil.test'}]:
            with self.assertRaises(ValueError): server.parse_input(data)

    def test_model_cannot_hide_missing_or_duplicate_lines(self):
        out = server.validate_model({'rows': [{'line': 1, 'day': 1, 'code': 'D'}, {'line': 1, 'day': 1, 'code': 'N'}]}, ['1 D', '2 N'])
        self.assertEqual(len(out), 2)
        self.assertTrue(all(x['code']=='?' and not x['checked'] for x in out))
        self.assertEqual(out[1]['source'], '2 N')

    def test_dates_must_exist_in_source_and_uncertainty_survives(self):
        out = server.validate_model({'rows': [{'line': 1, 'day': 4, 'code': 'D'}, {'line': 2, 'day': 2, 'code': 'E'}]}, ['1 D', '2일 이브닝?'])
        self.assertEqual(out[0]['day'], 0)
        self.assertEqual(out[1]['code'], '?')

    def test_untrusted_model_strings_never_become_shift_codes(self):
        out = server.validate_model({'rows': [{'line': 1, 'day': 1, 'code': '<script>'}]}, ['1 D'])
        self.assertEqual(out[0]['code'], '?')


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.server.ollama_port = 1
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def request(self, headers=None, data=None, path='/api/extract'):
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as res: return res.status, res.read()
        except urllib.error.HTTPError as res: return res.code, res.read()

    def test_origin_and_dns_rebinding_denied(self):
        payload = b'{"text":"1 D"}'
        for headers in [{'Origin': 'https://evil.test'}, {'Host': 'evil.test'}]:
            headers['Content-Type'] = 'application/json'
            with patch.object(server, 'extract') as model:
                self.assertEqual(self.request(headers, payload)[0], 403)
                model.assert_not_called()

    def test_local_post_only_calls_fixed_model_transport(self):
        with patch.object(server, 'extract', return_value={'rows': []}) as model:
            status, _ = self.request({'Content-Type': 'application/json', 'Origin': self.base}, b'{"text":"1 D"}')
            self.assertEqual(status, 200)
            model.assert_called_once_with(['1 D'], 1)

    def test_no_path_traversal_and_no_non_json_post(self):
        self.assertEqual(self.request(path='/../server.py')[0], 404)
        self.assertEqual(self.request(data=b'text=1D')[0], 415)

    def test_local_model_failure_is_not_a_successful_result(self):
        with patch.object(server, 'extract', side_effect=TimeoutError):
            code, body = self.request({'Content-Type': 'application/json'}, b'{"text":"1 D"}')
            self.assertEqual(code, 503)
            self.assertIn('error', json.loads(body))


if __name__ == '__main__': unittest.main()
