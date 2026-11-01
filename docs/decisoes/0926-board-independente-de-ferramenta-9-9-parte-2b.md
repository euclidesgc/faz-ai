# Board independente de ferramenta (9/9, parte 2b): o harness por ferramenta sai

> Substitui o desenho de [Revisão do Harness por ferramenta](revisao-do-harness-por-ferramenta.md).
> Contrato: SPEC.md da #851 (P1–P4).

## Decisão

O harness é a biblioteca guardada no banco do board (regras, skills, subagentes e servidores MCP, cada
um no modo Sempre, Pelo card ou Desligado). O board **não varre** as pastas das ferramentas de IA e **não
grava** nelas. Fora de "Conectar ao board", de "Exportar para a ferramenta" e do MCP temporário da
execução, nenhum código escreve em `~/.claude`, `.claude/`, `.cursor/`, `.kimi-code/` ou `.mcp.json`.
O guarda é `test/toolFolderWrites.test.ts` (estático: quais módulos do host citam pasta de ferramenta e
escrevem em arquivo; de comportamento: as operações do painel deixam as pastas intactas).

## O que saiu

- Módulos: `harnessScan`, `harnessWatch`, `harness` (HarnessStore), `agentFiles`, `plugins`, `skillMode`,
  `harnessOps`, `mcpServers`, `hooksAndPermissions`, `installSkills`, `shared/kimiHooks`, e do catálogo
  compartilhado tudo o que era de plugins, hooks, permissões e alvos de gravação.
- MCP: `install_flow_skill`, `set_skill_enabled`; `get_harness` sem `onlySelected`; `set_harness_selection`
  por `{ kind, name }` (item estrito).
- Tela: a tela antiga do Harness; o botão "Instalar a skill" (o requisito aponta para o Harness); o
  "Indicar artefatos" (dependia do inventário).
- Banco: schema 46 apaga `harness_imports`; a tabela saiu de `EXPORT_TABLES`, e exports antigos que a
  trazem continuam sendo aceitos.

## Restos conscientes

- **`harness_selection` fica (P1).** Guarda as marcações legadas até a migração para a biblioteca; o
  `boardRepo.setSelection` ainda desmarca por ela.
- **`Harness`/`BoardState.harness` e `ToolInventory` ficam como formato de estado.** O `inventory` é sempre
  vazio no host; remover o campo tocaria dezenas de fixtures de teste e a leitura de estado em módulos
  compartilhados sem ganho de comportamento. Fica para uma limpeza própria.
- **`harnessCatalog` (reduzido), `harnessTopics` (reduzido) e `harnessProject` (reduzido)** continuam: o
  leitor de pastas importadas (`importScan`) precisa do catálogo de locais, a biblioteca da tela usa os
  assuntos e a busca, e `FLOW_SKILL_NAME` e `toItemName` são usados em várias camadas. `agentTools` fica
  porque o contrato neutro de artefatos e a admissão de execução o usam (P2).
- **Porta de conclusão v2:** esta remoção não declara a iniciativa concluída; a paridade foi conferida na
  #851 (#918) e os aceites pendentes dela continuam valendo.
