const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Execute the report script from the workflow itself. Its JUnit input describes
// UI Tests; it must never label those inherited differences as PR review work.
const root = resolve(__dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/chromatic.yml'), 'utf8').replaceAll('\r\n', '\n');
const script = workflow.split('          script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n');
const runReport = new (Object.getPrototypeOf(async function () {}).constructor)('require', 'context', 'github', 'core', 'process', script);
const buildUrl = 'https://www.chromatic.com/build?appId=6aeae810ce4e3a1237160876&amp;number=42';

async function report({ result = 'PENDING', errors = 0, skipped = 0, failures = result === 'PENDING' ? 1 : 0,
  cloud = 'success', local = 'success', currentHead = 'head1234', currentBase = 'base1234', currentRef = 'stack/one', xmlMissing = false } = {}) {
  const bodies = [], failed = [];
  const pr = { number: 7, head: { sha: 'head1234' }, base: { ref: 'stack/one', sha: 'base1234' } };
  const xml = `<testsuite tests="1" errors="${errors}" skipped="${skipped}" failures="${failures}"><property name="result" value="${result}"/><property name="buildUrl" value="${buildUrl}"/></testsuite>`;
  const github = {
    rest: {
      pulls: { get: async () => ({ data: { head: { sha: currentHead }, base: { sha: currentBase, ref: currentRef } } }) },
      issues: { listComments: {}, createComment: async ({ body }) => bodies.push(body), updateComment: async () => assert.fail('No previous comment') },
    },
    paginate: async () => [],
  };
  const core = { notice() {}, summary: { addRaw() { return this; }, async write() {} }, setFailed: message => failed.push(message) };
  const fs = { readFileSync(path) {
    if (path.endsWith('results.json')) return JSON.stringify({ stats: { expected: 1 } });
    if (path.endsWith('cloud.xml') && !xmlMissing) return xml;
    throw new Error('Missing report');
  } };
  await runReport(name => { assert.equal(name, 'node:fs'); return fs; },
    { payload: { pull_request: pr }, repo: { owner: 'owner', repo: 'repo' }, serverUrl: 'https://github.com', runId: 1 },
    github, core, { env: { LOCAL_RESULT: local, CLOUD_RESULT: cloud } });
  return { bodies, failed };
}

test('pending inherited baselines do not request repeat approval or claim UI Review passed', async () => {
  const { bodies: [body], failed } = await report();
  assert.deepEqual(failed, []);
  assert.match(body, /Upload complete/);
  assert.match(body, /targets `stack\/one` \(`base123`\)/);
  assert.match(body, /native UI Review check/);
  assert.match(body, /Base snapshots do not need baseline approval/);
  assert.doesNotMatch(body, /Needs baseline review|pending baseline reviews|Chromatic — Passed/);
});

test('passing UI Tests still reports upload completion, not a UI Review verdict', async () => {
  const { bodies: [body], failed } = await report({ result: 'PASSED' });
  assert.deepEqual(failed, []);
  assert.match(body, /Upload complete/);
  assert.doesNotMatch(body, /Chromatic — Passed/);
});

for (const scenario of [{ errors: 1 }, { skipped: 1 }, { cloud: 'failure' }, { local: 'failure' }, { xmlMissing: true }, { result: 'DENIED', failures: 1 }]) {
  test(`still rejects incomplete/failed capture: ${JSON.stringify(scenario)}`, async () => {
    const { bodies: [body], failed } = await report(scenario);
    assert.equal(failed.length, 1);
    assert.match(body, /Chromatic — Failed/);
  });
}

for (const scenario of [{ currentHead: 'new-head' }, { currentBase: 'new-base' }, { currentRef: 'trunk' }]) {
  test(`skips a stale PR report: ${JSON.stringify(scenario)}`, async () => {
    assert.deepEqual((await report(scenario)).bodies, []);
  });
}
