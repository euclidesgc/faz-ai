import * as fs from 'node:fs';
import * as path from 'node:path';
import { RULE_FILES, SKILL_NAME_PATTERN, type Harness, type RuleFile, type Skill } from '../shared/harness';

const SKILLS_DIR = path.join('.claude', 'skills');
/** Skills desligadas ficam fora da pasta lida pelas ferramentas, sem perder o conteúdo. */
const DISABLED_DIR = path.join('.claude', 'skills-disabled');
const MAX_BYTES = 512 * 1024;

/** Lê `name` e `description` do frontmatter YAML de um SKILL.md (só valores de uma linha). */
export function parseFrontmatter(content: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return {};
  const get = (key: string) => {
    const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(m[1]!);
    return line ? line[1]!.trim().replace(/^["']|["']$/g, '') : undefined;
  };
  return { name: get('name'), description: get('description') };
}

export function skillTemplate(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description.replace(/\r?\n/g, ' ').trim()}\n---\n\n${body.trim()}\n`;
}

/** Arquivos de regras e skills de uma pasta de projeto. Não depende da API do VSCode. */
export class HarnessStore {
  constructor(readonly workspaceDir: string) {}

  scan(): Harness {
    const rules: RuleFile[] = RULE_FILES.map(({ name }) => {
      const file = path.join(this.workspaceDir, name);
      const exists = fs.existsSync(file) && fs.statSync(file).isFile();
      return { name, exists, content: exists ? this.read(file) : '' };
    });
    const skills = [...this.skillsIn(SKILLS_DIR, true), ...this.skillsIn(DISABLED_DIR, false)].sort((a, b) => a.name.localeCompare(b.name));
    return { rules, skills };
  }

  writeRule(name: string, content: string): void {
    fs.writeFileSync(this.rulePath(name), content);
  }

  deleteRule(name: string): void {
    fs.rmSync(this.rulePath(name), { force: true });
  }

  createSkill(name: string, description: string, body: string): void {
    this.checkName(name);
    if (this.find(name)) throw new Error(`Já existe uma skill "${name}".`);
    if (!description.trim()) throw new Error('A skill precisa de uma descrição: é por ela que a IA decide quando usar a skill.');
    const dir = path.join(this.workspaceDir, SKILLS_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillTemplate(name, description, body));
  }

  /** Substitui o SKILL.md inteiro (com o frontmatter). */
  writeSkill(name: string, content: string): void {
    fs.writeFileSync(path.join(this.dirOf(name), 'SKILL.md'), content);
  }

  setSkillEnabled(name: string, enabled: boolean): void {
    const from = this.dirOf(name);
    const to = path.join(this.workspaceDir, enabled ? SKILLS_DIR : DISABLED_DIR, name);
    if (from === to) return;
    if (fs.existsSync(to)) throw new Error(`Já existe uma skill "${name}" ${enabled ? 'ligada' : 'desligada'}.`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }

  deleteSkill(name: string): void {
    fs.rmSync(this.dirOf(name), { recursive: true, force: true });
  }

  private find(name: string): string | undefined {
    return [SKILLS_DIR, DISABLED_DIR].map((d) => path.join(this.workspaceDir, d, name)).find((d) => fs.existsSync(path.join(d, 'SKILL.md')));
  }

  private dirOf(name: string): string {
    this.checkName(name);
    const dir = this.find(name);
    if (!dir) throw new Error(`Skill "${name}" não encontrada.`);
    return dir;
  }

  private checkName(name: string): void {
    if (!SKILL_NAME_PATTERN.test(name)) throw new Error('Nome de skill inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").');
  }

  private rulePath(name: string): string {
    if (!RULE_FILES.some((r) => r.name === name)) throw new Error(`Arquivo de regras desconhecido: "${name}". Aceitos: ${RULE_FILES.map((r) => r.name).join(', ')}.`);
    return path.join(this.workspaceDir, name);
  }

  private read(file: string): string {
    return fs.statSync(file).size > MAX_BYTES ? '' : fs.readFileSync(file, 'utf8');
  }

  private skillsIn(relDir: string, enabled: boolean): Skill[] {
    const base = path.join(this.workspaceDir, relDir);
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && SKILL_NAME_PATTERN.test(e.name) && fs.existsSync(path.join(base, e.name, 'SKILL.md')))
      .map((e) => {
        const rel = path.join(relDir, e.name, 'SKILL.md');
        const content = this.read(path.join(this.workspaceDir, rel));
        return { name: e.name, description: parseFrontmatter(content).description ?? '', enabled, path: rel, content };
      });
  }
}
