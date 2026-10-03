import * as vscode from 'vscode';
import { cardRef, type BoardState, type Card, type Column } from '../../shared/model';
import { cardsIn, columnOf, columnsOf, countDone, isArchived } from '../../shared/selectors';
import type { MessageRouter } from '../panel/messageRouter';

type Node = { kind: 'column'; column: Column } | { kind: 'archived' } | { kind: 'card'; card: Card };

/** Arquivados que aparecem no topo do grupo: os que não foram arquivados junto com o pai. */
const archivedRoots = (s: BoardState): Card[] =>
  s.cards
    .filter((c) => isArchived(c) && !s.cards.some((p) => p.id === c.parentId && p.archivedAt !== null))
    .sort((a, b) => a.number - b.number);

/** Resumo do board na barra lateral: colunas das histórias → cards → sub-tarefas. */
export class BoardTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private state: BoardState | undefined;

  constructor(private getRouter: () => Promise<MessageRouter | undefined>) {}

  refresh(): void {
    this.state = undefined;
    this.emitter.fire(undefined);
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!this.state) {
      const router = await this.getRouter();
      if (!router) return [];
      this.state = router.snapshot();
    }
    const s = this.state;
    if (!node) {
      const parentWf = s.workflows.find((w) => w.kind === 'parent');
      const columns: Node[] = (parentWf ? columnsOf(s, parentWf.id) : []).map((column) => ({ kind: 'column', column }));
      return [...columns, { kind: 'archived' }];
    }
    if (node.kind === 'column') return cardsIn(s, node.column.id).map((card) => ({ kind: 'card', card }));
    if (node.kind === 'archived') return archivedRoots(s).map((card) => ({ kind: 'card', card }));
    return this.childrenOf(s, node.card).map((card) => ({ kind: 'card', card }));
  }

  /** Sub-tarefas no mesmo estado do pai: ativas sob um card ativo, arquivadas sob um card arquivado. */
  private childrenOf(s: BoardState, card: Card): Card[] {
    return s.cards.filter((c) => c.parentId === card.id && c.deletedAt === null && (c.archivedAt !== null) === (card.archivedAt !== null));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const s = this.state!;
    if (node.kind === 'column') {
      const count = cardsIn(s, node.column.id).length;
      const item = new vscode.TreeItem(
        node.column.name,
        count ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
      );
      item.description = String(count);
      item.iconPath = new vscode.ThemeIcon(node.column.isTerminal ? 'pass' : 'circle-outline');
      return item;
    }
    if (node.kind === 'archived') {
      const count = s.cards.filter(isArchived).length;
      const item = new vscode.TreeItem(
        'Arquivados',
        count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      );
      item.description = String(count);
      item.iconPath = new vscode.ThemeIcon('archive');
      return item;
    }
    const { card } = node;
    const children = this.childrenOf(s, card);
    const column = columnOf(s, card);
    const item = new vscode.TreeItem(
      `${cardRef(card)} ${card.title}`,
      children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    const type = s.cardTypes.find((t) => t.id === card.typeId);
    if (card.parentId) {
      item.description = column?.name;
      item.iconPath = new vscode.ThemeIcon(column?.isTerminal ? 'pass-filled' : 'circle-small');
    } else {
      const done = countDone(s, children);
      item.description = children.length ? `${type?.name} · ${done}/${children.length}` : type?.name;
      item.iconPath = new vscode.ThemeIcon('note');
    }
    if (card.archivedAt !== null) item.description = `${type?.name ?? ''} · arquivado em ${column?.name ?? '?'}`;
    item.tooltip = card.description || card.title;
    item.command = { command: 'fazai.openCard', title: 'Abrir card', arguments: [card.id] };
    return item;
  }
}
