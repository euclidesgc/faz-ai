import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { refineHint, workHint } from '../src/webview/components/aiHints';

// Teste unitário simples (sem DOM): garante que a copy de aiHints.tsx não regride silenciosamente
// se alguém editar o arquivo. Renderiza a árvore em markup estático só para inspecionar o texto.

describe('aiHints', () => {
  it('workHint descreve o contexto vazio e o retorno pela conversa', () => {
    const html = renderToStaticMarkup(<>{workHint('Claude')}</>);
    expect(html).toContain('Claude');
    expect(html).toContain('contexto vazio');
    expect(html).toContain('Métricas');
    expect(html).not.toContain('sessão limpa');
  });

  it('refineHint descreve Rules, agente e o checklist, sem mexer no card', () => {
    const html = renderToStaticMarkup(<>{refineHint('Claude')}</>);
    expect(html).toContain('Claude');
    expect(html).toContain('Rules');
    expect(html).toContain('agente');
    expect(html).toContain('checklist');
    expect(html).not.toContain('sessão limpa');
  });
});
