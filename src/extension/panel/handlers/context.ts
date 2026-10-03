import type { DbHandle } from '../../db/database';
import type { BoardState } from '../../../shared/model';
import type { WebviewToHost } from '../../../shared/messages';
import { AttachmentStore } from '../../attachments';
import { pendingUpgrade, upgradeBoard } from '../../db/boardTemplate';
import { HarnessStore } from '../../harness';
import { AttachmentRepo } from '../../repositories/attachmentRepo';
import { BoardRepo } from '../../repositories/boardRepo';
import { CardRepo } from '../../repositories/cardRepo';
import { ChecklistRepo } from '../../repositories/checklistRepo';
import { LinkRepo } from '../../repositories/linkRepo';
import { CommentRepo } from '../../repositories/commentRepo';
import { SettingsRepo } from '../../repositories/settingsRepo';
import { BoardHarness } from './harness';

export interface RouterOptions {
  workspaceKey: string;
  folderName: string;
  author: string;
  attachmentsDir: string;
  /** pasta do projeto; sem ela o harness (regras e skills) fica vazio */
  workspaceDir?: string;
  /** home do usuário, de onde se leem os modelos configurados nas ferramentas; sem ela vale só a lista embutida */
  homeDir?: string;
}

/** Repositórios, anexos e harness do board aberto, compartilhados pelo router e pelos handlers. */
export class BoardContext {
  readonly boards: BoardRepo;
  readonly cards: CardRepo;
  readonly checklist: ChecklistRepo;
  readonly links: LinkRepo;
  readonly settings: SettingsRepo;
  readonly comments: CommentRepo;
  readonly attachments: AttachmentRepo;
  readonly store: AttachmentStore;
  readonly harness: BoardHarness;
  /** muda quando o board é recriado (settings.board.reset) */
  boardId: string;
  /** cards aprovados por uma pessoa; o router avisa depois de gravar */
  readonly approved: string[] = [];

  constructor(
    readonly dbHandle: DbHandle,
    readonly opts: RouterOptions,
  ) {
    const db = dbHandle.db;
    this.boards = new BoardRepo(db);
    this.cards = new CardRepo(db);
    this.checklist = new ChecklistRepo(db);
    this.links = new LinkRepo(db);
    this.settings = new SettingsRepo(db);
    this.comments = new CommentRepo(db);
    this.attachments = new AttachmentRepo(db);
    this.store = new AttachmentStore(opts.attachmentsDir);
    const board = this.boards.getOrCreate(opts.workspaceKey, opts.folderName);
    this.boardId = board.id;
    // nada a mudar para chegar ao padrão atual: só registra a versão, sem perguntar
    if (!pendingUpgrade(db, board.id).length) upgradeBoard(db, board.id);
    this.harness = new BoardHarness(this, opts.workspaceDir ? new HarnessStore(opts.workspaceDir, board.aiTool, opts.homeDir ?? '') : null);
  }

  /** Estado do board como está no banco (sem harness nem execuções). */
  state(): BoardState {
    return this.boards.snapshot(this.boardId);
  }

  get home(): string {
    return this.opts.homeDir ?? '';
  }
}

/** Quem originou a mensagem: o autor que assina e se é a IA (via MCP) ou uma pessoa. */
export interface Actor {
  author: string;
  byAi: boolean;
}

export type MessageType = WebviewToHost['type'];
export type MessageOf<K extends MessageType> = Extract<WebviewToHost, { type: K }>;

/** Aplica uma mensagem; devolve true quando o board mudou (o router grava e avisa os webviews). */
export type Handler<K extends MessageType> = (msg: MessageOf<K>, ctx: BoardContext, actor: Actor) => boolean;

/** Um handler por tipo de mensagem; o TypeScript cobra os que faltarem. */
export type HandlerMap = { [K in MessageType]: Handler<K> };
