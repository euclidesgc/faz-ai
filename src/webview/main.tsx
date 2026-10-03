import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './appearance';
import { FiltersApp } from './FiltersApp';
import { isWeb } from './vscode';
import './tokens.css';
import './styles.css';

const root = document.getElementById('root')!;
const isFilters = root.dataset.view === 'filters';
if (isFilters) document.body.classList.add('sidebar-view');

if (isWeb) {
  document.body.classList.add('host-web');
  // no navegador um link externo trocaria a página do board: abre em outra aba
  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || link.target || !/^https?:/i.test(link.getAttribute('href') ?? '') || link.origin === location.origin) return;
    e.preventDefault();
    window.open(link.href, '_blank', 'noopener');
  });
}

// a tela "Carregando…" já nasce com tema; a preferência salva chega depois, com o board
applyTheme('system');

createRoot(root).render(<React.StrictMode>{isFilters ? <FiltersApp /> : <App />}</React.StrictMode>);
