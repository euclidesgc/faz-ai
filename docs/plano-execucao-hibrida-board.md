# Execução híbrida do board com subagentes

Planejamento retomado em 02/11/2026. Estado: proposta de implementação, sem alteração de runtime.

## Objetivo e critério de produto

Esta é uma melhoria da extensão Faz AI. O teste de aceitação acontece **pelo próprio board**,
executando uma história real. Uma sessão manual com subagentes ou uma sonda ACP isolada não
comprova a funcionalidade. As sondas verificam somente capacidades dos conectores.

A história deve ser dona da sessão e da worktree. Suas sub-tarefas continuam visíveis como cards,
mas passam a ser executadas por subagentes coordenados pela sessão da história, quando o conector
comprovar as capacidades necessárias. Planejamento e Implementação usam essa coordenação;
aprovações continuam sendo respeitadas. Revisão permanece em uma execução independente.

Depois de passar pelos critérios abaixo, a execução híbrida será o **padrão de novas instalações**,
sem exigir configuração manual. Conectores sem suporte comprovado usam execuções separadas,
com motivo visível. A primeira entrega fica experimental até concluir o teste real pelo board.
Atualizações de boards existentes preservam personalizações e têm migração testada.

## O que foi recuperado

Sessão Claude: `43f1dfbe-70c0-4c20-9a61-dfef9c039f23`, título
“Discutir como tornar a execução pelo board mais rápida”.

Fontes locais:

- Histórico em `~/.claude/projects/-Users-euclidesgc-development-faz-ai--claude-worktrees-board-chat-communication-ef98d9/43f1dfbe-70c0-4c20-9a61-dfef9c039f23.jsonl`.
- Notas `board-velocidade-plano.md` e `board-velocidade-subagentes.md` em
  `~/Library/Application Support/Claude/side-session-notes/local_614f1c51-e74d-4f88-bd31-b403c73ea60a/`.
- Sondas `probe/sonda.mjs` e `probe/espiao.mjs`, no scratchpad dessa sessão em `/private/tmp/claude-501/`.

A discussão começou com otimizações da fila e das revisões. Depois, a pessoa pediu explicitamente
reavaliar a proibição de subagentes e adotar a história como dona da sessão. A conclusão inicial
“não recomendo delegação” foi superada por esse pedido e pela investigação posterior.

O limite semanal interrompeu a investigação depois de duas sondas Codex. O histórico registra:

- Pai e filho chamaram o MCP de teste; os metadados identificaram threads diferentes e a relação pai/filho.
- O ACP mostrou início e conclusão do filho como chamadas na sessão principal. O coletor registrou
  `spawned: []`, portanto ainda não há comprovação de sessões de filhos observáveis pela capability anunciada.
- Em modo somente leitura, houve pedidos de permissão e recusas; `filho.txt` apareceu e
  `proibido.txt` não apareceu na listagem registrada. Os pedidos foram associados ao pai.
- Cancelamento, recuperação e atribuição completa de consumo não foram demonstrados.
- Kimi e Antigravity ainda precisavam da sonda ao vivo. Cursor estava sem créditos segundo a conversa.

As notas antigas são evidência histórica, não uma matriz de suporte aprovada. Em especial,
“Codex basta anunciar a capability” e “Kimi pode ligar usando logs posteriores” precisam de validação.
O ajuste de layout foi relatado na sessão como entregue no PR #484; seu estado atual não foi verificado aqui.

## Desenho proposto

1. A sessão condutora pertence à história, com identidade persistida e checkpoints por sub-tarefa.
   Um processo não precisa ficar vivo durante espera por aprovação. Retomar requer revalidar estado,
   permissões, modelo, base e worktree; se incompatíveis, reconstruir a sessão pelo checkpoint.
2. Um subagente recebe objetivo, critérios de aceite, arquivos permitidos/proibidos, dependências,
   comandos de verificação e resumo das decisões. Evitar transmitir todo o histórico por padrão.
3. Apenas um escritor ocupa a worktree. Leituras independentes podem ocorrer em paralelo, limitadas
   inicialmente a dois filhos. O condutor não edita enquanto um filho escritor atua.
4. O board mantém a autoridade sobre início, conclusão, aprovação, orçamento e dependências.
   Uma mensagem “terminei” do filho não conclui o card: evidências, diff e verificações são conferidos.
5. Revisão independente continua fora da árvore de implementação, respeitando a política de modelos
   do board. O filho não pode aprovar a história nem concluir a revisão do próprio trabalho.
6. O modo tradicional permanece disponível por compatibilidade e recuperação. Uma queda só permite
   retomada depois de confirmar encerramento do escritor anterior e reconciliar mudanças parciais.

### Contrato e consumo

- Não remover `NO_DELEGATION` globalmente. Separar admissão de execução tradicional e delegação controlada.
- Não ampliar o token da história para todos os filhos só porque a chamada menciona um card.
  Vincular identidade observada do filho à sub-tarefa e limitar operações no gateway. Se o transporte
  não permite identificar o filho com confiança, avaliar condutor como único escritor do estado do
  board; habilitar apenas depois de demonstrar essa restrição.
- Registrar história, execução, sessão, filho, sub-tarefa, modelo solicitado/efetivo, tentativa,
  início/fim, resultado e checkpoint. Escrita e conclusão precisam ser idempotentes na recuperação.
- Distinguir consumo medido, estimado e indisponível. Nunca somar filhos a um total que já os inclui.
  Contexto ocupado não é consumo faturado. Logs posteriores ajudam auditoria, mas não impõem limites
  nem permissões em tempo real.
- Interrupção por limite semanal preserva checkpoint e deixa o trabalho retomável. Troca de provedor
  não promete preservar a sessão nativa nem o cache do anterior.

## Implementação com subagentes de menor custo

O condutor desta implementação cuida dos contratos, integração e revisão do núcleo. Delegar tarefas
delimitadas a `gpt-6-luna` com contexto novo e esforço médio, disponível nesta sessão e no catálogo
consultado do board. A escolha é uma estratégia a medir; não há estimativa de preço confirmada aqui.
Não confundir esse uso para desenvolver a extensão com o teste de aceitação dentro dela.

| Trabalho | Execução proposta | Limite |
| --- | --- | --- |
| Fixtures, normalização pura de eventos, documentação | Luna | Um objetivo verificável e arquivos explícitos |
| Adaptador com contrato já definido | Luna, revisão pelo condutor | Sem mudar admissão ou banco por iniciativa própria |
| Admissão, autorização MCP, persistência e recuperação | Condutor | Revisão independente obrigatória |
| Diagnóstico que falhou duas vezes pelo mesmo motivo | Escalonar ao condutor | Evitar ciclos de tentativas baratas sem progresso |
| Revisão final | Execução independente | Não usar o próprio implementador como aprovador |

No produto, modelos são selecionados pelo catálogo e pela política do board, sem fixar Luna no
runtime. Confirmar suporte do modelo no provedor efetivo. Registrar substituições e não trocar para
um modelo mais caro silenciosamente. Antes de cada lote, comparar disponibilidade e consumo restante.

A documentação [OpenAI sobre multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent)
reforça que delegação pode aumentar tokens e que tarefas delimitadas têm contexto próprio. Essa
documentação da API não comprova comportamento do adaptador ACP instalado. Economia de cache
continua sendo hipótese a medir, e não justificativa suficiente para habilitar o recurso.

## Entregas e dependências

Cada entrega vira história revisável, idealmente até cerca de 400 linhas de implementação; dividir
as maiores em histórias derivadas. Ainda não foram criados cards nem ativadas execuções automáticas.

| ID | Entrega e arquivos de partida | Depende de | Pronto quando |
| --- | --- | --- | --- |
| H0 | Concluir sondas e gerar fixtures sanitizadas; `test/fixtures`, `test/fakes/acpAgent.ts` | — | Matriz por versão/provedor comprova identidade, modelo efetivo, MCP, negação, cancelamento e consumo ou sua ausência |
| H1 | Contrato de delegação por capacidade; `src/shared/executionAdmission.ts`, `src/extension/ai/admission.ts`, `capabilityVerifier.ts` | H0 | Negação tradicional preservada; híbrido exige evidência válida; provedor não comprovado recebe motivo de incompatibilidade |
| H2 | Identidade e autorização dos filhos; `src/extension/mcp/runSessions.ts`, `boardGateway.ts`, transporte ACP | H1 | Filho não altera card alheio, não amplia acesso e não aprova história; chamadas repetidas não duplicam transições |
| H3 | Checkpoints e ciclo de vida; `src/extension/db/schema.ts`, `repositories/`, `orchestrator.ts`, `workspaceLock.ts` | H2 | Reinício, cota e cancelamento preservam trabalho, encerram escritores e não repetem sub-tarefa concluída |
| H4 | Sessão da história no Plan/Implementação; `src/shared/orchestration.ts`, `orchestrator.ts`, `runner.ts`, `flowSkill.ts` | H3 | Board delega uma sub-tarefa real, recebe evidências e prossegue sem abrir processo independente para cada parte |
| H5 | Piloto Codex e medição; `src/extension/ai/acp/models.ts`, `run.ts`, leitores em `aiOutput/`, cenários | H4 | História real passa pelo board; modelos e eventos reais batem com os cards; revisão permanece independente |
| H6 | Suporte adicional a Kimi, Claude e Cursor em histórias separadas | H5 e H0 de cada provedor | Cada conector passa pelos mesmos cenários; logs posteriores sozinhos não liberam delegação |
| H7 | Tornar padrão e documentar; `boardTemplate.ts`, `phaseDefaults.ts`, configuração/UI e docs PT/EN | H5 e critérios de aceite | Instalação limpa usa híbrido quando admissível; incompatíveis usam tradicional; atualização preserva personalização |

Antigravity permanece tradicional até comprovar o contrato. Claude não é pré-requisito do piloto,
porque o limite semanal foi o motivo da interrupção. Cursor aguarda disponibilidade para teste real.
Cada história tem seções Objetivo, Pronto quando, Pode tocar e Não pode tocar, além de checklist e
dependências explícitas. Escolher skills/agentes apenas do Harness ativo quando os cards forem criados.

## Teste de aceitação pelo board

Usar uma história de produto pequena, com duas sub-tarefas verificáveis, dependência explícita,
uma única worktree e revisão independente. Executar pelo runner normal da extensão, com o gateway,
admissão, orquestrador, persistência e conversa reais. Sonda isolada não substitui este teste.

1. Instalar a versão candidata num perfil de teste e abrir board de teste. Fazer uma rodada tradicional
   e uma híbrida em cópias equivalentes da mesma base, sem repetir sobre código já resolvido.
2. Confirmar que a história coordena os filhos, cada filho usa o modelo previsto e os cards refletem
   início, resultado e evidência. Demonstrar que não existem dois escritores na mesma worktree.
3. Exercitar sucesso, filho falhando, permissão negada, tentativa de alterar card alheio, cancelamento,
   perda da sessão, reabertura da extensão e limite de consumo. Nos casos controlados, usar processo
   falso nos cenários automatizados e complementar com sondas reais do conector.
4. Comparar tempo ativo e espera, processos iniciados, custo total incluindo coordenação e retries,
   tokens de entrada/cache/saída quando disponíveis, taxa de sucesso e correções da revisão.
5. Validar instalação limpa e atualização de board personalizado; nenhuma aprovação humana pode ser
   pulada e revisão independente deve continuar obrigatória conforme a configuração existente.

Critérios propostos para promoção ao padrão: zero violação de escopo, zero escrita concorrente,
zero duplicação de conclusão, cancelamento/recuperação aprovados e três histórias reais pelo board
concluídas com revisão independente. Na amostra comparável, custo mediano total não aumenta e tempo
ativo mediano melhora. Com consumo indisponível, não declarar economia demonstrada. A amostra é um
piloto pequeno: manter telemetria e opção de voltar ao modo tradicional após a promoção.

## Verificação na implementação

Expandir `test/executionAdmission.test.ts`, `test/acpDeniedTools.test.ts`,
`test/orchestration.test.ts`, `test/orchestrator.test.ts` e `test/workspaceLock.test.ts`.
Usar `test/scenarios/cardAcpBoardContract.scenario.test.ts`,
`test/scenarios/independentReviewer.scenario.test.ts` e os cenários de sub-tarefas como referência.
`cardMultiagente.scenario.test.ts` trata múltiplos executores e não prova delegação de filhos.

Para cada alteração de execução, acrescentar cenário do caminho real até a conversa. Rodar testes
relacionados, typecheck, lint e formatação dos alterados; build da extensão antes de testes MCP.
Rodar `npm run validate` antes de concluir cada história de implementação. Suíte completa somente
no release, conforme `CLAUDE.md`. Este documento não altera execução e não teve testes de runtime.

## Alavancas separadas e expectativa de ganho

A medição histórica de 01/11 apontou fila do autopiloto, rodadas de revisão e execuções administrativas
como fontes de espera. Os valores daquela nota não foram medidos novamente nesta retomada.
Subagentes podem reduzir arranques e espera entre partes da mesma história, mas não resolvem sozinhos
a fila entre histórias nem o tempo de aprovação da pessoa.

Fila por dependência, revisão incremental e resumo por limiar ficam como histórias separadas.
Evitar incluí-las no piloto: isso permite atribuir o ganho observado à execução híbrida. Não prometer
percentual de economia antes da comparação pelo board.

## Atualização das sondas em 02/11/2026

Os testes posteriores estão em `teste_modos/resultados/consolidado.md`, com logs por ferramenta em
`teste_modos/sandbox/`. A instalação Kimi usada nessas rodadas é 2.4.1.

Kimi CLI e ACP comprovaram delegação, perfis de ferramentas e MCP distintos para escritor e leitor.
Uma chamada `session/load` sem prompt recuperou a sessão ACP e reproduziu o histórico. Falta provar
uma nova delegação após a retomada, cancelamento e execução pelo board. Codex CLI e ACP comprovaram
delegação e observação, mas o leitor conseguiu escrever e acessar o MCP: nesta versão, não há escopo
por filho suficiente para ativar o desenho sem controles adicionais. Cursor continua sem execução
real por limite da conta. O modo API de provedores em um script de teste não cria suporte API no
produto; no código inspecionado, o driver API implementado é o do Gemini.

O diagrama editável está em
`/Users/euclidesgc/development/faz_ai.worktrees/1463-execucao-hibrida-h0-comprovar-delegacao/docs/diagramas/board-contexto-e-execucao.drawio`.
As três páginas distinguem fluxo atual, modos integrados e proposta em teste. Nenhuma sonda isolada
substitui a história real pelo board exigida para tornar a execução híbrida padrão.
