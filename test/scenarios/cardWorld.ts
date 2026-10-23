// O mundo de um cenário de ponta a ponta do card: banco em memória, router, runner e gateway montados
// como o host monta (`host/boardHost.ts`), com a admissão por capacidades de verdade, o log de uso de
// verdade e a conferência de verdade. Só a ponta externa é falsa: o processo da ferramenta (o agente
// ACP falso, em processo, ou o `spawn` da CLI que só guarda o comando montado) e o binário que a
// admissão confere, que é um arquivo qualquer na pasta do PATH do teste.
//
// Por que existe: os testes isolados de execution.ts, admission.ts e runCheck.ts passavam e o card de
// verdade num perfil ACP ainda acusava desvio falso na conferência (#364). Só o caminho inteiro, do
// `runner.start` até a mensagem na conversa do card, pega esse tipo de quebra entre as peças.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { AiGateway } from '../../src/extension/ai/gateway';
import { ExecutionAdmission } from '../../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../../src/extension/ai/capabilityEvidence';
import type { AcpSpawnFn } from '../../src/extension/ai/acp/provider';
import type { HeadlessCommand } from '../../src/extension/headless';
import { openInMemory } from '../../src/extension/db/database';
import { AiProfileRepo } from '../../src/extension/repositories/aiProfileRepo';
import { createRunLog } from '../../src/extension/log/runLog';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { MessageRouter } from '../../src/extension/panel/messageRouter';
import { AiRunner } from '../../src/extension/runner';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { ACP_CAPABILITY_CHECKS, EXECUTOR_CAPABILITIES } from '../../src/shared/executionAdmission';
import { admissionRegimeOf, type RunnerPermission } from '../../src/shared/runner';
import type { AiProfile } from '../../src/shared/aiProfiles';
import { driverOf } from '../../src/extension/ai/drivers';
import { ToolKeys } from '../../src/extension/toolKeys';
import { credentialsFor } from '../../src/extension/credentials';
import { monthOf } from '../../src/shared/log';
import type { ModelOption } from '../../src/shared/models';

const WASM_DIR = path.resolve(__dirname, '../../node_modules/sql.js/dist');

/** As ferramentas do `condutor-do-board` de `.claude/agents/` (sem o curinga do servidor do board). */
export const CONDUTOR_TOOLS = ['Read', 'Grep', 'Glob', 'Agent', 'Bash'];

/** Um modelo do Gemini CLI no catálogo do board, como o "Detectar modelos" grava a partir da sessão ACP. */
export const GEMINI_MODEL: ModelOption = {
  id: 'gemini:gemini-2.5-pro',
  tool: 'gemini',
  model: 'gemini-2.5-pro',
  label: 'Gemini 2.5 Pro',
  efforts: [],
  defaultEffort: null,
  fromTool: true,
};

export interface CardWorld {
  root: string;
  /** a pasta do PATH do teste e a home falsa */
  bin: string;
  home: string;
  db: Database;
  admission: ExecutionAdmission;
  evidence: CapabilityEvidenceStore;
  /** o cofre das chaves por ferramenta, sobre o cofre do banco do mundo (como o host) */
  keys: ToolKeys;
  router: MessageRouter;
  runner: AiRunner;
  cardId: string;
  /** cada linha que o runner escreveu no canal de log */
  lines: string[];
  /** os comandos que o `spawn` da CLI recebeu (perfis que não são ACP) */
  cliCommands: HeadlessCommand[];
  /** inicia a execução do card e espera o fim, com o desfecho que o gateway entregou ao runner */
  run(): Promise<AiRunEnd>;
  /** as mensagens da conversa do card */
  comments(): string[];
  /** a linha da execução no log de uso */
  aiRun(): ReturnType<AiRunRepo['byMonth']>[number] | undefined;
  dispose(): void;
}

export interface CardWorldOptions {
  /** o perfil de CLI do card: `gemini` (agente ACP pronto do catálogo, pelo campo Modelo) ou `claude` (o padrão do board) */
  profile: 'gemini' | 'claude';
  /** as ferramentas do agente da fase */
  tools: string[];
  permission?: RunnerPermission;
  /** com `profile: 'gemini'`: o Gemini é o perfil padrão do board (`board.aiTool`) e o card não escolhe modelo */
  boardDefault?: boolean;
  /** o processo do agente ACP; obrigatório no perfil ACP */
  spawnAcp?: AcpSpawnFn;
  /**
   * O perfil chega pronto pelo Conectar (história 7), não pelo atalho do teste: o mundo não liga o Gemini, não
   * grava recibos, não liga o regime compatível do board e não escolhe o modelo do card. O gateway lê a chave
   * do cofre (`keys`, o cofre do banco do mundo) e o regime da ciência por perfil, como o host.
   */
  viaConnect?: boolean;
}

export async function cardWorld(options: CardWorldOptions): Promise<CardWorld> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cenario-')));
  const project = path.join(root, 'projeto');
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  for (const d of [project, home, bin]) fs.mkdirSync(d);
  // o binário que a admissão resolve pelo PATH e cujo conteúdo entra no vínculo; o processo é o falso, em
  // memória. Pelo Conectar ele roda uma vez, para dizer a versão (`gemini --version`, como a 0.65.0)
  const connect = options.viaConnect;
  fs.writeFileSync(
    path.join(bin, 'gemini'),
    connect ? '#!/bin/sh\necho 0.65.0\n' : '#!/bin/sh\n# agente de teste: o processo é o falso, em memória\n',
    { mode: 0o755 },
  );
  const db = await openInMemory(WASM_DIR);
  const keys = new ToolKeys(credentialsFor(db), path.join(root, 'tool-keys.json'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'anexos'),
    workspaceDir: project,
    homeDir: home,
  });

  // o agente da fase, com a definição do board (como o condutor-do-board do repositório), padrão do board
  router.handle({
    type: 'harness.agent.create',
    input: {
      name: 'condutor-do-board',
      description: 'Conduz os cards pelo fluxo do board e delega o trabalho técnico aos especialistas.',
      body: 'Você conduz cards do board Faz AI. Siga a skill do fluxo e as instruções da fase.',
      model: '',
      tools: options.tools,
      deniedTools: [],
      skills: [],
      mcp: [],
    },
  });
  // a pessoa liga o perfil pronto (ligar é a revisão dele), escolhe o regime compatível (revisado por ela) e a permissão.
  // O Claude Code segue padrão do board, e o card vai para o Gemini pelo campo Modelo, com um modelo que o
  // "Detectar modelos" trouxe da sessão ACP: é assim que o agente do board chega ao ACP com as ferramentas dele
  if (options.profile === 'gemini' && !connect) {
    router.handle({ type: 'settings.aiProfiles.setEnabled', id: 'gemini', enabled: true });
    router.handle({
      type: 'settings.models.set',
      catalog: [...router.snapshot().board.modelCatalog, GEMINI_MODEL],
    });
  }
  router.handle({
    type: 'settings.board.update',
    patch: {
      ...(options.profile === 'gemini' && options.boardDefault ? { aiTool: 'gemini' } : {}),
      runner: {
        defaultAgent: 'condutor-do-board',
        permission: options.permission ?? 'full',
        ...(options.profile === 'gemini' && !connect ? { admissionRegime: 'compatible' } : {}),
      },
    },
  } as never);

  const profiles = new AiProfileRepo(db);
  const evidence = new CapabilityEvidenceStore(path.join(root, 'evidencias'));
  const admission = new ExecutionAdmission({
    pathEnv: () => bin,
    homeDir: home,
    evidence,
    environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
  });
  if (options.profile === 'gemini' && !connect) {
    // os recibos que o verificador do host gravaria para este agente: o ACP não prova os arquivos de
    // contexto próprios (`own-context-files`), por isso o perfil só roda no regime compatível. Como o
    // verificador, a prova é feita em `board`: ela vale para qualquer permissão do card (história 3)
    const resolved = profiles.resolveProfile(router.boardId, 'gemini');
    const { binding } = admission.isolationBinding(resolved, 'gemini', 'board');
    const now = Date.now();
    for (const capability of EXECUTOR_CAPABILITIES)
      evidence.record({
        version: 1,
        capability,
        binding,
        source: 'host-probe',
        checkedAt: now - 1000,
        expiresAt: now + 3_600_000,
        checks: ACP_CAPABILITY_CHECKS[capability].map((id) => ({
          id,
          outcome: id === 'own-context-files' ? 'unavailable' : 'passed',
          receipt: 'a'.repeat(64),
        })),
      });
  }

  const lines: string[] = [];
  const cliCommands: HeadlessCommand[] = [];
  const gateway = new AiGateway({
    resolveProfile: (id) => profiles.resolveProfile(router.boardId, id),
    profile: (id) => router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    boardId: router.boardId,
    runLog: createRunLog(db),
    sessions: router.executions,
    redact: (text) => router.redactCredentials(text),
    admission,
    // a CLI de uma passada: guarda o comando montado e termina sem saída (o Claude Code real não roda aqui)
    spawn: (command) => {
      cliCommands.push(command);
      let exit: (code: number | null) => void = () => {};
      queueMicrotask(() => exit(0));
      return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
    },
    spawnAcp: options.spawnAcp,
    // como o host: a chave do cofre para o driver que entra por chave, e o regime da ciência do perfil
    ...(connect
      ? {
          apiKey: (profile: AiProfile) => {
            const driver = driverOf(profile);
            return driver?.auth.kind === 'api-key' ? keys.get(driver.tool) : null;
          },
          regimeOf: (profileId: string) => admissionRegimeOf(router.snapshot().board.runner, profileId),
        }
      : {}),
  });
  const runner = new AiRunner(router, {
    gateway,
    cwd: project,
    homeDir: home,
    bridgePath: path.join(root, 'dist', 'mcp-bridge.js'),
    nodePath: 'node',
    log: (line) => lines.push(line),
  });

  // uma história numa fase de texto da IA do fluxo principal (a primeira em que a IA trabalha)
  const s = router.snapshot();
  const story = s.workflows.find((w) => w.kind === 'parent')!;
  const phase = s.columns.filter((c) => c.workflowId === story.id && c.aiActive).sort((a, b) => a.position - b.position)[0]!;
  const cardId = router.createCard({ typeId: s.cardTypes[0]!.id, columnId: phase.id, parentId: null, title: 'Card do cenário' });
  if (options.profile === 'gemini' && !options.boardDefault && !connect) {
    const field = s.fieldDefs.find((f) => f.kind === 'model')!;
    router.handle({ type: 'field.setValue', cardId, fieldId: field.id, value: GEMINI_MODEL.id });
  }

  return {
    root,
    bin,
    home,
    db,
    admission,
    evidence,
    keys,
    router,
    runner,
    cardId,
    lines,
    cliCommands,
    run: () =>
      new Promise<AiRunEnd>((resolve, reject) => {
        try {
          runner.start(cardId, { origin: 'manual', onExit: resolve });
        } catch (e) {
          reject(e);
        }
      }),
    comments: () =>
      router
        .snapshot()
        .comments.filter((c) => c.cardId === cardId)
        .map((c) => c.body),
    aiRun: () => new AiRunRepo(db).byMonth(monthOf(Date.now())).at(-1),
    dispose: () => {
      runner.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
