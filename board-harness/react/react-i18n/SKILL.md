---
name: react-i18n
description: 'Gerir internacionalização: catálogos, traduções, pluralização, interpolação, fallback, idioma e formatação localizada de datas, números e moedas.'
---

# react-i18n

Mensagens e apresentação de valores conforme idioma e localidade.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não calcula regras de negócio nem define metadados das páginas. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Respeitar tecnologia, chave canônica e localidades do projeto. Não internacionalizar aplicação monolíngue sem requisito.
- Tradução não altera regra de cálculo nem unidade do domínio. Formatar valor para exibição e preservar representação canônica para cálculos/API.
- Evitar concatenação de frases traduzidas; plural, ordem de palavras, timezone e fallback precisam ser previstos quando relevantes.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Mensagens e valores respeitam as localidades contratadas.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/utils/format.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/utils/format.ts)
- [MDN: Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
