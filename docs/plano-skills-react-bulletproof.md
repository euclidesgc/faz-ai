# Plano de skills para aplicações React com Vite baseado no Bulletproof React

Status: biblioteca inicial criada em `board-harness/react`, com 32 skills e referências por modo; estrutura e descoberta pelo board verificadas. Avaliações comportamentais e integradas ainda pendentes. Nenhuma skill foi instalada e nenhum contrato ativo do projeto foi alterado.
Data da análise: 17/10/2026.
Fonte examinada: [alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react), commit [`9506629ed003a561c6627735480cce4994244bb4`](https://github.com/alan2207/bulletproof-react/tree/9506629ed003a561c6627735480cce4994244bb4).

## 1. Objetivo e escopo

Construir um catálogo reutilizável de skills capaz de orientar o projeto, a implementação e a revisão de um frontend React durante sua criação, evolução, correção, refatoração e diagnóstico no navegador.

Cada skill terá uma responsabilidade técnica principal. Projetar, implementar e revisar serão três modos da mesma skill, com entradas e resultados distintos. O catálogo contém **32 skills**, com três modos por skill e atribuição por etapa do board. A divisão será confirmada por avaliações de uso; o número não é uma restrição arquitetural.

A base única é a aplicação **React + Vite**, executada no navegador como SPA. O catálogo cobre o frontend e o consumo de serviços existentes. Next.js, SSR, componentes de servidor, implementação de backend, banco de dados, CI/CD, deploy, hosting e infraestrutura ficam fora do escopo. Contratos de serviços são consumidos pelo frontend; não incluem implementar seus endpoints. Aplicações com pagamentos, colaboração em tempo real, offline, mapas, mídia ou outras capacidades particulares exigirão extensões quando essas necessidades existirem.

O conhecimento será baseado nos princípios do Bulletproof, sem impor as versões de bibliotecas da aplicação de exemplo. A stack efetiva e as versões suportadas pertencem ao contrato de cada aplicação.

## 2. Análise do repositório

A análise inicial examinou a documentação e as três aplicações do repositório. Para este plano revisado, as evidências adotadas são os documentos pertinentes ao frontend e os arquivos de `apps/react-vite`, incluindo configuração local, lint, ambiente e testes. As demais aplicações e os workflows de CI não integram a base de autoria.

### 2.1. Princípios observados na aplicação Vite

- Organização por features; código compartilhado separado de código específico.
- Composição entre features na camada de aplicação.
- Dependências permitidas: `app -> features -> compartilhado`, além de `app -> compartilhado`. A seta significa “pode importar”.
- Restrições entre features e contra ciclos verificadas por ESLint.
- Configuração compartilhada de cliente de API e de cache de dados.
- Estado classificado em componente, aplicação, servidor, formulário e URL.
- Componentes por composição, abstrações a partir de repetição e recursos próximos de seus consumidores.
- Testes de comportamento, com destaque para integração, mocks de rede e jornadas E2E.
- Recuperação de falhas em partes da aplicação e acompanhamento de erros.

### 2.2. Base única: React + Vite

| Área | Referência adotada |
| --- | --- |
| Entrada e providers | `apps/react-vite/src/main.tsx`, `src/app/index.tsx`, `src/app/provider.tsx` |
| Rotas | `src/app/router.tsx`, `src/app/routes/**` e `src/config/paths.ts` |
| Dados remotos | Fetchers, hooks TanStack Query, prefetch e loaders no cliente |
| Comunicação | Cliente Axios compartilhado e consumo de serviços existentes |
| Metadados | Componente Head e Helmet no navegador |
| Execução local | Servidor de desenvolvimento, build e preview Vite |

As referências de código usam `apps/react-vite` como raiz quando o caminho começa em `src/`. O catálogo não terá adaptadores ou referências para outros frameworks. APIs externas podem ser simuladas por MSW para desenvolvimento e avaliação, sem implementar um backend.

### 2.3. Limites da fonte

O Bulletproof é um guia opinativo e um exemplo, não uma especificação exaustiva. Algumas orientações de segurança e o AGENTS.md do exemplo não substituem a inspeção do código e a documentação atual das ferramentas.

Exemplo: o AGENTS.md do upstream menciona renovação automática de token, mas o interceptor Axios inspecionado redireciona em 401 e não implementa esse fluxo. Não transformar essa menção em uma capacidade comprovada ou em uma regra universal.

As skills deverão diferenciar: princípio extraído da fonte; escolha da aplicação de exemplo; convenção adotada pelo projeto; complementação proposta neste catálogo.

## 3. Contrato comum em AGENTS.md

**AGENTS.md será a fonte canônica das decisões transversais de cada aplicação.** A biblioteca de skills terá um modelo desse arquivo, e cada projeto terá sua instância preenchida. Não colocar o objetivo de um produto específico dentro das skills reutilizáveis.

Conteúdo planejado:

1. Objetivo do produto, usuários, jornadas principais e limites do escopo.
2. Stack React + Vite, versões relevantes, gerenciador de pacotes e comandos locais reais.
3. Mapa sucinto das pastas, responsabilidade de cada área e localização dos testes.
4. Direção de dependências, isolamento das features e critérios para extrair código compartilhado.
5. Convenções comuns: nomes, imports, tipagem, idioma, contratos e comportamento acessível.
6. Matriz de propriedade: qual skill define cada decisão e quais skills apenas a consomem.
7. Resumo da classificação do estado e dos limites entre código no navegador e serviços externos.
8. Comandos e critérios mínimos de verificação proporcionais à mudança.
9. Regras transversais de segurança: exposição de configuração no bundle, tratamento de conteúdo não confiável e proteção de dados locais.
10. Links para decisões, contratos e guias específicos, com indicação de quando consultá-los.

O arquivo deve conter decisões estáveis que precisam ser conhecidas em qualquer tarefa. Procedimentos extensos e exemplos ficam nas skills; documentação detalhada de produto e decisões ficam em `docs/`, referenciadas pelo contrato.

Não duplicar uma regra inteira em AGENTS.md e em várias skills. No contrato, registrar a decisão e seu responsável; na skill, manter o procedimento para aplicá-la. Mudanças de arquitetura atualizam o contrato explicitamente, preservando escolhas do usuário e instruções de maior prioridade.

Para Claude Code, validar o carregamento do contrato. Como a leitura de AGENTS.md depende da versão e da presença de CLAUDE.md, a opção de compatibilidade é um CLAUDE.md que importe `@AGENTS.md`, preservando somente instruções específicas do Claude fora da fonte comum. No repositório atual já existe um CLAUDE.md: sua migração seria uma tarefa posterior, sem substituição automática neste planejamento.

Regras verificáveis por ferramentas devem ganhar enforcement em lint, tipos ou verificações locais quando viável. A instrução em Markdown não substitui esse enforcement.

## 4. Catálogo e responsabilidades

### Critério de granularidade e nomes

A unidade é uma entrega técnica delimitada, atribuível a uma etapa e verificável separadamente. Cada nome descreve a responsabilidade mantida durante projeto, implementação e revisão. Evitar nomes que sugiram uma ação pontual ou uma fase do board. Usar inglês, prefixo `react-`, palavras em minúsculas separadas por hífen e o menor nome que preserve a clareza da responsabilidade. Preferir termos estabelecidos como `app-lifecycle`, `routing` e `query-cache`; abreviações somente quando amplamente reconhecidas, como `api`, `http`, `e2e` e `i18n`. As descrições em português devem manter os termos usados nos pedidos do board para apoiar a seleção por palavras; não depender apenas do nome em inglês.

Por exemplo, `react-app-lifecycle` cobre entrada, composição de providers e duração das instâncias; não se limita à primeira inicialização. `react-query-cache` distingue leitura remota de escrita, e `react-access-policies` distingue acesso de autenticação.

As 17 áreas anteriores foram refinadas em 32 responsabilidades. Não dividir por biblioteca, hook ou arquivo. Mais skills só são úteis quando reduzem conteúdo carregado e ambiguidade sem duplicar regras. A granularidade da skill não obriga criar uma subtarefa para cada skill.

Legenda: **D** = documentação; **C** = código/configuração; **E** = complemento proposto. Caminhos de código relativos usam `apps/react-vite` como raiz; nomes de documentos referem-se a `docs/` do upstream.

### 01 — react-module-boundaries

**Responsabilidade:** Organização de features, localização de código e direção de dependências.

- Projetar: Definir fronteiras e critérios de compartilhamento.
- Implementar: Organizar ou extrair módulos e restringir imports.
- Revisar: Identificar ciclos, imports proibidos e divergências do mapa de pastas.
- Limite: Não define comportamento do negócio ou conteúdo das telas.
- Aceitação: Estrutura corresponde ao contrato e refatoração preserva comportamento.
- Fonte D/C: project-structure.md e .eslintrc.cjs.

### 02 — react-tooling

**Responsabilidade:** Configuração coerente das ferramentas locais de desenvolvimento e verificação.

- Projetar: Definir TypeScript, Vite, aliases, lint, formatação e comandos.
- Implementar: Configurar instalação, desenvolvimento, build e preview locais.
- Revisar: Conferir comandos, resolução de imports e compatibilidade de versões.
- Limite: Não define variáveis de produto, vulnerabilidades de pacotes ou CI/CD.
- Aceitação: Comandos locais funcionam e ferramentas resolvem os mesmos caminhos.
- Fonte D/C: project-standards.md, package.json, tsconfig e vite.config.ts.

### 03 — react-env-config

**Responsabilidade:** Contrato de configuração da aplicação por ambiente.

- Projetar: Definir variáveis, valores padrão e exposição permitida no Vite.
- Implementar: Centralizar leitura e validação de configuração.
- Revisar: Conferir variáveis ausentes, inválidas ou indevidamente expostas.
- Limite: Não configura hosting nem transporte HTTP.
- Aceitação: Configuração inválida tem diagnóstico e valores públicos são explicitamente identificados.
- Fonte C: src/config/env.ts.

### 04 — react-app-lifecycle

**Responsabilidade:** Composição da raiz React, providers e duração das instâncias da aplicação.

- Projetar: Definir entrada, ordem de providers e escopo de serviços.
- Implementar: Integrar providers, preparação assíncrona e limpeza de recursos globais.
- Revisar: Conferir remontagens, recriação de serviços e recursos sem limpeza.
- Limite: Não define chaves de cache, regras de sessão ou efeitos específicos de uma feature.
- Aceitação: Instâncias têm duração correta e a raiz funciona em montagem e remontagem.
- Fonte C: src/main.tsx, src/app/index.tsx e src/app/provider.tsx.

### 05 — react-routing

**Responsabilidade:** Correspondência entre URLs, rotas e transições de navegação.

- Projetar: Definir caminhos, parâmetros de rota, links e destinos.
- Implementar: Configurar roteador, rotas aninhadas e integração de guards/loaders.
- Revisar: Conferir acesso direto, rotas desconhecidas e navegação.
- Limite: Não define filtros na query string nem decisões de autorização.
- Aceitação: Caminhos válidos chegam à página correta e destinos inválidos têm resultado definido.
- Fonte C: src/app/router.tsx e src/config/paths.ts.

### 06 — react-url-state

**Responsabilidade:** Representação de estado navegável na URL e no histórico.

- Projetar: Definir serialização, valores padrão e parâmetros de filtros/paginação.
- Implementar: Sincronizar query strings e comportamento de voltar/avançar.
- Revisar: Conferir URLs inválidas, recarga e compartilhamento de estado.
- Limite: Não configura a árvore de rotas nem a política de cache remoto.
- Aceitação: Compartilhar/recarregar a URL reproduz o estado esperado e o histórico funciona.
- Fonte D/C: state-management.md e discussions-list.tsx.

### 07 — react-business-rules

**Responsabilidade:** Invariantes, cálculos e transições de negócio executados no frontend.

- Projetar: Definir vocabulário e transições a partir dos requisitos.
- Implementar: Implementar funções e contratos de domínio próximos da feature.
- Revisar: Conferir contradições, duplicações e mudanças silenciosas de regras.
- Limite: Não define DTOs externos, políticas de acesso ou persistência do backend.
- Aceitação: Regras têm exemplos verificáveis e comportamento anterior é preservado quando exigido.
- Fonte C/E: application-overview.md, features e types/api.ts; recorte formal proposto.

### 08 — react-component-contracts

**Responsabilidade:** API e composição dos componentes de interface.

- Projetar: Definir props, eventos, slots e limites de reutilização.
- Implementar: Implementar componentes e wrappers com contratos explícitos.
- Revisar: Conferir acoplamento, excesso de props e abstração prematura.
- Limite: Não define tokens visuais, experiência completa da página ou procedimento de auditoria acessível.
- Aceitação: Componente cumpre contrato e componentes compartilhados não importam features.
- Fonte D/C: components-and-styling.md e src/components/ui.

### 09 — react-styling

**Responsabilidade:** Apresentação visual consistente e responsiva.

- Projetar: Definir uso dos tokens, variantes e comportamento responsivo.
- Implementar: Aplicar estilos, temas e organização visual conforme o design existente.
- Revisar: Conferir divergências visuais, duplicação e quebra em tamanhos relevantes.
- Limite: Não redefine contratos dos componentes ou regras de negócio.
- Aceitação: Estados visuais e layouts respeitam o design e os tamanhos contratados.
- Fonte D/C/E: components-and-styling.md, styles e Tailwind; tokens dependem do projeto.

### 10 — react-accessibility

**Responsabilidade:** Semântica e interação acessível dos fluxos e componentes.

- Projetar: Definir nomes acessíveis, teclado, foco e anúncios necessários.
- Implementar: Aplicar semântica, interações e gestão de foco adequadas.
- Revisar: Avaliar teclado, leitura assistiva e problemas detectáveis por ferramentas.
- Limite: Não altera a regra do produto ou estabelece o design visual completo.
- Aceitação: Fluxo pode ser operado por teclado e controles têm semântica e identificação adequadas.
- Fonte C/E: componentes Radix, jsx-a11y e stories; completar com fontes oficiais.

### 11 — react-page-composition

**Responsabilidade:** Composição de uma página com recursos e contratos existentes.

- Projetar: Definir hierarquia e estados de carregamento, vazio, sucesso e falha.
- Implementar: Combinar features na camada app e conectar ações de página.
- Revisar: Conferir jornada, integração e estados ausentes.
- Limite: Não reimplementa consultas, validação, políticas de acesso ou componentes básicos.
- Aceitação: Página tem resultados definidos para os estados pertinentes e usa os contratos aprovados.
- Fonte D/C: project-structure.md e src/app/routes.

### 12 — react-ui-state

**Responsabilidade:** Propriedade e sincronização do estado visual no cliente.

- Projetar: Definir estado local/compartilhado, derivações e vida útil.
- Implementar: Implementar hooks, reducers, stores, seletores e efeitos necessários.
- Revisar: Conferir fontes de verdade duplicadas e sincronização circular.
- Limite: Não define estado remoto, de formulário, de URL ou de sessão.
- Aceitação: Estado tem proprietário e reset/limpeza no momento correto.
- Fonte D/C: state-management.md, use-disclosure e notifications-store.

### 13 — react-api-contracts

**Responsabilidade:** Formato e validação dos dados na fronteira com serviços externos.

- Projetar: Definir DTOs, schemas e mapeamentos de entrada/saída.
- Implementar: Implementar contratos e transformações sem acoplá-los à interface.
- Revisar: Conferir divergências de payload e confiança indevida em tipos estáticos.
- Limite: Não implementa backend, cliente HTTP ou ciclo de cache.
- Aceitação: Casos válidos e incompatibilidades relevantes são demonstráveis.
- Fonte D/C: api-layer.md, types/api.ts e schemas nas features.

### 14 — react-http-client

**Responsabilidade:** Execução de requisições e representação das respostas/falhas de transporte.

- Projetar: Definir cliente compartilhado, credenciais e cancelamento.
- Implementar: Implementar fetchers, serialização HTTP e interceptors conforme contratos existentes.
- Revisar: Conferir headers, tratamento de respostas e preservação das falhas.
- Limite: Não define DTOs, políticas de login, retry de queries ou cache.
- Aceitação: Fetchers são reutilizáveis e respostas/falhas preservam informação útil aos consumidores.
- Fonte D/C: api-layer.md e src/lib/api-client.ts.

### 15 — react-query-cache

**Responsabilidade:** Leitura, identificação e validade dos dados remotos em cache.

- Projetar: Definir chaves, escopo, validade, paginação e prefetch.
- Implementar: Implementar queries e integração de leitura com loaders.
- Revisar: Conferir chaves incompletas, mistura de contextos e leituras redundantes.
- Limite: Não define operação de escrita ou contratos HTTP; publica as chaves usadas pela invalidação.
- Aceitação: Leituras e paginação são consistentes e isoladas pelo contexto necessário.
- Fonte D/C: state-management.md, get-discussions.ts e lib/react-query.ts.

### 16 — react-mutations

**Responsabilidade:** Escrita remota e atualização dos dados afetados no cliente.

- Projetar: Definir efeitos da escrita, invalidação e eventual atualização otimista.
- Implementar: Implementar mutations, reconciliação e rollback quando necessário.
- Revisar: Conferir leitura após escrita, falhas e atualizações concorrentes.
- Limite: Não redefine chaves de consulta, formato do endpoint ou campos do formulário.
- Aceitação: Escrita bem-sucedida atualiza os consumidores e falhas não deixam estado incorreto.
- Fonte D/C: api-layer.md e create-discussion.ts.

### 17 — react-forms

**Responsabilidade:** Ciclo de preenchimento, validação e submissão de formulários.

- Projetar: Definir campos, defaults, dependências e mensagens.
- Implementar: Integrar schemas, valores, erros remotos, reset e envio em curso.
- Revisar: Conferir perda de valores, validações divergentes e submissão duplicada.
- Limite: Não redefine invariantes de negócio, DTOs ou invalidação de cache.
- Aceitação: Entradas válidas/inválidas e rejeições remotas têm resultado definido.
- Fonte D/C: Form State, componentes Form e formulários das features.

### 18 — react-auth-session

**Responsabilidade:** Identidade e ciclo da sessão consumida pelo frontend.

- Projetar: Definir estados de sessão e integração com o serviço de identidade existente.
- Implementar: Implementar login/logout, recuperação e expiração conforme contrato.
- Revisar: Conferir sessão obsoleta e limpeza dos dados vinculados à identidade.
- Limite: Não emite tokens nem define papéis e permissões do produto.
- Aceitação: Sessão tem transições explícitas e logout remove os dados pertinentes.
- Fonte D/C: security.md e src/lib/auth.tsx.

### 19 — react-access-policies

**Responsabilidade:** Decisões de acesso da interface a ações e recursos.

- Projetar: Definir papéis, políticas por recurso e comportamento de acesso negado.
- Implementar: Implementar políticas e integrar seu resultado aos consumidores.
- Revisar: Conferir combinações de papel/propriedade e tratamento de 403.
- Limite: Não autentica usuários nem substitui a autorização do serviço externo.
- Aceitação: Interface aplica as políticas sem alegar garantir a proteção efetiva do servidor.
- Fonte D/C: security.md e src/lib/authorization.tsx.

### 20 — react-content-security

**Responsabilidade:** Tratamento seguro de conteúdo e destinos não confiáveis.

- Projetar: Identificar pontos de renderização e uso de HTML, Markdown e URLs.
- Implementar: Sanitizar conteúdo nos pontos necessários e validar destinos.
- Revisar: Conferir XSS, protocolos perigosos e redirecionamentos indevidos.
- Limite: Não define rotas, armazenamento ou segurança de dependências.
- Aceitação: Conteúdo malicioso pertinente ao fluxo não ganha capacidade de execução ou destino indevido.
- Fonte D/C/E: security.md e MDPreview/DOMPurify; complementar com fontes oficiais.

### 21 — react-browser-data-security

**Responsabilidade:** Proteção dos dados e das fronteiras de confiança no navegador.

- Projetar: Definir exposição, retenção e armazenamento seguros; avaliar mensagens entre janelas quando presentes.
- Implementar: Aplicar proteção a dados locais e integrar controles externos como CSRF quando contratados.
- Revisar: Conferir segredos no bundle, dados sensíveis na telemetria e validação de mensagens/origens.
- Limite: Não emite cookies HttpOnly, configura headers do servidor ou redefine o ciclo de sessão.
- Aceitação: Dados têm exposição justificada e limites de proteção do frontend são explícitos.
- Fonte D/C/E: security.md, configuração e auth; complementar controles do navegador.

### 22 — react-dependency-security

**Responsabilidade:** Risco de segurança dos pacotes consumidos pela aplicação web.

- Projetar: Avaliar adoção de pacotes e exposição relevante ao uso real.
- Implementar: Aplicar correções/substituições pontuais com compatibilidade verificada.
- Revisar: Conferir vulnerabilidades, dependências transitivas e alcance da correção.
- Limite: Não configura CI/CD nem substitui a responsabilidade de compatibilidade das ferramentas.
- Aceitação: Achados têm impacto explicado e correções têm evidência; limitações ficam registradas.
- Fonte E: complemento do catálogo; usar documentação e avisos oficiais atuais.

### 23 — react-error-recovery

**Responsabilidade:** Contenção, apresentação e recuperação de falhas na interface.

- Projetar: Definir boundaries, fallbacks, notificações e caminhos de recuperação.
- Implementar: Integrar tratamento local/global sem duplicar notificações.
- Revisar: Conferir erros engolidos, seção indisponível e recuperação impossível.
- Limite: Não define retry de query nem coleta e envio de telemetria.
- Aceitação: Falhas relevantes têm comportamento recuperável ou mensagem acionável.
- Fonte D/C: error-handling.md, boundaries e interceptor.

### 24 — react-telemetry

**Responsabilidade:** Registro de evidências para diagnosticar a aplicação no navegador.

- Projetar: Definir eventos, contexto e filtragem de dados sensíveis.
- Implementar: Integrar instrumentação com ferramenta já configurada.
- Revisar: Conferir duplicação, contexto ausente e exposição de dados.
- Limite: Não provisiona infraestrutura, define recuperação visual ou instrumenta tudo sem necessidade.
- Aceitação: Eventos úteis ao diagnóstico são emitidos com contexto e dados minimizados.
- Fonte D/E: error-handling.md; implementação depende da ferramenta adotada.

### 25 — react-unit-tests

**Responsabilidade:** Evidência isolada de regras, cálculos e unidades relevantes.

- Projetar: Escolher casos e limites que merecem teste isolado.
- Implementar: Escrever testes de comportamento das unidades.
- Revisar: Conferir asserts frágeis, redundância e lacunas.
- Limite: Não testa jornada completa nem exige teste para toda função.
- Aceitação: Testes detectam regressão e toleram refatoração equivalente.
- Fonte D/C: testing.md e testes de hooks/utilitários.

### 26 — react-integration-tests

**Responsabilidade:** Evidência do comportamento de componentes e features integrados.

- Projetar: Definir cenários e fronteiras reais da integração.
- Implementar: Testar interação com providers e contratos de rede pertinentes.
- Revisar: Conferir mocks excessivos, isolamento e comportamento observado.
- Limite: Não define os handlers compartilhados de rede nem toda jornada no navegador.
- Aceitação: Integração detecta incompatibilidades relevantes entre suas partes.
- Fonte D/C: testing.md, testing/test-utils.tsx e testes de discussions.

### 27 — react-e2e-tests

**Responsabilidade:** Evidência das jornadas da aplicação em um navegador real.

- Projetar: Selecionar caminhos críticos e critérios de observação.
- Implementar: Implementar jornadas Playwright com dados e ambiente controlados.
- Revisar: Conferir estabilidade, cobertura útil e diagnósticos das falhas.
- Limite: Não exige backend real nem substitui toda verificação por E2E.
- Aceitação: Jornada é repetível e verifica resultados do ponto de vista do usuário.
- Fonte D/C: testing.md, playwright.config.ts e e2e.

### 28 — react-api-mocks

**Responsabilidade:** Respostas e cenários de rede simulados para desenvolvimento e testes.

- Projetar: Definir handlers, fixtures e estados de erro conforme contratos existentes.
- Implementar: Implementar MSW e isolamento/reset dos dados simulados.
- Revisar: Conferir divergências de contrato e estado compartilhado entre testes.
- Limite: Não implementa backend de produção nem escreve os asserts da feature.
- Aceitação: Simulação reproduz cenários necessários sem esconder divergências de protocolo.
- Fonte D/C: testing.md e src/testing/mocks.

### 29 — react-load-performance

**Responsabilidade:** Custo e tempo de carregamento da aplicação e seus recursos.

- Projetar: Definir métricas de carregamento e hipóteses mensuráveis.
- Implementar: Otimizar bundle, lazy loading, imagens e waterfalls observados.
- Revisar: Comparar medidas antes/depois e verificar regressões.
- Limite: Não altera semântica do cache ou implementa otimização especulativa.
- Aceitação: Ganho é demonstrado em cenário reproduzível sem mudar o comportamento esperado.
- Fonte D/C: performance.md, lazy routes e prefetch.

### 30 — react-render-performance

**Responsabilidade:** Custo das atualizações e renderizações da interface.

- Projetar: Identificar interações lentas e estratégia de medição.
- Implementar: Otimizar trabalho de renderização a partir de evidência.
- Revisar: Conferir frequência, duração e correção das atualizações.
- Limite: Não redefine propriedade do estado sem respeitar seu contrato.
- Aceitação: Interação medida melhora e continua produzindo os mesmos resultados.
- Fonte D/C: performance.md e exemplos de composição/estado.

### 31 — react-i18n

**Responsabilidade:** Mensagens e apresentação de valores conforme idioma e localidade.

- Projetar: Definir catálogo, fallback e formatação conforme o produto.
- Implementar: Implementar traduções e formatadores quando exigidos.
- Revisar: Conferir cobertura, interpolação e datas/números.
- Limite: Não calcula regras de negócio nem define metadados das páginas.
- Aceitação: Mensagens e valores respeitam as localidades contratadas.
- Fonte C/E: utils/format; internacionalização completa é complemento opcional.

### 32 — react-page-metadata

**Responsabilidade:** Identificação das páginas por título e metadados no navegador.

- Projetar: Definir título, descrição e outros metadados pertinentes.
- Implementar: Integrar Head/Helmet à navegação da SPA.
- Revisar: Conferir atualização, duplicação e valores residuais entre páginas.
- Limite: Não promete indexação garantida nem introduz SSR ou infraestrutura.
- Aceitação: Página apresenta metadados corretos após navegação e atualização.
- Fonte C: src/components/seo e integração Helmet.

## 5. Uso no board e limites entre skills

### Atribuição ao longo do fluxo

- Discovery: partir do mapa do código e consultar somente especialistas necessários para esclarecer incertezas técnicas.
- Requisitos: registrar comportamentos e critérios de aceitação sem carregar o catálogo técnico inteiro.
- Spec: usar o modo projetar das responsabilidades afetadas e registrar contratos e decisões.
- Plan: transformar a especificação em etapas verificáveis, atribuindo as skills disponíveis no Harness em modo “Pelo card”.
- Implementação: carregar as skills atribuídas e somente as referências do modo e assunto pertinentes.
- Revisão: selecionar especialistas por contratos e riscos afetados; revisar não implica corrigir automaticamente.

O fluxo do board e seus artefatos continuam sob as instruções e skills próprias do board. O catálogo React fornece conhecimento técnico; não duplica Discovery, Spec ou Plan. Agrupamentos de fases de desenvolvimento podem constar do plano; a vinculação efetiva deve respeitar as subtarefas e dependências suportadas pelo board, sem presumir uma nova hierarquia implementada.

Cada etapa registra: entrega e limites, arquivos relevantes, decisões aprovadas, contratos de entrada/saída, dependências, skills com modo e critério de verificação. Esses dados podem ficar na descrição; este plano não exige criar campos novos no produto.

### Exemplo: listagem e edição

| Entrega da etapa | Skills pertinentes |
| --- | --- |
| Definir dados recebidos | react-api-contracts |
| Implementar leitura paginada | react-query-cache |
| Sincronizar filtros com histórico | react-url-state |
| Definir componente de listagem | react-component-contracts |
| Ajustar apresentação responsiva | react-styling |
| Implementar formulário | react-forms |
| Salvar e atualizar consumidores | react-mutations |
| Compor a página | react-page-composition |
| Verificar teclado e foco | react-accessibility |
| Verificar edição com rede simulada | react-integration-tests + react-api-mocks |

Etapas pequenas podem ser combinadas. Usar mais de uma skill quando houver responsabilidades diferentes na mesma entrega. Não carregar todas as skills de uma área por pertencerem à mesma feature, nem carregar arquitetura, segurança e testes em toda execução automaticamente.

### Propriedade das decisões

Unicidade significa uma autoridade por decisão, não exclusividade de arquivos. As demais skills consomem os contratos existentes e só alteram outra responsabilidade quando a tarefa o exige.

| Decisão | Responsável | Integração |
| --- | --- | --- |
| Pastas e imports permitidos | react-module-boundaries | Contrato resumido no AGENTS.md |
| Instâncias globais e providers | react-app-lifecycle | Consultas fornece configuração do cache |
| Caminhos e transições | react-routing | Autorização fornece a decisão do guard |
| Filtros e paginação na URL | react-url-state | Consultas usa parâmetros validados |
| Fonte de verdade visual | react-ui-state | Componentes e telas consomem |
| Invariante do negócio | react-business-rules | Formulário e casos de uso aplicam |
| DTOs e schemas externos | react-api-contracts | Transporte e simulação respeitam |
| Requisição e falha de transporte | react-http-client | Consultas/mutações consomem fetchers |
| Chaves e validade de leitura | react-query-cache | Mutações usa chaves publicadas |
| Escrita e reconciliação | react-mutations | Formulário apresenta o resultado |
| Contrato de um campo visual | react-component-contracts | Formulários controla valor/erro/envio |
| Tokens e apresentação visual | react-styling | Acessibilidade informa restrições pertinentes |
| Identidade e sessão | react-auth-session | Autorização consome a identidade |
| Permissões da interface | react-access-policies | Telas e rotas consomem decisões |
| HTML/URLs não confiáveis | react-content-security | Renderização e navegação aplicam controles |
| Exposição/retenção de dados | react-browser-data-security | Estado, sessão e telemetria aplicam restrições |
| Vulnerabilidade de um pacote | react-dependency-security | Ferramentas mantém compatibilidade |
| Recuperação visual | react-error-recovery | Telemetria registra evidências |
| Respostas de rede simuladas | react-api-mocks | Testes definem ações e asserts |

As regras estáveis e transversais ficam no AGENTS.md. O conhecimento específico de implementação fica na skill responsável. Repetir uma mesma skill em etapas distintas é legítimo quando a responsabilidade se repete; o objetivo é reduzir conteúdo irrelevante, não proibir reutilização.

## 6. Formato planejado de cada skill

Entrada mínima: entrega da etapa, modo solicitado/inferido, decisões aprovadas, AGENTS.md aplicável, arquivos e contratos envolvidos e stack/versões observadas.

- **Projetar:** analisar contexto e produzir decisões, alternativas pertinentes, plano de mudança e critérios de aceitação. Não implementar se a solicitação foi apenas de desenho.
- **Implementar:** aplicar a mudança no escopo, preservar contratos existentes, validar e explicar o resultado.
- **Revisar:** inspecionar evidências e apontar achados com localização, consequência e correção sugerida; não modificar arquivos sem pedido de correção.
- **Corrigir/refatorar/atualizar:** são tarefas do modo implementar; incidentes combinam revisão diagnóstica e implementação quando autorizadas. Não justificam três modos extras por padrão.

Estrutura possível, criada somente quando cada recurso for útil:

```text
react-<responsibility>/
  SKILL.md
  references/
    projetar.md
    implementar.md
    revisar.md
    exemplos-vite.md
  scripts/                    # Apenas verificações/ações repetíveis justificadas
  assets/                     # Apenas modelos realmente usados no resultado
```

Não gerar esses arquivos vazios nem exigir três referências para uma skill curta. SKILL.md contém descrição discriminante, limites, escolha do modo e invariantes essenciais. Detalhes ficam em referências carregadas por necessidade. O arquivo de entrada deve ser curto e carregar por referência os procedimentos de projetar, implementar ou revisar. A orientação de ficar abaixo de 500 linhas é um teto de organização, não o tamanho desejado para este catálogo econômico. Descrições devem mencionar a capacidade e os gatilhos reais, sem atrair toda tarefa que contenha a palavra React.

O núcleo deve usar frontmatter portável, com `name` e `description`. Metadados específicos do Codex ou Claude ficam no empacotamento apropriado, sem pressupor suporte universal. Não instalar cópias divergentes em múltiplos locais.

Cada skill terá procedência identificável: arquivos/commit do Bulletproof, complementações e documentação oficial verificada na autoria. Não copiar o guia inteiro para dentro do contexto.

## 7. Plano de construção

### Etapa 0 — Contrato e rastreabilidade

1. Criar modelo de AGENTS.md com os campos descritos neste plano.
2. Criar mapa de responsabilidade e registro de fontes com commit, arquivo e natureza da orientação.
3. Definir catálogo canônico e mecanismo de distribuição compatível com os agentes pretendidos; validar descoberta em ambiente de teste antes de instalar.
4. Registrar como adotar o contrato em aplicações novas e como respeitar decisões de aplicações existentes.

Entrega: contrato-modelo, catálogo delimitado e conjunto de casos de avaliação. Não alterar o AGENTS.md/CLAUDE.md de uma aplicação existente como efeito implícito de instalar a biblioteca.

### Etapa 1 — Piloto de modularização e estado

Construir primeiro react-module-boundaries, react-ui-state, react-query-cache e react-mutations.

Avaliar os três modos com exemplos pequenos. Cenário integrado: listagem filtrável, filtro compartilhável na URL e edição que atualiza a lista. Verificar que cada skill reconhece seus limites e usa contratos das áreas ainda não implementadas sem inventar regras para elas.

Entrega: quatro skills avaliadas e formato de autoria ajustado com evidências. Só expandir o catálogo após resolver sobreposição observada.

### Etapa 2 — Fundação executável

Construir configuração de ferramentas e ambiente, ciclo de vida da aplicação, roteamento, estado de URL, contratos API, transporte HTTP, simulação API e as três skills de testes. Usar exclusivamente React + Vite. Build e preview locais pertencem a react-tooling; não haverá skill de entrega.

Entrega: aplicação mínima verificável, com rota, contrato remoto e testes que exercitem a integração. A ordem pode intercalar essas skills conforme suas dependências práticas.

### Etapa 3 — Construção de funcionalidades

Construir regras de negócio, contratos de componentes, estilização, acessibilidade, composição de telas, formulários, sessão/autenticação e políticas de autorização.

Entrega: jornada de CRUD com paginação, validação, acesso por papel/propriedade e comportamento de erro. Não criar uma skill genérica de CRUD que duplique todas as anteriores.

### Etapa 4 — Segurança e manutenção da aplicação web

Construir as três skills de segurança, tratamento de falhas, telemetria e as duas skills de desempenho. Construir internacionalização e metadados, aplicadas conforme o produto.

Entrega: cenários de falha, diagnóstico e correção no navegador; verificação de conteúdo não confiável, exposição de dados e limpeza de sessão/cache; medição de desempenho e build/preview locais. Consultar fontes oficiais atuais para os temas pouco detalhados no upstream.

### Etapa 5 — Validação integrada e distribuição

1. Completar referências e exemplos da aplicação Vite conforme as necessidades de cada responsabilidade.
2. Executar cenários representativos em uma aplicação React + Vite nova e em outra existente; conferir versões antes de transpor exemplos.
3. Validar frontmatter, links, scripts, seleção de referências e descoberta no Codex e Claude Code.
4. Empacotar uma versão do catálogo, contrato-modelo e avaliações; documentar a adoção sem duplicar regras.

Entrega: 32 skills, cobertura demonstrada e suporte explícito à aplicação React + Vite. A distribuição se refere ao pacote de skills para os agentes; não à publicação da aplicação web.

## 8. Avaliação e critérios de conclusão

Cada skill deve passar por:

- Validação estrutural de frontmatter, nomes, recursos e referências.
- Três casos representativos: um de projeto, um de implementação e um de revisão.
- Pelo menos um caso próximo do assunto que não deve ativá-la.
- Caso de manutenção em código existente, verificando preservação do comportamento e das convenções.
- Conferência de que somente as referências pertinentes ao modo são necessárias.

O mínimo inicial é de 96 casos de capacidade (32 x 3) e 32 casos de não ativação. Não equivale a executar toda combinação de skill, modo e modelo. Modelos adicionais recebem testes proporcionais às diferenças; priorizar comportamento observável, não a redação exata da resposta.

Além de validar cada skill, avaliar uma feature de ponta a ponta dividida em etapas do board. Medir, com o mesmo modelo e entradas comparáveis: instruções efetivamente carregadas, referências adicionais, erros de seleção, retrabalho e violações de contrato. Contar tokens quando a ferramenta fornecer esse dado; bytes/linhas são apenas aproximações. Incluir o custo das descrições disponíveis no catálogo e das instruções comuns, não só os corpos carregados. O matcher atual do board usa nomes e descrições; validar sugestões reais sem presumir seleção semântica perfeita.

Conferir que o mapa do código e os contratos aprovados são reaproveitados entre etapas. Não anunciar economia apenas pelo aumento do número de skills. Se duas skills forem sempre carregadas juntas e não tiverem entregas independentes, reavaliar sua separação.

Avaliações integradas:

1. Aplicação nova: contrato, bootstrap, rota e primeira feature.
2. Evolução: filtro na URL, edição, cache e histórico de navegação.
3. Acesso: login, sessão expirada, logout e permissão por recurso.
4. Falhas: rede indisponível, erro de campo e seção quebrada com recuperação.
5. Refatoração: mover código compartilhado sem introduzir ciclos nem alterar a jornada.
6. Incidente: diagnosticar dados desatualizados e corrigir com evidência.
7. Atualização: adaptar uma dependência sem substituir a arquitetura existente.
8. Execução local: build e preview Vite, carregamento dos recursos e navegação por links internos; compatibilidade de fallback no hosting é apenas um requisito externo, sem configuração de deploy.
9. Segurança web: HTML/Markdown malicioso, destinos de navegação inseguros, exposição de configuração e limpeza de dados ao encerrar sessão, conforme os vetores presentes.
10. Localização, quando habilitada: idioma, datas/números e metadados.

Critério final: toda responsabilidade da matriz possui um dono, os modos produzem os resultados esperados, tarefas combinadas não recebem regras contraditórias e a biblioteca atende aplicações novas e existentes dentro do escopo declarado.

## 9. Fontes e mapa de evidências

Todos os caminhos do Bulletproof abaixo se referem ao commit fixado no início, não a uma promessa de comportamento de versões futuras.

| Fonte | Responsabilidades derivadas |
| --- | --- |
| [Project structure](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-structure.md) | Arquitetura, composição de features, contrato de pastas |
| [Project standards](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-standards.md) | Ambiente e ferramentas |
| [Components and styling](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/components-and-styling.md) | Componentes UI |
| [API layer](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/api-layer.md) | Contratos, transporte e dados remotos |
| [State management](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/state-management.md) | Estado cliente, dados remotos, formulários e URL |
| [Security](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/security.md) | Identidade/acesso e segurança web |
| [Error handling](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/error-handling.md) | Falhas e observabilidade |
| [Testing](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/testing.md) | Testes e mocks |
| [Performance](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/performance.md) | Desempenho |
| [Application overview](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/application-overview.md) | Domínio, objetivo e jornadas do exemplo |
| [React Vite](https://github.com/alan2207/bulletproof-react/tree/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite) | Base única para runtime, navegação, telas, integrações, configuração local e conteúdo |

Referências para autoria e contrato:

- [OpenAI — Build skills](https://learn.chatgpt.com/docs/build-skills).
- [OpenAI — AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- [Claude Code — Skills](https://code.claude.com/docs/en/skills).
- [Claude Code — memória e carregamento de AGENTS.md](https://code.claude.com/docs/en/memory#agentsmd).
- [Anthropic — boas práticas de autoria](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

Estas referências orientam o formato e a integração. O recorte de 32 responsabilidades e o plano de construção são propostas desta análise.

## 10. Biblioteca criada

As 32 responsabilidades estão disponíveis no [catálogo](../board-harness/react/CATALOG.md). Cada pasta possui `SKILL.md` e referências separadas para projetar, implementar e revisar, com regras específicas, limites e evidências de verificação.

O [modelo de AGENTS.md](../board-harness/react/templates/AGENTS.md.template) é inativo e deve ser preenchido/reconciliado na aplicação consumidora. Não houve substituição do CLAUDE.md deste repositório nem instalação automática das skills.

Foram definidos 160 casos: 96 de capacidade, 32 de não ativação e 32 de manutenção. Eles ainda exigem preparação de código e execução por agentes. A criação do catálogo completo não equivale à aprovação antecipada do piloto ou dos cenários integrados. O [protocolo](../board-harness/react/evaluations/PROTOCOL.md) descreve essa sequência e a medição de contexto.

As [verificações executadas](../board-harness/react/evaluations/VALIDATION.md) distinguem estrutura, descoberta e ranking lexical de qualidade comportamental. A sugestão do board deve apoiar a atribuição por responsabilidade; não substitui essa decisão.
