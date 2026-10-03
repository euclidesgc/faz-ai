/** O que a IA está fazendo por um card: nada (`null`), trabalhando nele, ou em sub-tarefas dele. */
export type AiWork = { mode: 'self' } | { mode: 'children'; count: number } | null;

const label = (work: AiWork): string =>
  !work
    ? 'IA parada neste card'
    : work.mode === 'self'
      ? 'IA trabalhando neste card'
      : `IA trabalhando em ${work.count} sub-tarefa${work.count > 1 ? 's' : ''} deste card`;

/**
 * LED da IA, sempre presente na barra do card: aceso e piscando devagar enquanto ela trabalha (no card ou
 * nas sub-tarefas dele), apagado (só o contorno) quando ela terminou. Com movimento reduzido fica aceso, sem piscar.
 */
export function AiLed({ work }: { work: AiWork }) {
  return <span className={`ai-led ${work ? 'on' : ''}`} role="img" aria-label={label(work)} title={label(work)} />;
}
