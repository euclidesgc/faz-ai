import { describe, expect, it } from 'vitest';
import { resolveContextDraft } from '../src/shared/contextDraftResolution';
import { strictRequestFromDraft } from '../src/shared/contextAdmissionPreview';
import type { BoardArtifact } from '../src/shared/artifacts';
import type { ContextActivityTarget } from '../src/shared/contextPlanning';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cardV1 } from '../src/extension/ai/v1Prepare';
import { RunArtifactSnapshots } from '../src/extension/runArtifactSnapshot';
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

describe('aceite do plano em execução (E5)', () => {
  it('a prévia é igual ao que o runtime v1 resolve e ao que o snapshot congela; editar a biblioteca depois não muda o run', () => {
    const s = state();
    const preview = resolveContextDraft(s, target);
    const v1 = cardV1(s, 'claude', target);
    expect(v1.context).toEqual(preview);
    expect(v1.strict.request).toEqual(strictRequestFromDraft(s, preview));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-accept-'));
    try {
      const snapshots = new RunArtifactSnapshots(dir, { list: () => [] } as never, 'b');
      const run = snapshots.capture('run-1', { artifacts: [], inputAttachments: [] } as never, undefined, v1.context);
      expect(run.manifest.context).toEqual(preview);
      s.harness.library.artifacts.push(art('novo', 'skill'));
      expect(run.manifest.context).toEqual(preview);
      expect(resolveContextDraft(s, target)).not.toBe(preview);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('card sem agente com contrato não inicia no runtime v1', () => {
    const s = state();
    s.contextPlanning!.activities = [];
    expect(() => cardV1(s, 'claude', target)).toThrow(/Runtime v1/);
  });

  it('a atividade recebe só a configuração do seu trabalho: Discovery lê, Implementação tem especialista, refino e resumo não herdam (#994)', () => {
    const s = state();

    const [discovery, impl] = ['backlog', 'doing'];
    s.harness.library!.artifacts.push(art('especialista', 'agent'), art('leitor', 'agent'), art('mcp-impl', 'mcp'));
    const contract = (role: string, categories: ('read' | 'edit')[], mcps: string[]) => ({
      version: 1 as const,
      role,
      instructions: '',
      essentialSkillIds: [],
      availableSkillIds: [],
      allowedMcpIds: mcps,
      tools: { categories, native: { tool: '' as const, allow: [], deny: [] } },
    });
    const record = (artifactId: string) => ({ artifactId, revision: 1, updatedAt: 0 });
    s.contextPlanning!.agents = [
      { ...record('leitor'), contract: contract('Leitor', ['read'], []) },
      { ...record('especialista'), contract: contract('Dev', ['read', 'edit'], ['mcp-impl']) },
    ];
    const activity = (phaseId: string, action: 'work' | 'refine' | 'summary', agent: string | null, mcps: string[]) => ({
      id: `${phaseId}-${action}`,
      cardId: null,
      workflowId: null,
      phaseId,
      action,
      revision: 1,
      updatedAt: 0,
      selection: {
        version: 1 as const,
        agent: explicit(agent),
        model: { mode: 'inherit' as const },
        additionalSkillIds: { mode: 'inherit' as const },
        activeMcpIds: explicit(mcps),
        inputAttachmentIds: [],
        expectedResult: '',
      },
    });
    s.contextPlanning!.activities = [
      activity(discovery, 'work', 'leitor', []),
      activity(impl, 'work', 'especialista', ['mcp-impl']),
      activity(impl, 'refine', 'leitor', []),
    ];
    const resolve = (phaseId: string, action: 'work' | 'refine' | 'summary') =>
      resolveContextDraft(s, { cardId: null, workflowId: null, phaseId, action });
    const discoveryWork = resolve(discovery, 'work');
    const implWork = resolve(impl, 'work');
    expect(discoveryWork.agent?.artifactId).toBe('leitor');
    expect(discoveryWork.items.some((i) => i.artifactId === 'mcp-impl')).toBe(false);
    expect(strictRequestFromDraft(s, discoveryWork)!.agentTools.categories).toEqual(['read']);
    expect(implWork.agent?.artifactId).toBe('especialista');
    expect(implWork.items.some((i) => i.artifactId === 'mcp-impl')).toBe(true);
    const implRefine = resolve(impl, 'refine');
    expect(implRefine.items.some((i) => i.artifactId === 'mcp-impl')).toBe(false);
    expect(implRefine.agent?.artifactId).toBe('leitor');
    // o resumo não tem seleção própria nesta fase: não herda o especialista da implementação
    expect(resolve(impl, 'summary').agent?.artifactId).not.toBe('especialista');
  });
});
