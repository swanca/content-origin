import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * House style, enforced mechanically.
 *
 * Em dashes and typographic quotes are the clearest tell that copy was written
 * by a machine rather than a person, and they drift back in every time a file
 * is edited. A test is the only thing that actually keeps them out.
 */

// fileURLToPath, not .pathname: this project lives in a directory with a
// space in its name, which .pathname percent encodes.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found);
    } else if (/\.(ts|astro|css)$/.test(entry) && !entry.endsWith('.test.ts')) {
      found.push(path);
    }
  }
  return found;
}

const FILES = sourceFiles(SRC);

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  return hits;
}

describe('house style', () => {
  it('finds source files to check', () => {
    expect(FILES.length).toBeGreaterThan(4);
  });

  it('uses no em dashes or en dashes anywhere in the source', () => {
    expect(offenders(/[–—]/)).toEqual([]);
  });

  it('uses no curly quotes or apostrophes', () => {
    expect(offenders(/[‘’“”]/)).toEqual([]);
  });

  it('avoids the stock marketing verbs that read as generated', () => {
    // Deliberately narrow: only words we would never choose on purpose.
    expect(offenders(/\b(seamless|effortlessly|unlock the power|supercharge|game.?chang|delve)/i)).toEqual([]);
  });
});
