# Plano técnico: sessão da História e sessões filhas das subtarefas

Revisão 5 — 03/11/2026 (seção 15 acrescentada). Plano de implementação; o progresso do runtime é acompanhado na branch e no PR.

## 1. Escopo confirmado

**A mudança é na propriedade, continuidade e execução das sessões de IA do board.** A História passa a ser dona da sessão principal. Cada subtarefa é executada por um subagente com sessão filha dessa principal. O usuário continua utilizando os cards, colunas, anexos, conversas, perguntas, respostas e aprovações existentes.

A sessão principal acompanha a História entre fases. O especialista de Discovery trabalha em uma filha; depois da aprovação já existente, o especialista de PRD trabalha em outra filha da mesma principal; Spec, Plan, implementação, revisão e correção seguem essa mecânica. O principal mantém decisões e continuidade; os filhos concentram pesquisa e execução especializadas.

O modelo, agente, skills, MCPs e contexto escolhidos para uma subtarefa passam a configurar sua delegação. Esses dados continuam sendo definidos pelos mecanismos atuais do card e do Harness. Trocar o modelo de uma subtarefa não deve provocar a troca do modelo ou a recriação da sessão principal.

### Princípio obrigatório: principal coordena, filhos executam

**A principal coordena; os filhos pesquisam, produzem e verificam. O board controla o fluxo e persiste os resultados.**

No novo modo, todo trabalho especializado da História é delegado: Discovery, PRD, especificação, planejamento, implementação, testes, revisão, diagnóstico e correção. A principal conversa com a pessoa, interpreta os retornos, mantém decisões e coordena as delegações autorizadas. Ela não assume a implementação ou a investigação especializada quando uma filha falha; coordena a recuperação ou outra delegação.

Isso vale também para tarefas pequenas e fechamento de fase: a principal pode interpretar evidências e comunicar o resultado, mas pesquisa, alterações e verificações especializadas são realizadas por filhos. A exceção atual de trilha direta, na qual a História implementa sem subtarefa, deve ser adaptada no novo modo para criar a subtarefa pelo mecanismo existente e delegá-la. No modo tradicional, conserva-se o comportamento atual.

O objetivo é preservar a janela da principal para continuidade e decisões. Não depende de um tamanho fixo de janela nem garante economia por si só. Aplicar conjuntamente: entrada delimitada para cada filho, retorno conciso com evidências e referências, e memória durável nos documentos e registros atuais do board. Ações administrativas determinísticas continuam no host, sem delegação ou turno de modelo desnecessário.

### Correção da revisão anterior

A primeira versão ampliou o escopo ao propor agrupamentos visuais, entidades de etapa e novas ações de interface. Essas propostas foram retiradas. Este plano:

- Usa as colunas, tipos de card, relações pai/filho e dependências atuais.
- Mantém o mecanismo atual de anexar, consultar e substituir documentos, incluindo nomes e caminhos definidos pelo fluxo.
- Mantém a conversa do card como ponto de interação, inclusive perguntas, decisões e pedidos de correção.
- Usa os campos e a apresentação de contexto já existentes; não cria painel de sessão, árvore de agentes, editor de etapas ou botão “Executar etapa”.
- Representa as etapas verticais no plano anexado, nas descrições, checklists e dependências das subtarefas. Uma etapa não exige tabela `ImplementationStage`, campo `stageId` ou coluna nova.

A persistência adicional descrita adiante é interna ao runtime. Mensagens técnicas de retomada ou incompatibilidade usam os canais de conversa e log existentes. Qualquer alteração futura de UX exige escopo próprio.

O teste decisivo é executar o mesmo fluxo pelo board, com os mesmos gestos do usuário, observando uma sessão principal persistente e filhos especializados onde antes havia execuções independentes por unidade.

## 2. Diagnóstico do caminho atual

Base inspecionada: checkout `develop`, commit `b5cf909a`. A análise abaixo refere-se ao código local; não é afirmação sobre qualquer versão futura do produto.

| Ponto                                                                                    | Comportamento encontrado                                                                                  | Consequência para a mudança                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/shared/orchestration.ts`                                                            | Planeja unidades `story`, `subtask`, `closing`, `activity`; usa estado, dependências e chaves de trabalho | Preservar a escolha do próximo trabalho; separar unidade de trabalho de sessão de IA         |
| `src/extension/orchestrator.ts`, `start()`                                               | Reserva a unidade e a worktree; chama `starter.start(unit.cardId!, ...)`                                  | Encaminhar unidades da mesma História para o controlador de sua sessão                       |
| `src/extension/runner.ts`                                                                | Prepara manifesto/prompt por card; a retomada encontrada usa `OutcomeResume` para reparar resposta final  | Criar continuidade da História sem confundir com reparo da saída de uma tentativa            |
| `src/extension/ai/acp/run.ts`                                                            | O caminho inspecionado faz `initialize`, `session/new`, seleção de modelo e `session/prompt` por execução | Separar abertura de sessão, envio de turno e encerramento do transporte                      |
| `src/extension/ai/gateway.ts`                                                            | Vincula token e snapshot ao run; finaliza log e libera recursos da execução                               | Encerrar um filho/turno sem destruir os recursos ainda usados pela sessão principal          |
| `src/extension/unitAdvice.ts` e `flowSkill.ts`                                           | Instruem o principal a criar subtarefas e parar; proíbem executá-las por subagente                        | Publicar instruções específicas para o modo de sessões relacionadas                          |
| `src/shared/executionAdmission.ts`                                                       | Inclui negação explícita de delegação nativa (`NO_DELEGATION`)                                            | Autorizar delegações determinadas pelo board, mantendo o contrato antigo no modo tradicional |
| `src/extension/repositories/workRepo.ts`                                                 | Registra unidades, tentativas, geração, processo, resultado e posse                                       | Acrescentar vínculo de sessão e filho sem duplicar a máquina de trabalho existente           |
| `src/extension/mcp/runSessions.ts`                                                       | Autoriza por token de tentativa/run e snapshot                                                            | Evitar que uma sessão longa reutilize autoridade de uma tentativa encerrada                  |
| `src/shared/execution.ts`, `executionContext.ts`, `src/extension/runArtifactSnapshot.ts` | Já resolvem perfil/contexto e congelam artefatos                                                          | Usar esse mesmo manifesto como entrada da filha                                              |

**Conclusão:** o caminho atual inspecionado é centrado na execução de cada unidade. Já existem IDs de sessão e uma retomada pontual; isso não constitui uma sessão condutora durável por História. A alteração principal fica no orquestrador, runner, gateway, transporte, persistência e instruções para a IA.

## 3. Invariantes do novo runtime

1. Uma História tem uma sessão principal lógica ativa por vez. Sua sessão nativa permanece a mesma durante o percurso normal suportado pelo executor.
2. Cada tentativa de uma subtarefa tem vínculo inequívoco com a História, a sessão principal e a sessão filha que a executa.
3. Final de turno, fim de processo, conclusão da subtarefa, mudança de fase e fim da História são eventos distintos.
4. Aprovar uma fase permite novo trabalho na mesma principal; não abre outra principal por causa da coluna.
5. O board continua decidindo elegibilidade, dependências, permissões, aprovações e conclusão. O principal coordena o raciocínio e a delegação autorizada.
6. Um resultado do filho precisa passar pela conferência atual. A frase “terminei” ou o encerramento do turno pai não conclui o card.
7. As sessões filhas têm contexto próprio. Logs completos de ferramentas não são copiados para a janela do principal pelo board.
8. Existe um escritor por worktree. Um principal persistente e o filho que ele coordena não devem consumir duas reservas da mesma tarefa nem escrever simultaneamente.
9. Estado persistido do board prevalece sobre lembranças antigas da IA. Retomar uma sessão sempre exige reconciliar o trabalho e transmitir mudanças relevantes.
10. Nenhuma promoção ao padrão ocorre com base apenas em uma sonda fora do board.
11. Todo trabalho especializado é delegado, inclusive correções, verificações de fechamento e tarefas pequenas; a principal permanece coordenadora.

### Sessão, turno, tentativa e processo

| Conceito              | Duração                                 | Exemplo                                                       |
| --------------------- | --------------------------------------- | ------------------------------------------------------------- |
| História/card         | Ciclo de produto atual                  | A funcionalidade e seus anexos/conversa                       |
| Sessão principal      | Acompanha a História                    | Mantém contexto entre Discovery e PRD                         |
| Turno da principal    | Uma interação ou coordenação delimitada | Receber aprovação e delegar PRD                               |
| Tentativa de trabalho | Execução conferida pelo board           | Primeira tentativa da subtarefa de PRD                        |
| Sessão filha          | Trabalho especializado                  | Especialista produzindo PRD                                   |
| Processo do executor  | Recurso do transporte                   | Pode permanecer ativo ou ser reaberto para retomar uma sessão |

Manter o mesmo ID lógico no banco enquanto se cria uma conversa vazia em cada tarefa não satisfaz a continuidade desejada. O teste deve observar o ID nativo e a retomada efetiva. Se for necessário reconstruir uma sessão, registrar uma nova geração e o motivo.

## 4. Fluxo de execução, preservando o board atual

### 4.1 Primeiro trabalho da História

1. O comando ou gatilho atual solicita trabalho para o card.
2. Resolver a História proprietária: o próprio card quando História, ou seu `parentId` quando subtarefa. Atividades independentes conservam o caminho atual.
3. Consultar a sessão da História. Se não existir, criar o registro durável e abrir a sessão principal com perfil de coordenação e contexto inicial da História.
4. Se já existir, usar o transporte ativo ou retomar a sessão nativa registrada. Conferir geração, configuração, workspace e ausência de execução conflitante.
5. Entregar o trabalho autorizado ao principal. Todo trabalho especializado precisa de subtarefa e delegação conforme o contrato do card; quando ainda não houver subtarefa, criá-la pelos mecanismos existentes antes de executar.

A criação da História não precisa chamar modelo. Abrir a sessão somente quando o fluxo atual realmente autorizar execução.

### 4.2 Executar uma subtarefa

1. O planejador atual identifica a subtarefa elegível; validar fase, status, dependências, regras e limites.
2. Reservar a unidade/tentativa usando o mecanismo de claim existente. Congelar manifesto e referências de entrada.
3. Persistir uma intenção de delegação com ID único antes de chamar o executor.
4. Enviar à sessão principal a tarefa autorizada e o contrato do especialista. A principal usa o mecanismo de subagente do executor; o adaptador associa a criação observada à intenção persistida.
5. Registrar o ID da filha e acompanhar seus eventos. Se houver filho inesperado ou configuração divergente, interromper/reconciliar conforme a capacidade comprovada, sem concluir o card.
6. O filho executa o objetivo na worktree da História, com as configurações efetivas de seu card. Pesquisa, testes e detalhes permanecem em seu contexto.
7. Encaminhar anexos, perguntas, comentários, checklist e resultado pelos mecanismos existentes. Para o usuário, continuam sendo operações do mesmo card.
8. Conferir desfecho, evidências, mutações e estado do card com as regras atuais; persistir conclusão ou pendência.
9. Entregar ao principal um retorno conciso e identificável. Liberar a tentativa e a reserva quando não houver escritor ativo. O próximo trabalho passa novamente pela elegibilidade atual.

A fase documental que cria uma subtarefa durante o turno inicial deve seguir o mesmo caminho: a principal cria o card pelo mecanismo existente, o host verifica sua elegibilidade e admite a delegação. Não manter um caminho paralelo que abra uma CLI independente para esse card.

### 4.3 Aprovação, perguntas e mensagens

| Evento já existente              | Tratamento interno proposto                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pedido de revisão de documento   | Encerrar o trabalho da filha; manter a principal em espera; anexos e status seguem o fluxo atual                   |
| Aprovação da fase                | Enfileirar na mesma principal a aprovação e a fase vigente; o especialista seguinte recebe referências aprovadas   |
| Resposta na conversa da História | Entregar a mensagem nova à principal, com o estado atual necessário                                                |
| Resposta na subtarefa            | Resolver sua História e o trabalho aguardando resposta; coordenar a continuação da filha pela principal            |
| Pedido de ajuste no documento    | Retomar a filha se compatível e suportado; caso contrário abrir nova filha para o mesmo card, mantendo a principal |
| Mensagem durante trabalho ativo  | Persistir e enfileirar; não abrir outra principal nem sobrepor turnos incompatíveis                                |
| Mudança manual de coluna         | Reconciliar conforme regras existentes; impedir trabalho da fase antiga de continuar sem validade                  |
| `NEEDS_CONTEXT`                  | Principal recebe a lacuna e complementa o card ou pergunta pela conversa atual; filha continua após a resolução    |

Comentários automáticos não devem ser tratados como novas mensagens humanas, criando loops. Manter cursor de mensagens entregues e identidade de evento. Não reencaminhar toda a conversa a cada turno.

### 4.4 Revisão, correção e etapas do plano

As etapas verticais continuam descritas no documento de planejamento. As dependências entre tarefas e a subtarefa de revisão expressam a ordem. O revisor é um filho especializado, com contexto próprio, associado ao card de revisão já usado pelo fluxo. Regras existentes de independência de modelo/executor continuam sendo conferidas.

Uma reprovação retorna achados ao principal e à conversa atual. O diagnóstico especializado identifica causa e alternativas; a decisão do desenvolvedor chega pela pergunta/resposta do card. A correção recebe essa decisão e o aceite original; em seguida o revisor verifica novamente. Não se criam telas, estados visuais ou colunas para esse ciclo.

O plano não altera silenciosamente políticas de aprovação ou do modo autônomo. O piloto será executado com revisão humana habilitada, para testar a mecânica descrita pelo usuário. Uma necessidade de mudar essas políticas deve ser tratada separadamente da persistência das sessões.

Um aprendizado é proposto nos mecanismos atuais de regras/skills e revisão. Automatizar sua publicação não é requisito desta mudança de runtime.

## 5. Divisão de responsabilidades e pontos de integração

### 5.1 Controlador interno da sessão da História

Introduzir `StorySessionController` (nome proposto) entre o despacho de trabalho e o adaptador do executor. Ele mantém uma fila serial de comandos por História, coordena abertura/retomada, entrega de mensagens, delegações e reconciliação.

O orquestrador atual conserva a responsabilidade de selecionar unidades, aplicar dependências e fazer claims. Evitar um segundo scheduler dentro do controlador. Principal e filho não podem iniciar a mesma subtarefa por duas rotas diferentes.

Roteamento proposto das unidades existentes:

| Unidade                 | Novo destino                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `story`                 | Turno da principal existente, abrindo-a somente na primeira execução                             |
| `subtask`               | Delegação autorizada pela principal à filha do card                                              |
| `closing`               | Turno da mesma principal para coordenar o fechamento; especialistas necessários continuam filhos |
| `activity` sem História | Caminho atual independente                                                                       |

Inspecionar também entradas manuais, respostas, heartbeat, refinamento, resumo e resolução de conflitos. Toda entrada que execute trabalho da História deve resolver sua proprietária. Operações administrativas que não precisam de modelo não criam turnos. O piloto não altera a política existente sobre quem cria commit ou move a História.

### 5.2 Runner e gateway

Extrair a preparação reutilizável do runner: resolver alvo, manifesto, contexto, snapshot e admissão sem necessariamente iniciar um processo. O caminho tradicional continua podendo usar essa preparação.

Separar no gateway recursos de transporte/sessão dos recursos de turno/tentativa. Encerrar log de uma tentativa revoga sua autoridade e libera seus recursos; não encerra automaticamente o transporte da principal. Encerrar a História ou cancelar sua árvore de execução trata recursos de toda a sessão.

O estado “em execução” do card deve refletir trabalho ativo, não a mera existência de uma sessão ociosa. Uma principal aguardando aprovação não ocupa slot de escritor nem continua disparando prompts para verificar respostas.

O reparo de resposta final (`OutcomeResume`) permanece limitado à tentativa que emitiu a resposta. Não usar uma retomada da principal para reparar por engano a saída de uma filha.

### 5.3 Contrato interno do adaptador

Os nomes abaixo são uma proposta do produto, não nomes presumidos de comandos ou APIs dos fornecedores.

| Operação        | Entrada/resultado mínimo                                              | Regra                                                                      |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `openStory`     | Identidade da História, perfil estável e contexto inicial → ID nativo | Só na primeira abertura ou reconstrução declarada                          |
| `resumeStory`   | ID nativo, geração e configuração compatível → sessão retomada        | Retomada precisa ser comprovada com novo trabalho                          |
| `sendTurn`      | ID de comando, mensagens novas e estado relevante                     | Serializar turnos por principal                                            |
| `delegate`      | Intenção autorizada e contrato congelado → vínculo da filha           | Adaptador traduz para mecanismo nativo; não presume API universal de spawn |
| `continueChild` | Filha, mensagem/decisão nova e configuração                           | Usar apenas quando a continuidade da filha for suportada                   |
| `cancelChild`   | Identidade da filha → confirmação de término                          | ACK isolado não libera reserva de escrita                                  |
| `suspendStory`  | Sessão e checkpoint                                                   | Pode fechar transporte preservando sessão retomável                        |
| `closeStory`    | Sessão e filhos ativos                                                | Encerrar recursos e preservar histórico                                    |

Eventos normalizados devem incluir, quando aplicável: História, sessão principal, filha, intenção, tentativa, ID do evento, tipo, instante e sequência observável. Tipos mínimos: sessão aberta/retomada, turno concluído, filho criado, atividade, pedido de decisão, filho concluído, cancelamento confirmado e falha.

Não considerar `end_turn` do pai como término de todos os filhos. O adaptador deve coletar o resultado tardio, caso o executor permita filhos assíncronos.

### 5.4 CLI, ACP e API

- **CLI:** verificar abertura/retomada, delegação e eventos na versão instalada. Um processo novo com retomada nativa pode preservar a sessão; um processo novo com prompt completo em conversa vazia não preserva. Não inventar flags para alcançar o contrato.
- **ACP:** dividir a conexão e a sessão do ciclo de um prompt. Reutilizar a sessão ou carregar a existente quando comprovado. O suporte de ACP por si só não prova identificação ou controle de filhos.
- **API:** exigiria que o host mantivesse as conversas e o laço de ferramentas. O código inspecionado contém driver Gemini; não presumir adapters de API adicionais prontos.

O alvo de aceitação prioritário é **delegação nativa pela sessão principal**. Uma sessão independente gerenciada pelo host pode ser compatibilidade explícita, mas não encerra o aceite de filhos nativos. Sua adoção deve ser registrada como limitação do conector, com medição separada. Não rotular a execução antiga de “filha” apenas porque recebeu um vínculo no banco.

## 6. Contexto, perfis e modelos

### Contexto do principal

Na abertura, fornecer objetivo da História, regras de coordenação e referências necessárias. Nos turnos seguintes, enviar mudanças desde o cursor confirmado: mensagens da pessoa, decisões, atualizações relevantes de cards/documentos e resumos de filhos. A base do contexto permanece estável quando possível.

O principal não precisa incorporar o corpo de todas as skills dos especialistas, o histórico de todas as ferramentas ou todos os documentos em cada turno. Ele precisa saber o objetivo, quem pode executar, o que foi decidido e onde consultar os resultados.

### Contexto da filha

Gerar a partir do mesmo manifesto que hoje configura a execução do card: objetivo, critérios, perfil especializado, modelo/esforço, regras, skills, MCPs, referências dos anexos, escopo de arquivos e verificação. Não copiar automaticamente o histórico inteiro do principal por escolha do board. Se o executor herdar contexto inevitavelmente, medir e registrar essa característica.

Os anexos continuam na História e são consultados pelos mecanismos atuais. A filha recebe referências e versões efetivamente utilizadas. Após uma edição humana, transmitir à próxima execução a referência atualizada e o resumo da mudança; não criar um novo sistema de armazenamento de documentos.

Não impor um resumo tão curto que oculte falhas, ressalvas ou decisões necessárias. Quando faltar detalhe, consultar uma referência específica ou pedir complemento ao filho, evitando importar todo o histórico. A proteção de contexto deve ser verificada nos payloads e eventos disponíveis, distinguindo conteúdo enviado pelo board de herança automática do executor.

Retorno mínimo da filha: desfecho, resumo, arquivos/artefatos produzidos, verificações e evidências, pendências e decisões necessárias. Preservar os desfechos atuais (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`). Logs extensos permanecem nas saídas e conversas adequadas, sem duplicação automática na principal.

### Perfis e troca de modelo

O perfil da principal é resolvido na abertura e permanece estável. O perfil do card filho é resolvido em cada tentativa. Uma escolha de modelo associada a uma fase especializada deve alimentar sua filha, evitando substituir o principal a cada mudança de coluna.

Definir e testar a precedência com os resolvers existentes: seleção explícita do card, perfil/fase e padrões. Na migração experimental, registrar a configuração resolvida da principal. Não reinterpretar silenciosamente uma configuração personalizada: quando uma política existente exigir alteração incompatível, usar a conversa atual para informar e aplicar a decisão/política já disponível.

Alterar skills/MCPs/modelo de uma tarefa ainda não iniciada afeta sua próxima tentativa. Alterar um trabalho ativo não modifica retroativamente o snapshot; pausar/reconciliar antes de reiniciar quando necessário. Trocar modelo de filho não altera principal. Trocar modelo/provedor da própria principal exige verificar compatibilidade; sem suporte, checkpoint e nova geração nativa, sem alegação de cache preservado.

Preservação de contexto, reutilização de cache e custo são medidos separadamente. Uma sessão longa pode compactar contexto. O checkpoint conserva decisões e referências mesmo quando a janela nativa muda.

## 7. Persistência mínima e consistência

Reaproveitar `WorkRecord`, `WorkAttempt`, logs, anexos e snapshots. Acrescentar somente o que distingue a sessão da História da tentativa de cada card.

| Registro interno proposto | Dados                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão da História        | `boardId`, `storyId`, ID lógico, geração, executor/transporte, ID nativo, fingerprint da configuração, workspace, estado e checkpoint |
| Vínculo de execução filha | Sessão/generation do pai, `workId`, tentativa, ID da intenção, ID nativo da filha, modo efetivo, snapshot e estado                    |
| Entrega de evento/comando | Identidade, destinatário, estado de envio/confirmação e cursor; pode reaproveitar infraestrutura existente após inspeção              |

Restrições: uma principal ativa por História; uma associação vigente por intenção/tentativa; evento de conclusão aplicado uma vez. IDs nativos, processos e tokens são locais à instalação e não devem ser exportados como sessão utilizável em outra máquina.

Separar generation de sessão de generation da tentativa. O erro de um filho pode criar nova tentativa sem recriar o pai. A perda do pai pode criar nova geração de sessão sem apagar resultados de tentativas anteriores.

### Janela entre persistência e execução externa

1. Gravar intenção antes de delegar.
2. Confirmar o filho observado e gravar o vínculo.
3. Gravar retorno e resultado conferido antes de liberar a próxima unidade.
4. Entregar o resumo à principal com ID estável e marcar sua confirmação quando observável.

Se a extensão cair entre 1 e 2, consultar os eventos/filhos do executor. Se não for possível saber se houve delegação, manter a tentativa em reconciliação, sem criar outro escritor. Não prometer exatamente uma execução externa quando o transporte não oferece idempotência ou consulta; garantir que a incerteza não produza reexecução cega.

Se cair após a conclusão e antes do resumo, reapresentar o resultado persistido ao pai sem executar a tarefa novamente. Entregas repetidas devem usar o mesmo identificador para evitar que o principal interprete dois resultados como duas tarefas distintas.

## 8. Autoridade MCP, admissão e recursos

A mudança precisa conservar o acesso definido no card. O contrato individual deve ser aplicado ao executor efetivo; um campo `cardId` no prompt não autentica um filho.

O mecanismo atual associa tokens a tentativas e os revoga ao final. Uma principal longa não pode carregar um token expirado nem receber, por conveniência, acesso amplo permanente a todos os cards. Separar operações de coordenação da principal e operações da tentativa filha. Revalidar fase, posse e geração no host.

Se houver identidade autenticável por filha, vincular suas operações à tentativa correspondente. Se o transporte compartilhar credenciais entre pai e filhos, avaliar mediação pelo host sem expor autoridade indevida. Essa alternativa precisa ser demonstrada; apenas remover ferramentas de uma instrução não impõe isolamento.

Reaproveitar snapshot e manifesto por tarefa. Não unir silenciosamente os MCPs de todos os especialistas na principal e declarar que cada filho tem acesso separado. A seleção de uma skill descreve contexto instruído; a capacidade de impedir leitura de outros arquivos é outra propriedade.

**Decisão para o piloto Codex ACP (02/11/2026):** os filhos nativos herdam os MCPs e a política de permissões da principal. O usuário aceita disponibilizar na principal os MCPs previstos para as subtarefas, desde que o board confira isso antes de cada delegação. O controlador deve calcular os servidores exigidos pelo manifesto da tarefa, compará-los com os servidores efetivamente configurados e prontos na sessão ACP, e impedir a delegação com motivo na conversa quando faltar algum. Para subtarefas criadas depois da abertura, deve carregar a sessão com a lista ampliada, confirmar o servidor e só então delegar. Uma [sonda real delimitada](../teste_modos/resultados/r1-codex-acp-retomada.md) comprovou que o `codex-acp` 2.2.2 acrescentou um MCP à principal via `session/load`; a herança efetiva pela filha ainda precisa do teste R2.

Essa decisão concede à principal e aos outros filhos acesso potencial aos mesmos servidores durante a sessão. A lista de MCPs no card continua orientando a tarefa e a conferência, mas não constitui isolamento nativo por filha no Codex. A política efetiva de sandbox/aprovação também é herdada. O piloto deve expor essa limitação no registro técnico e testar a mediação que o board consegue impor; onde o host não consegue distinguir a identidade da chamada ou restringir um servidor externo, não afirmar isolamento por card. O modo tradicional conserva a admissão atual.

A admissão deve permitir somente as delegações previstas para a unidade atual. A negação tradicional de delegação continua no caminho tradicional. Uma chamada nativa que cria filho inesperado exige tratamento; não se deve concluir o card com configuração divergente.

### Reservas, cancelamento e limites

A worktree pertence à História, mas a reserva de escrita pertence ao trabalho ativo. O principal coordenador não disputa a mesma reserva com sua filha. Filhos de leitura também devem obedecer ao contrato; shell e MCP podem produzir efeitos.

Cancelar uma subtarefa encerra/reconcilia seu filho e sua tentativa, preservando a principal quando possível. Cancelar a História abrange todos os filhos e o transporte. Se o conector só permitir cancelamento global, registrar a limitação e recuperar o pai por checkpoint após confirmar o encerramento dos escritores.

Timeout de tarefa ativa não equivale a timeout da sessão ociosa aguardando a pessoa. Cota esgotada suspende novos turnos do executor afetado, preserva checkpoint e usa os mecanismos existentes de espera/fallback. Fallback da filha não deve trocar o pai sem necessidade; combinação de provedores exige suporte comprovado ou compatibilidade explicitamente identificada.

## 9. Ciclo de vida e recuperação

Estados internos sugeridos: `opening`, `idle`, `active`, `waiting`, `suspended`, `recovering`, `closed`. Não são novas colunas ou novos estados visuais do card.

| Situação                            | Ação                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Filha concluiu                      | Conferir resultado, notificar principal, encerrar tentativa; principal permanece disponível          |
| Turno pai concluiu com filha ativa  | Manter acompanhamento da filha; não liberar o escritor                                               |
| Pessoa precisa responder            | Persistir checkpoint e aguardar pelos mecanismos atuais; não gastar turnos de polling                |
| Extensão foi reaberta               | Reconciliar processos/reservas, recuperar sessão, conferir configuração e consumir eventos pendentes |
| Sessão nativa não pode ser retomada | Reconstruir principal com checkpoint, registrar nova geração e motivo na conversa/log                |
| Filho falhou parcialmente           | Preservar diff e evidências; não repetir antes de conferir efeitos e elegibilidade                   |
| Documento/configuração mudou        | Entregar alteração relevante no próximo turno; invalidar continuação incompatível                    |
| História concluída/arquivada        | Encerrar recursos, conservar vínculos e histórico                                                    |
| História reaberta                   | Revalidar sessão/workspace; retomar se compatível ou reconstruir com histórico explícito             |

Checkpoint: objetivo e decisões, IDs/revisões de documentos, mensagens entregues, tarefas/tentativas concluídas, trabalho parcial, pendências, fase atual, configuração efetiva e estado conhecido da worktree. Usar referências ao banco e aos arquivos existentes em vez de replicar todo o conteúdo.

## 10. Evidência disponível e pendências do conector

Fontes: [plano anterior](../docs/plano-execucao-hibrida-board.md), [consolidado das sondas](../teste_modos/resultados/consolidado.md) e relatórios individuais nele referenciados. Não houve nova sonda nesta revisão.

| Executor testado/documentado  | Evidência local                                                                                                                      | Pendência para a sessão por História                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI 0.163.0 / ACP 2.2.2 | Delegação real observada; a sessão principal retomou e recebeu um MCP novo via `session/load`; o app-server expôs ID nativo da filha | A sonda ACP ainda não recebeu eventos de ciclo de vida da filha; resolver essa lacuna, cancelamento e nova delegação após retomada antes de ativar pelo board |
| Kimi 2.4.1 CLI / ACP          | Delegação e seleção de ferramentas/MCP; carga de sessão ACP                                                                          | Novo trabalho após retomada, cancelamento e integração; shell não equivale a isolamento de recursos                                                           |
| Claude CLI                    | Fixture anterior e informação documental recuperada                                                                                  | Reteste atual dos requisitos; documentação não vale como nova execução                                                                                        |
| Cursor CLI / ACP              | Execução interrompida por cota                                                                                                       | Testar cenário de fato                                                                                                                                        |
| Antigravity CLI / ACP         | CLI delegou; observação ACP parcial                                                                                                  | Resultado tardio, retomada, cancelamento e integração                                                                                                         |
| API                           | Driver Gemini encontrado no produto                                                                                                  | Orquestração proposta e demais adapters não comprovados no produto                                                                                            |

As sondas negativas são da configuração e versão registradas, não uma conclusão universal sobre o fornecedor. O próximo teste deve resolver a lacuna concreta, evitando repetir sondas já suficientes.

Codex permite avançar no desenvolvimento conforme a disponibilidade informada pelo usuário. Isso não comprova que o conector instalado já atende à execução final. Se a sonda bloquear o modo nativo, a conclusão deve registrar o requisito faltante; o modo gerenciado não substitui essa prova.

## 11. Entregas de implementação

As entregas abaixo modificam o runtime em fatias verificáveis. Quando convertidas em cards, usam o fluxo existente. Cada entrega inclui o caminho vertical suficiente para demonstrar seu aceite, sem exigir remodelagem visual.

### R0 — Caracterizar o fluxo atual e provar o contrato mínimo do conector

**Tarefas:** mapear todos os gatilhos que chegam ao runner; capturar cenário com uma História e duas subtarefas; registrar sessões/processos, prompts e consumo disponíveis; testar somente lacunas de delegação, identidade, retomada e cancelamento do Codex.

**Arquivos de partida:** `test/scenarios/`, fixtures de executor, `src/extension/runner.ts`, `orchestrator.ts`, `ai/acp/`, `aiOutput/`, resultados em `teste_modos/`.

**Aceite:** baseline reproduzível identifica as execuções independentes; matriz separa suportado, falhou e desconhecido; existe decisão fundamentada de CLI/ACP para o primeiro adaptador. A demonstração sintética não é rotulada como teste real.

**Dependência:** nenhuma. **Verificação:** cenário atual e sondas delimitadas com logs sanitizados. Não altera comportamento do usuário.

### R1 — Dois trabalhos da História usam a mesma principal

**Tarefas:** persistir sessão por História; implementar controlador e fila; extrair preparação do runner; abrir/retomar principal; separar final de turno de final de sessão no gateway; rotear `story` e `closing`.

**Arquivos:** `src/extension/runner.ts`, `orchestrator.ts`, `ai/gateway.ts`, `repositories/workRepo.ts`, nova migração em `db/schema.ts`, novos módulos internos de sessão e adaptador selecionado.

**Aceite:** dois comandos autorizados para a mesma História usam o mesmo ID nativo em condições normais; duas Histórias não compartilham conversa; fim de turno não perde a principal; nenhum recurso ativo fica sem dono.

**Dependência:** R0. **Verificação:** cenário integrado com executor falso e piloto real de dois turnos; migração de banco existente. Feature experimental ainda desabilitada por padrão.

### R2 — Subtarefa real executada como filha da principal

**Tarefas:** encaminhar `subtask` para delegação; congelar manifesto; persistir intenção e vínculo; normalizar eventos; aplicar admissão e autoridade MCP; devolver resultado ao pipeline de conferência atual.

**Arquivos:** `src/shared/orchestration.ts`, `executionAdmission.ts`, `src/extension/orchestrator.ts`, `ai/admission.ts`, `ai/capabilityVerifier.ts`, `mcp/runSessions.ts`, `runArtifactSnapshot.ts`, gateway e adaptador.

**Aceite:** dois cards de subtarefa geram duas filhas da mesma principal, com seus perfis e evidências; existe um escritor; os cards recebem resultado pelos mecanismos atuais; configurações de filha não substituem as da principal; evento duplicado não duplica conclusão.

**Dependência:** R1 e capacidades necessárias comprovadas em R0. **Verificação:** história pelo board, teste de acesso negado e cancelamento, cenário de filho assíncrono. Sem prova nativa, o aceite nativo permanece aberto.

### R3 — Aprovação e conversa continuam a principal entre fases

**Tarefas:** rotear mensagens e aprovações para principal existente; manter cursor; continuar/recriar filha após ajuste; atualizar instruções do modo novo; integrar fases documentais e referências aos anexos.

**Arquivos:** `src/extension/flowSkill.ts`, `unitAdvice.ts`, `mcp/format.ts`, `runner.ts`, controlador de sessão e handlers/gatilhos atuais identificados em R0. Atualizar templates de instrução somente onde necessário.

**Aceite:** Discovery → aprovação → PRD → Spec → Plan acontece nas colunas atuais, usando anexos e conversa atuais, com a mesma principal; ajuste em documento chega ao especialista correto; pergunta respondida não cria principal nova; a IA não recebe instruções simultâneas de delegar e proibir delegação.

**Dependência:** R2. **Verificação:** cenário integrado e uma execução real com edição humana e resposta a uma pergunta; regressão do modo tradicional.

### R4 — Implementação, revisão e correção usam filhas

**Tarefas:** adaptar a trilha direta para delegação no modo novo; integrar tarefas de implementação, revisão e diagnóstico/correção; preservar dependências, política de modelos, checklists e fechamento; entregar resumos ao principal; distinguir resultado reprovado de tarefa concluída.

**Arquivos:** `orchestrator.ts`, `src/shared/orchestration.ts`, `src/shared/links.ts`, `unitAdvice.ts`, `flowSkill.ts`, `mcp/format.ts` e controlador/adaptador.

**Aceite:** uma etapa descrita no plano, com duas tarefas e um card revisor dependente, passa pelo ciclo de falha → diagnóstico → decisão na conversa → correção → revisão; o aceite original não muda; a principal permanece; nenhuma nova entidade visual é necessária.

**Dependência:** R3. **Verificação:** defeito controlado no cenário e teste pelo board; revisão independente conforme configuração atual; diferenças entre principal/filho e modelos confirmadas pelos eventos disponíveis.

### R5 — Queda, limite e cancelamento recuperáveis

**Tarefas:** checkpoint e reconciliação; confirmação de encerramento; suspensão/retomada; tratamento de intenção sem ACK; revogação de tokens; mudança incompatível de configuração e fallback conforme políticas existentes.

**Arquivos:** controlador, `repositories/workRepo.ts`, `workspaceLock.ts`, `mcp/runSessions.ts`, `ai/gateway.ts`, `runner.ts` e adaptador.

**Aceite:** reabrir extensão e delegar novo trabalho preserva contrato; resultado concluído não executa novamente; nenhum filho escreve após liberar a reserva; principal reconstruída fica identificada; pendência humana não consome turnos periódicos.

**Dependência:** R2; integração final com R4. **Verificação:** falhas em cada janela de persistência e sonda real com novo filho após retomada, incluindo cancelamento com observação de escrita tardia.

### R6 — Medir, validar compatibilidade e promover

**Tarefas:** atribuir consumo/tempo a principal, filhos e retries usando registros existentes; comparar modo tradicional e novo; validar instalação e atualização; ativação gradual e rollback; documentação de comportamento e instruções atualizadas em PT/EN.

**Arquivos:** `src/extension/log/cardUsage.ts`, leitores de consumo, configuração/admissão e templates estritamente necessários; docs e cenários. Manter componentes e gestos atuais.

**Aceite:** fluxo completo passa pelo board e pelos critérios da seção 12; instalação nova usa o modo comprovado; instalação existente conserva personalizações; desativar experimental preserva dados e não concorre com filhos ativos.

**Dependência:** R4 e R5. **Verificação:** comparação real, migração e rollback. Adapters de outros provedores entram depois em entregas independentes com o mesmo contrato.

**Limitação de medição no piloto ACP:** os eventos de ciclo de vida das filhas não carregam uso, e `ai_runs` não tem vínculo de atribuição com a intenção ou sessão filha. Portanto, o uso informado no turno da principal não pode ser separado com segurança do uso das filhas, nem deduplicado contra linhas registradas nas subtarefas. Até que o adaptador forneça uso por filha ou outra evidência equivalente, atribuição principal/filhas e comparação de custo do modo novo ficam **desconhecidas**; não inferir valores a partir da soma de `ai_runs`.

Para cada entrega de runtime: cenário do caminho real do card, testes relacionados, typecheck, lint e formatação; build da extensão antes de testes MCP. Antes de concluir história/abrir PR, `npm run validate`; suíte completa em release conforme `CLAUDE.md`.

## 12. Aceitação e eficiência

### Aceitação funcional obrigatória

| Cenário          | Evidência exigida                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Mesma UX         | Fluxo completo usando colunas, anexos, conversa e comandos existentes; sem novas telas obrigatórias      |
| Continuidade     | Mesmo ID nativo do principal entre tarefas e fases quando não houve reconstrução                         |
| Filhas reais     | Eventos do executor associam cada subtarefa à principal, além do vínculo no banco                        |
| Especialização   | Perfil/modelo/contexto efetivos correspondem ao contrato do card; limitações registradas                 |
| Conversa         | Resposta humana chega à execução correta uma vez; nenhuma outra principal nasce para atendê-la           |
| Documentos       | Anexos e revisões continuam acessíveis pelo mecanismo atual e chegam à filha seguinte                    |
| Revisão/correção | Revisor independente conforme política, decisão humana e aceite original preservados                     |
| Recuperação      | Novo trabalho após retomada; tarefa concluída não repete; resultado incerto não causa escritor duplicado |
| Cancelamento     | Escritor encerrado antes de liberar tarefa seguinte                                                      |
| Compatibilidade  | Modo tradicional e boards existentes continuam válidos                                                   |

Testar com uma História pequena pelo runner, gateway, banco e orquestrador reais, com fases documentais e duas etapas verticais descritas no plano. Na primeira etapa, ao menos duas tarefas e um revisor. Usar um defeito controlado para exercitar correção. Fechar/reabrir a extensão e responder na conversa durante o percurso.

Teste adicional obrigatório: tarefa pequena da trilha direta e falha de uma filha. Nos dois casos, comprovar que pesquisa, implementação e verificações continuam delegadas; a principal apenas coordena. Inspecionar entradas e retornos para conferir contexto delimitado, ausência de cópia automática dos logs completos pelo board e presença de evidências suficientes.

### Comparação de custo e velocidade

Executar tradicional e novo em bases equivalentes, mesmos objetivos, modelos e verificações sempre que possível. Não executar a segunda rodada sobre código já resolvido. Registrar ordem, versões e condições de cache; repetir em pelo menos três histórias antes da promoção.

Medir: tempo ativo, fila e espera humana separadamente; quantidade de sessões/processos e turnos do principal; tokens de entrada/cache/saída quando disponíveis; consumo total de principal, filhos, revisão e retries; qualidade e problemas da revisão. Não somar filhos novamente se o total do provedor já os inclui. Medida indisponível permanece desconhecida.

Hipótese: menos reconstrução de contexto do principal e menos execuções administrativas reduzem desperdício. Filhos ainda consomem contexto e tokens; herança excessiva pode eliminar o ganho. O modo nativo e qualquer compatibilidade gerenciada devem ter resultados separados.

Promoção proposta: todos os cenários funcionais aprovados, qualidade não piora, tempo ativo mediano melhora e consumo total comparável não aumenta. Economia monetária só pode ser afirmada quando houver medida suficiente. Se o modo novo não melhorar a amostra, investigar a composição de prompts, hidratação dos filhos e overhead antes de torná-lo padrão.

## 13. Migração e limites de escopo

Ativar experimentalmente por configuração interna existente ou flag técnica, sem redesenhar a interface. Na implementação, decidir a localização seguindo o mecanismo de configuração já usado pelo projeto. Uma História em execução tradicional não muda de dono no meio da tentativa: esperar/reconciliar antes de iniciar sua principal.

Migração cria somente registros internos necessários. Não altera colunas, relacionamentos de cards, documentos, nomes de arquivo ou estados de aprovação. Sessões históricas independentes permanecem como histórico; não podem ser fundidas retroativamente em uma sessão nativa.

O rollback interrompe e reconcilia o modo novo antes de liberar trabalho ao runner tradicional. Preserva anexos, comentários, resultados e logs. Se o conector não puder retomar a principal, a recuperação é explícita; não disfarçar uma reconstrução como continuidade.

Ficam fora deste escopo: editor visual de etapas, painel de agentes, árvore de sessões, revisão do mecanismo de anexos, novo chat, alteração geral das políticas de autonomia, publicação automática de aprendizados e criação de novos provedores de API. Os diagramas anteriores devem ser atualizados futuramente para ilustrar a mecânica interna, sem sugerir redesign do board.

## 14. Resultado e próximo passo

O plano foi reescrito para uma mudança de runtime: **História → principal persistente; subtarefas → filhas especializadas; mesma UX do board**. A revisão detalha despacho, autoridade, configuração, retorno, persistência e recuperação, com aceites verificáveis.

O estado de cada entrega deve ser comprovado pelo código, pelos cenários e pelas sondas da branch. R0 caracteriza o caminho atual e fecha as lacunas concretas do conector; R1/R2 devem provar a relação principal/filhas pelo próprio board.

## 15. Conectores na revisão 5 (03/11/2026)

A entrega H6 do plano anterior (Kimi, Claude e Cursor em histórias separadas) foi antecipada para
Claude Code e Kimi Code, pela CLI, com o mesmo controlador, as mesmas tabelas e a mesma reconciliação
do piloto ACP. O contrato interno ganhou o transporte `cli`: o provider declara `storySessions`
(`childModel`: próprio ou herdado; `mcpEvidence`: largada da CLI ou arquivo do board), o leitor da
saída emite os eventos de sessão, MCP, filha e configuração efetiva, e a medição da CLI os entrega ao
runner pelos mesmos ganchos do ACP. A filha é definida pelo board a partir do manifesto da sub-tarefa
(`storySessionCli.ts`): só a principal pode lançá-la, pelo nome, e o board confere esse nome no evento.

| Conector          | Mecanismo                                                                              | Limite registrado                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Claude Code (CLI) | `--resume` + `--agents` por arquivo + `Agent(<filha>)`; `resolvedModel` prova o modelo | esforço da filha vai por parâmetro e não é lido de volta                            |
| Kimi Code (CLI)   | `--agent-file` / `--session`; filha em `.kimi-code/agents/` só durante a execução      | modelo herdado da sessão; allowlist da principal aberta; prontidão MCP pelo arquivo |
| Codex (ACP)       | piloto anterior, sem mudança                                                           | R2 real pendente; sem cerca por filha                                               |
| Antigravity       | tradicional                                                                            | filha assíncrona morre com o processo ACP                                           |
| Cursor            | tradicional                                                                            | sem escopo por subagente                                                            |

Cenários: `test/scenarios/storySessionClaude.scenario.test.ts`, `storySessionKimi.scenario.test.ts` e
`storySession.scenario.test.ts` (ACP). Sondas ao vivo: `teste_modos/resultados/fase1-cli-claude.md` e
`fase1-cli-kimi.md`. O aceite R2 pelo board real e a comparação de custo (seção 12) continuam
pendentes para os três conectores.
