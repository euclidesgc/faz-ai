import * as fs from 'node:fs';
import * as path from 'node:path';
import { RULE_FILES, SKILL_NAME_PATTERN, skillDirs, type AiTool, type Harness, type RuleFile, type Skill } from '../shared/harness';

/** Todas as pastas de skills de projeto que alguma ferramenta lê. */
const KNOWN_SKILL_DIRS = ['.claude/skills', '.agents/skills'];
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

const isLink = (p: string): boolean => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/** Arquivos de regras e skills de uma pasta de projeto. Não depende da API do VSCode. */
export class HarnessStore {
  constructor(readonly workspaceDir: string, private tools: AiTool[]) {}

  setTools(tools: AiTool[]): void {
    this.tools = tools;
    this.syncMirror();
  }

  private get dirs() {
    const d = skillDirs(this.tools);
    // skills desligadas ficam ao lado da pasta principal, fora do que as ferramentas leem
    return { ...d, disabled: `${d.primary}-disabled` };
  }

  scan(): Harness {
    const rules: RuleFile[] = RULE_FILES.map(({ name }) => {
      const file = path.join(this.workspaceDir, name);
      const exists = fs.existsSync(file) && fs.statSync(file).isFile();
      return { name, exists, content: exists ? this.read(file) : '' };
    });
    // a pasta principal vem primeiro; skills que já existiam nas outras pastas também aparecem
    const enabledDirs = [this.dirs.primary, ...KNOWN_SKILL_DIRS.filter((d) => d !== this.dirs.primary)];
    const disabledDirs = KNOWN_SKILL_DIRS.map((d) => `${d}-disabled`);
    const byName = new Map<string, Skill>();
    for (const [dirs, enabled] of [[enabledDirs, true], [disabledDirs, false]] as const)
      for (const d of dirs) for (const k of this.skillsIn(d, enabled)) if (!byName.has(k.name)) byName.set(k.name, k);
    return { rules, skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) };
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
    const dir = path.join(this.workspaceDir, this.dirs.primary, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillTemplate(name, description, body));
    this.syncMirror();
  }

  /** Substitui o SKILL.md inteiro (com o frontmatter). */
  writeSkill(name: string, content: string): void {
    fs.writeFileSync(path.join(this.dirOf(name).dir, 'SKILL.md'), content);
  }

  setSkillEnabled(name: string, enabled: boolean): void {
    const found = this.dirOf(name);
    if (found.enabled === enabled) return;
    // ao desligar, a skill vai para o "-disabled" da pasta em que está; ao ligar, volta para a principal
    const toBase = enabled ? this.dirs.primary : `${found.base}-disabled`;
    const to = path.join(this.workspaceDir, toBase, name);
    if (fs.existsSync(to)) throw new Error(`Já existe uma skill "${name}" ${enabled ? 'ligada' : 'desligada'}.`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(found.dir, to);
    this.syncMirror();
  }

  deleteSkill(name: string): void {
    fs.rmSync(this.dirOf(name).dir, { recursive: true, force: true });
    this.syncMirror();
  }

  /**
   * Mantém em `mirror` um atalho para cada skill ligada da pasta principal, e remove atalhos que
   * apontam para skills que não existem mais. Pastas reais no espelho nunca são tocadas.
   */
  syncMirror(): void {
    for (const d of KNOWN_SKILL_DIRS) {
      const base = path.join(this.workspaceDir, d);
      if (!fs.existsSync(base)) continue;
      for (const e of fs.readdirSync(base)) {
        const p = path.join(base, e);
        if (isLink(p) && (d !== this.dirs.mirror || !fs.existsSync(path.join(p, 'SKILL.md')))) fs.rmSync(p, { force: true });
      }
    }
    const { primary, mirror } = this.dirs;
    if (!mirror) return;
    const from = path.join(this.workspaceDir, primary);
    if (!fs.existsSync(from)) return;
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (!e.isDirectory() || !fs.existsSync(path.join(from, e.name, 'SKILL.md'))) continue;
      const link = path.join(this.workspaceDir, mirror, e.name);
      if (fs.existsSync(link) || isLink(link)) continue;
      fs.mkdirSync(path.dirname(link), { recursive: true });
      const target = path.join(from, e.name);
      // junction no Windows dispensa privilégio de administrador; nos demais, link relativo (funciona após clonar)
      if (process.platform === 'win32') fs.symlinkSync(target, link, 'junction');
      else fs.symlinkSync(path.relative(path.dirname(link), target), link, 'dir');
    }
  }

  private find(name: string): { dir: string; base: string; enabled: boolean } | undefined {
    for (const [enabled, suffix] of [[true, ''], [false, '-disabled']] as const)
      for (const base of [this.dirs.primary, ...KNOWN_SKILL_DIRS]) {
        const dir = path.join(this.workspaceDir, `${base}${suffix}`, name);
        if (!isLink(dir) && fs.existsSync(path.join(dir, 'SKILL.md'))) return { dir, base, enabled };
      }
    return undefined;
  }

  private dirOf(name: string) {
    this.checkName(name);
    const found = this.find(name);
    if (!found) throw new Error(`Skill "${name}" não encontrada.`);
    return found;
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

  /** Skills reais de uma pasta (atalhos do espelho são ignorados, para não listar em dobro). */
  private skillsIn(relDir: string, enabled: boolean): Skill[] {
    const base = path.join(this.workspaceDir, relDir);
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((n) => SKILL_NAME_PATTERN.test(n) && !isLink(path.join(base, n)) && fs.existsSync(path.join(base, n, 'SKILL.md')))
      .map((n) => {
        const rel = path.join(relDir, n, 'SKILL.md');
        const content = this.read(path.join(this.workspaceDir, rel));
        return { name: n, description: parseFrontmatter(content).description ?? '', enabled, path: rel, content };
      });
  }
}
