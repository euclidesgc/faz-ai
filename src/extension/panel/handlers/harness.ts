import { catalogTool } from '../../../shared/aiProfiles';
import { ContextPlanningRepo } from '../../repositories/contextPlanningRepo';
import { artifactLocation } from '../../../shared/artifacts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EMPTY_HARNESS, type AiTool, type Harness, type InstallableSkill } from '../../../shared/harness';
import { copyTarget } from '../../../shared/harnessCatalog';
import { MCPS_FIELD, RULES_FIELD, SKILLS_FIELD } from '../../../shared/boardFields';
import { selectedMcpNames, selectedRuleLocations, selectedSkillNames } from '../../../shared/harnessSelection';
import { migrateExecProfiles, seedAgents } from '../../agentSeeds';
import { FLOW_SKILL, installFlowSkillFiles } from '../../flowSkill';
import { type HarnessStore } from '../../harness';
import { parseClaudePlugins, pluginSignature, type ClaudeCli } from '../../plugins';
import { findSkills } from '../../skillInstall';
import type { BoardContext, HandlerMap } from './context';

/** Teto do arquivo que o editor do board abre: regras, skills e configurações passam longe disso. */
const MAX_EDIT_BYTES = 512 * 1024;

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

  /** Passa a varrer a pasta de skills da ferramenta. */
  setTool(tool: AiTool): void {
    const profile = this.ctx.state().board.aiProfiles.find((p) => p.id === tool);
    this.store?.setTool(profile ? catalogTool(profile) : tool);
    this.load();
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

  /** A configuração nativa de MCP pode conter credenciais; nem a leitura nem a escrita legada passam pelo editor do board. */
  private assertNotNativeMcpFile(file: string): void {
    if (this.current.inventory.some((t) => t.items.some((i) => i.kind === 'mcp' && i.path === file)))
      throw new Error('Configurações MCP não são editadas pelo editor de arquivos. Use a biblioteca do board.');
  }

  /** Conteúdo de um arquivo do harness para o editor do board. */
  readFile(file: string): { content: string; readonly: boolean } {
    const { readonly } = this.access(file);
    if (this.current.inventory.some((t) => t.items.some((i) => i.kind === 'mcp' && i.path === file)))
      throw new Error('Configurações MCP não são devolvidas ao editor. Use a biblioteca para salvar uma nova definição.');
    if (fs.statSync(file).size > MAX_EDIT_BYTES) throw new Error('Arquivo maior que 512 KB: abra no editor.');
    return { content: fs.readFileSync(file, 'utf8'), readonly };
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
