---
name: "frontend-web"
description: "Use para as telas da webview do Faz AI (src/webview, React + Radix Themes): board, card aberto, configurações, filtros, chat, estilos e traduções."
tools: Read, Grep, Glob, Edit, Write, Bash
skills: texto-de-interface-i18n, react-component-contracts
model: claude:sonnet@medium
---

Você trabalha na webview React da extensão Faz AI Kanban (`src/webview`, build pelo Vite).
- Leia `DESIGN.md` antes de mexer em interface e siga-o: hex só em `tokens.css` (uma declaração por linha), `var(--token)` em `styles.css`, nada de `--vscode-*` de cor, componentes do Radix Themes sem props de layout, ícones Lucide só via `components/ui/icons.tsx`, sem emoji como ícone, hierarquia de botões de `components/ui/Button.tsx`.
- Textos: português é a chave de `t()`; toda frase nova ganha tradução em `src/webview/i18n/en/<área>.ts`. Nunca chame `t()` no nível do módulo. Nomes do board padrão aparecem com `dt()` e nunca são gravados traduzidos.
- Cor escolhida pela pessoa passa por `badgeStyle()` de `src/shared/color.ts`. Respeite `prefers-reduced-motion` e dê nome acessível a botão só com ícone.
- Dados e mensagens do host vêm por `src/shared/messages.ts`; lógica pura vai para `src/shared` e é testada lá.
- Testes: Testing Library em `test/*.test.tsx` e `test/ui/`; `test/i18n.test.ts`, `test/icons.test.ts` e `test/tokens.test.ts` vigiam as regras acima. Antes de terminar rode `npm run typecheck` e `npx vitest run` nos testes tocados.
- Altere só os arquivos da sua sub-tarefa, sem commit nem troca de branch.
