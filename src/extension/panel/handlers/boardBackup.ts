import { importBoard } from '../../db/boardExport';
import type { HandlerMap } from './context';

/** Backup do board: a importação, que substitui o board da pasta pelo arquivo estacionado em `pendingImports`. */
export const boardBackupHandlers = {
  'backup.import.apply': (msg, ctx) => {
    // segunda checagem (a webview desativa o botão): apagar o card em execução deixaria a IA trabalhando no vazio
    if (ctx.aiRuns.length) throw new Error('Espere a execução da IA terminar para importar o board.');
    const file = ctx.pendingImports.get(msg.token);
    if (!file) throw new Error('Importação expirada: escolha o arquivo de novo.');
    const result = importBoard(
      {
        db: ctx.dbHandle.db,
        backup: () => ctx.dbHandle.backup?.(),
        store: ctx.store,
        workspaceKey: ctx.opts.workspaceKey,
        boardId: ctx.boardId,
      },
      file,
    );
    ctx.pendingImports.clear();
    // o arquivo traz o catálogo de modelos: initModels não roda
    ctx.boardId = result.boardId;
    ctx.lastImport = result;
    return true;
  },
} satisfies Partial<HandlerMap>;
