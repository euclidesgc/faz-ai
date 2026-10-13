import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Popover } from '@radix-ui/themes';
import {
  CHARS_PER_TOKEN,
  estimateContext,
  type ContextEntry,
  type ContextEstimate,
  type ContextGroupId,
} from '../../../shared/contextEstimate';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { dt, t } from '../../i18n';
import { formatCompact, formatNumber, intlLocale } from '../metrics/format';
import { harness } from '../../commands';
import { Button, IconChevronRight } from '../ui';

// o clique no anel e no painel não arrasta, não seleciona nem abre o card
const keep = (e: SyntheticEvent) => e.stopPropagation();

export const GROUP_LABELS: Record<ContextGroupId, string> = {
  mcp: 'Servidores MCP',
  agents: 'Agentes',
  rules: 'Rules',
  skills: 'Skills',
  card: 'Card',
};

/** O que cada linha do detalhe é; as do card não têm nome próprio, e o rótulo é o nome. */
export const ENTRY_LABELS: Record<ContextEntry['kind'], string> = {
  'mcp-names': 'nomes das ferramentas',
  'mcp-instructions': 'instruções do servidor',
  'mcp-definitions': 'definições das ferramentas',
  'mcp-server': 'servidor do board',
  'mcp-allowed': 'liberado pelo agente',
  agent: 'instruções do agente',
  subagent: 'subagente: nome e descrição',
  rule: '',
  skill: '',
  'card-text': 'Título e descrição',
  'card-checklist': 'Checklist',
  'card-comments': 'Conversa',
  'card-phase': 'Instruções e modelo da fase',
  'card-documents': 'Documentos das fases',
};

/** Fração da janela, como "3%"; o que existe e fica abaixo de 0,1% não vira "0%". */
function formatShare(part: number, whole: number): string {
  const share = whole > 0 ? part / whole : 0;
  const percent = (n: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(n);
  return share > 0 && share < 0.001 ? `< ${percent(0.001)}` : percent(share);
}

/** Tokens de uma linha: compacto, "não medido" ou, sob demanda, com um "+" na frente. */
function entryTokens(e: ContextEntry): string {
  if (e.tokens === null) return t('não medido');
  return e.onDemand ? `+${formatCompact(e.tokens)}` : formatCompact(e.tokens);
}

/** Anel de progresso: a fração da janela de contexto que o card ocupa; sem janela conhecida, só o aro. */
function Ring({ share }: { share: number | null }) {
  const r = 6;
  const length = 2 * Math.PI * r;
  return (
    <svg className="context-ring" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="context-ring-track" cx="8" cy="8" r={r} />
      {share !== null && share > 0 && (
        <circle
          className="context-ring-fill"
          cx="8"
          cy="8"
          r={r}
          strokeDasharray={`${Math.min(1, share) * length} ${length}`}
          transform="rotate(-90 8 8)"
        />
      )}
    </svg>
  );
}

/** Resumo de uma frase, para o nome acessível e a dica do botão. */
function summary(e: ContextEstimate): string {
  return e.window
    ? t('Contexto estimado do card: cerca de {tokens} de {window} tokens ({share}). Clique para ver o detalhe.', {
        tokens: formatNumber(e.total),
        window: formatNumber(e.window),
        share: formatShare(e.total, e.window),
      })
    : t('Contexto estimado do card: cerca de {tokens} tokens. Clique para ver o detalhe.', { tokens: formatNumber(e.total) });
}

/**
 * Botão discreto do rodapé do card: um anel com quanto da janela de contexto a execução do card ocupa
 * antes de a IA começar, pelo que está marcado para ele. O clique abre o detalhe por grupo e por item.
 */
export function ContextGauge({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const estimate = useMemo(() => estimateContext(state, card), [state, card]);
  const label = summary(estimate);
  return (
    <Popover.Root>
      <Popover.Trigger>
        <button className="context-gauge" title={label} aria-label={label} onPointerDown={keep} onClick={keep} onDoubleClick={keep}>
          <Ring share={estimate.window ? estimate.total / estimate.window : null} />
          <span>~{formatCompact(estimate.total)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content
        className="context-popover"
        size="1"
        align="end"
        aria-label={t('Contexto estimado')}
        onPointerDown={keep}
        onClick={keep}
        onDoubleClick={keep}
        onKeyDown={keep}
      >
        <ContextDetail estimate={estimate} />
      </Popover.Content>
    </Popover.Root>
  );
}

/** O detalhe, como a janela de contexto das ferramentas de IA: total, barra por grupo e cada item. */
export function ContextDetail({ estimate: e }: { estimate: ContextEstimate }) {
  // sem janela conhecida, a barra divide o próprio total
  const scale = e.window ?? e.total;
  // o que vem do harness (servidores, agentes, rules e skills), para notar quando os arquivos mudaram
  const harnessPart = JSON.stringify(e.groups.filter((g) => g.id !== 'card'));
  const [opened] = useState(harnessPart);
  // um arquivo editado fora do board (uma skill global, no modo navegador) só entra quando o board relê
  // o disco: o detalhe relê ao abrir, e o resultado chega como um estado novo do board
  useEffect(() => harness.refresh(), []);
  const changed = harnessPart !== opened;
  return (
    <div className="context-detail">
      {changed && (
        <p className="context-changed" role="status">
          {t('O harness mudou desde a última leitura: os números já estão atualizados.')}
        </p>
      )}
      <div className="context-head">
        <span className="context-title">{t('Contexto estimado')}</span>
        <span className="context-total">
          {e.window
            ? `~${formatCompact(e.total)} / ${formatCompact(e.window)} (${formatShare(e.total, e.window)})`
            : `~${formatCompact(e.total)} tokens`}
        </span>
      </div>
      <div className="context-model">
        {[
          e.phase ? t('Estimativa da próxima execução, na fase {phase}', { phase: dt(e.phase) }) : t('Estimativa da próxima execução'),
          e.model,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      <div className="context-bar" aria-hidden="true">
        {e.groups.map((g) =>
          g.tokens > 0 && scale > 0 ? (
            <span key={g.id} className={`ctx-${g.id}`} style={{ width: `${(g.tokens / scale) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="context-groups">
        {e.groups.map((g) => (
          <details key={g.id} className="context-group">
            <summary>
              <IconChevronRight />
              <span className={`context-swatch ctx-${g.id}`} />
              <span className="context-name">{t(GROUP_LABELS[g.id])}</span>
              <span className="context-tokens">{formatCompact(g.tokens)}</span>
              <span className="context-share">{e.window ? formatShare(g.tokens, e.window) : ''}</span>
            </summary>
            <ul className="context-entries">
              {g.entries.map((entry, i) => (
                <li key={i} className={entry.onDemand ? 'on-demand' : undefined}>
                  <span className="context-entry">
                    {entry.name && <code>{entry.name}</code>}
                    {ENTRY_LABELS[entry.kind] && <span>{t(ENTRY_LABELS[entry.kind])}</span>}
                    {entry.count !== undefined && <span className="context-count">· {formatNumber(entry.count)}</span>}
                  </span>
                  <span className="context-tokens" title={entry.onDemand ? t('Carrega só quando a IA procura a ferramenta') : undefined}>
                    {entryTokens(entry)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {e.window && (
          <div className="context-group context-free">
            <span />
            <span className="context-swatch" />
            <span className="context-name">{t('Livre')}</span>
            <span className="context-tokens">{formatCompact(Math.max(0, e.window - e.total))}</span>
            <span className="context-share">{formatShare(Math.max(0, e.window - e.total), e.window)}</span>
          </div>
        )}
      </div>
      <div className="context-notes">
        {e.onDemand > 0 && (
          <p>
            {t('Sob demanda: mais {tokens} das definições das ferramentas MCP, carregadas quando a IA procura uma ferramenta.', {
              tokens: formatCompact(e.onDemand),
            })}
          </p>
        )}
        <p>
          {t(
            'É uma estimativa pelo tamanho do texto (cerca de {chars} caracteres por token), não a contagem exata da ferramenta. Acompanha o card: muda com a fase, o agente, a conversa e os documentos.',
            { chars: CHARS_PER_TOKEN },
          )}
        </p>
        <p>{t('Apagar mensagens da conversa diminui só as próximas execuções: o que já foi gasto não volta.')}</p>
        <p>
          {e.tool === 'claude'
            ? t('Fora da conta: o prompt e as ferramentas nativas do Claude Code, e as ferramentas dos servidores liberados pelo agente.')
            : t('Fora da conta: o que o Cursor carrega por conta própria (rules, skills e servidores configurados nele).')}
        </p>
        {!e.window && (
          <p>
            {e.model
              ? t('O board não conhece a janela de contexto de {model}: sem ela, não há porcentagem.', { model: e.model })
              : t('O card não tem modelo: sem a janela de contexto, não há porcentagem.')}
          </p>
        )}
        <Button
          variant="ghost"
          size="small"
          className="context-reread"
          title={t('Relê do disco as rules, as skills e os agentes, para pegar o que foi editado fora do board')}
          onClick={() => harness.refresh()}
        >
          {t('Reler arquivos')}
        </Button>
      </div>
    </div>
  );
}
