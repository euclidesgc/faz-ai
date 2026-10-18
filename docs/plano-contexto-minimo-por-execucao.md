# Plano: contexto mínimo por execução do board

Status: proposta de implementação. Este documento não altera os cards, os agentes, a biblioteca ou o comportamento da execução.

## Objetivo

Permitir organizar e priorizar o trabalho e decidir antecipadamente quem executa cada atividade, com quais instruções, skills, MCPs e modelo. A execução deve carregar o conjunto necessário à atividade atual, com configuração verificável e resultado mensurável em qualidade e consumo.

A unidade de configuração é **a ação de uma execução**. Uma história tem configurações por fase; uma tarefa tem uma configuração para seu trabalho. Refino, resumo, resolução de conflitos e assistentes também precisam de configurações próprias, sem herdar indiscriminadamente o contexto de implementação.

## Base existente e dependências

Na `develop` analisada:

- `src/shared/execution.ts` resolve o agente por card/coluna/história/padrão, soma skills do agente e do card e soma MCPs do agente, card e modo Sempre. Repetições por nome são eliminadas.
- Histórias também preparam os demais agentes como candidatos à delegação nativa; `src/extension/execution.ts` pode enviar suas instruções à CLI. Isso aumenta o contexto potencial da história.
- `src/shared/contextEstimate.ts` estima o contexto inicial por caracteres. Essa estimativa não é uma previsão exata de consumo total.
- O editor de agentes, a biblioteca e os campos Skills/MCPs dos cards já existem e devem ser aproveitados.

Histórias relacionadas do board, conforme descrições consultadas:

| Referência              | Aproveitamento nesta proposta                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| #621, #823, #824 e #825 | Posse e controle das execuções pelo board, identidade da execução e remoção da delegação nativa. Não criar outro scheduler. |
| #727                    | Snapshot dos artefatos por execução, com revisão/hash e publicação atômica.                                                 |
| #728 e #729             | Credenciais locais e admissão por capacidades, sem ampliação silenciosa de acesso.                                          |
| #730 e #731             | Resolução e simulação de modelo/fallback. Não criar outro motor de políticas.                                               |

Essas descrições incluem entregas previstas ou realizadas em outras branches. Antes de implementar cada dependência, confirmar o que está integrado na `develop`; o texto do card não prova disponibilidade do código.

## Decisões de produto

### 1. Regras gerais e procedimentos específicos

As regras gerais do projeto contêm convenções, estrutura, comandos de validação e obrigações aplicáveis ao projeto inteiro. Procedimentos específicos ficam em skills. Revisar as instruções dos agentes para referenciar procedimentos sem copiar seus corpos.

Regras obrigatórias continuam obrigatórias. Uma redução de contexto nunca pode removê-las ou truncá-las silenciosamente.

### 2. Essencial, disponível e selecionado são estados diferentes

| Configuração                   | Efeito                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Skill essencial do agente      | É carregada em toda execução com esse agente; o card mostra sua origem e não precisa repeti-la. |
| Skill disponível para o agente | Pode ser selecionada para uma atividade, sem carregar seu conteúdo antecipadamente.             |
| Skill adicional da atividade   | É carregada somente na execução configurada.                                                    |
| MCP permitido ao agente        | Define a fronteira de acesso; não obriga sua ativação em toda atividade.                        |
| MCP selecionado na atividade   | É ativado se estiver dentro das autorizações efetivas.                                          |

O catálogo de skills disponíveis também pode orientar sugestões sem funcionar como uma lista de proibição de leitura de código. Já ferramentas e MCPs são capacidades com autorização aplicada pelo runtime.

A configuração pode expressar herança, seleção explícita e seleção vazia. Vazio não pode significar simultaneamente “herdar” e “liberar tudo”. Skills essenciais são exibidas separadamente dos complementos editáveis.

O plano não amplia os limites do board, do agente ou do executor. Um recurso necessário fora dos limites produz um motivo de bloqueio e uma proposta revisável; nunca um aumento automático de permissão. Artefatos em Sempre também precisam respeitar esses limites.

### 3. Plano da história e plano da tarefa

A história mostra uma tabela por fase/ação com agente, modelo, skills, MCPs, entradas, resultado esperado e estimativa de contexto. A tarefa mostra a configuração do seu trabalho, com dependências e critérios de conclusão.

O catálogo apresentado ao planejador inclui nomes, responsabilidades e descrições curtas dos especialistas. As instruções completas são carregadas somente na execução do especialista escolhido.

A configuração tem origem visível: padrão do workflow, padrão da ação, agente ou escolha explícita no card. O resolvedor publica a precedência usada. Trocar o agente não copia silenciosamente escolhas do anterior para o novo; escolhas incompatíveis permanecem visíveis para revisão.

Para o agente no contrato novo, a precedência é: escolha explícita na ação do card, configuração da fase/ação no workflow e padrão do board para essa ação. Uma tarefa de implementação não herda implicitamente o condutor da história: precisa de uma escolha válida, explícita ou de um padrão aplicável à tarefa. A prévia mostra o caminho de resolução. A precedência de modelo e fallback permanece no motor de políticas existente.

Durante Discovery, o plano é preliminar. No Plan, é detalhado em tarefas executáveis. Alterações em requisitos, dependências, agente ou revisões dos artefatos marcam a proposta como desatualizada. Reordenar a prioridade não exige refazer a inferência.

### 4. Execução controlada pelo board

Prioridades, dependências, limites, disponibilidade e exclusão de escrita são tratados pelo código do orquestrador existente. A IA propõe decomposição e escolhas; não controla a fila nem grava políticas de autorização executáveis.

Cada execução recebe objetivo, critérios de aceite, referências necessárias e resultados anteriores relevantes. Ao terminar, devolve um resultado estruturado: entrega, arquivos/artefatos, verificações e pendências. A etapa seguinte consulta evidências completas quando precisar, sem carregar toda a conversa por padrão.

## Modelo de dados proposto

Nomes abaixo são conceituais; ajustar ao domínio integrado na branch de implementação.

- **Contrato do agente, versionado:** papel, instruções, skills essenciais, skills sugeridas/disponíveis, MCPs permitidos e restrições de ferramentas.
- **Seleção da atividade:** card, ação/fase, agente explícito ou herdado, skills adicionais, MCPs ativos, referências de entrada e resultado esperado. Modelo explícito/herdado continua compatível com o motor de políticas.
- **Proposta de plano:** justificativas, revisão das entradas usadas, estado de revisão e indicação de desatualização.
- **Configuração resolvida:** agente, artefatos efetivos, origem de cada item, ferramentas permitidas, estimativa de contexto e impedimentos.
- **Snapshot da execução:** configuração resolvida, revisões/hashes, decisão de modelo/política e identidade do run. Reutilizar #727 e as políticas existentes.

As identidades persistidas usam IDs estáveis dos artefatos e das fases, não seus nomes editáveis. Nomes continuam na apresentação e nos formatos legados. Credenciais não entram em plano, exportação, prompt ou logs.

## Entregas propostas

### E1 — Mostrar o contexto efetivo atual

**Escopo:** leitura e apresentação, preservando a execução atual.

- Acrescentar “Contexto da execução” no card e no editor de agentes.
- Mostrar agente, regras, skills, MCPs e sua origem, com tamanho estimado e possíveis instruções sobrepostas.
- Distinguir tamanho do contexto inicial, consumo medido e estimativa de consumo futuro.
- Usar a resolução existente; a prévia não cria execução nem chama a IA.

**Aceite:** itens coincidem com o manifesto atual; item repetido por identidade aparece uma vez, com todas as origens. Configuração não suportada pelo executor é apresentada sem prometer isolamento que ele não imponha.

**Áreas:** `src/shared/execution.ts`, `src/shared/contextEstimate.ts`, protocolo host–webview e componentes do card/Harness.

### E2 — Contratos e seleções versionados, com migração conservadora

**Depende de:** E1.

- Introduzir os tipos, persistência, validação, export/import e leitura das configurações propostas.
- Criar migração nova a partir do schema integrado; não reservar agora um número de migração.
- Manter separadas a configuração legada e a nova, com versão explícita.
- Skills atuais dos agentes permanecem essenciais na migração; skills dos cards permanecem selecionadas. Nenhum item é removido ou desativado automaticamente.
- Manter o comportamento dos MCPs legados até revisão explícita, sem transformar a união histórica em autorização global de um agente. Sinalizar incompatibilidades ao propor conversão ao contrato novo.

**Aceite:** abrir um board existente preserva sua configuração efetiva. Export/import preserva o contrato e suas versões sem segredos. O comportamento legado tem indicação clara e não é interpretado como novo contrato restritivo.

### E3 — Resolvedor único e editor dos contratos dos agentes

**Depende de:** E2; integrar #729 para os limites aplicáveis.

- Criar a resolução pura da configuração nova: mesmas entradas produzem o mesmo resultado, sem inferência ou efeito colateral.
- Separar na UI skills essenciais, sugestões e MCPs permitidos, com explicação e prévia.
- Resolver herança, seleção vazia, duplicatas, recursos ausentes/desligados e seleção fora do escopo.
- Definir uma entrada de prévia que reutiliza o mesmo resolvedor da futura execução. Protocolo e API MCP de leitura mostram metadados seguros, sem corpos ou credenciais desnecessários.

**Aceite:** essenciais aparecem herdados; opcionais não entram antes de selecionados; incompatibilidades são explicadas. A interface não consegue contornar a validação do host.

### E4 — Plano por fase e configuração das tarefas

**Depende de:** E3.

- Criar o painel “Plano de execução” na história e a configuração compacta na tarefa.
- Permitir ajustar agente, modelo, skills e MCPs por fase/ação, com entradas e resultado esperado.
- Mostrar origem, justificativa, diferenças e impacto estimado antes de aplicar alterações em lote.
- Manter critérios de aceite e dependências como referências às estruturas existentes, evitando cópias que possam divergir.
- Incluir refino, resumo e resolução de conflitos no catálogo de ações; mapear também as ações sem card, como os assistentes do Harness.

**Aceite:** uma história pode planejar Discovery com leitura e implementação com especialistas; a tarefa recebe só a configuração do seu trabalho. Seleções da implementação não aparecem automaticamente no refino ou no resumo.

### E5 — Aplicar o plano em todas as execuções

**Depende de:** E4 e dos contratos integrados de #727, #729, #824/#825 e #730/#731.

- Aplicar o resolvedor antes do spawn e fixar a configuração no snapshot do run.
- Fazer runner, chat e assistentes passarem pelo gateway e pela mesma admissão.
- Usar o orquestrador existente para iniciar os especialistas, com limites e posse por workspace.
- Consumir o snapshot também nas leituras MCP da execução; editar a biblioteca não muda um run ativo.
- Ativar apenas os MCPs previstos. Restrição por ferramenta de um servidor depende da capacidade efetivamente aplicada pelo gateway/executor; onde só houver seleção por servidor, mostrar essa granularidade.
- Retirar os demais agentes do payload da história conforme #825, mantendo apenas metadados necessários ao planejamento.

**Aceite:** prévia e snapshot usam o mesmo resolvedor; a execução pode diferir da prévia antiga somente com explicação de revisão/estado. Card sem recurso obrigatório válido não inicia. Queda, cancelamento e resposta tardia seguem a reconciliação existente. Nenhum caminho de IA executa ignorando o plano.

### E6 — Sugestão e revisão do plano com IA

**Depende de:** E4 e E5.

- Reaproveitar o gateway e o padrão de rascunho/revisão já usado pelos assistentes.
- Propor configuração mínima a partir da tarefa e do catálogo resumido, justificando cada artefato adicional.
- Sugerir padrões da ação/fase e complementos específicos, evitando repetir skills essenciais.
- Comparar proposta e configuração vigente. Alterar autorizações exige o fluxo explícito de configuração; a proposta da IA não as altera.
- Versionar o que foi revisado. A aplicação respeita as aprovações e o modo de autonomia já definidos, sem criar novas passagens automáticas de fase.

**Aceite:** falha ou cancelamento preserva o rascunho; proposta inválida não grava; mudança nas entradas marca a revisão como desatualizada. Prioridades definidas pela pessoa permanecem preservadas.

### E7 — Revisar os artefatos e validar o ganho em um piloto

**Depende de:** E5; E6 pode ajudar na revisão.

- Revisar o condutor, o analista, os especialistas e o revisor. Propor o papel de planejador apenas se as ações existentes não atenderem com instruções pequenas.
- Reduzir as rules a orientações gerais, eliminar repetição textual e mover procedimentos para skills focadas. Revisar os itens em Sempre, incluindo `faz-ai-fluxo` e `code-review-graph`: propor um núcleo comum pequeno e procedimentos do fluxo por ação, com revisão das mudanças de marcação antes de aplicá-las.
- Gerar propostas de revisão das associações existentes, incluindo as 97 atualizadas nesta conversa. Não fazer nova limpeza em massa antes da comparação.
- Selecionar tarefas representativas de UI, backend, MCP e documentação; incluir uma história atravessando várias fases.
- Comparar tarefas de complexidade e modelo semelhantes, registrando diferenças. O piloto não é uma duplicação automática de todas as execuções reais.

**Aceite:** documentar consumo e qualidade, manter ou corrigir escolhas conforme evidência. Reduzir tokens iniciais sem preservar a qualidade não encerra o piloto com sucesso.

## Sequência e revisão das entregas

```mermaid
flowchart LR
  E1[Contexto atual visível] --> E2[Contratos e migração]
  E2 --> E3[Resolvedor e agentes]
  E3 --> E4[Plano nos cards]
  E4 --> E5[Execução pelo plano]
  D[Snapshots, admissão e orquestração existentes] --> E5
  E5 --> E6[Sugestão com IA]
  E5 --> E7[Piloto e revisão dos artefatos]
  E6 --> E7
```

Cada entrega acima é um agrupamento de trabalho, não uma promessa de um único PR. Na fase Plan, recortar em histórias/tarefas verificáveis e PRs pequenos, declarar sobreposição de arquivos e integrar na `develop`. Não duplicar cards já existentes de infraestrutura; registrar o vínculo e adaptar seus critérios de aceite quando necessário.

A primeira entrega utilizável é E1. E2–E4 permitem preparar e revisar escolhas; a configuração nova só passa a governar execuções com E5. Nenhuma etapa pressupõe release ou deploy imediato.

## Validação e indicadores

- **Resolvedor:** herança, vazio explícito, essenciais, duplicatas, recurso removido, limites do agente/board, agente trocado e fase renomeada.
- **Persistência:** migração a partir de board existente, revisões, export/import e preservação dos campos e escolhas atuais.
- **UI:** origem de cada item, troca de agente, seleção entre fases, conflitos, loading, rascunho preservado e acessibilidade.
- **Runtime:** igualdade de resolução entre prévia e execução, todas as portas de inferência, snapshot ativo imutável, MCP fora do plano recusado e retomada sem execução duplicada.
- **Qualidade e custo:** tokens de entrada/cache/saída quando medidos, ferramentas chamadas, tentativas, duração, correções na revisão e intervenções da pessoa. Consumo desconhecido permanece desconhecido.

O indicador principal é **consumo total por tarefa aceita**, acompanhado de retrabalho e intervenções. Estimativa de contexto inicial serve para decidir entre planos; previsão de custo total usa intervalos e histórico comparável, sem confundir tamanho do prompt com consumo da tarefa inteira.

Ao integrar cada mudança de comportamento, atualizar testes pertinentes, README/CHANGELOG nos dois idiomas e `docs/mcp.md` quando houver mudança de contrato. Notas de release descrevem somente o comportamento efetivamente integrado.

## Fora do escopo desta proposta

- Criar um agente para cada botão ou iniciar vários agentes para toda tarefa.
- Um novo scheduler ou um segundo avaliador de modelo/fallback.
- Trocar prioridades, afrouxar autorizações ou reduzir critérios de qualidade automaticamente.
- Reescrever descrições, modificar cards concluídos ou executar o piloto como efeito de criar este documento.
