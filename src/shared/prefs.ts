/**
 * Preferências da pessoa que usa o board: valem em qualquer pasta e sobrevivem a fechar o painel,
 * recarregar a janela ou abrir o board pelo navegador. Ficam no host (globalState do editor ou um
 * arquivo, pela CLI), não no estado do webview, que o editor descarta ao fechar o painel.
 */
export interface UiPrefs {
  /** "não avisar novamente" ao ligar o modo autônomo (marcado no checkbox do diálogo de confirmação) */
  dontWarnYolo: boolean;
  /** o nome da coluna escolhida por último em "Até onde" ao ligar o modo autônomo; '' = até o fim */
  yoloUntilName: string;
  /** a pessoa já dispensou o aviso de como usar o Harness ("Entendi, não mostrar de novo") */
  harnessIntroSeen: boolean;
}

export const EMPTY_PREFS: UiPrefs = { dontWarnYolo: false, yoloUntilName: '', harnessIntroSeen: false };
