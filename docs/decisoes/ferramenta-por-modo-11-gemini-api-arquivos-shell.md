# Ferramenta por modo, 11: Gemini pela API, parte 2 (arquivos e shell)

> História 11 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 10](ferramenta-por-modo-10-gemini-api-mcp.md) (o laço do
> `generateContent`, `apiCallDecision`, a evidência por construção relida antes de cada pedido, `maskApiKey`),
> da [história 3](ferramenta-por-modo-3-vinculo-saneado.md) (os níveis `board`, `edits` e `full` com a mesma
> prova) e da [história 1](ferramenta-por-modo-1-agente-admitido-perfil-acp.md) (a conferência `checkRun` e o
> vocabulário do card). Desenho no [registro da épica](ferramenta-por-modo-gemini.md), seção "Os três modos do
> Gemini" (o diagrama do modo API: "arquivo ou shell (edits / full) → executa").

## Contexto

Até a história 10, o laço do modo API só tinha as ferramentas MCP, e o driver recusava `edits` e `full`
antes do primeiro pedido ("use o Gemini pelo ACP"). No modo API não há agente da ferramenta: se o modelo
precisa ler o projeto, editar um arquivo ou rodar os testes, quem faz isso no computador da pessoa é o
próprio board. É o ponto mais sensível da épica: o board passa a executar, no host do editor, o que um
modelo remoto pede.

Fonte conferida em 2026-10-23: a referência do `generateContent` (ai.google.dev/api/generate-content):
`FunctionDeclaration.name` com letras, dígitos, `_ : . -` até 128, e `parametersJsonSchema`, que "must
describe an object where the properties are the parameters to the function"; `FunctionResponse` com `id`
("to match the corresponding function call id"), `name` e `response`, um objeto JSON de chaves livres
("output" como exemplo; "if the function call failed to execute, the response can have an "error" key"). Os
nomes das funções locais (`read_file`…) cabem nas duas regras de nome, a da declaração e a da resposta, que
não aceita `:` nem `.`. O Gemini não
tem ferramentas locais próprias na API: as de arquivo e de comando do Gemini CLI (`read_file`,
`run_shell_command`…) são do agente, não do modelo; aqui elas são do board.

## Decisão

- **Seis ferramentas locais, por nível, com os nomes do card.** `src/shared/apiTools.ts` é a parte pura:
  `read_file` (Read), `glob` (Glob) e `grep` (Grep) na categoria `read`; `write_file` (Write) e `edit_file`
  (Edit) em `edit`; `run_command` (Bash) em `run`. `board` libera `read`, `edits` mais `edit`, `full` mais
  `run`: o mesmo recorte do Claude Code na linha de comando e do `boardAllows` do ACP. O nome que o modelo
  vê é o da função; o que o card, a admissão, o inventário e a conferência usam é o do card.
- **A admissão do modo API lista as ferramentas locais.** `admitExecution` lê, no transporte `api`, a
  tabela `API_TOOL_GROUPS` no lugar da tabela de uma CLI (o perfil do Gemini não tem uma): a decisão
  passa a trazer `Read`, `Glob`, `Grep`… pelo nível, e a lista explícita vazia continua sendo nenhuma
  ferramenta. Nada muda no ACP (sem tabela, `tools: []`) nem na CLI.
- **O `deniedTools` do card chega à execução admitida do modo API.** O pedido legado não leva as negadas
  do card à decisão (`native.deny` exige a tabela de uma CLI), e a execução admitida trocava o
  `deniedTools` do manifesto pelo da decisão (só a delegação). No modo API, `ExecutionAdmission.prepare`
  tira da lista admitida as que o card nega e as soma às negadas (só restringe), e o registro da
  admissão (`ai_runs.admission`) grava a lista já sem elas. Uma regra com argumento (`Bash(git push *)`)
  nega a ferramenta inteira: o board não casa argumentos com a precisão da CLI, e na dúvida vale o mais
  restrito (`deniesTool`).
- **Declarar e executar pela mesma pergunta.** `apiLocalTools(permissão, exec)` decide o que é declarado
  ao modelo e é chamada de novo em cada chamada: a função que ela não lista não é declarada e, chamada
  mesmo assim, volta como erro sem rodar e sem entrar no inventário (a mesma regra da 10 para o MCP).
- **A lista de ferramentas do agente é conferida, não imposta: a regra do ACP.** O board impõe o nível e as
  negadas; a lista do agente vai pelo pedido ("Use só estas ferramentas: …", com o nome da função ao lado
  do nome do card na instrução das ferramentas locais) e pela conferência, que acusa o que o modelo usou
  fora dela. Por isso `API_ENFORCEMENT.tools` passou de `enforced` a `advised`: com "imposto", o plano
  tirava a lista do pedido e o resumo prometia uma fronteira que a decisão não traça. Na 10 o `enforced`
  era vazio (não havia ferramenta local).
- **Confinamento pelo caminho real** (`confinePath`, `src/extension/ai/apiTools.ts`). As pastas da
  execução são a do card (`cwd`) e os diretórios adicionais (`addDirs`, os mesmos que a admissão
  vinculou), como caminhos reais. O caminho pedido é conferido duas vezes: como foi pedido (`..` e
  absoluto fora nem chegam ao disco) e pelo `realpath` (o do arquivo, para ler; o do ancestral mais
  próximo que existe mais o resto, para escrever), que precisa cair numa das pastas: um symlink para
  fora é recusado como um `..`. Dentro delas: o `.git` (configuração com credencial, hooks que rodam
  código) e os arquivos `.faz-ai*` nunca são lidos nem escritos; a configuração das ferramentas de IA e
  do editor (`.vscode`, `.claude`, `.cursor`, `.gemini`, `.mcp.json`) não é escrita, porque escrevê-la
  em `edits` faria um comando rodar sem o nível `full`; e os segredos do host (`~/.faz-ai`, `~/.ssh`,
  `~/.gnupg`, `~/.aws`) ficam de fora mesmo quando uma pasta do card os contém. A gravação abre o arquivo
  com `O_NOFOLLOW` onde existe e confere a pasta de novo depois de criá-la. O banco do board, o cofre e as
  provas ficam no armazenamento da extensão, fora das pastas do card.
- **A busca não segue symlink de pasta** e pula `.git`, os arquivos do board, os segredos do host e o
  `node_modules` (a menos que o padrão o peça); um arquivo por symlink só entra se o real dele ficar nas
  pastas.
- **Limites.** Arquivo lido ou editado até 5 MB, binário recusado; resultado até 60 mil caracteres (o
  mesmo corte do resultado MCP), com aviso; gravação até 5 MB; busca até 50 mil entradas visitadas e 500
  resultados. A expressão regular do `grep` roda numa thread à parte (`worker_threads`, sem o ambiente do
  editor), encerrada em 20 s: uma expressão que explode não trava o host do editor. Comando: 2 minutos
  por padrão, até 10 a pedido do modelo; a saída de cada canal guarda o começo e o fim (30 mil
  caracteres).
- **`run_command` sem shell.** O modelo manda o programa e os argumentos em lista; o board procura o
  programa só no PATH (ou pelo caminho, a partir da pasta do comando, também confinada) e roda com
  `shell: false`: pipe, `&&`, `;` e `$VAR` chegam ao programa como texto. No Windows um `.cmd`/`.bat` só
  roda pelo cmd.exe, e os argumentos vão escapados pelo `launchSpec` de `spawn.ts`, como as CLIs. Para
  ter um shell, o modelo precisa chamar o shell como programa, e isso só existe em `full`, que é o nível
  "sem restrições". O PATH é o do shell de login (`loginShellPath`), como o das CLIs.
- **Ambiente filtrado** (`commandEnv`). Lista de permissão: PATH, pasta da pessoa, idioma, pasta
  temporária, as variáveis de sistema do Windows, proxy e certificados. Fora sempre: nome com cara de
  segredo (`KEY`, `TOKEN`, `SECRET`, `PASSW`, `CREDENTIAL`, `AUTH`, `COOKIE`, `SESSION`), as do provedor
  (não estão na lista), as da sessão do Claude Code, proxy com usuário e senha na URL e qualquer variável
  cujo valor contenha a chave da API. `GIT_TERMINAL_PROMPT=0`: o comando não tem entrada, e um pedido de
  senha travaria até o tempo limite.
- **Parar mata a árvore.** O comando roda num grupo de processos próprio (`detached` fora do Windows):
  o tempo limite e o Parar mandam `SIGTERM` ao grupo e `SIGKILL` 2 s depois; no Windows, `taskkill /T /F`.
  Quando o comando termina sozinho, o que ele deixou no grupo também é encerrado. O laço guarda os
  processos em curso, e `terminationConfirmed` só diz "acabou" com o grupo de cada um morto. Se nem o
  `SIGKILL` fechar a saída (um neto que saiu do grupo segurando o pipe), a chamada termina para o board
  5 s depois, em vez de prender a execução.
- **Inventário e consumo.** As chamadas locais entram no inventário como ferramentas nativas com o nome do
  card (`{ kind: 'tool', name: 'Write' }`), ao lado das MCP (`mcp_tool`); o `checkRun` as compara com o
  card como compara as do Claude Code, sem tradução (a tabela `ACP_KIND_EQUIVALENTS` é só do ACP). Os
  comandos entram em `bashCommands` pelo termo (`npm test`, `node`), sem argumentos, com as falhas
  (saída diferente de 0 ou tempo limite). Uma chamada recusada pelo confinamento conta no inventário: o
  modelo usou a ferramenta, e a conferência deve saber.
- **O que o canal e o modelo veem.** O log mostra `→ Write caminho` (ou o programa), nunca o conteúdo nem
  os argumentos do comando, e o erro da ferramenta mascarado. A resposta local passa pelo mesmo
  `maskApiKey` antes de voltar ao modelo. A instrução do sistema diz quais funções locais existem, com o
  nome do card, e quais são as pastas.

## Onde a especificação não cabia no código

- **"`deniedTools` do card respeitado".** A execução admitida perdia as negadas do card em todo transporte
  admitido (o pedido legado não as leva). Corrigido só no modo API. No ACP a mesma lacuna fica como
  pendência, explícita no código (`admission.ts`): lá o `boardDecision` compara as negadas com o título do
  pedido do agente, no vocabulário dele (o `Bash` do card não casa com o `Shell` do Gemini), e levar as
  negadas sem traduzir os nomes daria uma garantia aparente.
- **"Conferência com desvio real".** Com a lista do agente imposta, o modo API não teria desvio real
  possível em ferramenta local. A especificação pede os dois casos, e a regra do ACP (impor nível e
  negadas, conferir a lista) os dá; ver a alternativa descartada abaixo.
- **Arquivos do board e cofre.** O banco do board, o cofre de chaves e as provas ficam no armazenamento
  global da extensão, fora das pastas do card: o confinamento já os deixa de fora. Dentro das pastas, o
  que o board protege por nome são os `.faz-ai*` e o `.git`.

## Alternativas descartadas

- **Um shell (`sh -c`) com a linha do modelo**: daria pipe e `&&`, mas interpretaria a linha inteira do
  modelo, e no Windows o escape da linha é o ponto fraco conhecido. Sem shell, o modelo que precisa de um
  chama o shell como programa, e isso é exatamente o que `full` permite.
- **Impor a lista de ferramentas do agente** (declarar só as que ele lista): mais restrito, mas tira a
  simetria com o ACP e com os perfis admitidos do Claude (cuja lista admitida também sai do nível), e o
  agente do board mais comum (o condutor) não lista `Write` nem `Edit`, o que deixaria `edits` sem
  escrita. Fica a opção de impor numa história seguinte, mudando `API_ENFORCEMENT.tools` para `enforced`
  junto.
- **`fs.glob` do Node**: experimental na versão do Node do editor, e segue symlinks; o percurso próprio
  pula o que precisa pular.
- **`grep` na thread do host**: uma expressão com backtracking catastrófico travaria o editor inteiro;
  na thread à parte ela é encerrada no tempo limite.
- **Proteger mais nomes (`package.json`, `.husky`, `.env`)**: um `package.json` editado também roda
  código quando alguém roda `npm`, e isso vale para quase todo arquivo de um projeto. A linha fica nos
  arquivos que uma ferramenta de IA ou o editor executam sozinhos, sem a pessoa pedir.

## Consequências

- O Gemini pela API serve Refinar, Resumir e Trabalhar na fase com as três permissões; a ficha do modo e
  os textos que diziam "até a 11" mudaram (README, `docs/harness.md`, `docs/mcp.md`, CHANGELOG).
- `docs/fluxo.md` ganha "Trabalhar na fase pela API" (pt e en).
- Testes: `test/apiTools.test.ts` (confinamento, symlink, `.git`, configuração, segredos do host, limites,
  `grep` com expressão explosiva, `commandEnv`, tempo limite e Parar do comando, a tabela por nível na
  admissão, a conferência com o inventário local), `test/geminiApi.test.ts` (o laço em `edits` e `full`,
  a decisão de novo na hora, o ambiente do comando, Parar no meio de um comando matando o neto),
  `test/aiGatewayApi.test.ts` (as funções por nível e as negadas do card pelo gateway e pela admissão de
  verdade) e o cenário `test/scenarios/cardApi.scenario.test.ts` (C: editar um arquivo em `edits`; D: rodar
  um comando em `full`; E: a fuga negada; F: `deniedTools` respeitado; G: o desvio real na conversa).
- A história 12 classifica o 429 e a pausa por cota; a 14 roda os três modos contra a API real.
