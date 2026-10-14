import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatSession, chatPrompt, parseSuggestions, suggestRulesPrompt, suggestSkillsPrompt } from '../src/extension/chat';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import type { HeadlessCommand } from '../src/extension/headless';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { gatewayFor } from './helpers/gateway';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ChatMessage } from '../src/shared/chat';
import { monthOf } from '../src/shared/log';
import type { Database } from 'sql.js';

let dir: string;
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
  return new ChatSession(router, { cwd: dir, log: () => {}, file: path.join(dir, 'chat.json'), gateway: gatewayFor(router, db, spawn) });
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

describe('Indicar artefatos', () => {
  const skill = (name: string, description: string) => ({
    kind: 'skill' as const,
    scope: 'project' as const,
    name,
    description,
    path: `${dir}/.claude/skills/${name}/SKILL.md`,
    location: `.claude/skills/${name}/SKILL.md`,
    layout: 'skills' as const,
  });

  it('o pedido lista só os candidatos fora do board, e a resposta em JSON vira a pré-seleção', () => {
    // dois no catálogo, um já no board: só o de fora é candidato
    fs.mkdirSync(path.join(dir, '.claude/skills/sql'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/skills/sql/SKILL.md'), '---\nname: sql\ndescription: Consultas SQL\n---\n');
    fs.mkdirSync(path.join(dir, '.claude/skills/web'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/skills/web/SKILL.md'), '---\nname: web\ndescription: Navega na web\n---\n');
    router.refreshHarness();
    router.handle({
      type: 'harness.selection.set',
      items: [{ kind: 'skill', location: '.claude/skills/web/SKILL.md' }],
      usage: 'contextual',
    });
    router.chatCommand({ type: 'harness.suggest.run', tool: 'claude', kind: 'skill' });
    expect(router.snapshot().chat.busy).toBe(true);
    // nada entra na conversa: o resultado vai para a tela
    expect(messages()).toEqual([]);
    const stdin = spawned[0]!.command.stdin!;
    expect(stdin).toContain('key: .claude/skills/sql/SKILL.md | nome: sql');
    expect(stdin).not.toContain('nome: web');
    expect(stdin).toContain('uma skill por assunto');
    // só leitura: a permissão "board"
    expect(spawned[0]!.command.args).toContain('dontAsk');
    spawned[0]!.emit(
      'Analisei o projeto.\n{"items":[{"key":".claude/skills/sql/SKILL.md","reason":"O projeto usa Postgres"},{"key":"inventado","reason":"x"}]}',
    );
    spawned[0]!.exit(0);
    expect(router.snapshot().chat.busy).toBe(false);
    expect(router.snapshot().harnessSuggestions).toEqual({
      tool: 'claude',
      kind: 'skill',
      items: [{ location: '.claude/skills/sql/SKILL.md', reason: 'O projeto usa Postgres' }],
    });
    expect(messages()).toEqual([]);
    router.setSuggestions(null);
    expect(router.snapshot().harnessSuggestions).toBeNull();
  });

  it('resposta fora do formato, erro da ferramenta e assunto sem candidatos viram avisos na tela', () => {
    router.chatCommand({ type: 'harness.suggest.run', tool: 'claude', kind: 'mcp' });
    expect(spawned).toHaveLength(0);
    expect(router.snapshot().harnessSuggestions).toMatchObject({
      kind: 'mcp',
      items: [],
      error: 'Não há artefatos fora do board neste assunto.',
    });

    fs.mkdirSync(path.join(dir, '.claude/skills/sql'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/skills/sql/SKILL.md'), '---\nname: sql\ndescription: SQL\n---\n');
    router.refreshHarness();
    router.chatCommand({ type: 'harness.suggest.run', tool: 'claude', kind: 'skill' });
    spawned[0]!.emit('não sei');
    spawned[0]!.exit(0);
    expect(router.snapshot().harnessSuggestions).toMatchObject({
      kind: 'skill',
      items: [],
      error: 'A IA não respondeu no formato esperado.',
    });

    router.chatCommand({ type: 'harness.suggest.run', tool: 'claude', kind: 'skill' });
    spawned[1]!.exit(2);
    expect(router.snapshot().harnessSuggestions?.error).toContain('terminou com erro (código 2)');
    expect(() => router.chatCommand({ type: 'harness.suggest.run', tool: 'cursor', kind: 'skill' })).toThrow('ferramenta do projeto');
  });

  it('parseSuggestions acha o JSON no meio do texto e ignora chaves fora dos candidatos e repetidas', () => {
    const keys = ['a', 'b'];
    expect(parseSuggestions('Veja: {"items":[{"key":"b","reason":"r"},{"key":"b"},{"key":"z"}]} fim', keys)).toEqual([
      { location: 'b', reason: 'r' },
    ]);
    expect(parseSuggestions('{"items":[]}', keys)).toEqual([]);
    expect(parseSuggestions('{"nada":1}', keys)).toBeNull();
    expect(parseSuggestions('sem json', keys)).toBeNull();
    expect(skill('x', 'y').kind).toBe('skill');
  });
});

describe('Sugerir regras e skills com IA', () => {
  it('o pedido de regras manda ler o projeto, preservar o arquivo, deixar desligado e respeitar o fluxo do board', () => {
    const prompt = suggestRulesPrompt('AGENTS.md');
    expect(prompt).toContain('de 3 a 5 regras');
    expect(prompt).toContain('write_rule_file em AGENTS.md');
    expect(prompt).toContain('read_rule_file');
    expect(prompt).toContain('usage "off"');
    expect(prompt).toContain('o fluxo do board vale acima das regras');
    expect(prompt).toContain('Termine com um resumo');
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
    // a ferramenta do projeto é o Claude Code: o arquivo de regras é o CLAUDE.md
    expect(spawned[0]!.command.stdin).toContain('write_rule_file em CLAUDE.md');
    expect(spawned[0]!.command.args).toContain('dontAsk');
    spawned[0]!.emit('Regras escritas.');
    spawned[0]!.exit(0);
    expect(messages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages()[0]!.text).toContain('Sugerir regras com IA');

    router.chatCommand({ type: 'ai.suggestSkills' });
    expect(spawned[1]!.command.stdin).toContain('create_skill');
    spawned[1]!.emit('Skills criadas.');
    spawned[1]!.exit(0);
    expect(messages().at(-2)!.text).toContain('Sugerir skills com IA');
    expect(messages().at(-1)).toMatchObject({ role: 'assistant', text: 'Skills criadas.' });
  });

  it('com a IA ocupada, o segundo pedido é recusado', () => {
    router.chatCommand({ type: 'ai.suggestRules' });
    expect(() => router.chatCommand({ type: 'ai.suggestSkills' })).toThrow('A IA ainda está respondendo');
  });
});
