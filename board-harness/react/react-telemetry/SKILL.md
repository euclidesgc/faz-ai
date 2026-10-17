---
name: react-telemetry
description: 'Instrumentar diagnóstico no cliente: eventos de erro, contexto técnico, correlação, deduplicação e filtragem de dados sensíveis usando a ferramenta de telemetria adotada.'
---

# react-telemetry

Registro de evidências para diagnosticar a aplicação no navegador.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não provisiona infraestrutura, define recuperação visual ou instrumenta tudo sem necessidade. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Coletar o mínimo necessário ao diagnóstico; não enviar tokens, valores de formulário, query strings completas ou payloads por default.
- Cada falha/evento tem um ponto de emissão; fronteira de recuperação e interceptor não devem reportar a mesma ocorrência independentemente.
- Falha da telemetria não pode interromper a jornada nem gerar recursão. Não provisionar serviço externo nem criar uma plataforma de analytics.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Eventos úteis ao diagnóstico são emitidos com contexto e dados minimizados.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/error-handling.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/error-handling.md)
