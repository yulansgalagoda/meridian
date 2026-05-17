import { Client } from '@notionhq/client';
import { ensureImagesDir, downloadPrimary, downloadGallery, downloadCategoryImage } from './images';
import { fetchAllBlocks, renderBlocks, plainText } from './richtext';
import type { Item, Category, SiteData } from './types';

const DATA_SOURCES = {
  items: '91ecf100-9c66-4f70-a03a-a11e0dfd2d20',
  categories: 'c9651011-b65b-419f-8fb5-80a4a70a9289',
} as const;

const ABOUT_PAGE_ID = '36356d83-11d2-804e-b7a8-c2494f19a19c';

function notionClient(): Client {
  const token = (import.meta.env.NOTION_TOKEN as string | undefined) ?? process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN is not set. Add it to .env for local development or to Cloudflare Pages environment variables for production.'
    );
  }
  return new Client({ auth: token, notionVersion: '2025-09-03' });
}

type AnyProps = Record<string, any>;

function getTitle(props: AnyProps, name: string): string {
  const p = props?.[name];
  if (!p) return '';
  if (p.type === 'title') return plainText(p.title);
  return '';
}

function getText(props: AnyProps, name: string): string {
  const p = props?.[name];
  if (!p) return '';
  if (p.type === 'rich_text') return plainText(p.rich_text);
  if (p.type === 'text') return p.text ?? '';
  return '';
}

function getNumber(props: AnyProps, name: string): number {
  const p = props?.[name];
  if (!p) return 0;
  if (p.type === 'number') return typeof p.number === 'number' ? p.number : 0;
  if (p.type === 'unique_id') return p.unique_id?.number ?? 0;
  if (typeof p === 'number') return p;
  return 0;
}

function getCheckbox(props: AnyProps, name: string): boolean {
  const p = props?.[name];
  if (!p) return false;
  if (p.type === 'checkbox') return Boolean(p.checkbox);
  // Data sources encode checkbox as string sentinels
  if (typeof p === 'string') return p === '__YES__';
  return false;
}

function getSelect(props: AnyProps, name: string): string {
  const p = props?.[name];
  if (!p) return '';
  if (p.type === 'select') return p.select?.name ?? '';
  if (p.type === 'status') return p.status?.name ?? '';
  if (typeof p === 'string') return p;
  return '';
}

function getMultiSelect(props: AnyProps, name: string): string[] {
  const p = props?.[name];
  if (!p) return [];
  if (p.type === 'multi_select') {
    return (p.multi_select as Array<{ name: string }>).map((s) => s.name);
  }
  // Data sources may return a JSON array string
  if (typeof p === 'string') {
    try { return JSON.parse(p); } catch { return []; }
  }
  return [];
}

function getFiles(props: AnyProps, name: string): any[] {
  const p = props?.[name];
  if (!p) return [];
  if (p.type === 'files') return p.files ?? [];
  // Data sources return a JSON array of file objects
  if (typeof p === 'string') {
    try { return JSON.parse(p); } catch { return []; }
  }
  if (Array.isArray(p)) return p;
  return [];
}

function getRelationIds(props: AnyProps, name: string): string[] {
  const p = props?.[name];
  if (!p) return [];
  if (p.type === 'relation') return (p.relation as Array<{ id: string }>).map((r) => r.id);
  // Data sources return relation fields as a JS Array of page URL strings
  let arr: string[] = [];
  if (Array.isArray(p)) {
    arr = p;
  } else if (typeof p === 'string') {
    try { arr = JSON.parse(p); } catch { return []; }
  } else {
    return [];
  }
  return arr.map((url: string) => {
    const parts = url.split('/');
    const last = parts[parts.length - 1];
    return last.split('?')[0].replace(/-/g, '');
  });
}

async function queryDataSource(client: Client, dataSourceId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filter: {
        property: 'Publish Status',
        select: { equals: 'Published' },
      },
      sorts: [{ property: 'Display Order', direction: 'ascending' }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res: any = await (client as any).request({
      path: `data_sources/${dataSourceId}/query`,
      method: 'post',
      body,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

export async function fetchSiteData(): Promise<SiteData> {
  ensureImagesDir();
  const client = notionClient();

  const [rawItems, rawCategories, aboutBlocks] = await Promise.all([
    queryDataSource(client, DATA_SOURCES.items),
    queryDataSource(client, DATA_SOURCES.categories),
    fetchAllBlocks(client, ABOUT_PAGE_ID),
  ]);

  // Build category lookup: page id (no dashes) → { name, slug }
  const categoryMap = new Map<string, { name: string; slug: string; id: string }>();

  const categories: Category[] = await Promise.all(
    rawCategories.map(async (page: any) => {
      const props = page.properties;
      const slug = getText(props, 'Slug') || getTitle(props, 'Name').toLowerCase().replace(/\s+/g, '-');
      const coverImage = await downloadCategoryImage(slug, getFiles(props, 'Cover Image'));
      const cat: Category = {
        id: page.id,
        slug,
        name: getTitle(props, 'Name'),
        description: getText(props, 'Description'),
        icon: getText(props, 'Icon'),
        displayOrder: getNumber(props, 'Display Order'),
        coverImage,
        publishStatus: getSelect(props, 'Publish Status'),
      };
      categoryMap.set(page.id.replace(/-/g, ''), cat);
      return cat;
    })
  );

  // Fetch all item blocks in parallel with item processing
  const items: Item[] = await Promise.all(
    rawItems.map(async (page: any) => {
      const props = page.properties;
      const slug = getText(props, 'Slug') || getTitle(props, 'Name').toLowerCase().replace(/\s+/g, '-');

      const [primaryImage, galleryImages] = await Promise.all([
        downloadPrimary(slug, getFiles(props, 'Primary Image')),
        downloadGallery(slug, getFiles(props, 'Gallery Images')),
      ]);

      const catIds = getRelationIds(props, 'Category');
      const cat = catIds.length ? categoryMap.get(catIds[0]) : undefined;

      const yearRaw = getNumber(props, 'Year');

      return {
        id: page.id,
        slug,
        name: getTitle(props, 'Name'),
        shortDescription: getText(props, 'Short Description'),
        story: getText(props, 'Story'),
        year: yearRaw !== 0 ? yearRaw : null,
        dateDetail: getText(props, 'Date Detail'),
        era: getSelect(props, 'Era'),
        categoryId: cat?.id ?? null,
        categoryName: cat?.name ?? null,
        categorySlug: cat?.slug ?? null,
        tags: getMultiSelect(props, 'Tags'),
        maker: getText(props, 'Maker'),
        originCountry: getSelect(props, 'Origin Country'),
        materials: getText(props, 'Materials'),
        dimensions: getText(props, 'Dimensions'),
        condition: getSelect(props, 'Condition'),
        primaryImage,
        galleryImages,
        imageAltText: getText(props, 'Image Alt Text'),
        featured: getCheckbox(props, 'Featured'),
        displayOrder: getNumber(props, 'Display Order'),
        publishStatus: getSelect(props, 'Publish Status'),
        itemId: getNumber(props, 'Item ID'),
      } satisfies Item;
    })
  );

  const aboutHtml = renderBlocks(aboutBlocks);

  return { items, categories, aboutHtml };
}

// Fetches the full block content for a single item page.
export async function fetchItemContent(pageId: string): Promise<string> {
  const client = notionClient();
  const blocks = await fetchAllBlocks(client, pageId);
  return renderBlocks(blocks);
}

// Build-time cache so getStaticPaths and individual page renders share one fetch.
let _cache: SiteData | null = null;

export async function getSiteData(): Promise<SiteData> {
  if (_cache) return _cache;
  _cache = await fetchSiteData();
  return _cache;
}
