🇧🇷 Português · [🇺🇸 English](README_EN.md)

<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

[![☕ Apoie o projeto no Buy Me a Coffee](https://img.shields.io/badge/%E2%98%95_Apoie_o_projeto-Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/euclidesca2)
[![Estrelas no GitHub](https://img.shields.io/github/stars/euclidesgc/faz-ai?style=for-the-badge&logo=github&label=Estrelas)](https://github.com/euclidesgc/faz-ai)

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
uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz o documento de
cada fase e move os cards conforme avança, sempre parando para a sua aprovação.

![Board com histórias nas fases do SDD e sub-tarefas no workflow de baixo](docs/images/board.png)

A interface existe em português e em inglês; nomes de telas e botões aparecem aqui como estão na
interface em português.

## Primeiros passos

1. **Instale e abra.** Instale **Faz AI Kanban** no VS Code ou no Cursor, abra a pasta do projeto e
   clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board, já com as fases do fluxo.
2. **Conecte a IA ao board.** Em **Configurações → Harness**, escolha a ferramenta (Claude Code,
   Cursor ou Kimi Code) e, na aba **Projeto**, clique em **Instalar (padrão da ferramenta)** em
   **Servidores MCP**.
3. **Crie a tarefa.** Na coluna **Backlog**, clique em **+ Novo card**, escreva o título e dê Enter.
   Dê duplo clique no card para descrever o que você quer.
4. **Deixe a IA começar.** Arraste o card para **Discovery** e clique em **Trabalhar na fase**. A IA
   analisa o problema e conversa com você na aba **Conversa**; ao terminar, o status vira
   **Aguardando revisão**.
5. **Revise e siga.** Leia o documento da fase e clique em **Aprovar** ou **Pedir ajustes**. A
   história avança por **PRD**, **Spec**, **Plan** e **Implementação**, sempre com a IA produzindo e
   você aprovando.

## Recursos

- **Fases com aprovação.** Backlog, Discovery, PRD, Spec, Plan, Implementação, Revisão, Homologação e
  Concluído. Nas fases de revisão, a IA termina, pede a sua aprovação e para. Histórias pequenas podem
  seguir uma trilha curta. [Fluxo da história](docs/fluxo.md)
- **Status e "com você".** Todo card mostra se a pendência está com a IA ou com você; o filtro
  **Com você** lista o que espera por você. Perguntas com alternativas chegam como carrossel no card.
  ![Card com status e aprovação](docs/images/card.png) [Fluxo da história](docs/fluxo.md)
- **Busca por card.** `#980` mostra só o card 980; `980` mostra também os cards que o citam.
  [Fluxo da história](docs/fluxo.md)
- **Sessões curtas, contexto controlado.** Cada execução abre o card pelo MCP, faz o trabalho e para,
  sem regras, skills ou hooks que você não tenha marcado. [Harness](docs/harness.md)
- **Harness do board.** Regras, skills, agentes e servidores MCP ficam numa biblioteca do board, ativos
  ou inativos. Cada card recebe só o que libera.
  ![Harness do board](docs/images/harness.png) [Harness](docs/harness.md)
- **Agentes.** Cada execução roda por um agente, com as skills, os servidores MCP, as ferramentas e o
  modelo que ele define. ![Agentes](docs/images/agents.png) [Harness](docs/harness.md)
- **Garantia no Cursor.** Nas execuções do board, um hook global registrado pelo board nega os
  servidores MCP, subagentes e ferramentas que o card não libera. [Harness](docs/harness.md)
- **Chat com a IA.** Peça em linguagem natural para criar, mover e vincular cards, ou pergunte o que
  está esperando por você. ![Chat com a IA](docs/images/chat.png) [Fluxo da história](docs/fluxo.md)
- **Heartbeat e modo autônomo (YOLO).** O heartbeat chama a IA nas pendências dela e cuida dos pull
  requests. No modo autônomo, a IA leva a história do Backlog ao pull request sem perguntar.
  [Automação](docs/automacao.md)
- **Branch e pull request por história.** Cada história ganha branch e pasta de trabalho próprias, no
  gitflow. [Gitflow](docs/gitflow.md)
- **Métricas de consumo.** Tokens, custo em US$, tempo de IA e retrabalho na aba **Consumo** e no painel
  **Métricas**. [Métricas](docs/metricas.md)
- **Conectar agentes.** Uma tela para Claude Code, Cursor, Kimi Code e agentes ACP (como Gemini CLI,
  Codex e OpenCode), com as chaves de API só no cofre deste computador.
  ![Conectar agentes](docs/images/settings.png) [Detalhes](docs/configuracoes.md#conectar-agentes)
- **Contexto do card.** O board confere o que chega de fato a cada agente: contexto fechado ou aberto.
  [Detalhes](docs/configuracoes.md#contexto-do-card-fechado-ou-aberto)
- **Gemini pela API e pela CLI.** Com a mesma chave, o board chama o Gemini direto ou pelo Gemini CLI, e
  mede o consumo em tokens. [Pela API](docs/harness.md#o-gemini-pela-api) ·
  [Pela CLI](docs/harness.md#o-gemini-pela-cli)
- **Cota do Gemini.** Cota esgotada pausa o perfil do Gemini até a renovação.
  [Detalhes](docs/automacao.md#o-que-cada-rodada-faz)
- **Board no navegador.** Abra o mesmo board numa aba do navegador, ou sirva-o sem o editor com o
  comando `faz-ai`. [Dados e navegador](docs/dados.md)
- **Servidor MCP.** Claude Code, Cursor ou qualquer cliente MCP consulta e edita o board.
  [Ferramentas MCP](docs/mcp.md)

## Requisitos

- **Node.js 22 ou mais novo**: o servidor do board roda com ele.
- **A CLI da ferramenta de IA** instalada e logada: Claude Code, Cursor (`cursor-agent`) ou Kimi Code.
- Opcionais: **Git** com um repositório na pasta, **GitHub CLI** logado (merge automático e
  acompanhamento dos PRs) e **Code Review Graph** (grafo do código para a IA).

O **Diagnóstico do ambiente** (**Configurações → Verificar ambiente**) confere cada item e mostra o
comando oficial de instalação; o board não instala nada. Ele também lista as cópias antigas do fluxo
que versões anteriores deixaram nas pastas das ferramentas, para você apagar à mão.

## Configurações

A extensão não acrescenta chaves ao `settings.json` do editor: toda a configuração fica no próprio
board, em **Configurações** (workflows e colunas, tipos de card, campos, regras, Conectar agentes,
Harness, Git, aparência e backup). Veja [Configurações do board](docs/configuracoes.md).

Comandos da paleta (`Ctrl+Shift+P`):

- **Faz AI: Abrir Board**: abre o board da pasta.
- **Faz AI: Abrir board no navegador**: abre o mesmo board numa aba do navegador.
- **Faz AI: Abrir Card**: abre um card pelo número.
- **Faz AI: Instalar o MCP do board (global)**: registra o servidor do board na ferramenta de IA.
- **Faz AI: Rodar o heartbeat agora**: começa uma rodada do heartbeat na hora.
- **Faz AI: Parar as execuções da IA e o modo autônomo**: interrompe o que o board iniciou.
- **Faz AI: Pausar / Retomar o modo autônomo**: pausa ou retoma o autopiloto.
- **Faz AI: Abrir o Diagnóstico do ambiente**: mostra o que o board precisa e o que falta.
- **Faz AI: Abrir as configurações do board**: abre a tela de Configurações.
- **Faz AI: Atualizar board para o padrão atual**: traz as colunas e textos novos sem mexer no que você personalizou.
- **Faz AI: Exportar o board** / **Importar um board**: backup e restauração em `.fazai.json`.
- **Faz AI: Mostrar o log das execuções**: abre o painel **Saída → Faz AI**.

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório: um banco por pasta, com
uma cópia legível em `~/faz-ai-library/<projeto>/`. Atualizar a extensão atualiza o banco; uma versão
anterior recusa abrir um board gravado por uma mais nova. **Configurações → Backup** exporta e importa
tudo num `.fazai.json`. Veja [Onde ficam os dados](docs/dados.md).

## Problemas conhecidos

- **Cursor**: o servidor MCP do board vai no `.cursor/mcp.json` do projeto. Na primeira vez é preciso
  recarregar a janela e ligar o `faz-ai` em Cursor Settings → MCP.
- **Sub-tarefas em paralelo**: a configuração aceita de 1 a 6, mas o efetivo hoje é 1; as sub-tarefas
  rodam uma depois da outra.
- **Claude Code como root** (contêineres, WSL como root) não roda com a permissão "Sem restrições".
- **Node instalado com o editor aberto**: o chat do editor só o encontra depois de fechar e abrir o
  editor.
- **Mesma pasta em duas janelas**: a última a salvar vence; só a janela dona faz a manutenção.
- **Worktree por história** precisa das dependências instaladas em cada pasta de trabalho.
- **Registro antigo no projeto** (`.mcp.json`, `.kimi-code/mcp.json`) vale sobre o global e não é
  migrado: remova o `faz-ai` dele à mão.

## Histórico de versões

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)
