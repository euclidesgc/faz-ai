import { describe, expect, it } from 'vitest';
import { USAGE_LIMIT_TEXT, activeComments, commentsSinceSummary } from '../src/shared/conversation';
import type { Comment } from '../src/shared/model';

const msg = (id: string, cardId: string, kind?: 'summary'): Comment => ({
  id,
  cardId,
  author: 'A',
  source: 'ai',
  body: id,
  createdAt: 1,
  updatedAt: 1,
  ...(kind ? { kind } : {}),
});

describe('conversa a partir do último resumo', () => {
  const all = [
    msg('a', 'c1'),
    msg('b', 'c1'),
    msg('s1', 'c1', 'summary'),
    msg('c', 'c1'),
    msg('s2', 'c1', 'summary'),
    msg('d', 'c1'),
    msg('x', 'c2'),
  ];

  it('a IA recebe o último resumo e o que veio depois; sem resumo, tudo', () => {
    expect(activeComments(all, 'c1').map((c) => c.id)).toEqual(['s2', 'd']);
    expect(activeComments(all, 'c2').map((c) => c.id)).toEqual(['x']);
    expect(commentsSinceSummary(all, 'c1').map((c) => c.id)).toEqual(['d']);
    expect(commentsSinceSummary(all, 'c2').map((c) => c.id)).toEqual(['x']);
  });

  it('reconhece os textos de limite de uso das ferramentas, inclusive o da CLI atual do Claude Code', () => {
    for (const text of [
      "You've hit your limit · resets 3pm",
      'Claude AI usage limit reached',
      'rate limit',
      'provider.auth_error 403 usage limit',
      'O limite de uso do plano esgotou',
    ])
      expect(USAGE_LIMIT_TEXT.test(text)).toBe(true);
    expect(USAGE_LIMIT_TEXT.test('Falta acesso ao repositório.')).toBe(false);
  });
});
