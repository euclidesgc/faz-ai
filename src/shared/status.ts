/** Status de trabalho do card: diz em que pé está e com quem está a pendência (a pessoa ou a IA). */

export type CardStatus = 'ready' | 'running' | 'waiting_answer' | 'waiting_review' | 'approved' | 'blocked';
export type StatusOwner = 'ai' | 'human';

/** Os estados são fixos (o servidor aplica regras sobre eles); rótulo e cor são ajustáveis em Aparência. */
export const CARD_STATUSES: { id: CardStatus; label: string; color: string; owner: StatusOwner; hint: string }[] = [
  { id: 'ready', label: 'Pronto', color: '#4c8dff', owner: 'ai', hint: 'A IA pode trabalhar no card' },
  { id: 'running', label: 'Em execução', color: '#9b59b6', owner: 'ai', hint: 'Uma sessão de IA está trabalhando no card' },
  { id: 'waiting_answer', label: 'Aguardando resposta', color: '#f5a623', owner: 'human', hint: 'A IA fez uma pergunta na conversa' },
  {
    id: 'waiting_review',
    label: 'Aguardando revisão',
    color: '#f5a623',
    owner: 'human',
    hint: 'O trabalho da fase está pronto para ser revisado',
  },
  { id: 'approved', label: 'Aprovado', color: '#2ecc71', owner: 'ai', hint: 'A IA deve mover o card para a próxima coluna' },
  { id: 'blocked', label: 'Bloqueado', color: '#e5484d', owner: 'human', hint: 'Há um impedimento' },
];

export const ALL_CARD_STATUSES: CardStatus[] = CARD_STATUSES.map((s) => s.id);
export const isCardStatus = (v: unknown): v is CardStatus => ALL_CARD_STATUSES.includes(v as CardStatus);
export const statusInfo = (id: CardStatus) => CARD_STATUSES.find((s) => s.id === id)!;
export const OWNER_LABEL: Record<StatusOwner, string> = { ai: 'com a IA', human: 'com você' };

export type StatusStyles = Record<CardStatus, { label: string; color: string }>;

export const DEFAULT_STATUS_STYLES = Object.fromEntries(
  CARD_STATUSES.map((s) => [s.id, { label: s.label, color: s.color }]),
) as StatusStyles;

/** Rótulos e cores salvos, completando com os padrões o que faltar ou for inválido. */
export function parseStatusStyles(raw: unknown): StatusStyles {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, { label?: unknown; color?: unknown } | undefined>) : {};
  return Object.fromEntries(
    CARD_STATUSES.map((s) => {
      const v = saved[s.id];
      const label = typeof v?.label === 'string' && v.label.trim() ? v.label.trim() : s.label;
      const color = typeof v?.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : s.color;
      return [s.id, { label, color }];
    }),
  ) as StatusStyles;
}
