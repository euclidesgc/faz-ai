import { ExecutionPolicyRepo } from '../../repositories/executionPolicyRepo';
import type { DbHandle } from '../../db/database';
import type { BoardState } from '../../../shared/model';
import type { WebviewToHost } from '../../../shared/messages';
import type { BoardExportFile, ImportResult } from '../../db/boardExport';
import { AttachmentStore } from '../../attachments';
import { pendingUpgrade, upgradeBoard } from '../../db/boardTemplate';
import { CardEventRepo } from '../../log/cardEventRepo';
import { EventLog } from '../../log/eventLog';
import { AttachmentRepo } from '../../repositories/attachmentRepo';
import { BoardRepo } from '../../repositories/boardRepo';
import { CardRepo } from '../../repositories/cardRepo';
import { ChecklistRepo } from '../../repositories/checklistRepo';
import { GateRepo } from '../../repositories/gateRepo';
import { LinkRepo } from '../../repositories/linkRepo';
import { CommentRepo } from '../../repositories/commentRepo';
import { SettingsRepo } from '../../repositories/settingsRepo';
import { detectMainBranch } from '../../git';
import { ghProcess, type GhRunner } from '../../branchRename';
import { parseGit, type MainBranch } from '../../../shared/git';
import { BoardLibrary } from '../../boardLibrary';
import { ArtifactImporter } from '../../artifactImport';
import { BoardHarness } from './harness';
import type { Trace } from '../../log/trace';

export interface RouterOptions {
  workspaceKey: string;
  folderName: string;
  author: string;
  attachmentsDir: string;
  /** pasta gerenciada das cópias de leitura do Harness */
  libraryDir?: string;
  /** pasta do projeto; sem ela o harness (regras e skills) fica vazio */
  workspaceDir?: string;
  /** home do usuário, de onde se leem os modelos configurados nas ferramentas; sem ela vale só a lista embutida */
  homeDir?: string;
  /** canal de log da extensão; sem ele as falhas do log do board vão para o console */
  log?: (line: string) => void;
  /** versão da extensão, gravada no cabeçalho do arquivo exportado */
  extensionVersion?: string;
  /** cria os agentes de fábrica na pasta global da ferramenta na abertura (o produto liga; os testes não) */
  seedAgents?: boolean;
  /** o `gh` que renomeia branches no GitHub (#466); sem ele, o processo `gh` do PATH */
  gh?: GhRunner;
  /** o rastreio do board (ações da tela, mudanças aplicadas, ferramentas MCP); sem ele, nada é rastreado */
  trace?: Trace;
}

/** Repositórios, anexos e harness do board aberto, compartilhados pelo router e pelos handlers. */
export class BoardContext {
  readonly boards: BoardRepo;
  readonly executionPolicies: ExecutionPolicyRepo;
  readonly cards: CardRepo;
  readonly checklist: ChecklistRepo;
  /** o registro das execuções do portão (`gate_runs`) */
  readonly gateRuns: GateRepo;
  readonly links: LinkRepo;
  readonly settings: SettingsRepo;
  readonly comments: CommentRepo;
  readonly attachments: AttachmentRepo;
  readonly store: AttachmentStore;
  readonly harness: BoardHarness;
  readonly library: BoardLibrary;
  /** a prévia e a cópia de artefatos de pasta, git, ferramenta instalada ou export; descartada ao fechar o board */
  readonly importer: ArtifactImporter;
  /** o log de utilização: sonda antes do handler e registro depois, feitos pelo router */
  readonly log: EventLog;
  /** muda quando um export é importado no lugar do board (backup.import.apply) */
  boardId: string;
  /** cards aprovados por uma pessoa; o router avisa depois de gravar */
  readonly approved: string[] = [];
  /** ids de `gate_runs` recém-criados; o router avisa o executor depois de gravar */
  readonly gates: string[] = [];
  /** cards em que a IA está executando agora (informado pelo executor): a importação recusa enquanto houver */
  aiRuns: string[] = [];
  /** arquivos de export lidos e validados, à espera da confirmação da pessoa, por token */
  readonly pendingImports = new Map<string, BoardExportFile>();
  /** resultado da última importação, para a mensagem de resultado */
  lastImport: ImportResult | null = null;
  /** o `gh` com que a renomeação de branches age no GitHub; injetado nos testes */
  readonly gh: GhRunner;
  /** a principal detectada; undefined enquanto não foi calculada (ver `mainBranch`) */
  private main: MainBranch | null | undefined;

  constructor(
    readonly dbHandle: DbHandle,
    readonly opts: RouterOptions,
  ) {
    const db = dbHandle.db;
    this.gh = opts.gh ?? ghProcess();
    this.boards = new BoardRepo(db);
    this.executionPolicies = new ExecutionPolicyRepo(db);
    this.cards = new CardRepo(db);
    this.checklist = new ChecklistRepo(db);
    this.gateRuns = new GateRepo(db);
    this.links = new LinkRepo(db);
    this.settings = new SettingsRepo(db);
    this.comments = new CommentRepo(db);
    this.attachments = new AttachmentRepo(db);
    this.store = new AttachmentStore(opts.attachmentsDir);
    this.log = new EventLog(db, new CardEventRepo(db), { boardId: () => this.boardId, log: opts.log });
    const board = this.boards.getOrCreate(opts.workspaceKey, opts.folderName);
    this.boardId = board.id;
    // nada a mudar para chegar ao padrão atual: só registra a versão, sem perguntar
    if (!pendingUpgrade(db, board.id).length) upgradeBoard(db, board.id);
    this.library = new BoardLibrary(this);
    this.importer = new ArtifactImporter(this);
    this.harness = new BoardHarness(this);
  }

  /** Estado do board como está no banco (sem harness nem execuções). */
  state(): BoardState {
    return this.boards.snapshot(this.boardId);
  }

  get home(): string {
    return this.opts.homeDir ?? '';
  }

  /**
   * A branch principal do repositório do projeto, em cache: rodar git a cada snapshot custaria caro.
   * Calculada na primeira leitura (a abertura) e recalculada com `refresh` (depois de cada criação de
   * branch e quando a tela Git pede). null fora de um repositório git ou sem pasta de projeto.
   */
  mainBranch(refresh = false): MainBranch | null {
    if (refresh || this.main === undefined) this.main = this.opts.workspaceDir ? detectMainBranch(this.opts.workspaceDir) : null;
    // a principal fixada nas configurações vale sobre a detectada, desde que haja repositório
    const fixed = this.main ? parseGit(this.boards.gitJson(this.boardId)).mainBranch : '';
    return fixed ? { name: fixed, source: 'config' } : this.main;
  }
}

/** Quem originou a mensagem: o autor que assina e se é a IA (via MCP) ou uma pessoa. */
export interface Actor {
  author: string;
  byAi: boolean;
  runId?: string | null;
}

export type MessageType = WebviewToHost['type'];
export type MessageOf<K extends MessageType> = Extract<WebviewToHost, { type: K }>;

/** Aplica uma mensagem; devolve true quando o board mudou (o router grava e avisa os webviews). */
export type Handler<K extends MessageType> = (msg: MessageOf<K>, ctx: BoardContext, actor: Actor) => boolean;

/** Um handler por tipo de mensagem; o TypeScript cobra os que faltarem. */
export type HandlerMap = { [K in MessageType]: Handler<K> };
