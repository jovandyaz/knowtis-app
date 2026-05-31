export const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.8;

export interface CompressedImage {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

export function computeTargetSize(
  width: number,
  height: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_DIMENSION / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function replaceExt(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

/**
 * Resizes to <= MAX_DIMENSION on the long side and re-encodes as WebP.
 * GIFs pass through untouched to preserve animation. Falls back to the
 * original file if the Canvas/WebP path is unavailable.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === 'image/gif') {
    const img = await loadImage(file).catch(() => null);
    return {
      blob: file,
      filename: file.name,
      width: img?.naturalWidth ?? 0,
      height: img?.naturalHeight ?? 0,
    };
  }

  try {
    const img = await loadImage(file);
    const target = computeTargetSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );
    if (!blob) {
      throw new Error('toBlob returned null');
    }
    return {
      blob,
      filename: replaceExt(file.name, 'webp'),
      width: target.width,
      height: target.height,
    };
  } catch {
    return { blob: file, filename: file.name, width: 0, height: 0 };
  }
}
