# Catálogo React para o board

Biblioteca de 32 skills para React + Vite SPA. Cada pasta `react-*` é uma unidade instalável com `SKILL.md` e três referências de modo. Nomes em inglês; descrições e instruções em português para seleção por assunto no board.

## Atribuir a uma etapa

Escolha a entrega técnica e seu responsável na tabela. Registre o modo na descrição da etapa; o modo é uma instrução para o agente, não um novo campo exigido do board.

```text
Entrega: sincronizar filtros e paginação com a URL.
Skill: react-url-state
Modo: implementar
Entradas: spec aprovada, parser de filtros, contrato da consulta e arquivos afetados.
Saída: controles/URL/histórico consistentes; preservar parâmetros não alterados.
Verificação: compartilhar URL, recarregar e voltar/avançar.
```

Use mais de uma skill quando a entrega exigir responsabilidades distintas; não crie automaticamente uma subtarefa para cada skill. Reaproveite decisões da spec nas etapas seguintes. Discovery/Spec/Plan pertencem ao fluxo do board; estas skills fornecem o conhecimento técnico, sem duplicar o processo.

O agente lê o `SKILL.md` atribuído e apenas a referência do modo usado. Os arquivos de catálogo, avaliação e modelo são recursos de manutenção/adoção, não contexto obrigatório de implementação. Regras transversais estáveis e objetivo do produto pertencem ao AGENTS.md da aplicação.

## Responsabilidades

| Skill                                                               | Entrega sob sua responsabilidade                                               | Limite                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [react-module-boundaries](react-module-boundaries/SKILL.md)         | Organização de features, localização de código e direção de dependências.      | Não define comportamento do negócio ou conteúdo das telas.                                        |
| [react-tooling](react-tooling/SKILL.md)                             | Configuração coerente das ferramentas locais de desenvolvimento e verificação. | Não define variáveis de produto, vulnerabilidades de pacotes ou CI/CD.                            |
| [react-env-config](react-env-config/SKILL.md)                       | Contrato de configuração da aplicação por ambiente.                            | Não configura hosting nem transporte HTTP.                                                        |
| [react-app-lifecycle](react-app-lifecycle/SKILL.md)                 | Composição da raiz React, providers e duração das instâncias da aplicação.     | Não define chaves de cache, regras de sessão ou efeitos específicos de uma feature.               |
| [react-routing](react-routing/SKILL.md)                             | Correspondência entre URLs, rotas e transições de navegação.                   | Não define filtros na query string nem decisões de autorização.                                   |
| [react-url-state](react-url-state/SKILL.md)                         | Representação de estado navegável na URL e no histórico.                       | Não configura a árvore de rotas nem a política de cache remoto.                                   |
| [react-business-rules](react-business-rules/SKILL.md)               | Invariantes, cálculos e transições de negócio executados no frontend.          | Não define DTOs externos, políticas de acesso ou persistência do backend.                         |
| [react-component-contracts](react-component-contracts/SKILL.md)     | API e composição dos componentes de interface.                                 | Não define tokens visuais, experiência completa da página ou procedimento de auditoria acessível. |
| [react-styling](react-styling/SKILL.md)                             | Apresentação visual consistente e responsiva.                                  | Não redefine contratos dos componentes ou regras de negócio.                                      |
| [react-accessibility](react-accessibility/SKILL.md)                 | Semântica e interação acessível dos fluxos e componentes.                      | Não altera a regra do produto ou estabelece o design visual completo.                             |
| [react-page-composition](react-page-composition/SKILL.md)           | Composição de uma página com recursos e contratos existentes.                  | Não reimplementa consultas, validação, políticas de acesso ou componentes básicos.                |
| [react-ui-state](react-ui-state/SKILL.md)                           | Propriedade e sincronização do estado visual no cliente.                       | Não define estado remoto, de formulário, de URL ou de sessão.                                     |
| [react-api-contracts](react-api-contracts/SKILL.md)                 | Formato e validação dos dados na fronteira com serviços externos.              | Não implementa backend, cliente HTTP ou ciclo de cache.                                           |
| [react-http-client](react-http-client/SKILL.md)                     | Execução de requisições e representação das respostas/falhas de transporte.    | Não define DTOs, políticas de login, retry de queries ou cache.                                   |
| [react-query-cache](react-query-cache/SKILL.md)                     | Leitura, identificação e validade dos dados remotos em cache.                  | Não define operação de escrita ou contratos HTTP; publica as chaves usadas pela invalidação.      |
| [react-mutations](react-mutations/SKILL.md)                         | Escrita remota e atualização dos dados afetados no cliente.                    | Não redefine chaves de consulta, formato do endpoint ou campos do formulário.                     |
| [react-forms](react-forms/SKILL.md)                                 | Ciclo de preenchimento, validação e submissão de formulários.                  | Não redefine invariantes de negócio, DTOs ou invalidação de cache.                                |
| [react-auth-session](react-auth-session/SKILL.md)                   | Identidade e ciclo da sessão consumida pelo frontend.                          | Não emite tokens nem define papéis e permissões do produto.                                       |
| [react-access-policies](react-access-policies/SKILL.md)             | Decisões de acesso da interface a ações e recursos.                            | Não autentica usuários nem substitui a autorização do serviço externo.                            |
| [react-content-security](react-content-security/SKILL.md)           | Tratamento seguro de conteúdo e destinos não confiáveis.                       | Não define rotas, armazenamento ou segurança de dependências.                                     |
| [react-browser-data-security](react-browser-data-security/SKILL.md) | Proteção dos dados e das fronteiras de confiança no navegador.                 | Não emite cookies HttpOnly, configura headers do servidor ou redefine o ciclo de sessão.          |
| [react-dependency-security](react-dependency-security/SKILL.md)     | Risco de segurança dos pacotes consumidos pela aplicação web.                  | Não configura CI/CD nem substitui a responsabilidade de compatibilidade das ferramentas.          |
| [react-error-recovery](react-error-recovery/SKILL.md)               | Contenção, apresentação e recuperação de falhas na interface.                  | Não define retry de query nem coleta e envio de telemetria.                                       |
| [react-telemetry](react-telemetry/SKILL.md)                         | Registro de evidências para diagnosticar a aplicação no navegador.             | Não provisiona infraestrutura, define recuperação visual ou instrumenta tudo sem necessidade.     |
| [react-unit-tests](react-unit-tests/SKILL.md)                       | Evidência isolada de regras, cálculos e unidades relevantes.                   | Não testa jornada completa nem exige teste para toda função.                                      |
| [react-integration-tests](react-integration-tests/SKILL.md)         | Evidência do comportamento de componentes e features integrados.               | Não define os handlers compartilhados de rede nem toda jornada no navegador.                      |
| [react-e2e-tests](react-e2e-tests/SKILL.md)                         | Evidência das jornadas da aplicação em um navegador real.                      | Não exige backend real nem substitui toda verificação por E2E.                                    |
| [react-api-mocks](react-api-mocks/SKILL.md)                         | Respostas e cenários de rede simulados para desenvolvimento e testes.          | Não implementa backend de produção nem escreve os asserts da feature.                             |
| [react-load-performance](react-load-performance/SKILL.md)           | Custo e tempo de carregamento da aplicação e seus recursos.                    | Não altera semântica do cache ou implementa otimização especulativa.                              |
| [react-render-performance](react-render-performance/SKILL.md)       | Custo das atualizações e renderizações da interface.                           | Não redefine propriedade do estado sem respeitar seu contrato.                                    |
| [react-i18n](react-i18n/SKILL.md)                                   | Mensagens e apresentação de valores conforme idioma e localidade.              | Não calcula regras de negócio nem define metadados das páginas.                                   |
| [react-page-metadata](react-page-metadata/SKILL.md)                 | Identificação das páginas por título e metadados no navegador.                 | Não promete indexação garantida nem introduz SSR ou infraestrutura.                               |

## Adotar sem alterar regras existentes

Esta pasta é a fonte canônica da biblioteca. Aponte a importação de skills do Harness para ela ou distribua as pastas `react-*` pelo mecanismo suportado pelo agente. Marque no Harness as skills que o board poderá atribuir. Não copie apenas os SKILL.md: as referências relativas fazem parte da skill. Não criar um SKILL.md na raiz do catálogo, pois isso transformaria toda a biblioteca em uma skill abrangente.

A criação dos arquivos não instala as skills no Codex/Claude e não marca seleções do Harness. A descoberta no ambiente de destino deve ser conferida após importação. Preserve uma fonte canônica para evitar cópias divergentes; nenhuma configuração de descoberta do produto foi modificada por esta biblioteca.

Use [templates/AGENTS.md.template](templates/AGENTS.md.template) para preencher o contrato de uma aplicação nova. Em aplicação existente, reconcilie as decisões com as instruções vigentes; não substitua AGENTS.md/CLAUDE.md automaticamente. O modelo não é instrução ativa e campos pendentes não são decisões de arquitetura.

`catalog.json` oferece nomes, caminhos, descrições, limites e procedência para ferramentas; não introduz uma integração automática no board. Fontes fixadas e complementações estão registradas por skill. As versões efetivas pertencem ao projeto consumidor.

## Verificar a biblioteca

```sh
python3 board-harness/react/scripts/validate_catalog.py
node board-harness/react/scripts/check_board_selection.cjs
```

O primeiro comando valida estrutura/links/cobertura dos casos sem dependências adicionais. O segundo executa o matcher real deste repositório e informa sugestões por palavras; requer o TypeScript já instalado no projeto. Ranking lexical não é avaliação semântica nem prova que a skill deve ser excluída de toda tarefa próxima.

Veja [evaluations/PROTOCOL.md](evaluations/PROTOCOL.md) para avaliação comportamental e integrada. Os 160 casos são definições de cenários, não resultados aprovados de execução por agentes. Não anunciar economia de tokens com base apenas na quantidade de pastas ou bytes.
