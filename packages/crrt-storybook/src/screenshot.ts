const PREVIEW_IFRAME_ID = "storybook-preview-iframe";
const MAX_CAPTURE_EDGE = 1920;
// Base64 expands by 4/3. Leave room for JSON and feedback below Vercel's
// 4.5 MB request limit, including deployments that count MB in decimal bytes.
const MAX_SCREENSHOT_BYTES = 3_000_000;
export const MAX_SCREENSHOT_BASE64_LENGTH = 4_000_000;

export interface StoryScreenshot {
  base64: string;
  mimeType: "image/png";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Screenshot encoding failed"));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Screenshot encoding failed"));
    reader.readAsDataURL(blob);
  });
}

/** Captures only the active story viewport — never the Storybook manager UI. */
export async function captureStoryScreenshot(): Promise<StoryScreenshot> {
  const iframe = document.getElementById(
    PREVIEW_IFRAME_ID,
  ) as HTMLIFrameElement | null;
  const previewDocument = iframe?.contentDocument;
  const previewWindow = iframe?.contentWindow;
  if (!previewDocument?.documentElement || !previewWindow) {
    throw new Error("The story preview is not ready yet");
  }

  const width = previewWindow.innerWidth;
  const height = previewWindow.innerHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("The story preview has no visible area");
  }

  const { default: html2canvas } = await import("html2canvas-pro");
  const scale = Math.min(
    previewWindow.devicePixelRatio || 1,
    MAX_CAPTURE_EDGE / Math.max(width, height),
  );
  const canvas = await html2canvas(previewDocument.documentElement, {
    useCORS: true,
    logging: false,
    scale,
    x: previewWindow.scrollX,
    y: previewWindow.scrollY,
    width,
    height,
    scrollX: previewWindow.scrollX,
    scrollY: previewWindow.scrollY,
    windowWidth: width,
    windowHeight: height,
  });
  let image = canvas;
  for (;;) {
    const blob = await new Promise<Blob | null>((resolve) => {
      image.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error("The story screenshot could not be encoded");
    if (blob.size <= MAX_SCREENSHOT_BYTES) {
      return { base64: await blobToBase64(blob), mimeType: "image/png" };
    }
    if (image.width === 1 && image.height === 1) {
      throw new Error("The story screenshot is too large");
    }
    const smaller = previewDocument.createElement("canvas");
    smaller.width = Math.max(1, Math.floor(image.width * 0.7));
    smaller.height = Math.max(1, Math.floor(image.height * 0.7));
    const context = smaller.getContext("2d");
    if (!context) throw new Error("The story screenshot could not be resized");
    context.drawImage(image, 0, 0, smaller.width, smaller.height);
    image = smaller;
  }
}

/** A screenshot enriches feedback; an inaccessible preview must not block it. */
export async function tryCaptureStoryScreenshot(): Promise<StoryScreenshot | undefined> {
  try {
    return await captureStoryScreenshot();
  } catch {
    return undefined;
  }
}
