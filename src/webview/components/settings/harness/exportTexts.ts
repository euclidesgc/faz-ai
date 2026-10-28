import type { FormatLoss, LossCode, RefuseReason } from '../../../../shared/toolExport';
import { t } from '../../../i18n';

/** A frase de cada perda, mapeamento ou "configurar" do formato da ferramenta (`LossCode` + `effect` + `value`). */
export function lossText(loss: FormatLoss): string {
  const value = loss.value ?? '';
  if (loss.effect === 'configure') return t('Configurar na ferramenta: {value}', { value });
  const lost: Partial<Record<LossCode, string>> = {
    tools: t('A restrição de ferramentas não vai para a cópia: o agente herda todas as ferramentas da sessão.'),
    'allowed-tools': t('Esta ferramenta não tem lista de tools por artefato: o campo ({value}) fica fora da cópia.', { value }),
    mcpServers: t('Os servidores MCP do agente não vão para a cópia: ele usa os da sessão.'),
    skills: t('As skills do agente não vão para a cópia.'),
    model: t('O modelo não vai para a cópia: o agente usa o da sessão.'),
    effort: t('O esforço não vai para a cópia.'),
    readonly: t('O modo somente leitura não vai para a cópia.'),
    background: t('A execução em segundo plano não vai para a cópia.'),
    default: t('O agente padrão das instruções não vai para a cópia.'),
    usage: t('O modo (Sempre ou Pelo card) não vai para a cópia: a ferramenta decide pela descrição.'),
    'rule-header': t('O cabeçalho original da regra não vai para a cópia.'),
    'skipped-files': t('Arquivos que ficaram de fora na cópia para o board não vão para a cópia.'),
  };
  const mapped: Partial<Record<LossCode, string>> = {
    'rule-load': t('Entra em toda conversa (o modo "Pelo card" não existe nesta ferramenta).'),
    'rules-merged': t('As regras escolhidas vão juntas num só arquivo e voltam como uma regra só na importação.'),
    'board-tools': t('Para usar com o board conectado, acrescente {value} à lista de ferramentas.', { value: value || 'mcp__faz-ai__*' }),
  };
  const text = (loss.effect === 'lost' ? lost : mapped)[loss.code] ?? lost[loss.code] ?? mapped[loss.code];
  return text ?? t('Diferença no formato: {value}', { value: value || loss.code });
}

/** Por que um artefato ou arquivo não será gravado. */
export function refuseText(reason: RefuseReason): string {
  switch (reason) {
    case 'missing':
      return t('origem ausente na cópia para o board');
    case 'unsupported':
      return t('esta ferramenta não tem esse artefato nesse destino');
    case 'unsafe-name':
      return t('o nome não serve de nome de arquivo ou de pasta');
    case 'unsafe-path':
      return t('um arquivo de apoio tem caminho que sai da pasta da skill');
    case 'outside-root':
      return t('o caminho real sai da pasta da ferramenta');
    case 'symlink':
      return t('o destino é um link simbólico');
    case 'not-file':
      return t('o destino é uma pasta');
    case 'duplicate':
      return t('outro artefato do lote grava o mesmo arquivo');
  }
}

/** O erro do host chega em português: passa por `t()` quando há tradução. */
export function exportError(message: string): string {
  return t(message);
}
