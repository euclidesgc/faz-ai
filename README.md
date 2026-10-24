🇧🇷 Português · [🇺🇸 English](README_EN.md)

<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

> ⚠️ **O Faz AI está em fase alpha.**
>
> O projeto é novo e muda rápido: telas, comandos e o formato do board ainda podem mudar. Revise o
> que a IA fizer antes de aprovar. Se algo quebrar, [conte numa issue](https://github.com/euclidesgc/faz-ai/issues).

> **Obrigado a quem está baixando e testando.**
>
> Publiquei a extensão e, no dia seguinte, ela já tinha 160 downloads. A cada pessoa que deu uma
> chance a um projeto recém-nascido: muito obrigado. O Faz AI é **totalmente gratuito e open source**
> (licença MIT); contribuições são bem-vindas. — Euclides G Catunda

Gostou? Ajude o Faz AI a crescer:

- ☕ **Apoie o projeto** em [buymeacoffee.com/euclidesca2](https://buymeacoffee.com/euclidesca2): é o que
  mantém o Faz AI gratuito e em evolução.
- ⭐ **Dê uma estrela** no [repositório do GitHub](https://github.com/euclidesgc/faz-ai).
- 💬 **Avalie a extensão** no [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=euclidesgc.faz-ai&ssr=false#review-details)
  ou no [Open VSX](https://open-vsx.org/extension/euclidesgc/faz-ai/reviews) (a loja do Cursor).
- 🐞 Bug ou ideia? [Abra uma issue](https://github.com/euclidesgc/faz-ai/issues/new?template=bug.yml)
  ou [conte uma sugestão](https://github.com/euclidesgc/faz-ai/issues/new?template=sugestao.yml).

Um board kanban dentro do editor (VS Code e Cursor) para conduzir Spec-Driven Development (SDD) com
uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz os artefatos de
cada fase e move os cards conforme avança, sempre parando para a sua aprovação.

![Board com histórias nas fases do SDD e sub-tarefas no workflow de baixo](docs/images/board.png)

## Primeiros passos

1. **Instale e abra.** Instale **Faz AI Kanban** no VS Code ou no Cursor, abra a pasta do projeto e
   clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board, já com as fases do fluxo.
2. **Conecte a IA ao board.** Em **Configurações → Harness**, escolha a ferramenta (Claude Code,
   Cursor ou Kimi Code) e, na aba **Projeto**, clique em **Instalar (padrão da ferramenta)** em
   **Servidores MCP**.
3. **Crie a tarefa.** Na coluna **Backlog**, clique em **+ Novo card**, escreva o título e dê Enter.
   Duplo clique abre o card para descrever o que você quer.
4. **Deixe a IA começar.** Arraste o card para **Discovery** e clique em **Trabalhar na fase**. A IA
   analisa o problema e conversa com você na aba **Conversa**; ao terminar, o status muda para
   **Aguardando revisão**.
5. **Revise e siga.** Leia o documento da fase e clique em **Aprovar** (ou **Pedir ajustes**). A
   história avança por **PRD**, **Spec**, **Plan** e **Implementação**, sempre com a IA produzindo e
   você aprovando.

## Recursos

- **Fases do fluxo com aprovação.** Backlog, Discovery, PRD, Spec, Plan, Implementação, Revisão,
  Homologação e Concluído, cada uma com a instrução e o modelo de documento que a IA segue. Nas fases
  de revisão, a IA termina, pede a sua aprovação e para. Histórias pequenas podem seguir uma trilha
  curta. [Fluxo da história](docs/fluxo.md)
- **Status e "com você".** Todo card diz se a pendência está com a IA ou com você; o contador
  **N com você** e o filtro **Com você** mostram o que espera por você. Perguntas com alternativas
  chegam como um carrossel no card. [Fluxo da história](docs/fluxo.md)
- **Busca por card.** Na busca do board, `#980` mostra só o card 980, e `980` mostra o card 980 e os
  cards que o citam, em histórias e sub-tarefas. [Fluxo da história](docs/fluxo.md)
- **Card selecionado em destaque.** O card selecionado, os marcados na seleção múltipla e a linha
  escolhida nas listas ganham uma sombra que os separa do board, sem tirar o contorno de foco.
- **Sessões curtas, contexto controlado.** Cada execução abre o card pelo MCP, faz aquele trabalho e
  para; começa sem regras, skills, agentes ou hooks que você não tenha marcado, e lê os documentos
  anexados só quando precisa. A conversa que ela lê tem no máximo 20 mensagens (ou começa no último
  resumo). [Harness](docs/harness.md)
- **Harness do board.** Regras, skills, agentes e servidores MCP vivem numa biblioteca do board, no
  modo **Sempre**, **Pelo card** ou **Desligado**, com importação e exportação para a ferramenta.
  Toda execução roda por um agente, com o mínimo de que ele precisa.
  ![Harness do board](docs/images/harness.png) [Harness](docs/harness.md)
- **Garantia no Cursor pelo hook do board.** O board registra um hook global em `~/.cursor/hooks.json`.
  Em cada execução do board, ele nega o que o card não permite: servidores MCP, subagentes e ferramentas
  fora da lista do card. Skills e o texto do agente seguem como orientação. Fora das execuções do board,
  o hook libera tudo e o Cursor segue como antes. Para tirar, apague do `~/.cursor/hooks.json` as
  entradas cujo comando termina em `cursor-hook.js`; a extensão as registra de novo ao abrir uma pasta
  do board no Cursor.
- **Chat com a IA.** Peça em linguagem natural para criar, mover e vincular cards, ou pergunte o que
  está esperando por você. ![Chat com a IA](docs/images/chat.png) [Fluxo da história](docs/fluxo.md)
- **Heartbeat e modo autônomo (YOLO).** O heartbeat chama a IA sozinho nas pendências dela, resume
  conversas longas e cuida dos pull requests. Em modo autônomo, a IA leva a história do Backlog ao
  pull request sem perguntar, e o autopiloto enfileira as histórias. [Automação](docs/automacao.md)
- **Branch e pull request por história.** Cada história ganha branch e pasta de trabalho próprias,
  no gitflow; a Homologação abre o PR com **Como testar**, e o board detecta o merge, limpa a branch
  e pode registrar a decisão em `docs/decisoes`. [Gitflow](docs/gitflow.md)
- **Métricas de consumo.** Um anel no card estima o contexto da próxima execução; a aba **Consumo** e
  o painel **Métricas** mostram tokens, tempo de IA, retrabalho e o que a IA usou. Cada execução também
  é conferida contra o que o card liberou: **sem desvio**, **com desvio** (o card avisa na conversa, e o
  painel conta por ferramenta de IA) ou **não conferida** (a ferramenta não informou o que usou). A IA
  consulta o mesmo com `get_metrics`. [Métricas](docs/metricas.md)
- **Board no navegador.** Abra o mesmo board numa aba do navegador, sincronizado com o editor, ou
  sirva-o sem o editor com o comando `faz-ai`. [Dados e navegador](docs/dados.md)
- **Conectar agentes.** Uma tela para os agentes de IA que rodam os cards, todos ao mesmo tempo, cada card no agente do modelo dele (Claude Code, Cursor, Kimi Code ou um agente ACP do catálogo, como Gemini CLI, Codex e OpenCode), entrar e sair da conta de cada um, conectá-lo ao board, ajustar os modelos e testá-lo numa sessão ao vivo pelo ACP, com o log do protocolo. Os outros agentes do registro oficial do ACP aparecem para teste, e as chaves de API ficam só no cofre deste computador ([detalhes](docs/configuracoes.md#conectar-agentes)).
- **Gemini pela API.** No modo **API** do Gemini, em Conectar agentes, com a mesma chave de API, o board chama o modelo direto e faz ele mesmo o ciclo de ferramentas: o modelo só vê as ferramentas do board e dos MCPs que o card libera, e o consumo é medido em tokens. Ler, editar arquivos e rodar comandos são ferramentas do board, liberadas pela permissão do card e presas às pastas dele ([detalhes](docs/harness.md#o-gemini-pela-api)).
- **Gemini pela CLI.** No modo **CLI** do Gemini, com a mesma chave, o board roda o Gemini CLI numa passada com uma home isolada só com o settings dele: as ferramentas e os servidores MCP são os do card, e o consumo é medido em tokens ([detalhes](docs/harness.md#o-gemini-pela-cli)).
- **Cota do Gemini.** Nos três modos, a cota esgotada pausa o perfil do Gemini até a renovação (a diária à meia-noite do Pacífico, a por minuto pelo tempo que a API pede), e o painel de Métricas separa o consumo por modo ([detalhes](docs/automacao.md#o-que-cada-rodada-faz)).
- **Servidor MCP.** Claude Code, Cursor ou qualquer cliente MCP consulta e edita o board.
  [Ferramentas MCP](docs/mcp.md)

## Requisitos

- **Node.js 22 ou mais novo**: o servidor do board roda com ele.
- **A CLI da ferramenta de IA** instalada e logada: Claude Code, Cursor (`cursor-agent`) ou Kimi Code.
- Opcionais: **Git** com um repositório na pasta, **GitHub CLI** logado (merge automático e
  acompanhamento dos PRs) e **Code Review Graph** (grafo do código para a IA).

O **Diagnóstico do ambiente** (**Configurações → Verificar ambiente**) confere cada item e mostra o
comando oficial de instalação; o board não instala nada.

## Configurações

A extensão não acrescenta chaves ao `settings.json` do editor: toda a configuração fica no próprio
board, em **Configurações** (workflows e colunas, tipos de card, campos, regras, Conectar agentes,
Harness, Git, aparência e backup). Veja [Configurações do board](docs/configuracoes.md).

Comandos da paleta (`Ctrl+Shift+P`):

| Comando                                           | O que faz                                              |
| ------------------------------------------------- | ------------------------------------------------------ |
| **Faz AI: Abrir Board**                           | Abre o board da pasta                                  |
| **Faz AI: Abrir board no navegador**              | Abre o mesmo board numa aba do navegador               |
| **Faz AI: Abrir Card**                            | Abre um card pelo número                               |
| **Faz AI: Instalar o MCP do board (global)**      | Registra o servidor do board na ferramenta de IA       |
| **Faz AI: Rodar o heartbeat agora**               | Começa uma rodada do heartbeat na hora                 |
| **Faz AI: Parar as execuções da IA e o modo autônomo** | Interrompe o que o board iniciou                  |
| **Faz AI: Pausar / Retomar o modo autônomo**      | Pausa ou retoma o autopiloto                           |
| **Faz AI: Abrir o Diagnóstico do ambiente**       | Mostra o que o board precisa e o que falta             |
| **Faz AI: Abrir as configurações do board**       | Abre a tela de Configurações                           |
| **Faz AI: Atualizar board para o padrão atual**   | Traz as colunas e textos novos sem mexer no que você personalizou |
| **Faz AI: Exportar o board** / **Importar um board** | Backup e restauração em `.fazai.json`               |
| **Faz AI: Mostrar o log das execuções**           | Abre o painel **Saída → Faz AI**                       |

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório: um banco por pasta, com
os artefatos do Harness dentro dele e uma cópia legível em `~/faz-ai-library/<projeto>/`. Atualizar a
extensão atualiza o banco; uma versão anterior recusa abrir um board gravado por uma mais nova.
**Configurações → Backup** exporta e importa tudo num `.fazai.json`. Veja
[Onde ficam os dados](docs/dados.md).

## Problemas conhecidos

- **Cursor**: o servidor MCP do board vai no `.cursor/mcp.json` do projeto. Na primeira vez é
  preciso recarregar a janela e ligar o `faz-ai` em Cursor Settings → MCP.
- **Sub-tarefas em paralelo**: a configuração aceita de 1 a 6, mas o efetivo hoje é 1; as
  sub-tarefas rodam uma depois da outra.
- **Claude Code como root** (contêineres, WSL como root) não roda com a permissão "Sem restrições".
- **Node instalado com o editor aberto**: o chat do editor só o encontra depois de fechar e abrir o
  editor; o board grava o caminho completo nos registros que ele mantém.
- **Mesma pasta em duas janelas**: a última a salvar vence; só a janela dona faz a manutenção.
- **Worktree por história** precisa das dependências instaladas em cada pasta de trabalho.
- **Registro antigo no projeto** (`.mcp.json`, `.kimi-code/mcp.json`) vale sobre o global e não é
  migrado: remova o `faz-ai` dele à mão.

## Histórico de versões

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)
