import { useState } from 'react';
import { useBoardStore } from '../../../store/boardStore';
import { withGlobalWarning } from './text';

/** O que todo destino de gravação tem: o índice da fonte no catálogo, o escopo e o caminho mostrado. */
export interface HarnessTarget {
  source: number;
  scope: 'project' | 'user';
  label: string;
}

export interface SubmitConfirm {
  title: string;
  /** começo da mensagem; o aviso global entra no fim quando o destino é a pasta do usuário */
  message: string;
  confirmLabel: string;
  /** confirma também no projeto (hooks: o comando roda sozinho no computador) */
  always?: boolean;
}

/**
 * Estado comum dos formulários de criação do harness: o destino (começa no primeiro da lista) e o envio,
 * que fecha o formulário e, no destino global, só acontece depois da confirmação. Não há reset: quem
 * abriu o formulário o desmonta ao fechar, e os campos somem com ele.
 */
export function useTargetForm<T extends HarnessTarget>(targets: readonly T[], onClose: () => void) {
  const ask = useBoardStore((s) => s.ask);
  const [source, setSource] = useState(targets[0]!.source);
  const target = targets.find((t) => t.source === source)!;
  const submit = (send: () => void, confirm: SubmitConfirm) => {
    const run = () => {
      send();
      onClose();
    };
    if (confirm.always || target.scope === 'user')
      ask({
        title: confirm.title,
        message: withGlobalWarning(confirm.message, target.scope),
        confirmLabel: confirm.confirmLabel,
        onConfirm: run,
      });
    else run();
  };
  return { source, setSource, target, submit };
}
