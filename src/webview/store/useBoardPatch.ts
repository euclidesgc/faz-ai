import type { WebviewToHost } from '../../shared/messages';
import { useBoardStore } from './boardStore';

/** O que `settings.board.update` aceita: nome, ferramenta, aparência, runner e git, todos parciais. */
export type BoardPatch = Extract<WebviewToHost, { type: 'settings.board.update' }>['patch'];

/** Devolve a função que manda um `settings.board.update` ao host; evita repetir a mensagem em cada tela de configuração. */
export function useBoardPatch(): (patch: BoardPatch) => void {
  const send = useBoardStore((s) => s.send);
  return (patch) => send({ type: 'settings.board.update', patch });
}
