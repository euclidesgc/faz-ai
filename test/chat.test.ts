import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatSession, chatPrompt } from '../src/extension/chat';
import type { HeadlessCommand } from '../src/extension/headless';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ChatMessage } from '../src/shared/chat';

let dir: string;
let router: MessageRouter;
let spawned: {
  command: HeadlessCommand;
  emit: (text: string) => void;
  exit: (code: number | null, error?: Error) => void;
  killed: boolean;
}[];

const build = () =>
  new ChatSession(router, {
    cwd: dir,
    log: () => {},
    file: path.join(dir, 'chat.json'),
    spawn: (command, _cwd, log) => {
      const entry = { command, emit: log, exit: (_c: number | null, _e?: Error) => {}, killed: false };
      spawned.push(entry);
      return {
        kill: () => {
          entry.killed = true;
          entry.exit(143);
        },
        onExit: (fn) => {
          entry.exit = (code, error) => fn(code, error);
        },
      };
    },
  });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-chat-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
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
});
