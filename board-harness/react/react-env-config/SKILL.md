---
name: react-env-config
description: 'Definir variáveis de ambiente, configuração pública, defaults e validação de valores no Vite; diagnosticar configuração ausente ou inválida.'
---

# react-env-config

Contrato de configuração da aplicação por ambiente.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não configura hosting nem transporte HTTP. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Centralizar leitura e conversão de valores externos em configuração tipada. String "false" não pode virar true por coerção genérica.
- Tudo que o Vite expõe ao código cliente pode aparecer no bundle; prefixos públicos não protegem segredos. Não incluir credenciais privadas nem valores sensíveis em exemplos/diagnósticos.
- Distinguir modo Vite, NODE_ENV e configuração em runtime; não prometer mudar um valor já embutido sem novo build.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Configuração inválida tem diagnóstico e valores públicos são explicitamente identificados.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [apps/react-vite/src/config/env.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/config/env.ts)
- [Vite: ambiente e modos](https://vite.dev/guide/env-and-mode)
