---
name: react-page-metadata
description: 'Definir e atualizar título, descrição e metadados das páginas durante navegação SPA; integrar Head/Helmet ou solução existente e evitar valores residuais entre rotas.'
---

# react-page-metadata

Identificação das páginas por título e metadados no navegador.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não promete indexação garantida nem introduz SSR ou infraestrutura. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Cada rota tem proprietário dos metadados e fallback definido; layouts e páginas não devem competir por tags duplicadas.
- Usar mecanismo declarativo suportado pela stack instalada e reutilizar provider existente quando necessário.
- Metadados inseridos no navegador não garantem indexação nem previews de robôs que não executam JavaScript. Não introduzir SSR para prometer esse resultado.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Página apresenta metadados corretos após navegação e atualização.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/components/seo/head.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/seo/head.tsx)
- [apps/react-vite/src/app/provider.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/provider.tsx)
