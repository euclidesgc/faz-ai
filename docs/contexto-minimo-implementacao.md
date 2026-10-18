# Implementação do contexto mínimo por execução

Referência: [plano](plano-contexto-minimo-por-execucao.md).

## E1 — Contexto efetivo atual

**E1 — Mostrar o contexto efetivo atual.** Implementada como uma entrega independente, sem ativar o contrato novo.

- Em **Consumo → Próxima execução → Contexto da execução**, o card mostra agente, candidatos à delegação nativa, rules, skills e MCPs com origem e tamanho estimado.
- Os editores de agentes mostram a mesma prévia para o rascunho, incluindo os itens Sempre do board, sem seleções de cards ou delegados.
- A prévia usa o manifesto atual. A leitura do contexto não inicia execução, não chama IA e não acessa definições ou credenciais MCP.
- Arquivos são agrupados pelo ID do artefato quando disponível e pelo caminho no legado. Todas as origens efetivas permanecem visíveis.
- Sobreposições indicam somente parágrafos idênticos entre instruções de agentes. Rules e skills não têm seus conteúdos carregados para essa comparação.
- O suporte imposto ou orientado vem da matriz existente do executor. A estimativa inicial, o consumo medido e o consumo futuro desconhecido permanecem distintos.

Em E1 não houve migração, alteração de permissões, remoção de delegação ou redução automática de contexto. A refatoração do manifesto compartilha sua resolução com a prévia do agente e preserva as escolhas legadas.

## E2 — Persistência de contratos e seleções

Implementada a base versionada, sem ativar o contrato novo no runtime:

- Migração **34 → 35** cria `agent_context_contracts` e `activity_context_selections`. Os campos e artefatos legados não são regravados.
- `contextPlanning` no estado do board separa a projeção legada **versão 0** dos rascunhos **versão 1**. O runtime é explicitamente `legacy`; a prévia mostra essa indicação.
- A projeção de compatibilidade lê diretamente os campos originais: skills dos agentes continuam essenciais, skills dos cards continuam selecionadas e referências ausentes mantêm o nome e ID nulo. Não há uma cópia migrada que possa divergir desses campos.
- O contrato novo referencia skills e MCPs por ID do artefato. MCPs legados permanecem em `legacyMcps`, nunca em `allowedMcpIds`. Nenhuma conversão automática ou alteração de autorização é realizada.
- Seleções distinguem herança de valor explícito, inclusive listas vazias e agente vazio. Há alvos para board, workflow ou card, por ação e ID estável de fase, incluindo chat e assistentes sem card. IDs ausentes continuam revisáveis; referências existentes de outro board ou tipo são recusadas.
- Revisões otimistas recusam sobrescritas atrasadas. `contextPlanning.save` valida no host e recusa alterações originadas pela IA. É uma base de protocolo; os editores dos novos contratos pertencem a E3/E4.
- Export/import inclui as duas tabelas, valida versões e estrutura e verifica os documentos em memória antes da substituição do board. Campos desconhecidos (como definições MCP) são recusados. Credenciais MCP seguem o tratamento de remoção de valores já existente no export.

Os campos livres de instrução e resultado são conteúdo fornecido pela pessoa, não um armazenamento de credenciais. Os contratos não têm campos para comandos, ambientes ou cabeçalhos de servidores MCP.

## E3 — Resolvedor de rascunhos (parcial)

`src/shared/contextDraftResolution.ts` resolve os contratos v1 sem efeitos colaterais. A precedência por campo é card/fase → card/ação → workflow/fase → workflow/ação → board/fase → board/ação. Uma tarefa não herda implicitamente o condutor da história. Vazio explícito encerra a herança; essenciais e Sempre permanecem separados dos complementos. Disponíveis são sugestões e não são carregadas antecipadamente.

O resultado publica o caminho de resolução e as origens por ID, agrupa repetições e explica artefatos ausentes/desligados, tipo incorreto, agente sem contrato e MCPs fora do contrato (inclusive Sempre). Não traduz nomes nativos para uma permissão universal nem decide modelo/fallback: devolve restrições e modelo solicitados para integração futura com os mecanismos existentes.

`contextPlanning.preview` expõe essa leitura no protocolo host–webview, sem salvar, inferir ou iniciar execução. A resposta contém metadados, sem corpos de artefatos ou definições MCP. A admissão está explicitamente indisponível (`dependency: 729`, `canExecute: false`); isso não altera o runtime legado. O editor e a leitura MCP foram acrescentados na continuação abaixo. A integração com #729 continua pendente. Não é a conclusão de E3.

### Editor e prévia pelo MCP

Na edição de um subagente já salvo da biblioteca, **Editar contrato de contexto (rascunho)** abre um formulário separado para papel, instruções, essenciais, sugestões, MCPs permitidos e restrições de ferramentas. O salvamento não usa IA, não altera campos legados e envia a revisão base ao host. Uma atualização concorrente é sinalizada sem sobrescrever o rascunho; recursos ausentes ou desligados permanecem visíveis e removíveis. Contratos novos começam sem permissões copiadas automaticamente do legado.

A prévia do formulário usa `resolveContextDraft` com o contrato não salvo, essenciais e Sempre, sem complementos de atividade. Sugestões e MCPs permitidos não são ativados antecipadamente. `preview_context_draft` no MCP delega à mesma entrada de leitura do host, com parâmetros estritos e metadados seguros. Nenhuma ferramenta de escrita de contratos foi exposta à IA.

### Infraestrutura de empréstimo MCP — continuação de #710/#712

`projectServerLease.ts` introduz posse por caminho real e geração, compartilhada entre processos, com WAL completo publicado antes da mutação. O transporte medido mantém uma posse entre as tentativas e bloqueia configuração inválida antes do spawn. Restauração compara o estado e preserva conflitos da entrada `faz-ai`. O host recupera preparações de donos comprovadamente mortos; estado desconhecido não comprova morte.

O processo publica confirmação de encerramento somente após fechar e, no POSIX, não encontrar o grupo da execução. Sem confirmação, a posse é retida e o desfecho não é sucesso. O Windows continua sem prova da árvore nesse transporte. O launcher controlado agora espera a gravação da identidade no WAL antes de receber o comando da CLI. Uma queda antes dessa gravação não inicia inferência; depois dela, a recuperação verifica o grupo registrado antes de restaurar. Diários antigos, identidades incompletas e estados desconhecidos continuam retidos. Não marcar #710/#712 ou E3 como concluídas por esta entrega. Testes cobrem concorrência entre processos reais, falhas depois de WAL/escrita, edição concorrente, cancelamento, repetição de formato e queda real do host antes/depois da gravação da identidade e durante a execução. O comando e o prompt passam ao launcher por stdin; o protocolo de controle não polui a saída medida. Esta prova é do transporte com processos Node reais, não de isolamento ou qualidade de uma CLI de IA.

### Base de admissão por capacidades — continuação de #711/#729

`executionAdmission.ts` decide deterministicamente a partir de cinco capacidades independentes (conversa, artefatos, permissões, MCP e delegação), recibos e vínculo da configuração. Evidência ausente, manual, incompleta, vencida ou de outro vínculo não verifica o executor; uma falha mais nova não recorre ao sucesso antigo. Regime exclusivo exige as cinco capacidades; a variante compatível exige revisão humana e não afrouxa permissões, MCP ou delegação. A interface de escolha desse regime ainda não foi entregue.

O gateway aceita preparação v1 estrita, consulta o serviço do host e bloqueia antes de `beforeSpawn` se não houver prova. Intersecta ferramentas do board/nível/agente e operações MCP exatas; listas vazias são impostas como vazias. Restrições nativas de outro executor ou sem tradução são bloqueantes. O mapeamento estrito disponível nesta base é o do Claude; os outros providers continuam sem mapeamento comprovado. A nova preparação elimina delegados e MCPs não selecionados, sem alterar a execução legada ainda ativa.

A identidade da evidência inclui perfil, caminho/binário, argumentos relevantes, ambiente, diretórios e resumo das fontes externas. O host revalida comando, arquivo MCP e vínculo antes de cada tentativa e da liberação do launcher; a alternativa de formato mantém as restrições. Recibos locais têm assinatura por chave da máquina, não são exportados e não há escrita pela UI/MCP. O schema **36** acrescenta `ai_runs.admission_json`; a decisão de auditoria precisa ser gravada antes da inferência v1. Importar essa decisão não a torna evidência local.

**Ainda pendente:** implementar o coletor/verificador das CLIs reais, produzir recibos de isolamento e integrar sua leitura na prévia e nos preparadores de todas as ações. O host mantém fontes externas como desconhecidas; nenhum executor real foi habilitado por estes testes. Os recibos dos testes são sintéticos. E3 e #729 continuam parciais; E5 não foi ativada.

## E4 — Painel e revisão humana do plano

A aba **Plano de execução** usa o resolvedor puro para mostrar as ações de cada card. Histórias acrescentam trabalho por ID de fase aberta; tarefas mantêm quatro ações independentes sem herdar o condutor. Cada atividade tem agente, modelo explícito/herdado, skills adicionais, MCPs ativos, anexos de entrada, resultado e justificativa. Essenciais e Sempre aparecem na prévia, sugestões continuam opcionais e MCP incompatível permanece visível e removível. O catálogo exibe somente nomes e descrições curtas.

Os padrões do board e dos workflows ficam na ferramenta do Harness e incluem chat e assistentes sem card. Critérios e dependências são referências às estruturas originais. Origens, revisões, diferenças e estimativa conhecida/desconhecida aparecem antes de aplicar alterações, inclusive cópias entre fases. A estimativa não declara consumo total nem economia comprovada.

O schema **37** acrescenta justificativa revisada. `contextPlanning.saveBatch` é exclusivo da pessoa e grava até 100 atividades em uma transação com revisão otimista; duplicatas e revisão atrasada recusam o lote inteiro. Export/import valida e preserva a justificativa. Falha ao salvar conserva os rascunhos; atualizar revisões exige nova comparação. A troca de abas do card preserva rascunhos locais. Fechar o card descarta edições ainda não aplicadas.

Testes cobrem migração 36→37, rollback, importação, alvos estáveis, precedência, independência por ação, estimativas desconhecidas, revisão de lote, cópia, falha, concorrência, troca de agente, recursos ausentes, tradução e navegação por teclado. **A interface da E4 está implementada em modo de rascunho.** A pendência da admissão real da E3 permanece; essa entrega não habilita E5 nem comprova isolamento do executor.

## E5 — Snapshots dos arquivos da biblioteca (#727, parcial)

O host configura `RunArtifactSnapshots` no gateway. Runner e chat selecionam as cópias de rules/skills efetivamente referenciadas pelo contexto legado e os agentes da sessão/delegação. O serviço lê o banco, recusa revisões atrasadas ou arquivos obrigatórios inválidos, grava uma área privada temporária com fsync e publica por rename em `run-artifacts/<boardId>/<runId>`. Cada manifesto tem identidades, revisões e hashes SHA-256; definições MCP não entram nesses arquivos. O schema **38** acrescenta revisão monotônica, incrementada em conteúdo e marcação, sem depender da resolução do relógio.

Prompts, referências de apoio e diretórios extras usam a cópia publicada. O gateway valida o manifesto e os arquivos depois de `beforeSpawn`, antes de cada tentativa e nos controles anteriores à liberação do launcher. Falhas não recorrem ao cache compartilhado. Publicar outro run não substitui o primeiro; editar/apagar a biblioteca ou cache não apaga snapshots. Não há coleta automática: runs ativos ou em reconciliação não são removidos pelo serviço.

Testes reais de filesystem e banco cobrem A/v1, B/v2, exclusão, referências de apoio, revisão no mesmo milissegundo, publicação duplicada, corrupção/link simbólico, falha de escrita, rollback de preparação e integração runner/chat com transporte falso. Não houve inferência de CLI real.

**Pendente para concluir #727/E5:** ativar a identidade/escopo MCP #823 nos gatilhos; a API autenticada descrita abaixo já serve as leituras do snapshot. Referências externas legadas ainda não são congeladas. O manifesto é dos arquivos selecionados, não da configuração v1 completa nem da decisão versionada de modelo/política. A resolução, admissão real, orquestração e políticas da E5 continuam pendentes. Essa infraestrutura conserva as seleções legadas; não ativa contratos v1 nem remove delegação nativa.

## E5 — Fundação de posse e reconciliação (#621/#736/#819/#820, parcial)

A leitura somente de consulta dos anexos `SPEC.md` e `PLAN.md` da #621 confirmou que as partes citadas em #823/#824/#825 ainda não existem nesta branch. A implementação introduz uma única base compartilhada para elas, sem criar outro scheduler ou motor de modelos:

- `shared/orchestration.ts`: estados/transições, regras de rodadas com `subtaskWaves`, chaves por IDs, conclusão/revisão/repetição segura/decisão/encerramento não confirmado e limites efetivos. A chave de fechamento usa serialização canônica completa dos IDs e revisões em vez de hash curto, evitando colisões. Código zero com card aberto não conclui; efeitos desconhecidos impedem repetição. O pedido `parallelSubtasks` é persistido pelo parser (padrão 2), mas o limite calculado para escritores na mesma pasta é 1. Essa regra ainda não governa o runtime legado e não é apresentada como limite já imposto na UI.
- Schema **39**: `ai_work` e `ai_work_attempts` locais, fora do export. `WorkRepo` faz posse transacional no host dono do sql.js, protege card/pasta/chave, confere owner e geração, armazena somente hash do token, vincula run/card/board e identidade do processo, conta mutações e revoga gerações antigas. Nova instância coloca posses anteriores em reconciliação sem soltar a pasta. Uma falha requer autorização explícita do host para nova tentativa. A integração ainda precisa comprovar a decisão humana que autoriza essa repetição.
- Comentário de resultado e conclusão podem ser gravados em uma transação, com idempotência por tentativa. Rollback conserva ambos; repetição não cria comentário duplicado. Importação não carrega posses, ignora tabelas locais injetadas e recusa substituir um board com trabalho vivo.
- `workspaceLock.ts`: reserva por caminho real em raiz global do usuário, com geração própria, diário sincronizado e exclusão por mkdir. Alias simbólico, board ou diretório de dados diferente não permitem outro escritor. Adotar requer controlador comprovadamente morto; grupo vivo/desconhecido continua retido. Diário inválido ou recuperação interrompida permanece reservado para decisão, sem remoção automática de prova ambígua.
- `DbHandle.flush()` agora usa temporário exclusivo, sincroniza os bytes antes do rename e o diretório no POSIX. Falha de publicação conserva o banco anterior e é propagada, sem autorizar spawn.

Testes cobrem transições, geração, proprietário, origem de card/fase, token revogado, importação, comentário idempotente, arquivo reaberto após perda da memória, falha de publicação e disputa entre processos Node reais. A queda do controlador com descendente vivo não libera o workspace. Windows continua sem confirmação da árvore; testes POSIX não validam esse caso. Nenhuma CLI de IA foi declarada validada.

**Ainda não concluído nesta fundação inicial (ver continuação abaixo):** ativação do `Orchestrator` no host, ownership da janela nos três gatilhos, reconciliação completa de pasta/resultados e ciclos de devolução humana, ativação da autenticação MCP #823 nos gatilhos, remoção nativa #825 e limites/políticas #730/#731. As regras de associação do campo Fase ainda leem rótulos legados e precisam de tratamento conservador ao renomear antes da ativação. Esta entrega é fundação; não encerra #621/#737/#738 nem ativa E5.

### Identidade MCP por tentativa — API de #823

`RunMcpSessions` liga o run à tentativa persistida, valida dono/geração/token em cada chamada e conta mutações antes de efeitos assíncronos. O runner aceita `RunOptions` opcionais e transfere o desfecho ao dono, sem aplicar o settle legado. O gateway exige snapshot e ponte, injeta o token apenas no ambiente MCP e revoga antes de matar ou publicar término. Tokens conhecidos são removidos de argumentos, respostas e logs; somente hashes permanecem nas tabelas locais.

A ponte compilada envia prefácio reservado antes do MCP. A conexão não troca de identidade; token inválido não vira sessão externa. Leituras de biblioteca e arquivos usam snapshot com revisão/hash, inclusive `read_rule_file`; relay externo fixa definições privadas e operações e é interrompido por revogação. Sessões externas mantêm leitura legada e não assumem unidades vivas. Eventos de mutação usam o run autenticado, sem atribuir sessões externas ao processo atual.

`mcpRunIdentity.test.ts` cobre servidor/ponte reais, dono e geração antigos, chamadas após revogação, espera por runner, scopes indiretos, artefato v1 após edição v2, MCP externo stdio fixado, operações proibidas, contagem, atribuição e sentinelas em logs/export. O teste com runner real confirma orientação, callback e ausência de conclusão automática por código zero.

**Pendente para ativar:** criação do Orchestrator no host, gatilhos e snapshot da configuração v1 completa. A continuação abaixo exercita persistência, identidade e reconciliação por UnitStarter injetado. Chamadas legadas ainda não recebem unidades/tokens automaticamente. Isso não encerra E5 nem valida isolamento de CLIs reais.

### Espera durável no launcher — protocolo de #737

`SpawnControl.beforeStart` admite `Promise<void>` e o gateway expõe o mesmo hook ao host. O comando só atravessa o stdin depois da confirmação. As guardas de snapshot, admissão e token são revalidadas ao sair da espera. Rejeição informa processo não iniciado; Parar impede liberação tardia. O transporte medido e o gateway propagam identidade e confirmação do grupo, inclusive no resultado, para evitar que a reconciliação dependa apenas do código de saída.

Testes com launcher Node real cobrem espera, rejeição assíncrona, cancelamento antes da confirmação, revogação durante a espera e queda real do host enquanto o hook está pendente. A confirmação Windows permanece desconhecida. **Não conclui #737:** falta o orquestrador persistir a unidade e a identidade, sincronizar o banco e registrar a posse da pasta por esse hook em cada tentativa.

### Orchestrator persistido e recuperação com processos reais

`src/extension/orchestrator.ts` liga `storyPlan`, admissão de limites, `WorkRepo`, sessões MCP, trava por pasta real e o hook assíncrono do gateway por um `UnitStarter` injetado. Uma fila de controle serializa decisões sem aguardar o término da CLI. `drive` e `continue` usam a mesma posse; a abertura deve reconciliar antes de admitir trabalho. Processos de fora das unidades entram nos tetos por `otherProcesses`, e perfis desconhecidos são contados conservadoramente. O fingerprint e a terminação são dependências explícitas do host; desconhecido não vira ausência de efeitos.

A preparação e a impressão inicial chegam ao disco antes de iniciar; o WAL da pasta recebe a identidade antes de gravá-la no banco e liberar o comando. Tentativas de formato só substituem a identidade após confirmar o grupo anterior. O cancelamento revoga todas as sessões antes de sinalizar processos e impede liberação tardia. `terminateProcessGroup` confere liderança/nascimento no POSIX antes de sinalizar e confirma o grupo após a escalada; identidade ambígua e Windows continuam sem liberação.

A reconciliação distingue card concluído, passagem à pessoa, sessão que criou trabalho, efeitos parciais e falta de confirmação. O comentário de resultado é atômico e idempotente com o estado e contém a referência e até 600 caracteres da última mensagem da IA. Código zero sozinho não conclui o card. Estado terminal conserva `workspace` até a trava ser liberada: falha ou queda entre esses passos não perde o vínculo, e importação permanece bloqueada enquanto há reserva. A varredura repete flush antes de liberar um resultado que só tinha chegado à memória.

`orchestrator.test.ts` usa gateway, ponte MCP, processos Node, trava e SQLite em disco: disputa entre dois gatilhos, três filhas que escrevem na mesma pasta, dependência A→C e fechamento único; trabalho parcial sem JSON; flush recusado; cancelamento durante flush; descendente que confirma ter instalado seu handler de SIGTERM; falha entre conclusão e liberação; reabertura dos bytes duráveis depois da liberação física. `orchestratorIntegration.test.ts` mata o controlador com SIGKILL, abre outro processo, encerra o grupo órfão e confirma que duas reaberturas não repetem a CLI nem o comentário.

**Ainda necessário para #737/#738/E5:** adaptador do host com fingerprint completo e pasta real da história; gatilhos e projeção/staleRuns de #824; ciclos de devolução humana e associação estável da Fase; regras de parada após reconciliação não confirmada; cobertura das demais fronteiras de queda, perfis/modelos distintos e custo de flush em board grande. Remoção nativa #825, políticas #730/#731, credenciais/admissão real e piloto continuam pendentes. Os testes Node não são evidência de isolamento de uma CLI de IA, e a API ainda não foi ativada na produção.

## Dependências identificadas no board

Consulta local somente de leitura ao board deste projeto em 17/10/2026:

| Card | Situação consultada | Relação |
| --- | --- | --- |
| #729 — Admissão no gateway por capacidades verificadas e contrato exclusivo do board | A fazer / ready, sub-tarefa de #619 | Depende de #711 e #712; centraliza admissão antes do spawn e não aceita declaração manual como prova de isolamento. |
| #711 — Capacidades de isolamento no perfil de CLI | A fazer / ready | Usa os contratos de perfis da história #618, em Implementação. |
| #712 — Empréstimo no transporte/gateway/abertura do board | A fazer / ready | Depende do lease coordenado de #710 e integra a correção #739. |
| #727 — Snapshots de artefatos por execução | A fazer / ready | Dependência de E5; cache atual da biblioteca não equivale a snapshot. |
| #728 — Credenciais locais e importação revisada | A fazer / ready | Não confundir o tratamento legado de export com o contrato de credenciais da revisão v2. |

Lidas as descrições de #729, #619, #711, #712, #618, #727 e #728 e o anexo normativo `REVISAO-ARQUITETURAL-v2.md` de #619. São tarefas cadastradas; sua existência não significa implementação integrada. O vínculo correto de E3 é com a entrega de #729 e suas dependências, e não com uma branch presumida. Nenhum card foi alterado ou executado por essa consulta.

## Dependências verificadas no código atual

| Área | Evidência | Consequência para as próximas entregas |
| --- | --- | --- |
| Persistência | `src/extension/db/schema.ts`, versão 35; `src/shared/contextPlanning.ts`, `src/extension/repositories/contextPlanningRepo.ts` | E2 introduziu persistência separada e manteve o runtime legado. |
| Execução atual | `src/shared/execution.ts`, `manifestOf` e `delegatesOf` | A união legada e a delegação nativa continuam ativas. Não há contrato por ação sendo aplicado. |
| Gateway | `src/extension/ai/gateway.ts`, `AiGateway.run` | Já centraliza spawn e registro de consumo. A verificação atual de permissão não substitui a admissão por capacidades prevista em #729. |
| Configuração de uma execução | `src/extension/execution.ts`; `src/shared/log.ts`, `AiRunConfig` | O manifesto e o registro de configuração não equivalem ao snapshot de artefatos por revisão/hash de #727. |
| Modelo e fallback | `src/shared/models.ts`; `src/extension/runner.ts` | Reutilizar o mecanismo integrado e conferir os contratos de #730/#731 antes de E5. |

## Trabalho ainda pendente

E3 está parcialmente implementada; falta a integração dos limites de #729, sub-tarefa cadastrada no board e ainda em A fazer. E4 tem interface e salvamento revisável em modo de rascunho; E5–E7 continuam pendentes; E5 requer também os snapshots e os contratos de orquestração e políticas citados no plano. Não substituir essas dependências por outro scheduler, outro motor de modelos ou permissões somente na interface.

O piloto de E7 exige tarefas representativas e medições de execuções aceitas; não foi executado como efeito desta entrega. Nenhuma redução de consumo ou preservação de qualidade foi demonstrada ainda.

## Credenciais MCP — primeira entrega de #728

Schema 40 e `LocalCredentials` guardam a definição inteira cifrada em `.credentials`, ao lado dos bancos. A publicação exclusiva com fsync precede a troca por `secretRef`; falhas preservam o JSON anterior. O editor não recebe configurações salvas, permite editar metadados e exige substituição explícita para revisar. Importações ficam pendentes mesmo com referência local disponível; prévia, preparação, sessões e encaminhamento recusam execução. Export, banco, leitura MCP e interface não devolvem os valores. Gateway e resultados externos ocultam valores conhecidos.

`credentials.test.ts` cobre persistência/reabertura, posse, corrupção, permissões, falha e retomada da migração, bytes SQLite/export sem sentinelas, revisão humana e logs. Os testes MCP usam processos Node, sem inferência de CLI real. O cofre usa AES-256-GCM com chave local; não é chaveiro do sistema nem isolamento contra processos do mesmo usuário. Perfis CLI, caminhos legados de arquivos nativos e cobertura completa de #728 continuam pendentes; E3 e ativação E5 não estão concluídas.

## Sincronização dos cards após a etapa de credenciais

Após o commit `369ad95`, o MCP do board recebeu e confirmou por releitura 39 registros com a marca `[contexto-minimo:369ad95]`, antes de iniciar outra implementação:

- Histórias #615, #618, #619, #620, #621, #823, #824 e #825: registro consolidado de entregas, commits, evidências e pendências; permanecem em Implementação.
- Subtarefas com avanço parcial, movidas de A fazer para Em andamento: #710, #711, #712, #727, #728, #729, #736, #737, #738, #819, #820, #821, #822, #828, #829, #831, #832, #833, #835, #836, #838, #840. Cada conversa registra o que foi entregue e o que impede a conclusão.
- Subtarefas ainda em A fazer, com pendências registradas: #730, #731, #830, #834, #837, #841, #842, #843, #845.

Nenhum card foi marcado concluído nesta sincronização. Os registros distinguem a fundação testada da ativação de produção, perfis/CLIs reais e piloto ainda pendentes. Validação do commit: 227 arquivos / 3.285 testes, tipos, lint/formatação e build da interface; o ajuste final de preparação também passou em 105 testes direcionados. As mudanças permanecem nesta branch, sem push ou integração.

## Verificação real do provider — continuação de #717/#729

Acrescentados `vitest.cli-real.config.ts` e `test/cli-real/` para o comando separado `npm run test:cli-real`. A CLI real consome respostas determinadas de API local e tenta operações permitidas e proibidas; controles positivos demonstram a detecção de fontes externas. Isso encontrou uma regressão concreta: a variável herdada de memória adicional contornava `--setting-sources` vazio. O provider estrito agora fixa essa variável em `0`, com mutação de controle reproduzindo a falha. As evidências e seus limites estão em `contexto-minimo-verificacao-cli.md`.

O teste não habilita admissão nem mede inferência/qualidade. As políticas gerenciadas e o ambiente de produção continuam sem prova; E3, #729 e o runtime E5 permanecem parciais. #728 também continua dependendo da integração de perfis CLI e caminhos legados.

Após `9df6eab`, registros de avanço e pendências foram confirmados por releitura no board em #619, #717 e #729, com a marca `[contexto-minimo:9df6eab]`. #717 passou a Em andamento; #729 continua Em andamento e #619 permanece em Implementação. Validação: 3.285 testes comuns e três testes separados com CLI real, tipos, lint e formatação. Nenhum card concluído ou perfil de produção habilitado.

## CLI real pelo gateway e transporte medido

`test/cli-real/claudeHarness.ts` reutiliza agora `AiGateway`, materialização e `spawnHeadless`, com log real em SQLite descartável. O flush precede a liberação do launcher. O resultado é lido após reabrir os bytes do banco; todos os cenários conferem uma tentativa, identidade/encerramento do grupo e arquivos privados removidos. Os sete testes separados passaram, incluindo cancelamento, SIGKILL na requisição pendente e rejeição da barreira anterior à liberação. Perfis de produção, políticas gerenciadas, demais CLIs e a matriz completa de WAL continuam pendentes; não são gerados recibos nem usados números sintéticos no piloto.

## Políticas de execução e fallback — domínio e persistência de #730/#731

`executionPolicies.ts` evolui a resolução de modelos com identidades de perfil separadas do catálogo e reutiliza a leitura de valores/esforço existente. A primeira escolha presente é definitiva: perfil/modelo/esforço inválido bloqueia; somente ausência permite herança. A escolha explícita só muda por condição que inclua explicitamente o perfil e modelo originais. Perfis-cópia não redirecionam prefixos.

O domínio v1 contém condições de origem, ação, agente, fase/tipo por ID e falha, quatro ações, destinos ordenados e limites. Regras ativas empatadas e cadeias potencialmente cíclicas são recusadas. Contextos de fase/ação mutuamente exclusivos não formam cadeia. `evaluateExecutionPolicy` é a própria função usada por `simulateExecutionPolicy`; a origem é o alvo inicial congelado e o histórico conserva destinos visitados, contador global da cadeia e limites acumulados. A indisponibilidade de um destino não remove credenciais, admissão ou o fingerprint semântico obrigatório. Permissão/capacidade não recebe fallback automático; efeitos parciais/desconhecidos e erro/saída desconhecidos exigem reconciliação. Medição ausente continua null.

Schema 41 e `ExecutionPolicyRepo` guardam cabeçalho e versões imutáveis, com revisão otimista, remoção lógica, snapshots congelados e validação do histórico antes da substituição por import. Importação conserva definições/versões, mas marca o cabeçalho como pendente de revisão local; o enabled original no histórico não autoriza execução. Não há escrita por IA ou endpoint MCP executável.

**Ainda pendente:** ligar a resolução aos perfis/estado reais de #699/#700; congelar política/decisão no run de #701 e integrar um caminho único em #702/#732; conclusão do editor/simulador #733, rascunhos assistidos #734 e migração do reserva legado #735. O domínio novo não está ativo em produção. O runner legado ainda usa sua regra antiga; ela deve ser substituída, sem dois avaliadores executáveis em paralelo, na integração. Não é conclusão de E5 nem de todo #730/#731.


## Editor manual e simulação no host — avanço parcial de #732/#733

Configurações → Harness → Ferramenta e execução oferece gestão manual de políticas com campos estruturados, destinos ordenados, condições por IDs estáveis, tentativas/prazo/backoff e concorrência global/por perfil. Comparação integral e confirmação explícita distinguem revisão de salvamento pendente. Histórico paginado permite recuperar versão como novo rascunho, mantendo a revisão atual como base. Conflitos preservam a edição; recarregar a base exige nova comparação e confirmação.

O protocolo de leitura/simulação é correlacionado e cancelável, com erro de transporte/timeout. Simulação usa o avaliador puro no host, cópia do rascunho e cenários explicitamente hipotéticos. Não inicia IA, grava dados ou produz evidência de admissão. Alterações no cenário, política, catálogo/contexto e token dos cabeçalhos de políticas salvas marcam o resultado desatualizado. A revisão/remoção é recusada para origem IA/MCP/tentativa autenticada. Remover/desativar política com destino indisponível continua possível.

Esta etapa não conclui #732/#733: ainda faltam perfis reais e catálogo de #705, Próxima execução pelo avaliador, integração de todos os chamadores e auditoria de decisões no runtime. A tela está na configuração de Harness existente; a organização definitiva em Ferramentas de IA acompanha os perfis. O modelo reserva legado continua ativo somente no caminho anterior, separado da simulação. Não há assistente de propostas #734 nem migração #735 nesta entrega.


## Perfis CLI — domínio e persistência de #682/#683

Schema 42 adiciona `ai_profiles`, com seed/migração dos três prontos, sem reescrever `ai_tools_json`, catálogo ou regras. O domínio puro oferece identidades/nomes, validação, argumentos com marcadores (valores nunca são divididos), consulta de catálogo do base e modelo livre do personalizado. O fallback de `activeProfile` é somente compatibilidade do seletor legado; admissão estrita mantém a resolução explícita de `executionPolicies`.

Os sete aspectos de capacidades, incluindo cancelamento e saída, começam desconhecidos. O contrato de evidência inclui vínculo a binário/versão e digests de args/ambiente/configuração, reaproveitando o formato de evidência existente; esta etapa não produz provas nem admissão. Salvar, duplicar e importar nunca herdam selo de execução.

`AiProfileRepo` separa a configuração completa no cofre já existente e devolve metadados/referências. Travas de prontos/padrão e escrita humana valem no repositório, incluindo a tentativa de desativar o padrão pelo salvamento. Campos privados futuros já salvos sobrevivem à edição. Duplicação humana recebe outra referência, pendente/desativada; não é fallback. Importação valida antes do backup/substituição, recusa valores livres e avisa os nomes a revisar. Prontos importados têm revisão explícita que não os liga; personalizados exigem configuração revisada. Leitura completa prontos ausentes sem escrever.

Validação direcionada cobre domínio, migração de dois boards, persistência/segredos, exportação/importação, repositórios, avisos/tradução e orçamento de consultas. Conforme orientação da pessoa, a suíte inteira fica para a consolidação final. Ainda faltam #684 (AiTool aberto), resolução/probe/providers e host/telas #686–#692, ligação de capacidades/admissão e política aos chamadores reais. E3/E5 e a história #618 continuam em implementação.
