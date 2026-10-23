import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

spec = importlib.util.spec_from_file_location('chrome_store', Path(__file__).with_name('chrome-store.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def revision(*versions):
    return {'distributionChannels': [{'crxVersion': value} for value in versions]}


class ReleaseTests(unittest.TestCase):
    def test_cancel_matching_pending_review_and_fetch_final_status(self):
        store = Mock()
        final_status = {'submittedItemRevisionStatus': {'state': 'CANCELLED'}}
        store.request.side_effect = [
            {'submittedItemRevisionStatus': {**revision('1.0.1'), 'state': 'PENDING_REVIEW'}},
            {}, final_status,
        ]
        self.assertEqual(release.cancel_review(store, '1.0.1'), final_status)
        self.assertEqual([call.args for call in store.request.call_args_list],
                         [('fetchStatus',), ('cancelSubmission',), ('fetchStatus',)])

    def test_cancel_refuses_absent_review_or_other_states(self):
        for state in (None, 'PUBLISHED', 'STAGED', 'REJECTED', 'CANCELLED'):
            store = Mock()
            store.request.return_value = {'submittedItemRevisionStatus': {**revision('1.0.1'), 'state': state}}
            with self.subTest(state=state), self.assertRaisesRegex(ValueError, 'no pending review'):
                release.cancel_review(store, '1.0.1')
            store.request.assert_called_once_with('fetchStatus')
        store = Mock()
        store.request.return_value = {}
        with self.assertRaises(ValueError):
            release.cancel_review(store, '1.0.1')
        store.request.assert_called_once_with('fetchStatus')

    def test_cancel_refuses_different_or_missing_version(self):
        for channels in ([], [{'crxVersion': '1.0.2'}], [{}],
                         [{'crxVersion': '1.0.1'}, {'crxVersion': '1.0.2'}]):
            store = Mock()
            store.request.return_value = {'submittedItemRevisionStatus': {
                'state': 'PENDING_REVIEW', 'distributionChannels': channels,
            }}
            with self.subTest(channels=channels), self.assertRaises(ValueError):
                release.cancel_review(store, '1.0.1')
            store.request.assert_called_once_with('fetchStatus')

    def test_cancel_validates_input_before_api_access(self):
        store = Mock()
        with self.assertRaises(ValueError):
            release.cancel_review(store, 'not-a-version')
        store.request.assert_not_called()

    def test_cancel_propagates_api_errors_and_does_not_report_pending_as_success(self):
        pending = {'submittedItemRevisionStatus': {**revision('1.0.1'), 'state': 'PENDING_REVIEW'}}
        for responses in ([pending, OSError('API unavailable')], [pending, {}, pending]):
            store = Mock()
            store.request.side_effect = responses
            with self.subTest(responses=responses), self.assertRaises((OSError, ValueError)):
                release.cancel_review(store, '1.0.1')

    def test_cancel_posts_empty_body_and_accepts_empty_response(self):
        with patch.dict(os.environ, {'CWS_PUBLISHER_ID': 'publisher', 'CWS_EXTENSION_ID': 'a' * 32,
                                     'CWS_ACCESS_TOKEN': 'test-token'}):
            store = release.Store()
        for body in (b'', b'{}'):
            with self.subTest(body=body), patch.object(release.urllib.request, 'urlopen') as send:
                send.return_value.__enter__.return_value.read.return_value = body
                self.assertEqual(store.request('cancelSubmission'), {})
                request = send.call_args.args[0]
                self.assertEqual(request.get_method(), 'POST')
                self.assertIsNone(request.data)
                self.assertTrue(request.full_url.endswith(':cancelSubmission'))

    def test_cancel_does_not_claim_success_when_approval_wins_the_race(self):
        store = Mock()
        store.request.side_effect = [
            {'submittedItemRevisionStatus': {**revision('1.0.1'), 'state': 'PENDING_REVIEW'}},
            {}, {'publishedItemRevisionStatus': revision('1.0.1')},
        ]
        with self.assertRaisesRegex(ValueError, 'already published'):
            release.cancel_review(store, '1.0.1')

    def test_cancel_accepts_removed_submission_after_success(self):
        store = Mock()
        final_status = {'publishedItemRevisionStatus': revision('1.0.0')}
        store.request.side_effect = [
            {'submittedItemRevisionStatus': {**revision('1.0.1'), 'state': 'PENDING_REVIEW'}},
            {}, final_status,
        ]
        self.assertEqual(release.cancel_review(store, '1.0.1'), final_status)

    def test_store_uses_v2_endpoints_and_expected_request_methods(self):
        env = {'CWS_PUBLISHER_ID': 'publisher-id', 'CWS_EXTENSION_ID': 'a' * 32,
               'CWS_ACCESS_TOKEN': 'test-token'}
        with patch.dict(os.environ, env):
            store = release.Store()
        for operation, payload, upload, method, prefix in (
            ('fetchStatus', None, False, 'GET', 'v2'),
            ('upload', b'zip', True, 'POST', 'upload/v2'),
            ('publish', b'{}', False, 'POST', 'v2'),
        ):
            with self.subTest(operation=operation), patch.object(release.urllib.request, 'urlopen') as send:
                send.return_value.__enter__.return_value.read.return_value = b'{"ok":true}'
                self.assertEqual(store.request(operation, payload, upload), {'ok': True})
                request = send.call_args.args[0]
                self.assertEqual(request.full_url, f'https://chromewebstore.googleapis.com/{prefix}/{store.item}:{operation}')
                self.assertEqual(request.get_method(), method)
                self.assertEqual(request.get_header('Authorization'), 'Bearer test-token')
                self.assertEqual(request.data, payload)

    def test_unexpected_submission_response_fails(self):
        store = Mock()
        store.request.side_effect = [{}, {'uploadState': 'SUCCEEDED'}, {}]
        with self.assertRaisesRegex(ValueError, 'Unexpected publish response'):
            release.publish(store, b'zip', '1.0.0')

    def test_independent_extension_tag(self):
        release.validate_tag('1.2.3', 'refs/tags/extension-v1.2.3')
        for ref in ('refs/tags/extension-v1.2.4', 'refs/tags/v1.2.3',
                    'refs/tags/crrt-storybook-v1.2.3', 'refs/heads/trunk'):
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                release.validate_tag('1.2.3', ref)

    def test_chrome_numeric_version_rules(self):
        self.assertEqual(release.version_tuple('1.2.3'), release.version_tuple('1.2.3.0'))
        self.assertGreater(release.version_tuple('1.10.0'), release.version_tuple('1.9.9'))
        for value in ('0', '0.0.0', '01.2.3', '1.2.65536', '1.2.3-beta', '1.2.3.4.5', None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                release.version_tuple(value)

    def test_checks_all_store_channels_and_pending_submission(self):
        release.require_new_version('1.10.0', {'publishedItemRevisionStatus': revision('1.9.9')})
        release.require_new_version('1.0.0', {})
        for status in (
            {'publishedItemRevisionStatus': revision('1.0.0')},
            {'publishedItemRevisionStatus': revision('1.0.0.0')},
            {'publishedItemRevisionStatus': revision('0.9', '1.1')},
            {'submittedItemRevisionStatus': revision('1.1')},
            {'publishedItemRevisionStatus': {'state': 'PUBLISHED'}},
            {'publishedItemRevisionStatus': {'distributionChannels': [{}]}},
        ):
            with self.subTest(status=status), self.assertRaises(ValueError):
                release.require_new_version('1.0.0', status)

    def test_duplicate_version_never_uploads(self):
        store = Mock()
        store.request.return_value = {'publishedItemRevisionStatus': revision('1.0.0')}
        with self.assertRaises(ValueError):
            release.publish(store, b'zip', '1.0.0')
        store.request.assert_called_once_with('fetchStatus')

    def test_waits_for_upload_before_submitting(self):
        store = Mock()
        store.request.side_effect = [{}, {'uploadState': 'IN_PROGRESS'},
                                     {'lastAsyncUploadState': 'SUCCEEDED'},
                                     {'name': 'publishers/p/items/i', 'state': 'PENDING_REVIEW'}]
        sleep = Mock()
        result = release.publish(store, b'zip', '1.0.0', sleep)
        self.assertEqual(result['state'], 'PENDING_REVIEW')
        sleep.assert_called_once_with(10)
        calls = store.request.call_args_list
        self.assertEqual([call.args[0] for call in calls], ['fetchStatus', 'upload', 'fetchStatus', 'publish'])
        self.assertEqual(json.loads(calls[-1].args[1]), {'publishType': 'DEFAULT_PUBLISH', 'blockOnWarnings': True})

    def test_failed_or_unknown_upload_never_publishes(self):
        for state in ('FAILED', None, 'NOT_FOUND'):
            store = Mock()
            store.request.side_effect = [{}, {'uploadState': state}]
            with self.subTest(state=state), self.assertRaises(ValueError):
                release.publish(store, b'zip', '1.0.0')
            self.assertEqual(store.request.call_count, 2)

    def test_upload_timeout_never_publishes(self):
        store = Mock()
        store.request.side_effect = [{}, {'uploadState': 'IN_PROGRESS'}] + [
            {'lastAsyncUploadState': 'IN_PROGRESS'}] * 30
        with self.assertRaisesRegex(ValueError, 'timed out'):
            release.publish(store, b'zip', '1.0.0', Mock())
        self.assertNotIn('publish', [call.args[0] for call in store.request.call_args_list])

    def test_api_failure_stops_release(self):
        store = Mock()
        store.request.side_effect = OSError('API unavailable')
        with self.assertRaises(OSError):
            release.publish(store, b'zip', '1.0.0')
        self.assertEqual(store.request.call_count, 1)

    def test_artifact_integrity_and_version(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'crrt-extension-1.0.0-chrome.zip'
            manifest = b'{"version":"1.0.0"}'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('manifest.json', manifest)
            metadata = {'version': '1.0.0', 'commit': 'commit',
                        'zipSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'manifestSha256': hashlib.sha256(manifest).hexdigest()}
            metadata_path = root / 'crrt-extension-1.0.0-release.json'
            metadata_path.write_text(json.dumps(metadata))
            self.assertEqual(release.read_artifact(root, '1.0.0', 'commit'), path.read_bytes())
            for field in ('version', 'commit', 'zipSha256', 'manifestSha256'):
                metadata_path.write_text(json.dumps({**metadata, field: 'wrong'}))
                with self.subTest(field=field), self.assertRaises(ValueError):
                    release.read_artifact(root, '1.0.0', 'commit')


if __name__ == '__main__':
    unittest.main()
