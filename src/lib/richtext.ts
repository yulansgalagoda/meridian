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
        text = `<a href="${span.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text;
    })
    .join('');
}

export function plainText(spans: any[]): string {
  if (!spans?.length) return '';
  return spans.map((s) => s.plain_text ?? '').join('');
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
