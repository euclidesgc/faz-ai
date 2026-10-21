import { isAiBase, EMPTY_HARNESS } from '../shared/harness';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_AI_BASES,
  RULE_FILES,
  SKILL_NAME_PATTERN,
  baseInfo,
  type Agent,
  type AgentSpec,
  type AiTool,
  type Harness,
  type InstallScope,
  type PluginInstall,
  type RuleFile,
  type Skill,
  type ToolInventory,
} from '../shared/harness';
import type { AgentInput } from '../shared/messages';
import { copyTarget } from '../shared/harnessCatalog';
import { agentInputOf, lacksBoardTools, parseAgentFile, renderAgentFile } from './agentFiles';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { scanInventory } from './harnessScan';
import { detectTools } from './models';
import { skillMode } from './skillMode';

const MAX_BYTES = 512 * 1024;

/** Lê `name`, `description` e `model` do frontmatter YAML de um SKILL.md ou arquivo de agente. */
export function parseFrontmatter(content: string): { name?: string; description?: string; model?: string } {
  const fm = frontmatterOf(content);
  return { name: frontmatterValue(fm, 'name'), description: frontmatterValue(fm, 'description'), model: frontmatterValue(fm, 'model') };
}

/**
 * Conteúdo de um SKILL.md. A descrição vai como string JSON porque, sem aspas, um `: ` no meio dela
 * derruba o parser YAML do Cursor ("Error parsing skill"); uma string JSON é YAML válido.
 */
export function skillTemplate(name: string, description: string, body: string): string {
  const oneLine = description.replace(/\r?\n/g, ' ').trim();
  return `---\nname: ${name}\ndescription: ${JSON.stringify(oneLine)}\n---\n\n${body.trim()}\n`;
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

  /**
   * Os plugins que o Claude Code diz ter instalados (`claude plugin list --json`). Enquanto a CLI não
   * respondeu, ou quando ela não existe, fica null e a varredura procura nas pastas de plugin.
   */
  claudePlugins: PluginInstall[] | null = null;

  setTool(tool: AiTool): void {
    this.tool = tool;
  }

  /** Pasta de skills da ferramenta em uso, e a pasta ao lado onde ficam as desligadas. */
  private get dirs() {
    const enabled = baseInfo(this.tool).skills;
    if (!enabled) throw new Error('Este perfil não tem pasta nativa de skills.');
    return { enabled, disabled: `${enabled}-disabled` };
  }

  scan(): Harness {
    if (!isAiBase(this.tool)) return structuredClone(EMPTY_HARNESS);
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
    return ALL_AI_BASES.map((tool) => ({
      tool,
      installed: installed.includes(tool),
      items: scanInventory(tool, this.workspaceDir, this.homeDir, undefined, tool === 'claude' ? this.claudePlugins : null),
    }));
  }

  /** Onde a ferramenta em uso guarda os agentes; lança erro se ela não tem agentes em arquivo. */
  private get agentSpec(): AgentSpec {
    const info = baseInfo(this.tool);
    if (!info.agents.dir) throw new Error(`O ${info.label} não tem agentes definidos em arquivos.`);
    return info.agents;
  }

  /** Pasta de agentes de um escopo (base absoluta e caminho relativo), ou null quando a ferramenta ou a máquina não a tem. */
  private agentDir(scope: InstallScope): { base: string; rel: string } | null {
    const spec = baseInfo(this.tool).agents;
    if (!spec.dir) return null;
    if (scope === 'project') return { base: this.workspaceDir, rel: spec.dir };
    const target = copyTarget(this.tool, 'agent', 'files', 'user');
    return this.homeDir && target ? { base: this.homeDir, rel: target.path } : null;
  }

  /** Os agentes da ferramenta em uso, do projeto e da pasta do usuário, lidos do disco. */
  agents(): Agent[] {
    const spec = baseInfo(this.tool).agents;
    if (!spec.dir) return [];
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
        scope === 'user' ? 'Sem pasta de usuário para guardar o agente.' : `O ${baseInfo(this.tool).label} não tem agentes em arquivos.`,
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

  /**
   * Regrava os agentes do board (os que têm chave `faz-ai-*`: criados ou editados por ele) cuja lista de
   * ferramentas ainda não leva as do servidor do board. Arquivos que a pessoa escreveu à mão ficam como
   * estão. Devolve os nomes regravados.
   */
  repairAgentTools(): string[] {
    const fixed: string[] = [];
    for (const a of this.agents()) {
      if (!/^faz-ai-/m.test(a.content) || !lacksBoardTools(this.agentSpec, a)) continue;
      try {
        this.updateAgent(a.name, a.scope, {});
        fixed.push(a.name);
      } catch {
        /* sem permissão ou sem pasta: fica para a próxima */
      }
    }
    return fixed;
  }

  /** Substitui o arquivo inteiro do agente (com o frontmatter). */
  writeAgent(name: string, scope: InstallScope, content: string): void {
    fs.writeFileSync(this.existingAgent(name, scope), content);
  }

  deleteAgent(name: string, scope: InstallScope): void {
    fs.rmSync(this.existingAgent(name, scope), { force: true });
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
