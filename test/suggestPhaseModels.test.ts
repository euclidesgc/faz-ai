import { describe, expect, it } from 'vitest';
import { suggestPhaseModels } from '../src/shared/suggestPhaseModels';
import type { BoardState, Column } from '../src/shared/model';
import type { ModelOption } from '../src/shared/models';

const model = (name: string, efforts: string[], isDefault = false): ModelOption => ({
  id: `claude:${name}`,
  tool: 'claude',
  model: name,
  label: name,
  efforts,
  defaultEffort: null,
  ...(isDefault ? { default: true as const } : {}),
});
const col = (name: string, position: number, extra: Partial<Column> = {}): Column =>
  ({ id: name, name, position, workflowId: 'w', category: 'open', aiActive: true, artifactName: '', phaseModel: null, ...extra }) as Column;
const makeState = (columns: Column[]): BoardState =>
  ({
    workflows: [{ id: 'w', kind: 'parent' }],
    columns,
    board: {
      aiTool: 'claude',
      aiProfiles: [],
      modelCatalog: [model('barato', []), model('padrao', ['low', 'medium', 'high'], true), model('forte', ['high'])],
      modelLadders: { claude: ['claude:barato', 'claude:forte@high'] },
    },
  }) as unknown as BoardState;
const values = (state: BoardState) => suggestPhaseModels(state, 'w').map(({ columnId, value }) => [columnId, value]);

describe('sugestão de modelos por fase', () => {
  it('classifica pela ordem, preserva o snapshot e reconhece nomes normalizados', () => {
    const state = makeState([
      col('Fim', 7, { category: 'done' }),
      col('Homologação', 6, { artifactName: 'fim.md' }),
      col('Depois', 5, { artifactName: 'doc.md' }),
      col('REVISÃO', 4, { artifactName: 'rev.md' }),
      col('Execução', 3),
      col('Implementação', 2),
      col('Anterior', 1),
      col('Desligada', 0, { aiActive: false }),
    ]);
    const before = structuredClone(state);
    expect(values(state)).toEqual([
      ['Desligada', null],
      ['Anterior', 'claude:forte@high'],
      ['Implementação', null],
      ['Execução', null],
      ['REVISÃO', null],
      ['Depois', 'claude:forte@high'],
      ['Homologação', 'claude:barato'],
      ['Fim', null],
    ]);
    expect(state).toEqual(before);
  });

  it('filtra degraus inválidos, duplicados e de outra ferramenta antes de escolher', () => {
    const state = makeState([col('Plano', 0), col('Final', 1)]);
    state.board.modelLadders.claude = ['outra:x', 'claude:barato', 'claude:barato', 'claude:forte@low', 'claude:forte@high'];
    expect(values(state)).toEqual([
      ['Plano', 'claude:forte@high'],
      ['Final', 'claude:barato'],
    ]);
  });

  it('com menos de dois degraus usa o padrão e seus esforços extremos', () => {
    const state = makeState([col('Plano', 0), col('Final', 1)]);
    for (const ladder of [[], ['claude:barato']]) {
      state.board.modelLadders.claude = ladder;
      expect(values(state)).toEqual([
        ['Plano', 'claude:padrao@high'],
        ['Final', 'claude:padrao@low'],
      ]);
    }
    state.board.modelCatalog = [model('padrao', ['min', 'max'], true)];
    expect(values(state)).toEqual([
      ['Plano', 'claude:padrao@max'],
      ['Final', 'claude:padrao@min'],
    ]);
    state.board.modelCatalog = [model('padrao', [], true)];
    expect(values(state)).toEqual([
      ['Plano', 'claude:padrao'],
      ['Final', 'claude:padrao'],
    ]);
    state.board.modelCatalog = [model('padrao', [])];
    expect(values(state)).toEqual([
      ['Plano', null],
      ['Final', null],
    ]);
    state.board.modelCatalog = [];
    expect(values(state)).toEqual([
      ['Plano', null],
      ['Final', null],
    ]);
  });

  it('usa a escada do perfil copiado e o catálogo da ferramenta de origem', () => {
    const state = makeState([col('Plano', 0), col('Final', 1)]);
    state.board.aiTool = 'copia';
    state.board.aiProfiles = [{ id: 'copia', tool: 'claude', enabled: true }] as BoardState['board']['aiProfiles'];
    state.board.modelLadders.copia = ['claude:barato', 'claude:forte@high'];
    expect(values(state)).toEqual([
      ['Plano', 'claude:forte@high'],
      ['Final', 'claude:barato'],
    ]);
  });

  it('trata workflow filho, inexistente, vazio e última elegível documental ou de revisão', () => {
    const state = makeState([col('Plano', 0), col('Revisão', 1, { artifactName: 'rev.md' })]);
    expect(values(state)).toEqual([
      ['Plano', 'claude:forte@high'],
      ['Revisão', null],
    ]);
    state.columns = [col('Documento', 0, { artifactName: 'doc.md' })];
    expect(values(state)).toEqual([['Documento', 'claude:barato']]);
    state.workflows[0]!.kind = 'child';
    expect(values(state)).toEqual([['Documento', null]]);
    expect(suggestPhaseModels(state, 'ausente')).toEqual([]);
    state.columns = [];
    expect(suggestPhaseModels(state, 'w')).toEqual([]);
  });

  it('sem coluna de código usa a última elegível e informa o motivo de cada escolha', () => {
    const state = makeState([
      col('Planejar', 0),
      col('Documentar', 1, { artifactName: 'doc.md' }),
      col('Cancelada', 2, { category: 'cancelled' }),
    ]);
    expect(suggestPhaseModels(state, 'w')).toEqual([
      { columnId: 'Planejar', value: 'claude:forte@high', reason: 'Planejamento usa o topo da escada.' },
      { columnId: 'Documentar', value: 'claude:barato', reason: 'Homologação usa o degrau mais barato da escada.' },
      { columnId: 'Cancelada', value: null, reason: 'Coluna sem atuação da IA.' },
    ]);
  });
});
