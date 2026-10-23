🇧🇷 Português · [🇺🇸 English](CONTRIBUTING_EN.md)

# Contribuindo com o Faz AI

## Comandos

```sh
npm install
npm run build
npm test
npm run typecheck
npm run validate
```

`npm run build` gera o `dist/`. `npm test` também roda o lint e confere a formatação; `npm run format`
formata tudo. Para o `git blame` pular o commit que só formatou o código:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`. `npm run typecheck` confere os tipos.
`npm run validate` é a conferência antes de concluir uma história ou abrir o PR: typecheck, eslint e
prettier nos arquivos alterados contra `origin/develop`, `vitest related` e os cenários de ponta a
ponta do card em `test/scenarios/`.

Pressione `F5` para abrir o Extension Development Host. O código fica em `src/extension` (host e
servidor MCP), `src/webview` (interface em React), `src/shared` (modelo, protocolo e as regras do
board usadas pelo host e pela interface), `src/mcp-bridge` (ponte stdio usada pelos clientes de IA)
e `src/cli` (o board fora do editor).

Para testar a interface sem o editor, `node dist/cli.js <pasta> --data <pasta de dados de teste>`
serve o board no navegador. Os testes cobrem a ativação da extensão (com um editor de mentira em
`test/fakes/vscode.ts`) e o servidor da página (`test/webServer.test.ts`).

`npm run test:cli-real` roda separadamente o contrato do provider com o **Claude Code instalado**, em
pasta e configuração temporárias, com API e MCPs locais de teste. Não requer login e não chama um
modelo remoto; a API controla as respostas para testar tentativas proibidas sem depender do
comportamento do modelo. Controles positivos carregam sentinelas do projeto, usuário, ancestrais e
pasta adicional, além de skill, agente, hook e MCP externo; o caminho estrito precisa excluí-los. O
teste também reproduz a regressão da variável de memória adicional. Ausência de CLI ou plataforma
Windows produz falha explícita. Os sete testes passam pelo gateway e transporte medido reais, com
SQLite descartável em disco: também conferem cancelamento, encerramento forçado, falha antes da
liberação, ausência de repetição e limpeza dos arquivos privados. Eles não habilitam um perfil de
produção: políticas gerenciadas, ambiente real de autenticação/API, Cursor/Kimi e consumo de tarefas
aceitas ainda precisam de validação.

`test/cli-real/gemini.real.ts` (também em `npm run test:cli-real`) é diferente: roda um card mínimo
pelo board nos três modos do Gemini (CLI, ACP e API) com o binário e a API de verdade, e **gasta cota
da sua conta**. Por isso só roda com `FAZAI_REAL_CONFIRM=1` (o roteiro `node scripts/gemini-real.mjs
--sim` põe e explica); sem a confirmação, sem o binário `gemini` ou sem `GEMINI_API_KEY`, cada modo é
**pulado** com o motivo, nunca falha nem passa em silêncio. Os rótulos de verificado e não validado
ficam em `docs/decisoes/ferramenta-por-modo-14-teste-real-gemini.md`.

## Fluxo de trabalho

Novas funcionalidades são integradas na `develop`. Cada mudança é uma história no board do próprio
Faz AI: o card conduz a história pelas fases, e cada história vira um pull request para a `develop`.
Itens ainda em desenvolvimento ficam nas suas branches e nos cards. Integrar na `develop` não publica
a extensão. A `main` só aceita mudanças por pull request, e o script de release já cuida disso.

## Como entra uma ferramenta de IA

O board fala com cada ferramenta de IA num **modo**: a CLI de uma passada (`cli`), o Agent Client
Protocol (`acp`) ou a API do modelo (`api`). As peculiaridades de cada par (ferramenta, modo) ficam
num driver; o board, as telas e a admissão só falam com o contrato.

1. **O driver**: `src/extension/ai/drivers/<ferramenta>/<modo>.ts`, com o contrato de conexão
   (`ConnectionDriver`, em `drivers/types.ts`): comando, `locate`, argumentos de versão, página e
   comandos de instalação, como se entra (`auth`), a sonda de login (`signedIn`), a lista de modelos
   quando a ferramenta a dá por comando (`listModels`), o que o gateway mede (`measure`), o que o
   board impõe (`enforcement`) e, na CLI que fala MCP fora do board, como registrar e onde ela lê o
   servidor do board (`boardServer`, em `mcp/clientConfig.ts`; o despacho é `mcp/boardServer.ts`).
   Uma CLI pronta envolve o provider dela (`ai/providers/`, com o leitor em `aiOutput/`) por
   `cliDriver`, que tira o comando e o login da linha da ferramenta em `TOOLS` (`cli`); um agente ACP é uma entrada de `ACP_AGENTS` (`ai/acp/agents.ts`),
   que `acpDriver` transforma em driver. Registre o driver em `drivers/index.ts` (`driverFor`).
   O mesmo driver cumpre o contrato de execução (`Executor`): `transport`, `run(input, ctx)`, que
   devolve o `Measured` (o processo, o relatório e a falha da medição), e `bindingContext(input, ctx)`,
   a parte da ferramenta no vínculo de isolamento (a invocação e qual executável resolver). O gateway
   só chama `executorOf(perfil).run` e entrega em `ctx` os dois `spawn` já com as conferências dele (a
   admissão revalida o comando antes de cada tentativa); o driver usa o do transporte dele e nunca
   inicia um processo por conta própria. A admissão acrescenta ao `bindingContext` o que é igual para
   toda ferramenta (o digest do binário, o ambiente filtrado, as políticas gerenciadas, a pasta),
   canoniza e faz o hash. Mudar o que `bindingContext` devolve muda o vínculo e invalida as provas
   gravadas: só com uma mudança de formato deliberada (o `version` do contexto) e um registro de
   decisão; `test/admissionBoundary.test.ts` compara os vínculos com a régua de
   `test/helpers/bindingReference.ts`. A CLI personalizada não tem driver e roda pelo executor genérico
   de CLI (`cliExecutor`), o mesmo das CLIs prontas. No modo API (`transport: 'api'`) não há processo:
   o `bindingContext` devolve `apiBinding(...)` (`ai/apiBinding.ts`: endpoint, modelo, versão da
   extensão e o digest da chave, nunca a chave), e a prova não vem de sonda, mas da evidência por
   construção que o host assina (`recordByConstruction`, com os checks de `API_CAPABILITY_CHECKS`); o
   laço do driver é quem cumpre esses checks, com teste. O driver diz quais checks o laço cumpre
   (`guarantees`), e a admissão afirma só esses, quando o vínculo atual não tem prova em vigor; o
   gateway entrega `ctx.beforeRequest` (a admissão reconfere o vínculo com `AdmittedExecution.api()`)
   para o driver chamar antes de cada pedido ao modelo e de cada chamada de ferramenta. A referência é
   `drivers/gemini/api.ts`, com o board como cliente MCP de si mesmo (`mcp/selfClient.ts`).
2. **A linha do catálogo**: a entrada da ferramenta em `TOOLS` (`src/shared/aiTools.ts`), com a
   página, a nota de cobrança, os modos oferecidos (só os que têm driver), os planejados (com a
   história que os entrega), o modo recomendado com o motivo e a ficha de cada modo, com as oito
   linhas que a tela compara: o que o board controla, o regime esperado, a precisão do que foi usado,
   o consumo, o que a ferramenta traz por conta própria, como se entra, a cobrança e quando escolher.
3. **O teste**: `test/drivers.test.ts` confere que todo modo oferecido tem driver, que nenhum modo
   planejado tem, que o recomendado é um dos modos da ferramenta e que toda ficha tem as oito linhas.
   O leitor da saída ganha fixtures reais em `test/aiOutput*.test.ts`.

**A regra da recomendação** é a mesma para toda ferramenta: recomendado é o modo em que o board
controla mais do que o agente acessa e mede o que ele gasta; o empate se desfaz pelo que a ferramenta
carrega por conta própria (menos é melhor). O recomendado pode ser um modo ainda planejado: o selo da
tela só aparece quando ele é oferecido (`recommendedOffered`). Para o Gemini é a API; para o Claude
Code, a CLI, o único modo que usa a assinatura.

`toolModeOf` (em `aiTools.ts`) leva o perfil ao par do driver pelos campos `tool` e `mode` (no
personalizado ACP, o agente do catálogo); use sempre `driverOf(perfil)` para a conexão e
`executorOf(perfil)` para a execução, nunca `base` direto. Antes de codificar algo de uma ferramenta, leia a
documentação oficial atual dela e cite a fonte no comentário.

## Changelog

O changelog segue o Keep a Changelog, com uma seção por versão e os títulos **Adicionado**,
**Alterado**, **Removido** e **Corrigido**. A seção do topo é a próxima versão (a mesma do
`package.json`) e reúne apenas mudanças que já chegaram à `develop`.

## Release

Com o gitflow, o release parte da branch em que você está:

- na `develop`: `npm run release -- X.Y.Z` (a versão do `package.json`, que é a do topo do
  changelog) exige a `develop` atualizada e limpa, testa, cria a branch `release/vX.Y.Z`, faz o
  commit e empacota; `patch|minor|major` ainda funcionam e renomeiam uma seção "Não lançado", se
  houver;
- numa `hotfix/...`: o commit da versão vai na própria branch da correção, e o PR dela, se já
  estiver aberto, é reaproveitado;
- em qualquer outra branch, o script recusa e diz de onde rodar (a opção `--allow-branch` deixou de
  existir).

Depois publica nas duas lojas, envia a branch e abre o PR para a main, que entra com **merge commit**
(nunca squash, para o commit de merge das histórias ficar na tag), e a branch não é apagada nesse
merge. A tag e a GitHub Release com o `.vsix` saem sobre `origin/main`, sem trocar a branch da sua
pasta. Por fim a main volta para a `develop` por PR, também com merge commit. Se algo parar depois da
publicação, `npm run release -- finish` retoma de onde parou: cada passo confere se já foi feito
(PR, tag, release, main contida na `develop`, branches) e não publica de novo. Se a volta para a
`develop` der conflito, resolva no PR aberto e rode `finish`. `--dry-run` ensaia sem publicar. As
opções estão no topo de `scripts/release.mjs`.

Num hotfix (card do tipo Bug, branch `hotfix/...`), rode `npm run release` na worktree da `hotfix/`
**antes** de aprovar o card. Aprovado antes, o PR entra na principal sem versão e a correção só sai
no próximo release da `develop`.

Entre empacotar e publicar, o release abre o `.vsix` e confere os quatro arquivos de vitrine
(`README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_EN.md`): o changelog precisa ter o título
da versão que está saindo no topo, sem nenhum "Não lançado"/"Unreleased" sobrando em lugar nenhum, e
o README precisa ter os blocos de aviso de fase alpha e de agradecimento. Falhando qualquer coisa, o
release recusa antes de publicar em qualquer loja. Se ainda existir uma seção "Não lançado", o
release a renomeia para a versão em todos os modos, inclusive no `--dry-run`; quando o release não
chega a commitar (dry-run ou `--no-git`), os CHANGELOGs renomeados são restaurados ao original ao
final. `--allow-no-notes` só é exigida quando não há essa seção **e** a primeira seção do CHANGELOG
não for a versão que está saindo.

Dois cuidados:

- se reescrever o texto de um bloco de aviso do README, atualize a tabela `SHOWCASE` em
  `scripts/releaseCheck.mjs` com o novo texto; do contrário o release recusa publicar um README
  correto, por desenho (falso positivo).
- um Ctrl+C no meio do release pode deixar os CHANGELOGs com o título renomeado em disco; desfaça com
  `git checkout CHANGELOG.md CHANGELOG_EN.md`.

## Testes e2e

Os testes e2e sobem um contêiner Docker com Ubuntu 24.04 limpo para ver o Diagnóstico do ambiente e
instalar cada item como numa máquina nova. Precisam de Docker sem `sudo`; os logins são seus, feitos
por você.

### Cursor

`npm run e2e:cursor` abre o Cursor dentro do contêiner: sem Node, git, gh, uv, Code Review Graph nem
a CLI do Cursor. É o mesmo Cursor do computador, montado só para leitura e sem nenhuma configuração
sua (no macOS, um Cursor baixado para a imagem), e já vem com a extensão empacotada da branch atual,
no projeto de teste `meu-app`. Os links (login, **Saiba mais**) abrem no navegador do computador.
Dentro dele, o usuário `dev` tem `sudo` sem senha.

| Comando                           | O que faz                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| `npm run e2e:cursor`              | do zero: contêiner novo, com a extensão da branch atual                   |
| `npm run e2e:cursor -- continuar` | o mesmo contêiner (logins e instalações ficam), com a extensão atualizada |
| `npm run e2e:cursor -- parar`     | fecha o Cursor e para o contêiner                                         |
| `npm run e2e:cursor -- remover`   | apaga o contêiner, a imagem e o cache (`~/.cache/faz-ai-e2e`)             |

Há dois modos, escolhidos sozinhos:

- **Linux com sessão Wayland e o Cursor em `/usr/share/cursor`** (pacote `.deb`): o contêiner usa o
  Cursor do computador, e a janela abre na sua tela.
- **macOS, ou Linux sem Wayland:** a imagem baixa o Cursor para Linux do site oficial (na arquitetura
  do computador, ARM64 num Mac Apple Silicon), e a tela dele abre numa aba do navegador, em
  `http://localhost:6080`, pelo noVNC. A primeira subida baixa o Cursor e demora alguns minutos. A
  máquina tem o `python3` que o noVNC usa, como um Ubuntu desktop recém-instalado.
  `FAZAI_E2E_MODO=novnc` força este modo num Linux com Wayland.

Os arquivos ficam em `scripts/e2e-cursor/`.

### Kimi Code

`npm run e2e:kimi` sobe o contêiner (sem git, gh, uv, Code Review Graph nem a CLI `kimi`; só o Node
que roda o board e o `socat`) e abre nele o board do Faz AI da branch atual, pelo `src/cli` (não há
editor no contêiner), no projeto de teste `meu-app`. A CLI do Kimi Code não vem na imagem: você a
instala dentro do contêiner e faz o `kimi login`, seguindo o [roteiro](scripts/e2e-kimi/ROTEIRO.md).
Os links (login) abrem no navegador do computador. Dentro dele, o usuário `dev` tem `sudo` sem
senha. O resultado do roteiro fica em `docs/decisoes/`.

| Comando                         | O que faz                                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| `npm run e2e:kimi`              | do zero: contêiner novo, com o board da branch atual                  |
| `npm run e2e:kimi -- continuar` | o mesmo contêiner (login e instalações ficam), com o board atualizado |
| `npm run e2e:kimi -- parar`     | para o contêiner                                                      |
| `npm run e2e:kimi -- remover`   | apaga o contêiner e a imagem                                          |

O board abre em `http://localhost:7878` (`FAZAI_E2E_PORTA` troca a porta, publicada só em
`127.0.0.1`). Precisa de uma conta Kimi Code para o login.

## Preparar o ambiente

O repositório tem todo o código, mas alguns itens ficam fora do git. Num clone novo (outra máquina,
por exemplo), eles precisam ser refeitos:

| Item                                        | Para que serve                                         | Como obter                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Node.js 22+ e git                           | build, testes e o comando `faz-ai`                     | instalação normal                                                                                              |
| `.mcp.json` e `.claude/settings.local.json` | ligam a IA ao board; guardam caminhos da máquina       | o board não os cria mais (só o `.cursor/mcp.json` do Cursor); um registro antigo só some se você o tirar à mão |
| Board e anexos                              | ficam no armazenamento da extensão, não no repositório | o board da pasta começa vazio na outra máquina                                                                 |
| `.env.release` com `OVSX_PAT`               | publicar no Open VSX                                   | token em https://open-vsx.org/user-settings/tokens                                                             |
| Login da Azure CLI                          | publicar no VS Code Marketplace                        | `az login --allow-no-subscriptions`, com a conta dona do publisher                                             |
| `gh` autenticado                            | criar a GitHub Release                                 | `gh auth login`                                                                                                |
| `.claude/skills/publicar-extensao/`         | passo a passo da publicação para a IA                  | copiar a pasta da máquina original                                                                             |

Os quatro últimos só são necessários para publicar.
