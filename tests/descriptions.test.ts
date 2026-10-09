/** M5 の完了条件：全部品に説明パネルの内容（説明・確度・根拠）がある。 */
import { describe, expect, it } from 'vitest';
import { describePart } from '../src/model/descriptions';
import { buildParts } from '../src/model/parts';

const parts = buildParts(undefined, 'all');

describe('説明パネル', () => {
  it('全部品（両方のヘッダを含む）に説明がある', () => {
    expect(parts.filter((p) => !describePart(p.id)).map((p) => p.id)).toEqual([]);
  });
  it('全部品に確度と根拠がある', () => {
    for (const p of parts) {
      expect(['source', 'estimate', 'design'], p.id).toContain(p.meta.confidence);
      expect(p.meta.source.length, p.id).toBeGreaterThan(0);
    }
  });
});
