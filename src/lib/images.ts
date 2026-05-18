import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

export function ensureImagesDir(): void {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Download, EXIF-rotate, and save an image.
 * Returns the final filename (with content hash) so the caller can build the URL.
 * Using a content hash in the filename means any image replacement automatically
 * produces a new URL — busting every cache layer (CDN, browser) without manual purging.
 */
async function download(url: string, prefix: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());

    // Auto-rotate pixels to match EXIF orientation, output as JPEG.
    const processed = await sharp(raw).rotate().jpeg({ quality: 88 }).toBuffer();

    // 8-char content hash → new image = new filename = cache bust everywhere.
    const hash = crypto.createHash('md5').update(processed).digest('hex').slice(0, 8);
    const filename = `${prefix}-${hash}.jpg`;

    fs.writeFileSync(path.join(IMAGES_DIR, filename), processed);
    return `/images/${filename}`;
  } catch (e) {
    console.warn(`[meridian] Could not download image: ${url}`, e);
    return null;
  }
}

function extractUrl(file: any): string | null {
  if (!file) return null;
  if (file.type === 'file') return file.file?.url ?? null;
  if (file.type === 'external') return file.external?.url ?? null;
  return null;
}

export async function downloadPrimary(
  slug: string,
  files: any[]
): Promise<string | null> {
  if (!files?.length) return null;
  const url = extractUrl(files[0]);
  if (!url) return null;
  return download(url, `${slug}-primary`);
}

export async function downloadGallery(
  slug: string,
  files: any[]
): Promise<string[]> {
  if (!files?.length) return [];
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const url = extractUrl(files[i]);
    if (!url) continue;
    const result = await download(url, `${slug}-gallery-${i}`);
    if (result) paths.push(result);
  }
  return paths;
}

export async function downloadCategoryImage(
  slug: string,
  files: any[]
): Promise<string | null> {
  if (!files?.length) return null;
  const url = extractUrl(files[0]);
  if (!url) return null;
  return download(url, `category-${slug}`);
}
