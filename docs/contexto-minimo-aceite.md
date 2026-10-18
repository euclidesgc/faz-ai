# Auditoria de conclusão do plano de contexto mínimo

Fonte de requisitos: `plano-contexto-minimo-por-execucao.md`, inclusive dependências, decisões de produto, indicadores e aceites. Esta auditoria mantém o escopo integral; uma base de protocolo ou teste com CLI falsa não encerra uma entrega de runtime ou o piloto.

## Estado verificável

| Entrega | Evidência presente | Requisito ainda sem evidência suficiente |
| --- | --- | --- |
| E1 | Manifesto e estimador compartilhados; prévia de card/agente com origens, agrupamento por identidade e distinção entre estimativa/medição/desconhecido. `executionContext.test.ts` e UI correspondente. | Revalidar a correspondência quando E5 substituir a resolução legada. |
| E2 | Schema 35 (contratos) e 36 (auditoria de admissão), documentos v0/v1 separados, revisão otimista, IDs estáveis, migração conservadora, validação antes de importação. `contextPlanning.test.ts`. | O contrato v1 não inclui definições MCP, mas o contrato geral de credenciais de #728 ainda falta: também URL/args/comando e importação executável pendente de revisão. Não considerar a remoção legada de env/headers como prova desse requisito completo. |
| E3 | Resolvedor puro, herança por campo, vazio explícito, essenciais/Sempre, opcionais inativos, incompatibilidades, editor humano e leitura MCP. | A base pura de decisão, o mapeamento estrito do Claude e o ponto de admissão no gateway estão presentes. Faltam coletor/verificador de CLIs reais e integração da evidência na prévia/preparadores. A prévia continua declarando admissão indisponível; nenhum teste sintético habilita executores reais. |
| E4 | Persistência e alvos por ação/fase já preparados em E2. | Painel da história por fase, configuração compacta da tarefa, padrões de board/workflow e ações sem card; entradas/resultado, dependências e critérios referenciados; origem, justificativa, diff e impacto antes de aplicação em lote. |
| E5 | Todas as chamadas existentes usam o gateway medido. Empréstimo MCP com WAL, posse por caminho real, launcher com identidade anterior à liberação e recuperação conservadora. | Ativação do plano em todas as portas de inferência; snapshots imutáveis #727; escopo/identidade MCP #823; orquestração persistida e remoção de delegação #824/#825; políticas #730/#731 no mecanismo único; reconciliação e cancelamento com posse/limites. Windows ainda não tem confirmação da árvore. |
| E6 | Padrão existente de assistência com rascunho/revisão pode ser reutilizado. | Propostas do plano com catálogo resumido, justificativas, comparação, revisão das entradas e desatualização; aplicação validada sem mudar autorizações, prioridades ou aprovações. |
| E7 | Nenhuma inferência de piloto ou limpeza em massa foi iniciada por esta implementação. | Propostas de revisão dos agentes/rules/skills/Sempre e associações existentes; tarefas reais representativas de UI/backend/MCP/docs e história multifase; consumo total por tarefa aceita, qualidade, retrabalho e intervenções. |

## Portas de verificação restantes

- **Capacidades:** declarar versões/binários/args/env/diretórios e políticas gerenciadas usados na evidência. Ausência de CLI, declaração manual, cópia alterada, `loads` vazio ou processo com código zero não verificam isolamento. Compatibilidade exige decisão explícita da pessoa; IA e fallback não reduzem o regime.
- **Persistência e segredos:** comprovar migração sem perda, ida/volta, rejeição antes da substituição e sentinelas ausentes de export/estado/MCP/log/prompt. Segredo salvo não retorna ao editor. Importação não inicia comandos.
- **Runtime:** testar igualdade entre resolução e snapshot; edição/exclusão posterior não afeta run ativo; recurso obrigatório inválido e materialização falha impedem spawn; MCP fora do snapshot é recusado; tentativa tardia/revogada não altera o board; queda/cancelamento não duplicam execução nem liberam posse prematuramente.
- **Modelos:** reutilizar e evoluir o mecanismo existente, sem avaliador paralelo. Escolha explícita inválida bloqueia, simulação e execução usam a mesma decisão, políticas são versionadas e fallback não amplia acesso ou reinicia contadores/ciclos.
- **Interface:** tradução, acessibilidade, loading e preservação de rascunho; troca de agente mantém incompatibilidades visíveis; ações de implementação/refino/resumo/conflito/assistentes não misturam seleções; tabela da história e tarefa compacta mostram as origens.
- **Piloto:** execuções aceitas e comparáveis, com modelo/complexidade/diferenças registrados. Consumo desconhecido não vira zero. Tamanho inicial menor sem preservar qualidade não satisfaz o aceite.

O estado completo por entrega e os vínculos com os cards ficam em `contexto-minimo-implementacao.md`. O objetivo permanece ativo até todos os itens pendentes terem evidência direta de conclusão.
