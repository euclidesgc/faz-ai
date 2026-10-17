---
name: react-access-policies
description: 'Definir autorização da interface: permissões, papéis, propriedade do recurso, políticas de acesso a ações e comportamento de acesso negado ou resposta 403.'
---

# react-access-policies

Decisões de acesso da interface a ações e recursos.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não autentica usuários nem substitui a autorização do serviço externo. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Centralizar decisões de acesso em políticas com identidade/recurso explícitos; consumidores não espalham comparações de papel.
- Estado desconhecido não deve permitir ação protegida. Separar ausência de sessão, dados de política ainda carregando e acesso negado.
- Política no cliente orienta a interface; serviço externo precisa autorizar toda operação. Não tratar botão oculto ou rota guardada como barreira de segurança.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Interface aplica as políticas sem alegar garantir a proteção efetiva do servidor.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/security.md)
- [apps/react-vite/src/lib/authorization.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/lib/authorization.tsx)
