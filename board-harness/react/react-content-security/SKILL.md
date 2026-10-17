---
name: react-content-security
description: 'Proteger renderização de conteúdo não confiável e destinos de navegação: HTML, Markdown, XSS, URLs perigosas e redirecionamentos abertos.'
---

# react-content-security

Tratamento seguro de conteúdo e destinos não confiáveis.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não define rotas, armazenamento ou segurança de dependências. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Tratar conteúdo externo como dados. Preferir texto escapado pelo React; não inserir HTML bruto por conveniência.
- Se HTML for necessário, sanitizar a saída final antes do sink com biblioteca mantida e configuração compatível; parsing de Markdown não é sanitização.
- Validar protocolo e origem de URLs segundo finalidade; destino pós-login interno exige política mais restrita que link externo permitido. Regex de prefixo isolada não comprova origem.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Conteúdo malicioso pertinente ao fluxo não ganha capacidade de execução ou destino indevido.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/security.md)
- [apps/react-vite/src/components/ui/md-preview/md-preview.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/components/ui/md-preview/md-preview.tsx)
- [OWASP: DOM XSS](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)
