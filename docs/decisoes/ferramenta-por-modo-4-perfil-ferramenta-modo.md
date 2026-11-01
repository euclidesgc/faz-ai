# Ferramenta por modo, 4: perfil = ferramenta × modo (migração 48)

> História 4 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 3](ferramenta-por-modo-3-vinculo-saneado.md); entrou depois
> da [história 5](ferramenta-por-modo-5-contrato-conexao.md), que andou em paralelo.

## Contexto

O perfil de IA misturava ferramenta e transporte de forma implícita: `kind` dizia de onde ele vinha
(`builtin`, `acp`, `copy`, `custom`) e `base` qual CLI pronta ele imitava; o ACP era o campo `acpAgent`,
que no personalizado mora no cofre. O log de execuções não dizia em que modo cada uma rodou, e o
Consumo da história 12 misturaria medições incomparáveis. O número da migração foi conferido: a
`develop` estava no schema 47, então a 48 da épica vale.

## Decisão

- **Migração 48, só colunas.** `ai_profiles.tool` (padrão `''`), `ai_profiles.mode` (padrão `'cli'`) e
  `ai_runs.mode` (nulo). `ADD COLUMN` não reescreve as tabelas, nem o `ai_runs`, que é a grande. Sem
  `CHECK` em `mode`, como na 47: o modo `api` não deve pedir migração. Nenhum índice novo: o
  preenchimento lê `ai_profiles` pela chave primária (`board_id`, `id`), o que o teste confere com
  `EXPLAIN QUERY PLAN` (`SEARCH ... USING INDEX sqlite_autoindex_ai_profiles_1 (board_id=?)`), e
  nenhuma consulta nova filtra o `ai_runs`.
- **`AiProfile` ganha `tool` e `mode`; `kind` é `catalog | custom`.** `normalizeProfileKind` lê os dois
  conjuntos. As distinções antigas viram predicados sobre a identidade: `isReadyProfile` (catálogo com
  `tool === id`, o antigo `builtin` ou `acp`, que não é editado nem apagado), `isReadyCli` (o antigo
  `builtin`), `isReadyAcp` (o antigo `acp`) e `isCatalogCopy` (catálogo com `tool !== id`, o antigo
  `copy`). `isCatalogProfile` saiu: o nome passaria a significar "do catálogo", que agora inclui as
  cópias, e um chamador antigo trocaria de sentido sem erro de compilação.
- **Preenchimento preguiçoso no repositório.** `AiProfileRepo.list()` grava `kind`, `tool` e `mode` nas
  linhas com `tool = ''` (o `UPDATE` repete a condição, então é idempotente): `builtin` → `(id, cli)`;
  `acp` → `(id, acp)`; `copy` → `catalog` com `tool: base`, `mode: cli`; `custom` → `(id, acp)` com
  `acpAgent` no cofre, senão `(id, cli)`. O personalizado só é gravado quando o cofre responde: com a
  leitura falhando ou sem o valor (o perfil importado de outra máquina), a leitura deduz `(id, cli)` em
  memória e o primeiro `save` grava. A leitura de uma linha ainda não preenchida usa a mesma dedução.
  Uma linha `acp` cujo id saiu de `ACP_READY_AGENTS` continua `(id, acp)`, independentemente do catálogo
  atual: pela base (`generic`) ela viraria cópia, mudaria o `catalogTool` e voltaria ao 47 como `copy`.
- **`save` e `duplicate` derivam ferramenta e modo, nunca do rascunho.** A cópia é a ferramenta da base
  em `cli`; o personalizado é a própria ferramenta, em `acp` quando aponta um agente. As linhas novas do
  agente ACP pronto (ao ligar) e das CLIs prontas (semente) já nascem com os dois.
- **`catalogTool` não muda de valor.** Passa a ser `tool || id`, que dá a base na cópia e o id nos
  demais, como antes. O teste da migração compara a regra antiga com a nova em todos os perfis.
- **`ai_runs.mode` é gravado pelo gateway**, nas três chamadas de `describe`, com o transporte que de
  fato roda (`isAcpProfile`), não o declarado. O `prepare()` dos chamadores não informa o modo. A
  leitura devolve `null` para um valor fora de `PROFILE_MODES`, e a importação recusa o arquivo com ele.
- **Exportação.** `ExportTable.columns` registra as colunas que entraram depois da tabela
  (`ai_profiles.tool` e `mode`, `ai_runs.mode`, todas `48`): um arquivo do schema 48 em diante sem elas é
  recusado; um anterior importa pelo caminho que já existia (o banco em memória na versão do arquivo,
  migrado até a atual) e os perfis saem com ferramenta e modo na primeira leitura.
  `validateProfileRows` aceita os dois conjuntos de valores, e recusa ferramenta ou modo que não batem
  com o perfil (cópia com outra ferramenta ou em `acp`, pronto com outro modo, `api`).
- **Caminho de volta.** `DOWN_MIGRATIONS[48]` e `migrateDown(db, to)` levam o banco ao schema 47:
  `catalog` volta a `copy` (`tool !== id`), `acp` (`mode = 'acp'`) ou `builtin`, e as três colunas saem.
  O teste confere que o banco volta byte a byte ao que era e migra de novo para o mesmo resultado. Não
  roda sozinho (a extensão continua recusando abrir um formato mais novo): é o procedimento de suporte.
- **A tela só muda o rótulo**: "ferramenta · modo" ("Claude Code · CLI", "Gemini · ACP"), "Cópia de
  Claude Code · CLI" e "Personalizado · ACP". O nome curto vem de `toolLabel` (o rótulo do catálogo, sem
  o " CLI" final dos agentes ACP).
- **`toolModeOf` (história 5) passa a ler os campos.** Mesmo resultado do adaptador: no catálogo,
  `(tool, mode)`; no personalizado ACP, `(acpAgent, 'acp')`, porque o driver é o do agente do catálogo e
  o `tool` do perfil é o id dele (a chave do catálogo de modelos); na CLI personalizada, `null`. O teste
  da migração compara o adaptador antigo com o novo em todos os perfis de um banco migrado.

## Onde a especificação não cabia no código

- **"Os ajustes como `overrides` no cofre."** O cofre da cópia já guarda só os ajustes por cima da
  ferramenta (comando, ambiente, argumentos extras, link de instalação, padrões de login, isolamento),
  e o isolamento herdado de `BUILTIN_ISOLATION` continua vindo do código quando a cópia não grava o
  próprio. Reescrever o cofre num objeto `overrides` mudaria um dado que fica fora do banco (um backup
  do banco restaurado não acompanharia) sem mudar nada que a execução lê. Decisão: o conteúdo do cofre
  não muda; as chaves que valem como ajuste viraram `overrideKeys` no repositório.
- **`mode` só aceita `cli` e `acp`.** `api` entra com a admissão do modo API (história 9); até lá, um
  arquivo importado com `api` é recusado, porque nada o executaria.
- **"Personalizado com `acpAgent` → `(id, acp)`"** diverge do driver da história 5, que usa o agente como
  ferramenta. Os dois valem: `tool` é a chave do catálogo de modelos (e não pode mudar), o driver é o do
  agente. `toolModeOf` faz a ponte.

## Alternativas descartadas

- **Preencher na migração o que o SQL sabe (`builtin`, `acp`, `copy`)**: dividiria a regra em dois lugares
  que precisariam concordar; o repositório já precisa de todas para o personalizado.
- **Inferir o modo das execuções antigas pelo perfil**: o perfil pode ter mudado desde a execução; fica
  nulo, "não registrado", como a conferência da 47.
- **Manter `isCatalogProfile` com o sentido antigo**: ver acima; a troca de nome faz o compilador apontar
  cada chamador.

## Consequências

- Todo board aberto nesta versão grava, uma vez, a ferramenta e o modo dos perfis; os personalizados sem
  cofre local ficam para o primeiro `save`.
- Uma versão anterior recusa abrir o banco no formato 48, como sempre; a volta é pelo `migrateDown`.
- O `kind` que o MCP mostra em `get_models` muda para `catalog`/`custom`, com `tool` e `mode` ao lado.
- Nenhum cenário novo em `test/scenarios/`: o plano, a admissão, o transporte e a leitura da saída não
  mudam; muda o que o log grava, coberto em `test/aiGateway.test.ts` e `test/aiGatewayAcp.test.ts`.
