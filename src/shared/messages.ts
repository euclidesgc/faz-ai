import type { Appearance } from './appearance';
import type { ViewState } from './filters';
import type { ExecProfile } from './execution';
import type { AiTool, HarnessKind, SkillMode } from './harness';
import type { HookInput, McpServerInput } from './harnessCatalog';
import type { ModelOption, ModelRule } from './models';
import type { BoardRules } from './rules';
import type { CardStatus } from './status';
import type { RunnerConfig } from './runner';
import type { GitConfig } from './git';
import type { BoardState, ColumnCategory, FieldDisplay, FieldKind, FieldValue, Id, LinkKind, WorkflowKind } from './model';

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'view.set'; patch: Partial<ViewState> }
  | { type: 'ui.showFilters' }
  | { type: 'ui.connectAI' }
  /** abre este board no navegador, fora do editor */
  | { type: 'ui.openInBrowser' }
  /** executa a ferramenta de IA do projeto em segundo plano para trabalhar neste card */
  | { type: 'ai.run'; cardId: Id }
  | { type: 'ai.stop'; cardId: Id }
  /** começa agora uma rodada do heartbeat: a IA trata tudo o que está pendente com ela */
  | { type: 'ai.heartbeat.run' }
  | { type: 'card.create'; typeId: Id; columnId: Id; parentId: Id | null; title: string }
  | { type: 'card.update'; cardId: Id; patch: { title?: string; description?: string; typeId?: Id } }
  | {
      type: 'card.move';
      cardId: Id;
      columnId: Id;
      position: number;
      /** ao cancelar uma história, cancela também as sub-tarefas em aberto */ cancelChildren?: boolean;
    }
  | { type: 'card.trash'; cardId: Id }
  | { type: 'card.restore'; cardId: Id }
  | { type: 'card.archive'; cardId: Id }
  | { type: 'card.unarchive'; cardId: Id; columnId?: Id; position?: number }
  | { type: 'card.deletePermanent'; cardId: Id }
  | { type: 'trash.empty' }
  /** cria (ou reaproveita) a branch e a worktree da história do card */
  | { type: 'card.workspace.prepare'; cardId: Id }
  /** registra o pull request da história do card */
  | { type: 'card.pr.set'; cardId: Id; url: string }
  /** liga ou desliga o modo autônomo (YOLO) da história do card */
  | { type: 'card.yolo.set'; cardId: Id; enabled: boolean }
  /** agente de execução do card; null volta ao da coluna */
  | { type: 'card.execProfile.set'; cardId: Id; profileId: Id | null }
  | { type: 'settings.execProfiles.set'; profiles: ExecProfile[] }
  /** a pasta de trabalho da história foi removida (a branch continua registrada) */
  | { type: 'card.workspace.clear'; cardId: Id }
  /** abre a pasta de trabalho da história numa janela nova do editor */
  | { type: 'card.workspace.open'; cardId: Id }
  /** muda o status de trabalho do card; `note` é o motivo do bloqueio ou o texto que vai junto para a conversa */
  | { type: 'card.status.set'; cardId: Id; status: CardStatus | null; note?: string }
  | { type: 'comment.add'; cardId: Id; body: string }
  | { type: 'comment.update'; commentId: Id; body: string }
  | { type: 'comment.delete'; commentId: Id }
  | { type: 'attachment.pick'; cardId: Id }
  /** `artifact`: é o documento de uma fase; vai para a história (mesmo enviado de uma sub-tarefa) e substitui o artefato de mesmo nome */
  | { type: 'attachment.addData'; cardId: Id; filename: string; base64: string; artifact?: boolean }
  | { type: 'attachment.open'; attachmentId: Id }
  | { type: 'attachment.reveal'; attachmentId: Id }
  | { type: 'attachment.delete'; attachmentId: Id }
  | { type: 'field.setValue'; cardId: Id; fieldId: Id; value: FieldValue }
  | { type: 'checklist.add'; cardId: Id; text: string }
  | { type: 'checklist.update'; itemId: Id; patch: { text?: string; done?: boolean } }
  | { type: 'checklist.delete'; itemId: Id }
  /** vincula dois cards: `child` faz de `fromId` o pai de `toId`; `related` só os relaciona */
  | { type: 'link.add'; fromId: Id; toId: Id; kind: LinkKind }
  | { type: 'link.remove'; linkId: Id }
  | {
      type: 'settings.column.create';
      workflowId: Id;
      name: string;
      /** índice na linha; por padrão, antes da primeira coluna de conclusão */ position?: number;
    }
  | {
      type: 'settings.column.update';
      columnId: Id;
      patch: {
        name?: string;
        category?: ColumnCategory;
        position?: number;
        aiActive?: boolean;
        requiresApproval?: boolean;
        aiInstruction?: string;
        artifactName?: string;
        artifactTemplate?: string;
        execProfile?: Id | null;
      };
    }
  | { type: 'settings.column.delete'; columnId: Id; moveCardsTo: Id }
  | { type: 'settings.type.create'; name: string; color: string; defaultWorkflowId: Id }
  | {
      type: 'settings.type.update';
      typeId: Id;
      patch: { name?: string; color?: string; defaultWorkflowId?: Id; defaults?: Record<Id, FieldValue> };
    }
  | { type: 'settings.type.delete'; typeId: Id }
  | {
      type: 'settings.field.create';
      name: string;
      kind: FieldKind;
      options: string[];
      appliesToTypes: Id[] | null;
      display: FieldDisplay;
    }
  | {
      type: 'settings.field.update';
      fieldId: Id;
      patch: { name?: string; options?: string[]; appliesToTypes?: Id[] | null; display?: FieldDisplay };
    }
  | { type: 'settings.field.delete'; fieldId: Id }
  | { type: 'settings.workflow.create'; name: string; kind: WorkflowKind }
  | { type: 'settings.workflow.update'; workflowId: Id; patch: { name?: string; position?: number } }
  | { type: 'settings.workflow.delete'; workflowId: Id }
  | {
      type: 'settings.board.update';
      patch: { name?: string; aiTool?: AiTool; appearance?: Partial<Appearance>; runner?: Partial<RunnerConfig>; git?: Partial<GitConfig> };
    }
  /** apaga tudo e recria o board com o padrão atual */
  | { type: 'settings.board.reset' }
  /** leva o board ao padrão atual sem recriá-lo: só acrescenta e completa, os cards não saem do lugar */
  | { type: 'settings.board.upgrade' }
  | { type: 'settings.models.set'; catalog: ModelOption[] }
  /** relê os modelos da ferramenta (configuração local ou lista embutida) e os junta ao catálogo */
  | { type: 'settings.models.detect'; tool: AiTool }
  | { type: 'settings.modelRules.set'; rules: ModelRule[] }
  /** recria as regras "Esforço → modelo" com os modelos da ferramenta */
  | { type: 'settings.modelRules.suggest'; tool: AiTool }
  | { type: 'settings.rules.update'; patch: Partial<BoardRules> }
  /** relê o harness do disco (a pasta do usuário não é vigiada) */
  | { type: 'harness.refresh' }
  /** abre no editor o arquivo de um item do harness */
  | { type: 'harness.item.open'; path: string }
  /** cria um item num lugar do catálogo da ferramenta (`source` é o índice em HARNESS_CATALOG) e abre o arquivo no editor */
  | { type: 'harness.item.create'; tool: AiTool; source: number; name: string; description: string }
  /** apaga um arquivo ou uma pasta de skill do projeto ou da pasta do usuário */
  | { type: 'harness.item.delete'; tool: AiTool; kind: HarnessKind; path: string }
  /** copia skills, agentes, comandos ou regras para o projeto ou para a pasta do usuário */
  | { type: 'harness.item.copy'; tool: AiTool; items: { kind: HarnessKind; path: string }[]; to: 'project' | 'user' }
  | { type: 'harness.rule.write'; name: string; content: string }
  | { type: 'harness.rule.delete'; name: string }
  | { type: 'harness.skill.create'; name: string; description: string; content: string }
  | { type: 'harness.skill.write'; name: string; content: string }
  | { type: 'harness.skill.setEnabled'; name: string; enabled: boolean }
  | { type: 'harness.skill.delete'; name: string }
  /** acrescenta um servidor MCP a um arquivo de configuração da ferramenta (`source` é o índice em HARNESS_CATALOG) */
  | { type: 'harness.mcp.add'; tool: AiTool; source: number; server: McpServerInput }
  | { type: 'harness.mcp.remove'; tool: AiTool; path: string; name: string }
  /** acrescenta um hook a um arquivo de hooks da ferramenta (`source` é o índice em HARNESS_CATALOG) */
  | { type: 'harness.hook.add'; tool: AiTool; source: number; hook: HookInput }
  /** remove o hook listado: `event` é o nome do item e `command` o detalhe dele */
  | { type: 'harness.hook.remove'; tool: AiTool; path: string; event: string; command: string }
  /** regra de permissão numa das listas (allow, ask, deny) do arquivo de configuração */
  | { type: 'harness.permission.add'; tool: AiTool; source: number; list: string; rule: string }
  | { type: 'harness.permission.remove'; tool: AiTool; path: string; list: string; rule: string }
  /** arquivo de apoio de uma skill (`path` é o SKILL.md, `file` o caminho dentro da pasta dela); criar abre o arquivo no editor */
  | { type: 'harness.skill.file.create'; tool: AiTool; path: string; file: string; link: boolean }
  | { type: 'harness.skill.file.open'; tool: AiTool; path: string; file: string }
  | { type: 'harness.skill.file.delete'; tool: AiTool; path: string; file: string }
  /** cria no projeto a skill de modelos e exemplos de código, só quando indicada */
  | { type: 'harness.referenceSkill.create' }
  /** procura skills numa pasta ou num repositório git (clonado numa pasta temporária); o resultado vem em `harnessInstall` */
  | { type: 'harness.install.scan'; source: string }
  /** copia as skills escolhidas para a pasta de skills da ferramenta, no projeto ou na pasta do usuário */
  | { type: 'harness.install.apply'; tool: AiTool; to: 'project' | 'user'; rels: string[] }
  | { type: 'harness.install.cancel' }
  /** invocação automática ou só quando indicada, numa skill do projeto ou da pasta do usuário (`path` é o SKILL.md) */
  | { type: 'harness.skill.setMode'; tool: AiTool; paths: string[]; mode: SkillMode }
  | { type: 'harness.agent.create'; name: string; description: string; content: string; model?: string }
  | { type: 'harness.agent.write'; name: string; content: string }
  | { type: 'harness.agent.delete'; name: string }
  /** chat com a IA do projeto: envia uma mensagem (com o modelo escolhido, ou null para o padrão), interrompe ou limpa a conversa */
  | { type: 'chat.send'; text: string; model: string | null }
  | { type: 'chat.stop' }
  | { type: 'chat.clear' }
  /** mostra o chat na barra lateral do editor */
  | { type: 'ui.showChat' }
  /** instala a skill que ensina a IA a conduzir o fluxo do board (não sobrescreve uma já existente) */
  | { type: 'harness.flowSkill.install' };

export type HostToWebview =
  | { type: 'boardState'; state: BoardState; attachmentsBaseUri: string }
  | { type: 'ui.openCard'; cardId: Id }
  | { type: 'viewState'; view: ViewState }
  | { type: 'error'; message: string }
  /** aviso informativo (algo deu certo ou precisa de atenção, sem ser erro) */
  | { type: 'notice'; message: string };

export type { WorkflowKind };
