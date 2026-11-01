import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { all } from '../src/extension/db/query';
import type { HeadlessCommand } from '../src/extension/headless';
import { cardDetail } from '../src/extension/mcp/format';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner } from '../src/extension/runner';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { modelValue } from '../src/shared/models';
import { gatewayFor } from './helpers/gateway';

/**
 * Critérios de aceite da história #620 (RF2, RF4, RF6 e RF20 do PRD): num mesmo board, o valor do Modelo do
 * card decide a CLI; sem modelo vale o perfil padrão; e o `get_card` mostra o mesmo perfil com que o runner executa.
 * A montagem do board e do gateway falso é a de `runner.test.ts`.
 */

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let db: Database;
let router: MessageRouter;
let runner: AiRunner;
let procs: { command: HeadlessCommand }[];

const catalog = () => router.snapshot().board.modelCatalog;
const haiku = () => catalog().find((o) => o.tool === 'claude' && o.model === 'haiku')!;
const composer = () => catalog().find((o) => o.tool === 'cursor' && o.model.startsWith('composer'))!;
const haikuValue = () => modelValue(haiku().id, haiku().defaultEffort);
const composerValue = () => modelValue(composer().id, composer().defaultEffort);

const modeloField = () => router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
const setModelo = (cardId: string, value: string) => router.handle({ type: 'field.setValue', cardId, fieldId: modeloField().id, value });
const setDefaultProfile = (aiTool: string) => router.handle({ type: 'settings.board.update', patch: { aiTool } });

const newStory = (title: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'Discovery')!.id,
    parentId: null,
    title,
  });
};
const newSubtask = (parentId: string, title: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'child')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId,
    title,
  });
};

/** O que a IA lê no `get_card` do card (o bloco `model` só existe quando o card escolhe o modelo). */
const getCardModel = (cardId: string) => {
  const s = router.snapshot();
  return (
    cardDetail(
      s,
      s.cards.find((c) => c.id === cardId)!,
      () => '/anexo',
    ) as { model?: { tool: string; model: string } }
  ).model;
};

/** Executa o card e devolve o executável que o runner chamou. */
const runAndGetCommand = (cardId: string): string => {
  const before = procs.length;
  runner.start(cardId);
  expect(procs).toHaveLength(before + 1);
  const command = procs[before]!.command.command;
  // libera o card para a próxima execução do teste
  runner.stop(cardId);
  return command;
};

const runsTools = () => (all(db, 'SELECT tool FROM ai_runs ORDER BY started_at, id') as { tool: string }[]).map((r) => r.tool);

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-acceptance-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
  });
  procs = [];
  const spawn: SpawnFn = (command) => {
    let listener: (code: number | null, error?: Error) => void = () => {};
    procs.push({ command });
    return {
      onExit: (fn) => (listener = fn),
      kill: () => listener(null),
    };
  };
  runner = new AiRunner(router, { cwd: dir, log: () => {}, gateway: gatewayFor(router, db, spawn) });
  // o catálogo de fábrica só tem modelos do Claude Code: acrescenta um do Cursor
  router.handle({
    type: 'settings.models.set',
    catalog: [
      ...catalog(),
      { id: 'cursor:composer-2', tool: 'cursor', model: 'composer-2', label: 'Composer 2', efforts: [], defaultEffort: null },
    ],
  });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(`${dir}.worktrees`, { recursive: true, force: true });
});

describe('critérios de aceite do alvo da execução (história #620)', () => {
  it('o board tem os perfis claude e cursor ligados e o claude como padrão', () => {
    const board = router.snapshot().board;
    expect(board.aiTool).toBe('claude');
    expect(board.aiProfiles.filter((p) => p.enabled).map((p) => p.id)).toEqual(expect.arrayContaining(['claude', 'cursor']));
  });

  it('RF2: Haiku roda no Claude Code e Composer no Cursor, no mesmo board', () => {
    const a = newStory('Com Haiku');
    const b = newStory('Com Composer');
    setModelo(a, haikuValue());
    setModelo(b, composerValue());

    expect(runAndGetCommand(a)).toBe('claude');
    expect(runAndGetCommand(b)).toBe('cursor-agent');
    expect(router.snapshot().board.aiTool).toBe('claude');
  });

  it('RF4: sem modelo, agente com modelo nem regra, vale o perfil padrão; trocá-lo move o mesmo card de CLI', () => {
    const c = newStory('Sem modelo');
    expect(runAndGetCommand(c)).toBe('claude');

    setDefaultProfile('cursor');
    expect(runAndGetCommand(c)).toBe('cursor-agent');
    expect(runsTools()).toEqual(['claude', 'cursor']);
  });

  it('RF6: duas sub-tarefas da mesma história rodam cada uma no seu perfil', () => {
    const story = newStory('História');
    const withHaiku = newSubtask(story, 'No Claude Code');
    const withComposer = newSubtask(story, 'No Cursor');
    setModelo(withHaiku, haikuValue());
    setModelo(withComposer, composerValue());

    expect(runAndGetCommand(withHaiku)).toBe('claude');
    expect(runAndGetCommand(withComposer)).toBe('cursor-agent');
  });

  it('RF20: ai_runs.tool grava o perfil de cada execução, não o padrão do board', () => {
    const a = newStory('Com Haiku');
    const b = newStory('Com Composer');
    const c = newStory('Sem modelo');
    setModelo(a, haikuValue());
    setModelo(b, composerValue());

    runAndGetCommand(a);
    runAndGetCommand(b);
    runAndGetCommand(c);
    expect(runsTools()).toEqual(['claude', 'cursor', 'claude']);
  });

  it('o get_card mostra o mesmo model.tool com que o runner executa', () => {
    const a = newStory('Com Haiku');
    const b = newStory('Com Composer');
    const c = newStory('Sem modelo');
    setModelo(a, haikuValue());
    setModelo(b, composerValue());

    expect(getCardModel(a)).toMatchObject({ tool: 'claude', model: haiku().model });
    expect(getCardModel(b)).toMatchObject({ tool: 'cursor', model: composer().model });
    expect(runAndGetCommand(a)).toBe('claude');
    expect(runAndGetCommand(b)).toBe('cursor-agent');

    // sem modelo não há bloco `model`: a IA lê o perfil padrão, que é o que o runner usa
    expect(getCardModel(c)).toBeUndefined();
    expect(runAndGetCommand(c)).toBe('claude');
    setDefaultProfile('cursor');
    expect(getCardModel(c)).toBeUndefined();
    expect(runAndGetCommand(c)).toBe('cursor-agent');
    // e o card com modelo explícito não muda com o padrão
    expect(getCardModel(a)).toMatchObject({ tool: 'claude' });
    expect(runAndGetCommand(a)).toBe('claude');
  });
});
