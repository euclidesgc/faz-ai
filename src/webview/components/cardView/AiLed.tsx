const LABEL = 'IA trabalhando neste card';

/** LED que pisca devagar na barra do card enquanto a IA trabalha nele (fica aceso, sem piscar, com movimento reduzido). */
export function AiLed() {
  return <span className="ai-led" role="img" aria-label={LABEL} title={LABEL} />;
}
