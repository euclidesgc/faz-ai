import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory, newDatabase } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { all, run } from '../src/extension/db/query';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { ContextPlanningRepo } from '../src/extension/repositories/contextPlanningRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import {
  validateActivityContext,
  validateAgentContext,
  type ActivityContextSelection,
  type AgentContextContract,
  type ContextActivityTarget,
} from '../src/shared/contextPlanning';
import { manifestOf } from '../src/shared/execution';
import { profileOfArtifact, type ArtifactDraft } from '../src/shared/artifacts';

let db: Database;
let dir: string;
let router: MessageRouter;
let repo: ContextPlanningRepo;
let artifacts: ArtifactRepo;
let agentId: string;
let skillId: string;
let mcpId: string;
let cardId: string;
let phaseId: string;
const wasm = path.resolve(__dirname, '../node_modules/sql.js/dist');
const draft = (kind: ArtifactDraft['kind'], name: string, meta: ArtifactDraft['meta'] = {}): ArtifactDraft => ({
  kind,
  name,
  description: '',
  body: 'Instruções',
  meta,
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
});
const contract = (): AgentContextContract => ({
  version: 1,
  role: 'Especialista',
  instructions: 'Implemente e valide.',
  essentialSkillIds: [skillId],
  availableSkillIds: [],
  allowedMcpIds: [],
  tools: { categories: ['read'], native: { tool: 'claude', allow: ['Read'], deny: ['Bash'] } },
});
const selection = (): ActivityContextSelection => ({
  version: 1,
  agent: { mode: 'explicit', value: agentId },
  model: { mode: 'inherit' },
  additionalSkillIds: { mode: 'explicit', value: [] },
  activeMcpIds: { mode: 'inherit' },
  inputAttachmentIds: [],
  expectedResult: 'Testes e evidências',
});
const target = (): ContextActivityTarget => ({ cardId, workflowId: null, phaseId, action: 'work' });
const saveAgent = (value = contract(), expectedRevision = 0) =>
  repo.save(router.boardId, { kind: 'agent', artifactId: agentId, expectedRevision, contract: value });
const saveActivity = (value = selection(), t = target(), expectedRevision = 0) =>
  repo.save(router.boardId, { kind: 'activity', target: t, expectedRevision, selection: value });
const exported = () => exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file;
const importFile = (file = exported()) => importBoard({ db, store: router.store, workspaceKey: 'test', boardId: router.boardId }, file);

/** O host acrescenta biblioteca e perfis depois da leitura do banco. */
function executionState(database: Database) {
  const s = new BoardRepo(database).snapshot(router.boardId);
  const library = new ArtifactRepo(database).list(router.boardId).map((a) => ({ ...a, path: `/board/${a.id}` }));
  s.harness = { ...s.harness, library: { directory: '/board', artifacts: library } };
  s.board.execProfiles = library.filter((a) => a.kind === 'agent').map((a) => profileOfArtifact(a, true));
  return s;
}

beforeEach(async () => {
  db = await openInMemory(wasm);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-context-'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'test',
    folderName: 'Teste',
    author: 'Pessoa',
    attachmentsDir: dir,
  });
  repo = new ContextPlanningRepo(db);
  artifacts = new ArtifactRepo(db);
  skillId = artifacts.upsert(router.boardId, draft('skill', 'testes'));
  mcpId = artifacts.upsert(router.boardId, draft('mcp', 'github', { server: { command: 'github', env: { TOKEN: 'segredo-local' } } }));
  agentId = artifacts.upsert(
    router.boardId,
    draft('agent', 'dev', {
      skills: ['testes', 'ausente'],
      mcpServers: ['github'],
      model: '',
      tools: { categories: ['read'], native: { tool: 'claude', allow: ['Read'], deny: [] } },
    }),
  );
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  phaseId = s.columns.find((c) => c.workflowId === wf.id)!.id;
  cardId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: phaseId,
    parentId: null,
    title: 'Tarefa',
  });
  for (const [name, value] of [
    ['Skills', ['testes', 'ausente']],
    ['MCPs', ['github']],
  ] as const) {
    router.handle({ type: 'field.setValue', cardId, fieldId: s.fieldDefs.find((f) => f.name === name)!.id, value: [...value] });
  }
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('contratos de contexto versionados', () => {
  it('migra o schema 34 sem alterar artefatos, campos ou seleção efetiva', () => {
    const current = exported();
    const old = newDatabase();
    migrate(old, 34);
    // Materializa um board legado a partir das tabelas originais, antes da nova migração.
    const insert = (name: string, rows: Record<string, unknown>[]) => {
      for (const r of rows) {
        if (name === 'board_artifacts' && r.kind === 'mcp')
          r.meta_json = JSON.stringify({ server: { command: 'github', env: { TOKEN: 'segredo-local' } } });
        const keys = Object.keys(r).filter(
          (key) => name !== 'board_artifacts' || !['revision', 'secret_ref', 'review_state'].includes(key),
        );
        old.run(
          `INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          keys.map((key) => r[key]) as (string | number | null)[],
        );
      }
    };
    insert('boards', [{ ...current.board, workspace_key: 'old' }]);
    for (const [name, rows] of Object.entries(current.tables))
      if (!['agent_context_contracts', 'activity_context_selections'].includes(name)) insert(name, rows);
    const before = executionState(db);
    const raw = all(old, 'SELECT * FROM board_artifacts');
    migrate(old);
    const after = executionState(old);
    expect(all(old, "SELECT * FROM board_artifacts WHERE kind != 'mcp'")).toEqual(
      raw.filter((r) => r.kind !== 'mcp').map((row) => ({ ...row, revision: 1, secret_ref: null, review_state: 'legacy' })),
    );
    expect(new ArtifactRepo(old).mcpDefinitions(router.boardId).github).toEqual({ command: 'github', env: { TOKEN: 'segredo-local' } });
    expect(after.fieldValues).toEqual(before.fieldValues);
    expect(manifestOf(before, before.cards[0]!).skills).toContain('testes');
    expect(manifestOf(before, before.cards[0]!).mcpServers).toContain('github');
    expect(manifestOf(after, after.cards[0]!)).toEqual(manifestOf(before, before.cards[0]!));
    expect(after.contextPlanning?.runtime).toBe('legacy');
    expect(after.contextPlanning?.legacy.agents[0]).toEqual({
      artifactId: agentId,
      essentialSkills: [
        { artifactId: skillId, name: 'testes' },
        { artifactId: null, name: 'ausente' },
      ],
      legacyMcps: [{ artifactId: mcpId, name: 'github' }],
    });
    expect(after.contextPlanning?.legacy.cards[0]?.selectedSkills).toHaveLength(2);
    expect(after.contextPlanning?.agents).toEqual([]);
    old.close();
  });

  it('preserva herança, vazio explícito, IDs e versões sem ativar o contrato novo', () => {
    const s = executionState(db);
    const before = manifestOf(s, s.cards[0]!);
    saveAgent();
    saveActivity();
    const after = executionState(db);
    expect(after.contextPlanning?.agents[0]?.contract).toEqual(contract());
    expect(after.contextPlanning?.activities[0]?.selection).toEqual(selection());
    expect(after.contextPlanning?.activities[0]?.phaseId).toBe(phaseId);
    expect(after.contextPlanning?.legacy.cards[0]?.legacyMcps[0]?.name).toBe('github');
    expect(manifestOf(after, after.cards[0]!)).toEqual(before);
  });

  it('não perde o legado quando seus campos mudam depois de um rascunho', () => {
    saveAgent();
    const fieldId = router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.id;
    router.handle({ type: 'field.setValue', cardId, fieldId, value: ['nova-skill'] });
    expect(router.snapshot().contextPlanning?.legacy.cards[0]?.selectedSkills).toEqual([{ artifactId: null, name: 'nova-skill' }]);
    expect(repo.read(router.boardId).agents[0]?.contract).toEqual(contract());
  });

  it('salva revisões e rejeita gravação atrasada atomicamente', () => {
    saveAgent();
    saveActivity();
    const c = { ...contract(), role: 'Revisor' };
    saveAgent(c, 1);
    expect(() => saveAgent(contract(), 1)).toThrow('mudou');
    expect(() => saveActivity({ ...selection(), expectedResult: 'Atrasado' })).toThrow('mudou');
    expect(repo.read(router.boardId).agents[0]?.revision).toBe(2);
    expect(repo.read(router.boardId).agents[0]?.contract.role).toBe('Revisor');
    expect(repo.read(router.boardId).activities[0]?.selection.expectedResult).toBe('Testes e evidências');
  });

  it('separa trabalho, resumo, workflow, fase e assistentes sem card', () => {
    saveActivity();
    saveActivity(selection(), { ...target(), action: 'summary' });
    saveActivity(selection(), { cardId: null, workflowId: null, phaseId: '', action: 'harness-agent' });
    saveActivity(selection(), { cardId: null, workflowId: router.snapshot().cards[0]!.workflowId, phaseId, action: 'work' });
    expect(repo.read(router.boardId).activities).toHaveLength(4);
  });

  it('renomear a fase não muda sua seleção; remover recurso conserva a referência para revisão', () => {
    saveAgent();
    saveActivity();
    run(db, 'UPDATE columns SET name = ? WHERE id = ?', ['Novo nome', phaseId]);
    artifacts.remove(router.boardId, skillId);
    expect(repo.read(router.boardId).activities[0]?.phaseId).toBe(phaseId);
    expect(repo.read(router.boardId).agents[0]?.contract.essentialSkillIds).toEqual([skillId]);
    expect(() => repo.validateBoard(router.boardId)).not.toThrow();
  });

  it('conserva a seleção antiga no backup após mudança de workflow do card', () => {
    saveActivity();
    const otherWorkflow = router.snapshot().workflows.find((w) => w.kind === 'child')!;
    run(db, 'UPDATE cards SET workflow_id = ? WHERE id = ?', [otherWorkflow.id, cardId]);
    expect(() => saveActivity(selection(), target(), 1)).toThrow('workflow');
    const file = exported();
    importFile(parseExportFile(JSON.stringify(file)));
    expect(repo.read(router.boardId).activities[0]?.phaseId).toBe(phaseId);
  });

  it('apagar card ou agente limpa apenas os rascunhos de sua propriedade', () => {
    saveAgent();
    saveActivity();
    saveActivity(selection(), { cardId: null, workflowId: null, phaseId: '', action: 'refine' });
    run(db, 'DELETE FROM cards WHERE id = ?', [cardId]);
    artifacts.remove(router.boardId, agentId);
    const data = repo.read(router.boardId);
    expect(data.agents).toEqual([]);
    expect(data.activities).toHaveLength(1);
    expect(data.activities[0]?.selection.agent).toEqual({ mode: 'explicit', value: agentId });
    expect(() => repo.validateBoard(router.boardId)).not.toThrow();
  });

  it('recusa tipos, proprietários e referências de outros boards', () => {
    const other = new BoardRepo(db).getOrCreate('outro', 'Outro').id;
    const foreign = artifacts.upsert(other, draft('skill', 'externa'));
    expect(() => saveAgent({ ...contract(), essentialSkillIds: [mcpId] })).toThrow('incompatível');
    expect(() => saveAgent({ ...contract(), allowedMcpIds: [foreign] })).toThrow('incompatível');
    expect(() => repo.save(other, { kind: 'agent', artifactId: agentId, expectedRevision: 0, contract: contract() })).toThrow(
      'fora do board',
    );
    const foreignPhase = new BoardRepo(db).snapshot(other).columns[0]!.id;
    expect(() => saveActivity(selection(), { ...target(), phaseId: foreignPhase })).toThrow('fora do board');
    expect(repo.read(router.boardId)).toEqual({ agents: [], activities: [] });
  });

  it('valida no host e recusa que a IA altere contratos', () => {
    expect(() =>
      router.handle(
        { type: 'contextPlanning.save', input: { kind: 'agent', artifactId: agentId, expectedRevision: 0, contract: contract() } },
        { source: 'ai' },
      ),
    ).toThrow('revisão humana');
    const next = router.handle({
      type: 'contextPlanning.save',
      input: { kind: 'agent', artifactId: agentId, expectedRevision: 0, contract: contract() },
    });
    expect(next.contextPlanning?.agents[0]?.revision).toBe(1);
  });

  it('salva lote revisado por ação e preserva justificativa no export/import', () => {
    const inputs = (['work', 'refine'] as const).map((action) => ({
      kind: 'activity' as const,
      target: { ...target(), action },
      expectedRevision: 0,
      selection: { ...selection(), expectedResult: action },
      reason: `Revisado para ${action}`,
    }));
    router.handle({ type: 'contextPlanning.saveBatch', inputs });
    const before = repo.read(router.boardId).activities;
    expect(before).toHaveLength(2);
    expect(before.every((a) => a.revision === 1 && a.reason === `Revisado para ${a.action}`)).toBe(true);
    importFile(parseExportFile(JSON.stringify(exported())));
    expect(repo.read(router.boardId).activities).toEqual(before);
  });

  it('reverte todo o lote quando a segunda atividade tem revisão atrasada', () => {
    saveActivity();
    const before = repo.read(router.boardId);
    expect(() =>
      repo.saveBatch(router.boardId, [
        { kind: 'activity', target: { ...target(), action: 'refine' }, expectedRevision: 0, selection: selection() },
        { kind: 'activity', target: target(), expectedRevision: 0, selection: selection() },
      ]),
    ).toThrow('mudou');
    expect(repo.read(router.boardId)).toEqual(before);
  });

  it('recusa duplicação de alvos mesmo com ordem diferente das propriedades e escrita por IA', () => {
    const input = { kind: 'activity' as const, target: target(), expectedRevision: 0, selection: selection() };
    const reordered = { action: 'work' as const, phaseId, workflowId: null, cardId };
    expect(() => repo.saveBatch(router.boardId, [input, { ...input, target: reordered }])).toThrow('mesma atividade');
    expect(() => router.handle({ type: 'contextPlanning.saveBatch', inputs: [input] }, { source: 'ai' })).toThrow('revisão humana');
    expect(repo.read(router.boardId).activities).toEqual([]);
  });

  it('valida justificativas antes de salvar ou substituir o board por importação', () => {
    const input = { kind: 'activity' as const, target: target(), expectedRevision: 0, selection: selection() };
    for (const reason of ['x'.repeat(4001), 'inválida\0'])
      expect(() => repo.saveBatch(router.boardId, [{ ...input, reason }])).toThrow('Justificativa');
    repo.saveBatch(router.boardId, [{ ...input, reason: 'Revisão humana' }]);
    const before = repo.read(router.boardId);
    const file = exported();
    file.tables.activity_context_selections![0]!.review_reason = 'x'.repeat(4001);
    expect(() => parseExportFile(JSON.stringify(file))).toThrow('Justificativa');
    expect(repo.read(router.boardId)).toEqual(before);
  });

  it('migra seleções do schema 36 mantendo revisões e resultado sem inventar justificativa', () => {
    const old = newDatabase();
    migrate(old, 36);
    const board = { ...exported().board, workspace_key: 'old' };
    const keys = Object.keys(board);
    old.run(`INSERT INTO boards (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, Object.values(board));
    old.run(
      `INSERT INTO activity_context_selections (id, board_id, card_id, workflow_id, phase_id, action, revision, selection_json, updated_at)
      VALUES (?, ?, NULL, NULL, '', 'work', 4, ?, 1)`,
      ['old', router.boardId, JSON.stringify(selection())],
    );
    migrate(old);
    expect(new ContextPlanningRepo(old).read(router.boardId).activities[0]).toMatchObject({ revision: 4, selection: selection() });
    expect(new ContextPlanningRepo(old).read(router.boardId).activities[0]!.reason).toBeUndefined();
    old.close();
  });

  it('export/import preserva contrato e revisões, esvazia credenciais e mantém o manifesto', () => {
    saveAgent();
    saveAgent(contract(), 1);
    saveActivity();
    const before = router.snapshot().contextPlanning;
    const file = exported();
    expect(JSON.stringify(file)).not.toContain('segredo-local');
    importFile(parseExportFile(JSON.stringify(file)));
    expect(router.snapshot().contextPlanning).toEqual(before);
    expect(repo.read(router.boardId).agents[0]?.revision).toBe(2);
  });

  it('preserva revisões dos artefatos e recusa revisão inválida antes do import', () => {
    artifacts.upsert(router.boardId, draft('skill', 'testes'));
    const revision = artifacts.get(router.boardId, 'skill', 'testes')!.revision;
    expect(revision).toBe(2);
    const file = exported();
    importFile(parseExportFile(JSON.stringify(file)));
    expect(artifacts.get(router.boardId, 'skill', 'testes')!.revision).toBe(revision);
    file.tables.board_artifacts![0]!.revision = -1;
    expect(() => parseExportFile(JSON.stringify(file))).toThrow('revisão de artefato');
  });

  it('a prévia do host usa contratos salvos e retorna somente metadados dos artefatos', () => {
    saveAgent();
    saveActivity();
    const preview = router.previewContextDraft(target());
    expect(preview.agent).toEqual({ artifactId: agentId, revision: 1 });
    expect(preview.items.some((a) => a.artifactId === skillId)).toBe(true);
    expect(preview.canExecute).toBe(false);
    expect(JSON.stringify(preview)).not.toContain('segredo-local');
    expect(JSON.stringify(preview)).not.toContain('Implemente e valide.');
    expect(JSON.stringify(preview)).not.toContain('Instruções');
  });

  it('import antigo sem tabelas novas permanece legado', () => {
    const file = exported();
    file.schemaVersion = 34;
    delete file.tables.agent_context_contracts;
    delete file.tables.activity_context_selections;
    importFile(parseExportFile(JSON.stringify(file)));
    expect(repo.read(router.boardId)).toEqual({ agents: [], activities: [] });
    expect(router.snapshot().contextPlanning?.legacy.cards[0]?.selectedSkills).toHaveLength(2);
  });

  it('import inválido falha antes de substituir o board, inclusive sem passar pelo parser', () => {
    saveAgent();
    saveActivity();
    const before = repo.read(router.boardId);
    const file = exported();
    file.tables.agent_context_contracts![0]!.contract_json = JSON.stringify({ ...contract(), version: 2 });
    expect(() => parseExportFile(JSON.stringify(file))).toThrow('versão');
    expect(() => importFile(file)).toThrow('versão');
    expect(repo.read(router.boardId)).toEqual(before);
  });

  it('rejeita campos desconhecidos que poderiam transportar definições ou credenciais', () => {
    expect(() => validateAgentContext({ ...contract(), server: { env: { TOKEN: 'oculto' } } })).toThrow('inválida');
    expect(() => validateActivityContext({ ...selection(), activeMcpIds: { mode: 'inherit', value: [mcpId] } })).toThrow('inválida');
    expect(() => validateAgentContext({ ...contract(), essentialSkillIds: [skillId, skillId] })).toThrow('inválida');
    expect(() => validateActivityContext({ ...selection(), version: 7 })).toThrow('versão');
    expect(() =>
      saveAgent({
        ...contract(),
        tools: { ...contract().tools, native: { ...contract().tools.native, tool: {} } },
      } as unknown as AgentContextContract),
    ).toThrow('inválida');
  });
});
