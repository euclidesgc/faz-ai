import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { BOARD_TEMPLATE_VERSION, pendingUpgrade, upgradeBoard } from '../src/extension/db/boardTemplate';
import { run } from '../src/extension/db/query';
import { HOMOLOGATION_INSTRUCTION_V4, PHASE_DEFAULTS, PHASE_HISTORY } from '../src/shared/phaseDefaults';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { SettingsRepo } from '../src/extension/repositories/settingsRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boards: BoardRepo;
let boardId: string;

const snap = () => boards.snapshot(boardId);
const col = (name: string, kind: 'parent' | 'child' = 'parent') => {
  const s = snap();
  return s.columns.find((c) => c.name === name && s.workflows.find((w) => w.id === c.workflowId)!.kind === kind)!;
};
const places = () =>
  snap()
    .cards.map((c) => [c.title, c.columnId, c.position, c.status])
    .sort();

/** Deixa o board como os criados antes do status de card: sem Discovery, Revisão e Homologação, colunas sem papel da IA nem fase, e versão 0. */
beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  boardId = boards.getOrCreate('ws', 'Projeto').id;
  db.run("DELETE FROM columns WHERE name IN ('Discovery', 'Revisão', 'Homologação')");
  db.run("UPDATE columns SET ai_active = 0, requires_approval = 0, ai_instruction = '', artifact_name = '', artifact_template = ''");
  db.run(`UPDATE field_defs SET options_json = '["PRD","Spec","Plan","Implementação"]' WHERE name = 'Fase'`);
  db.run('UPDATE boards SET template_version = 0');
  db.run('UPDATE cards SET status = NULL');
});

describe('atualização do board para o padrão atual', () => {
  it('um board novo já nasce no padrão atual', async () => {
    const fresh = new BoardRepo(await openInMemory(WASM_DIR));
    const s = fresh.snapshot(fresh.getOrCreate('ws', 'Projeto').id);
    expect(s.board.templateVersion).toBe(BOARD_TEMPLATE_VERSION);
    expect(s.pendingUpgrade).toEqual([]);
    expect(s.columns.filter((c) => c.requiresApproval).map((c) => c.name)).toEqual(['Discovery', 'PRD', 'Spec', 'Plan', 'Homologação']);
    expect(
      s.columns
        .filter((c) => c.aiActive)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['A fazer', 'Discovery', 'Em andamento', 'Homologação', 'Implementação', 'PRD', 'Plan', 'Revisão', 'Spec']);
    expect(s.columns.find((c) => c.name === 'PRD')).toMatchObject({ artifactName: 'PRD.md' });
    expect(s.columns.find((c) => c.name === 'Discovery')!.aiInstruction).toContain('ask_question');
    expect(s.fieldDefs.find((f) => f.name === 'Fase')!.options).toEqual([
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação',
    ]);
  });

  it('completa as colunas sem mover cards nem mexer no que foi personalizado', () => {
    const cards = new CardRepo(db);
    const settings = new SettingsRepo(db);
    const s = snap();
    const story = s.cardTypes.find((t) => t.name === 'História')!.id;
    const sub = s.cardTypes.find((t) => t.name === 'Sub-tarefa')!.id;
    // personalizações: coluna renomeada, coluna criada pela pessoa e uma coluna já configurada à mão
    settings.updateColumn(col('PRD').id, { name: 'Requisitos' });
    const custom = settings.createColumn(s.workflows.find((w) => w.kind === 'parent')!.id, 'Revisão de segurança', 99); // no fim da linha
    settings.updateColumn(col('Spec').id, { aiActive: true });
    const parents = ['Backlog', 'Requisitos', 'Spec', 'Plan', 'Implementação', 'Concluído'].map((name, i) => {
      const id = cards.create(boardId, { typeId: story, columnId: col(name).id, parentId: null, title: `H${i}` });
      cards.create(boardId, { typeId: story, columnId: col(name).id, parentId: null, title: `H${i}b` });
      return id;
    });
    cards.create(boardId, { typeId: story, columnId: custom, parentId: null, title: 'Custom' });
    cards.create(boardId, { typeId: sub, columnId: col('Em andamento', 'child').id, parentId: parents[0]!, title: 'Sub' });
    const before = places();

    expect(pendingUpgrade(db, boardId)).toEqual([
      'Coluna "Plan": a IA atua e só avança o card com a sua aprovação.',
      'Coluna "Implementação": a IA atua.',
      'Coluna "A fazer": a IA atua.',
      'Coluna "Em andamento": a IA atua.',
      'Nova coluna "Discovery" depois do Backlog: a IA analisa o problema e conversa com você antes do PRD.',
      'Nova coluna "Homologação" antes da conclusão: a história só é concluída com a sua aprovação.',
      'Coluna "Spec": instrução para a IA e modelo do documento SPEC.md.',
      'Coluna "Plan": instrução para a IA e modelo do documento PLAN.md.',
      'Coluna "Implementação": instrução para a IA.',
      'Campo "Fase" das sub-tarefas: novas opções Discovery e Homologação.',
      'Nova coluna "Revisão" entre a Implementação e a Homologação: a IA roda as checagens do projeto e revisa o código antes do pull request, corrige o que tem diretriz e pergunta o que é ambíguo.',
      'Campo "Fase" das sub-tarefas: nova opção Revisão.',
    ]);
    upgradeBoard(db, boardId);

    expect(places()).toEqual(before);
    expect(snap().board.templateVersion).toBe(BOARD_TEMPLATE_VERSION);
    expect(col('Plan')).toMatchObject({ aiActive: true, requiresApproval: true });
    expect(col('Implementação')).toMatchObject({ aiActive: true, requiresApproval: false });
    expect(col('Em andamento', 'child')).toMatchObject({ aiActive: true, requiresApproval: false });
    expect(col('Requisitos')).toMatchObject({ aiActive: false, requiresApproval: false }); // renomeada: não é mais a coluna do padrão
    expect(col('Spec')).toMatchObject({ aiActive: true, requiresApproval: false }); // já configurada pela pessoa
    expect(col('Revisão de segurança')).toMatchObject({ aiActive: false, requiresApproval: false });
    // colunas novas entram no lugar certo, já configuradas; as demais só são renumeradas
    const s2 = snap();
    const parentWf = s2.workflows.find((w) => w.kind === 'parent')!.id;
    expect(s2.columns.filter((c) => c.workflowId === parentWf).map((c) => c.name)).toEqual([
      'Backlog',
      'Discovery',
      'Requisitos',
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação',
      'Concluído',
      'Cancelado',
      'Revisão de segurança',
    ]);
    expect(col('Discovery')).toMatchObject({ aiActive: true, requiresApproval: true, artifactName: 'DISCOVERY.md' });
    expect(col('Homologação')).toMatchObject({ aiActive: true, requiresApproval: true, artifactName: '' });
    expect(col('Revisão')).toMatchObject({ aiActive: true, requiresApproval: false, artifactName: '' });
    expect(col('Revisão').aiInstruction).toContain('revisor-de-codigo');
    expect(col('Requisitos')).toMatchObject({ aiInstruction: '', artifactName: '' });
    expect(col('Plan').artifactTemplate).toContain('# Plano');
    expect(s2.fieldDefs.find((f) => f.name === 'Fase')!.options).toEqual([
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação',
    ]);

    // rodar de novo não muda nada
    expect(pendingUpgrade(db, boardId)).toEqual([]);
    const after = JSON.stringify(snap());
    upgradeBoard(db, boardId);
    expect(JSON.stringify(snap())).toBe(after);
  });

  it('versão 4: a Homologação com a instrução padrão antiga passa a pedir o roteiro "Como testar"; a personalizada fica', () => {
    upgradeBoard(db, boardId);
    const settings = new SettingsRepo(db);
    settings.updateColumn(col('Homologação').id, { aiInstruction: HOMOLOGATION_INSTRUCTION_V4 });
    run(db, 'UPDATE boards SET template_version = 4 WHERE id = ?', [boardId]);
    expect(pendingUpgrade(db, boardId)).toEqual([
      'Coluna "Homologação": a instrução passa a pedir o roteiro "Como testar" na descrição do card e no pull request.',
    ]);
    upgradeBoard(db, boardId);
    expect(col('Homologação').aiInstruction).toBe(PHASE_DEFAULTS['Homologação']!.instruction);
    expect(col('Homologação').aiInstruction).toContain('Como testar');

    settings.updateColumn(col('Homologação').id, { aiInstruction: 'minha instrução' });
    run(db, 'UPDATE boards SET template_version = 4 WHERE id = ?', [boardId]);
    expect(pendingUpgrade(db, boardId)).toEqual([]);
  });

  it('versão 6: as fases com o texto padrão da 0.35 recebem o atual; o que a pessoa personalizou fica', () => {
    upgradeBoard(db, boardId);
    const settings = new SettingsRepo(db);
    settings.updateColumn(col('Spec').id, {
      aiInstruction: PHASE_HISTORY['Spec']!.instructions[0]!,
      artifactTemplate: PHASE_HISTORY['Spec']!.templates[0]!,
    });
    settings.updateColumn(col('Homologação').id, { aiInstruction: PHASE_HISTORY['Homologação']!.instructions[0]! });
    // o Plan com a instrução antiga, mas o modelo do documento personalizado: só a instrução muda
    settings.updateColumn(col('Plan').id, { aiInstruction: PHASE_HISTORY['Plan']!.instructions[0]!, artifactTemplate: '# Meu plano' });
    settings.updateColumn(col('PRD').id, { aiInstruction: 'minha instrução de PRD' });
    run(db, 'UPDATE boards SET template_version = 5 WHERE id = ?', [boardId]);

    expect(pendingUpgrade(db, boardId)).toEqual([
      `Coluna "Spec": ${PHASE_HISTORY['Spec']!.change}.`,
      `Coluna "Plan": ${PHASE_HISTORY['Plan']!.change}.`,
      `Coluna "Homologação": ${PHASE_HISTORY['Homologação']!.change}.`,
    ]);
    upgradeBoard(db, boardId);
    expect(col('Spec')).toMatchObject({
      aiInstruction: PHASE_DEFAULTS['Spec']!.instruction,
      artifactTemplate: PHASE_DEFAULTS['Spec']!.artifactTemplate,
    });
    expect(col('Spec').artifactTemplate).toContain('```mermaid');
    expect(col('Plan')).toMatchObject({ aiInstruction: PHASE_DEFAULTS['Plan']!.instruction, artifactTemplate: '# Meu plano' });
    expect(col('Homologação').aiInstruction).toContain('**Decisões**');
    expect(col('PRD').aiInstruction).toBe('minha instrução de PRD');
    expect(pendingUpgrade(db, boardId)).toEqual([]);
  });

  it('versão 7: o board na 6 ganha a coluna Revisão depois da Implementação, e a opção dela no campo Fase', () => {
    upgradeBoard(db, boardId);
    db.run("DELETE FROM columns WHERE name = 'Revisão'");
    db.run(`UPDATE field_defs SET options_json = '["Discovery","PRD","Spec","Plan","Implementação","Homologação"]' WHERE name = 'Fase'`);
    run(db, 'UPDATE boards SET template_version = 6 WHERE id = ?', [boardId]);
    const before = places();
    expect(pendingUpgrade(db, boardId)).toEqual([
      'Nova coluna "Revisão" entre a Implementação e a Homologação: a IA roda as checagens do projeto e revisa o código antes do pull request, corrige o que tem diretriz e pergunta o que é ambíguo.',
      'Campo "Fase" das sub-tarefas: nova opção Revisão.',
    ]);
    upgradeBoard(db, boardId);
    const s = snap();
    const parentWf = s.workflows.find((w) => w.kind === 'parent')!.id;
    const names = s.columns.filter((c) => c.workflowId === parentWf).map((c) => c.name);
    expect(names.slice(names.indexOf('Implementação'), names.indexOf('Implementação') + 3)).toEqual([
      'Implementação',
      'Revisão',
      'Homologação',
    ]);
    expect(col('Revisão').aiInstruction).toBe(PHASE_DEFAULTS['Revisão']!.instruction);
    expect(s.fieldDefs.find((f) => f.name === 'Fase')!.options).toEqual([
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação',
    ]);
    expect(places()).toEqual(before);
    expect(pendingUpgrade(db, boardId)).toEqual([]);
  });

  it('versão 7: com a Implementação renomeada, a Revisão entra antes da Homologação; uma coluna "Revisão" da pessoa não é duplicada', () => {
    upgradeBoard(db, boardId);
    db.run("DELETE FROM columns WHERE name = 'Revisão'");
    new SettingsRepo(db).updateColumn(col('Implementação').id, { name: 'Código' });
    run(db, 'UPDATE boards SET template_version = 6 WHERE id = ?', [boardId]);
    upgradeBoard(db, boardId);
    const s = snap();
    const parentWf = s.workflows.find((w) => w.kind === 'parent')!.id;
    const names = s.columns.filter((c) => c.workflowId === parentWf).map((c) => c.name);
    expect(names.indexOf('Revisão')).toBe(names.indexOf('Homologação') - 1);

    run(db, 'UPDATE boards SET template_version = 6 WHERE id = ?', [boardId]);
    expect(pendingUpgrade(db, boardId)).toEqual([]);
  });

  it('versão 8: o board ganha o campo Criticidade nas histórias, sem duplicar um campo de mesmo nome', () => {
    upgradeBoard(db, boardId);
    db.run("DELETE FROM field_defs WHERE name = 'Criticidade'");
    run(db, 'UPDATE boards SET template_version = 7 WHERE id = ?', [boardId]);
    expect(pendingUpgrade(db, boardId)).toEqual([
      'Novo campo "Criticidade" das histórias (Núcleo ou Periferia): a história do núcleo espera a sua aprovação nas fases que pedem aprovação, mesmo no modo autônomo.',
    ]);
    upgradeBoard(db, boardId);
    const s = snap();
    const field = s.fieldDefs.find((f) => f.name === 'Criticidade')!;
    expect(field).toMatchObject({ kind: 'select', options: ['Núcleo', 'Periferia'], display: 'badge' });
    const parentWf = s.workflows.find((w) => w.kind === 'parent')!.id;
    expect(field.appliesToTypes!.sort()).toEqual(
      s.cardTypes
        .filter((t) => t.defaultWorkflowId === parentWf)
        .map((t) => t.id)
        .sort(),
    );
    run(db, 'UPDATE boards SET template_version = 7 WHERE id = ?', [boardId]);
    expect(pendingUpgrade(db, boardId)).toEqual([]);
  });

  it('pelo roteador: o board antigo avisa o que muda e é atualizado por mensagem, com cópia de segurança', () => {
    let backups = 0;
    const handle = { db, scheduleSave: () => {}, backup: () => backups++, close: async () => {} };
    const router = new MessageRouter(handle as never, {
      workspaceKey: 'ws',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(os.tmpdir(), 'fazai-upgrade'),
    });
    expect(router.snapshot().board.templateVersion).toBe(0);
    expect(router.snapshot().pendingUpgrade.length).toBeGreaterThan(0);
    const after = router.handle({ type: 'settings.board.upgrade' });
    expect(backups).toBe(1);
    expect(after.pendingUpgrade).toEqual([]);
    expect(after.board.templateVersion).toBe(BOARD_TEMPLATE_VERSION);
  });
});
