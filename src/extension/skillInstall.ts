import * as fs from 'node:fs';
import * as path from 'node:path';
import { SKILL_NAME_PATTERN, type InstallableSkill } from '../shared/harness';

const MAX_DEPTH = 5;
const MAX_FOUND = 200;

const frontmatterValue = (text: string, key: string) =>
  new RegExp(`^${key}:\\s*(.*)$`, 'm')
    .exec(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '')?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '') ?? '';

function countFiles(dir: string, depth = 0): number {
  if (depth > MAX_DEPTH) return 0;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name), depth + 1) : e.isFile() ? 1 : 0), 0);
}

/** Pastas com SKILL.md dentro da origem (sem entrar em .git, node_modules ou pastas ocultas). */
export function findSkills(root: string): InstallableSkill[] {
  const out: InstallableSkill[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FOUND) return;
    const md = path.join(dir, 'SKILL.md');
    if (fs.existsSync(md) && fs.statSync(md).isFile()) {
      const name = path.basename(dir);
      out.push({
        rel: path.relative(root, dir).split(path.sep).join('/') || '.',
        name,
        description: frontmatterValue(fs.readFileSync(md, 'utf8').slice(0, 8192), 'description'),
        files: countFiles(dir) - 1,
        valid: SKILL_NAME_PATTERN.test(name),
      });
      return; // uma skill não contém outra
    }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') visit(path.join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
