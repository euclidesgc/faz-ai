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
  /** pasta da história (repo/ e acceptance/ dentro dela) */
  dir: string;
}

export interface AcceptanceResult {
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

interface StoryFile {
  title?: unknown;
  description?: unknown;
  startPhase?: unknown;
  timeoutMinutes?: unknown;
  acceptance?: { command?: unknown; timeoutSeconds?: unknown };
}

function readStory(root: string, id: string): ReferenceStory {
  const dir = path.join(root, id);
  const file = path.join(dir, 'story.json');
  let raw: StoryFile;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as StoryFile;
  } catch (err) {
    throw new Error(`História de referência inválida (${file}): ${(err as Error).message}`);
  }
  const command = raw.acceptance?.command;
  if (typeof raw.title !== 'string' || typeof raw.description !== 'string') {
    throw new Error(`História ${id}: "title" e "description" são obrigatórios em story.json.`);
  }
  if (!Array.isArray(command) || command.length === 0 || !command.every((c) => typeof c === 'string')) {
    throw new Error(`História ${id}: "acceptance.command" deve ser uma lista de textos não vazia.`);
  }
  return {
    id,
    title: raw.title,
    description: raw.description,
    startPhase: typeof raw.startPhase === 'string' ? raw.startPhase : 'Plan',
    timeoutMinutes: typeof raw.timeoutMinutes === 'number' ? raw.timeoutMinutes : 30,
    acceptance: {
      command: command as string[],
      timeoutSeconds: typeof raw.acceptance?.timeoutSeconds === 'number' ? raw.acceptance.timeoutSeconds : 120,
    },
    dir,
  };
}

/** Lê as histórias de `root` (uma pasta por história), em ordem alfabética; `only` filtra por id. */
export function loadStories(root: string, only?: string[]): ReferenceStory[] {
  const ids = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'story.json')))
    .map((e) => e.name)
    .sort();
  if (only) {
    const missing = only.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      throw new Error(`História(s) inexistente(s): ${missing.join(', ')}. Disponíveis: ${ids.join(', ')}.`);
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

/** Copia `acceptance/` para `<projeto>/.eval-acceptance/` só agora e roda o comando; mata no tempo limite (`exitCode: null`). */
export function runAcceptance(story: ReferenceStory, projectDir: string): Promise<AcceptanceResult> {
  const target = path.join(projectDir, '.eval-acceptance');
  fs.cpSync(path.join(story.dir, 'acceptance'), target, { recursive: true });
  const [cmd, ...args] = story.acceptance.command;
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
    const child = spawn(cmd!, args, { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
