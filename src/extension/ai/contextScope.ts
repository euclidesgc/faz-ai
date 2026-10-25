// O teste do contexto do card no host (as regras puras estão em `shared/contextScope.ts`). Roda o agente pelo
// gateway, como o teste rápido do perfil: contrato fechado, sem ferramentas, sem MCP e com as travas que o board
// usa num card. Três rodadas no máximo: a descoberta (onde a ferramenta lê), a citação dos arquivos que existem, na
// pasta do projeto, e a das iscas dos locais do projeto que ainda não existem, numa pasta descartável. A pasta
// pessoal só é lida: o board nunca escreve nela para testar.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isReadyCli, profileBase, type AiProfile } from '../../shared/aiProfiles';
import {
  TEXT_KINDS,
  canaryLine,
  closedByConstruction,
  estimateTokens,
  isBoardReference,
  overlapOf,
  type ContextOverlap,
  discoveryPrompt,
  parseDiscovery,
  pickQuoteLine,
  quoteProbe,
  quoted,
  unresolvablePath,
  verificationPrompt,
  type ContextLocation,
  type ContextLocationResult,
  type ContextScopeReport,
  type LocationVerdict,
  type QuoteProbe,
} from '../../shared/contextScope';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';
import { admissionRegimeOf, DEFAULT_RUNNER, type RunnerConfig } from '../../shared/runner';
import { bareExec } from '../execution';
import type { AiProfileRepo } from '../repositories/aiProfileRepo';
import { NO_CARD, type AiGateway, type ContextRuntime } from './gateway';
import { closedV1 } from './v1Prepare';

export interface ContextScopeDeps {
  repo: Pick<AiProfileRepo, 'resolveProfile'>;
  gateway: Pick<AiGateway, 'run'> & { runtime?: ContextRuntime };
  boardId: () => string;
  cwd: string;
  homeDir: string;
  runner?: () => RunnerConfig;
  /** a versão do agente agora (a do Conectar); vai no relatório para o teste vencer quando ela mudar */
  version: (profileId: string) => string | null;
  /** os locais que a pessoa acrescentou para este agente */
  extra: (profileId: string) => ContextLocation[];
  log?: (line: string) => void;
  random?: () => number;
}

const MAX_FILES_PER_LOCATION = 5;
const MAX_PROJECT_SCAN = 15;
const MAX_FILE_BYTES = 256 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'build']);
const INSTRUCTION_FILE = /\.(md|mdc|txt)$/i;

/** O que o agente recebeu e se ele usou ferramentas (aí ele pode ter aberto o arquivo de propósito). */
interface Answer {
  text: string;
  usedTools: boolean;
}

/** `**` casa zero ou mais pastas; `*` e `?` dentro de um nome. */
function segmentMatcher(segment: string): RegExp {
  const escaped = segment
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

/** Os arquivos que casam o caminho com curinga, a partir de `base`; para em `limit`. */
export function expandGlob(base: string, pattern: string, limit = MAX_FILES_PER_LOCATION): string[] {
  const parts = pattern.split('/').filter(Boolean);
  const out: string[] = [];
  const walk = (dir: string, i: number, depth: number): void => {
    if (out.length >= limit || depth > 6) return;
    if (i === parts.length) {
      if (fs.existsSync(dir) && fs.statSync(dir).isFile()) out.push(dir);
      return;
    }
    const part = parts[i]!;
    if (part === '**') {
      walk(dir, i + 1, depth);
      for (const e of entries(dir)) if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), i, depth + 1);
      return;
    }
    if (!/[*?]/.test(part)) return walk(path.join(dir, part), i + 1, depth);
    const re = segmentMatcher(part);
    for (const e of entries(dir)) if (re.test(e.name)) walk(path.join(dir, e.name), i + 1, depth);
  };
  walk(base, 0, 0);
  return out;
}

function entries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** O caminho de um arquivo como a tela mostra: relativo ao projeto, `~/` na pasta pessoal ou absoluto. */
function displayPath(file: string, root: string, home: string): string {
  const rel = path.relative(root, file);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  const fromHome = path.relative(home, file);
  if (!fromHome.startsWith('..') && !path.isAbsolute(fromHome)) return `~/${fromHome.split(path.sep).join('/')}`;
  return file;
}

/**
 * Os arquivos de um local nesta máquina. No projeto, um nome sem curinga (`CLAUDE.md`) também vale nas pastas
 * acima da raiz até a pasta pessoal: é onde muitas ferramentas procuram as instruções herdadas.
 */
function filesOf(loc: ContextLocation, root: string, home: string): string[] {
  if (loc.scope === 'user') {
    const abs = loc.path.startsWith('~') ? path.join(home, loc.path.replace(/^~\/?/, '')) : loc.path;
    return expandGlob(path.parse(abs).root, path.relative(path.parse(abs).root, abs));
  }
  const found = expandGlob(root, loc.path);
  if (!/[*?]/.test(loc.path) && !loc.path.includes('/')) {
    for (let dir = path.dirname(root); dir !== path.dirname(dir) && found.length < MAX_FILES_PER_LOCATION; dir = path.dirname(dir)) {
      const file = path.join(dir, loc.path);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) found.push(file);
      if (dir === home || !dir.startsWith(home)) break;
    }
  }
  return found;
}

/** Um caminho concreto para a isca de um local com curinga: `**` vira nada, `*` vira um nome do board. */
const instantiate = (pattern: string): string =>
  pattern
    .split('/')
    .filter((p) => p && p !== '**')
    .map((p) => p.replace(/\*/g, 'fazai-teste').replace(/\?/g, 'x'))
    .join('/');

/** Os arquivos de instrução do projeto que nenhum local cobre: os da raiz e os das pastas ocultas, até três níveis. */
function projectInstructionFiles(root: string, covered: Set<string>): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number, hidden: boolean): void => {
    for (const e of entries(dir)) {
      if (out.length >= MAX_PROJECT_SCAN) return;
      const full = path.join(dir, e.name);
      if (e.isFile() && INSTRUCTION_FILE.test(e.name) && (hidden || depth === 0) && !covered.has(full)) out.push(full);
      else if (e.isDirectory() && !SKIP_DIRS.has(e.name) && depth < 3 && (hidden || e.name.startsWith('.')))
        visit(full, depth + 1, hidden || e.name.startsWith('.'));
    }
  };
  visit(root, 0, false);
  return out;
}

function readText(file: string): string | null {
  try {
    if (fs.statSync(file).size > MAX_FILE_BYTES) return null;
    const text = fs.readFileSync(file, 'utf8');
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

/** Uma rodada de citação: os trechos, o controle e, para cada trecho, o local e o arquivo dele. */
interface Round {
  probes: QuoteProbe[];
  owners: Map<string, { index: number; file: string }>;
}

export async function runContextScope(deps: ContextScopeDeps, profileId: string): Promise<ContextScopeReport> {
  const random = deps.random ?? Math.random;
  const profile = deps.repo.resolveProfile(deps.boardId(), profileId);
  const base: Omit<ContextScopeReport, 'locations' | 'discovered' | 'control'> = {
    profileId,
    version: deps.version(profileId),
    at: Date.now(),
  };
  // no modo API o board monta cada pedido: perguntar ao modelo onde "a ferramenta" lê traria a resposta de outro
  // programa (a CLI), e ele exigiria um modelo que o teste não tem; fechado por construção, sem gastar a conta
  if (closedByConstruction(profile)) return { ...base, discovered: false, control: true, locations: [], byConstruction: true };
  const ask = (prompt: string, cwd: string) => askAgent(deps, profile, prompt, cwd);

  // 1. descoberta: onde a ferramenta lê, segundo o próprio agente
  let declared: ContextLocation[] | null = null;
  try {
    declared = parseDiscovery((await ask(discoveryPrompt(), deps.cwd)).text);
  } catch (e) {
    return { ...base, discovered: false, control: false, locations: [], error: e instanceof Error ? e.message : String(e) };
  }
  const extra = deps.extra(profileId);
  const locations: ContextLocation[] = [...(declared ?? []), ...extra.filter((x) => !declared?.some((d) => same(d, x)))];

  // 2. o que testar em cada local
  const verdicts: (LocationVerdict | null)[] = locations.map(() => null);
  const inProject: Round = { probes: [], owners: new Map() };
  const inFixture: Round & { canaries: Map<string, string> } = { probes: [], owners: new Map(), canaries: new Map() };
  let next = 1;
  const add = (round: Round, index: number, file: string, line: string) => {
    const probe = quoteProbe(`t${next++}`, line);
    round.probes.push(probe);
    round.owners.set(probe.id, { index, file });
  };
  const covered = new Set<string>();
  // o texto de cada arquivo que existe, pelo caminho que a tela mostra: dá o custo e a comparação do que vazar
  const texts = new Map<string, string>();
  locations.forEach((loc, i) => {
    if (!TEXT_KINDS.includes(loc.kind)) return void (verdicts[i] = { state: 'untested', reason: 'not-text' });
    if (unresolvablePath(loc.path)) return void (verdicts[i] = { state: 'untested', reason: 'pattern' });
    const found = filesOf(loc, deps.cwd, deps.homeDir);
    found.forEach((f) => covered.add(f));
    if (found.length) {
      let probed = 0;
      for (const file of found) {
        const text = readText(file);
        const line = text && pickQuoteLine(text, loc.kind, random);
        if (!line) continue;
        texts.set(displayPath(file, deps.cwd, deps.homeDir), text);
        add(inProject, i, displayPath(file, deps.cwd, deps.homeDir), line);
        probed++;
      }
      if (!probed) verdicts[i] = { state: 'untested', reason: 'no-line' };
      return;
    }
    if (loc.scope === 'user') return void (verdicts[i] = { state: 'untested', reason: 'missing-user' });
    // o local do projeto ainda não existe: uma isca no mesmo caminho, na pasta descartável
    const rel = instantiate(loc.path);
    if (!rel) return void (verdicts[i] = { state: 'untested', reason: 'pattern' });
    const line = canaryLine(random);
    inFixture.canaries.set(rel, line);
    add(inFixture, i, rel, line);
  });
  // os arquivos de instrução do projeto que o agente não citou também são conferidos
  for (const file of projectInstructionFiles(deps.cwd, covered)) {
    const text = readText(file);
    const line = text && pickQuoteLine(text, 'instructions', random);
    if (!line) continue;
    locations.push({
      path: displayPath(file, deps.cwd, deps.homeDir),
      scope: 'project',
      kind: 'instructions',
      loads: null,
      source: 'project',
    });
    verdicts.push(null);
    texts.set(displayPath(file, deps.cwd, deps.homeDir), text);
    add(inProject, locations.length - 1, displayPath(file, deps.cwd, deps.homeDir), line);
  }

  // 3. as rodadas de citação
  let control = true;
  const settle = async (round: Round, cwd: string) => {
    if (!round.probes.length) return;
    const controlLine = canaryLine(random);
    const controlProbe = quoteProbe('t0', controlLine);
    let answer: Answer;
    try {
      answer = await ask(verificationPrompt(round.probes, { line: controlLine, probe: controlProbe }), cwd);
    } catch (e) {
      deps.log?.(`[contexto] rodada falhou: ${e instanceof Error ? e.message : String(e)}`);
      control = false;
      for (const { index } of round.owners.values()) verdicts[index] ??= { state: 'untested', reason: 'run-failed' };
      return;
    }
    const controlOk = quoted(answer.text, controlProbe);
    if (!controlOk || answer.usedTools) control = false;
    const how = round === inProject ? 'quote' : 'canary';
    const leaked = new Map<number, string[]>();
    const clean = new Set<number>();
    for (const probe of round.probes) {
      const { index, file } = round.owners.get(probe.id)!;
      // citar o resto da linha é prova de que o arquivo chegou, com ou sem o controle; ferramentas usadas anulam
      if (!answer.usedTools && quoted(answer.text, probe)) leaked.set(index, [...(leaked.get(index) ?? []), file]);
      else clean.add(index);
    }
    for (const [index, list] of leaked) verdicts[index] = { state: 'leaks', how, files: list };
    for (const index of clean) {
      if (leaked.has(index)) continue;
      verdicts[index] = answer.usedTools
        ? { state: 'untested', reason: 'used-tools' }
        : controlOk
          ? { state: 'controlled', how }
          : { state: 'untested', reason: 'control-failed' };
    }
  };
  await settle(inProject, deps.cwd);
  if (inFixture.probes.length) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-contexto-'));
    try {
      // um repositório próprio: a ferramenta para de procurar instruções na raiz dele, e não nas pastas de cima
      try {
        execFileSync('git', ['init', '-q'], { cwd: fixture, stdio: 'ignore' });
      } catch {
        // sem git, a pasta segue servindo: só as pastas acima ficam sem barreira
      }
      for (const [rel, line] of inFixture.canaries) {
        const file = path.join(fixture, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${line}\n`);
      }
      await settle(inFixture, fixture);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }
  const results: ContextLocationResult[] = locations.map((loc, i) => {
    const verdict = verdicts[i] ?? { state: 'untested', reason: 'run-failed' };
    // o custo de cada arquivo que vaza: a isca de um local que ainda não existe não custa nada hoje
    return verdict.state === 'leaks'
      ? {
          ...loc,
          verdict: {
            ...verdict,
            tokens: verdict.files.map((f) => leakCost(texts.get(f), loc.kind)),
            // o arquivo que já é só a referência do board não pede mais ação
            ...(verdict.files.some((f) => isBoardReference(texts.get(f)))
              ? { refs: verdict.files.map((f) => isBoardReference(texts.get(f))) }
              : {}),
          },
        }
      : { ...loc, verdict };
  });
  const leakedTexts = results.flatMap((l) =>
    l.verdict.state === 'leaks' ? l.verdict.files.filter((f) => texts.has(f)).map((f) => [f, texts.get(f)!] as const) : [],
  );
  const overlaps: ContextOverlap[] = [];
  for (let i = 0; i < leakedTexts.length; i++)
    for (let j = i + 1; j < leakedTexts.length; j++) {
      const [a, ta] = leakedTexts[i]!;
      const [b, tb] = leakedTexts[j]!;
      const o = overlapOf(ta, tb);
      // só o que repete de verdade: um quarto das linhas de um dos dois
      if (o && Math.max(o.aInB, o.bInA) >= 0.25) overlaps.push({ a, b, ...o });
    }
  return {
    ...base,
    at: Date.now(),
    discovered: declared !== null,
    control,
    locations: results,
    ...(overlaps.length ? { overlaps } : {}),
  };
}

const same = (a: ContextLocation, b: ContextLocation) => a.scope === b.scope && a.path === b.path;

/**
 * O que um arquivo que vaza põe no contexto. Da skill e do agente, só a descrição do cabeçalho entra sempre (o corpo
 * carrega sob demanda); dos outros, o arquivo inteiro.
 */
function leakCost(text: string | undefined, kind: ContextLocation['kind']): number {
  if (!text) return 0;
  if (kind === 'skill' || kind === 'agent') {
    const description = text.split(/\r?\n/).find((l) => /^description:\s*\S/.test(l));
    if (description) return estimateTokens(description);
  }
  return estimateTokens(text);
}

/** Uma pergunta avulsa ao agente, rodando como no teste (sem ferramentas, na pasta do projeto): devolve o texto. */
export async function askContextQuestion(deps: ContextScopeDeps, profileId: string, prompt: string): Promise<string> {
  const profile = deps.repo.resolveProfile(deps.boardId(), profileId);
  if (closedByConstruction(profile)) throw new Error('No modo API não há ferramenta instalada para perguntar.');
  return (await askAgent(deps, profile, prompt, deps.cwd)).text;
}

/** Uma rodada do agente pelo gateway, com as mesmas travas de um card e sem ferramentas. */
function askAgent(deps: ContextScopeDeps, profile: AiProfile, prompt: string, cwd: string): Promise<Answer> {
  const runner = deps.runner?.() ?? DEFAULT_RUNNER;
  const id = profile.id;
  const strict: StrictExecutionRequest = {
    version: 1,
    ...admissionRegimeOf(runner),
    agentTools: { categories: [], native: { tool: '', allow: [], deny: [] } },
    boardTools: { mode: 'explicit', value: [] },
    activeMcpIds: [],
    allowedMcpIds: [],
    boardMcpIds: [],
    mcpServers: [],
    mcpTools: [],
    boardMcpTools: [],
    mcpLevel: { permission: 'board', tools: [] },
  };
  // sem ferramentas e com a lista de MCP vazia: a do Claude Code leva o `--strict-mcp-config`, como num card
  const exec = {
    ...bareExec(null),
    tools: [],
    mcpConfig: JSON.stringify({ mcpServers: {} }),
    ...(profileBase(profile) === 'claude' ? { toolSet: 'explicit' as const } : {}),
  };
  return new Promise<Answer>((resolve, reject) => {
    const execution = deps.gateway.run({
      origin: 'test',
      tool: id,
      profile,
      context: NO_CARD,
      cwd,
      timeoutMinutes: 5,
      prepare: () => ({
        ...(isReadyCli(profile) ? {} : { strict: { profileId: id, request: strict } }),
        ...(deps.gateway.runtime === 'v1' ? closedV1(id, 'chat', runner) : {}),
        config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
        input: { prompt, permission: 'board', structured: true, exec, draftOnly: true },
      }),
      log: (line) => deps.log?.(`[contexto] ${line}`),
    });
    execution.onExit((end) => {
      if (end.outcome !== 'done') {
        reject(
          end.error ??
            new Error(end.timedOut ? 'O teste do contexto excedeu cinco minutos.' : 'O agente não terminou o teste do contexto.'),
        );
        return;
      }
      resolve({ text: end.report.answer, usedTools: end.report.inventory.some((i) => i.calls > 0) });
    });
  });
}
