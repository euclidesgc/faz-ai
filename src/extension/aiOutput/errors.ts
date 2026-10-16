// Erros de domínio de por que uma execução não foi medida (skill error-handling: classe com type
// guard, nunca comparação de `message`/`name`). O `message` de cada classe é, ao pé da letra, a
// frase em português que vai para o canal de log do editor — sem nome de campo da CLI, sem nome de
// argumento, sem stack: quem lê o canal é a pessoa, não um depurador.

/** Por que a execução não foi medida. O `message` é a frase que a pessoa lê no canal de log. */
export abstract class MeasureError extends Error {}

/** A versão instalada da CLI recusou o argumento da saída estruturada. */
export class MeasureRefusedError extends MeasureError {
  constructor(toolLabel: string) {
    super(
      `A medição não foi possível nesta execução: a versão instalada do ${toolLabel} não aceita a saída estruturada. O trabalho rodou em modo texto.`,
    );
    this.name = 'MeasureRefusedError';
  }
}

/**
 * O que a pessoa precisa saber quando a execução caiu antes do primeiro evento e não foi repetida: a
 * CLI pode ter alterado arquivos ou chamado o board antes de cair. O executor de cards e o chat
 * acrescentam esta frase à mensagem de erro.
 */
export const NOT_REPEATED =
  'A execução não foi repetida e pode ter feito parte do trabalho (arquivos alterados, mensagens ou cards movidos): confira o que ficou feito antes de chamar de novo.';

/**
 * A execução no modo estruturado terminou com erro antes do primeiro evento, sem recusa comprovada do
 * argumento do formato (rede, autenticação, cota, queda, saída desconhecida): não foi repetida,
 * porque pode ter trabalhado, e o consumo fica desconhecido.
 */
export class MeasureEndedError extends MeasureError {
  constructor() {
    super(`A medição não foi possível nesta execução: a execução terminou com erro antes de informar o consumo. ${NOT_REPEATED}`);
    this.name = 'MeasureEndedError';
  }
}

/** A CLI aceitou o argumento da saída estruturada, mas respondeu em texto e saiu bem. */
export class MeasureIgnoredError extends MeasureError {
  constructor(toolLabel: string) {
    super(
      `A medição não foi possível nesta execução: o ${toolLabel} respondeu em texto em vez da saída estruturada. A resposta foi guardada como texto.`,
    );
    this.name = 'MeasureIgnoredError';
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
