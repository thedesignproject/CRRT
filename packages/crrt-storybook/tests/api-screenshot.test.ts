import { afterEach, expect, it, vi } from 'vitest';
import { sendFeedback } from '../src/api';

afterEach(() => vi.unstubAllGlobals());
it.each([4_000_000, 4_000_001])('bounds screenshot payloads without blocking feedback (%i characters)', async (length) => {
  const request = vi.fn(async () => Response.json({ id: 'comment' }));
  vi.stubGlobal('fetch', request);
  expect(await sendFeedback({
    projectId: 'project', connectionId: 'connection', body: 'Fix this button',
    story: { storyId: 'button--primary', componentTitle: 'Button', storyName: 'Primary' },
    screenshot: { base64: 'a'.repeat(length), mimeType: 'image/png' },
  })).toEqual({ ok: true, commentId: 'comment' });
  const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
  const payload = JSON.parse(options.body as string);
  expect(url).toContain('/storybook/connections/connection/comments');
  expect(payload.body).toContain('Fix this button');
  if (length === 4_000_000) {
    expect(payload.imageBase64).toHaveLength(length);
    expect(payload.imageMimeType).toBe('image/png');
  } else {
    expect(payload).not.toHaveProperty('imageBase64');
    expect(payload).not.toHaveProperty('imageMimeType');
  }
  expect(new TextEncoder().encode(options.body as string).byteLength).toBeLessThan(4_500_000);
});
