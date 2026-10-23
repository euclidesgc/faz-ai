// Teste real do Gemini nos três modos (épica "ferramenta por modo", história 14), fora do `npm test`.
// Um card mínimo roda pelo caminho do board (`cardWorld`: runner, gateway, admissão, driver do modo, leitor,
// conferência, `ai_runs`), com a ponta externa de VERDADE: o binário `gemini` na CLI e no ACP, a API do Google
// no modo API. Confere: a execução termina, a conferência não acusa desvio falso, o inventário vem no
// vocabulário do modo, o consumo é registrado e o modo aparece em `ai_runs`.
//
// GASTA COTA da conta do Gemini. Por isso cada modo só roda com a confirmação explícita
// (`FAZAI_REAL_CONFIRMED_BY_SCRIPT=1`, que SÓ o roteiro `scripts/gemini-real.mjs --sim` põe: uma variável
// exportada no shell não liga o teste por engano) e, além dela:
//   - CLI: o binário `gemini` e a `GEMINI_API_KEY` (a home isolada do board não enxerga o login da conta);
//   - ACP: o binário `gemini`. Com a chave, ela vai pelo `authenticate` do driver e a home é uma pasta temporária
//     vazia (`GEMINI_CLI_HOME`). SEM a chave vale o login da pessoa na home REAL: o Gemini lê e pode alterar
//     `~/.gemini` (credenciais renovadas, histórico) e carrega settings, GEMINI.md e extensões dela, o que pode
//     gerar desvio na conferência. Não se confere vazamento do token OAuth;
//   - API: a `GEMINI_API_KEY`.
// Diferente dos outros testes reais (ausência = falha), aqui a ausência PULA com o motivo no título: a chave e a
// confirmação são decisão da pessoa, e o `npm run test:cli-real` não pode gastar dinheiro sem ela.
// `FAZAI_REAL_GEMINI_MODEL` troca o modelo (padrão `gemini-2.5-flash`, o mais barato).
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GEMINI_API_ENDPOINT } from '../../src/extension/ai/drivers/gemini/api';
import { GEMINI_HOME_ENV, geminiPinnedEnv } from '../../src/extension/ai/providers/gemini';
import { spawnAcpProcess, spawnHeadless } from '../../src/extension/spawn';
import { GEMINI_TOOL_EQUIVALENTS } from '../../src/shared/agentTools';
import type { InventoryKind } from '../../src/shared/log';
import type { ModelOption } from '../../src/shared/models';
import { cardWorld, type CardWorld } from '../scenarios/cardWorld';

const KEY = process.env.GEMINI_API_KEY ?? '';
const CONFIRMED = process.env.FAZAI_REAL_CONFIRMED_BY_SCRIPT === '1';
const MODEL = process.env.FAZAI_REAL_GEMINI_MODEL || 'gemini-2.5-flash';

// só com a confirmação: sem ela nada do Gemini é executado, nem a versão
const BINARY =
  CONFIRMED &&
  (() => {
    const v = spawnSync('gemini', ['--version'], { encoding: 'utf8' });
    return !v.error && v.status === 0;
  })();

/** O motivo de o modo não rodar, ou null quando roda. */
function why(needs: { binary: boolean; key: boolean }): string | null {
  if (!CONFIRMED) return 'sem a confirmação do roteiro (gasta cota; use node scripts/gemini-real.mjs --sim)';
  if (needs.binary && !BINARY) return 'binário gemini ausente do PATH';
  if (needs.key && !KEY) return 'GEMINI_API_KEY ausente do ambiente';
  return null;
}

const MODEL_OPTION: ModelOption = {
  id: `gemini:${MODEL}`,
  tool: 'gemini',
  model: MODEL,
  label: MODEL,
  efforts: [],
  defaultEffort: null,
  fromTool: true,
};

const TOOLS = ['Read', 'Grep', 'Glob'];
/** Os kinds do ACP que o leitor grava como nome de ferramenta (o espelho de `ACP_KIND_EQUIVALENTS`, não exportado). */
const ACP_KINDS = ['think', 'switch_mode', 'other', 'read', 'search', 'edit', 'delete', 'move', 'execute', 'fetch'];
const INVENTORY_KINDS: InventoryKind[] = ['tool', 'mcp_tool', 'agent', 'skill'];
/** O que o card pede: mínimo, sem editar nada, para gastar poucos tokens. */
const DESCRIPTION =
  'Teste real de integração. Leia este card com a ferramenta get_card do board, responda em uma frase com a palavra OK e não altere nenhum arquivo.';

let world: CardWorld | undefined;
let acpHome: string | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
  if (acpHome) fs.rmSync(acpHome, { recursive: true, force: true });
  acpHome = undefined;
});

/** Escolhe o modelo barato no card (o atalho do mundo põe o Pro) e dá o texto mínimo ao card. */
function pickModel(w: CardWorld): void {
  w.router.handle({
    type: 'settings.models.set',
    catalog: [...w.router.snapshot().board.modelCatalog.filter((m) => m.id !== MODEL_OPTION.id), MODEL_OPTION],
  });
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: MODEL_OPTION.id });
  w.router.handle({ type: 'card.update', cardId: w.cardId, patch: { description: DESCRIPTION } });
}

/** O que vale nos três modos depois de uma execução de verdade. */
async function expectRealRun(w: CardWorld, mode: 'cli' | 'acp' | 'api') {
  const end = await w.run();
  const run = w.aiRun();
  // o que a pessoa compara com o painel do AI Studio (docs/decisoes/ferramenta-por-modo-14-teste-real-gemini.md)
  console.log(
    JSON.stringify({
      gemini: mode,
      model: MODEL,
      measure: end.report.measure,
      tokens: { in: run?.inputTokens, out: run?.outputTokens, cacheRead: run?.cacheReadTokens },
      inventory: end.report.inventory,
      check: end.check,
    }),
  );
  // a execução termina (sem tempo limite nem Parar) e o desfecho é o de sucesso
  expect(end.timedOut).toBe(false);
  expect(end.code, w.lines.slice(-12).join('\n')).toBe(0);
  // a conferência não acusa desvio falso: o card libera Read/Grep/Glob e o board, e nada mais foi pedido
  expect(end.check, JSON.stringify(end.report.inventory)).toEqual({ status: 'ok' });
  // o inventário no vocabulário certo: nunca um tipo desconhecido, nem nome vazio
  expect(end.report.inventory.length).toBeGreaterThan(0);
  for (const item of end.report.inventory) {
    expect(INVENTORY_KINDS).toContain(item.kind);
    expect(item.name).not.toBe('');
    expect(item.calls).toBeGreaterThan(0);
    // MCP é `<servidor>/<ferramenta>`; e na CLI as ferramentas nativas são os nomes do Gemini (a tabela da conferência)
    if (item.kind === 'mcp_tool') expect(item.name).toMatch(/^[^/]+\/.+/);
    // as ferramentas nativas no vocabulário do modo: CLI = nomes do Gemini; ACP = kinds do protocolo; API = nomes do card
    if (item.kind === 'tool') {
      const vocabulary = mode === 'cli' ? Object.keys(GEMINI_TOOL_EQUIVALENTS) : mode === 'acp' ? ACP_KINDS : TOOLS;
      expect(vocabulary, `ferramenta ${item.name} fora do vocabulário de ${mode}`).toContain(item.name);
    }
  }
  // o card mínimo manda ler o card pelo board: pelo menos uma chamada MCP a get_card, em qualquer modo
  expect(
    end.report.inventory.some((i) => i.kind === 'mcp_tool' && i.name.endsWith('get_card')),
    JSON.stringify(end.report.inventory),
  ).toBe(true);
  // o consumo registrado (tokens), sem custo, e a linha em ai_runs com o modo
  expect(['full', 'tokens']).toContain(end.report.measure);
  expect(run).toMatchObject({ tool: 'gemini', mode });
  expect(run!.inputTokens! + run!.outputTokens!).toBeGreaterThan(0);
  // a chave não aparece no log do card, nas conversas nem na linha de uso
  if (KEY) {
    expect(w.lines.join('\n')).not.toContain(KEY);
    expect(w.comments().join('\n')).not.toContain(KEY);
    expect(JSON.stringify(run)).not.toContain(KEY);
  }
  return end;
}

const cli = why({ binary: true, key: true });
const acp = why({ binary: true, key: false });
const api = why({ binary: false, key: true });
for (const [mode, reason] of [
  ['CLI', cli],
  ['ACP', acp],
  ['API', api],
] as const)
  if (reason) console.warn(`[gemini.real] modo ${mode} pulado: ${reason}`);

describe('Gemini real nos três modos (gasta cota; só com confirmação)', () => {
  it.skipIf(!!cli)(
    `CLI: gemini -p com a home isolada do board${cli ? ` (pulado: ${cli})` : ''}`,
    async () => {
      world = await cardWorld({
        profile: 'gemini-cli',
        tools: TOOLS,
        permission: 'board',
        spawn: (command, cwd, out, control) => spawnHeadless(command, cwd, out, process.env.PATH, control),
      });
      world.keys.set('gemini', KEY);
      pickModel(world);
      const end = await expectRealRun(world, 'cli');
      expect(end.format).toBe('gemini-stream-json');
      expect(world.cliCommands[0]!.args).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '-m', MODEL]));
    },
    240_000,
  );

  it.skipIf(!!acp)(
    `ACP: gemini --acp pelo transporte do board${acp ? ` (pulado: ${acp})` : ''}`,
    async () => {
      if (KEY) acpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gemini-real-acp-'));
      else
        console.warn(
          '[gemini.real] ACP SEM GEMINI_API_KEY: usa o login da home REAL (~/.gemini), que o Gemini pode alterar (credenciais, histórico); settings, GEMINI.md e extensões da pessoa podem gerar desvio na conferência.',
        );
      world = await cardWorld({
        profile: 'gemini',
        tools: TOOLS,
        permission: 'board',
        // o gateway entrega ao driver a chave do cofre, e o driver a usa no authenticate (como o produto); o
        // comando é o que o driver montou. Como o boardHost, só se acrescenta o formato; o ambiente é o fixado
        // do provider do Gemini (o .env da pasta não redireciona a API) e, com a chave, a home é uma pasta vazia
        gatewayKey: true,
        spawnAcp: (command, cwd, out) =>
          spawnAcpProcess(
            {
              ...command,
              format: 'text',
              env: { ...command.env, ...geminiPinnedEnv(), ...(acpHome ? { [GEMINI_HOME_ENV]: acpHome } : {}) },
            },
            cwd,
            out,
            process.env.PATH,
          ),
      });
      if (KEY) world.keys.set('gemini', KEY);
      pickModel(world);
      await expectRealRun(world, 'acp');
    },
    240_000,
  );

  it.skipIf(!!api)(
    `API: generateContent com a chave do cofre${api ? ` (pulado: ${api})` : ''}`,
    async () => {
      world = await cardWorld({ profile: 'gemini-api', tools: TOOLS, permission: 'board', api: { endpoint: GEMINI_API_ENDPOINT } });
      world.router.handle({ type: 'settings.aiProfiles.setEnabled', id: 'gemini', enabled: true });
      world.router.setProfileMode('gemini', 'api');
      world.keys.set('gemini', KEY);
      pickModel(world);
      await expectRealRun(world, 'api');
    },
    240_000,
  );
});
