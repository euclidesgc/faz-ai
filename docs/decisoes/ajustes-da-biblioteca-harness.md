# Ajustes da biblioteca do Harness

A tela passa a usar o nome Harness e apresenta Ferramenta e execução antes da biblioteca.

Bibliotecas novas ficam em `~/faz-ai-library/<workspaceKey>`. Cada board tem seu diretório para evitar que projetos diferentes disputem os mesmos arquivos. Bibliotecas instaladas no destino antigo continuam nele; o usuário pode escolher outro nome e caminho no campo Pasta da biblioteca. O seletor apenas preenche o campo; Salvar pasta copia os artefatos antes de persistir o destino e preserva a pasta anterior. No navegador, o seletor navega no computador que executa o host do board.

A importação usa quatro abas, inclusive vazias, com filtros independentes por substring. Seleções persistem ao trocar de aba e ao filtrar; o botão de importação inclui todas as seleções. Por tipo e nome, qualquer artefato existente é preservado, inclusive quando vem da mesma origem. O resultado informa quantos itens entraram e agrupa os ignorados. A confirmação de sobrescrita usa apenas os rascunhos ignorados na última importação: uma origem modificada no disco depois da prévia não muda silenciosamente o conteúdo confirmado. Uma nova varredura invalida a confirmação anterior. Se a própria origem contiver vários itens com mesmo tipo e nome, apenas um entra por rodada; o restante continua registrado como ignorado.

Cada tipo tem uma explicação permanente e um aviso amarelo dispensável, reaberto pelo ícone de informação. Regras novas ficam desligadas. Skills e MCPs no modo Pelo card só entram quando selecionados; agentes precisam ser escolhidos no card, fase ou como padrão. A ajuda explica esses comportamentos sem afirmar que cadastrar um item já o ativa em todas as execuções.

Criar e Assistente guiado usam o editor Markdown compartilhado, com estados de carregamento. O assistente mostra as etapas com seus nomes e explica o que preencher em cada uma antes da revisão. Os exemplos distinguem regras gerais (estrutura, comandos, limites, motivos e exceções), skills (tarefas específicas com entradas e saídas) e agentes (responsabilidades, entregáveis e ferramentas necessárias).

A geração exige um projeto existente e consulta o perfil, os artefatos da biblioteca e os arquivos de regras, skills e agentes do projeto. `get_project_artifacts` fornece até 60 artefatos com até 4000 caracteres por corpo, sem definições MCP. Esses limites mantêm a resposta finita; não representam leitura integral de todos os arquivos de um repositório grande. A IA deve fundamentar as sugestões no conteúdo encontrado e indicar lacunas. Esta operação grava somente na biblioteca.

## Referências oficiais

Consultadas em 17/10/2026:

- [OpenAI: instruções com AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): instruções de projeto e escopo por diretório.
- [Anthropic: memória e CLAUDE.md](https://code.claude.com/docs/en/memory): instruções de projeto concisas, específicas e organizadas.
- [Anthropic: skills](https://code.claude.com/docs/en/skills): descrição de quando usar e procedimentos reutilizáveis, com recursos de apoio.
- [Anthropic: subagentes](https://code.claude.com/docs/en/sub-agents): responsabilidade especializada, contexto e ferramentas próprios.

As escolhas de interface e os modos da biblioteca são decisões do Faz AI. As documentações dos provedores orientam o conteúdo, sem substituir o fluxo e as aprovações do board.


O assistente guiado segue a estrutura do `AGENTS.md` gerado para este projeto: apresentação, mapa do código, validação, convenções e limites. Cada seção tem sua própria etapa, placeholder, dica e exemplo que só entra no texto quando o usuário escolhe usá-lo. Etapas após a primeira são opcionais; respostas vazias não geram seções. Skills seguem uso, entradas, procedimento e resultado; subagentes seguem responsabilidade, escopo, método e entrega. A revisão final mantém o editor Markdown e preserva edições manuais ao voltar sem alterar respostas. O bloco de contexto detectado e suas opções saem do assistente; a geração com IA continua consultando o projeto.


O loading dos botões de texto usa um indicador junto ao rótulo, preservando a leitura da ação durante a espera. As regras têm uma seção própria para comandos, pré-requisitos, ordem de execução e cobertura, e outra para obrigações e proibições inegociáveis. O formulário de regras omite descrição. Na aba Skills, a seleção em massa permite mudar o uso ou excluir cópias com confirmação; skills, subagentes e MCPs não oferecem atualizar da origem; essa ação permanece apenas nas regras. A seleção é independente do filtro e só é limpa após confirmação de sucesso pelo host.


O editor de subagentes usa abas por decisão (instruções, modelo, permissões, skills, MCPs e revisão). O campo descrição não aparece; o resumo necessário ao artefato continua preservado ou é derivado do conteúdo. A escolha de modelo reutiliza o seletor do catálogo e mantém a herança do card. Cada categoria explica sua capacidade e seus limites. Dependências mostram descrição e justificativa quando indicadas pela IA; referências ausentes ficam visíveis para remoção.

A assistência usa a ferramenta de IA do board, pelo gateway medido, com origem de log chat, sem inserir mensagens na conversa. O protocolo `harness.agent.assist` / `harness.agent.assistResult` correlaciona a resposta por requestId e respeita o prazo do executor; não usa o prazo curto das gravações. O prompt recebe perfil do projeto, rascunho e resumos de candidatos, sem definições MCP ou credenciais. Nomes, categorias, modelos e esforços devolvidos são validados no host. A assistência não grava artefatos: propostas de texto, modelo e permissões são aplicadas explicitamente. No Claude a chamada limita as ferramentas a leitura e usa configuração MCP vazia; no Cursor limita as ferramentas à leitura e não instala MCP do board. O Kimi mantém a limitação já documentada de restrições orientadas no prompt.

Salvar primeiro pede uma revisão; um retrato da definição invalida a revisão quando ela muda. A melhoria automática aplica apenas o Markdown proposto, mantendo escolhas de permissões e dependências. Uma falha deixa o rascunho intacto, com opção explícita de salvar sem revisão. Interromper a assistência usa o cancelamento do executor compartilhado.

As explicações de especialização e delegação seguem a [documentação de subagentes da Anthropic](https://code.claude.com/docs/en/sub-agents). A distinção entre instruções e integrações segue a [arquitetura do MCP](https://modelcontextprotocol.io/docs/learn/architecture), consultadas em 17/10/2026.


## Integração e notas de release

As entregas entram na `develop` antes de uma release. A seção Não lançado / Unreleased descreve somente o que já está integrado nessa branch. Trabalho exclusivo de outras branches permanece nos cards e registros, sem aparecer como funcionalidade entregue. O script de release já renomeia essa seção para a versão e valida o changelog empacotado; integrar as alterações não executa publicação, cria tag ou muda a versão.
