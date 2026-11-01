# Ferramenta por modo, 13: perfil personalizado vira caminho avançado e limpeza

> História 13 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 7](ferramenta-por-modo-7-conectar-gemini-acp.md) (Conectar) e da
> [história 8](ferramenta-por-modo-8-gemini-cli.md) (Gemini pela CLI).

## Contexto

Com o Conectar (histórias 7, 8 e 10), toda ferramenta do catálogo entra por uma lista fixa, escolhendo o modo,
e a verificação de capacidades virou um passo do fluxo. Sobravam três coisas do desenho antigo:

- o botão **Novo perfil** no topo de Ferramentas de IA, levando ao formulário do perfil personalizado como se
  fosse o caminho normal, com o campo **Agente ACP**, que era o jeito de rodar um agente pelo ACP antes do
  catálogo;
- o comando da paleta **Faz AI: Verificar o isolamento da CLI de IA**, que a história 2 deixou para o Claude
  Code, porque a sonda dele roda a CLI quatro vezes e não devia disparar sozinha;
- tabelas e `switch` por `AiBase` nos pontos que o driver já cobre: `CLI_COMMAND` e `LOGIN_COMMAND`
  (`shared/requirements.ts`, lidos pelo driver de CLI, pela resolução do comando e pelo Diagnóstico), o
  `switch` de `registeredServer` (`requirements.ts`) e o de `registerClients` (`mcp/clientConfig.ts`).
  `CLI_DOCS` e as linhas das CLIs em `INSTALL` já tinham saído de `environment.ts` na história 5.

## Decisão

### O personalizado atrás de "Avançado"

- **O botão saiu do topo.** Ferramentas de IA ganha, abaixo da lista de perfis, um bloco recolhido
  **Avançado** com o que o personalizado é (uma linha de comando que o catálogo não traz; sem medição de tokens
  nem custo, sem verificação de capacidades, tudo orientação pelo pedido) e o botão **Novo perfil de CLI
  personalizado**. O caminho normal fica sendo o Conectar, acima.
- **Só CLI para perfis novos.** O formulário novo não tem o campo **Agente ACP**. A regra mora também no host
  (`AiProfileRepo.save`): `acpAgent` num personalizado só é aceito quando o perfil já era ACP (o modo gravado ou
  o agente no cofre); criar um personalizado ACP ou transformar uma CLI personalizada em ACP é recusado com a
  mensagem que aponta o Conectar. O formulário não é a única porta (a tela do navegador manda a mesma mensagem).
- **Os personalizados ACP antigos continuam rodando**, sem mudança no transporte, na admissão nem no vínculo. A
  lista mostra o aviso ("de uma versão anterior: continua rodando como está"), com **Abrir o Conectar** no agente
  do perfil quando ele está em `TOOLS`; o formulário de edição mostra o mesmo aviso, mantém o campo **Agente
  ACP** (vazio guarda o agente salvo) e esconde o comando e os argumentos, que não valem no ACP.
- **A cópia de um agente ACP pronto continua nascendo personalizada ACP** (`duplicate`, como decidiu a história
  8): é o jeito de mudar o nome ou o ambiente de um agente do catálogo, e ganha o mesmo aviso. Não foi tirada:
  seria uma mudança no repositório e na exportação fora do escopo, e o caso é o mesmo do personalizado antigo.

### O comando de verificação sai, sem deixar perfil sem caminho

Conferido no código antes da remoção (`ai/connect.ts`, `ai/verifications.ts`, `boardHost.ts`):

| Perfil verificável                        | Antes                    | Depois                                                     |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| Claude Code pronto                        | só o comando             | Conectar e Reconectar (passo `verify`, `deps.verify`)      |
| Gemini pela CLI                           | Conectar ou comando      | Conectar e Reconectar                                      |
| Agente ACP pronto                         | ao ligar, Conectar, comando | ao ligar, Conectar, conferência do ambiente            |
| Personalizado ACP (antigo)                | ao ligar, comando        | ao ligar, conferência do ambiente, **Verificar capacidades** |
| Cópia do Claude Code                      | só o comando             | **Verificar capacidades**                                  |

O Conectar cobre o Claude Code: o fluxo chama o verificador do host para todo perfil `verifiableProfile`
(`test/connect.test.ts` confere que `connect('claude')` verifica). Mas a cópia do Claude Code é verificável e
não passa pelo Conectar (`isReadyProfile` exige `tool === id`), e não tem disparo automático (a história 2 o
deixou só para o ACP). Sem um caminho equivalente, ela ficaria sem forma de provar as capacidades. Por isso:

- **`settings.aiProfiles.verify { id }`**, só pela HostBridge (como o `connect`: `viaBridge` no router, então a
  IA e o MCP não chegam ao verificador), chama `router.verifyProfile`, ligado pelo host a
  `Verifications.detailed` (a mesma coordenação do Conectar e da verificação automática: uma verificação por
  perfil e estado da chave). A frase do resultado volta num `notice`, traduzida (`i18n/en/connect.ts`), e a
  faixa de requisitos é conferida de novo.
- **Ferramentas de IA › Verificar capacidades**, só nos perfis verificáveis que não têm Conectar; desligado no
  perfil desligado ou pendente de revisão. O perfil do catálogo usa o Reconectar.
- **A faixa de prova vencida aponta o lugar certo.** No perfil verificado à mão (`evidenceInvalidated:
  'command'`), a ação passa de "Ver no diagnóstico" a **Abrir o Conectar** (`connect`, perfil pronto de um modo
  oferecido) ou **Abrir Ferramentas de IA** (`aiTools`, novo, na cópia), com o texto de cada caso. O que o board
  refaz sozinho (ACP) segue com o Diagnóstico.
- **O Diagnóstico** diz "conecte em Ferramentas de IA" (pronto) ou "clique em Verificar capacidades" (cópia,
  personalizado ACP), também no navegador, que antes não mostrava nada porque não tem paleta.
- `fazai.verifyExecutor` saiu do `package.json`, dos dois `package.nls*.json` e do `extension.ts`;
  `verifiableProfiles` (a lista do QuickPick) saiu de `shared/aiProfiles.ts`. `BoardHost.verifyExecutor` fica:
  é o que o Conectar e o botão novo chamam.

### `AiBase` sai dos pontos que o driver cobriu

- **Comando e login da CLI no catálogo.** `ToolModeEntry.cli = { command, login }` nas linhas de CLI do Claude
  Code, do Cursor e do Kimi Code em `TOOLS`, com os mesmos valores de `CLI_COMMAND` e `LOGIN_COMMAND`, que
  saíram. Moram no catálogo pelo mesmo motivo do `enforcement` (história 5): o driver os usa e a webview (o
  Diagnóstico) também os lê, e `src/shared` não importa a extensão. `cliDriver` os tira daí (e recusa uma CLI sem
  eles); a ficha da tela (`signIn`) usa a mesma constante, sem mudar o texto. `profileCommand` (`cliResolve.ts`)
  e o login do Diagnóstico (`ProfileBlock`) consultam a linha por `toolModeOf(perfil)`, a mesma consulta de
  `driverOf`; `cliResolve` não importa o driver porque os drivers usam `resolveCommand` dele.
- **O servidor do board pelo driver.** `ConnectionDriver.boardServer?: BoardServerSupport` (`register`,
  `registered`), com as três implementações em `mcp/clientConfig.ts` (`CLAUDE_BOARD_SERVER`,
  `CURSOR_BOARD_SERVER`, `KIMI_BOARD_SERVER`), o mesmo código dos dois `switch`, sem mudar um caminho, um arquivo
  nem um comando. O despacho (`registerClients`, `registeredServer`) foi para `mcp/boardServer.ts`, por
  `driverFor(tool, 'cli')`: no `clientConfig.ts` ele fecharia um ciclo de importação, porque os drivers importam
  de lá. `requirements.ts` reexporta `registeredServer` e `Registered`. O Gemini e os agentes ACP não têm
  `boardServer`, como antes (o Gemini recebe os servidores na home isolada da execução; o ACP, no
  `session/new`).
- Nenhuma flag, caminho ou formato de ferramenta mudou: os valores movidos são os conferidos antes (comando e
  login nas CLIs em 2026-10-13; `claude mcp add-json --scope user`, o `mcp.json` do Kimi Code 2.1.1 sem `type`,
  o `.cursor/mcp.json` do projeto, todos já documentados no código), por isso não houve nova leitura da
  documentação das ferramentas.

### Depois da revisão do #378

- **Abrir o Conectar só com o modo ACP no catálogo** (`toolModeEntry(agente, 'acp')`): o Cursor e o Kimi Code
  têm entrada em `TOOLS` só com a CLI, e o botão levaria ao cartão de outro modo. Sem o modo ACP, o aviso vem
  sem o botão.
- **O importado pendente anterior ao formato 48 aceita o agente.** Uma linha personalizada com `tool` vazio e
  pendente de revisão (o cofre não está nesta máquina, então o preenchimento da migração 48 não diz se era ACP)
  aceita `acpAgent` no `save`, e o formulário mostra o campo como opcional ("se o perfil era de um agente ACP
  no board de origem"): o backup antigo não perde o caminho ACP. O personalizado ACP sem a configuração nesta
  máquina exige o agente no formulário, porque não há agente salvo para manter.
- **Texto neutro**: o aviso diz "Personalizado pelo ACP: continua rodando como está…", porque vale também para
  a cópia de um agente pronto e para o importado, não só para o de uma versão anterior.
- **Verificar capacidades trava só o próprio perfil**, com o motivo por caso (desligado; pendente de revisão);
  outro perfil pode ser verificado ao mesmo tempo (o host já coordena uma verificação por perfil).
- **Sem "Verificar de novo" na ponte**: a HostBridge não chama mais `recheckRequirements` depois da
  verificação. O host já confere o ambiente ao fim de toda verificação (`Verifications.done`), e o "Verificar
  de novo" ainda relê o PATH, pula o cache do login e reabre as provas automáticas do ACP, o que não cabe aqui.
- A recusa do verificador do host cita também o Gemini pela CLI; `test/verifyProfile.test.ts` passa a
  mensagem pelo `BoardHost` de verdade (perfil inexistente, sem sonda, desligado, pendente).

## Onde a especificação não cabia no código

- **"A opção de regime sai"** (a tabela da épica): a opção da tela já saiu na história 7. O campo do board
  (`RunnerConfig.compatibilityReviewRevision`, o regime para o board inteiro de quem o ligou antes) continua
  lido como recurso de `admissionRegimeOf`: tirá-lo mudaria o regime em que perfis de quem o ligou rodam, e a
  especificação desta história pede nenhuma mudança de comportamento além da troca das tabelas. Fica para uma
  história que migre o campo para a ciência por perfil.
- **`CLI_DOCS` e `INSTALL`** já não tinham as CLIs desde a história 5 (`INSTALL` ficou só com o Node.js e o uv,
  que não são ferramentas de IA); a história acrescenta o teste que confere que a instalação e a página de toda
  CLI do catálogo, inclusive o Gemini pela CLI, vêm do driver.
- **`ALL_AI_BASES` na reinstalação do MCP** (`mcp/reinstall.ts`) e `AiBase` nos providers, no harness e no
  `AGENT_FORMAT` ficam: não são tabelas que o driver cobre (a história 5 explica por que o Gemini não entra em
  `AiBase`).

## Alternativas descartadas

- **Manter o comando da paleta só para a cópia do Claude Code**: dois caminhos para a mesma coisa, e um deles
  sem tela no navegador. O botão na lista serve o editor e o navegador.
- **Verificar a cópia do Claude Code sozinha ao ligar**: a sonda roda a CLI quatro vezes; a história 2 decidiu
  não disparar isso sem a pessoa pedir.
- **Botão de verificar no Diagnóstico**: o Diagnóstico mostra e aponta; quem age sobre o perfil é Ferramentas de
  IA, onde já estão o Conectar, o Testar e a ciência.
- **Esconder o personalizado ACP antigo ou convertê-lo**: ele roda hoje e tem cards e políticas apontando o id;
  a conversão para o perfil pronto trocaria o id e o catálogo de modelos.
- **Despacho do servidor do board dentro do `clientConfig.ts`**: o ciclo `clientConfig → drivers → clientConfig`
  dependeria da ordem de avaliação dos módulos no bundle.

## Consequências

- Nenhuma mudança na execução de um card (plano, gateway, admissão, transporte, leitura, conferência): os
  cenários de `test/scenarios/` seguem verdes e nenhum cenário novo foi preciso.
- Cursor e Kimi Code pelo ACP, que só existiam por um personalizado com **Agente ACP**, não podem mais ser
  criados; os já criados continuam. O catálogo os oferece depois do teste real deles.
- Entrar com uma CLI que fala MCP fora do board é declarar `boardServer` no driver; o `CONTRIBUTING.md` diz isso.
- Testes: `test/ui/aiToolsSettings.test.tsx` (o Avançado, o formulário só de CLI, o aviso, o Abrir o Conectar e o
  Verificar capacidades), `test/requirements.test.ts` (a ação da prova vencida por caso; o servidor do board
  pelo driver), `test/environment.test.ts` (instalação e página pelo driver, inclusive o Gemini pela CLI),
  `test/aiProfileRepo.test.ts` (a recusa do ACP novo), `test/hostBridge.test.ts` (a mensagem nova),
  `test/connect.test.ts` (o Conectar verifica o Claude), `test/drivers.test.ts`, `test/ui/requirements.test.tsx`,
  `test/ui/environment.test.tsx` e `test/extension.test.ts` (o comando não é mais registrado).
