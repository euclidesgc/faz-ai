# Agente ACP como perfil pronto do catálogo (#1095)

> História 3 da épica [Conectar ferramenta por ACP](epica-conectar-ferramenta-por-acp.md).
> Entregue em 2026-10-23, depois da 5 (`#1094`).

## Contexto

Até aqui um agente ACP só existia no board como perfil personalizado: a pessoa criava o perfil,
digitava o id do agente no campo **Agente ACP** e escolhia um nome. O catálogo (`acp/agents.ts`) já
tinha nove agentes com comando, página e modo de login, mas nada na tela os mostrava. A forma de uso
que a épica quer é a ferramenta aparecer em Ferramentas de IA e a pessoa só ligar.

Os perfis prontos de hoje (`kind: 'builtin'`) carregam regras das três CLIs de uma passada: a base é
uma `AiBase`, o provider vem de um registro por base, o comando é o `CLI_COMMAND` da base, não há
configuração nem admissão estrita, e a linha no banco é semeada em toda criação de board.

## Decisão

- **Um `kind` novo, `acp`**, para o perfil pronto de um agente ACP: `base: 'generic'`,
  `config: { acpAgent, installUrl }` vindos do código (`ACP_READY_AGENTS` em `shared/aiProfiles.ts`,
  conferido pelo teste contra `ACP_AGENTS`). Ele entra em `BUILTIN_PROFILES`, então vale o que já vale
  para os prontos: não é editado nem apagado, o id é reservado em `newProfileId`, a configuração
  resolvida é a do catálogo e nunca vem do cofre. Nos caminhos de execução ele segue o personalizado:
  `validateProfile` aceita `acp` com `generic` e `acpAgent`, o provider é o genérico (o gateway troca
  pelo transporte ACP) e a admissão estrita é exigida como para todo perfil que não é CLI pronta.
  `isCatalogProfile` é o predicado "pronto, de qualquer tipo", usado onde a regra era `builtin` por
  ser "vem do código" (sonda, PATH, tela).
- **Quais agentes**: os do catálogo cujo id não é de uma CLI pronta: Gemini CLI, Codex, OpenCode,
  GitHub Copilot CLI, Qwen Code, goose e Google Antigravity. Cursor e Kimi Code ficam nas CLIs de uma
  passada, que medem tokens (a entrada ACP deles segue no catálogo para a história 7); o Claude segue
  pela CLI `claude`. O id do perfil é o id do agente, e é a ferramenta do catálogo de modelos.
- **Desligado por padrão e sem migração**: o perfil aparece na lista (`AiProfileRepo.list` completa
  os prontos ausentes) e a linha no banco nasce quando a pessoa liga (`ensureCatalogRow`). A semente
  de board novo grava só as três CLIs. Assim o backup e a lista de revisão da importação não ganham
  sete perfis que ninguém usa, e boards antigos não passam por migração.
- **Duplicar** um agente pronto cria um perfil personalizado com `acpAgent` e `installUrl` (não uma
  cópia, cujo `catalogTool` seria a base): o id novo é outra ferramenta do catálogo de modelos.
- **Sonda**: a versão roda com `--version` no comando do agente; o login devolve "não verificado"
  (`null`), porque o agente pronto não tem comando de status e o `authMethods` é a história 4.
  O link **Instalar** é a página oficial (`installUrl` do catálogo, `https`).

## Alternativas descartadas

- **`kind: 'builtin'` com `base: 'generic'`**: cada ponto que lê `builtin` como "CLI de uma passada,
  sem configuração nem admissão" precisaria de uma exceção; o `kind` novo faz os caminhos de execução
  caírem no lado do personalizado sem exceção.
- **Migração que grava as sete linhas em todo board**: encheria o backup e a importação; a linha só
  interessa quando a pessoa liga.
- **Ligar por padrão o agente instalado**: a faixa de requisitos passaria a avisar de login de
  ferramentas que a pessoa não escolheu; ligar é a escolha dela.

## Consequências

- Ferramentas de IA lista dez perfis; os sete agentes vêm desligados, com o selo **Agente ACP**.
- A história 4 (Conectar) ganha onde morar: o botão vai no perfil pronto, e a leitura de modelos da
  `#1094` já funciona nele.
- Um perfil personalizado antigo com `acpAgent: 'gemini'` continua válido e separado do pronto
  `gemini` (ids diferentes, catálogos de modelos diferentes).
