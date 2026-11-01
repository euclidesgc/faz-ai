# Conectar agentes: uma tela para o agente de IA do board

> Entregue em 2026-10-24, sobre a POC da conexão pelo SDK oficial do ACP (`@agentclientprotocol/sdk` 2.0.2).
> Substitui as telas Ferramentas de IA e Modelos de IA, da épica
> [Ferramenta por modo](epica-ferramenta-por-modo.md), e reaproveita o Conectar dela.

## Contexto

A conexão com a ferramenta de IA estava espalhada: **Ferramentas de IA** (o Conectar por ferramenta e modo,
os perfis de CLI, o personalizado, as capacidades, a ciência do regime e as políticas de fallback),
**Modelos de IA** (o catálogo de cada perfil e as regras de sugestão) e, na POC, **Conexão com agente**
(o registro oficial do ACP, a conta, a sessão de teste e o log do protocolo). A pessoa não sabia qual tela
decidia o agente que roda os cards.

Os testes da POC mostraram também que a conexão confundia: "conectado" era um processo do agente aberto
pela tela; o adaptador do Claude abre a sessão mesmo sem login e só recusa no prompt; o logout parecia não
fazer nada (foi clicado três vezes no log); depois do login no terminal era preciso clicar em "Tentar a
sessão de novo"; e nada sobrevivia a recarregar a janela.

## Decisão

- **Uma tela, Conectar agentes, antes do Harness.** No topo, o agente em uso (`board.aiTool`); à esquerda,
  a lista (os perfis do board e, à parte, os agentes do registro do ACP que o board ainda não executa); à
  direita, o agente com as abas **Conexão**, **Modelos**, **Testar** e **Detalhes**; no fim, as regras de
  sugestão e as políticas de execução. As abas antigas (`aiTools`, `models`, `acpPoc`) viram `connect` em
  `toSettingsTab`, para a aba guardada e os links antigos não caírem numa tela vazia.
- **Conectado é o que o board guarda, não um processo.** O estado é o do Conectar (`connections`, o perfil
  ligado com os modelos). O processo do agente só vive durante uma verificação de conta, um login, a sessão
  de teste ou uma execução de card, como no Zed, em que cada conversa abre o próprio processo.
- **A conta numa verificação curta.** CLI: o status em JSON (`claude auth status`, `cursor-agent status
  --format json`); ACP: `initialize` e `session/new` sem pedido, numa pasta descartável, lendo o
  `_auth/status_update` quando o agente manda (o adaptador do Claude, o Codex). O agente ligado e instalado
  é conferido ao abrir; o do registro, só no clique (o npx pode baixar o pacote).
- **O login no terminal, como o RFD de métodos de login do ACP pede.** O board declara `auth.terminal` no
  `initialize` (sem isso o adaptador do Claude não lista como entrar), roda no terminal o próprio programa do
  agente com os `args` do método (ou o comando do `_meta["terminal-auth"]`) e espera o processo sair: saída 0
  é sucesso. Aí verifica de novo e retoma o Conectar que tinha parado no login. Um método de terminal nunca vai
  ao `authenticate`. No editor, o terminal é criado com o processo do login como `shellPath`, e o código chega
  no `onDidCloseTerminal`; no navegador sem editor, a tela mostra o comando.
- **Sair da conta pede confirmação**, porque o logout das ferramentas vale para a máquina inteira (o teste
  da POC deslogou o Claude Code do terminal). Só aparece com login e quando a ferramenta sai pelo board
  (`auth.logout` do ACP, ou `logout` da CLI no Claude Code e no Cursor; o Kimi Code 2.x não tem).
- **A sessão de teste fecha sozinha** depois de 10 minutos parada, nunca no meio de uma resposta, e ao abrir
  outra ou fechar a tela. Usa o mesmo comando dos cards quando o board conhece o agente pelo ACP, com a chave
  do cofre no Gemini; o Claude Code testa pelo adaptador `claude-agent-acp`.
- **O registro em cache**: memória e `acp-registry.json` na pasta de dados, por 6 horas; sem rede, a cópia
  anterior com o erro. O npx roda com `--prefer-offline`: 500 ms contra 600 a 830 ms por abertura do
  adaptador do Claude, medido com o pacote no cache.
- **O log do protocolo** junta as verificações, os logins e a sessão de teste, no arquivo do dia
  (`acp-AAAA-MM-DD.jsonl`) e na tela. A regra que esconde segredos deixou de esconder os contadores de
  consumo (`inputTokens`, `totalTokens`), que contêm "token" no nome.

## Alternativas descartadas

- **Manter a conexão viva na tela** (a POC): o processo ficava esquecido, e o estado se perdia ao recarregar.
- **Trocar já o transporte de execução pelo SDK**: o transporte à mão (`src/extension/ai/acp/`) carrega a
  regra de permissão do card, a leitura das ferramentas MCP, a medição e o limite de uso de cada agente; trocar
  junto com a tela misturaria duas mudanças grandes no núcleo.
- **Executar cards com qualquer agente do registro**: o board só executa os agentes de `ACP_AGENTS`; um
  agente sem essa entrada não tem a tradução de permissões nem a medição, e a admissão vincula o comando do
  catálogo. Eles ficam para teste.
- **Login pelo `authenticate` para todo método**: o protocolo proíbe mandar o método de terminal ao
  `authenticate`, e o processo do login não é a conexão ACP.

## Consequências

- O que estava em Ferramentas de IA e Modelos de IA continua igual por baixo (os mesmos `settings.*`, o mesmo
  Conectar no host); muda onde fica na tela. Os textos que apontavam para as telas antigas (avisos, mensagens
  do host, descrição do `set_ai_tool`) apontam para Conectar agentes.
- Há dois clientes ACP no código: o do SDK (a tela) e o escrito à mão (a execução).

## Pendências

- Levar o transporte de execução para o SDK oficial, e ficar com um cliente ACP só.
- Executar cards com os agentes do registro que tiverem medição e tradução de permissões.
- O Claude pelo ACP com cobrança de API (`--hide-claude-auth` do adaptador), sem a assinatura.
