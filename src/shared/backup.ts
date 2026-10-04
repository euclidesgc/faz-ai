/** Resumo de um arquivo de export do board, mostrado antes de confirmar a importação. */
export interface ImportSummary {
  boardName: string;
  cards: number;
  attachments: number;
  sizeBytes: number;
  formatVersion: number;
  schemaVersion: number;
  extensionVersion: string;
  exportedAt: string;
  /** arquivo acima do tamanho recomendado (200 MB): aviso, não bloqueio */
  large: boolean;
}

/** Tamanho legível: B, KB ou MB. */
export const formatBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Acima disto o resumo avisa que o arquivo é grande; a importação continua permitida. */
export const LARGE_EXPORT_BYTES = 200 * 1024 * 1024;
