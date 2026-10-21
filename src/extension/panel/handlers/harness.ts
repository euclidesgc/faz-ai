import * as fs from 'node:fs';
import { ContextPlanningRepo } from '../../repositories/contextPlanningRepo';
import { artifactLocation } from '../../../shared/artifacts';
import { EMPTY_HARNESS, type Harness } from '../../../shared/harness';
import { MCPS_FIELD, RULES_FIELD, SKILLS_FIELD } from '../../../shared/boardFields';
import { selectedMcpNames, selectedRuleLocations, selectedSkillNames } from '../../../shared/harnessSelection';
import { migrateExecProfiles, seedAgents } from '../../agentSeeds';
import type { BoardContext, HandlerMap } from './context';

/** Teto do arquivo que o editor do board abre. */
const MAX_EDIT_BYTES = 512 * 1024;

/**
 * O que o board oferece às execuções: a biblioteca de artefatos guardada no banco (regras, skills,
 * agentes e servidores MCP). As pastas das ferramentas não são varridas nem gravadas; ler artefatos delas
 * só acontece na importação (artifactSource/libraryImport).
 */
export class BoardHarness {
  current: Harness = EMPTY_HARNESS;

  constructor(private ctx: BoardContext) {}

  /**
   * Relê a biblioteca do board. As opções dos campos "Skills" e "Rules" acompanham a marcação do Harness: só o que
   * está no board em "Pelo card" pode ser indicado num card (o "Sempre" já vai em toda execução).
   */
  load(): void {
    if (!this.ctx.opts.workspaceDir) return;
    this.ctx.library.migrate();
    this.current = {
      ...EMPTY_HARNESS,
      library: {
        directory: this.ctx.library.directory,
        preview: this.ctx.library.preview,
        importResult: this.ctx.library.importResult,
        artifacts: this.ctx.library.materialize(),
        warnings: this.ctx.library.warnings,
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
    this.load();
    if (this.ctx.opts.seedAgents && seedAgents(this.ctx).length) this.load();
  }

  /** Relê a biblioteca e diz se algo mudou. */
  refresh(): boolean {
    const before = JSON.stringify(this.current);
    this.load();
    return JSON.stringify(this.current) !== before;
  }

  /** Grava um arquivo de apoio numa skill do board (usado pela IA) e devolve o caminho dele. */
  writeSkillFile(name: string, rel: string, content: string): string {
    const copy = this.ctx.library.writeSkillFile(name, rel, content);
    if (!copy) throw new Error(`Skill "${name}" não encontrada no board.`);
    this.load();
    return copy;
  }

  /** Conteúdo de um arquivo da biblioteca para o editor do board. */
  readFile(file: string): { content: string; readonly: boolean } {
    if (!this.ctx.library.fileArtifact(file)) throw new Error('Arquivo fora do harness.');
    if (fs.statSync(file).size > MAX_EDIT_BYTES) throw new Error('Arquivo maior que 512 KB: abra no editor.');
    return { content: fs.readFileSync(file, 'utf8'), readonly: false };
  }

  /** Grava no board o texto editado de um arquivo da biblioteca. */
  writeFile(file: string, content: string): void {
    if (!this.ctx.library.fileArtifact(file)) throw new Error('Este arquivo não pode ser alterado pelo board.');
    this.ctx.library.writeFile(file, content);
    this.load();
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
  'harness.rule.write': (msg, ctx) => ctx.harness.change(() => ctx.library.writeRule(msg.name, msg.content)),
  'harness.rule.delete': (msg, ctx) => ctx.harness.change(() => ctx.library.removeArtifact('rule', msg.name)),
  'harness.skill.create': (msg, ctx) => ctx.harness.change(() => ctx.library.createSkill(msg.name, msg.description, msg.content)),
  'harness.skill.delete': (msg, ctx) => ctx.harness.change(() => ctx.library.removeArtifact('skill', msg.name)),
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
  'harness.agents.seed': (msg, ctx) => {
    seedAgents(ctx, msg.force);
    ctx.harness.load();
    return true;
  },
} satisfies Partial<HandlerMap>;
