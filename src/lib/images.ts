import * as fs from 'node:fs';
import * as path from 'node:path';

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

export function ensureImagesDir(): void {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

async function download(url: string, dest: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
  } catch (e) {
    console.warn(`[meridian] Could not download image: ${url}`, e);
  }
}

function extFromUrl(url: string): string {
  const raw = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(raw) ? raw : 'jpg';
}

function extractUrl(file: any): string | null {
  if (!file) return null;
  if (file.type === 'file') return file.file?.url ?? null;
  if (file.type === 'external') return file.external?.url ?? null;
  return null;
}

// Always re-downloads — no existence check. Every build pulls fresh images.
export async function downloadPrimary(
  slug: string,
  files: any[]
): Promise<string | null> {
  if (!files?.length) return null;
  const url = extractUrl(files[0]);
  if (!url) return null;
  const ext = extFromUrl(url);
  const filename = `${slug}-primary.${ext}`;
  await download(url, path.join(IMAGES_DIR, filename));
  return `/images/${filename}`;
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
    const ext = extFromUrl(url);
    const filename = `${slug}-gallery-${i}.${ext}`;
    await download(url, path.join(IMAGES_DIR, filename));
    paths.push(`/images/${filename}`);
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
  const ext = extFromUrl(url);
  const filename = `category-${slug}.${ext}`;
  await download(url, path.join(IMAGES_DIR, filename));
  return `/images/${filename}`;
}
