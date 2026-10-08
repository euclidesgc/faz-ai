import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_AI_TOOLS,
  RULE_FILES,
  SKILL_NAME_PATTERN,
  aiToolInfo,
  type Agent,
  type AgentSpec,
  type AiTool,
  type Harness,
  type InstallScope,
  type RuleFile,
  type Skill,
  type SkillMode,
  type ToolInventory,
} from '../shared/harness';
import type { AgentInput } from '../shared/messages';
import { copyTarget } from '../shared/harnessCatalog';
import { agentInputOf, parseAgentFile, renderAgentFile } from './agentFiles';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { scanInventory } from './harnessScan';
import { detectTools } from './models';
import { setSkillMode, skillMode } from './skillMode';

const MAX_BYTES = 512 * 1024;

/** Lê `name`, `description` e `model` do frontmatter YAML de um SKILL.md ou arquivo de agente. */
export function parseFrontmatter(content: string): { name?: string; description?: string; model?: string } {
  const fm = frontmatterOf(content);
  return { name: frontmatterValue(fm, 'name'), description: frontmatterValue(fm, 'description'), model: frontmatterValue(fm, 'model') };
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
    const lines = [
      `name = ${JSON.stringify(name)}`,
      `description = ${JSON.stringify(oneLine)}`,
      ...(withModel ? [`${spec.modelField} = ${JSON.stringify(withModel)}`] : []),
    ];
    return `${lines.join('\n')}\ndeveloper_instructions = """\n${body.trim().replace(/"""/g, "'''")}\n"""\n`;
  }
  const lines = [`name: ${name}`, `description: ${oneLine}`, ...(withModel ? [`${spec.modelField}: ${withModel}`] : [])];
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

/**
 * Arquivos de regras e skills de uma pasta de projeto, vistos pela ferramenta de IA em uso: as skills
 * são as da pasta que essa ferramenta lê. Pastas de outras ferramentas podem existir, mas ficam de fora.
 * Não depende da API do VSCode.
 */
export class HarnessStore {
  constructor(
    readonly workspaceDir: string,
    private tool: AiTool,
    private homeDir = '',
  ) {}

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
    const skills = [...this.skillsIn(this.dirs.enabled, true), ...this.skillsIn(this.dirs.disabled, false)].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return { rules, skills, agents: this.agents(), inventory: this.inventory() };
  }

  /** O que cada ferramenta carrega, no projeto, na pasta do usuário e em plugins. */
  private inventory(): ToolInventory[] {
    const installed = detectTools(this.homeDir);
    return ALL_AI_TOOLS.map((tool) => ({
      tool,
      installed: installed.includes(tool),
      items: scanInventory(tool, this.workspaceDir, this.homeDir),
    }));
  }

  /** Onde a ferramenta em uso guarda os agentes; lança erro se ela não tem agentes em arquivo. */
  private get agentSpec(): AgentSpec {
    const info = aiToolInfo(this.tool);
    if (!info.agents) throw new Error(`O ${info.label} não tem agentes definidos em arquivos.`);
    return info.agents;
  }

  /** Pasta de agentes de um escopo (base absoluta e caminho relativo), ou null quando a ferramenta ou a máquina não a tem. */
  private agentDir(scope: InstallScope): { base: string; rel: string } | null {
    const spec = aiToolInfo(this.tool).agents;
    if (!spec) return null;
    if (scope === 'project') return { base: this.workspaceDir, rel: spec.dir };
    const target = copyTarget(this.tool, 'agent', 'files', 'user');
    return this.homeDir && target ? { base: this.homeDir, rel: target.path } : null;
  }

  /** Os agentes da ferramenta em uso, do projeto e da pasta do usuário, lidos do disco. */
  agents(): Agent[] {
    const spec = aiToolInfo(this.tool).agents;
    if (!spec) return [];
    const scopes: InstallScope[] = ['project', 'user'];
    return scopes
      .flatMap((scope) => {
        const dir = this.agentDir(scope);
        const base = dir && path.join(dir.base, dir.rel);
        if (!dir || !base || !fs.existsSync(base)) return [];
        return fs
          .readdirSync(base)
          .filter(
            (f) =>
              f.endsWith(spec.ext) && SKILL_NAME_PATTERN.test(f.slice(0, -spec.ext.length)) && fs.statSync(path.join(base, f)).isFile(),
          )
          .map((f) => {
            const file = path.join(base, f);
            const rel = `${dir.rel}/${f}`;
            return parseAgentFile(
              spec,
              { name: f.slice(0, -spec.ext.length), scope, path: file, location: scope === 'project' ? rel : `~/${rel}` },
              this.read(file),
            );
          });
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
  }

  private agentFile(name: string, scope: InstallScope): string {
    if (!SKILL_NAME_PATTERN.test(name))
      throw new Error('Nome de agente inválido: use letras minúsculas, números e hífens (ex.: "revisor-de-spec").');
    const dir = this.agentDir(scope);
    if (!dir)
      throw new Error(
        scope === 'user' ? 'Sem pasta de usuário para guardar o agente.' : `O ${aiToolInfo(this.tool).label} não tem agentes em arquivos.`,
      );
    return path.join(dir.base, dir.rel, `${name}${this.agentSpec.ext}`);
  }

  private existingAgent(name: string, scope: InstallScope): string {
    const file = this.agentFile(name, scope);
    if (!fs.existsSync(file))
      throw new Error(`Agente "${name}" não encontrado${scope === 'user' ? ' na pasta do usuário' : ' no projeto'}.`);
    return file;
  }

  /** Cria o arquivo do agente; `seed` marca o de fábrica. Devolve o caminho. */
  createAgent(input: AgentInput, scope: InstallScope = 'user', seed = false): string {
    const file = this.agentFile(input.name, scope);
    if (fs.existsSync(file))
      throw new Error(`Já existe um agente "${input.name}"${scope === 'user' ? ' na pasta do usuário' : ' no projeto'}.`);
    if (!input.description.trim()) throw new Error('O agente precisa de uma descrição: é por ela que a IA decide quando delegar a ele.');
    if (input.model.trim() && !this.agentSpec.modelField)
      throw new Error(`O ${aiToolInfo(this.tool).label} não permite fixar o modelo de um agente.`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderAgentFile(this.agentSpec, input, seed));
    return file;
  }

  /** Regrava o frontmatter com o que vier em `patch` e, se vier, o corpo; o resto fica como está. */
  updateAgent(name: string, scope: InstallScope, patch: Partial<AgentInput>, body?: string): void {
    const file = this.existingAgent(name, scope);
    const current = this.agents().find((a) => a.name === name && a.scope === scope);
    if (!current) throw new Error(`Agente "${name}" não encontrado.`);
    const input: AgentInput = { ...agentInputOf(current), ...patch, name, ...(body !== undefined ? { body } : {}) };
    if (!input.description.trim()) throw new Error('O agente precisa de uma descrição.');
    fs.writeFileSync(file, renderAgentFile(this.agentSpec, input, current.seed));
  }

  /** Substitui o arquivo inteiro do agente (com o frontmatter). */
  writeAgent(name: string, scope: InstallScope, content: string): void {
    fs.writeFileSync(this.existingAgent(name, scope), content);
  }

  deleteAgent(name: string, scope: InstallScope): void {
    fs.rmSync(this.existingAgent(name, scope), { force: true });
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

  /** Invocação automática ou só quando indicada, gravado no formato da ferramenta em uso. */
  setSkillMode(name: string, mode: SkillMode): void {
    setSkillMode(this.tool, path.join(this.dirOf(name).dir, 'SKILL.md'), mode);
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
    if (!SKILL_NAME_PATTERN.test(name))
      throw new Error('Nome de skill inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").');
  }

  private rulePath(name: string): string {
    if (!RULE_FILES.some((r) => r.name === name))
      throw new Error(`Arquivo de regras desconhecido: "${name}". Aceitos: ${RULE_FILES.map((r) => r.name).join(', ')}.`);
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
        return {
          name: n,
          description: parseFrontmatter(content).description ?? '',
          enabled,
          mode: skillMode(path.join(this.workspaceDir, rel)),
          path: rel,
          content,
        };
      });
  }
}
