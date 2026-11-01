---
name: react-api-contracts
description: 'Definir contratos de dados externos: DTOs, payloads, schemas de validação runtime, normalização e mapeamento entre API e domínio do frontend.'
---

# react-api-contracts

Formato e validação dos dados na fronteira com serviços externos.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não implementa backend, cliente HTTP ou ciclo de cache. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Tipo TypeScript não valida JSON recebido. Escolher e explicitar a fronteira de validação runtime conforme risco/contrato, sem duplicar parsing em toda camada.
- Distinguir ausência, null, vazio, datas/unidades e identificadores; não usar cast para ocultar incompatibilidade.
- Contratos vêm do serviço existente ou de spec acordada; não inventar endpoint nem implementar servidor para satisfazer a interface.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Casos válidos e incompatibilidades relevantes são demonstráveis.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/api-layer.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/api-layer.md)
- [apps/react-vite/src/types/api.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/types/api.ts)
- [apps/react-vite/src/features/discussions/api/create-discussion.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/api/create-discussion.ts)
