import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatSession, chatPrompt, suggestAgentsPrompt, suggestRulesPrompt, suggestSkillsPrompt } from '../src/extension/chat';
import { FLOW_LINE } from '../src/extension/promptContext';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import type { HeadlessCommand } from '../src/extension/headless';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { gatewayFor } from './helpers/gateway';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ChatMessage } from '../src/shared/chat';
import { monthOf } from '../src/shared/log';
import { modelValue } from '../src/shared/models';
import type { Database } from 'sql.js';

let dir: string;
const logs: string[] = [];
let db: Database;
let router: MessageRouter;
let spawned: {
  command: HeadlessCommand;
  emit: (text: string, stream?: 'stdout' | 'stderr') => void;
  /** escreve no `stdout` sem passar pelo falso: o fluxo da CLI como ela o escreveu */
  raw: (text: string) => void;
  exit: (code: number | null, error?: Error) => void;
  killed: boolean;
}[];

/** a saída real do Claude Code no modo estruturado, capturada no probe da #70 */
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');

/** o que o Claude Code escreve no modo estruturado para uma resposta: o texto do assistente e o `result` */
const events = (text: string, failed = false) =>
  [
    { type: 'assistant', message: { content: text ? [{ type: 'text', text }] : [] } },
    { type: 'result', subtype: failed ? 'error' : 'success', is_error: failed, result: text },
  ]
    .map((e) => `${JSON.stringify(e)}\n`)
    .join('');

const build = () => {
  const spawn: SpawnFn = (command, _cwd, out) => {
    // no modo estruturado a ferramenta escreve eventos: o falso junta o que o teste emitiu e, ao
    // sair, escreve um evento do assistente e um `result` com esse texto, como o Claude Code faz
    const structured = command.format !== 'text';
    let said = '';
    /** o teste já escreveu o fluxo inteiro (`raw`): o falso não acrescenta eventos seus */
    let scripted = false;
    const entry = {
      command,
      emit: (text: string, stream: 'stdout' | 'stderr' = 'stdout') => {
        if (structured && stream === 'stdout') said += text;
        else out(text, stream);
      },
      raw: (text: string) => {
        scripted = true;
        out(text, 'stdout');
      },
      exit: (_c: number | null, _e?: Error) => {},
      killed: false,
    };
    spawned.push(entry);
    return {
      kill: () => {
        entry.killed = true;
        entry.exit(143);
      },
      onExit: (fn) => {
        entry.exit = (code, error) => {
          if (structured && !error && !scripted) out(events(said, code !== 0), 'stdout');
          fn(code, error);
        };
      },
    };
  };
  return new ChatSession(router, {
    cwd: dir,
    log: (l) => logs.push(l),
    file: path.join(dir, 'chat.json'),
    gateway: gatewayFor(router, db, spawn),
  });
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-chat-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  // a execução pelo chat usa a mesma permissão do board
  router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'board' } } });
  spawned = [];
  build();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const messages = () => router.snapshot().chat.messages;

describe('chatPrompt', () => {
  it('leva o papel do assistente, a conversa recente sem os avisos de erro e a pergunta nova', () => {
    const h: ChatMessage[] = [
      { id: '1', role: 'user', text: 'oi', at: 0 },
      { id: '2', role: 'assistant', text: 'olá', at: 0 },
      { id: '3', role: 'error', text: 'falhou', at: 0 },
    ];
    const p = chatPrompt(h, 'crie um card', 'Limite X');
    expect(p).toContain('servidor MCP "faz-ai"');
    expect(p).toContain('Limite X');
    expect(p).toContain('Pessoa: oi\nAssistente: olá\nPessoa: crie um card');
    expect(p).not.toContain('falhou');
  });
});

describe('ChatSession', () => {
  it('uma mensagem chama a ferramenta, mostra "respondendo" e vira a resposta ao terminar', () => {
    router.chatCommand({ type: 'chat.send', text: 'crie um card Login', model: null });
    expect(router.snapshot().chat.busy).toBe(true);
    expect(messages().map((m) => [m.role, m.text])).toEqual([['user', 'crie um card Login']]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.command.command).toBe('claude');
    expect(spawned[0]!.command.stdin).toContain('Pessoa: crie um card Login');
    expect(spawned[0]!.command.stdin).toContain(FLOW_LINE);

    spawned[0]!.emit('Criei o card #1 ');
    spawned[0]!.emit('"Login".\u001b[0m');
    spawned[0]!.exit(0);
    expect(router.snapshot().chat.busy).toBe(false);
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', text: 'Criei o card #1 "Login".' });
  });

  it('o modelo e o esforço escolhidos vão por parâmetro', () => {
    const o = router.snapshot().board.modelCatalog.find((m) => m.tool === 'claude' && m.efforts.length > 0)!;
    router.chatCommand({ type: 'chat.send', text: 'oi', model: `${o.id}@${o.efforts[0]}` });
    const args = spawned[0]!.command.args;
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe(o.model);
    expect(args[args.indexOf('--effort') + 1]).toBe(o.efforts[0]);
    expect(messages()[0]!.model).toBe(`${o.id}@${o.efforts[0]}`);
  });

  it('só uma resposta por vez; mensagem vazia é ignorada', () => {
    router.chatCommand({ type: 'chat.send', text: '   ', model: null });
    expect(spawned).toHaveLength(0);
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    expect(() => router.chatCommand({ type: 'chat.send', text: 'b', model: null })).toThrow(/ainda está respondendo/);
  });

  it('falha, tempo esgotado e saída vazia viram avisos, não respostas', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    spawned[0]!.emit('algo deu errado');
    spawned[0]!.exit(2);
    expect(messages().at(-1)).toMatchObject({ role: 'error' });
    expect(messages().at(-1)!.text).toContain('código 2');
    expect(messages().at(-1)!.text).toContain('algo deu errado');

    router.chatCommand({ type: 'chat.send', text: 'b', model: null });
    spawned[1]!.exit(null, new Error('claude: comando não encontrado'));
    expect(messages().at(-1)!.text).toContain('comando não encontrado');

    router.chatCommand({ type: 'chat.send', text: 'c', model: null });
    spawned[2]!.exit(0);
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', text: 'A IA terminou sem escrever uma resposta.' });
  });

  it('interromper encerra o processo e avisa; limpar apaga a conversa', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    router.chatCommand({ type: 'chat.stop' });
    expect(spawned[0]!.killed).toBe(true);
    expect(messages().at(-1)).toMatchObject({ role: 'error', text: 'Interrompido.' });
    expect(router.snapshot().chat.busy).toBe(false);
    router.chatCommand({ type: 'chat.clear' });
    expect(messages()).toEqual([]);
  });

  it('a conversa fica guardada em arquivo e volta numa sessão nova', () => {
    router.chatCommand({ type: 'chat.send', text: 'lembra de mim', model: null });
    spawned[0]!.emit('lembro');
    spawned[0]!.exit(0);
    build();
    expect(messages().map((m) => m.text)).toEqual(['lembra de mim', 'lembro']);
  });

  it('sem ferramenta que rode em segundo plano nesta permissão, recusa com o motivo', () => {
    // o Claude Code recusa "Sem restrições" quando roda como root (contêiner, WSL como root)
    const getuid = vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    try {
      router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude', runner: { permission: 'full' } } });
      expect(() => router.chatCommand({ type: 'chat.send', text: 'a', model: null })).toThrow(/root/);
      expect(spawned).toHaveLength(0);
    } finally {
      getuid.mockRestore();
    }
  });

  it('o histórico é limitado', () => {
    for (let i = 0; i < 60; i++) {
      router.chatCommand({ type: 'chat.send', text: `m${i}`, model: null });
      spawned.at(-1)!.exit(0);
    }
    expect(messages().length).toBeLessThanOrEqual(100);
    expect(messages().at(-1)!.text).toBe('A IA terminou sem escrever uma resposta.');
  });

  it('a resposta é o texto do ÚLTIMO resultado da ferramenta, sem nada do fluxo de eventos', () => {
    router.chatCommand({ type: 'chat.send', text: 'liste os arquivos', model: null });
    expect(spawned[0]!.command.args).toContain('stream-json');
    spawned[0]!.raw(FIXTURE);
    spawned[0]!.exit(0);
    const answer = messages().at(-1)!;
    expect(answer.role).toBe('assistant');
    // o primeiro resultado do probe era um recado intermediário ("o subagente foi lançado")
    expect(answer.text).toContain('Aqui estão os três resultados');
    expect(answer.text).not.toContain('{"');
  });

  it('com código diferente de zero, o fim da saída no aviso de erro é texto legível', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    spawned[0]!.raw(FIXTURE);
    spawned[0]!.exit(1);
    const error = messages().at(-1)!;
    expect(error.role).toBe('error');
    expect(error.text).toContain('código 1');
    expect(error.text).toContain('Subagente Explore concluído');
    expect(error.text).not.toContain('{"');
    // a linha da chamada é do board, não da ferramenta
    expect(error.text).not.toContain('Chamando');
  });

  it('a falha antes do primeiro evento não é repetida e o aviso de erro diz isso (#739)', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    // o fluxo estruturado não trouxe nenhum evento: só o erro no `stderr`
    spawned[0]!.raw('');
    spawned[0]!.emit('erro: conexão perdida com o servidor\n', 'stderr');
    spawned[0]!.exit(1);

    expect(spawned).toHaveLength(1);
    const error = messages().at(-1)!;
    expect(error.role).toBe('error');
    expect(error.text).toMatch(/^O Claude Code terminou com erro \(código 1\)\. A execução não foi repetida/);
    // uma vez só: o recado da medição é do board e não entra no fim da saída da ferramenta
    expect(error.text.split('não foi repetida')).toHaveLength(2);
    expect(error.text).not.toContain('A medição não foi possível');
    expect(error.text).toContain('conexão perdida');
  });

  it('a falha depois de eventos não ganha o aviso de execução não repetida', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    spawned[0]!.raw(FIXTURE);
    spawned[0]!.exit(1);
    expect(messages().at(-1)!.text).not.toContain('não foi repetida');
  });

  it('a pergunta nova vai uma vez só no prompt, depois da conversa anterior', () => {
    router.chatCommand({ type: 'chat.send', text: 'primeira', model: null });
    spawned[0]!.emit('resposta um');
    spawned[0]!.exit(0);
    router.chatCommand({ type: 'chat.send', text: 'segunda pergunta', model: null });
    const stdin = spawned[1]!.command.stdin!;
    expect(stdin.split('Pessoa: segunda pergunta')).toHaveLength(2);
    expect(stdin).toContain('Pessoa: primeira\nAssistente: resposta um\nPessoa: segunda pergunta');
    expect(stdin.split('Pessoa: primeira')).toHaveLength(2);
  });

  it('os avisos de regra de permissão do Claude Code não aparecem no erro; o motivo real aparece', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    for (let i = 0; i < 15; i++) spawned[0]!.emit(`Permission allow rule (Bash(cmd${i}:*)) in userSettings is unreachable\n`, 'stderr');
    spawned[0]!.emit('Invalid API key · Please run /login\n', 'stderr');
    spawned[0]!.emit('Permission deny rule (Read(./.env)) will be ignored\n', 'stderr');
    spawned[0]!.exit(1);
    const error = messages().at(-1)!;
    expect(error.role).toBe('error');
    expect(error.text).toContain('Please run /login');
    expect(error.text).not.toContain('Permission');
  });
});

/** O chat é a quarta origem de execução de IA, e a única sem card (RF-16). */
describe('ChatSession no log das execuções', () => {
  let runs: AiRunRepo;

  beforeEach(() => {
    runs = new AiRunRepo(db);
    build();
  });

  const only = () => {
    const rows = runs.byMonth(monthOf(Date.now()));
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };

  it('a execução do chat é registrada com origem "chat" e sem card', () => {
    router.chatCommand({ type: 'chat.send', text: 'crie um card', model: null });
    expect(only()).toMatchObject({
      origin: 'chat',
      cardId: null,
      cardNumber: null,
      cardTitle: '',
      workflow: '',
      columnName: '',
      tool: 'claude',
      permission: 'board',
      outcome: null,
    });
  });

  it('no chat não existem perfil nem subagente: as duas dimensões ficam NULL, e o modelo escolhido é gravado', () => {
    const o = router.snapshot().board.modelCatalog.find((m) => m.tool === 'claude' && m.efforts.length > 0)!;
    router.chatCommand({ type: 'chat.send', text: 'oi', model: `${o.id}@${o.efforts[0]}` });
    expect(only()).toMatchObject({ model: o.model, effort: o.efforts[0], profile: null, agent: null, skills: [], mcp: [] });
  });

  it('o desfecho do chat segue o mesmo vocabulário do executor de cards', () => {
    router.chatCommand({ type: 'chat.send', text: 'a', model: null });
    spawned[0]!.exit(0);
    expect(runs.byMonth(monthOf(Date.now()))[0]).toMatchObject({ outcome: 'done', exitCode: 0 });

    router.chatCommand({ type: 'chat.send', text: 'b', model: null });
    spawned[1]!.exit(2);
    expect(runs.byMonth(monthOf(Date.now()))[1]).toMatchObject({ outcome: 'failed', exitCode: 2 });

    router.chatCommand({ type: 'chat.send', text: 'c', model: null });
    router.chatCommand({ type: 'chat.stop' });
    expect(runs.byMonth(monthOf(Date.now()))[2]).toMatchObject({ outcome: 'stopped' });
  });

  it('sem ferramenta que rode nesta permissão, a tentativa fica registrada como unsupported', () => {
    const getuid = vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    try {
      router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude', runner: { permission: 'full' } } });
      expect(() => router.chatCommand({ type: 'chat.send', text: 'a', model: null })).toThrow(/root/);
    } finally {
      getuid.mockRestore();
    }
    expect(spawned).toHaveLength(0);
    expect(only()).toMatchObject({ outcome: 'unsupported', tool: 'claude' });
  });

  it('RF-15: a execução do chat grava o consumo e o inventário com origem "chat" e sem card', () => {
    router.chatCommand({ type: 'chat.send', text: 'liste os arquivos', model: null });
    spawned[0]!.raw(FIXTURE);
    spawned[0]!.exit(0);
    expect(only()).toMatchObject({
      origin: 'chat',
      cardId: null,
      outcome: 'done',
      measure: 'full',
      inputTokens: 54,
      outputTokens: 1221,
      cacheReadTokens: 106009,
      cacheWriteTokens: 28908,
      turns: 5,
    });
    expect(runs.usage(only().id)).toContainEqual({ kind: 'agent', name: 'Explore', calls: 1 });
  });
});

describe('Sugerir regras e skills com IA', () => {
  it('o pedido de regras cria de 3 a 5 regras do board, desligadas, sem tocar nos arquivos de regras do projeto', () => {
    const prompt = suggestRulesPrompt();
    expect(prompt).toContain('de 3 a 5 regras');
    expect(prompt).toContain('write_rule_file');
    expect(prompt).toContain('minúsculas e hífens');
    expect(prompt).toContain('read_rule_file');
    expect(prompt).toContain('usage "off"');
    expect(prompt).toContain('o fluxo do board vale acima das regras');
    expect(prompt).toContain('Termine com um resumo');
  });

  it('nenhum dos três pedidos manda gravar na pasta ou no arquivo de uma ferramenta', () => {
    expect(suggestAgentsPrompt()).toContain('create_agent');
    expect(suggestAgentsPrompt()).not.toContain('scope"');
    expect(suggestAgentsPrompt()).toContain('sem scope');
    for (const prompt of [suggestRulesPrompt(), suggestSkillsPrompt(), suggestAgentsPrompt()]) {
      expect(prompt).toContain('faz-ai');
      expect(prompt).not.toContain('CLAUDE.md');
      expect(prompt).not.toContain('AGENTS.md');
      expect(prompt).not.toContain('.claude/');
      expect(prompt).not.toContain('.cursor/');
      expect(prompt).not.toContain('arquivo de agente da ferramenta');
    }
  });

  it('o pedido de skills manda criar de 3 a 5 estreitas, em "Pelo card", e nunca "always"', () => {
    const prompt = suggestSkillsPrompt();
    expect(prompt).toContain('de 3 a 5 skills');
    expect(prompt).toContain('create_skill');
    expect(prompt).toContain('usage "contextual"');
    expect(prompt).toContain('não use "always"');
    expect(prompt).toContain('Termine com um resumo');
  });

  it('ai.suggestRules e ai.suggestSkills rodam o chat com o board como única ferramenta e registram o pedido na conversa', () => {
    router.chatCommand({ type: 'ai.suggestRules' });
    expect(router.snapshot().chat.busy).toBe(true);
    // A sugestão grava no board sem depender do arquivo nativo da ferramenta.
    expect(spawned[0]!.command.stdin).toContain('write_rule_file');
    expect(spawned[0]!.command.stdin).not.toContain('AGENTS.md');
    expect(spawned[0]!.command.args).toContain('dontAsk');
    spawned[0]!.emit('Regras escritas.');
    spawned[0]!.exit(0);
    expect(messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages()[0]!.text).toContain('Sugerir regras com IA');

    router.chatCommand({ type: 'ai.suggestSkills' });
    expect(spawned[1]!.command.stdin).toContain('create_skill');
    expect(spawned[1]!.command.stdin).toContain(FLOW_LINE);
    spawned[1]!.emit('Skills criadas.');
    spawned[1]!.exit(0);
    expect(messages().at(-2)!.text).toContain('Sugerir skills com IA');
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', text: 'Skills criadas.' });

    router.chatCommand({ type: 'ai.suggestAgents' });
    expect(spawned[2]!.command.stdin).toContain(FLOW_LINE);
    spawned[2]!.exit(0);
  });

  it('com a IA ocupada, o segundo pedido é recusado', () => {
    router.chatCommand({ type: 'ai.suggestRules' });
    expect(() => router.chatCommand({ type: 'ai.suggestSkills' })).toThrow('A IA ainda está respondendo');
  });
});

it('a assistência de subagente usa o gateway medido, sem gravar o agente nem conversar no chat', async () => {
  const before = router.snapshot().harness.library?.artifacts;
  const promise = router.assistAgent({
    step: 'review',
    name: 'revisor',
    body: 'Revise sem editar.',
    sections: {},
    language: 'pt-BR',
    agent: { skills: [], mcpServers: [], model: '', tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } } },
  });
  expect(router.snapshot().chat.busy).toBe(true);
  expect(spawned[0]!.command.args).toContain('Read,Glob,Grep');
  expect(spawned[0]!.command.stdin).toContain('Produza apenas uma proposta');
  spawned[0]!.emit(
    JSON.stringify({
      explanation: 'Defina a entrega.',
      suggestions: ['Inclua evidências.'],
      content: 'Revise sem editar e entregue evidências.',
      skills: [],
      mcpServers: [],
      categories: ['read'],
      model: '',
    }),
  );
  spawned[0]!.exit(0);
  await expect(promise).resolves.toMatchObject({ content: 'Revise sem editar e entregue evidências.' });
  expect(router.snapshot().harness.library?.artifacts).toEqual(before);
  expect(messages()).toHaveLength(0);
  expect(router.snapshot().chat.busy).toBe(false);
  expect(new AiRunRepo(db).byMonth(monthOf(Date.now()))).toHaveLength(1);
});

describe('ChatSession: política de execução no limite de uso', () => {
  const option = (model: string) => router.snapshot().board.modelCatalog.find((o) => o.tool === 'claude' && o.model === model)!;
  const usageLimit = JSON.stringify({ type: 'result', is_error: true, result: 'usage limit reached' });
  const policyTo = (model: string, effort: string) =>
    router.handle({
      type: 'settings.executionPolicy.save',
      policy: {
        version: 1,
        id: 'reserva-chat',
        name: 'Reserva do chat',
        enabled: true,
        priority: 10,
        conditions: {
          profileIds: ['claude'],
          models: ['sonnet'],
          actions: ['chat'],
          agentIds: [],
          phaseIds: [],
          cardTypeIds: [],
          origins: [],
          failures: ['quota'],
          explicit: 'include',
        },
        action: 'auto',
        targets: [{ profileId: 'claude', model, effort }],
        limits: { maxAttempts: 3, maxElapsedMs: 3_600_000, backoffMs: 0, globalProcesses: null, perProfile: {} },
      } as never,
      expectedRevision: 0,
      reviewed: true,
    });
  const sendSonnet = () => {
    const sonnet = option('sonnet');
    router.chatCommand({ type: 'chat.send', text: 'oi', model: modelValue(sonnet.id, sonnet.efforts[0] ?? null) });
  };

  it('com política aplicável, o limite esgotado segue no destino sem repetir a pergunta na conversa', () => {
    const fable = option('fable');
    policyTo('fable', fable.efforts[0]!);
    sendSonnet();
    spawned[0]!.raw(`${usageLimit}\n`);
    spawned[0]!.exit(1);
    expect(logs.some((l) => l.includes('Política de execução: fallback'))).toBe(true);
    expect(spawned).toHaveLength(2);
    expect(spawned[1]!.command.args[spawned[1]!.command.args.indexOf('--model') + 1]).toBe('fable');
    expect(messages().filter((m) => m.role === 'user')).toHaveLength(1);
    spawned[1]!.emit('Pronto.');
    spawned[1]!.exit(0);
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', text: 'Pronto.' });
  });

  it('sem política o limite esgotado vira aviso e nada é executado noutro alvo', () => {
    sendSonnet();
    spawned[0]!.raw(`${usageLimit}\n`);
    spawned[0]!.exit(1);
    expect(spawned).toHaveLength(1);
    expect(messages().at(-1)).toMatchObject({ role: 'error' });
    expect(messages().at(-1)!.text).toContain('limite de uso do plano');
    expect(router.snapshot().chat.busy).toBe(false);
  });
});
