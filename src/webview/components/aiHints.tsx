import type { ReactNode } from 'react';
import { rich } from '../i18n/rich';

// Copy dos hints ricos de "Trabalhar na fase" e "Refinar com IA" (ver src/webview/components/ui/Hint.tsx
// para o mecanismo). Funções puras, sem JSX de layout além da estrutura de parágrafo + lista, reaproveitadas
// nos três pontos de uso (StatusBar.tsx x2, CommentsTab.tsx) para garantir texto idêntico.

function hint(intro: string, items: string[], params: Record<string, ReactNode>): ReactNode {
  return (
    <>
      <p>{rich(intro, params)}</p>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{rich(item, params)}</li>
        ))}
      </ul>
    </>
  );
}

export const workHint = (tool: string): ReactNode =>
  hint(
    'Roda o {tool} em segundo plano para fazer o trabalho da fase em que o card está.',
    [
      'Parte de <b>contexto vazio</b>: só entram as rules e skills marcadas no Harness e o agente do card (ou o padrão do board).',
      'Ao terminar, passa a vez — pede revisão, pergunta ou move o card — sem acompanhamento ao vivo; a resposta chega na conversa.',
      'O consumo fica registrado em Métricas.',
    ],
    { tool },
  );

export const refineHint = (tool: string): ReactNode =>
  hint(
    'O {tool} deixa o card claro e completo, sem tocar em código nem mover o card.',
    [
      'Reescreve título e descrição.',
      'Preenche Tags, Esforço, Modelo, Skills, <b>Rules</b> e o <b>agente</b> — só o que está marcado no Harness.',
      'Sugere o checklist.',
    ],
    { tool },
  );

export const summarizeHint = (): ReactNode => (
  <p>{rich('A IA lê toda a conversa e escreve um resumo com decisões, observações e pendências.')}</p>
);
