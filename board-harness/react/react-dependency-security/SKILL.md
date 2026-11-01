---
name: react-dependency-security
description: 'Avaliar segurança de dependências diretas e transitivas: avisos de vulnerabilidade, exposição real, versão corrigida, substituição pontual e risco de adoção de pacotes.'
---

# react-dependency-security

Risco de segurança dos pacotes consumidos pela aplicação web.

## Contexto e limite

Leia o contrato aplicável (AGENTS.md e instruções locais), a entrega e os consumidores afetados. Confira versões e preserve decisões existentes; explicite hipótese mínima quando faltar contrato.

Não configura CI/CD nem substitui a responsabilidade de compatibilidade das ferramentas. Backend, CI/CD e deploy ficam fora deste catálogo React + Vite SPA.

## Regras essenciais

- Usar lockfile e aviso oficial atual para identificar versão instalada, cadeia de dependência e condições de exploração; severidade isolada não prova impacto local.
- Não executar audit fix --force nem atualizar toda a árvore para resolver um achado pontual.
- Ferramentas e comandos de auditoria podem consultar serviços externos; seguir permissões do ambiente e não enviar código ou segredos. Dependência de desenvolvimento também pode afetar a cadeia local.

## Modo

Escolha pelo pedido e leia **somente** a referência necessária; não carregue os três modos por padrão.

- **Projetar** — [projetar.md](references/projetar.md): decisões, contratos e critérios; sem implementar por um pedido apenas de desenho.
- **Implementar** — [implementar.md](references/implementar.md): criação, correção, refatoração ou atualização autorizada no escopo.
- **Revisar** — [revisar.md](references/revisar.md): diagnóstico e achados; sem editar por um pedido apenas de revisão.

Se a etapa envolver outra responsabilidade, consuma seu contrato aprovado; registre a dependência ausente em vez de inventar decisões. Não carregue outras skills apenas por afinidade temática.

## Critério de saída

Achados têm impacto explicado e correções têm evidência; limitações ficam registradas.

## Procedência

Recorte/complementação deste catálogo; não atribuir os controles adicionais integralmente ao Bulletproof. Links para conferência quando houver dúvida de versão ou evidência; não são leituras obrigatórias em toda execução. Complementos oficiais, quando listados, consultados em 17/10/2026.

- [npm: auditoria de dependências](https://docs.npmjs.com/cli/commands/npm-audit/)
