# Contexto mínimo: proposta de revisão do Harness (E7.1, #1003)

Medido em 21/10/2026 no inventário do board (`get_harness`), tamanhos em bytes do arquivo principal. **Nada aqui foi aplicado**: agentes, rules e skills vivem na biblioteca do board e as associações dos cards são da pessoa. Cada item é uma proposta para aprovar (a tela do plano também gera propostas por atividade com **Propor com IA**, #1002).

## O que entra em toda execução (Sempre)

| Item | Tamanho | Observação |
| --- | --- | --- |
| skill `faz-ai-fluxo` | 10.401 | Sozinha é ~3x qualquer outra skill. Mistura o núcleo (começar, pendências, parar) com procedimentos de ações específicas |
| rule `AGENTS.md` | 3.423 | Orientação geral; tamanho aceitável |
| MCP `code-review-graph` | n/d | Só analista e revisor o usam; o executor de testes ou de documentação não precisa |

**Proposta 1 — dividir `faz-ai-fluxo`.** Manter em Sempre só o núcleo (~3 mil bytes): por onde começar, trabalhar num card, pendências com a pessoa, quando parar, o que não fazer. Mover para skills focadas, essenciais só do agente que as usa: "Fases que produzem documento" (analista e condutor, ações de Discovery a Plan), "Sub-tarefas de implementação" (condutor, no Plan) e "Ao fechar uma fase ou sub-tarefa" (condutor e revisor). As skills por assunto que já existem (`faz-ai-harness-do-card`, `faz-ai-workspace-e-pr`, `faz-ai-implementacao-rodadas`, `faz-ai-revisao-e-homologacao`, `faz-ai-modo-autonomo`) seguem como estão. Ganho estimado: ~7 mil bytes (~1,8 mil tokens) a menos em cada execução que não é de planejamento.

**Proposta 2 — `code-review-graph` sai de Sempre.** Fica em `allowedMcpIds` e nos MCPs ativos do analista e do revisor; os demais agentes passam a rodar sem ele. Impacto: some o servidor `uvx` (tempo de partida e superfície) das execuções de implementação, testes e documentação.

## Contratos dos agentes (ferramentas e MCPs)

| Agente | Ferramentas hoje | Proposta |
| --- | --- | --- |
| `condutor-do-board` | Read, Grep, Glob, **Agent**, Bash | Remover `Agent`: a delegação nativa é negada (#842) e o Orchestrator executa as sub-tarefas; o texto do agente que manda "delegar com a ferramenta Agent" deve virar "o board executa as sub-tarefas" (revisar junto com o runtime v1) |
| `analista-de-codigo` | Read, Glob, Grep, LSP, ListMcpResourcesTool, ReadMcpResourceTool, ToolSearch | Tirar `ListMcpResourcesTool`, `ReadMcpResourceTool` e `ToolSearch` (o grafo vem pelo MCP selecionado); ficam leitura e `LSP` |
| `fluxo-e-mcp` | 13, incluindo PowerShell, Monitor e NotebookEdit | Reduzir a Read, Grep, Glob, Edit, Write e Bash; esse agente edita textos e o contrato do MCP, não notebooks nem processos longos |
| `revisor-de-codigo` | Read, Grep, Glob, Bash | Manter; Bash só para `git diff`/`git log`. Adicionar `code-review-graph` como MCP permitido |
| `integracoes-ia` | inclui WebFetch e WebSearch | Manter (consulta a documentação oficial das CLIs), sem MCP |
| `backend-node`, `frontend-web`, `qa-testes`, `dados-sql`, `devops-infra`, `backend-python` | Read, Grep, Glob, Edit, Write, Bash | Manter; `backend-python`, `dados-sql` e `devops-infra` não têm uso neste projeto (TypeScript): propor desativar para não poluir o catálogo oferecido ao planejamento |
| `documentacao-tecnica` | Read, Grep, Glob, Edit, Write | Manter, com `registrar-mudanca-changelog-readme` como skill essencial |

## Skills: essenciais por agente, o resto por atividade

- `frontend-web`: essenciais `texto-de-interface-i18n` e `react-component-contracts`; as outras oito skills `react-*` (~21 mil bytes) ficam **disponíveis**, escolhidas por atividade (acessibilidade para uma tela nova, `react-forms` para formulários etc.), nunca todas juntas.
- `backend-node`: `migracao-do-banco` e `mensagem-host-webview` disponíveis; `configuracao-do-editor` só nas atividades que tocam `fazai.*`.
- `integracoes-ia`: `leitor-de-saida-da-cli` essencial.
- `fluxo-e-mcp`: `texto-lido-pela-ia` essencial (já é).
- `documentacao-tecnica`: `registrar-mudanca-changelog-readme` essencial.
- `qa-testes`: `react-unit-tests` e `react-integration-tests` disponíveis.
- Skills dos cards existentes: ao migrar para o plano, converter o campo Skills de cada card em seleção da atividade (E3/E4) em vez de somá-las ao essencial do agente; cards de esforço baixo mantêm 1 skill.

## Rules

`AGENTS.md` fica como orientação geral e mapa. Procedimentos longos nele (se houver) vão para skills; hoje ele não passa de 3,4 mil bytes e não pede divisão. `CLAUDE.md` (regra do projeto) segue fora do contexto das execuções do board no modo isolado.

## Papel de planejador

**Não propor.** As ações existentes bastam: o `analista-de-codigo` cobre Discovery, Spec e Plan; o condutor cria as sub-tarefas; e a proposta da IA para a configuração de cada atividade (E6) cobre a seleção mínima. Um agente novo só aumentaria o catálogo oferecido.

## Como aplicar (com aprovação)

1. Aprovar ou recusar cada proposta acima.
2. Para as aprovadas, editar a biblioteca (Configurações → Harness) e o contrato do agente na aba de contratos; o `preview_context_draft` mostra o efeito no contexto da atividade antes de salvar.
3. Medir com o piloto (E7.2, #997): consumo e qualidade por tarefa aceita, antes e depois.
