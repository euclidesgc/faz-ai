import { describe, expect, it } from 'vitest';
import { USAGE_LIMIT_TEXT, AI_CONVERSATION_LIMIT, activeComments, commentsSinceSummary, contextComments } from '../src/shared/conversation';
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

describe('contextComments: limite da conversa enviada à IA', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => msg(`m${i}`, 'c1'));

  it('o limite é 20', () => expect(AI_CONVERSATION_LIMIT).toBe(20));

  it('sem resumo, corta nas últimas 20 e informa as omitidas', () => {
    const r = contextComments(many(25), 'c1');
    expect(r.comments).toHaveLength(20);
    expect(r.comments[0]!.id).toBe('m5');
    expect(r.omitted).toBe(5);
  });

  it('exatamente 20 e menos de 20: sem aviso', () => {
    expect(contextComments(many(20), 'c1')).toMatchObject({ omitted: 0 });
    expect(contextComments(many(20), 'c1').comments).toHaveLength(20);
    expect(contextComments(many(3), 'c1')).toMatchObject({ omitted: 0 });
  });

  it('com resumo curto, mantém como está', () => {
    const all = [...many(30), msg('s', 'c1', 'summary'), msg('d', 'c1')];
    const r = contextComments(all, 'c1');
    expect(r.comments.map((c) => c.id)).toEqual(['s', 'd']);
    expect(r.omitted).toBe(0);
  });

  it('com resumo e mais de 20 depois, o resumo nunca é cortado', () => {
    const all = [msg('s', 'c1', 'summary'), ...many(25)];
    const r = contextComments(all, 'c1');
    expect(r.comments).toHaveLength(20);
    expect(r.comments[0]!.id).toBe('s');
    expect(r.comments[1]!.id).toBe('m6');
    expect(r.omitted).toBe(6);
  });

  it('activeComments segue sem corte', () => {
    expect(activeComments(many(25), 'c1')).toHaveLength(25);
  });
});
