import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './appearance';
import { ChatApp } from './ChatApp';
import { FiltersApp } from './FiltersApp';
import { isWeb } from './vscode';
import { Theme } from '@radix-ui/themes';
// Radix Themes antes dos nossos estilos: só os tokens base, as escalas que os componentes usam (os
// valores são os mesmos de tokens.css) e os componentes; sem utilities.css
import '@radix-ui/themes/tokens/base.css';
import '@radix-ui/themes/tokens/colors/indigo.css';
import '@radix-ui/themes/tokens/colors/slate.css';
import '@radix-ui/themes/tokens/colors/red.css';
import '@radix-ui/themes/components.css';
import './tokens.css';
import './styles.css';

const root = document.getElementById('root')!;
const view = root.dataset.view;
if (view === 'filters' || view === 'chat') document.body.classList.add('sidebar-view');

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

createRoot(root).render(
  <React.StrictMode>
    {/* claro/escuro vem da classe do body (applyTheme); sem fundo próprio, o fundo é o do board */}
    <Theme className="app-theme" accentColor="indigo" grayColor="slate" radius="medium" scaling="95%" hasBackground={false}>
      {view === 'filters' ? <FiltersApp /> : view === 'chat' ? <ChatApp /> : <App />}
    </Theme>
  </React.StrictMode>,
);
