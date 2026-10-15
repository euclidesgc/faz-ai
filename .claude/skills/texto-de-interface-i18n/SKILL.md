---
name: texto-de-interface-i18n
description: Adiciona ou altera um texto da interface do board em português com a tradução em inglês (t, tn, rich, dt para nomes do board padrão) e faz o teste de i18n passar. Use quando a história mexe em rótulo, botão, mensagem, hint ou nome padrão que a pessoa lê na tela.
---

# Texto de interface com tradução

A interface fala português (Brasil) e inglês. O português é a chave: `t('Novo card')`. Em português
a chave volta como está; em inglês vem do dicionário `src/webview/i18n/en/<área>.ts`. O teste
`test/i18n.test.ts` lê os `.tsx`/`.ts` da webview e barra: texto passado a `t()`, `tn()` ou `rich()`
sem tradução, `{parâmetro}` ou tag diferente entre os idiomas, e a mesma frase traduzida de dois jeitos.

## Arquivos

- `src/webview/i18n/index.ts`: `t`, `tn`, `fill`, `useLocale`; `i18n/rich.tsx`: `rich`.
- `src/webview/i18n/en/`: um arquivo por área (`board.ts`, `card.ts`, `settings.ts`, `harness.ts`,
  `metrics.ts`, `host.ts`, `shared.ts`, `workflows.ts`, `environment.ts`), juntados em `en/index.ts`.
- `src/webview/i18n/en/defaults.ts`: nomes do board padrão (colunas, tipos, campos, opções, agente),
  exibidos por `dt(nome)`.
- `package.nls.json` e `package.nls.pt-br.json`: títulos de comando e configuração do VS Code.
- `test/i18n.test.ts`, `test/i18nHost.test.ts`, `test/ui/defaultNames.test.tsx`.

## Passo a passo

1. Escreva o texto em português no componente, dentro de `t('...')`. Parâmetro: `t('Apagar "{name}"?',
   { name })`. Plural: `tn(n, 'um card', '{n} cards')`. Negrito ou código no meio: `rich('Use <b>isto</b>
   em <code>{pasta}</code>', { pasta })`.
2. Acrescente a tradução no arquivo da área em `en/`, com os mesmos `{parâmetros}` e as mesmas tags.
   Se a frase já existe em outra área, use a mesma tradução.
3. Nunca chame `t()` no nível do módulo: a constante guarda o português e é traduzida onde é usada.
4. Nome do board padrão que aparece como texto (coluna, campo, opção, tipo): exiba com `dt(nome)` e
   traduza em `en/defaults.ts`. Não grave o resultado de `dt` nem o use em caixa de edição; nome
   criado pela pessoa passa sem tradução.
5. Mensagem de erro ou aviso vinda do host (extensão) chega em português e passa por `t()` no toast:
   a tradução vai em `en/host.ts`, com `{parâmetro}` como molde quando o texto varia.
6. Texto de comando ou configuração do VS Code: os dois `package.nls*.json`.
7. Rode `npx vitest run test/i18n.test.ts test/i18nHost.test.ts test/ui/defaultNames.test.tsx` e
   `npm run typecheck`; antes de entregar, `npm test` (o `prettier --check` faz parte).

## O que esta skill nunca faz

- Não traduz dado: título e descrição de card, nome de status editado, instrução de fase, texto que a
  IA lê (MCP, skill do fluxo).
- Não inventa a chave em inglês: a chave é sempre o português.
- Não muda o texto de uma fase do board padrão por aqui; isso é `mudar-board-padrao`.
- Não usa emoji ou símbolo solto como ícone no texto (`test/icons.test.ts` barra); ícone é de
  `components/ui/icons.tsx`.
