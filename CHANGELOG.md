🇧🇷 Português · [🇺🇸 English](CHANGELOG_EN.md)

# Changelog

As mudanças de cada versão do Faz AI Kanban, da mais recente para a mais antiga.

## Não lançado

- **Release sem push direto na `main`.** O `npm run release` agora publica nas lojas, abre o PR da
  versão (`release/vX.Y.Z`, já com "Não lançado" renomeado nos CHANGELOGs), espera o merge e só então
  cria a tag e a GitHub Release sobre o commit mergeado. Antes, o push direto era recusado pela
  `main` protegida e deixava uma tag solta no remoto. O novo `npm run release -- finish` conclui a
  tag e a GitHub Release depois do merge, sem publicar de novo.
- **Board padrão em inglês.** Com a interface em inglês, os nomes do board que a extensão cria (os
  workflows Histórias e Sub-tarefas, colunas como Implementação, Homologação e Concluído, os tipos de
  card, os campos Fase e Esforço da atividade, suas opções e o Agente padrão) aparecem traduzidos, no
  board, no card, nos filtros, na lixeira e nas listas das configurações. Muda só a exibição: o nome
  guardado continua o mesmo, então nada quebra ao trocar de idioma, e o que você criou ou renomeou
  nunca é traduzido. As caixas de nome das configurações continuam mostrando o nome guardado.
- **Logo da tecnologia nos campos de seleção.** Opções de campos de seleção e de múltipla seleção
  que nomeiam uma tecnologia (Flutter, Dart, React, TypeScript, Python, Rust, Docker, GitHub e cerca
  de 80 outras, também por apelido: "node", "ts", "k8s") ganham o logo, na cor da marca, no card,
  no seletor do card e nos filtros. Opções que não são tecnologia ficam como antes.

## 0.30.0

- **Modo autônomo (YOLO)**: uma história marcada como YOLO é tocada pela IA do Backlog ao pull
  request, sem pedir autorização nem confirmação. As colunas que exigem aprovação não seguram o
  card, o pedido de revisão vira aprovação na hora e a IA decide as dúvidas sozinha, registrando
  na conversa. Roda com a permissão "Sem restrições" e não faz o merge. Um **autopiloto** toca as
  histórias em fila, uma de cada vez, e empilha os pull requests: a branch de cada história parte
  da anterior. A IA pode dividir um pedido grande em várias histórias (`create_card` com
  `autonomous_from`). Para quando o card é bloqueado, quando uma execução falha e depois de 3
  execuções seguidas sem avanço. Interruptor no painel do card (com confirmação), selo no cartão,
  botão **Autônomo** no topo do board e comandos para pausar e retomar.
- **Pedido de avaliação e canais de retorno no README.** O começo do README (em português e em
  inglês) ganhou um convite para dar uma estrela no repositório, avaliar a extensão no VS Code
  Marketplace e no Open VSX (a loja do Cursor), reportar bugs e sugerir melhorias pelas issues do
  repositório. As issues agora têm dois formulários prontos, **Reportar um bug** (com versão,
  editor, ferramenta de IA e sistema) e **Sugerir uma melhoria**.
- **Interface em português e em inglês.** Em Configurações → Aparência, o **Idioma** pode ser
  **Automático** (segue o idioma do editor ou do navegador: inglês para qualquer `en`, português
  para o resto), **Português (Brasil)** ou **English**. A interface inteira troca na hora: board,
  card, filtros, chat, configurações e as mensagens de erro e aviso do board. Os nomes de comandos e
  seções do editor (paleta de comandos e barra lateral) também seguem o idioma do editor. O que você
  escreve (títulos, descrições, nomes) e o que é lido pela IA (instruções das fases, ferramentas MCP)
  não é traduzido.

- **Chat com a IA no board.** Uma conversa para criar, mover e vincular cards e consultar o board em
  linguagem natural: na barra lateral do editor (seção **Chat com a IA**, abaixo de Board e Filtros)
  e, no navegador, no botão **Chat** do topo. Dá para escolher o **modelo e o esforço** das próximas
  mensagens; a IA age pelas ferramentas do board e responde em markdown. Há **Parar** e **Limpar**,
  e o histórico fica guardado por projeto. Usa o mesmo limite de execução do restante (por padrão,
  só o board).

- **Controles do card aberto, do board e dos filtros no mesmo padrão.** Tipo, coluna, status, agente,
  filtros e escolha do diálogo agora são os seletores do Radix, assim como as caixas de seleção da
  checklist e dos filtros e os campos de busca, de adicionar item e de data. Ficaram como texto
  editável só o título, o item da checklist, o nome da coluna e o editor de markdown.

- **Vínculos entre cards.** Qualquer card pode ser vinculado a outro, de qualquer workflow: **pai**,
  **filho** ou **relativo**, na seção **Vínculos** do card aberto, com busca por número ou título. O
  rodapé do card mostra o vínculo e o progresso dos filhos; vínculo repetido e ciclo são recusados.
  Quando o último filho em aberto entra numa coluna de conclusão, vale a regra "ao concluir todos os
  filhos" (perguntar, mover sozinho ou nada) também para o pai vinculado. A IA ganha `link_cards` e
  `unlink_cards`, e o `get_card` devolve os vínculos. As sub-tarefas seguem como estão.

- **Skills automáticas por tipo de card.** Em Tipos de card → Padrões por tipo, o campo Skills usa
  a janela de escolha (antes mostrava "Sem opções ainda" quando o projeto não tinha skills próprias)
  e todo card novo do tipo nasce com as skills escolhidas. Há teste de ponta a ponta.

- **Harness de IA em três abas.** A tela era uma rolagem longa com três assuntos misturados. Agora:
  **Ferramenta e execução** (a IA do projeto, execução pela conversa e heartbeat), **Do projeto**
  (regras, skills e agentes que fazem parte do repositório) e **Tudo que a ferramenta carrega** (o
  inventário, com global e plugins). A aba escolhida fica lembrada. Os arquivos de agente da própria
  ferramenta aparecem como **Subagentes** nesta tela, para não se confundir com **Agentes**.

- **Perfis de execução viram Agentes.** A tela, o menu e o card passam a dizer **Agente**: é ele que
  define como a IA trabalha (skills, servidores MCP, ferramentas, modelo e esforço). Toda execução
  pelo board roda através de um agente, o do card, o da fase ou o padrão, e o board sempre tem ao
  menos um (**Agente padrão**, sem restrições); o último não pode ser apagado. O arquivo de agente
  da própria ferramenta agora se chama **Subagente** (opcional).
- **Agentes configuráveis por intenção.** Cada agente tem o campo **O que este agente faz**; com
  ele, **Sugerir pela intenção** marca skills e servidores MCP que combinam (busca por palavras,
  sem chamar IA). As skills do agente usam a janela de escolha com busca, e as ferramentas têm
  conjuntos prontos: **Só leitura** e **Editar código**. A tabela do que o Claude Code aceita por
  parâmetro foi para uma seção recolhida.

- **Campo Skills do card com janela de escolha.** No lugar da parede de chips (uma para cada skill,
  centenas com plugins), o campo mostra as marcadas e abre uma janela com busca por nome ou
  descrição, abas Todas / Marcadas / Projeto / Globais / Plugins, caixa de seleção por skill e a
  origem de cada uma. O mesmo seletor serve aos agentes e usa a descrição da intenção para sugerir
  skills.

- **Harness de IA: lista nova de skills, agentes, hooks e servidores MCP.** Cada item tem o nome, a
  descrição como dica (duas linhas, com o texto completo ao passar o mouse) e o caminho do arquivo
  numa linha própria, por inteiro; clicar nele abre o arquivo no editor. Saiu a tabela que
  quebrava o caminho e a descrição em várias linhas. Cada linha tem uma caixa de seleção, e a do
  cabeçalho marca o grupo; com itens marcados, uma barra permite deixar as skills automáticas ou só
  quando indicadas, copiar para o projeto ou para o global, e apagar. O grupo **Projeto** vem
  sempre primeiro, em destaque, com a frase de que faz parte do repositório; **Global** e
  **Plugins** dizem que não fazem.
- **Descrição em bloco do frontmatter**: skills e agentes com `description: |` ou `>` (em várias
  linhas) apareciam com a descrição vazia ou só com a barra; agora a descrição é lida inteira.

- **Botão de tema no topo do board**: o ícone no canto superior direito alterna entre **Sistema**,
  **Claro** e **Escuro**. É a mesma preferência de Configurações > Aparência, então a escolha fica
  salva e vale no editor e no navegador.
- **Cores próprias do board**: o board passa a usar a mesma paleta no editor e no navegador, em
  claro e escuro, em vez de herdar as cores do tema do VS Code. Com **Sistema**, ele acompanha só
  se o editor está em tema claro ou escuro. Temas de alto contraste usam o claro ou o escuro do
  board com bordas reforçadas.
- O painel de **Filtros** da barra lateral usa o fundo do tema do board. Antes, com o VS Code
  escuro e o board claro, os filtros ficavam quase invisíveis.
- Os selos de status e de tipo de card ficam legíveis em qualquer cor escolhida: o texto vira preto
  ou branco conforme a cor de fundo.
- O botão principal é azul índigo nos dois temas (no escuro era verde).
- Os cards perderam a faixa colorida à esquerda: a cor do tipo fica na barra do card.
- As barras de rolagem usam as cores do board, e a barra horizontal das colunas ganhou um espaço de
  respiro abaixo dos cards.
- O contraste de textos, controles e foco do teclado é verificado por teste automático nos dois
  temas. As regras de cor estão em `DESIGN.md`.
- Interno: lint (ESLint) e formatação (Prettier) configurados, e testes de interação (cliques e
  teclado) do board. Nada muda para quem usa.
- Interno: o front passa a usar primitivas de interface (botão, seletor tipado, chips, linha de
  campo, botão de apagar com confirmação, campo de adicionar, campo numérico) em vez de repetir o
  mesmo HTML em cada tela. Nada muda na aparência nem para quem usa.
- Interno: a tela Configurações > Harness foi quebrada em arquivos por seção, e o front pede as
  ações ao host por comandos com nome (`src/webview/commands.ts`). Nada muda para quem usa.
- Interno: o código todo segue o Prettier, conferido pelo `npm test`, e o `npm run typecheck`
  passa a cobrir os testes da interface.
- Interno: as regras do board que o host e o front repetiam (card ativo, coluna do card, sub-tarefas
  em aberto, o que vai junto ao cancelar ou concluir) ficam num só lugar, em `src/shared`, com
  testes. Nada muda para quem usa.
- O botão "⋯" dos menus avisa aos leitores de tela se o menu está aberto.
- Interno: as ferramentas MCP saem de um arquivo de 1147 linhas para `src/extension/mcp/tools/`,
  um arquivo por grupo. A lista que a IA vê (nomes, descrições, parâmetros) não muda.
- Interno: o roteador de mensagens do host (690 linhas) vira um despachante tipado com handlers
  por domínio em `src/extension/panel/handlers/`; a regra da história fica em `src/shared/story.ts`.
- Interno: a tela Configurações > Harness (483 linhas) vira composição de seções em
  `settings/harness/`, com testes de interação novos; regras sem React vão para `src/shared`.
- Interno: o painel do card (399 linhas) vira composição de partes em `components/card/`, com 21
  testes de interação novos; tipos, checklist e vaga da sub-tarefa entram em `src/shared/selectors.ts`.
- Corrigido: trocar de card com a descrição em edição salvava o rascunho no card aberto em seguida
  (por exemplo, na sub-tarefa); agora ele vai para o card em que foi escrito.
- **Ícones novos**: emojis e símbolos soltos (✕ ⋯ ▾ ↗ 🗑 💬 📎) deram lugar a um conjunto único de
  ícones de traço ([Lucide](https://lucide.dev)) em todo o board: card, colunas, painel do card,
  editor de descrição, filtros e configurações.
- **Card novo no board**: uma barra na cor do tipo, como a de uma janela, com o ID, o tipo e os
  botões de abrir e de ações. O título fica numa linha (inteiro no tooltip), o status mostra com
  quem está a pendência por um ícone (robô para a IA, pessoa para você) e há quanto tempo está
  assim, e bloqueado mostra o motivo no tooltip. O modelo de IA ganha uma linha própria, com o
  esforço em português ("Sonnet 5.5 - baixo"), e o rodapé mostra a branch e o link do PR.
- Cards com pendência sua ganham a borda na cor do status, para achar de relance o que espera por
  você.
- Um LED pisca devagar na barra do card enquanto a IA trabalha nele (fica aceso, sem piscar, com
  movimento reduzido no sistema).
- **Texto legível na cor do tipo e do status**: a cor do texto (preto ou branco) passa a ser
  escolhida pelo contraste percebido, e não mais pela fórmula antiga, que punha texto preto sobre o
  azul da História e o vermelho do Bug. Em Configurações > Tipos de card, cada tipo mostra a prévia
  do card enquanto você escolhe a cor; se a cor deixar o texto difícil de ler, aparece um aviso com
  a mesma cor mais escura e mais clara para aplicar com um clique. O aviso também vale para as
  cores dos status em Aparência.
- **Configurações mais organizadas**: cada seção tem o título e a ação principal na mesma linha.
  Em **Tipos de card**, o botão **Novo tipo** no topo abre uma linha na tabela, alinhada com as
  outras, com a prévia do card (Enter adiciona, Esc cancela). As configurações e a Lixeira ocupam
  toda a largura da tela, e o menu lateral das configurações recolhe numa faixa só com ícones (a
  escolha fica lembrada).
- Campos de texto, link e número do card não perdem mais letras quando você digita rápido. O
  valor é gravado ao sair do campo, com Enter ou ao fechar o card, em vez de a cada tecla.
- **Tela de Campos refeita**: cada campo vira um cartão com o nome numa caixa de texto, o tipo com
  a explicação do que ele guarda, como ele aparece no board (com a prévia ao vivo), as opções como
  selos (Enter inclui, X tira) e os tipos de card em que ele existe. **Novo campo**, no topo, abre o
  rascunho com a escolha do tipo; campos de seleção pedem ao menos uma opção. A exibição "Só no
  detalhe" passou a se chamar **Oculto**.
- Os formulários passam a usar os componentes do [Radix Themes](https://www.radix-ui.com/themes),
  da mesma família das cores do board. As outras telas migram aos poucos.
- **Workflows e colunas refeitos**: você pode criar quantos workflows quiser com **Novo workflow**
  (escolhendo se recebe cards independentes ou sub-tarefas; ele nasce com A fazer, Em andamento e
  Concluído) e excluir os que estiverem vazios. O nome de cada workflow é editável, e **Nova
  coluna** fica no topo de cada um, abrindo uma linha alinhada na tabela. Saíram os rótulos "linha
  de cima" e "linha de baixo" e as opções "começa colapsada" do workflow, da coluna e dos
  arquivados: o board guarda o estado em que você deixou cada workflow e coluna.
- O assistente de IA (MCP) ganhou `create_workflow` e `delete_workflow`; `set_workflow_layout` e o
  parâmetro `collapsed` de `update_column` foram removidos.
- Os logs do navegador de teste (`.playwright-mcp`) entraram por engano em PRs anteriores e agora
  são ignorados pelo git.
- **Ordem dos workflows**: cada workflow tem uma alça para arrastar e mudar a posição dele no
  board (com a alça em foco, ↑ e ↓ movem uma posição). O assistente de IA (MCP) ganhou
  `move_workflow`.
- **LED da IA sempre no card**: o LED na barra do card agora existe o tempo todo. Pisca devagar
  enquanto a IA trabalha no card, e a história também acende quando a IA trabalha numa sub-tarefa
  dela. Quando a IA termina, o LED continua no card, apagado (só o contorno). A prévia dos tipos
  também mostra o LED apagado.
- **Coração do heartbeat** no topo direito do board: vermelho e batendo enquanto o heartbeat está
  rodando; cinza e parado quando ele está desligado ou não consegue rodar (sem ligação com o Faz
  AI ou sem a ferramenta do projeto, com o motivo no tooltip). Um clique no coração liga e desliga o
  heartbeat.
- Em Configurações > Campos, o seletor "No board" (Selo, Selo vazado, Nome: valor, Oculto) não
  invade mais a coluna das opções quando a janela é estreita: as colunas do cartão do campo passam
  a quebrar de linha antes de ficarem menores que o seletor.
- **Regras do board com o novo design**: cada regra vira um cartão com o selo Ativa/Desligada, o
  interruptor ou o seletor à direita e o "Quando / Então" embaixo. Os controles são os do Radix
  Themes, iguais aos de Campos e Workflows. É a primeira das telas de Configurações que ainda usavam
  os controles antigos.
- **Harness de IA com o novo design**: regras, skills e agentes do projeto viram cartões com o
  título, o selo de estado e as ações à direita; cada seção tem o botão principal no topo (Nova
  skill, Novo agente, Conectar ao board, Rodar agora, Atualizar). Formulários de criação, seletores,
  interruptores, caixas de marcar e as abas de ferramenta usam o Radix Themes, como Campos,
  Workflows e Regras.
- **Perfis de execução com o novo design**: o botão **Novo perfil** fica no topo à direita; cada
  perfil é um cartão com o nome numa caixa de texto, o selo "padrão" e as ações à direita, e o
  editor usa os seletores, interruptores e campos do Radix Themes. O seletor de **modelo e
  esforço** (também usado no card aberto) passou a ser o do Radix.
- **Modelos de IA com o novo design**: **Detectar modelos** e **Novo modelo** ficam no topo à
  direita. O modelo novo abre um rascunho com os campos alinhados (nome, identificador e
  esforços), no lugar da linha solta no fim da tabela. A lista e a **Sugestão de modelo** usam os
  campos, seletores e interruptores do Radix Themes; **Montar nova regra** fica no topo da seção e
  o montador abre acima da lista de regras.
- **Git e Aparência com o novo design**: os campos viram cartões de formulário com o rótulo acima
  de cada caixa e a ajuda embaixo. Seletores, interruptor do merge automático, o aviso do merge
  (agora um aviso do Radix) e o controle deslizante do tamanho da fonte são os do Radix Themes;
  Restaurar padrões da Aparência é o botão do mesmo estilo das outras telas.
- **Sobras do novo design nas Configurações**: a tabela de colunas (nome, "Representa", "IA atua" e
  "Exige aprovação"), a linha de coluna nova, o editor da Fase, a tabela de Tipos de card, o nome do
  board no menu lateral e os padrões por tipo passam a usar os campos, seletores e caixas de marcar
  do Radix Themes. Os campos personalizados (texto, número, data, seleção e caixa) também usam o
  Radix, inclusive no card aberto. O botão "Novo workflow", "Nova coluna", "Novo tipo" e "Novo
  campo" têm o mesmo estilo em todas as telas.

## 0.29.1

- O README avisa que o projeto está em **fase alpha**: erros e mudanças entre versões podem acontecer.
- Nova seção **Preparar o ambiente de desenvolvimento**, com o que fica fora do git e precisa ser
  refeito num clone novo, e como publicar com a `main` aceitando só pull requests.

## 0.29.0

- **Board no navegador, fora do editor**: **Abrir no navegador ↗** (ou o comando **Faz AI: Abrir
  board no navegador**) abre o mesmo board numa aba, sincronizado com o editor. Sem o editor, o
  comando `~/.faz-ai/bin/faz-ai` serve o board de uma pasta com o servidor MCP, a execução da IA e
  o heartbeat. A página só responde em `127.0.0.1` e exige o segredo do link.
- **Chamar a IA funciona sem a CLI no PATH**: o board procura o executável nas pastas de instalação
  usuais e dentro das extensões do editor (Claude Code, Codex). Antes, quem só usava a extensão do
  Claude Code recebia "comando não encontrado".
- Com o Claude Code, o servidor do board vai na linha de comando de cada execução: chamar a IA não
  depende mais de **Conectar IA (MCP)** nem da aprovação do `.mcp.json`.
- A IA é avisada do nível de permissão da execução e, quando ele não basta, bloqueia o card dizendo
  qual opção escolher. O nível aparece ao lado do botão **Chamar IA**, com atalho para mudar.
- Falhas da execução levam o fim da saída da ferramenta para o card, e o motivo do bloqueio é
  mostrado formatado.
- **Usabilidade**: botão **Chamar IA** no cabeçalho do card; avisos e erros em caixas flutuantes
  que não empurram o board; contador **N com você** e indicador de IA trabalhando no topo; campo
  Skills recolhido, com busca; cabeçalho do card fixo; orientação no board vazio e na linha de
  sub-tarefas; abrir card com Enter; foco visível pelo teclado; abas do topo mais discretas.
- **Um banco por pasta**: janelas em projetos diferentes não gravam mais uma por cima da outra. O
  board parte de uma cópia do banco das versões anteriores, que fica intacto.

## 0.28.0

- **Buscar e instalar skills**: a partir de uma pasta, de `dono/repositorio` do GitHub ou de um
  endereço git. O board lista as skills encontradas e copia as escolhidas para o projeto ou para a
  pasta do usuário. O repositório é clonado numa pasta temporária e nada dele é executado.
- A seção Plugins mostra os comandos de cada ferramenta para instalar e remover plugins.

## 0.27.0

- **Modelos e referências nas skills**: os arquivos de apoio de cada skill (`references/`,
  `assets/`, `scripts/`) aparecem na tela, com abrir, criar (com o link no `SKILL.md`) e apagar.
- **Criar skill de modelos**: skill do projeto para modelos de classe e exemplos de código.
- `get_card` devolve os arquivos de apoio das skills do card; nova ferramenta MCP `write_skill_file`.

## 0.26.0

- **Hooks**: listados um por comando, com o filtro; acrescentar e remover no formato de Claude
  Code, Codex, Cursor e Copilot. Os do Kimi Code são só listados.
- **Regras de permissão** (permitir, perguntar, negar) do Claude Code e da CLI do Cursor:
  listar, acrescentar e remover.

## 0.25.0

- **Servidores MCP**: acrescentar e remover nos arquivos de cada ferramenta, do projeto e da pasta
  do usuário, incluindo o `config.toml` do Codex. O `~/.claude.json` é só leitura.

## 0.24.0

- **Perfis de execução**: agente, skills, servidores MCP, ferramentas, modelo e sessão limpa, por
  fase, com troca por card e um padrão do board.
- A execução pelo board passa o perfil à ferramenta por parâmetro onde ela aceita, e como instrução
  no prompt onde não aceita.
- O modelo e o esforço indicados no card passam a ser enviados à ferramenta na execução.
- MCP: `get_card` devolve `execution`; `get_board` lista os perfis; `update_column` aceita
  `exec_profile`; nova ferramenta `set_card_profile`.

## 0.23.0

- **Skills sob demanda**: cada skill pode ser Automática ou Só quando indicada, gravado no formato
  de cada ferramenta.
- O campo "Skills" dos cards oferece também as skills desligadas, e a execução pelo board recebe o
  caminho de cada skill do card.

## 0.22.0

- **Harness**: criar, apagar e copiar skills, agentes, comandos e regras entre a pasta do usuário,
  os plugins e o projeto. Alterações na pasta do usuário pedem confirmação.

## 0.21.0

- **Harness por ferramenta e por escopo**: uma aba por ferramenta, com o que ela carrega no
  projeto, na pasta do usuário e em plugins (instruções, skills, agentes, comandos, hooks,
  servidores MCP, plugins e configurações).
- O campo "Skills" dos cards oferece as skills globais e de plugins, com filtro por origem.
- Kimi Code: a pasta de skills do projeto passa a ser `.kimi-code/skills`. A pasta antiga,
  `.kimi/skills`, continua listada, mas skills novas vão para a atual.

## 0.20.0

- **Ordem das colunas**: arrastar a linha da coluna nas configurações, no lugar dos botões de seta.
- A coluna nova entra depois da coluna escolhida; por padrão, antes da primeira coluna de conclusão.

## 0.19.0

- **Agentes no harness**: criar, editar e apagar agentes (subagentes) do projeto, no formato de
  cada ferramenta. Ferramentas MCP `get_agent`, `create_agent`, `update_agent` e `delete_agent`.

## 0.18.0

- **Pull request na Homologação**: a IA abre o PR da história e registra o endereço no card.
- **Merge automático** (opcional, desligado por padrão): ao aprovar a homologação, o board faz o
  merge pelo GitHub CLI e conclui o card; se o merge falhar, o card fica Bloqueado.

## 0.17.0

- **Branch e pasta de trabalho por história**: cada história tem uma branch própria, por padrão
  numa worktree separada. Nova aba Git nas configurações.

## 0.16.0

- **Heartbeat**: o board chama a IA sozinho a cada intervalo, quando há pendência com ela.

## 0.15.0

- **Chamar IA pela conversa**: roda a ferramenta do projeto em segundo plano para um card, com
  nível de permissão e tempo limite configuráveis.
- Imagens coladas na conversa viram anexos do card.

## 0.14.0

- **Fila de pendências**: filtro "Com você", contador na barra lateral e aviso quando a IA passa a
  vez. Ferramenta MCP `get_pending_work`.
- **Skill do fluxo** (`faz-ai-fluxo`), que ensina a IA a conduzir os cards pelo board.

## 0.13.0

- **Fases configuráveis**: cada coluna tem a instrução para a IA e o modelo do documento que a
  fase produz.
- Novas colunas **Discovery** e **Homologação** no board padrão.
- Os documentos das fases ficam anexados à história e aparecem como links nas sub-tarefas.

## 0.12.0

- **Status do card**: Pronto, Em execução, Aguardando resposta, Aguardando revisão, Aprovado e
  Bloqueado, mostrando se a pendência está com você ou com a IA.
- **Revisão antes de avançar**: nas colunas que exigem aprovação, a IA só move o card depois que
  você aprova.
- A aba "Comentários" passa a se chamar **Conversa**.
- **Atualização do board**: boards existentes são levados ao padrão novo, com confirmação e sem
  mover cards.

## 0.11.1 e anteriores

Ver o histórico de commits do repositório.
