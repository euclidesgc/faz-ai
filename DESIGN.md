# Design System do board

O board do Faz AI Kanban usa uma paleta própria, igual no editor e no navegador, em claro e escuro.
Ele não herda mais as cores do tema do VS Code. O objetivo é que qualquer tela fique legível em
qualquer combinação de tema do editor e tema do board, e que isso seja verificado por teste, não a
olho.

## As três camadas

1. **Primitivos** (`src/webview/tokens.css`): cores da escala Radix Colors, com nome e passo
   (`--slate-1` a `--slate-12`, `--indigo-9`, `--red-11`, `--amber-3`, `--green-11`...). Cada
   primitivo tem um valor por tema, definido em `body[data-theme=light]` e `body[data-theme=dark]`.
   Só os passos usados existem no arquivo.
2. **Semânticos** (mesmo arquivo): nomes por função (`--bg`, `--fg`, `--accent`...), que apontam
   para um primitivo em cada tema. Alguns valem igual nos dois temas e ficam no `body`
   (`--btn-fg`, `--btn-bg-hover`, `--danger-bg`, `--danger-fg`, `--warn-solid-fg`, `--overlay`).
3. **Componentes** (`src/webview/styles.css`): só consomem semânticos e escalas via `var(--token)`.
   Nunca usam primitivo nem hex.

## Tokens semânticos

| Token                                          | Quando usar                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `--bg`                                         | fundo da página                                                     |
| `--col-bg`                                     | fundo das colunas e de áreas rebaixadas                             |
| `--card-bg`                                    | cards, menus, modais, painéis flutuantes                            |
| `--hover`                                      | fundo de item sob o mouse ou selecionado em lista                   |
| `--code-bg`                                    | fundo de código e nomes de arquivo                                  |
| `--badge-bg` / `--badge-fg`                    | selos neutros (contadores, rótulos fixos)                           |
| `--overlay`                                    | véu atrás de modais                                                 |
| `--fg`                                         | texto principal                                                     |
| `--muted`                                      | texto secundário, metadados, placeholders                           |
| `--link`                                       | links                                                               |
| `--border`                                     | bordas decorativas (separadores, contorno de cards)                 |
| `--border-strong`                              | contorno de controles e barras de rolagem; precisa de contraste 3:1 |
| `--input-bg` / `--input-fg` / `--input-border` | campos de texto, selects, textareas                                 |
| `--accent`                                     | anel de foco, item selecionado, checkbox e radio (`accent-color`)   |
| `--btn-bg` / `--btn-fg` / `--btn-bg-hover`     | botão primário (indigo nos dois temas)                              |
| `--btn2-bg` / `--btn2-fg` / `--btn2-bg-hover`  | botão secundário                                                    |
| `--error` / `--error-bg`                       | texto e fundo de mensagem de erro                                   |
| `--danger-bg` / `--danger-fg`                  | botão destrutivo (excluir, descartar)                               |
| `--warn-bg` / `--warn-border`                  | caixa de aviso                                                      |
| `--warn-solid` / `--warn-solid-fg`             | selo de aviso preenchido                                            |
| `--success`                                    | texto de confirmação                                                |
| `--shadow-color`, `--shadow-1/2/3`             | sombra de cards, menus e modais, do mais leve ao mais alto          |
| `--focus-ring`                                 | `outline` de foco pelo teclado (`2px solid var(--accent)`)          |

## Escalas

- **Espaçamento**: `--sp-2`, `--sp-4`, `--sp-6`, `--sp-8`, `--sp-12`, `--sp-16`, `--sp-20`,
  `--sp-24`. O nome é o valor em px.
- **Raio**: `--radius-sm` 4px (selos, chips), `--radius` 6px (botões, campos, cards),
  `--radius-lg` 10px (modais, painéis), `--radius-pill` (pílulas).
- **Tipografia**: `--fs-micro` 10px (rótulos em maiúsculas), `--fs-xs` 11px (selos e metadados),
  `--fs-sm` 12px (rótulos e texto de apoio), `--fs-md` 13px (texto base), `--fs-h` 14px (títulos de
  seção), `--fs-lg` 15px (título da tela), `--fs-xl` 18px (título do card aberto). Famílias:
  `--font-ui` para tudo e `--font-mono` para código e nomes de arquivo. A mono não usa a fonte do
  editor do VS Code: quando ela não existe no webview, o navegador cai numa serifada.

## Regras

- Hex literal só em `tokens.css`. Em `styles.css` tudo é `var(--token)`.
- Nenhuma variável `--vscode-*` de cor. As únicas permitidas são `--vscode-font-family` e
  `--vscode-editor-font-family`, que são fonte, não cor.
- Hover nunca por `filter: brightness`. Use o token `*-hover` ou `--hover`.
- Cor escolhida pelo usuário (status e tipo de card) passa sempre por `badgeStyle()` de
  `src/shared/color.ts`, que escolhe texto preto ou branco pela luminância WCAG do fundo.
- A barra do card usa a cor do tipo via `badgeStyle()`. O que fica sobre ela (ID, botões, LED da
  IA) usa `currentColor`, para herdar o preto ou branco escolhido pelo contraste. Uma cor fixa
  (um LED verde, por exemplo) some sobre um tipo da mesma cor.
- Animação contínua (o LED da IA) para com `prefers-reduced-motion`: o LED fica aceso, sem piscar.
- `tokens.css` tem uma declaração por linha, porque `test/tokens.test.ts` faz parse do arquivo.

## Ícones

- A interface usa [Lucide](https://lucide.dev), sempre por `src/webview/components/ui/icons.tsx`.
  Esse arquivo é um mapa semântico (`IconOpen`, `IconTrash`, `IconAi`...) e é o único que importa
  de `lucide-react`; trocar um ícone ali troca em todo o board.
- O ícone tem `1em` e `currentColor`: segue o tamanho e a cor do texto em volta. Para mudar o
  tamanho, mude o `font-size` do elemento pai.
- O ícone é decorativo (`aria-hidden`). Botão só com ícone precisa de `title` ou `aria-label`, que
  vira o nome acessível.
- Nada de emoji ou símbolo solto (✕ ⋯ ▾ ↗ 🗑...) como ícone. Setas em frases (→ ↑ ↓) são texto e
  podem ficar. `test/icons.test.ts` verifica as duas regras.
- Para um ícone novo: escolha no site do Lucide, importe em `icons.tsx` e exporte com um nome que
  diga o que ele significa no board, não o desenho.

## Como adicionar uma cor

1. Escolha o passo na escala Radix (1-2 fundos, 3-5 fundos de componente, 6-8 bordas, 9-10
   sólidos, 11 texto de baixo contraste, 12 texto). Copie o hex dos dois temas do site do Radix.
2. Declare o primitivo em `body[data-theme=light]` e em `body[data-theme=dark]`.
3. Crie o semântico nos dois temas apontando para o primitivo. Não use o primitivo em `styles.css`.
4. Adicione o par (texto/fundo ou controle/fundo) em `test/tokens.test.ts` para o contraste ser
   verificado nos dois temas.

## Como o tema é resolvido

- O `body` sempre tem `data-theme="light"` ou `data-theme="dark"`. Antes do JS definir o atributo, o
  fundo fica transparente para não pintar por cima do host.
- A preferência em Configurações > Aparência (e no botão no topo do board) é **Sistema**, **Claro**
  ou **Escuro**.
- **Sistema** no VS Code olha só se o tema do editor é claro ou escuro (classes `vscode-light`,
  `vscode-dark`, `vscode-high-contrast`, `vscode-high-contrast-light`) e aplica a paleta do board.
  No navegador, segue o claro ou escuro do sistema operacional (`prefers-color-scheme`).
- Temas de alto contraste do VS Code usam o claro ou o escuro do board com `--border` igual a
  `--border-strong`.

## Contraste

`test/tokens.test.ts` lê `tokens.css` e verifica, nos dois temas: texto sobre fundo >= 4.5:1;
contorno de controles, foco e `--border-strong` sobre fundo >= 3:1. O mesmo teste barra em
`styles.css` qualquer `--vscode-*` de cor, `filter: brightness` e hex literal.

Isenções: `--border` é decorativa e não precisa de 3:1 (em alto contraste ela vira a forte); estados
desabilitados não precisam atingir 4.5:1.

## Crédito

Paleta de [Radix Colors](https://github.com/radix-ui/colors), licença MIT. Os valores hex foram
copiados para `tokens.css`; não há dependência de pacote.

Ícones de [Lucide](https://lucide.dev), licença ISC. Entram no pacote só os ícones importados em
`icons.tsx`.
