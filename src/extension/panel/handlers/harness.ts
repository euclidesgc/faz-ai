import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EMPTY_HARNESS,
  REFERENCE_SKILL,
  aiToolInfo,
  type AiTool,
  type Harness,
  type HarnessItem,
  type HarnessKind,
  type InstallableSkill,
  type InstallScope,
} from '../../../shared/harness';
import { copyTarget } from '../../../shared/harnessCatalog';
import { SKILLS_FIELD } from '../../db/schema';
import { FLOW_SKILL } from '../../flowSkill';
import { skillTemplate, type HarnessStore } from '../../harness';
import { HarnessOps } from '../../harnessOps';
import { HooksAndPermissions } from '../../hooksAndPermissions';
import { McpServers } from '../../mcpServers';
import { findSkills, installSkills } from '../../skillInstall';
import type { BoardContext, HandlerMap } from './context';

/** Regras, skills, agentes, hooks e servidores MCP do projeto e da ferramenta em uso, como a varredura os encontrou. */
export class BoardHarness {
  current: Harness = EMPTY_HARNESS;
  /** origem de skills já baixada, à espera da escolha do que instalar */
  install: { source: string; dir: string; skills: InstallableSkill[]; cleanup: () => void } | null = null;

  constructor(
    private ctx: BoardContext,
    readonly store: HarnessStore | null,
  ) {}

  /**
   * Relê o disco. As opções do campo "Skills" acompanham as skills do projeto (ligadas ou não) e as globais e de
   * plugins da ferramenta em uso. Uma skill desligada pode ser indicada: o card entrega o caminho do SKILL.md.
   */
  load(): void {
    if (!this.store) return;
    this.current = this.store.scan();
    const tool = this.ctx.state().board.aiTool;
    const outside = (this.current.inventory.find((t) => t.tool === tool)?.items ?? [])
      .filter((i) => i.kind === 'skill' && i.scope !== 'project')
      .map((i) => i.name);
    const project = this.current.skills.map((s) => s.name);
    const names = [...project, ...[...new Set(outside)].filter((n) => !project.includes(n)).sort()];
    const field = this.ctx.state().fieldDefs.find((f) => f.name.toLowerCase() === SKILLS_FIELD.toLowerCase() && f.kind === 'multiselect');
    if (field && JSON.stringify(field.options) !== JSON.stringify(names)) this.ctx.settings.updateField(field.id, { options: names });
  }

  /** Relê o disco e diz se algo mudou (chamado quando os arquivos mudam por fora). */
  refresh(): boolean {
    const before = JSON.stringify(this.current);
    this.load();
    return JSON.stringify(this.current) !== before;
  }

  /** Passa a varrer a pasta de skills da ferramenta. */
  setTool(tool: AiTool): void {
    this.store?.setTool(tool);
    this.load();
  }

  get ops(): HarnessOps {
    return new HarnessOps(this.ctx.opts.workspaceDir ?? '', this.ctx.home);
  }

  get hooksAndPermissions(): HooksAndPermissions {
    return new HooksAndPermissions(this.ctx.opts.workspaceDir ?? '', this.ctx.home);
  }

  get mcpServers(): McpServers {
    return new McpServers(this.ctx.opts.workspaceDir ?? '', this.ctx.home);
  }

  /** Item listado pela varredura; as operações só valem para o que está no inventário. */
  item(tool: AiTool, kind: HarnessKind, file: string): HarnessItem {
    const item = this.current.inventory.find((t) => t.tool === tool)?.items.find((i) => i.kind === kind && i.path === file);
    if (!item) throw new Error('Item não encontrado no harness. Atualize a lista e tente de novo.');
    return item;
  }

  /** Entrada de um arquivo de configuração (hook ou regra de permissão) listada pela varredura. */
  entry(tool: AiTool, kind: HarnessKind, file: string, name: string, detail: string): HarnessItem {
    const item = this.current.inventory
      .find((t) => t.tool === tool)
      ?.items.find((i) => i.kind === kind && i.layout === 'entry' && i.path === file && i.name === name && (i.detail ?? '') === detail);
    if (!item) throw new Error('Item não encontrado no harness. Atualize a lista e tente de novo.');
    return item;
  }

  /** Guarda a origem de skills já disponível numa pasta, para a pessoa escolher o que instalar. */
  setInstall(source: string, dir: string, cleanup: () => void): void {
    this.clearInstall();
    this.install = { source, dir, cleanup, skills: findSkills(dir) };
  }

  clearInstall(): void {
    this.install?.cleanup();
    this.install = null;
  }

  /** Cria um arquivo de apoio numa skill e devolve o caminho dele. */
  createSkillFile(tool: AiTool, skillMd: string, rel: string, link: boolean): string {
    const file = this.ops.addSkillFile(this.item(tool, 'skill', skillMd), rel, '', link);
    this.load();
    return file;
  }

  /** Grava um arquivo de apoio numa skill do projeto (usado pela IA). */
  writeSkillFile(name: string, rel: string, content: string): string {
    const tool = this.ctx.state().board.aiTool;
    const item = this.current.inventory
      .find((t) => t.tool === tool)
      ?.items.find((i) => i.kind === 'skill' && i.scope === 'project' && i.name === name);
    if (!item) throw new Error(`Skill "${name}" não encontrada no projeto.`);
    const file = this.ops.writeSkillFile(item, rel, content);
    this.load();
    return file;
  }

  /** Caminho de um arquivo de apoio que a varredura listou. */
  skillFilePath(tool: AiTool, skillMd: string, rel: string): string {
    const item = this.item(tool, 'skill', skillMd);
    if (!item.files?.includes(rel)) throw new Error('Arquivo fora do harness.');
    return path.join(path.dirname(skillMd), ...rel.split('/'));
  }

  /** Cria um item do harness e devolve o caminho do arquivo. */
  createItem(tool: AiTool, source: number, name: string, description: string): string {
    const file = this.ops.create(tool, source, name, description);
    this.load();
    return file;
  }

  /** Operação nas regras e skills do projeto (exige uma pasta aberta); relê o disco depois. */
  op(fn: (store: HarnessStore) => void): boolean {
    if (!this.store) throw new Error('Nenhuma pasta de projeto aberta.');
    fn(this.store);
    this.load();
    return true;
  }

  /** Aplica a mudança no disco e relê. */
  change(fn: () => void): boolean {
    fn();
    this.load();
    return true;
  }

  /** Aplica a mudança item a item e relê mesmo que uma falhe no meio: as anteriores já estão no disco. */
  changeEach<T>(items: T[], fn: (item: T) => void): boolean {
    try {
      items.forEach(fn);
    } finally {
      this.load();
    }
    return true;
  }
}

/** O SKILL.md da skill do fluxo na pasta de skills da ferramenta, no projeto ou na pasta do usuário. */
export function flowSkillFile(ctx: BoardContext, tool: AiTool, scope: InstallScope): string {
  const target = copyTarget(tool, 'skill', 'skills', scope);
  const base = scope === 'project' ? ctx.opts.workspaceDir : ctx.home;
  if (!target || !base) throw new Error('Esta ferramenta não tem uma pasta de skills nesse escopo.');
  return path.join(base, target.path, FLOW_SKILL.name, 'SKILL.md');
}

/** Harness: regras, skills, agentes, hooks, permissões, servidores MCP e instalação de skills. */
export const harnessHandlers = {
  'harness.refresh': (_msg, ctx) => ctx.harness.refresh(),
  'harness.install.apply': (msg, ctx) => {
    const h = ctx.harness;
    if (!h.install) throw new Error('Nenhuma origem de skills carregada. Procure de novo.');
    const target = copyTarget(msg.tool, 'skill', 'skills', msg.to);
    const base = msg.to === 'project' ? ctx.opts.workspaceDir : ctx.home;
    if (!target || !base) throw new Error('Esta ferramenta não tem uma pasta de skills nesse escopo.');
    installSkills(h.install.dir, msg.rels, path.join(base, target.path));
    h.clearInstall();
    h.load();
    return true;
  },
  'harness.install.cancel': (_msg, ctx) => {
    ctx.harness.clearInstall();
    return true;
  },
  'harness.skill.file.delete': (msg, { harness: h }) =>
    h.change(() => h.ops.removeSkillFile(h.item(msg.tool, 'skill', msg.path), msg.file)),
  'harness.referenceSkill.create': (_msg, ctx) =>
    ctx.harness.op((h) => {
      h.createSkill(REFERENCE_SKILL.name, REFERENCE_SKILL.description, REFERENCE_SKILL.body);
      h.setSkillMode(REFERENCE_SKILL.name, 'manual');
      fs.mkdirSync(path.join(h.workspaceDir, aiToolInfo(ctx.state().board.aiTool).skills, REFERENCE_SKILL.name, 'references'), {
        recursive: true,
      });
    }),
  'harness.hook.add': (msg, { harness: h }) => h.change(() => h.hooksAndPermissions.addHook(msg.tool, msg.source, msg.hook)),
  'harness.hook.remove': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.removeHook(msg.tool, h.entry(msg.tool, 'hook', msg.path, msg.event, msg.command))),
  'harness.permission.add': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.addPermission(msg.tool, msg.source, msg.list, msg.rule)),
  'harness.permission.remove': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.removePermission(msg.tool, h.entry(msg.tool, 'settings', msg.path, msg.rule, msg.list))),
  'harness.mcp.add': (msg, { harness: h }) => h.change(() => h.mcpServers.add(msg.tool, msg.source, msg.server)),
  'harness.mcp.remove': (msg, { harness: h }) => {
    const item = h.current.inventory
      .find((t) => t.tool === msg.tool)
      ?.items.find((i) => i.kind === 'mcp' && i.path === msg.path && i.name === msg.name);
    if (!item) throw new Error('Servidor não encontrado no harness. Atualize a lista e tente de novo.');
    return h.change(() => h.mcpServers.remove(msg.tool, item));
  },
  'harness.item.delete': (msg, { harness: h }) => h.change(() => h.ops.remove(h.item(msg.tool, msg.kind, msg.path))),
  'harness.item.copy': (msg, { harness: h }) => {
    const items = msg.items.map((i) => h.item(msg.tool, i.kind, i.path));
    return h.changeEach(items, (item) => h.ops.copy(msg.tool, item, msg.to));
  },
  'harness.rule.write': (msg, ctx) => ctx.harness.op((h) => h.writeRule(msg.name, msg.content)),
  'harness.rule.delete': (msg, ctx) => ctx.harness.op((h) => h.deleteRule(msg.name)),
  'harness.skill.create': (msg, ctx) => ctx.harness.op((h) => h.createSkill(msg.name, msg.description, msg.content)),
  'harness.skill.write': (msg, ctx) => ctx.harness.op((h) => h.writeSkill(msg.name, msg.content)),
  'harness.skill.setEnabled': (msg, ctx) => ctx.harness.op((h) => h.setSkillEnabled(msg.name, msg.enabled)),
  'harness.skill.delete': (msg, ctx) => ctx.harness.op((h) => h.deleteSkill(msg.name)),
  'harness.skill.setMode': (msg, { harness: h }) => {
    const items = msg.paths.map((p) => h.item(msg.tool, 'skill', p));
    return h.changeEach(items, (item) => h.ops.setSkillMode(item, msg.mode));
  },
  'harness.agent.create': (msg, ctx) => ctx.harness.op((h) => h.createAgent(msg.name, msg.description, msg.content, msg.model)),
  'harness.agent.write': (msg, ctx) => ctx.harness.op((h) => h.writeAgent(msg.name, msg.content)),
  'harness.agent.delete': (msg, ctx) => ctx.harness.op((h) => h.deleteAgent(msg.name)),
  // sem `replace`, não sobrescreve: se a pessoa já ajustou a skill, a versão dela fica
  'harness.flowSkill.install': (msg, ctx) => {
    const file = flowSkillFile(ctx, msg.tool ?? ctx.state().board.aiTool, msg.scope ?? 'user');
    if (fs.existsSync(file) && !msg.replace) return false;
    return ctx.harness.change(() => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, skillTemplate(FLOW_SKILL.name, FLOW_SKILL.description, FLOW_SKILL.body));
    });
  },
} satisfies Partial<HandlerMap>;
