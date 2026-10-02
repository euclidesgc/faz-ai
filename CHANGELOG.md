🇧🇷 Português · [🇺🇸 English](CHANGELOG_EN.md)

# Changelog

As mudanças de cada versão do Faz AI Kanban, da mais recente para a mais antiga.

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
