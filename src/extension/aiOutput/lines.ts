// Junta pedaços de `stdout`/`stderr` em linhas completas. Um pipe não respeita fronteira de linha:
// no fluxo real do Claude Code uma linha de evento tem até 20 KB e chega partida em vários pedaços.
// Quem lê depois (os leitores de `aiOutput`) só entende a linha inteira.

/** Teto do que fica guardado esperando uma quebra de linha. */
export const MAX_LINE_BUFFER = 1_000_000;

export interface LineSplitter {
  /** As linhas completas que este pedaço fechou. */
  push(chunk: string): string[];
  /** O resto que ficou no buffer, no fim do processo; esvazia o buffer. */
  flush(): string[];
}

/** Junta pedaços de `stdout` e devolve linhas completas. */
export function lineSplitter(max = MAX_LINE_BUFFER): LineSplitter {
  let buffer = '';

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines: string[] = [];
      let newlineAt = buffer.indexOf('\n');
      while (newlineAt !== -1) {
        // `\r\n` e `\n` dão o mesmo resultado: o `\r` do fim da linha é descartado
        const raw = buffer.slice(0, newlineAt);
        lines.push(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
        buffer = buffer.slice(newlineAt + 1);
        newlineAt = buffer.indexOf('\n');
      }
      // sem isso, uma CLI travada que escreve sem `\n` cresceria na memória do editor sem limite
      if (buffer.length > max) {
        lines.push(buffer);
        buffer = '';
      }
      return lines;
    },
    flush(): string[] {
      if (!buffer) return [];
      const rest = buffer;
      buffer = '';
      return [rest];
    },
  };
}
