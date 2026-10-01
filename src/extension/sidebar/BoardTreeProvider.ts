import * as vscode from 'vscode';
import type { BoardState, Card, Column } from '../../shared/model';
import type { MessageRouter } from '../panel/messageRouter';

type Node = { kind: 'column'; column: Column } | { kind: 'card'; card: Card };

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
    const live = s.cards.filter((c) => c.deletedAt === null && c.archivedAt === null);
    if (!node) {
      const parentWf = s.workflows.find((w) => w.kind === 'parent');
      return s.columns.filter((c) => c.workflowId === parentWf?.id).sort((a, b) => a.position - b.position).map((column) => ({ kind: 'column', column }));
    }
    if (node.kind === 'column') {
      return live.filter((c) => c.columnId === node.column.id).sort((a, b) => a.position - b.position).map((card) => ({ kind: 'card', card }));
    }
    return live.filter((c) => c.parentId === node.card.id).map((card) => ({ kind: 'card', card }));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const s = this.state!;
    if (node.kind === 'column') {
      const count = s.cards.filter((c) => c.columnId === node.column.id && c.deletedAt === null && c.archivedAt === null).length;
      const item = new vscode.TreeItem(node.column.name, count ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.description = String(count);
      item.iconPath = new vscode.ThemeIcon(node.column.isTerminal ? 'pass' : 'circle-outline');
      return item;
    }
    const { card } = node;
    const children = s.cards.filter((c) => c.parentId === card.id && c.deletedAt === null && c.archivedAt === null);
    const column = s.columns.find((c) => c.id === card.columnId);
    const item = new vscode.TreeItem(card.title, children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    const type = s.cardTypes.find((t) => t.id === card.typeId);
    if (card.parentId) {
      item.description = column?.name;
      item.iconPath = new vscode.ThemeIcon(column?.isTerminal ? 'pass-filled' : 'circle-small');
    } else {
      const done = children.filter((c) => s.columns.find((col) => col.id === c.columnId)?.isTerminal).length;
      item.description = children.length ? `${type?.name} · ${done}/${children.length}` : type?.name;
      item.iconPath = new vscode.ThemeIcon('note');
    }
    item.tooltip = card.description || card.title;
    item.command = { command: 'fazai.openCard', title: 'Abrir card', arguments: [card.id] };
    return item;
  }
}
