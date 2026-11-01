---
name: react-browser-data-security
description: 'Avaliar exposição e retenção de dados no navegador: storage, cache persistido, segredos no bundle, telemetria sensível, postMessage e integração de proteção CSRF existente.'
---

# react-browser-data-security

Proteção dos dados e das fronteiras de confiança no navegador.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não emite cookies HttpOnly, configura headers do servidor ou redefine o ciclo de sessão. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Código/bundle e armazenamento acessível por JavaScript não são cofres de segredos. Não usar criptografia com chave embarcada como proteção contra scripts da mesma origem.
- Minimizar dados armazenados e transmitidos, com finalidade, escopo e remoção definidos; não registrar credenciais nem payload sensível em diagnóstico.
- Quando houver postMessage, validar origem exata e schema; validar source quando a janela esperada for conhecida. Enviar à origem explícita apropriada.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Dados têm exposição justificada e limites de proteção do frontend são explícitos.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/security.md)
- [apps/react-vite/src/config/env.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/config/env.ts)
- [OWASP: dados e mensagens no navegador](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
