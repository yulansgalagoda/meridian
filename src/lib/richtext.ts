// Normalises link targets so internal links stay on the site.
// Notion rewrites links typed as "/seeking" etc. to app.notion.com URLs,
// and absolute meridian.yulan.me links should be relative.
// Known Notion page ids (dashless) → site routes, for link-to-page mentions.
const PAGE_ROUTES: Record<string, string> = {
  '37b56d8311d2816c928df1a4969f03c9': '/collecting-policy',
  '37b56d8311d281ef91c7cd60952e77cf': '/verification-and-provenance',
  '37b56d8311d2819e8a0cf80eb5c6bdf4': '/seeking',
  '37b56d8311d2813d8154d17d0b0dcaea': '/access-citation-image-use',
  '37b56d8311d281c2be54cd114f24a4a7': '/annual-review',
  '36356d8311d2804eb7a8c2494f19a19c': '/about',
};

function normalizeHref(href: string): { href: string; internal: boolean } {
  let h = href
    .replace(/^https?:\/\/(app\.notion\.com|www\.notion\.so|notion\.so)\//, '/')
    .replace(/^https?:\/\/meridian\.yulan\.me\//, '/');
  // Notion link-to-page: "/p/<id>" or "/<id>" (32 hex chars, possibly suffixed)
  const idMatch = h.match(/^\/(?:p\/)?([0-9a-f]{32})/);
  if (idMatch && PAGE_ROUTES[idMatch[1]]) {
    return { href: PAGE_ROUTES[idMatch[1]], internal: true };
  }
  if (h.startsWith('/')) return { href: h, internal: true };
  return { href: h, internal: false };
}

// Renders Notion rich text spans to HTML.
export function renderSpans(spans: any[]): string {
  if (!spans?.length) return '';
  return spans
    .map((span) => {
      let text = (span.plain_text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (span.annotations?.bold) text = `<strong>${text}</strong>`;
      if (span.annotations?.italic) text = `<em>${text}</em>`;
      if (span.annotations?.code) text = `<code>${text}</code>`;
      if (span.annotations?.strikethrough) text = `<s>${text}</s>`;
      if (span.href) {
        const { href, internal } = normalizeHref(span.href);
        text = internal
          ? `<a href="${href}">${text}</a>`
          : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text;
    })
    .join('');
}

export function plainText(spans: any[]): string {
  if (!spans?.length) return '';
  return spans.map((s) => s.plain_text ?? '').join('');
}

// ── Inline image convention ──────────────────────────────────────────────────
// A paragraph whose entire text is a braced link becomes a figure, so editors
// can drop standalone images (author portraits, maps, scenes) into prose without
// touching code. Kept out of mid-sentence so the newspaper layout stays clean.
//   {https://example.com/pic.jpg}
//   {https://example.com/pic.jpg | A caption beneath the image}
//   {https://example.com/pic.jpg | A wide banner caption | wide}   ← spans all columns
function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function parseFigure(raw: string): string | null {
  const m = raw
    .trim()
    .match(/^\{\s*(https?:\/\/[^\s|}]+)\s*(?:\|\s*([^|}]+?))?\s*(?:\|\s*(wide|full))?\s*\}$/i);
  if (!m) return null;
  const url = attr(m[1]);
  const caption = (m[2] ?? '').trim();
  const wide = Boolean(m[3]);
  const cls = wide ? 'narr-figure narr-figure--wide' : 'narr-figure';
  const alt = attr(caption || 'Illustration');
  const figcaption = caption ? `<figcaption>${escText(caption)}</figcaption>` : '';
  return `<figure class="${cls}"><img src="${url}" alt="${alt}" loading="lazy" decoding="async">${figcaption}</figure>\n`;
}

// Fetches all blocks for a page, handling pagination.
import { Client } from '@notionhq/client';

export async function fetchAllBlocks(
  client: Client,
  blockId: string
): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// Renders a flat list of Notion blocks to an HTML string.
export function renderBlocks(blocks: any[]): string {
  let html = '';
  let inBulletList = false;
  let inNumberedList = false;

  const closeLists = () => {
    if (inBulletList) { html += '</ul>\n'; inBulletList = false; }
    if (inNumberedList) { html += '</ol>\n'; inNumberedList = false; }
  };

  for (const block of blocks) {
    if (block.type !== 'bulleted_list_item') {
      if (inBulletList) { html += '</ul>\n'; inBulletList = false; }
    }
    if (block.type !== 'numbered_list_item') {
      if (inNumberedList) { html += '</ol>\n'; inNumberedList = false; }
    }

    switch (block.type) {
      case 'paragraph': {
        const figure = parseFigure(plainText(block.paragraph.rich_text));
        if (figure) { closeLists(); html += figure; break; }
        const text = renderSpans(block.paragraph.rich_text);
        if (text.trim()) html += `<p>${text}</p>\n`;
        break;
      }
      case 'heading_1': {
        closeLists();
        html += `<h2>${renderSpans(block.heading_1.rich_text)}</h2>\n`;
        break;
      }
      case 'heading_2': {
        closeLists();
        html += `<h2>${renderSpans(block.heading_2.rich_text)}</h2>\n`;
        break;
      }
      case 'heading_3': {
        closeLists();
        html += `<h3>${renderSpans(block.heading_3.rich_text)}</h3>\n`;
        break;
      }
      case 'bulleted_list_item': {
        if (!inBulletList) { html += '<ul>\n'; inBulletList = true; }
        html += `<li>${renderSpans(block.bulleted_list_item.rich_text)}</li>\n`;
        break;
      }
      case 'numbered_list_item': {
        if (!inNumberedList) { html += '<ol>\n'; inNumberedList = true; }
        html += `<li>${renderSpans(block.numbered_list_item.rich_text)}</li>\n`;
        break;
      }
      case 'divider': {
        closeLists();
        html += '<hr>\n';
        break;
      }
      case 'quote': {
        closeLists();
        html += `<blockquote>${renderSpans(block.quote.rich_text)}</blockquote>\n`;
        break;
      }
      case 'callout': {
        closeLists();
        const text = renderSpans(block.callout?.rich_text ?? []);
        html += `<blockquote class="callout">${text}</blockquote>\n`;
        break;
      }
      case 'code': {
        closeLists();
        const code = plainText(block.code?.rich_text ?? [])
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        html += `<pre><code>${code}</code></pre>\n`;
        break;
      }
    }
  }

  closeLists();
  return html;
}
