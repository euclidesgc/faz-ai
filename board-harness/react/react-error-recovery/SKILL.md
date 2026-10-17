---
name: react-error-recovery
description: 'Conter falhas e recuperar a interface: error boundaries, fallbacks, mensagens acionáveis, notificações e reset de seções quebradas; evitar erros engolidos ou duplicados.'
---

# react-error-recovery

Contenção, apresentação e recuperação de falhas na interface.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define retry de query nem coleta e envio de telemetria. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Distinguir falha de render, erro de evento/Promise e falha de requisição. Error boundary não captura automaticamente todos os erros assíncronos.
- Escolher contenção pela independência da seção e recuperação possível. Reset deve remover a causa ou refazer a operação apropriada, não entrar em loop.
- Uma falha tem um responsável pelo feedback; não notificar no interceptor, mutation e página simultaneamente. Nunca apresentar stack/payload sensível ao usuário.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Falhas relevantes têm comportamento recuperável ou mensagem acionável.

## Procedência

Princípios e exemplo Vite do Bulletproof; bibliotecas e defaults do exemplo não são exigências universais. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/error-handling.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/error-handling.md)
- [apps/react-vite/src/components/errors/main.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/errors/main.tsx)
- [apps/react-vite/src/app/provider.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/app/provider.tsx)
