import { defineConfig } from 'astro/config';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Read PUBLIC_SITE_URL by hand, since this config runs before Astro loads .env
 * and `site` has to be right: canonical tags and the share link come from it.
 */
function siteUrl() {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL;
  if (existsSync('.env')) {
    const match = readFileSync('.env', 'utf8').match(/^PUBLIC_SITE_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  return 'https://checkorigin.app';
}

// No adapter and no server output. The game has no backend at all, so this
// builds to plain files that any static host serves.
export default defineConfig({
  site: siteUrl(),
  output: 'static',
  build: { inlineStylesheets: 'always' },
});
