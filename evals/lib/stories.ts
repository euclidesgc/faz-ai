import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ReferenceStory {
  id: string;
  title: string;
  description: string;
  startPhase: string;
  timeoutMinutes: number;
  acceptance: { command: string[]; timeoutSeconds: number };
  /** anexos (artefatos de fase) que a história precisa ter ao fim, além do aceite do código; [] quando não há */
  requiredArtifacts: string[];
  /** pasta da história (repo/ e acceptance/ dentro dela) */
  dir: string;
}

export interface AcceptanceResult {
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

export const START_PHASES = ['Discovery', 'PRD', 'Spec', 'Plan'];
const STORY_KEYS = ['title', 'description', 'startPhase', 'timeoutMinutes', 'acceptance', 'requiredArtifacts'];
const ACCEPTANCE_KEYS = ['command', 'timeoutSeconds'];

/** A história pedida em `--story` não existe; o runner sai com código 2. */
export class UnknownStoryError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida o conteúdo de um `story.json` (campo extra, faltando ou de tipo errado lança, dizendo o campo) e aplica
 * os padrões. Um campo desconhecido reprova de propósito: um erro de digitação não pode virar padrão em silêncio.
 */
export function parseStory(raw: unknown, id: string, dir: string): ReferenceStory {
  const fail = (msg: string): never => {
    throw new Error(`História ${id}: ${msg}`);
  };
  if (!isRecord(raw)) return fail('story.json deve ser um objeto.');
  for (const key of Object.keys(raw)) if (!STORY_KEYS.includes(key)) fail(`campo desconhecido "${key}" em story.json.`);
  if (typeof raw.title !== 'string' || raw.title.trim() === '') fail('"title" é obrigatório (texto) em story.json.');
  if (typeof raw.description !== 'string' || raw.description.trim() === '') fail('"description" é obrigatório (texto) em story.json.');
  const acceptance = raw.acceptance;
  if (!isRecord(acceptance)) return fail('"acceptance" é obrigatório (objeto) em story.json.');
  for (const key of Object.keys(acceptance)) if (!ACCEPTANCE_KEYS.includes(key)) fail(`campo desconhecido "acceptance.${key}".`);
  const command = acceptance.command;
  if (!Array.isArray(command) || command.length === 0 || !command.every((c) => typeof c === 'string')) {
    fail('"acceptance.command" deve ser uma lista de textos não vazia.');
  }
  const timeoutSeconds = acceptance.timeoutSeconds ?? 120;
  if (typeof timeoutSeconds !== 'number' || !(timeoutSeconds > 0)) fail('"acceptance.timeoutSeconds" deve ser um número maior que zero.');
  const startPhase = raw.startPhase ?? 'Plan';
  if (typeof startPhase !== 'string' || !START_PHASES.includes(startPhase)) {
    fail(`"startPhase" deve ser uma de ${START_PHASES.join(', ')}.`);
  }
  const timeoutMinutes = raw.timeoutMinutes ?? 30;
  if (typeof timeoutMinutes !== 'number' || !Number.isInteger(timeoutMinutes) || timeoutMinutes <= 0) {
    fail('"timeoutMinutes" deve ser um inteiro maior que zero.');
  }
  const requiredArtifacts = raw.requiredArtifacts ?? [];
  if (!Array.isArray(requiredArtifacts) || !requiredArtifacts.every((a) => typeof a === 'string' && a !== '')) {
    fail('"requiredArtifacts" deve ser uma lista de nomes de arquivo.');
  }
  return {
    id,
    title: raw.title as string,
    description: raw.description as string,
    startPhase: startPhase as string,
    timeoutMinutes: timeoutMinutes as number,
    acceptance: { command: command as string[], timeoutSeconds: timeoutSeconds as number },
    requiredArtifacts: requiredArtifacts as string[],
    dir,
  };
}

function readStory(root: string, id: string): ReferenceStory {
  const dir = path.join(root, id);
  const file = path.join(dir, 'story.json');
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`História de referência inválida (${file}): ${(err as Error).message}`);
  }
  return parseStory(raw, id, dir);
}

/** Lê as histórias de `root` (uma pasta por história), em ordem alfabética; `only` filtra por id. */
export function loadStories(root: string, only?: string[]): ReferenceStory[] {
  const ids = (fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : [])
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'story.json')))
    .map((e) => e.name)
    .sort();
  if (only) {
    const missing = only.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      throw new UnknownStoryError(`História "${missing.join('", "')}" não existe. Disponíveis: ${ids.join(', ')}`);
    }
  }
  return ids.filter((id) => !only || only.includes(id)).map((id) => readStory(root, id));
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} falhou: ${r.stderr || r.error?.message || ''}`);
}

/** Copia `repo/` para `projectDir`, `git init -b main` e um commit inicial. */
export function prepareProject(story: ReferenceStory, projectDir: string): void {
  fs.cpSync(path.join(story.dir, 'repo'), projectDir, { recursive: true });
  git(projectDir, ['init', '-b', 'main']);
  git(projectDir, ['add', '-A']);
  git(projectDir, [
    '-c',
    'user.name=Faz AI Eval',
    '-c',
    'user.email=eval@faz-ai.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Estado inicial',
  ]);
}

/**
 * Troca um argumento `pasta/*.ext` pelos arquivos que ele casa, em ordem. O comando roda sem shell e o
 * `node --test` só expande glob a partir do Node 21; assim o aceite se comporta igual no 20 e no 24.
 */
function expandGlobs(command: string[], cwd: string): string[] {
  return command.flatMap((arg) => {
    const m = /^(.*\/)?\*(\.[A-Za-z0-9.]+)$/.exec(arg);
    if (!m) return [arg];
    const dir = m[1] ?? '';
    const found = fs.existsSync(path.join(cwd, dir))
      ? fs
          .readdirSync(path.join(cwd, dir))
          .filter((f) => f.endsWith(m[2]!))
          .sort()
      : [];
    return found.length > 0 ? found.map((f) => `${dir}${f}`) : [arg];
  });
}

/** Copia `acceptance/` para `<projeto>/.eval-acceptance/` só agora e roda o comando; mata no tempo limite (`exitCode: null`). */
export function runAcceptance(story: ReferenceStory, projectDir: string): Promise<AcceptanceResult> {
  const target = path.join(projectDir, '.eval-acceptance');
  fs.cpSync(path.join(story.dir, 'acceptance'), target, { recursive: true });
  const [cmd, ...args] = expandGlobs(story.acceptance.command, projectDir);
  const started = Date.now();
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ passed: exitCode === 0, exitCode, durationMs: Date.now() - started, output });
    };
    const child = spawn(cmd!, args, {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      // sem cor e em UTC: a saída e o resultado não dependem da máquina de quem roda
      env: { ...process.env, NO_COLOR: '1', TZ: 'UTC' },
    });
    const killTree = (): void => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
      finish(null);
    }, story.acceptance.timeoutSeconds * 1000);
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', (err) => {
      output += String(err);
      finish(null);
    });
    child.on('close', (code) => finish(timedOut ? null : code));
  });
}
