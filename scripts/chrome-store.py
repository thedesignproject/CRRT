"""Chrome Web Store v2 releases. Uses only Python's standard library."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile


def version_tuple(value):
    # Chrome accepts 1–4 numeric components, each 0–65535, without leading zeros.
    if not isinstance(value, str) or not re.fullmatch(r'(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}', value):
        raise ValueError(f'Invalid Chrome version: {value!r}')
    parts = tuple(map(int, value.split('.')))
    if max(parts) > 65535 or not any(parts):
        raise ValueError(f'Invalid Chrome version: {value!r}')
    return parts + (0,) * (4 - len(parts))


def validate_tag(version, ref):
    version_tuple(version)
    if ref != f'refs/tags/extension-v{version}':
        raise ValueError(f'Release tag must be extension-v{version}, matching apps/extension/package.json')


def require_new_version(version, status):
    for field in ('publishedItemRevisionStatus', 'submittedItemRevisionStatus'):
        revision = status.get(field)
        if revision:
            channels = revision.get('distributionChannels', [])
            if not channels:
                raise ValueError(f'Store returned {field} without versions; refusing upload')
            for channel in channels:
                previous = channel.get('crxVersion')
                if not previous:
                    raise ValueError(f'Store returned {field} without a version; refusing upload')
                if version_tuple(version) <= version_tuple(previous):
                    raise ValueError(f'Extension {version} must be newer than store version {previous} ({field})')


def read_artifact(root, version, commit):
    path = root / f'crrt-extension-{version}-chrome.zip'
    metadata = json.loads((root / f'crrt-extension-{version}-release.json').read_text())
    payload = path.read_bytes()
    if metadata['version'] != version or metadata['commit'] != commit:
        raise ValueError('Release metadata does not match the tagged version and commit')
    if hashlib.sha256(payload).hexdigest() != metadata['zipSha256']:
        raise ValueError('Release ZIP checksum does not match validated build')
    with zipfile.ZipFile(path) as archive:
        manifest = archive.read('manifest.json')
    if json.loads(manifest)['version'] != version:
        raise ValueError('ZIP manifest version does not match release tag')
    if hashlib.sha256(manifest).hexdigest() != metadata['manifestSha256']:
        raise ValueError('ZIP manifest checksum does not match validated build')
    return payload


class Store:
    def __init__(self):
        publisher = os.environ['CWS_PUBLISHER_ID']
        extension = os.environ['CWS_EXTENSION_ID']
        if not re.fullmatch(r'[a-zA-Z0-9-]+', publisher) or not re.fullmatch(r'[a-p]{32}', extension):
            raise ValueError('Invalid publisher or extension ID')
        self.item = f'publishers/{publisher}/items/{extension}'
        self.token = os.environ['CWS_ACCESS_TOKEN']

    def request(self, operation, payload=None, upload=False):
        prefix = 'upload/v2' if upload else 'v2'
        url = f'https://chromewebstore.googleapis.com/{prefix}/{self.item}:{operation}'
        headers = {'Authorization': f'Bearer {self.token}'}
        if payload is not None:
            headers['Content-Type'] = 'application/zip' if upload else 'application/json'
        method = 'GET' if operation == 'fetchStatus' else 'POST'
        request = urllib.request.Request(url, data=payload, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
            if operation == 'cancelSubmission' and not body.strip():
                return {}
            return json.loads(body)


def cancel_review(store, expected_version):
    expected = version_tuple(expected_version)
    status = store.request('fetchStatus')
    submitted = status.get('submittedItemRevisionStatus') or {}
    if submitted.get('state') != 'PENDING_REVIEW':
        raise ValueError('There is no pending review to cancel; fetch store status before retrying')
    channels = submitted.get('distributionChannels', [])
    if not channels or any(version_tuple(channel.get('crxVersion')) != expected for channel in channels):
        raise ValueError(f'Pending review does not match requested version {expected_version}; refusing cancellation')
    store.request('cancelSubmission')
    status = store.request('fetchStatus')
    submitted = status.get('submittedItemRevisionStatus') or {}
    if submitted and submitted.get('state') != 'CANCELLED':
        raise ValueError('Cancellation requested but not confirmed; check store status before retrying')
    published = status.get('publishedItemRevisionStatus') or {}
    if any(version_tuple(channel.get('crxVersion')) == expected
           for channel in published.get('distributionChannels', [])):
        raise ValueError('Requested version is already published; cancellation cannot undo publication')
    return status


def publish(store, payload, version, sleep=time.sleep):
    # Recheck inside the serialized publishing job, immediately before upload.
    require_new_version(version, store.request('fetchStatus'))
    result = store.request('upload', payload, upload=True)
    state = result.get('uploadState')
    for _ in range(30):
        if state == 'SUCCEEDED':
            break
        if state != 'IN_PROGRESS':
            raise ValueError(f'Upload failed or returned an unknown state: {state}')
        sleep(10)
        state = store.request('fetchStatus').get('lastAsyncUploadState')
    if state != 'SUCCEEDED':
        raise ValueError('Upload processing timed out; inspect the store before retrying')
    result = store.request('publish', json.dumps({
        'publishType': 'DEFAULT_PUBLISH', 'blockOnWarnings': True,
    }).encode())
    if not result.get('name') or not result.get('state'):
        raise ValueError(f'Unexpected publish response; inspect the store: {json.dumps(result)}')
    return result


def main():
    mode = sys.argv[1]
    if mode == 'status':
        print(json.dumps(Store().request('fetchStatus'), indent=2))
        return
    if mode == 'cancel':
        version = os.environ['CWS_CANCEL_VERSION']
        status = cancel_review(Store(), version)
        message = f'Cancelled pending Chrome Web Store review for {version}.'
        print(message)
        print(json.dumps(status, indent=2))
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
                summary.write(f'{message}\n\nCurrent store status:\n\n```json\n{json.dumps(status, indent=2)}\n```\n')
        return
    if mode not in ('validate-tag', 'publish'):
        raise ValueError('Expected validate-tag, status, publish, or cancel')
    version = json.loads(Path('apps/extension/package.json').read_text())['version']
    validate_tag(version, os.environ.get('GITHUB_REF', ''))
    if mode == 'validate-tag':
        print(f'Validated independent extension release: {version}')
        return
    payload = read_artifact(Path('artifacts'), version, os.environ['GITHUB_SHA'])
    result = publish(Store(), payload, version)
    print(json.dumps(result, indent=2))
    print('Submission accepted. Chrome Web Store review and approval control when it goes live.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        # Do not dump request headers or credentials into Actions logs.
        print(f'Chrome Web Store release failed: {error}', file=sys.stderr)
        sys.exit(1)
