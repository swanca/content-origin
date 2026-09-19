import type { APIRoute } from 'astro';

export const prerender = true;

const PAGES = ['/', '/what-are-content-credentials', '/privacy'];

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://checkorigin.app')).origin;
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map((p) => `  <url><loc>${origin}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
