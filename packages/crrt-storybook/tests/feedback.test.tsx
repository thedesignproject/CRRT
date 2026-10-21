import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackSection } from '../src/components/FeedbackSection';
import { ComplianceSection } from '../src/components/ComplianceSection';
import { sendFeedback } from '../src/api';
import { tryCaptureStoryScreenshot } from '../src/screenshot';
import { runStoryChecks } from '../src/checks';
vi.mock('../src/api', async (original) => ({ ...await original<typeof import('../src/api')>(), sendFeedback: vi.fn() }));
vi.mock('../src/screenshot', () => ({ tryCaptureStoryScreenshot: vi.fn() }));
vi.mock('storybook/manager-api', () => ({ useChannel: vi.fn() }));
vi.mock('../src/checks', async (original) => ({ ...await original<typeof import('../src/checks')>(), runStoryChecks: vi.fn() }));
const story = { storyId: 'button--primary', componentTitle: 'Button', storyName: 'Primary' };
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: vi.fn() } });
  vi.mocked(sendFeedback).mockResolvedValue({ ok: true });
  vi.mocked(tryCaptureStoryScreenshot).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('submits manual feedback when no screenshot is available', async () => {
  render(<FeedbackSection projectId="project" story={story} />);
  fireEvent.change(screen.getByLabelText('Feedback for this component'), { target: { value: 'Fix this button' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to CRRT' }));
  await screen.findByText('Sent to CRRT ✓');
  expect(sendFeedback).toHaveBeenCalledWith(expect.objectContaining({ body: 'Fix this button', story, screenshot: undefined }));
});
it('submits a compliance issue when no screenshot is available', async () => {
  vi.mocked(runStoryChecks).mockReturnValue({ ok: true, results: [{ id: 'accessible-name', status: 'fail', failures: ['button has no name'] }] });
  render(<ComplianceSection projectId="project" story={story} rules={[]} checksEnabled />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send to CRRT' }));
  await waitFor(() => expect(sendFeedback).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('[compliance issue]'), story, screenshot: undefined })));
  await screen.findByText(/Sent ✓/);
});
