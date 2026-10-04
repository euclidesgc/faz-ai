import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatSession, chatPrompt } from '../src/extension/chat';
import type { HeadlessCommand } from '../src/extension/headless';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ChatMessage } from '../src/shared/chat';
import { monthOf } from '../src/shared/log';
import type { Database } from 'sql.js';

let dir: string;
let db: Database;
let router: MessageRouter;
/** passado ao chat só nos testes do log; nos demais o chat roda sem log, como num board sem ele */
let runLog: ReturnType<typeof createRunLog> | undefined;
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

const build = () =>
  new ChatSession(router, {
    cwd: dir,
    log: () => {},
    runLog,
    file: path.join(dir, 'chat.json'),
    spawn: (command, _cwd, out) => {
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
    },
  });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-chat-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  runLog = undefined;
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
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'kimi' } });
    expect(() => router.chatCommand({ type: 'chat.send', text: 'a', model: null })).toThrow(/Sem restrições/);
    expect(spawned).toHaveLength(0);
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
});

/** O chat é a quarta origem de execução de IA, e a única sem card (RF-16). */
describe('ChatSession no log das execuções', () => {
  let runs: AiRunRepo;

  beforeEach(() => {
    runs = new AiRunRepo(db);
    runLog = createRunLog(db);
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
    expect(only()).toMatchObject({ model: o.model, effort: o.efforts[0], profile: null, agent: null, skills: [], mcp: null });
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
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'kimi' } });
    expect(() => router.chatCommand({ type: 'chat.send', text: 'a', model: null })).toThrow(/Sem restrições/);
    expect(spawned).toHaveLength(0);
    expect(only()).toMatchObject({ outcome: 'unsupported', tool: 'kimi' });
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
