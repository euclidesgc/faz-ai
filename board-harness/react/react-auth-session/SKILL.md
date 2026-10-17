---
name: react-auth-session
description: 'Gerir autenticação e sessão no frontend: restauração da identidade, login, logout, expiração, estados anônimo/autenticado e limpeza de dados vinculados ao usuário.'
---

# react-auth-session

Identidade e ciclo da sessão consumida pelo frontend.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não emite tokens nem define papéis e permissões do produto. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Distinguir sessão desconhecida/carregando, autenticada, anônima e falha de restauração; falha de rede não equivale automaticamente a logout.
- Consumir o protocolo existente. Não inventar refresh nem armazenar tokens em localStorage como default; o exemplo Vite não implementa renovação automática.
- Troca de identidade encerra trabalho e dados privados da sessão anterior; resposta atrasada não pode repopular o cache após logout.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Sessão tem transições explícitas e logout remove os dados pertinentes.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/security.md)
- [apps/react-vite/src/lib/auth.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/lib/auth.tsx)
- [apps/react-vite/src/lib/api-client.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/lib/api-client.ts)
