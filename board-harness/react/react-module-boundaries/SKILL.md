---
name: react-module-boundaries
description: 'Organizar pastas, features, módulos e camadas; definir imports permitidos, extrair código compartilhado e eliminar ciclos de dependências.'
---

# react-module-boundaries

Organização de features, localização de código e direção de dependências.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define comportamento do negócio ou conteúdo das telas. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Adotar, em projeto novo, imports app → features → compartilhado e app → compartilhado. Features não importam outras features; app faz a composição. Em projeto existente, respeitar o contrato e propor migração explícita.
- Manter código específico dentro da feature; extrair para compartilhado quando a responsabilidade e os consumidores justificarem. Não criar pastas vazias ou uma camada por arquivo.
- Preferir imports diretos na base Vite. Não impor barrels como API universal; avaliar ciclos, encapsulamento e bundle antes de introduzi-los.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Estrutura corresponde ao contrato e refatoração preserva comportamento.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-structure.md)
- [apps/react-vite/.eslintrc.cjs](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/.eslintrc.cjs)
