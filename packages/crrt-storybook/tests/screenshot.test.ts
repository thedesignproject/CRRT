import { beforeEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas-pro';
import { captureStoryScreenshot, tryCaptureStoryScreenshot } from '../src/screenshot';
vi.mock('html2canvas-pro', () => ({ default: vi.fn() }));
function canvas(bytes = 10, width = 1920, height = 1920) {
  return { width, height, toBlob: vi.fn((done: BlobCallback) => done(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))) } as unknown as HTMLCanvasElement;
}
function preview(width = 1200, height = 1200, devicePixelRatio = 2) {
  const createElement = vi.fn();
  const documentElement = document.documentElement;
  vi.spyOn(document, 'getElementById').mockReturnValue({
    contentDocument: { documentElement, createElement },
    contentWindow: { innerWidth: width, innerHeight: height, devicePixelRatio, scrollX: 12, scrollY: 34 },
  } as unknown as HTMLElement);
  return { createElement, documentElement };
}
beforeEach(() => { vi.restoreAllMocks(); vi.mocked(html2canvas).mockReset(); });
describe('story screenshots', () => {
  it('captures the viewport and caps the longest edge', async () => {
    const { documentElement } = preview();
    vi.mocked(html2canvas).mockResolvedValue(canvas());
    expect(await captureStoryScreenshot()).toEqual({ mimeType: 'image/png', base64: Buffer.alloc(10).toString('base64') });
    expect(html2canvas).toHaveBeenCalledWith(documentElement, expect.objectContaining({ scale: 1.6, width: 1200, height: 1200, x: 12, y: 34, scrollX: 12, scrollY: 34 }));
  });
  it('repeatedly downsizes detailed images until the base64 request fits', async () => {
    const { createElement } = preview();
    const first = canvas(4_322_583), second = canvas(3_000_001), third = canvas(3_000_000);
    const drawSecond = vi.fn(), drawThird = vi.fn();
    second.getContext = vi.fn(() => ({ drawImage: drawSecond })) as never;
    third.getContext = vi.fn(() => ({ drawImage: drawThird })) as never;
    createElement.mockReturnValueOnce(second).mockReturnValueOnce(third);
    vi.mocked(html2canvas).mockResolvedValue(first);
    const result = await captureStoryScreenshot();
    expect(drawSecond).toHaveBeenCalledWith(first, 0, 0, 1344, 1344);
    expect(drawThird).toHaveBeenCalledWith(second, 0, 0, 940, 940);
    expect(result.base64.length).toBe(4_000_000);
    expect(new TextEncoder().encode(JSON.stringify({ imageBase64: result.base64, body: 'x'.repeat(8000) })).byteLength).toBeLessThan(4_500_000);
  });
  it('keeps small screenshots at their original resolution', async () => {
    const { createElement } = preview(100, 100, 1);
    vi.mocked(html2canvas).mockResolvedValue(canvas());
    expect(await tryCaptureStoryScreenshot()).toMatchObject({ mimeType: 'image/png' });
    expect(html2canvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scale: 1 }));
    expect(createElement).not.toHaveBeenCalled();
  });
  it('sends no image when the preview is missing or inaccessible', async () => {
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
    vi.spyOn(document, 'getElementById').mockReturnValue({ contentDocument: null } as unknown as HTMLElement);
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
  });
  it.each([[0, 100], [100, 0]])('sends no image for an invisible viewport (%i x %i)', async (width, height) => {
    preview(width, height);
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
    expect(html2canvas).not.toHaveBeenCalled();
  });
  it('sends no image when the renderer rejects', async () => {
    preview(); vi.mocked(html2canvas).mockRejectedValue(new Error('unsupported CSS'));
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
  });
  it('sends no image when encoding fails', async () => {
    preview(); const image = canvas(); image.toBlob = (done) => done(null);
    vi.mocked(html2canvas).mockResolvedValue(image);
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
  });
  it('sends no image if a resize context is unavailable', async () => {
    const { createElement } = preview(); createElement.mockReturnValue({ getContext: () => null });
    vi.mocked(html2canvas).mockResolvedValue(canvas(3_000_001));
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
  });
  it('stops resizing at one pixel', async () => {
    preview(); vi.mocked(html2canvas).mockResolvedValue(canvas(3_000_001, 1, 1));
    expect(await tryCaptureStoryScreenshot()).toBeUndefined();
  });
});
