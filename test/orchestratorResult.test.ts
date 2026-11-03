import { describe, expect, it } from 'vitest';
import { workResultMessage } from '../src/extension/orchestrator';
import { boardState, sub } from './fakes/board';

describe('retorno da unidade ao principal', () => {
  it('distingue uma tarefa de revisão concluída de uma revisão aprovada', () => {
    const review = sub('review', 'story', 'todo', { number: 2, execProfile: 'reviewer' });
    const state = boardState({
      cards: [review],
      board: {
        ...boardState().board,
        execProfiles: [{ id: 'reviewer', name: 'revisor-de-codigo' } as never],
      },
      fieldDefs: [{ id: 'phase', name: 'Fase' } as never],
      fieldValues: [{ cardId: review.id, fieldId: 'phase', value: 'Revisão' }],
      comments: [
        {
          id: 'verdict',
          cardId: review.id,
          author: 'Revisor',
          source: 'ai',
          body: 'Achado bloqueador encontrado.\nVEREDITO: REPROVADO',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const work = { id: 'work', cardId: review.id } as never;

    const result = workResultMessage(state, work, { kind: 'done' });

    expect(result).toContain('Resultado de #2: concluída.');
    expect(result).toContain('Veredito da revisão: REPROVADO.');
    expect(result).toContain('a História só pode avançar se o veredito for APROVADO');
  });
});
