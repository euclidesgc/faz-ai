import { describe, expect, it } from 'vitest';
import { reworkOf, type ReworkEventRow } from '../src/extension/log/rework';
import { formatRework } from '../src/extension/mcp/tools/metrics';

// As contas do retrabalho (rework.ts), sem banco: só a sequência de mudanças de status.

const PERIOD = { start: 1000, end: 2000 };
const row = (
  cardNumber: number,
  phase: string,
  at: number,
  from: string,
  to: string,
  over: Partial<ReworkEventRow> = {},
): ReworkEventRow => ({
  cardNumber,
  phase,
  at,
  from,
  to,
  source: to === 'waiting_review' ? 'ai' : 'human',
  model: '',
  ...over,
});

describe('reworkOf', () => {
  it('conta revisões, aprovações e ajustes por fase; "de primeira" é a primeira resposta da pessoa', () => {
    const { phases } = reworkOf(
      [
        // #1 no PRD: devolvido uma vez, aprovado na segunda
        row(1, 'PRD', 1100, 'running', 'waiting_review'),
        row(1, 'PRD', 1200, 'waiting_review', 'ready'),
        row(1, 'PRD', 1300, 'running', 'waiting_review'),
        row(1, 'PRD', 1400, 'waiting_review', 'approved'),
        // #2 no PRD: aprovado de primeira
        row(2, 'PRD', 1150, 'running', 'waiting_review'),
        row(2, 'PRD', 1250, 'waiting_review', 'approved'),
      ],
      PERIOD,
    );
    expect(phases).toEqual([{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1 }]);
  });

  it('a aprovação automática do modo autônomo e as mudanças da IA não são resposta da pessoa', () => {
    const { phases } = reworkOf(
      [row(1, 'Spec', 1100, 'running', 'approved', { source: 'ai' }), row(1, 'Spec', 1200, 'waiting_review', 'ready', { source: 'ai' })],
      PERIOD,
    );
    expect(phases).toEqual([]);
  });

  it('o ajuste conta para o modelo da execução que pediu a revisão respondida', () => {
    const { models } = reworkOf(
      [
        row(1, 'PRD', 1100, 'running', 'waiting_review', { model: 'opus' }),
        row(1, 'PRD', 1200, 'waiting_review', 'ready'),
        row(1, 'PRD', 1300, 'running', 'waiting_review', { model: 'sonnet' }),
        row(1, 'PRD', 1400, 'waiting_review', 'approved'),
      ],
      PERIOD,
    );
    expect(models).toEqual([
      { model: 'opus', reviews: 1, adjusted: 1 },
      { model: 'sonnet', reviews: 1, adjusted: 0 },
    ]);
  });

  it('o que veio antes do período só dá contexto: a revisão de antes não conta, a resposta dentro conta', () => {
    const { phases, models } = reworkOf(
      [
        // pedida antes, aprovada dentro: conta como primeira resposta
        row(3, 'Spec', 900, 'running', 'waiting_review', { model: 'opus' }),
        row(3, 'Spec', 1100, 'waiting_review', 'approved'),
        // já respondida (ajuste) antes do período: a aprovação de dentro não é "de primeira"
        row(4, 'Plan', 800, 'running', 'waiting_review'),
        row(4, 'Plan', 850, 'waiting_review', 'ready'),
        row(4, 'Plan', 900, 'running', 'waiting_review'),
        row(4, 'Plan', 1500, 'waiting_review', 'approved'),
        // depois do período: fora
        row(5, 'PRD', 2500, 'running', 'waiting_review'),
      ],
      PERIOD,
    );
    expect(phases).toEqual([
      { phase: 'Spec', reviews: 0, approved: 1, adjusted: 0, resolved: 1, firstPass: 1 },
      { phase: 'Plan', reviews: 0, approved: 1, adjusted: 0, resolved: 0, firstPass: 0 },
    ]);
    expect(models).toEqual([]);
  });
});

describe('formatRework', () => {
  it('tabela compacta por fase e por modelo, e as histórias com bug', () => {
    const text = formatRework({
      phases: [{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1 }],
      models: [{ model: '', reviews: 3, adjusted: 1 }],
      escapes: { stories: 4, withBugs: 1, bugs: 2 },
    });
    expect(text).toContain('fase  revisões  de primeira  ajustes');
    expect(text).toContain('PRD   3         1 de 2       1');
    expect(text).toContain('não definido');
    expect(text).toContain('histórias concluídas no período: 4; com bug vinculado: 1 (2 bug(s))');
    expect(formatRework({ phases: [], models: [], escapes: { stories: 0, withBugs: 0, bugs: 0 } })).toContain(
      'nenhuma revisão no recorte.',
    );
  });
});
