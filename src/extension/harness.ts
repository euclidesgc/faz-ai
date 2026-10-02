import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_AI_TOOLS, RULE_FILES, SKILL_NAME_PATTERN, aiToolInfo, type Agent, type AgentSpec, type AiTool, type Harness, type RuleFile, type Skill, type ToolInventory } from '../shared/harness';
import { scanInventory } from './harnessScan';
import { detectTools } from './models';

const MAX_BYTES = 512 * 1024;

/** Lê `name` e `description` do frontmatter YAML de um SKILL.md (só valores de uma linha). */
export function parseFrontmatter(content: string): { name?: string; description?: string; model?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return {};
  const get = (key: string) => {
    const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(m[1]!);
    return line ? line[1]!.trim().replace(/^["']|["']$/g, '') : undefined;
  };
  return { name: get('name'), description: get('description'), model: get('model') };
}

export function skillTemplate(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description.replace(/\r?\n/g, ' ').trim()}\n---\n\n${body.trim()}\n`;
}

/** Arquivo de um agente no formato da ferramenta: markdown com frontmatter, ou TOML no Codex. */
export function agentTemplate(spec: AgentSpec, name: string, description: string, body: string, model = ''): string {
  const oneLine = description.replace(/\r?\n/g, ' ').trim();
  const withModel = spec.modelField && model.trim() ? model.trim() : '';
  if (spec.format === 'toml') {
    // strings JSON são strings básicas válidas em TOML
    const lines = [`name = ${JSON.stringify(name)}`, `description = ${JSON.stringify(oneLine)}`, ...(withModel ? [`${spec.modelField} = ${JSON.stringify(withModel)}`] : [])];
    return `${lines.join('\n')}\ndeveloper_instructions = """\n${body.trim().replace(/"""/g, '\'\'\'')}\n"""\n`;
  }
  const lines = [`name: ${name}`, `description: ${oneLine}`, ...(withModel ? [`${spec.modelField}: ${withModel}`] : [])];
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

/** `description` e modelo de um arquivo de agente, em qualquer dos dois formatos. */
function agentMeta(spec: AgentSpec, content: string): { description: string; model: string } {
  if (spec.format === 'markdown') {
    const meta = parseFrontmatter(content);
    return { description: meta.description ?? '', model: (spec.modelField && meta.model) || '' };
  }
  const get = (key: string) => new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(content)?.[1]?.replace(/\\(.)/g, '$1') ?? '';
  return { description: get('description'), model: spec.modelField ? get(spec.modelField) : '' };
}

/**
 * Arquivos de regras e skills de uma pasta de projeto, vistos pela ferramenta de IA em uso: as skills
 * são as da pasta que essa ferramenta lê. Pastas de outras ferramentas podem existir, mas ficam de fora.
 * Não depende da API do VSCode.
 */
export class HarnessStore {
  constructor(readonly workspaceDir: string, private tool: AiTool, private homeDir = '') {}

  setTool(tool: AiTool): void {
    this.tool = tool;
  }

  /** Pasta de skills da ferramenta em uso, e a pasta ao lado onde ficam as desligadas. */
  private get dirs() {
    const enabled = aiToolInfo(this.tool).skills;
    return { enabled, disabled: `${enabled}-disabled` };
  }

  scan(): Harness {
    const rules: RuleFile[] = RULE_FILES.map(({ name }) => {
      const file = path.join(this.workspaceDir, name);
      const exists = fs.existsSync(file) && fs.statSync(file).isFile();
      return { name, exists, content: exists ? this.read(file) : '' };
    });
    const skills = [...this.skillsIn(this.dirs.enabled, true), ...this.skillsIn(this.dirs.disabled, false)].sort((a, b) => a.name.localeCompare(b.name));
    return { rules, skills, agents: this.agents(), inventory: this.inventory() };
  }

  /** O que cada ferramenta carrega, no projeto, na pasta do usuário e em plugins. */
  private inventory(): ToolInventory[] {
    const installed = detectTools(this.homeDir);
    return ALL_AI_TOOLS.map((tool) => ({ tool, installed: installed.includes(tool), items: scanInventory(tool, this.workspaceDir, this.homeDir) }));
  }

  /** Onde a ferramenta em uso guarda os agentes do projeto; lança erro se ela não tem agentes em arquivo. */
  private get agentSpec() {
    const info = aiToolInfo(this.tool);
    if (!info.agents) throw new Error(`O ${info.label} não tem agentes definidos em arquivos do projeto.`);
    return info.agents;
  }

  private agents(): Agent[] {
    const spec = aiToolInfo(this.tool).agents;
    const base = spec && path.join(this.workspaceDir, spec.dir);
    if (!spec || !base || !fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((f) => f.endsWith(spec.ext) && SKILL_NAME_PATTERN.test(f.slice(0, -spec.ext.length)) && fs.statSync(path.join(base, f)).isFile())
      .map((f) => {
        const rel = `${spec.dir}/${f}`;
        const content = this.read(path.join(this.workspaceDir, rel));
        return { name: f.slice(0, -spec.ext.length), ...agentMeta(spec, content), path: rel, content };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private agentFile(name: string): string {
    if (!SKILL_NAME_PATTERN.test(name)) throw new Error('Nome de agente inválido: use letras minúsculas, números e hífens (ex.: "revisor-de-spec").');
    return path.join(this.workspaceDir, this.agentSpec.dir, `${name}${this.agentSpec.ext}`);
  }

  private existingAgent(name: string): string {
    const file = this.agentFile(name);
    if (!fs.existsSync(file)) throw new Error(`Agente "${name}" não encontrado.`);
    return file;
  }

  createAgent(name: string, description: string, body: string, model = ''): void {
    const file = this.agentFile(name);
    if (fs.existsSync(file)) throw new Error(`Já existe um agente "${name}".`);
    if (!description.trim()) throw new Error('O agente precisa de uma descrição: é por ela que a IA decide quando delegar a ele.');
    if (model.trim() && !this.agentSpec.modelField) throw new Error(`O ${aiToolInfo(this.tool).label} não permite fixar o modelo de um agente.`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, agentTemplate(this.agentSpec, name, description, body, model));
  }

  /** Substitui o arquivo inteiro do agente (com o frontmatter). */
  writeAgent(name: string, content: string): void {
    fs.writeFileSync(this.existingAgent(name), content);
  }

  deleteAgent(name: string): void {
    fs.rmSync(this.existingAgent(name), { force: true });
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
    const dir = path.join(this.workspaceDir, this.dirs.enabled, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillTemplate(name, description, body));
  }

  /** Substitui o SKILL.md inteiro (com o frontmatter). */
  writeSkill(name: string, content: string): void {
    fs.writeFileSync(path.join(this.dirOf(name).dir, 'SKILL.md'), content);
  }

  setSkillEnabled(name: string, enabled: boolean): void {
    const found = this.dirOf(name);
    if (found.enabled === enabled) return;
    const to = path.join(this.workspaceDir, enabled ? this.dirs.enabled : this.dirs.disabled, name);
    if (fs.existsSync(to)) throw new Error(`Já existe uma skill "${name}" ${enabled ? 'ligada' : 'desligada'}.`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(found.dir, to);
  }

  deleteSkill(name: string): void {
    fs.rmSync(this.dirOf(name).dir, { recursive: true, force: true });
  }

  private find(name: string): { dir: string; enabled: boolean } | undefined {
    for (const enabled of [true, false]) {
      const dir = path.join(this.workspaceDir, enabled ? this.dirs.enabled : this.dirs.disabled, name);
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) return { dir, enabled };
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

  private skillsIn(relDir: string, enabled: boolean): Skill[] {
    const base = path.join(this.workspaceDir, relDir);
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base)
      .filter((n) => SKILL_NAME_PATTERN.test(n) && fs.existsSync(path.join(base, n, 'SKILL.md')))
      .map((n) => {
        const rel = `${relDir}/${n}/SKILL.md`;
        const content = this.read(path.join(this.workspaceDir, rel));
        return { name: n, description: parseFrontmatter(content).description ?? '', enabled, path: rel, content };
      });
  }
}
