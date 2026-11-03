// The bundled DotGothic16 subset must cover every character the game prints (rerun scripts/subset-font.mjs if not).
import { describe, it, expect } from 'vitest';
import subsetChars from '../../src/assets/fonts/subset-chars.txt?raw';

const sources = import.meta.glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('bundled font subset', () => {
  it('covers all characters used in src/', () => {
    const have = new Set(subsetChars);
    const missing = new Set<string>();
    for (const text of Object.values(sources)) for (const ch of text) if (ch.codePointAt(0)! > 0x7e && ch.trim() && !have.has(ch)) missing.add(ch);
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect([...missing].join(''), 'run: node scripts/subset-font.mjs').toBe('');
  });
});
