import * as fs from 'node:fs';
import { ContextPlanningRepo } from '../../repositories/contextPlanningRepo';
import { artifactLocation } from '../../../shared/artifacts';
import { EMPTY_HARNESS, type Harness } from '../../../shared/harness';
import { MCPS_FIELD, RULES_FIELD, SKILLS_FIELD } from '../../../shared/boardFields';
import { selectedMcpNames, selectedRuleLocations, selectedSkillNames } from '../../../shared/harnessSelection';
import { migrateExecProfiles, restoreSeedAgent, seedAgents } from '../../agentSeeds';
import { FLOW_SKILLS } from '../../flowSkill';
import type { BoardContext, HandlerMap } from './context';

/** O aviso do resultado da importação de artefatos: o que entrou, o que foi pulado, os problemas e os servidores MCP a configurar. */
const IMPORT_DONE = 'Importados: {imported}. Pulados: {skipped}. Problemas: {problems}. Servidores MCP a configurar: {secrets}.';
const fill = (text: string, params: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, n: string) => String(params[n] ?? m));

/** Teto do arquivo que o editor do board abre. */
const MAX_EDIT_BYTES = 512 * 1024;

/**
 * O que o board oferece às execuções: a biblioteca de artefatos guardada no banco (regras, skills,
 * agentes e servidores MCP). As pastas das ferramentas não são varridas nem gravadas; ler artefatos delas
 * só acontece na importação (artifactSource/libraryImport).
 */
export class BoardHarness {
  current: Harness = EMPTY_HARNESS;
  /** o aviso do último `harness.import.apply`, à espera da ponte */
  importNotice: string | null = null;

  constructor(private ctx: BoardContext) {}

  /**
   * Relê a biblioteca do board. As opções dos campos "Skills" e "Rules" acompanham a marcação do Harness: só o que
   * está no board em "Pelo card" pode ser indicado num card (o "Sempre" já vai em toda execução).
   */
  load(): void {
    if (!this.ctx.opts.workspaceDir) return;
    this.ctx.library.migrate();
    this.ctx.library.ensureFlowSkills();
    this.current = {
      ...EMPTY_HARNESS,
      library: {
        directory: this.ctx.library.directory,
        preview: this.ctx.library.preview,
        importResult: this.ctx.library.importResult,
        artifacts: this.ctx.library.materialize(),
        warnings: this.ctx.library.warnings,
        flowSkills: FLOW_SKILLS.map((k) => ({ name: k.name, description: k.description })),
      },
    };
    const state = this.ctx.state();
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
   * Na abertura do board: os perfis de agente que o banco guardava em versões antigas viram agentes do
   * board, os de fábrica são criados uma vez e a biblioteca é relida. Sem pasta de projeto nada acontece.
   */
  bootstrap(): void {
    if (!this.ctx.opts.workspaceDir) return;
    migrateExecProfiles(this.ctx);
    this.ctx.library.checkOrigins();
    this.load();
    if (this.ctx.opts.seedAgents && seedAgents(this.ctx).length) this.load();
  }

  /** Relê a biblioteca e diz se algo mudou. */
  refresh(): boolean {
    const before = JSON.stringify(this.current);
    // reabrir o Harness é quando as origens são relidas: a lista mostra o que mudou desde a cópia
    this.ctx.library.checkOrigins();
    this.load();
    return JSON.stringify(this.current) !== before;
  }

  /** Conteúdo de um arquivo da biblioteca para o editor do board. */
  readFile(file: string): { content: string; readonly: boolean } {
    if (!this.ctx.library.fileArtifact(file)) throw new Error('Arquivo fora do harness.');
    if (fs.statSync(file).size > MAX_EDIT_BYTES) throw new Error('Arquivo maior que 512 KB: abra no editor.');
    return { content: fs.readFileSync(file, 'utf8'), readonly: false };
  }

  /** Aplica a mudança no board e relê. */
  change(fn: () => void): boolean {
    fn();
    this.load();
    return true;
  }
}

/** Harness: biblioteca do board (regras, skills, agentes e servidores MCP) e a marcação deles. */
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
  'harness.selection.set': (msg, ctx) => {
    ctx.library.select(msg.items, msg.usage);
    // um agente desmarcado deixa de valer para colunas e cards que o escolheram
    if (!msg.usage)
      for (const i of msg.items)
        if (i.kind === 'agent') {
          const name = ctx.harness.current.library?.artifacts.find((a) => a.kind === 'agent' && artifactLocation(a) === i.location)?.name;
          if (name && !ctx.library.repo.get(ctx.boardId, 'agent', name)) ctx.boards.releaseAgent(ctx.boardId, name);
        }
    ctx.harness.load();
    return true;
  },
  // o agente nasce no board (no banco), disponível: criar um agente é querer usá-lo
  'harness.agent.create': (msg, ctx) => ctx.harness.change(() => ctx.library.createAgent(msg.input)),
  'harness.agent.update': (msg, ctx) => ctx.harness.change(() => ctx.library.updateAgent(msg.name, msg.patch, msg.body)),
  'harness.agent.write': (msg, ctx) => ctx.harness.change(() => ctx.library.writeAgent(msg.name, msg.content)),
  'harness.agent.delete': (msg, ctx) => {
    ctx.library.deleteAgent(msg.name);
    ctx.boards.releaseAgent(ctx.boardId, msg.name);
    ctx.harness.load();
    return true;
  },
  'harness.agent.restore': (msg, ctx) => ctx.harness.change(() => restoreSeedAgent(ctx, msg.name)),
  'harness.agents.seed': (msg, ctx) => {
    seedAgents(ctx, msg.force);
    ctx.harness.load();
    return true;
  },
} satisfies Partial<HandlerMap>;
