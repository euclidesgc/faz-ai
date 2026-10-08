import type { RunReport } from '../../shared/log';
import type { OutputReader, OutputStream } from './reader';

/**
 * O leitor do modo texto: uma linha de entrada é uma linha de saída, e nada é medido. É o
 * comportamento de hoje (o `.filter(Boolean)` que o executor já fazia na saída do processo), agora
 * com nome, para que o caminho sem medição não seja um `if` espalhado pelo executor. Não "melhore"
 * o que ele faz.
 */
export function textReader(): OutputReader {
  // tudo que passou por stdout, inclusive linha vazia (ela separa parágrafos na resposta do chat;
  // descartá-la aqui amassaria a resposta)
  const stdoutLines: string[] = [];

  return {
    push(line: string, stream: OutputStream): string[] {
      // o stderr é aviso de gente, não resposta da IA: entra no canal de log mas nunca no `answer`
      // (hoje o chat junta os dois canais e um aviso apareceria como se fosse parte da resposta)
      if (stream === 'stdout') stdoutLines.push(line);
      return line ? [line] : [];
    },
    report(): RunReport {
      return {
        measure: 'none',
        consumption: null,
        inventory: [],
        answer: stdoutLines.join('\n'),
        // o leitor de texto não sabe POR QUE a execução caiu para texto — quem sabe é o transporte
        // (passo 6), que preenche isto com a frase do erro de domínio (MeasureRefusedError e
        // companhia). Não complete este campo aqui.
        reason: null,
      };
    },
    sawEvent: true,
  };
}
