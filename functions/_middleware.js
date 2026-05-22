/**
 * Cloudflare Pages middleware — markdown content negotiation.
 *
 * When an agent or LLM client sends `Accept: text/markdown`, serve
 * llms.txt instead of the requested HTML page so the client gets a
 * clean, LLM-readable description of the site.
 *
 * All other requests pass through to the normal static-file handler.
 */
export async function onRequest(context) {
  const accept = context.request.headers.get('Accept') ?? '';

  // Only intercept HTML page requests — leave assets (images, JS, CSS) alone.
  const url = new URL(context.request.url);
  const isAsset = /\.(js|css|ico|svg|png|jpg|jpeg|webp|woff2?|ttf|json)$/i.test(url.pathname);

  if (!isAsset && accept.includes('text/markdown')) {
    const llmsTxtUrl = new URL('/llms.txt', context.request.url).toString();
    const asset = await context.env.ASSETS.fetch(llmsTxtUrl);
    const text = await asset.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Vary': 'Accept',
      },
    });
  }

  return context.next();
}
