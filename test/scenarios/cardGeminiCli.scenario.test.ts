// Cenários de ponta a ponta do Gemini pela CLI (épica "ferramenta por modo", história 8): um card com o agente
// do board no perfil `gemini` no modo CLI, do `runner.start` (plano de execution.ts, gateway, driver
// `gemini/cli`, o comando do provider com a home isolada materializada, a chave do cofre só no ambiente, o
// leitor do `stream-json`, o relatório, a conferência) até a mensagem na conversa do card. Só o processo da
// CLI é falso: ele emite, linha a linha, o `stream-json` gravado da CLI 0.65.0 (test/fixtures/gemini-*).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HeadlessCommand } from '../../src/extension/headless';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { cardWorld, type CardWorld } from './cardWorld';

const KEY = 'AIzaChaveDoCenarioCli-nunca-no-board-222333';
const DEVIATION = 'Conferência: a execução usou algo fora';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O que o processo falso viu ao começar: o comando, o settings da home e a chave no ambiente. */
interface Seen {
  command: HeadlessCommand;
  home: string;
  settings: Record<string, any>;
}

/** O processo da CLI: confere a home isolada, emite a fixture gravada em pedaços e sai com o código dado. */
function fakeGemini(fixture: string, seen: Seen[], code = 0): SpawnFn {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'fixtures', fixture), 'utf8');
  return (command, _cwd, out) => {
    const home = command.env!.GEMINI_CLI_HOME!;
    seen.push({ command, home, settings: JSON.parse(fs.readFileSync(path.join(home, '.gemini', 'settings.json'), 'utf8')) });
    // a CLI grava na home dela (sessões, histórico): tudo some com a pasta da execução
    fs.mkdirSync(path.join(home, '.gemini', 'tmp', 'projeto', 'chats'), { recursive: true });
    fs.writeFileSync(path.join(home, '.gemini', 'tmp', 'projeto', 'chats', 'sessao.json'), '{}');
    let exit: (code: number | null) => void = () => {};
    setTimeout(() => {
      // um pipe não respeita linha: os pedaços cortam no meio dos eventos
      for (let i = 0; i < lines.length; i += 97) out(lines.slice(i, i + 97), 'stdout');
      exit(code);
    }, 5);
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
}

describe('um card com o agente do board pelo Gemini CLI', () => {
  it('A: lê, tenta um shell que a CLI recusa e chama o board: sem desvio falso, tokens medidos, a home apagada', async () => {
    const seen: Seen[] = [];
    world = await cardWorld({
      profile: 'gemini-cli',
      tools: ['Read', 'Grep', 'Glob'],
      permission: 'board',
      spawn: fakeGemini('gemini-stream-json.jsonl', seen),
    });
    world.keys.set('gemini', KEY);
    const end = await world.run();

    // o comando: a CLI de uma passada, nunca o ACP, com o pedido pela entrada e o modelo do card
    expect(seen).toHaveLength(1);
    const { command, home, settings } = seen[0]!;
    expect(command.args.slice(0, 4)).toEqual(['-p', '', '--output-format', 'stream-json']);
    expect(command.args).not.toContain('--acp');
    expect(command.args).toEqual(expect.arrayContaining(['--approval-mode', 'default', '-e', 'none', '-m', 'gemini-2.5-pro']));
    expect(command.stdin).toMatch(/Trabalhe no card #1/);
    // a chave só no ambiente do processo: nem nos argumentos, nem no settings, nem no ambiente declarado
    expect(command.apiKeyEnv).toBe('GEMINI_API_KEY');
    expect(command.apiKey).toBe(KEY);
    expect(command.args.join(' ')).not.toContain(KEY);
    expect(JSON.stringify(settings)).not.toContain(KEY);
    expect(JSON.stringify(command.env)).not.toContain(KEY);
    // o settings do board: o servidor do board, as ferramentas de leitura do card, a delegação desligada
    expect(Object.keys(settings.mcpServers)).toEqual(['faz-ai']);
    expect(settings.tools.core).toEqual(['read_file', 'read_many_files', 'list_directory', 'glob', 'grep_search']);
    expect(settings.experimental).toEqual({ enableAgents: false });
    // a home temporária some no fim, com o que a CLI gravou nela
    expect(fs.existsSync(home)).toBe(false);

    // o relatório: tokens do result.stats e o inventário do que rodou; a recusa da CLI não é uso
    expect(end.code).toBe(0);
    expect(end.report.measure).toBe('full');
    expect(end.report.inventory).toEqual([
      { kind: 'tool', name: 'read_file', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
    ]);
    expect(end.check).toEqual({ status: 'ok' });
    expect(world.comments().join('\n')).not.toContain(DEVIATION);
    expect(world.lines.some((l) => l.includes('Conferência: sem desvio.'))).toBe(true);
    const run = world.aiRun()!;
    expect(run).toMatchObject({
      tool: 'gemini',
      mode: 'cli',
      outcome: 'done',
      inputTokens: 3700,
      outputTokens: 120,
      cacheReadTokens: 5000,
    });
    // a chave não aparece no log do card nem na linha da execução
    expect(world.lines.join('\n')).not.toContain(KEY);
    expect(JSON.stringify(run)).not.toContain(KEY);
  });

  it('B: o shell que rodou de fato, sem o Bash no card, é o desvio real que a conferência pega', async () => {
    const seen: Seen[] = [];
    world = await cardWorld({
      profile: 'gemini-cli',
      tools: ['Read', 'Grep', 'Glob'],
      permission: 'full',
      spawn: fakeGemini('gemini-stream-json-shell.jsonl', seen),
    });
    world.keys.set('gemini', KEY);
    const end = await world.run();
    expect(seen[0]!.command.args).toEqual(expect.arrayContaining(['--approval-mode', 'yolo']));
    expect(end.check).toEqual({ status: 'deviation', deviations: [{ kind: 'tool', name: 'run_shell_command', calls: 1 }] });
    expect(world.comments().join('\n')).toContain(`${DEVIATION} do que o card liberou (ferramenta run_shell_command)`);
  });

  it('C: com o Bash no card, o mesmo shell não é desvio (o nome do Gemini lido no vocabulário do card)', async () => {
    world = await cardWorld({
      profile: 'gemini-cli',
      tools: ['Read', 'Bash'],
      permission: 'full',
      spawn: fakeGemini('gemini-stream-json-shell.jsonl', []),
    });
    const end = await world.run();
    expect(end.check).toEqual({ status: 'ok' });
  });

  it('D: a chave recusada pela API marca o login do perfil como vencido, sem repetir a chave', async () => {
    world = await cardWorld({
      profile: 'gemini-cli',
      tools: ['Read'],
      permission: 'board',
      spawn: fakeGemini('gemini-stream-json-auth.jsonl', [], 1),
    });
    world.keys.set('gemini', KEY);
    const end = await world.run();
    expect(end.code).toBe(1);
    expect(world.router.snapshot().authExpired).toContain('gemini');
    expect(world.lines.join('\n')).not.toContain(KEY);
  });

  it('E: a cota diária esgotada liga o limite de uso da execução', async () => {
    world = await cardWorld({
      profile: 'gemini-cli',
      tools: ['Read'],
      permission: 'board',
      spawn: fakeGemini('gemini-stream-json-quota.jsonl', [], 1),
    });
    const end = await world.run();
    expect(end.report.usageLimitReached).toBe(true);
  });
});
