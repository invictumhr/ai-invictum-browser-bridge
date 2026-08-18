import type {
  ResolvedScreenshotAnnotation,
  ScreenshotCssRect,
  ScreenshotRenderRequest,
  ScreenshotRenderResult,
} from "./screenshot-renderer-contract.js";

/**
 * This function must remain self-contained. Chrome serializes it and executes it
 * in the tab's isolated world, so it cannot close over module-level values.
 */
export async function renderScreenshotInIsolatedWorld(
  request: ScreenshotRenderRequest,
): Promise<ScreenshotRenderResult> {
  const maxScreenshotBytes = 500_000;

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const separator = dataUrl.indexOf(",");
    if (separator < 0 || !dataUrl.slice(0, separator).includes(";base64")) {
      throw new Error("Screenshot renderer received an invalid image data URL");
    }
    const binary = atob(dataUrl.slice(separator + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: "image/jpeg" });
  };

  const canvasToBlob = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob === null) reject(new Error("Canvas JPEG encoding returned no data"));
          else resolve(blob);
        },
        "image/jpeg",
        quality / 100,
      );
    });

  const blobToDataUrl = async (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("FileReader returned no data URL"));
      });
      reader.addEventListener("error", () =>
        reject(reader.error ?? new Error("FileReader failed")),
      );
      reader.readAsDataURL(blob);
    });

  const hexWithAlpha = (hex: string, opacity: number): string => {
    const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${alpha}`;
  };

  const mapRectToCanvas = (
    rect: ScreenshotCssRect,
    sourceCssRect: ScreenshotCssRect,
    width: number,
    height: number,
  ): ScreenshotCssRect => ({
    x: ((rect.x - sourceCssRect.x) / sourceCssRect.width) * width,
    y: ((rect.y - sourceCssRect.y) / sourceCssRect.height) * height,
    width: (rect.width / sourceCssRect.width) * width,
    height: (rect.height / sourceCssRect.height) * height,
  });

  const intersectsCanvas = (rect: ScreenshotCssRect, width: number, height: number): boolean =>
    rect.x < width && rect.y < height && rect.x + rect.width > 0 && rect.y + rect.height > 0;

  const drawShape = (
    context: CanvasRenderingContext2D,
    annotation: ResolvedScreenshotAnnotation,
    rect: ScreenshotCssRect,
  ): void => {
    context.save();
    context.strokeStyle = annotation.stroke;
    context.lineWidth = annotation.strokeWidth;
    context.fillStyle = hexWithAlpha(annotation.fill ?? annotation.stroke, annotation.fillOpacity);
    context.beginPath();
    if (annotation.shape === "rectangle" || annotation.shape === "highlight") {
      context.rect(rect.x, rect.y, rect.width, rect.height);
    } else if (annotation.shape === "rounded_rectangle") {
      context.roundRect(rect.x, rect.y, rect.width, rect.height, Math.min(12, rect.height / 4));
    } else {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const radiusX =
        annotation.shape === "circle" ? Math.max(rect.width, rect.height) / 2 : rect.width / 2;
      const radiusY =
        annotation.shape === "circle" ? Math.max(rect.width, rect.height) / 2 : rect.height / 2;
      context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    }
    if (annotation.fill !== undefined || annotation.shape === "highlight") context.fill();
    context.stroke();
    context.restore();
  };

  const wrapLabel = (
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] => {
    const words = text.trim().split(/\s+/u);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length > 0 && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
        if (lines.length === 3) break;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0 && lines.length < 4) lines.push(current);
    if (lines.length === 4 && words.join(" ").length > lines.join(" ").length) {
      lines[3] = `${lines[3]!.replace(/…$/u, "")}…`;
    }
    return lines;
  };

  const drawArrow = (
    context: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string,
    width: number,
  ): void => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const head = Math.max(8, width * 3);
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(
      toX - head * Math.cos(angle - Math.PI / 6),
      toY - head * Math.sin(angle - Math.PI / 6),
    );
    context.lineTo(
      toX - head * Math.cos(angle + Math.PI / 6),
      toY - head * Math.sin(angle + Math.PI / 6),
    );
    context.closePath();
    context.fill();
    context.restore();
  };

  const drawLabel = (
    context: CanvasRenderingContext2D,
    annotation: ResolvedScreenshotAnnotation,
    target: ScreenshotCssRect,
    canvasWidth: number,
    canvasHeight: number,
  ): void => {
    const label = annotation.label;
    if (label === undefined) return;
    context.save();
    context.font = `600 ${label.fontSize}px Arial, sans-serif`;
    context.textBaseline = "top";
    const padding = Math.max(7, Math.round(label.fontSize * 0.45));
    const lineHeight = Math.round(label.fontSize * 1.25);
    const lines = wrapLabel(
      context,
      label.text,
      Math.max(40, Math.min(360, canvasWidth - padding * 4)),
    );
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
    const boxWidth = Math.min(canvasWidth, textWidth + padding * 2);
    const boxHeight = lines.length * lineHeight + padding * 2;
    const gap = Math.max(10, annotation.strokeWidth * 2);
    const resolvedPosition =
      label.position === "auto"
        ? target.y >= boxHeight + gap
          ? "top"
          : target.y + target.height + boxHeight + gap <= canvasHeight
            ? "bottom"
            : target.x + target.width + boxWidth + gap <= canvasWidth
              ? "right"
              : "left"
        : label.position;
    let x = target.x + target.width / 2 - boxWidth / 2;
    let y = target.y - boxHeight - gap;
    if (resolvedPosition === "bottom") y = target.y + target.height + gap;
    if (resolvedPosition === "left") {
      x = target.x - boxWidth - gap;
      y = target.y + target.height / 2 - boxHeight / 2;
    }
    if (resolvedPosition === "right") {
      x = target.x + target.width + gap;
      y = target.y + target.height / 2 - boxHeight / 2;
    }
    x = Math.max(0, Math.min(canvasWidth - boxWidth, x));
    y = Math.max(0, Math.min(canvasHeight - boxHeight, y));
    context.fillStyle = label.background;
    context.beginPath();
    context.roundRect(x, y, boxWidth, boxHeight, Math.min(10, boxHeight / 4));
    context.fill();
    context.fillStyle = label.color;
    lines.forEach((line, index) =>
      context.fillText(line, x + padding, y + padding + index * lineHeight),
    );
    if (label.arrow) {
      const fromX = Math.max(x, Math.min(x + boxWidth, target.x + target.width / 2));
      const fromY =
        resolvedPosition === "top"
          ? y + boxHeight
          : resolvedPosition === "bottom"
            ? y
            : Math.max(y, Math.min(y + boxHeight, target.y + target.height / 2));
      const adjustedFromX =
        resolvedPosition === "left" ? x + boxWidth : resolvedPosition === "right" ? x : fromX;
      drawArrow(
        context,
        adjustedFromX,
        fromY,
        target.x + target.width / 2,
        target.y + target.height / 2,
        label.background,
        Math.max(2, annotation.strokeWidth / 2),
      );
    }
    context.restore();
  };

  const drawAnnotations = (
    context: CanvasRenderingContext2D,
    annotations: readonly ResolvedScreenshotAnnotation[],
    sourceCssRect: ScreenshotCssRect,
    width: number,
    height: number,
  ): number => {
    for (const annotation of annotations) {
      const target = mapRectToCanvas(annotation.rect, sourceCssRect, width, height);
      if (!intersectsCanvas(target, width, height)) {
        throw new Error(
          "An annotation target is outside the captured area; use element or full_page mode",
        );
      }
      drawShape(context, annotation, target);
      drawLabel(context, annotation, target, width, height);
    }
    return annotations.length;
  };

  const bitmap = await createImageBitmap(dataUrlToBlob(request.rawDataUrl));
  try {
    let scale = Math.min(1, request.maxWidth / bitmap.width, request.maxHeight / bitmap.height);
    let quality = request.quality;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.floor(bitmap.width * scale));
      const height = Math.max(1, Math.floor(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Could not create the annotation canvas context");
      context.drawImage(bitmap, 0, 0, width, height);
      const annotationsApplied = drawAnnotations(
        context,
        request.annotations,
        request.sourceCssRect,
        width,
        height,
      );
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxScreenshotBytes) {
        return {
          dataUrl: await blobToDataUrl(blob),
          width,
          height,
          byteLength: blob.size,
          annotationsApplied,
        };
      }
      scale *= 0.8;
      quality = Math.max(30, quality - 10);
    }
    throw new Error("The annotated screenshot exceeds the safe transport limit");
  } finally {
    bitmap.close();
  }
}
