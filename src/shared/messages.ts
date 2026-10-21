import type { PolicyReply, PolicyScenario } from './policyManagement';
import type { ExecutionPolicy } from './executionPolicies';
import type { ContextDraftResolution } from './contextDraftResolution';
import type { ContextActivityTarget, ContextPlanningWrite, ActivityContextWrite } from './contextPlanning';
import type { AgentAssistInput, AgentAssistResult } from './agentAssistance';
import type { LibraryArtifactInput } from './artifacts';
import type { Appearance } from './appearance';
import type { ImportSummary } from './backup';
import type { ViewState } from './filters';
import type { UiPrefs } from './prefs';
import type { AiTool, InstallScope } from './harness';
import type { HarnessUsage, SelectableKind } from './harnessSelection';
import type { MetricsPanelQuery, MetricsPanelResult } from './metrics';
import type { CardUsage } from './cardUsage';
import type { QuestionInput } from './questions';
import type { ModelOption, ModelRule } from './models';
import type { BoardRules } from './rules';
import type { RenameKind } from './branchRename';
import type { BulkCardStatus, CardStatus } from './status';
import type { AiRunMode, RunnerConfig } from './runner';
import type { BranchKind, GitConfig } from './git';
import type { AiProfileDraft } from './aiProfiles';

/** O que o board grava num arquivo de agente: o frontmatter (menos o nome) e o corpo. */
export interface AgentInput {
  name: string;
  description: string;
  /** instruções (o corpo do arquivo, sem o frontmatter) */
  body: string;
  /** valor do campo Modelo do board (`<id>@<esforço>`); vazio = o modelo da sessão */
  model: string;
  tools: string[];
  deniedTools: string[];
  skills: string[];
  /** servidores MCP além do do board */
  mcp: string[];
  /** só no Cursor (`readonly: true`): o agente não edita arquivos nem roda comandos que mudem estado */
  readonly?: boolean;
  /** só no Cursor (`is_background: true`): o agente roda em segundo plano, sem esperar a conversa */
  background?: boolean;
}
import type { SettingsTab } from './settingsTab';
import type { BoardState, ColumnCategory, FieldDisplay, FieldKind, FieldValue, Id, LinkKind, WorkflowKind } from './model';

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'view.set'; patch: Partial<ViewState> }
  /** preferências da pessoa (avisos dispensados...), guardadas no host para valerem entre painéis e reinícios */
  | { type: 'prefs.set'; patch: Partial<UiPrefs> }
  | { type: 'ui.showFilters' }
  /** instala o servidor MCP do board no global de uma ferramenta (padrão: a do projeto); nada entra no projeto */
  | { type: 'ui.connectAI'; tool?: AiTool }
  /** tira o registro quebrado do board do arquivo do projeto (que vale sobre o global) e refaz o global */
  | { type: 'ui.fixProjectMcp'; file: string }
  /** recarrega a janela do editor, para o chat dele carregar o servidor recém-registrado */
  | { type: 'ui.reloadWindow' }
  /** abre a tela de MCPs do editor (no Cursor, Customize → MCPs) */
  | { type: 'ui.openEditorMcp' }
  /** abre um terminal do editor e roda o comando (ex.: o login de uma CLI); a pessoa conclui o login */
  | { type: 'ui.openTerminal'; command: string }
  /** abre este board no navegador, fora do editor */
  | { type: 'ui.openInBrowser' }
  /** pede ao editor para abrir o Settings nativo filtrado no Faz AI, ou numa chave (só faz sentido dentro do editor) */
  | { type: 'ui.openIdeSettings'; key?: string }
  /** a tela Git pede para detectar de novo a branch principal */
  | { type: 'git.main.refresh' }
  /** a resposta ao aviso de renomeação da principal ou da develop (`from` e `to` são os do pedido que a pessoa viu): renomear, desfazer ou dispensar o resultado */
  | { type: 'git.rename.resolve'; kind: RenameKind; from: string; to: string; action: 'confirm' | 'undo' | 'dismiss' }
  /** executa a ferramenta de IA do projeto em segundo plano para trabalhar neste card */
  /** `mode`: trabalhar a fase (padrão) ou só refinar o card */
  | { type: 'ai.run'; cardId: Id; mode?: AiRunMode }
  | { type: 'ai.stop'; cardId: Id }
  /** pausa o autopiloto das histórias em modo autônomo e interrompe a execução em andamento nelas */
  | { type: 'ai.autopilot.pause' }
  /** retoma o autopiloto das histórias em modo autônomo */
  | { type: 'ai.autopilot.resume' }
  /** começa agora uma rodada do heartbeat: a IA trata tudo o que está pendente com ela */
  | { type: 'ai.heartbeat.run' }
  | { type: 'card.create'; typeId: Id; columnId: Id; parentId: Id | null; title: string }
  /** copia o card para a primeira coluna do workflow (descrição, tipo, campos e checklist desmarcado); `title` já vem no idioma da pessoa */
  | { type: 'card.duplicate'; cardId: Id; title: string }
  | { type: 'card.update'; cardId: Id; patch: { title?: string; description?: string; typeId?: Id } }
  | { type: 'card.questions.set'; cardId: Id; questions: QuestionInput[] }
  | { type: 'card.questions.answer'; cardId: Id; answers: { questionId: Id; text: string; custom: boolean }[] }
  | {
      type: 'card.move';
      cardId: Id;
      columnId: Id;
      position: number;
      /** ao cancelar uma história, cancela também as sub-tarefas em aberto */ cancelChildren?: boolean;
      /**
       * desliga só a checagem de `blockDoneWithOpenChildren` ao concluir uma história; nenhuma outra
       * validação do `moveInner` é afetada. Não é exposta pela interface nem pelo MCP: só código interno
       * (o `MergeWatcher`, porque o merge do pull request já aconteceu e é irreversível) deve usá-la.
       */
      allowOpenChildren?: boolean;
    }
  | { type: 'card.trash'; cardId: Id }
  | { type: 'card.restore'; cardId: Id }
  | { type: 'card.archive'; cardId: Id }
  | { type: 'card.unarchive'; cardId: Id; columnId?: Id; position?: number }
  /**
   * restaura um card arquivado pela aba Arquivados: uma história volta com as sub-tarefas arquivadas dela; uma
   * sub-tarefa de história arquivada restaura a história. Cada card vai para o fim da primeira coluna do próprio
   * workflow, inativo, e a história sai do modo autônomo
   */
  | { type: 'card.restoreArchived'; cardId: Id }
  | { type: 'card.deletePermanent'; cardId: Id }
  | { type: 'trash.empty' }
  /** cria (ou reaproveita) a branch e a worktree da história do card */
  | { type: 'card.workspace.prepare'; cardId: Id }
  /** registra o pull request da história do card */
  | { type: 'card.pr.set'; cardId: Id; url: string }
  /** registra o commit do merge do pull request da história do card; sem efeito colateral (ao contrário do card.pr.set) */
  | { type: 'card.merge.set'; cardId: Id; commit: string }
  /** a IA terminou de refinar o card: o heartbeat não o refina de novo */
  | { type: 'card.refined.set'; cardId: Id }
  | { type: 'card.baseBranch.set'; cardId: Id; base: string }
  /**
   * liga ou desliga o modo autônomo (YOLO) da história do card. `until` é a coluna até onde ele vai (a IA
   * faz o trabalho dela, pede a revisão e o modo se desliga); ausente ou null = até a última coluna da IA.
   * Com o modo já ligado, um `until` diferente só muda até onde ele vai.
   */
  | { type: 'card.yolo.set'; cardId: Id; enabled: boolean; until?: Id | null }
  /**
   * liga ou desliga o modo autônomo (YOLO) de várias histórias de uma vez; ignora quem não for história viva.
   * `until` vale para todas: numa história de outro workflow, vale a coluna de mesmo nome
   */
  | { type: 'card.yolo.setMany'; cardIds: Id[]; enabled: boolean; until?: Id | null }
  /** arquiva várias histórias de uma vez; ignora quem não for história viva */
  | { type: 'card.archiveMany'; cardIds: Id[] }
  /** manda várias histórias para a lixeira de uma vez; ignora quem não for história viva */
  | { type: 'card.trashMany'; cardIds: Id[] }
  /** restaura várias lixeiras de uma vez (cada uma com os filhos); ignora quem não estiver na lixeira */
  | { type: 'card.restoreMany'; cardIds: Id[] }
  /** apaga de vez várias lixeiras de uma vez, com os filhos; ignora quem não estiver na lixeira */
  | { type: 'card.deletePermanentMany'; cardIds: Id[] }
  /**
   * restaura vários cards arquivados de uma vez, com a regra de `card.restoreArchived` em cada um (a história
   * volta com as sub-tarefas arquivadas; a sub-tarefa de história arquivada traz a história); ignora ids
   * repetidos, inexistentes, não arquivados ou na lixeira
   */
  | { type: 'card.unarchiveMany'; cardIds: Id[] }
  /**
   * manda vários cards arquivados para a lixeira de uma vez (a história leva as sub-tarefas arquivadas);
   * ignora ids repetidos, inexistentes, não arquivados ou já na lixeira
   */
  | { type: 'card.trashArchivedMany'; cardIds: Id[] }
  /** move várias histórias para a mesma coluna de uma vez; cancela as sub-tarefas em aberto do lote quando o destino é cancelamento */
  | { type: 'card.moveMany'; cardIds: Id[]; columnId: Id }
  /** a IA cria uma história a partir de outra em modo autônomo: a nova nasce em modo autônomo, empilhada depois dela */
  | { type: 'card.yolo.inherit'; cardId: Id; fromId: Id }
  /** a história é uma entrega derivada de outra: a branch dela parte da branch da origem, com o pull request empilhado */
  | { type: 'card.derive'; cardId: Id; fromId: Id }
  /** agente de execução do card (nome do agente marcado no Harness); null volta ao da coluna */
  | { type: 'card.execProfile.set'; cardId: Id; profileId: Id | null }
  /** a pasta de trabalho da história foi removida (a branch continua registrada) */
  | { type: 'card.workspace.clear'; cardId: Id }
  /** abre a pasta de trabalho da história numa janela nova do editor */
  | { type: 'card.workspace.open'; cardId: Id }
  /** muda o status de trabalho do card; `note` é o motivo do bloqueio ou o texto que vai junto para a conversa */
  /** `pending`: há algo que depende da pessoa; em modo autônomo o pedido de revisão não vira aprovação automática */
  | { type: 'card.status.set'; cardId: Id; status: CardStatus | null; note?: string; pending?: boolean }
  /** muda o status de trabalho de vários cards de uma vez; aplica só aos cards vivos da lista e reusa o
   * fluxo de `card.status.set` (comentário do motivo, aprovação com avanço automático) */
  | { type: 'card.status.setMany'; cardIds: Id[]; status: BulkCardStatus; note?: string }
  | { type: 'comment.add'; cardId: Id; body: string; kind?: 'summary' }
  | { type: 'comment.update'; commentId: Id; body: string }
  | { type: 'comment.delete'; commentId: Id }
  | { type: 'attachment.pick'; cardId: Id }
  /** `artifact`: é o documento de uma fase; vai para a história (mesmo enviado de uma sub-tarefa) e substitui o artefato de mesmo nome */
  | { type: 'attachment.addData'; cardId: Id; filename: string; base64: string; artifact?: boolean }
  | { type: 'attachment.reveal'; attachmentId: Id }
  /** lê o conteúdo de um anexo de texto/JSON para exibir ou editar na modal */
  | { type: 'attachment.read'; requestId: string; attachmentId: Id }
  /** grava o conteúdo editado de volta no arquivo do anexo */
  /** grava o texto editado no arquivo do anexo; a confirmação vem pelo `done` do `requestId` */
  | { type: 'attachment.write'; attachmentId: Id; content: string }
  /** consulta o log para o painel de métricas; não altera nada, a resposta é `metrics.result` */
  | { type: 'metrics.query'; requestId: string; query: MetricsPanelQuery }
  /** consulta o que o card já gastou nas execuções de IA (o log); não altera nada, a resposta é `card.usage.result` */
  | { type: 'card.usage.query'; requestId: string; cardId: Id }
  /** diálogo nativo de "salvar como" (só no editor; na web a modal faz o download direto) */
  | { type: 'attachment.saveAs'; attachmentId: Id }
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
      patch: { name?: string; color?: string; defaultWorkflowId?: Id; defaults?: Record<Id, FieldValue>; branchKind?: BranchKind };
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
  /** Cria ou atualiza um perfil de CLI; os valores privados ficam somente no host. */
  | { type: 'settings.aiProfiles.save'; profile: AiProfileDraft }
  /** Liga ou desliga um perfil revisado. */
  | { type: 'settings.aiProfiles.setEnabled'; id: string; enabled: boolean }
  /** Cria uma cópia desligada e pendente de revisão. */
  | { type: 'settings.aiProfiles.duplicate'; id: string }
  /** Apaga um perfil que não é pronto nem padrão. */
  | { type: 'settings.aiProfiles.remove'; id: string }
  /** Consulta a instalação e o login dos perfis sem devolver a configuração. */
  | { type: 'settings.aiProfiles.probe' }
  /** Faz um teste explícito, limitado a dois minutos, sem MCP nem ferramentas de alteração. */
  | { type: 'settings.aiProfiles.test'; id: string }
  | { type: 'settings.models.set'; catalog: ModelOption[] }
  /**
   * relê os modelos da ferramenta (configuração local ou lista embutida) e os junta ao catálogo;
   * `fastOnly` junta só as versões rápidas dos modelos do Cursor que já estão no catálogo
   */
  | { type: 'settings.models.detect'; tool: AiTool; fastOnly?: boolean }
  | { type: 'settings.modelRules.set'; rules: ModelRule[] }
  /** recria as regras "Esforço → modelo" com os modelos da ferramenta */
  | { type: 'settings.modelRules.suggest'; tool: AiTool }
  | { type: 'settings.rules.update'; patch: Partial<BoardRules> }
  /** relê o harness do disco (a pasta do usuário não é vigiada) */
  | { type: 'harness.refresh' }
  /** abre no editor o arquivo de um item do harness */
  | { type: 'harness.item.open'; path: string }
  /** lê, para o editor do board, um arquivo que a varredura do harness listou */
  | { type: 'harness.file.read'; requestId: string; path: string }
  /** grava o texto editado no board num arquivo do harness; recusa os que são só leitura */
  /** grava o texto editado num arquivo do harness; a confirmação vem pelo `done` do `requestId` */
  | { type: 'harness.file.write'; path: string; content: string }
  | { type: 'harness.agent.assist'; requestId: string; input: AgentAssistInput }
  /** grava um arquivo de regras (CLAUDE.md, AGENTS.md) no board; sem a cópia, ela nasce desligada */
  | { type: 'harness.rule.write'; name: string; content: string }
  | { type: 'harness.rule.delete'; name: string }
  /** cria uma skill no board, disponível para indicar nos cards; `content` são as instruções, sem o frontmatter */
  | { type: 'harness.skill.create'; name: string; description: string; content: string }
  | { type: 'harness.skill.delete'; name: string }
  /**
   * envia artefatos ao board com um modo, muda o modo dos que já estão nele, ou os tira do board (com
   * `usage` null): `location` é a identidade do item na marcação (`selectionKey`: o caminho como o
   * inventário o mostra, mais `#nome` numa entrada de configuração)
   */
  | { type: 'harness.library.scan'; dir: string }
  | { type: 'harness.library.apply'; keys: string[]; overwrite?: boolean }
  | { type: 'harness.library.pickDirectory' }
  | { type: 'harness.library.folders'; dir: string }
  | { type: 'harness.library.save'; input: LibraryArtifactInput }
  | { type: 'executionPolicy.read'; requestId: string; id?: string; beforeRevision?: number }
  | { type: 'executionPolicy.simulate'; requestId: string; scenario: PolicyScenario }
  | { type: 'executionPolicy.assist'; requestId: string; input: import('./policyAssistant').PolicyAssistInput }
  | { type: 'settings.executionPolicy.save'; policy: ExecutionPolicy; expectedRevision: number; reviewed: boolean }
  | { type: 'settings.executionPolicy.remove'; id: string; expectedRevision: number }
  | { type: 'contextPlanning.save'; input: ContextPlanningWrite }
  | { type: 'contextPlanning.saveBatch'; inputs: ActivityContextWrite[] }
  | { type: 'contextPlanning.preview'; requestId: string; target: ContextActivityTarget }
  | { type: 'harness.library.read'; id: string }
  | { type: 'harness.library.pickArtifacts' }
  | { type: 'harness.library.directory'; dir: string }
  | { type: 'harness.library.update'; id: string }
  | { type: 'harness.library.open' }
  | { type: 'harness.selection.set'; items: { kind: SelectableKind; location: string }[]; usage: HarnessUsage | null }
  /** cria um agente no board (guardado no banco, não na pasta da ferramenta), disponível para os cards; `scope` é ignorado */
  | { type: 'harness.agent.create'; scope?: InstallScope; input: AgentInput }
  /** reescreve o frontmatter (o que vier em `patch`) e, se vier, o corpo de um agente, preservando o resto */
  | { type: 'harness.agent.update'; name: string; scope: InstallScope; patch: Partial<AgentInput>; body?: string }
  | { type: 'harness.agent.write'; name: string; scope: InstallScope; content: string }
  | { type: 'harness.agent.delete'; name: string; scope: InstallScope }
  /** cria os agentes padrão de fábrica que ainda não existem (`force` recria também os que a pessoa apagou) */
  | { type: 'harness.agents.seed'; force?: boolean }
  /** a IA lê o projeto e propõe os agentes do board (cria, ajusta e marca); o resultado vai para o chat do board */
  | { type: 'ai.suggestAgents' }
  /** a IA lê o projeto e propõe de 3 a 5 regras, gravadas e enviadas ao board desligadas; o resultado vai para o chat */
  | { type: 'ai.suggestRules' }
  /** a IA lê o projeto e propõe de 3 a 5 skills, gravadas e enviadas ao board em "Pelo card"; o resultado vai para o chat */
  | { type: 'ai.suggestSkills' }
  /** chat com a IA do projeto: envia uma mensagem (com o modelo escolhido, ou null para o padrão), interrompe ou limpa a conversa */
  | { type: 'chat.send'; text: string; model: string | null }
  | { type: 'chat.stop' }
  | { type: 'chat.clear' }
  /** mostra o chat na barra lateral do editor */
  | { type: 'ui.showChat' }
  /** confere de novo o que falta para o board trabalhar com a ferramenta de IA */
  | { type: 'requirements.check' }
  /** varre de novo as branches e worktrees órfãs (o relatório sai em `BoardState.orphans`) */
  | { type: 'git.orphans.scan' }
  /** limpa uma órfã pelo `id`; `acceptLoss` com os números que a pessoa viu confirma a perda de uma que depende de decisão */
  | { type: 'git.orphans.clean'; id: string; acceptLoss?: { dirtyFiles: number; uniqueCommits: number } }
  /** limpa todas as órfãs seguras */
  | { type: 'git.orphans.cleanSafe' }
  /** roda o Diagnóstico do ambiente (o que o board precisa, o que é opcional e o que ele aproveita) */
  | { type: 'environment.check' }
  /** o Diagnóstico já abriu sozinho nesta máquina: não abre mais na abertura do board */
  | { type: 'environment.seen' }
  /** grava o caminho completo dos MCPs (do board e do Code Review Graph) que o editor não acha */
  | { type: 'environment.pinMcp' }
  /** libera as ferramentas do board sem aprovação nas conversas do Kimi Code (a regra no config.toml dele) */
  | { type: 'environment.allowKimiMcp' }
  /** instala a skill que ensina a IA a conduzir o fluxo do board (não sobrescreve uma já existente) */
  /**
   * instala a skill do fluxo no global de uma ferramenta (padrão: a do projeto), nunca no projeto;
   * `replace` troca uma skill de mesmo nome que já esteja no destino (sem ele, a que existe fica)
   */
  /** exporta o board num arquivo JSON (no editor, abre o "salvar como"; na web a página baixa pela rota /backup/export) */
  | { type: 'backup.export' }
  /** escolhe um arquivo de export, valida e devolve o resumo em `backup.import.summary` (na web a página envia por /backup/import) */
  | { type: 'backup.import.pick' }
  /** substitui o board atual pelo arquivo estacionado sob `token`; grava o .bak antes */
  | { type: 'backup.import.apply'; token: string }
  /** descarta o arquivo estacionado */
  | { type: 'backup.import.cancel'; token: string };

export type HostToWebview =
  | { type: 'boardState'; state: BoardState; attachmentsBaseUri: string }
  | {
      type: 'aiProfiles.status';
      profiles: Record<string, { found: boolean; version: string | null; signedIn: boolean | null; installUrl: string | null }>;
    }
  | { type: 'aiProfiles.testResult'; id: string; ok: boolean; output: string; error?: string }
  | { type: 'ui.openCard'; cardId: Id }
  | { type: 'viewState'; view: ViewState }
  | { type: 'prefs'; prefs: UiPrefs }
  | { type: 'error'; message: string }
  /** aviso informativo (algo deu certo ou precisa de atenção, sem ser erro) */
  | { type: 'notice'; message: string }
  /** resposta a `attachment.read`, correlacionada por `requestId` */
  | { type: 'attachment.readResult'; requestId: string; content?: string; error?: string }
  /** resposta a `harness.file.read`: o conteúdo e se o arquivo pode ser alterado pelo board */
  | { type: 'harness.file.readResult'; requestId: string; content?: string; readonly?: boolean; error?: string }
  /** resposta a `harness.project.profile`, correlacionada por `requestId` */
  | { type: 'harness.library.content'; input: LibraryArtifactInput }
  | { type: 'harness.agent.assistResult'; requestId: string; result?: AgentAssistResult; error?: string }
  | { type: 'harness.library.directorySelected'; directory: string }
  | { type: 'harness.library.foldersResult'; directory: string; parent: string; folders: { name: string; path: string }[] }
  /** resposta a `metrics.query`, correlacionada por `requestId` */
  | { type: 'metrics.result'; requestId: string; result?: MetricsPanelResult; error?: string }
  /** prévia dos contratos salvos, sem corpos de artefatos, inferência ou admissão */
  | ({ type: 'executionPolicy.result'; requestId: string } & PolicyReply)
  | { type: 'contextPlanning.preview.result'; requestId: string; preview?: ContextDraftResolution; error?: string }
  /** resposta a `card.usage.query`, correlacionada por `requestId` */
  | { type: 'card.usage.result'; requestId: string; usage?: CardUsage; error?: string }
  /** arquivo de export lido e validado: o resumo para a pessoa confirmar (`backup.import.apply`) ou desistir (`backup.import.cancel`) */
  | { type: 'backup.import.summary'; token: string; summary: ImportSummary }
  /** a exportação ou a escolha do arquivo terminou (com sucesso ou porque a pessoa desistiu): a interface sai do estado "ocupado" */
  | { type: 'backup.done' }
  /** o host pede à interface para trocar de aba das Configurações, opcionalmente rolando até uma seção */
  | { type: 'ui.openSettings'; tab: SettingsTab; section?: string }
  /** o host pede à interface para abrir uma tela fora das Configurações */
  | { type: 'ui.openView'; view: 'environment' }
  /** o host terminou de tratar a mensagem enviada com este `requestId` (qualquer tipo): deu certo, ou falhou com o erro já mostrado em `error` */
  | { type: 'done'; requestId: string; ok: boolean; error?: string };

/**
 * Envelope opcional de qualquer mensagem da interface: com `requestId`, o host responde `done` quando termina de tratá-la.
 * É o que permite à tela mostrar que está esperando (ver `request()` em `src/webview/request.ts`).
 */
export type Tracked<M = WebviewToHost> = M & { requestId?: string };

export type { WorkflowKind };
