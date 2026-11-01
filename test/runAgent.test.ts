import { describe, expect, it } from 'vitest';
import { delegationNote, grantedTools, resolveRunAgent, runNeeds, unresolvedReason } from '../src/shared/runAgent';
import { defaultAgent, type ExecProfile } from '../src/shared/execution';
import type { BoardArtifact } from '../src/shared/artifacts';
import { boardState, card, column, sub } from './fakes/board';

// Histórias: spec (só documento) → doing (código) → done. O agente de documento não concede Terminal.
const columns = [
  { ...column('spec', 'wp', 0), aiActive: true, artifactName: 'SPEC.md' },
  { ...column('doing', 'wp', 1), aiActive: true },
  column('done', 'wp', 2, 'done'),
  column('todo', 'wc', 0),
  column('finished', 'wc', 1, 'done'),
];
const agent = (name: string, tools: string[], over: Partial<ExecProfile> = {}): ExecProfile => ({
  ...defaultAgent(),
  id: name,
  name,
  tools,
  isDefault: false,
  scope: 'project',
  ...over,
});
const docs = agent('documentos', ['Read', 'Grep', 'Glob', 'Edit', 'Write']);
const condutor = agent('condutor-do-board', ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash']);
const revisor = agent('revisor', ['Read', 'Bash']);
const state = (execProfiles: ExecProfile[], cards = [card('story', { columnId: 'doing', number: 1 })], artifacts: BoardArtifact[] = []) => {
  const s = boardState({ columns, cards });
  s.board.execProfiles = execProfiles;
  if (artifacts.length) s.harness = { ...s.harness, library: { ...(s.harness.library ?? { artifacts: [] }), artifacts } as never };
  return s;
};

describe('o que a execução de um card pede (runNeeds)', () => {
  it('uma fase de código pede o terminal; uma fase de documento não pede nada (o documento vai pelo MCP)', () => {
    const s = state([], [card('story', { columnId: 'doing', number: 1 }), card('spec', { columnId: 'spec', number: 2 })]);
    expect(runNeeds(s, s.cards[0]!)).toEqual(['shell']);
    expect(runNeeds(s, s.cards[1]!)).toEqual([]);
    // a sub-tarefa segue a fase da história
    const child = sub('c', 'story', 'todo', { number: 3 });
    expect(runNeeds(state([], [s.cards[0]!, child]), child)).toContain('shell');
  });
  it('conflito e desbloqueio são trabalho na branch; refinar, resumir e responder só usam o board', () => {
    const s = state([], [card('spec', { columnId: 'spec', number: 2 })]);
    expect(runNeeds(s, s.cards[0]!, 'conflict')).toContain('shell');
    expect(runNeeds(s, s.cards[0]!, 'unblock')).toContain('shell');
    for (const mode of ['refine', 'summarize', 'reply'] as const) expect(runNeeds(s, s.cards[0]!, mode)).toEqual([]);
  });
  it('soma o que as skills vinculadas ao card pedem', () => {
    const story = card('story', { columnId: 'spec', number: 1 });
    const s = state(
      [],
      [story],
      [{ id: 'k', kind: 'skill', name: 'pesquisar', usage: 'contextual', tools: ['network'], origin: '' } as unknown as BoardArtifact],
    );
    s.fieldDefs = [{ id: 'f', boardId: 'b', name: 'Skills', kind: 'multiselect', options: ['pesquisar'], position: 0 } as never];
    s.fieldValues = [{ cardId: 'story', fieldId: 'f', value: ['pesquisar'] } as never];
    expect(runNeeds(s, story)).toEqual(['network']);
  });
});

describe('o que o agente concede (grantedTools)', () => {
  it('lista nativa traduzida, lista aberta = todas, menos as negadas; uma CLI sem lista por agente concede todas', () => {
    expect(grantedTools(docs)).toEqual(['read', 'search', 'write', 'edit']);
    expect(grantedTools(agent('livre', []))).toBe('all');
    expect(grantedTools(agent('sem-rede', ['Read', 'Bash', 'WebFetch'], { deniedTools: ['WebFetch'] }))).toEqual(['read', 'shell']);
    expect(grantedTools(docs, 'cursor')).toBe('all');
  });
});

describe('o agente capaz da execução (resolveRunAgent)', () => {
  it('o agente do card fica quando concede o que a fase pede', () => {
    const s = state([condutor, docs]);
    s.cards[0]!.execProfile = 'condutor-do-board';
    expect(resolveRunAgent(s, s.cards[0]!)).toMatchObject({ profile: { name: 'condutor-do-board' }, missing: [], unresolved: false });
    // numa fase de documento o agente de documento basta
    const spec = state([condutor, docs], [card('spec', { columnId: 'spec', number: 2, execProfile: 'documentos' })]);
    expect(resolveRunAgent(spec, spec.cards[0]!).delegatedFrom).toBeUndefined();
  });
  it('sem o terminal numa fase de código, delega na ordem fixa: agente da história, padrão do board, condutor, os demais por nome', () => {
    const story = card('story', { columnId: 'doing', number: 1, execProfile: 'revisor' });
    const child = sub('c', 'story', 'todo', { number: 2, execProfile: 'documentos' });
    const byStory = state([condutor, docs, revisor], [story, child]);
    expect(resolveRunAgent(byStory, child)).toMatchObject({
      profile: { name: 'revisor' },
      delegatedFrom: { name: 'documentos' },
      missing: ['shell'],
    });
    const padrao = { ...revisor, id: 'z', name: 'zeta', isDefault: true };
    const docsStory = { ...story, execProfile: 'documentos' };
    expect(resolveRunAgent(state([condutor, docs, padrao], [docsStory]), docsStory).profile?.name).toBe('zeta');
    expect(resolveRunAgent(state([revisor, condutor, docs], [docsStory]), docsStory).profile?.name).toBe('condutor-do-board');
    const beta = { ...revisor, id: 'b', name: 'beta' };
    expect(resolveRunAgent(state([revisor, beta, docs], [docsStory]), docsStory).profile?.name).toBe('beta');
  });
  it('sem nenhum agente capaz, a execução fica sem solução e o motivo diz o que falta e onde resolver', () => {
    const s = state([docs, agent('leitor', ['Read'])], [card('story', { columnId: 'doing', number: 1, execProfile: 'documentos' })]);
    const r = resolveRunAgent(s, s.cards[0]!);
    expect(r).toMatchObject({ profile: { name: 'documentos' }, missing: ['shell'], unresolved: true });
    expect(unresolvedReason(s, s.cards[0]!, r.missing)).toBe(
      'Nenhum agente do board concede Terminal, que a fase doing de #1 pede. Dê a ferramenta a um agente ou crie um (Configurações → Harness → Agentes) e responda aqui: a resposta devolve a vez à IA.',
    );
  });
  it('o desbloqueio parte do agente que quem chama indica', () => {
    const s = state([condutor, docs]);
    expect(resolveRunAgent(s, s.cards[0]!, 'unblock', docs)).toMatchObject({
      profile: { name: 'condutor-do-board' },
      delegatedFrom: { name: 'documentos' },
    });
    expect(resolveRunAgent(s, s.cards[0]!, 'unblock', condutor).delegatedFrom).toBeUndefined();
  });
  it('a nota na história diz a causa em palavras e o caminho para mudar', () => {
    const s = state([condutor, docs]);
    expect(delegationNote(s, s.cards[0]!, docs, condutor, ['shell'])).toBe(
      'A execução de #1 vai com o agente condutor-do-board: o agente documentos não concede Terminal, que a fase doing pede. Para mudar, dê a ferramenta ao agente ou escolha outro agente para o card (Configurações → Harness → Agentes).',
    );
  });
});
