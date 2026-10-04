// Erros de domínio de por que uma execução não foi medida (skill error-handling: classe com type
// guard, nunca comparação de `message`/`name`). O `message` de cada classe é, ao pé da letra, a
// frase em português que vai para o canal de log do editor — sem nome de campo da CLI, sem nome de
// argumento, sem stack: quem lê o canal é a pessoa, não um depurador.

/** Por que a execução não foi medida. O `message` é a frase que a pessoa lê no canal de log. */
export abstract class MeasureError extends Error {}

/** A ferramenta não produz saída estruturada quando roda em segundo plano (o Copilot, hoje). */
export class MeasureUnsupportedError extends MeasureError {
  constructor(toolLabel: string) {
    super(
      `A medição não foi possível nesta execução: o ${toolLabel} não produz saída estruturada quando roda em segundo plano. O trabalho rodou normalmente.`,
    );
    this.name = 'MeasureUnsupportedError';
  }
}

/** A versão instalada da CLI recusou o argumento da saída estruturada. */
export class MeasureRefusedError extends MeasureError {
  constructor(toolLabel: string) {
    super(
      `A medição não foi possível nesta execução: a versão instalada do ${toolLabel} não aceita a saída estruturada. O trabalho rodou em modo texto.`,
    );
    this.name = 'MeasureRefusedError';
  }
}

/** A saída estruturada veio, mas sem o consumo legível (versão nova mudou o formato, fluxo truncado). */
export class MeasureBrokenError extends MeasureError {
  constructor(toolLabel: string) {
    super(
      `A medição não foi possível nesta execução: a saída estruturada do ${toolLabel} não trouxe o consumo. O trabalho rodou normalmente.`,
    );
    this.name = 'MeasureBrokenError';
  }
}

/** Type guard do erro de domínio: nunca comparar `e.name` nem `e.message` como string. */
export function isMeasureError(e: unknown): e is MeasureError {
  return e instanceof MeasureError;
}
