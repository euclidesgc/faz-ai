import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Autopilot, type StoryDriver } from '../src/extension/autopilot';
import { Heartbeat } from '../src/extension/heartbeat';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { PHASE_OUTCOME_ADVICE } from '../src/shared/phaseOutcome';
import {
  briefAdvice,
  closingAdvice,
  concernsAdvice,
  contextAdvice,
  DIRECT_TRACK_ADVICE,
  STORY_SESSION_ADVICE,
  subtaskAdvice,
} from '../src/extension/unitAdvice';
import { orchestratesStory } from '../src/shared/orchestration';
import { briefFailures, briefSkeleton } from '../src/shared/subtaskBrief';
import type { AiActivity } from '../src/shared/model';
import type { AiRunOrigin } from '../src/shared/log';
import type { AiRunMode } from '../src/shared/runner';

// Os gatilhos do board (autopiloto, heartbeat, "Chamar IA") entregam a história de fase de código ao
// orquestrador; sem sub-tarefas na fase, a sessão da história roda como sempre.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let router: MessageRouter;
let drives: { storyId: string; origin: string }[];
let driver: StoryDriver;
let started: string[];
let logs: string[];
const runner = {
  get running(): string[] {
    return [];
  },
  start(id: string, _origin?: AiRunOrigin, _mode?: AiRunMode) {
    started.push(id);
  },
  stop() {},
  onDidFinish() {},
};
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });

/** Uma história na Implementação; com `children`, as sub-tarefas dela já na fase. */
function story(title: string, children: number): string {
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent')!;
  const child = s.workflows.find((w) => w.kind === 'child')!;
  const id = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === parent.id && c.name === 'Implementação')!.id,
    parentId: null,
    title,
  });
  const fase = router.snapshot().fieldDefs.find((f) => f.name === 'Fase');
  for (let n = 0; n < children; n++) {
    const kid = router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === child.id && c.category === 'open')!.id,
      parentId: id,
      title: `Filha ${n + 1}`,
    });
    if (fase) ai({ type: 'field.setValue', cardId: kid, fieldId: fase.id, value: 'Implementação' });
  }
  return id;
}

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-triggers'),
  });
  drives = [];
  started = [];
  logs = [];
  driver = {
    async drive(storyId, origin) {
      drives.push({ storyId, origin });
      return { kind: 'started' };
    },
  };
});

describe('quem conduz a história', () => {
  it('só a fase de código com sub-tarefas na fase é do orquestrador', () => {
    const withKids = story('Com filhas', 2);
    const alone = story('Sem filhas', 0);
    const s = router.snapshot();
    expect(
      orchestratesStory(
        s,
        s.cards.find((c) => c.id === withKids)!,
      ),
    ).toBe(true);
    expect(
      orchestratesStory(
        s,
        s.cards.find((c) => c.id === alone)!,
      ),
    ).toBe(false);
    expect(
      orchestratesStory(
        s,
        s.cards.find((c) => c.parentId === withKids)!,
      ),
    ).toBe(false);
  });
});

describe('autopiloto', () => {
  const yolo = (id: string) => router.handle({ type: 'card.yolo.set', cardId: id, enabled: true });

  it('história com sub-tarefas na fase vai para o orquestrador, não para o runner', () => {
    const id = story('Conduzida', 2);
    yolo(id);
    const autopilot = new Autopilot(router, runner, { log: (l) => logs.push(l), driver, defer: () => {} });
    autopilot.resume();
    expect(drives).toEqual([{ storyId: id, origin: 'autopilot' }]);
    expect(started).toEqual([]);
  });

  it('história sem sub-tarefas segue para o runner (a sessão cria as sub-tarefas)', () => {
    const id = story('Sem filhas', 0);
    yolo(id);
    const autopilot = new Autopilot(router, runner, { log: (l) => logs.push(l), driver, defer: () => {} });
    autopilot.resume();
    expect(drives).toEqual([]);
    expect(started).toEqual([id]);
  });

  it('recusa do orquestrador (outra janela) vai para o log e a nota, sem desligar a fila', async () => {
    const id = story('Conduzida', 1);
    yolo(id);
    const refusing: StoryDriver = { drive: () => Promise.reject(new Error(Autopilot.NOT_OWNER_NOTE)) };
    const autopilot = new Autopilot(router, runner, { log: (l) => logs.push(l), driver: refusing, defer: () => {} });
    autopilot.resume();
    await new Promise((r) => setTimeout(r, 0));
    expect(logs.join('\n')).toContain(Autopilot.NOT_OWNER_NOTE);
    expect(router.snapshot().autopilot.note).toBe(Autopilot.NOT_OWNER_NOTE);
    expect(autopilot.isActive).toBe(true);
  });

  it('a recusa não volta a chamar a IA na hora: só tenta de novo quando a história muda', async () => {
    const id = story('Sem pasta', 1);
    yolo(id);
    let calls = 0;
    const refusing: StoryDriver = {
      drive: () => {
        calls++;
        return Promise.reject(new Error("ENOENT: no such file or directory, lstat '/sem/pasta'"));
      },
    };
    // o adiamento roda na hora, como a reavaliação que a nota da recusa dispara a cada mudança do board
    const autopilot = new Autopilot(router, runner, { log: (l) => logs.push(l), driver: refusing, defer: (f) => f() });
    autopilot.resume();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      autopilot.evaluate();
    }
    // uma nota da IA na conversa não reabre a tentativa
    ai({ type: 'comment.add', cardId: id, body: 'A execução foi recusada.' });
    autopilot.evaluate();
    expect(calls).toBe(1);
    expect(logs.filter((l) => l.includes('chamando a IA'))).toHaveLength(1);
    // a pessoa responde na conversa (recriou a pasta): a fila tenta de novo
    router.handle({ type: 'comment.add', cardId: id, body: 'Recriei a pasta, pode seguir.' });
    autopilot.evaluate();
    expect(calls).toBe(2);
  });
});

describe('heartbeat', () => {
  it('a rodada entrega a história conduzida ao orquestrador e as demais ao runner', () => {
    const conduzida = story('Conduzida', 1);
    const sozinha = story('Sozinha', 0);
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 2 } } });
    const heartbeat = new Heartbeat(runner, { driver, snapshot: () => router.snapshot(), now: () => 0, log: (l) => logs.push(l) });
    heartbeat.enqueue(conduzida);
    heartbeat.enqueue(sozinha);
    expect(drives).toEqual([{ storyId: conduzida, origin: 'heartbeat' }]);
    expect(started).toEqual([sozinha]);
  });
});

describe('o roteador', () => {
  it('as unidades conduzidas aparecem em aiRuns junto com as do runner, sem duplicar o card', () => {
    const id = story('Conduzida', 1);
    const activity = (cardId: string): AiActivity => ({
      cardId,
      runId: '',
      mode: 'phase',
      origin: 'manual',
      phase: 'Implementação',
      model: null,
      tool: 'claude',
      startedAt: 1,
    });
    router.setOrchestrations([activity(id)]);
    expect(router.snapshot().aiRuns).toEqual([id]);
    router.setAiRuns([activity(id)]);
    expect(router.snapshot().aiRuns).toEqual([id]);
    router.setAiRuns([]);
    expect(router.snapshot().aiRuns).toEqual([id]);
    router.setOrchestrations([]);
    expect(router.snapshot().aiRuns).toEqual([]);
  });

  it('mover um card para uma coluna de cancelamento avisa o orquestrador', () => {
    const id = story('Cancelada', 1);
    const heard: string[][] = [];
    router.onCardsCancelled((ids) => heard.push(ids));
    const s = router.snapshot();
    const parent = s.workflows.find((w) => w.kind === 'parent')!;
    ai({
      type: 'card.move',
      cardId: id,
      columnId: s.columns.find((c) => c.workflowId === parent.id && c.category === 'cancelled')!.id,
      position: 0,
    });
    expect(heard).toEqual([[id]]);
  });
});

describe('pedidos à IA', () => {
  it('a sub-tarefa executa só o seu ciclo e o fechamento chama a verificação do conjunto', () => {
    const id = story('Conduzida', 1);
    const s = router.snapshot();
    const parent = s.cards.find((c) => c.id === id)!;
    const kid = s.cards.find((c) => c.parentId === id)!;
    const sub = subtaskAdvice(parent, kid);
    expect(sub).toContain(`#${kid.number}`);
    expect(sub).toContain(`#${parent.number}`);
    expect(sub).toMatch(/start_work[\s\S]*Em andamento[\s\S]*coluna de conclusão/);
    expect(sub).toMatch(/Não faça commit[\s\S]*quem executa as outras é o board/);
    for (const value of ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']) expect(sub).toContain(`\`${value}\``);
    expect(sub).toContain(PHASE_OUTCOME_ADVICE);
    expect(sub).toMatch(/O bloco não substitui `move_card`/);
    expect(closingAdvice(parent)).not.toContain('ressalvas');
    expect(closingAdvice(parent)).toMatch(/Verifique o conjunto[\s\S]*faça o commit[\s\S]*o board a executa/);
  });

  it('a sessão da história numa fase de código cria as sub-tarefas e para, sem subagente', () => {
    expect(STORY_SESSION_ADVICE).toMatch(/Não execute sub-tarefas, nem por subagente/);
    expect(STORY_SESSION_ADVICE).toMatch(/crie-as, descreva-as e pare/);
    expect(STORY_SESSION_ADVICE).toContain('revisor-de-codigo');
  });

  it('a trilha direta manda a sessão da história implementar, com o limite de uns 3 arquivos e a volta às sub-tarefas com o motivo', () => {
    expect(DIRECT_TRACK_ADVICE).toContain('prepare_workspace');
    expect(DIRECT_TRACK_ADVICE).toMatch(/faça o commit[\s\S]*mova a história para a próxima coluna/);
    expect(DIRECT_TRACK_ADVICE).toContain('uns 3 arquivos');
    expect(DIRECT_TRACK_ADVICE).toMatch(/crie as sub-tarefas com Fase = esta coluna, registre o motivo na conversa e pare/);
    expect(DIRECT_TRACK_ADVICE).toMatch(/Não execute sub-tarefas, nem por subagente/);
    for (const name of ['Objetivo', 'Pronto quando', 'Pode tocar', 'Não pode tocar']) expect(DIRECT_TRACK_ADVICE).toContain(`"${name}"`);
    expect(STORY_SESSION_ADVICE).not.toContain('prepare_workspace');
  });

  it('os pedidos de fechamento e da sessão da história pedem as seções na descrição das sub-tarefas criadas (#1110)', () => {
    const story = { id: 's', number: 1 } as never;
    for (const text of [closingAdvice(story), STORY_SESSION_ADVICE]) {
      for (const name of ['Objetivo', 'Pronto quando', 'Pode tocar', 'Não pode tocar']) expect(text).toContain(`"${name}"`);
      expect(text).toContain('inclusive as de correção e as de revisão');
    }
  });

  it('as ressalvas das sub-tarefas entram no fechamento e na sessão da história, e só quando existem', () => {
    const story = { id: 's', number: 1 } as never;
    const concerns = [{ ref: '#7', text: 'faltou rodar o teste de integração' }];
    expect(concernsAdvice([])).toBe('');
    for (const text of [closingAdvice(story, concerns), concernsAdvice(concerns)]) {
      expect(text).toContain('- #7: faltou rodar o teste de integração');
      expect(text).toMatch(/confira cada uma contra o diff/);
    }
    expect(closingAdvice(story, concerns)).toContain('"Objetivo"');
  });

  it('o pedido de contexto cita o que a sub-tarefa pediu, manda completar a descrição e parar', () => {
    const story = { id: 's', number: 1 } as never;
    const card = { id: 'k', number: 2 } as never;
    const text = contextAdvice(story, [
      { card, reason: '**Pedido de contexto** (ab12cd34): sem o contrato da API\n\nPreciso de: o formato da resposta' },
    ]);
    expect(text).toContain('A sub-tarefa #2 pediu contexto: sem o contrato da API. Falta: o formato da resposta.');
    expect(text).toMatch(/update_card \(mantenha as seções\)[\s\S]*não execute sub-tarefas e pare/);
    expect(text).toContain('descrição igual pausa a história');
  });

  it('a sessão de correção traz o esqueleto, as seções que faltam e a ordem de não executar', () => {
    const id = story('Conduzida', 1);
    const s = router.snapshot();
    const parent = s.cards.find((c) => c.id === id)!;
    const kid = s.cards.find((c) => c.parentId === id)!;
    const text = briefAdvice(parent, briefFailures([kid]));
    expect(text).toContain(`#${kid.number}`);
    expect(text).toContain('falta Objetivo, Pronto quando, Pode tocar, Não pode tocar');
    expect(text).toContain(briefSkeleton());
    expect(text).toMatch(/update_card[\s\S]*Não execute sub-tarefas[\s\S]*não crie sub-tarefas[\s\S]*pare/);
    expect(text).toMatch(/confere de novo[\s\S]*história vai para a pessoa/);
  });
});
