import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SKILL_NAME_PATTERN, type InstallableSkill } from '../shared/harness';

const MAX_DEPTH = 5;
const MAX_FOUND = 200;

/** De onde vêm as skills: uma pasta desta máquina ou um repositório git. */
export type InstallSource = { kind: 'dir'; dir: string } | { kind: 'git'; url: string };

/** Aceita uma pasta existente, `dono/repositorio` (GitHub) ou um endereço git por https ou ssh. Nada além disso. */
export function parseSource(text: string, homeDir = ''): InstallSource {
  const source = text.trim();
  if (!source || source.startsWith('-')) throw new Error('Informe uma pasta ou o endereço de um repositório git.');
  const local = source.startsWith('~/') && homeDir ? path.join(homeDir, source.slice(2)) : source;
  if (path.isAbsolute(local)) {
    if (!fs.existsSync(local) || !fs.statSync(local).isDirectory()) throw new Error(`Pasta não encontrada: ${source}`);
    return { kind: 'dir', dir: local };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(source)) return { kind: 'git', url: `https://github.com/${source.replace(/\.git$/, '')}.git` };
  if (/^(https:\/\/|ssh:\/\/|git@)[\w.@:/~-]+$/.test(source)) return { kind: 'git', url: source };
  throw new Error('Origem não reconhecida. Use o caminho completo de uma pasta, "dono/repositorio" do GitHub ou um endereço https ou ssh de um repositório git.');
}

export type GitRunner = (args: string[]) => Promise<void>;

/** `git clone` sem rodar nada do repositório: sem hooks, sem submódulos, só o último commit. */
export const runGit: GitRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, _out, stderr) => (error ? reject(new Error(stderr.trim() || error.message)) : resolve()));
  });

/** Deixa a origem disponível numa pasta: a própria, se for local, ou um clone temporário. `cleanup` apaga o clone. */
export async function fetchSource(source: InstallSource, git: GitRunner = runGit): Promise<{ dir: string; cleanup: () => void }> {
  if (source.kind === 'dir') return { dir: source.dir, cleanup: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-skills-'));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  try {
    await git(['-c', 'core.hooksPath=/dev/null', 'clone', '--depth', '1', '--no-recurse-submodules', '--', source.url, path.join(dir, 'repo')]);
  } catch (e) {
    cleanup();
    throw new Error(`Não foi possível clonar ${source.url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { dir: path.join(dir, 'repo'), cleanup };
}

const frontmatterValue = (text: string, key: string) => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '')?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';

function countFiles(dir: string, depth = 0): number {
  if (depth > MAX_DEPTH) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name), depth + 1) : e.isFile() ? 1 : 0), 0);
}

/** Pastas com SKILL.md dentro da origem (sem entrar em .git, node_modules ou pastas ocultas). */
export function findSkills(root: string): InstallableSkill[] {
  const out: InstallableSkill[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FOUND) return;
    const md = path.join(dir, 'SKILL.md');
    if (fs.existsSync(md) && fs.statSync(md).isFile()) {
      const name = path.basename(dir);
      out.push({ rel: path.relative(root, dir).split(path.sep).join('/') || '.', name, description: frontmatterValue(fs.readFileSync(md, 'utf8').slice(0, 8192), 'description'), files: countFiles(dir) - 1, valid: SKILL_NAME_PATTERN.test(name) });
      return; // uma skill não contém outra
    }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') visit(path.join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Copia as skills escolhidas para a pasta de skills de destino. Não copia links simbólicos (poderiam
 * apontar para fora da skill) e não substitui uma skill que já existe. Nada da origem é executado.
 */
export function installSkills(root: string, rels: string[], destRoot: string): string[] {
  const known = new Map(findSkills(root).map((k) => [k.rel, k]));
  const chosen = rels.map((rel) => {
    const found = known.get(rel);
    if (!found) throw new Error(`Skill não encontrada na origem: ${rel}`);
    if (!found.valid) throw new Error(`"${found.name}" não é um nome de skill válido (letras minúsculas, números e hífens).`);
    if (fs.existsSync(path.join(destRoot, found.name))) throw new Error(`Já existe uma skill "${found.name}" no destino.`);
    return found;
  });
  fs.mkdirSync(destRoot, { recursive: true });
  return chosen.map((k) => {
    const dest = path.join(destRoot, k.name);
    fs.cpSync(k.rel === '.' ? root : path.join(root, ...k.rel.split('/')), dest, { recursive: true, filter: (src) => !fs.lstatSync(src).isSymbolicLink() && path.basename(src) !== '.git' });
    return path.join(dest, 'SKILL.md');
  });
}
