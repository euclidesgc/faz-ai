---
name: react-forms
description: 'Construir formulários: campos, valores iniciais, validação, erros por campo, submissão, dirty state, dependências e reset; integrar contratos de negócio e mutations existentes.'
---

# react-forms

Ciclo de preenchimento, validação e submissão de formulários.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não redefine invariantes de negócio, DTOs ou invalidação de cache. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- O formulário controla rascunho/validação/envio; regra de negócio, DTO e reconciliação remota vêm dos contratos responsáveis.
- Definir quando defaults são aplicados. Refetch ou mudança de props não pode apagar edição em curso sem decisão de produto.
- Preservar valores após rejeição recuperável; associar mensagens aos campos e distinguir erro de campo de falha geral.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Entradas válidas/inválidas e rejeições remotas têm resultado definido.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/state-management.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md)
- [apps/react-vite/src/components/ui/form/form.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/form/form.tsx)
- [apps/react-vite/src/features/auth/components/register-form.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/auth/components/register-form.tsx)
