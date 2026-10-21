import { toolInfo, activeProfile } from '../../../shared/aiProfiles';
import { catalogTool } from '../../../shared/aiProfiles';
import { ContextPlanningRepo } from '../../repositories/contextPlanningRepo';
import { artifactLocation } from '../../../shared/artifacts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_AI_BASES,
  EMPTY_HARNESS,
  REFERENCE_SKILL,
  type AiTool,
  type Harness,
  type HarnessItem,
  type HarnessKind,
  type InstallableSkill,
  type PluginAction,
  pluginActions,
} from '../../../shared/harness';
import { copyTarget } from '../../../shared/harnessCatalog';
import { MCPS_FIELD, RULES_FIELD, SKILLS_FIELD } from '../../../shared/boardFields';
import {
  isSelectableKind,
  selectedMcpNames,
  selectedRuleLocations,
  selectedSkillNames,
  selectionKey,
} from '../../../shared/harnessSelection';
import { migrateExecProfiles, seedAgents } from '../../agentSeeds';
import { FLOW_SKILL, installFlowSkillFiles } from '../../flowSkill';
import { type HarnessStore } from '../../harness';
import { HarnessOps } from '../../harnessOps';
import { HooksAndPermissions } from '../../hooksAndPermissions';
import { McpServers } from '../../mcpServers';
import { applyClaudePlugin, parseClaudePlugins, pluginSignature, removeCursorPlugin, type ClaudeCli } from '../../plugins';
import { findSkills, installSkills } from '../../skillInstall';
import type { BoardContext, HandlerMap } from './context';

/** Teto do arquivo que o editor do board abre: regras, skills e configurações passam longe disso. */
const MAX_EDIT_BYTES = 512 * 1024;

/** O aviso depois de mudar plugins do Claude Code: a sessão aberta só vê a mudança depois de recarregar. */
const PLUGIN_DONE: Record<PluginAction, string> = {
  uninstall:
    'Plugins desinstalados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.',
  disable: 'Plugins desativados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.',
  enable: 'Plugins ativados: {names}. Vale a partir da próxima sessão do Claude Code, ou depois de /reload-plugins numa sessão aberta.',
};
/** O aviso do resultado da importação de artefatos: o que entrou, o que foi pulado, os problemas e os servidores MCP a configurar. */
const IMPORT_DONE = 'Importados: {imported}. Pulados: {skipped}. Problemas: {problems}. Servidores MCP a configurar: {secrets}.';
const fill = (text: string, params: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, n: string) => String(params[n] ?? m));

/** Regras, skills, agentes, hooks e servidores MCP do projeto e da ferramenta em uso, como a varredura os encontrou. */
export class BoardHarness {
  current: Harness = EMPTY_HARNESS;
  /** origem de skills já baixada, à espera da escolha do que instalar */
  /** o aviso do último `harness.import.apply`, à espera da ponte */
  importNotice: string | null = null;
  install: { source: string; dir: string; skills: InstallableSkill[]; cleanup: () => void } | null = null;
  /** a CLI do Claude Code, para a lista de plugins instalados e as ações sobre eles; quem abre o board a fornece */
  private claudeCli: ClaudeCli | null = null;
  /** como estavam os arquivos que mudam a lista de plugins na última vez que a CLI foi consultada */
  private pluginSig = '';
  /** avisa a tela quando a lista de plugins muda sem uma mensagem dela (a consulta à CLI é assíncrona) */
  private pluginsChanged: (() => void) | null = null;

  constructor(
    private ctx: BoardContext,
    readonly store: HarnessStore | null,
  ) {}

  /**
   * Relê o disco. As opções dos campos "Skills" e "Rules" acompanham a marcação do Harness: só o que está
   * está no board em "Pelo card" pode ser indicado num card (o "Sempre" já vai em toda execução).
   */
  load(): void {
    if (!this.store) return;
    let state = this.ctx.state();
    // as pastas importadas são do board: a varredura as recebe a cada leitura, para a aba refletir o que está lá
    this.store.imports = Object.fromEntries(
      ALL_AI_BASES.map((tool) => [tool, state.harnessImports.filter((x) => x.tool === tool).map((x) => x.dir)]),
    );
    this.current = this.store.scan();
    this.ctx.library.migrate(this.current.inventory);
    this.current.library = {
      directory: this.ctx.library.directory,
      preview: this.ctx.library.preview,
      importResult: this.ctx.library.importResult,
      artifacts: this.ctx.library.materialize(),
      warnings: this.ctx.library.warnings,
    };
    state = this.ctx.state();
    const view = { board: state.board, harness: this.current, harnessSelection: state.harnessSelection };
    const sync = (name: string, options: string[]) => {
      const field = state.fieldDefs.find((f) => f.name.toLowerCase() === name.toLowerCase() && f.kind === 'multiselect');
      if (field && JSON.stringify(field.options) !== JSON.stringify(options)) this.ctx.settings.updateField(field.id, { options });
    };
    sync(SKILLS_FIELD, selectedSkillNames(view, 'contextual'));
    sync(RULES_FIELD, selectedRuleLocations(view, 'contextual'));
    sync(MCPS_FIELD, selectedMcpNames(view, 'contextual'));
  }

  /** Importa uma pasta para a ferramenta: precisa existir, e vale o caminho absoluto. */
  addImport(tool: AiTool, dir: string): void {
    const abs = path.resolve(dir.trim());
    if (!dir.trim() || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`Pasta não encontrada: ${dir}`);
    this.ctx.boards.addImport(this.ctx.boardId, tool, abs);
    this.load();
  }

  removeImport(tool: AiTool, dir: string): void {
    this.ctx.boards.removeImport(this.ctx.boardId, tool, dir);
    this.load();
  }

  /**
   * Na abertura do board: os agentes que o banco guardava em versões antigas viram arquivos (e a cópia do
   * board), os de fábrica são criados uma vez no próprio board, e a varredura é refeita com eles. Sem
   * pasta de projeto nada acontece.
   */
  bootstrap(): void {
    if (!this.store) return;
    migrateExecProfiles(this.ctx, this.store);
    // agentes gravados antes de a lista de ferramentas levar o servidor do board: regravados uma vez
    this.store.repairAgentTools();
    this.load();
    if (this.ctx.opts.seedAgents && seedAgents(this.ctx).length) this.load();
  }

  /** Relê o disco e diz se algo mudou (chamado quando os arquivos mudam por fora). */
  refresh(): boolean {
    const before = JSON.stringify(this.current);
    this.load();
    // os plugins do Claude Code vêm da CLI: consultada de novo só quando os arquivos dela mudaram
    this.refreshPluginsInBackground();
    return JSON.stringify(this.current) !== before;
  }

  /**
   * A consulta dos plugins sem ninguém esperando por ela. O board pode fechar enquanto a CLI responde
   * (o editor fechou, a pasta trocou): aí reler o harness falha no banco já fechado, e não há o que
   * fazer além de deixar para a próxima abertura, que consulta de novo.
   */
  private refreshPluginsInBackground(force = false): void {
    this.refreshPlugins(force).catch(() => undefined);
  }

  /** Liga a CLI do Claude Code e já busca a lista de plugins instalados. */
  setClaudeCli(cli: ClaudeCli | null, onChanged: () => void): void {
    this.claudeCli = cli;
    this.pluginsChanged = onChanged;
    this.refreshPluginsInBackground(true);
  }

  /**
   * Busca em `claude plugin list --json` os plugins que o Claude Code carrega nesta pasta, quando o
   * registro de instalados, os sincronizados ou os `enabledPlugins` mudaram (ou com `force`). Sem a
   * CLI, ou com uma saída que não é a lista, a varredura volta a procurar nas pastas de plugin.
   */
  async refreshPlugins(force = false): Promise<boolean> {
    const store = this.store;
    if (!store || !this.claudeCli) return false;
    const sig = pluginSignature(this.ctx.home, store.workspaceDir);
    if (!force && sig === this.pluginSig) return false;
    this.pluginSig = sig;
    const run = await this.claudeCli(['plugin', 'list', '--json']);
    const list = run.code === 0 ? parseClaudePlugins(run.stdout, store.workspaceDir) : null;
    if (JSON.stringify(list) === JSON.stringify(store.claudePlugins)) return false;
    store.claudePlugins = list;
    const before = JSON.stringify(this.current);
    this.load();
    const changed = JSON.stringify(this.current) !== before;
    if (changed) this.pluginsChanged?.();
    return changed;
  }

  /**
   * Desinstala, desativa ou ativa plugins pela própria ferramenta, um por vez, e devolve o aviso para a
   * pessoa. No Claude Code é a CLI (`claude plugin …`); no Cursor, que não tem comando, desinstalar tira
   * a pasta do plugin local. Só valem os plugins que a varredura listou, com a ação que cabe a cada um.
   */
  async applyPlugins(tool: AiTool, action: PluginAction, ids: string[]): Promise<string> {
    const plugins = (this.current.inventory.find((t) => t.tool === tool)?.items ?? []).filter(
      (i) => i.kind === 'plugin' && i.install && ids.includes(i.install.id) && pluginActions(tool, i.install).includes(action),
    );
    if (!plugins.length) throw new Error('Nenhum dos plugins escolhidos aceita essa ação.');
    const failed: string[] = [];
    for (const p of plugins) {
      try {
        if (tool === 'cursor') removeCursorPlugin(this.ctx.home, p.install!);
        else {
          if (!this.claudeCli) throw new Error('a CLI do Claude Code não foi encontrada');
          const error = await applyClaudePlugin(this.claudeCli, action, p.install!);
          if (error) throw new Error(error);
        }
      } catch (e) {
        failed.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (tool === 'claude') await this.refreshPlugins(true);
    else this.load();
    const done = plugins.filter((p) => !failed.some((f) => f.startsWith(`${p.name}: `))).map((p) => p.name);
    if (failed.length)
      return done.length
        ? fill('Feito em {done} de {total}. Falhou: {failures}', { done: done.length, total: plugins.length, failures: failed.join('; ') })
        : fill('Nada mudou. Falhou: {failures}', { failures: failed.join('; ') });
    return tool === 'cursor'
      ? fill('Plugins removidos de ~/.cursor/plugins/local: {names}. Recarregue a janela do Cursor para valer.', { names: done.join(', ') })
      : fill(PLUGIN_DONE[action], { names: done.join(', ') });
  }

  /** Passa a varrer a pasta de skills da ferramenta. */
  setTool(tool: AiTool): void {
    const profile = this.ctx.state().board.aiProfiles.find((p) => p.id === tool);
    this.store?.setTool(profile ? catalogTool(profile) : tool);
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
    const copy = this.ctx.library.writeSkillFile(name, rel, content);
    if (copy) {
      this.load();
      return copy;
    }
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

  /**
   * Se o editor do board pode gravar no arquivo. Só abre o que a varredura listou, de qualquer ferramenta,
   * e os arquivos que as instruções do Claude Code importam com `@caminho`.
   * Fica só leitura o que vem de plugin, o que está fora do projeto e da pasta do usuário, e o
   * `~/.claude.json`, que o Claude Code reescreve o tempo todo.
   */
  private access(file: string): { readonly: boolean } {
    if (this.ctx.library.fileArtifact(file)) return { readonly: false };
    const listed = this.current.inventory.flatMap((t) => t.items);
    const items = listed.filter((i) => i.path === file);
    if (!items.length && !listed.some((i) => i.imports?.some((x) => x.path === file))) throw new Error('Arquivo fora do harness.');
    const inside = [this.ctx.opts.workspaceDir, this.ctx.home].some((b) => b && file.startsWith(b + path.sep));
    const readonly = !inside || items.some((i) => i.scope === 'plugin') || file === path.join(this.ctx.home, '.claude.json');
    return { readonly };
  }

  /** Conteúdo de um arquivo do harness para o editor do board. */
  readFile(file: string): { content: string; readonly: boolean } {
    const { readonly } = this.access(file);
    if (this.current.inventory.some((t) => t.items.some((i) => i.kind === 'mcp' && i.path === file)))
      throw new Error('Configurações MCP não são devolvidas ao editor. Use a biblioteca para salvar uma nova definição.');
    if (fs.statSync(file).size > MAX_EDIT_BYTES) throw new Error('Arquivo maior que 512 KB: abra no editor.');
    return { content: fs.readFileSync(file, 'utf8'), readonly };
  }

  /** Grava o texto editado no board. JSON inválido é recusado: a ferramenta deixaria de ler o arquivo inteiro. */
  writeFile(file: string, content: string): void {
    if (this.ctx.library.fileArtifact(file)) {
      this.ctx.library.writeFile(file, content);
      this.load();
      return;
    }
    if (this.access(file).readonly) throw new Error('Este arquivo não pode ser alterado pelo board.');
    if (/\.json$/i.test(file)) {
      try {
        // os arquivos de configuração das ferramentas aceitam comentários de linha
        JSON.parse(content.replace(/^\s*\/\/.*$/gm, ''));
      } catch (e) {
        throw new Error(`JSON inválido, nada foi gravado: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    fs.writeFileSync(file, content);
    this.load();
  }

  /** Cria um item do harness e devolve o caminho do arquivo. */
  createItem(tool: AiTool, source: number, name: string, description: string): string {
    const file = this.ops.create(tool, source, name, description);
    this.load();
    return file;
  }

  /** Cria um item do harness com o conteúdo pronto (assistentes de regras e skills) e devolve o caminho do arquivo. */
  writeItem(tool: AiTool, source: number, name: string, content: string, files: string[] = [], append = false): string {
    const file = this.ops.write(tool, source, name, content, files, append);
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

/** O SKILL.md da skill do fluxo na pasta de skills da ferramenta, na pasta do usuário: os artefatos padrão do board nunca entram no projeto. */
export function flowSkillFile(ctx: BoardContext, tool: AiTool): string {
  const target = copyTarget(tool, 'skill', 'skills', 'user');
  if (!target || !ctx.home) throw new Error('Esta ferramenta não tem uma pasta de skills na pasta do usuário.');
  return path.join(ctx.home, target.path, FLOW_SKILL.name, 'SKILL.md');
}

/** Envia ao board em "Pelo card" uma skill da ferramenta em uso, pelo nome e escopo: criar ou instalar uma skill pelo board é querer usá-la. */
function markSkill(ctx: BoardContext, name: string, scope: 'project' | 'user' = 'project'): void {
  ctx.harness.load();
  const item = ctx.harness.current.inventory
    .find((t) => t.tool === ctx.state().board.aiTool)
    ?.items.find((i) => i.kind === 'skill' && i.scope === scope && i.name === name);
  if (item && !ctx.state().harnessSelection.some((x) => x.kind === 'skill' && x.location === item.location))
    ctx.boards.setSelection(ctx.boardId, [{ kind: 'skill', location: item.location }], 'contextual');
  ctx.harness.load();
}

/** Harness: regras, skills, agentes, hooks, permissões, servidores MCP e instalação de skills. */
export const harnessHandlers = {
  'harness.artifact.save': (msg, ctx, actor) => {
    const { library } = ctx;
    const via = msg.via ?? 'manual';
    if (msg.kind === 'rule') library.saveRule(msg.name, msg.body ?? '', { previous: msg.previous, via });
    else if (msg.kind === 'skill')
      library.saveSkill(msg.name, msg.body ?? '', { previous: msg.previous, via, ...(msg.files ? { files: msg.files } : {}) });
    else {
      if (actor.byAi) throw new Error('Configurações e credenciais MCP exigem revisão humana.');
      if (!msg.server) throw new Error('Informe a configuração do servidor MCP.');
      library.saveMcp(msg.name, msg.server, { previous: msg.previous, keepSecrets: msg.keepSecrets ?? [] });
    }
    ctx.harness.load();
    return true;
  },
  'harness.skillFile.write': (msg, ctx) => {
    ctx.library.writeSkillFile(msg.skill, msg.file, msg.content);
    ctx.harness.load();
    return true;
  },
  'harness.skillFile.delete': (msg, ctx) => {
    ctx.library.deleteSkillFile(msg.skill, msg.file);
    ctx.harness.load();
    return true;
  },
  'harness.import.apply': (msg, ctx, actor) => {
    if (actor.byAi) throw new Error('Importar artefatos exige revisão humana.');
    const names = new Map((ctx.importer.current?.candidates ?? []).map((c) => [c.key, c.name]));
    const nameOf = (key: string) => names.get(key) ?? key;
    const result = ctx.importer.apply(msg.keys, msg.onConflict);
    ctx.harness.importNotice = fill(IMPORT_DONE, {
      imported: result.imported.map(nameOf).join(', ') || '-',
      skipped: result.skipped.map(nameOf).join(', ') || '-',
      problems: result.problems.join('; ') || '-',
      secrets: result.mcpSecrets.map((s) => s.split(':')[0]).join(', ') || '-',
    });
    ctx.harness.load();
    return true;
  },
  'harness.import.cancel': (_msg, ctx) => {
    ctx.importer.cancel();
    return true;
  },
  'contextPlanning.save': (msg, ctx, actor) => {
    if (actor.byAi) throw new Error('Contratos de contexto exigem revisão humana; a IA não pode alterar autorizações.');
    new ContextPlanningRepo(ctx.dbHandle.db).save(ctx.boardId, msg.input);
    return true;
  },
  'contextPlanning.saveBatch': (msg, ctx, actor) => {
    if (actor.byAi) throw new Error('Contratos de contexto exigem revisão humana; a IA não pode alterar autorizações.');
    new ContextPlanningRepo(ctx.dbHandle.db).saveBatch(ctx.boardId, msg.inputs);
    return true;
  },
  'harness.library.scan': (msg, ctx) => {
    ctx.library.scanFolder(msg.dir);
    ctx.harness.load();
    return true;
  },
  'harness.library.apply': (msg, ctx) => {
    ctx.library.importArtifacts(msg.keys, msg.overwrite);
    ctx.harness.load();
    return true;
  },
  'harness.library.save': (msg, ctx, actor) => {
    if (actor.byAi && msg.input.kind === 'mcp') throw new Error('Configurações e credenciais MCP exigem revisão humana.');
    ctx.library.saveArtifact(msg.input);
    ctx.harness.load();
    return true;
  },
  'harness.library.directory': (msg, ctx) => {
    ctx.library.setDirectory(msg.dir);
    ctx.harness.load();
    return true;
  },
  'harness.library.update': (msg, ctx) => {
    ctx.library.update(msg.id);
    ctx.harness.load();
    return true;
  },
  'harness.library.import': (msg, ctx) => {
    const source = ctx.harness.install;
    if (!source) throw new Error('Nenhuma origem de skills carregada. Procure de novo.');
    ctx.library.importSkills(source.dir, msg.rels, source.skills);
    ctx.harness.clearInstall();
    ctx.harness.load();
    return true;
  },
  'harness.install.apply': (msg, ctx) => {
    const h = ctx.harness;
    if (!h.install) throw new Error('Nenhuma origem de skills carregada. Procure de novo.');
    const target = copyTarget(msg.tool, 'skill', 'skills', msg.to);
    const base = msg.to === 'project' ? ctx.opts.workspaceDir : ctx.home;
    if (!target || !base) throw new Error('Esta ferramenta não tem uma pasta de skills nesse escopo.');
    const installed = installSkills(h.install.dir, msg.rels, path.join(base, target.path));
    h.clearInstall();
    h.load();
    // installSkills devolve o SKILL.md de cada skill copiada; o nome é a pasta dele
    for (const file of installed) markSkill(ctx, path.basename(path.dirname(file)), msg.to);
    return true;
  },
  'harness.install.cancel': (_msg, ctx) => {
    ctx.harness.clearInstall();
    return true;
  },
  'harness.skill.file.delete': (msg, { harness: h }) =>
    h.change(() => h.ops.removeSkillFile(h.item(msg.tool, 'skill', msg.path), msg.file)),
  'harness.referenceSkill.create': (_msg, ctx) => {
    const changed = ctx.harness.op((h) => {
      h.createSkill(REFERENCE_SKILL.name, REFERENCE_SKILL.description, REFERENCE_SKILL.body);
      h.setSkillMode(REFERENCE_SKILL.name, 'manual');
      fs.mkdirSync(path.join(h.workspaceDir, toolInfo(activeProfile(ctx.state().board)).skills, REFERENCE_SKILL.name, 'references'), {
        recursive: true,
      });
    });
    markSkill(ctx, REFERENCE_SKILL.name);
    return changed;
  },
  'harness.hook.add': (msg, { harness: h }) => h.change(() => h.hooksAndPermissions.addHook(msg.tool, msg.source, msg.hook)),
  'harness.hook.remove': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.removeHook(msg.tool, h.entry(msg.tool, 'hook', msg.path, msg.event, msg.command))),
  'harness.permission.add': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.addPermission(msg.tool, msg.source, msg.list, msg.rule)),
  'harness.permission.remove': (msg, { harness: h }) =>
    h.change(() => h.hooksAndPermissions.removePermission(msg.tool, h.entry(msg.tool, 'settings', msg.path, msg.rule, msg.list))),
  'harness.mcp.add': (msg, { harness: h }) => h.change(() => h.mcpServers.add(msg.tool, msg.source, msg.server)),
  'harness.mcp.remove': (msg, ctx) => {
    const h = ctx.harness;
    const item = h.current.inventory
      .find((t) => t.tool === msg.tool)
      ?.items.find((i) => i.kind === 'mcp' && i.path === msg.path && i.name === msg.name);
    if (!item) throw new Error('Servidor não encontrado no harness. Atualize a lista e tente de novo.');
    const changed = h.change(() => h.mcpServers.remove(msg.tool, item));
    ctx.boards.setSelection(ctx.boardId, [{ kind: 'mcp', location: selectionKey(item) }], null);
    return changed;
  },
  'harness.import.add': (msg, ctx) => {
    ctx.harness.addImport(msg.tool, msg.dir);
    return true;
  },
  'harness.import.remove': (msg, ctx) => {
    ctx.harness.removeImport(msg.tool, msg.dir);
    return true;
  },
  'harness.item.delete': (msg, ctx) => {
    const h = ctx.harness;
    const item = h.item(msg.tool, msg.kind, msg.path);
    const changed = h.change(() => h.ops.remove(item));
    // o que saiu do disco sai do board
    if (isSelectableKind(item.kind)) ctx.boards.setSelection(ctx.boardId, [{ kind: item.kind, location: selectionKey(item) }], null);
    return changed;
  },
  'harness.item.copy': (msg, { harness: h }) => {
    const items = msg.items.map((i) => h.item(msg.tool, i.kind, i.path));
    return h.changeEach(items, (item) => h.ops.copy(msg.tool, item, msg.to));
  },
  'harness.rule.write': (msg, ctx) => ctx.harness.op((h) => h.writeRule(msg.name, msg.content)),
  'harness.rule.delete': (msg, ctx) => ctx.harness.op((h) => h.deleteRule(msg.name)),
  'harness.skill.create': (msg, ctx) => {
    const changed = ctx.harness.op((h) => h.createSkill(msg.name, msg.description, msg.content));
    markSkill(ctx, msg.name);
    return changed;
  },
  'harness.skill.write': (msg, ctx) => ctx.harness.op((h) => h.writeSkill(msg.name, msg.content)),
  'harness.skill.setEnabled': (msg, ctx) => ctx.harness.op((h) => h.setSkillEnabled(msg.name, msg.enabled)),
  'harness.skill.delete': (msg, ctx) => ctx.harness.op((h) => h.deleteSkill(msg.name)),
  'harness.skill.setMode': (msg, { harness: h }) => {
    const items = msg.paths.map((p) => h.item(msg.tool, 'skill', p));
    return h.changeEach(items, (item) => h.ops.setSkillMode(item, msg.mode));
  },
  'harness.selection.set': (msg, ctx) => {
    ctx.library.select(msg.items, msg.usage, ctx.harness.current.inventory);
    // um agente desmarcado deixa de valer para colunas e cards que o escolheram
    if (!msg.usage)
      for (const i of msg.items)
        if (i.kind === 'agent') {
          const name =
            ctx.harness.current.library?.artifacts.find((a) => a.kind === 'agent' && artifactLocation(a) === i.location)?.name ??
            ctx.harness.current.agents.find((a) => a.location === i.location)?.name;
          if (name && !ctx.library.repo.get(ctx.boardId, 'agent', name)) ctx.boards.releaseAgent(ctx.boardId, name);
        }
    ctx.harness.load();
    return true;
  },
  // o agente nasce marcado como disponível: criar um agente é querer usá-lo
  // o agente nasce no board (no banco), disponível: criar um agente é querer usá-lo. O escopo da pasta
  // da ferramenta não se aplica mais: o board não grava agentes nela
  'harness.agent.create': (msg, ctx) => ctx.harness.change(() => ctx.library.createAgent(msg.input)),
  // o agente que está no board é editado no board; um arquivo só do catálogo da ferramenta, como antes
  'harness.agent.update': (msg, ctx) =>
    ctx.library.hasAgent(msg.name)
      ? ctx.harness.change(() => ctx.library.updateAgent(msg.name, msg.patch, msg.body))
      : ctx.harness.op((h) => h.updateAgent(msg.name, msg.scope ?? 'project', msg.patch, msg.body)),
  'harness.agent.write': (msg, ctx) =>
    ctx.library.hasAgent(msg.name)
      ? ctx.harness.change(() => ctx.library.writeAgent(msg.name, msg.content))
      : ctx.harness.op((h) => h.writeAgent(msg.name, msg.scope ?? 'project', msg.content)),
  'harness.agent.delete': (msg, ctx) => {
    if (ctx.library.hasAgent(msg.name)) {
      ctx.library.deleteAgent(msg.name);
      ctx.boards.releaseAgent(ctx.boardId, msg.name);
      ctx.harness.load();
      return true;
    }
    return ctx.harness.op((h) => {
      const location = h.agents().find((a) => a.name === msg.name && a.scope === (msg.scope ?? 'project'))?.location;
      h.deleteAgent(msg.name, msg.scope ?? 'project');
      if (location) ctx.boards.setSelection(ctx.boardId, [{ kind: 'agent', location }], null);
      if (!h.agents().some((a) => a.name === msg.name)) ctx.boards.releaseAgent(ctx.boardId, msg.name);
    });
  },
  'harness.agents.seed': (msg, ctx) => {
    if (!ctx.harness.store) return false;
    seedAgents(ctx, msg.force);
    ctx.harness.load();
    return true;
  },
  // sem `replace`, não sobrescreve: se a pessoa já ajustou a skill, a versão dela fica. Mas a marcação
  // entra de qualquer jeito: uma skill que já estava no disco antes da marcação existir (ou que a
  // pessoa desmarcou) é "instalar" de novo que a põe em todo contexto
  'harness.flowSkill.install': (msg, ctx) => {
    const tool = msg.tool ?? ctx.state().board.aiTool;
    const file = flowSkillFile(ctx, tool);
    // o conjunto é instalado junto: a skill principal e as por assunto; só a principal é conferida e marcada
    const root = path.dirname(path.dirname(file));
    let written = false;
    ctx.harness.change(() => {
      written = installFlowSkillFiles(root, msg.replace).length > 0;
    });
    // a skill do fluxo só serve marcada em todo contexto: as execuções do board não carregam nada por conta própria
    ctx.harness.load();
    const item = ctx.harness.current.inventory
      .find((t) => t.tool === tool)
      ?.items.find((i) => i.kind === 'skill' && i.scope === 'user' && i.name === FLOW_SKILL.name);
    const marked =
      !!item && !ctx.state().harnessSelection.some((x) => x.kind === 'skill' && x.location === item.location && x.usage === 'always');
    if (item && marked) {
      ctx.boards.setSelection(ctx.boardId, [{ kind: 'skill', location: item.location }], 'always');
      ctx.harness.load();
    }
    return written || marked;
  },
} satisfies Partial<HandlerMap>;
