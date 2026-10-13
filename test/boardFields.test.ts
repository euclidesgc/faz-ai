import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BOARD_FIELDS, isBoardField } from '../src/shared/boardFields';

let router: MessageRouter;
beforeEach(async () => {
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: '/tmp',
    workspaceDir: '/tmp',
    homeDir: '/tmp',
  });
});

const field = (name: string) => router.snapshot().fieldDefs.find((f) => f.name === name)!;
const workflow = (kind: 'parent' | 'child') => router.snapshot().workflows.find((w) => w.kind === kind)!.id;
const typeNamed = (name: string) => router.snapshot().cardTypes.find((t) => t.name === name)!;
const create = (name: string, kind: 'text' | 'model' = 'text') =>
  router.handle({ type: 'settings.field.create', name, kind, options: [], appliesToTypes: null, display: 'badge' });

describe('campos do board', () => {
  it('são os sete campos que o board padrão cria', () => {
    expect(
      router
        .snapshot()
        .fieldDefs.filter(isBoardField)
        .map((f) => f.name),
    ).toEqual(expect.arrayContaining(BOARD_FIELDS.map((b) => b.name)));
    expect(router.snapshot().fieldDefs.every(isBoardField)).toBe(true);
  });

  it('não se apagam nem se renomeiam', () => {
    for (const b of BOARD_FIELDS) {
      const f = field(b.name);
      expect(() => router.handle({ type: 'settings.field.delete', fieldId: f.id })).toThrow(
        `O campo "${b.name}" é do board e não pode ser apagado: as regras e a IA dependem dele.`,
      );
      expect(() => router.handle({ type: 'settings.field.update', fieldId: f.id, patch: { name: 'Outro' } })).toThrow(
        `O campo "${b.name}" é do board e não pode ser renomeado: as regras e a IA o encontram pelo nome.`,
      );
    }
    expect(router.snapshot().fieldDefs).toHaveLength(BOARD_FIELDS.length);
  });

  it('as opções são do board, menos as de Tags, que são da pessoa', () => {
    const effort = field('Esforço da atividade');
    expect(() => router.handle({ type: 'settings.field.update', fieldId: effort.id, patch: { options: ['Pequeno', 'Grande'] } })).toThrow(
      'As opções do campo "Esforço da atividade" são mantidas pelo board.',
    );
    router.handle({ type: 'settings.field.update', fieldId: field('Tags').id, patch: { options: ['mobile', 'web'] } });
    expect(field('Tags').options).toEqual(['mobile', 'web']);
  });

  it('os tipos de card não mudam, e mandar os mesmos valores de volta passa', () => {
    const phase = field('Fase');
    expect(() => router.handle({ type: 'settings.field.update', fieldId: phase.id, patch: { appliesToTypes: null } })).toThrow(
      'Os tipos de card do campo "Fase" são mantidos pelo board.',
    );
    router.handle({
      type: 'settings.field.update',
      fieldId: phase.id,
      patch: { name: phase.name, options: phase.options, appliesToTypes: phase.appliesToTypes },
    });
    expect(field('Fase')).toEqual(phase);
  });

  it('a exibição no board continua livre', () => {
    router.handle({ type: 'settings.field.update', fieldId: field('Rules').id, patch: { display: 'hidden' } });
    expect(field('Rules').display).toBe('hidden');
  });

  it('o nome de um campo do board é reservado, sem diferença de maiúsculas nem de acentos', () => {
    expect(() => create(' esforco da ATIVIDADE ')).toThrow('"esforco da ATIVIDADE" é o nome de um campo do board; escolha outro nome.');
    expect(() => create('Tags')).toThrow('"Tags" é o nome de um campo do board; escolha outro nome.');
    expect(router.snapshot().fieldDefs).toHaveLength(BOARD_FIELDS.length);
  });

  it('não se cria um segundo campo de modelo de IA', () => {
    expect(() => create('Modelo da revisão', 'model')).toThrow('O campo de modelo de IA é só um, o "Modelo" do board.');
  });

  it('um campo personalizado segue livre: renomear, mudar os tipos e apagar', () => {
    create('Prazo');
    const id = field('Prazo').id;
    router.handle({ type: 'settings.field.update', fieldId: id, patch: { name: 'Entrega', appliesToTypes: [] } });
    expect(field('Entrega')).toMatchObject({ id, appliesToTypes: [] });
    router.handle({ type: 'settings.field.delete', fieldId: id });
    expect(router.snapshot().fieldDefs.some((f) => f.id === id)).toBe(false);
  });
});

describe('tipos de card e os campos do board', () => {
  it('um tipo novo das histórias ganha a Criticidade; um das sub-tarefas, a Fase', () => {
    router.handle({ type: 'settings.type.create', name: 'Melhoria', color: '#000000', defaultWorkflowId: workflow('parent') });
    router.handle({ type: 'settings.type.create', name: 'Teste', color: '#000000', defaultWorkflowId: workflow('child') });
    const melhoria = typeNamed('Melhoria').id;
    const teste = typeNamed('Teste').id;
    expect(field('Criticidade').appliesToTypes).toContain(melhoria);
    expect(field('Criticidade').appliesToTypes).not.toContain(teste);
    expect(field('Fase').appliesToTypes).toContain(teste);
    expect(field('Fase').appliesToTypes).not.toContain(melhoria);
    // os campos de todos os tipos continuam valendo para todos
    expect(field('Modelo').appliesToTypes).toBeNull();
  });

  it('o tipo que muda de workflow troca a Criticidade pela Fase', () => {
    const bug = typeNamed('Bug').id;
    expect(field('Criticidade').appliesToTypes).toContain(bug);
    router.handle({ type: 'settings.type.update', typeId: bug, patch: { defaultWorkflowId: workflow('child') } });
    expect(field('Criticidade').appliesToTypes).not.toContain(bug);
    expect(field('Fase').appliesToTypes).toContain(bug);
    // mudar só o nome não mexe nos campos
    const before = field('Fase').appliesToTypes;
    router.handle({ type: 'settings.type.update', typeId: bug, patch: { name: 'Defeito' } });
    expect(field('Fase').appliesToTypes).toEqual(before);
  });
});

describe('valor da Fase', () => {
  const AI = { author: 'Claude Code', source: 'ai' as const };
  const subtask = () => {
    const s = router.snapshot();
    const story = router.createCard({ typeId: typeNamed('História').id, columnId: s.columns[0]!.id, parentId: null, title: 'h' });
    const child = s.columns.find((c) => c.workflowId === workflow('child'))!;
    return router.createCard({ typeId: typeNamed('Sub-tarefa').id, columnId: child.id, parentId: story, title: 's' });
  };
  const phaseOf = (cardId: string) => router.snapshot().fieldValues.find((v) => v.cardId === cardId && v.fieldId === field('Fase').id);

  it('a pessoa não grava nem limpa a Fase; a IA grava', () => {
    const id = subtask();
    const fase = field('Fase').id;
    expect(() => router.handle({ type: 'field.setValue', cardId: id, fieldId: fase, value: 'Spec' })).toThrow(
      'O campo "Fase" é preenchido pelo board e pela IA, não à mão.',
    );
    router.handle({ type: 'field.setValue', cardId: id, fieldId: fase, value: 'Spec' }, AI);
    expect(phaseOf(id)?.value).toBe('Spec');
    expect(() => router.handle({ type: 'field.setValue', cardId: id, fieldId: fase, value: null })).toThrow('não à mão');
    expect(phaseOf(id)?.value).toBe('Spec');
    // os outros campos do board seguem livres para a pessoa
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Esforço da atividade').id, value: 'Alto' });
  });

  it('a sub-tarefa criada à mão nasce sem Fase', () => {
    expect(phaseOf(subtask())).toBeUndefined();
  });

  it('a Fase não vira padrão do tipo, mas um padrão antigo que volta igual passa', () => {
    const sub = typeNamed('Sub-tarefa').id;
    const fase = field('Fase').id;
    const effort = field('Esforço da atividade').id;
    expect(() => router.handle({ type: 'settings.type.update', typeId: sub, patch: { defaults: { [fase]: 'PRD' } } })).toThrow(
      'O campo "Fase" não tem valor padrão por tipo: o board o preenche em cada card.',
    );
    expect(() => router.handle({ type: 'settings.type.update', typeId: sub, patch: { defaults: { [fase]: 'PRD' } } }, AI)).toThrow(
      'não tem valor padrão por tipo',
    );
    // um board de antes desta regra pode ter o padrão gravado: a tela manda os padrões inteiros ao mudar outro
    (router as unknown as { ctx: { settings: { updateType: (id: string, p: object) => void } } }).ctx.settings.updateType(sub, {
      defaults: { [fase]: 'PRD' },
    });
    router.handle({ type: 'settings.type.update', typeId: sub, patch: { defaults: { [fase]: 'PRD', [effort]: 'Alto' } } });
    expect(typeNamed('Sub-tarefa').defaults).toEqual({ [fase]: 'PRD', [effort]: 'Alto' });
    // e tirar o padrão antigo também passa
    router.handle({ type: 'settings.type.update', typeId: sub, patch: { defaults: { [fase]: null, [effort]: 'Alto' } } });
    expect(typeNamed('Sub-tarefa').defaults).toEqual({ [effort]: 'Alto' });
  });
});
