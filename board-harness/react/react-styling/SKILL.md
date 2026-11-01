---
name: react-styling
description: 'Aplicar design visual, tokens, temas, variantes e layout responsivo; corrigir estilos, overflow, contraste visual e consistência entre tamanhos de tela.'
---

# react-styling

Apresentação visual consistente e responsiva.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não redefine contratos dos componentes ou regras de negócio. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Usar o design e a tecnologia de estilos já adotados. Tokens semânticos do projeto prevalecem sobre valores copiados do exemplo.
- Cobrir estados de interação e conteúdo variável; responsividade não se resume a uma captura de desktop.
- Não corrigir layout escondendo conteúdo essencial, removendo foco visível ou usando ordem visual incompatível com a leitura.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Estados visuais e layouts respeitam o design e os tamanhos contratados.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/components-and-styling.md)
- [apps/react-vite/src/components/ui/button/button.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/button/button.tsx)
