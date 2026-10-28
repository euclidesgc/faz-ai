import { describe, expect, it } from 'vitest';
import type { Card } from '../src/shared/model';
import { briefBlockedReason, briefFailures, briefGaps, briefKey, briefReason, briefSkeleton, isBriefKey } from '../src/shared/subtaskBrief';

const full = `### Objetivo
Fazer.
### Pronto quando
Passa.
### Pode tocar
- a.ts
### Não pode tocar
- b.ts
`;
const card = (number: number, description: string): Card => ({ id: `c${number}`, number, columnId: 'col', description }) as unknown as Card;

describe('briefGaps', () => {
  it('descrição completa', () => expect(briefGaps(full)).toEqual([]));
  it('sem Pronto quando', () => expect(briefGaps(full.replace('### Pronto quando\nPassa.\n', ''))).toEqual(['Pronto quando']));
  it('título sem texto', () => expect(briefGaps(full.replace('Passa.', ''))).toEqual(['Pronto quando']));
  it('Decisões anteriores é opcional', () => expect(briefGaps(full)).toEqual([]));
  it('vazia ou nula', () => {
    const all = ['Objetivo', 'Pronto quando', 'Pode tocar', 'Não pode tocar'];
    expect(briefGaps('')).toEqual(all);
    expect(briefGaps(null)).toEqual(all);
  });
  it('maiúsculas, nível e acento', () => {
    const d = '### pronto quando\nx\n## PRONTO QUANDO\nx\n# Nao pode tocar\nx\n## objetivo:\nx\n# Pode tocar\nx';
    expect(briefGaps(d)).toEqual([]);
  });
  it('ignora título em bloco de código', () => {
    const d = full.replace('### Pronto quando\nPassa.\n', '```\n### Pronto quando\nPassa.\n```\n');
    expect(briefGaps(d)).toEqual(['Pronto quando']);
  });
  it('comentário HTML conta como vazio', () => {
    expect(briefGaps(full.replace('Passa.', '<!-- preencher -->'))).toEqual(['Pronto quando']);
  });
  it('rótulo só em negrito não conta', () => {
    expect(briefGaps(full.replace('### Pronto quando', '**Pronto quando:**'))).toEqual(['Pronto quando']);
  });
  it('o esqueleto passa na conferência', () => expect(briefGaps(briefSkeleton())).toEqual([]));
});

describe('chave e motivos', () => {
  const story = { id: 's1', number: 10, columnId: 'plan' } as unknown as Card;
  const f13 = { card: card(13, ''), missing: ['Objetivo'] };
  const f12 = { card: card(12, ''), missing: ['Pronto quando', 'Não pode tocar'] };

  it('briefFailures ordena por número', () => {
    expect(briefFailures([card(13, full), card(12, ''), card(11, full)]).map((f) => f.card.number)).toEqual([12]);
    expect(briefFailures([card(13, ''), card(12, '')]).map((f) => f.card.number)).toEqual([12, 13]);
  });
  it('briefKey muda com o conjunto e o handedBack', () => {
    const a = briefKey(story, [f12], 0);
    expect(briefKey(story, [f12, f13], 0)).not.toBe(a);
    expect(briefKey(story, [f12], 1)).not.toBe(a);
    expect(briefKey(story, [f13, f12], 0)).toBe(briefKey(story, [f12, f13], 0));
  });
  it('isBriefKey', () => {
    expect(isBriefKey(briefKey(story, [f12], 0))).toBe(true);
    expect(isBriefKey(JSON.stringify(['story', 's1', 'plan', 10]))).toBe(false);
    expect(isBriefKey('nao-json')).toBe(false);
  });
  it('motivos trazem números e seções', () => {
    for (const text of [briefReason(story, [f12, f13]), briefBlockedReason(story, [f12, f13])]) {
      expect(text).toContain('#12: falta Pronto quando, Não pode tocar.');
      expect(text).toContain('#13: falta Objetivo.');
    }
  });
});
