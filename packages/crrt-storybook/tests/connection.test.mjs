import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionStateMessage,
  fetchConnectionState,
  sendFeedback,
} from "../dist/index.js";

test("maps private eligibility states without guessing", async () => {
  const upgrade = await fetchConnectionState(
    { connectionId: "sbconn_demo", apiBase: "https://crrt.ai/api" },
    async () =>
      Response.json(
        {
          code: "upgrade_required",
          message: "Upgrade the project owner to CRRT Pro.",
          actionUrl: "https://crrt.ai/billing",
        },
        { status: 403 },
      ),
  );
  assert.deepEqual(upgrade, {
    kind: "upgrade_required",
    code: "upgrade_required",
    message: "Upgrade the project owner to CRRT Pro.",
    actionUrl: "https://crrt.ai/billing",
  });

  const signedOut = await fetchConnectionState(
    { connectionId: "sbconn_demo" },
    async () => Response.json({}, { status: 401 }),
  );
  assert.equal(signedOut.kind, "authentication_required");
  assert.match(connectionStateMessage(signedOut.kind), /Sign in to CRRT/);
});

test("network failures become a recoverable offline state", async () => {
  const state = await fetchConnectionState(
    { connectionId: "sbconn_demo" },
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(state.kind, "offline_error");
});

test("normalizes backend aliases and rejects unsafe action URLs", async () => {
  const state = await fetchConnectionState(
    { connectionId: "sbconn_demo" },
    async () =>
      Response.json(
        {
          code: "owner_upgrade_required",
          actionUrl: "javascript:alert(1)",
        },
        { status: 403 },
      ),
  );
  assert.deepEqual(state, { kind: "upgrade_required", code: "owner_upgrade_required", message: undefined, actionUrl: undefined });
});

test("private feedback uses the authenticated endpoint and never public fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    location: {
      origin: "http://localhost:6006",
      pathname: "/",
    },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ message: "Sign in required" }, { status: 401 });
  };
  try {
    const result = await sendFeedback({
      projectId: "project_demo",
      connectionId: "sbconn_demo",
      body: "Fix the button",
      story: {
        storyId: "components-button--primary",
        componentTitle: "Components/Button",
        storyName: "Primary",
      },
    });
    assert.deepEqual(result, { ok: false, error: "Sign in required" });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://crrt.ai/api/v1/storybook/connections/sbconn_demo/comments",
    );
    assert.equal(calls[0].options.credentials, "omit");
    assert.equal(calls[0].url.includes("/public/comments"), false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("parameter-only projects retain the existing public endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let request;
  globalThis.window = {
    location: { origin: "http://localhost:6006", pathname: "/" },
  };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ id: "comment_1" });
  };
  try {
    const result = await sendFeedback({
      projectId: "public_demo",
      body: "Looks good",
      story: {
        storyId: "components-button--primary",
        componentTitle: "Components/Button",
        storyName: "Primary",
      },
    });
    assert.deepEqual(result, { ok: true, commentId: "comment_1" });
    assert.equal(request.url, "https://crrt.ai/api/v1/public/comments");
    assert.equal(request.options.credentials, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
