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

**Pendente para concluir #727/E5:** identidade/escopo MCP #823 para `get_skill` e demais leituras consumirem o snapshot autenticado; referências externas legadas ainda não são congeladas. O manifesto é dos arquivos selecionados, não da configuração v1 completa nem da decisão versionada de modelo/política. A resolução, admissão real, orquestração e políticas da E5 continuam pendentes. Essa infraestrutura conserva as seleções legadas; não ativa contratos v1 nem remove delegação nativa.

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
