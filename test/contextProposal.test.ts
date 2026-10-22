import { describe, expect, it } from 'vitest';
import { contextProposalPrompt, parseContextProposal } from '../src/extension/contextProposal';
import { isProposalStale } from '../src/shared/contextProposal';
import type { BoardArtifact } from '../src/shared/artifacts';
import type { ContextActivityTarget } from '../src/shared/contextPlanning';
import { boardState, card, sub } from './fakes/board';

const art = (id: string, kind: BoardArtifact['kind'], over: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id,
  name: id,
  kind,
  description: '',
  body: '',
  usage: 'contextual',
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  path: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const target: ContextActivityTarget = { cardId: 'task', workflowId: null, phaseId: 'todo', action: 'work' };
const explicit = <T>(value: T) => ({ mode: 'explicit' as const, value });
function state() {
  const s = boardState({ cards: [card('story'), sub('task', 'story', 'todo')] });
  s.harness = { ...s.harness, library: { directory: '', artifacts: [art('dev', 'agent'), art('mcp', 'mcp')] } };
  s.contextPlanning = {
    runtime: 'legacy',
    legacy: { version: 0, agents: [], cards: [] },
    agents: [
      {
        artifactId: 'dev',
        revision: 1,
        updatedAt: 0,
        contract: {
          version: 1,
          role: 'Dev',
          instructions: '',
          essentialSkillIds: [],
          availableSkillIds: [],
          allowedMcpIds: ['mcp'],
          tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
        },
      },
    ],
    activities: [
      {
        id: 'board',
        cardId: null,
        workflowId: null,
        phaseId: '',
        action: 'work',
        revision: 1,
        updatedAt: 0,
        selection: {
          version: 1,
          agent: explicit('dev'),
          model: { mode: 'inherit' },
          additionalSkillIds: { mode: 'inherit' },
          activeMcpIds: explicit(['mcp']),
          inputAttachmentIds: [],
          expectedResult: '',
        },
      },
    ],
  };
  return s;
}

function withCatalog() {
  const s = state();
  s.harness.library!.artifacts.push(
    art('essencial', 'skill'),
    art('revisao', 'skill', { description: 'revisar diffs' }),
    art('outro-mcp', 'mcp'),
  );
  s.contextPlanning!.agents[0]!.contract.essentialSkillIds = ['essencial'];
  return s;
}
const answer = (over: object = {}) =>
  JSON.stringify({
    explanation: 'mínimo',
    additionalSkills: [{ id: 'revisao', reason: 'a tarefa revisa um diff' }],
    activeMcps: [{ id: 'mcp', reason: 'precisa do MCP' }],
    ...over,
  });

describe('proposta de plano pela IA (E6.1)', () => {
  it('o prompt só oferece o que o agente permite e não repete as skills essenciais', () => {
    const prompt = contextProposalPrompt(withCatalog(), target, 'pt-BR');
    const data = JSON.parse(prompt.split('\n').pop()!);
    expect(data.candidates.skills.map((c: { id: string }) => c.id)).toEqual(['revisao']);
    expect(data.candidates.mcps.map((c: { id: string }) => c.id)).toEqual(['mcp']);
    expect(data.essentialSkillsAlreadyIncluded.map((c: { id: string }) => c.id)).toEqual(['essencial']);
  });

  it('aceita a proposta válida sem gravar nada no plano', () => {
    const s = withCatalog();
    const before = JSON.stringify(s.contextPlanning);
    const proposal = parseContextProposal('```json\n' + answer() + '\n```', s, target);
    expect(proposal).toMatchObject({ agentId: 'dev', additionalSkills: [{ artifactId: 'revisao' }], activeMcps: [{ artifactId: 'mcp' }] });
    expect(JSON.stringify(s.contextPlanning)).toBe(before);
  });

  it.each([
    ['skill fora do catálogo', { additionalSkills: [{ id: 'inventada', reason: 'x' }] }],
    ['skill essencial repetida', { additionalSkills: [{ id: 'essencial', reason: 'x' }] }],
    ['MCP fora do contrato do agente', { activeMcps: [{ id: 'outro-mcp', reason: 'x' }] }],
    ['item sem justificativa', { additionalSkills: [{ id: 'revisao', reason: ' ' }] }],
    [
      'item repetido',
      {
        additionalSkills: [
          { id: 'revisao', reason: 'a' },
          { id: 'revisao', reason: 'b' },
        ],
      },
    ],
    ['formato inesperado', { activeMcps: 'todos' }],
  ])('proposta inválida não vira rascunho: %s', (_name, over) => {
    expect(() => parseContextProposal(answer(over), withCatalog(), target)).toThrow();
  });

  it('texto sem JSON e atividade sem agente com contrato são recusados', () => {
    expect(() => parseContextProposal('não sei', withCatalog(), target)).toThrow('formato esperado');
    const s = withCatalog();
    s.contextPlanning!.activities = [];
    expect(() => contextProposalPrompt(s, target, 'en')).toThrow('agente');
  });

  it('mudar o texto do card, o agente, o contrato ou o catálogo marca a proposta como desatualizada', () => {
    const fresh = () => {
      const s = withCatalog();
      return { s, proposal: parseContextProposal(answer(), s, target) };
    };
    const base = fresh();
    expect(isProposalStale(base.s, base.proposal)).toBe(false);
    const card1 = fresh();
    card1.s.cards.find((c) => c.id === 'task')!.description = 'agora pede outra coisa';
    expect(isProposalStale(card1.s, card1.proposal)).toBe(true);
    const contract = fresh();
    contract.s.contextPlanning!.agents[0]!.revision = 2;
    expect(isProposalStale(contract.s, contract.proposal)).toBe(true);
    const catalog = fresh();
    catalog.s.harness.library!.artifacts.find((a) => a.id === 'revisao')!.revision = 7;
    expect(isProposalStale(catalog.s, catalog.proposal)).toBe(true);
    const link = fresh();
    link.s.links.push({ id: 'l', fromId: 'task', toId: 'story', kind: 'related' });
    expect(isProposalStale(link.s, link.proposal)).toBe(true);
  });
});
