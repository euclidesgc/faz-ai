🇧🇷 Português · [🇺🇸 English](gitflow_EN.md)

# Branch, pull request e gitflow

Como o Faz AI Kanban cria a branch e a pasta de trabalho de cada história, abre e mescla o pull
request, limpa o que sobra ao concluir e observa os merges no GitHub.

## Branch e pasta de trabalho por história

Cada história trabalha numa branch própria, criada pelo board (ex.: `feature/12-login-com-google`).
Por padrão ela vem com uma worktree: uma pasta de trabalho separada, ao lado do projeto, onde a IA
altera o código sem tocar na sua pasta nem nas suas alterações em andamento. As sub-tarefas fazem
commits na branch da história.

- A branch é criada quando a IA começa a implementação (ela chama `prepare_workspace`) ou pelo
  botão **Criar branch da história** no card.
- O card mostra a branch e abre a pasta de trabalho numa janela nova.
- Abaixo da branch, a seção **Commits por fase** lista os commits da história (até 200) agrupados pela fase, com hash, assunto, data, card e run, lidos dos trailers `Faz-AI-Card`, `Faz-AI-Phase` e `Faz-AI-Run`. Commits sem fase ficam em **Sem fase**, por último. A lista é lida ao abrir o card e quando a branch muda, sem atualização periódica, e a seção some se não houver commits.
- O modo (worktree, branch na própria pasta ou desligado), o padrão do nome da branch, a pasta das
  worktrees e o merge automático do PR ao aprovar a homologação ficam em **Configurações → Git**, e
  **tocar histórias em paralelo** em **Configurações → Automação**, no
  editor e no navegador.
- Cada worktree é uma cópia de trabalho: as dependências precisam ser instaladas nela.

### Histórias derivadas e PRs empilhados

O Plan estima as linhas de código da entrega: acima de umas 400, a IA deixa na história a primeira
parte e cria as seguintes como **histórias derivadas**, em ordem (`create_card` com `derived_from`
apontando para a parte anterior). A branch de cada derivada parte da branch da parte anterior e o
pull request dela é empilhado sobre o dela; o card mostra **Derivada de #N**. Se a parte anterior
ainda não tem branch, a derivada espera por ela antes de criar a sua.

## Gitflow

As branches seguem o gitflow, ligado por padrão (**Configurações → Git › Usar o gitflow**). O tipo do
card define o tipo da branch, e cada tipo sai de um lugar e volta para outro:

| Branch                          | Gerada por                          | Parte de    | O PR vai para |
| ------------------------------- | ----------------------------------- | ----------- | ------------- |
| principal (`main`, `master`...) | —                                   | —           | —             |
| `develop`                       | —                                   | a principal | —             |
| `feature/`                      | História e Débito técnico           | `develop`   | `develop`     |
| `bugfix/`                       | Retrabalho e Bug                    | `develop`   | `develop`     |
| `hotfix/`                       | Hotfix                              | a principal | a principal   |
| `release/`                      | nenhum tipo de card (só o prefixo)  | `develop`   | a principal   |

- A **branch principal é detectada sozinha**, sem rede: o HEAD do `origin`; senão `main` ou `master`;
  senão a branch atual. A seção do gitflow na aba Git mostra qual foi e por quê.
- Se a `develop` não existe, o board a cria a partir da principal e a envia ao `origin`; se não
  conseguir enviar, avisa na conversa da história com o comando para fazer à mão. Ele não a cria
  quando o `git fetch` falhou (ela pode já existir no `origin`) nem quando a principal saiu da branch
  atual: recusa e diz o que fazer (verificar a rede, ou rodar `git remote set-head origin -a`).
- Antes de criar a branch, o board roda `git fetch origin` (até 20 s, sem pedir senha) e parte de
  `origin/<base>`, sem upstream (`--no-track`). Sem `origin` ou com o fetch falhando, parte das refs
  locais e avisa na conversa.
- Uma branch apagada é recriada da base gravada; se essa base também sumiu (a história anterior da
  pilha já foi mesclada), volta da base do fluxo e a conversa avisa que o PR muda de destino.
- A IA lê a base do PR em `workspace.prBase` do `get_card` e abre o pull request com `--base`. Em
  histórias empilhadas (modo autônomo ou derivadas), a base é a branch da história anterior.
- Um defeito numa funcionalidade que ainda só está na `develop` é **Retrabalho**, não Bug. O tipo de
  branch de cada tipo de card se escolhe na aba Git.
- O nome da branch usa `{fluxo}` (o prefixo do tipo: `feature/`, `bugfix/`, `hotfix/`). O padrão
  antigo `{tipo}/{numero}-{titulo}` é convertido para `{fluxo}{numero}-{titulo}` ao ler a configuração.

### Opções em Configurações → Git

Disponíveis no editor e no navegador:

| Campo                    | Padrão     | O que faz                                                                   |
| ------------------------ | ---------- | --------------------------------------------------------------------------- |
| **Usar o gitflow**       | ligado     | Desligado, toda branch parte da principal e `{fluxo}` vira `<tipo>/`.       |
| **Branch principal**     | vazio      | Branch principal fixa; vazio detecta (HEAD do `origin`, `main` ou `master`). |
| **Branch de integração** | `develop`  | Branch de integração.                                                       |
| **Prefixo de feature**   | `feature/` | Prefixo das branches de feature.                                            |
| **Prefixo de bugfix**    | `bugfix/`  | Prefixo das branches de bugfix.                                             |
| **Prefixo de hotfix**    | `hotfix/`  | Prefixo das branches de hotfix.                                             |
| **Prefixo de release**   | `release/` | Só informativo: nenhum tipo de card gera release.                           |

Prefixo ou nome vazio, ou que o git não aceita, volta ao padrão. Branches e worktrees que sobram
depois da história são tratadas em [Branches e worktrees órfãs](#branches-e-worktrees-órfãs).

### Renomear a principal ou a `develop` no `origin`

Mudar **Branch principal** ou **Branch de integração** para um nome que ainda não existe, com a
branch antiga existindo, abre um aviso no editor (a mudança também vale no `origin`, e o board não a
faz sozinho). As opções são **Renomear** e **Desfazer**; fechar a caixa mantém o pedido e a pergunta
volta ao reabrir o board.

- **Renomear** age nesta ordem: a branch no GitHub pelo `gh` (`gh api .../branches/<antiga>/rename`);
  `git fetch --prune`; `git branch -m` no clone (inclusive a que está numa worktree); o upstream
  (`origin/<nova>`); e, só na principal, o `origin/HEAD`. O GitHub redireciona os PRs abertos e leva a
  branch padrão para o nome novo (conforme a documentação da API, não testado com conta real).
- **Sem `gh`, fora do GitHub ou sem permissão**: nada é executado. O aviso mostra os comandos prontos
  para este clone e para os outros, com **Copiar comandos**.
- **Falha no meio**: a mensagem diz o que já mudou e o que falta. Cada passo confere o estado antes de
  agir, então repetir é seguro. O remoto vem primeiro: se ele falha, nada local muda.
- **Desfazer** devolve o nome anterior à configuração e não toca o repositório.
- **Recusado** enquanto a IA executa uma história (a mensagem traz os números).
- **Não muda**: workflows de CI, regras de proteção, a branch padrão do GitHub (na `develop`) e os
  outros clones. A IA não renomeia branches: não há ferramenta nova no MCP.

No navegador (fora do editor) a pergunta é um diálogo do board, em qualquer tela: **Renomear** (foco
inicial), **Desfazer** e **Fechar** (ou Esc, que não envia nada e não volta na sessão). Depois de
Renomear, o diálogo mostra os passos feitos, o que falta, o erro e os comandos prontos, cada um com
**Copiar comando**; na falha parcial há **Renomear de novo**. Em **Configurações → Git** ficam os
campos **Branch principal** (vazio = detectada) e **Branch de integração**, que gravam ao sair do
campo, com a explicação do que a renomeação faz e do que não altera. No **Diagnóstico do ambiente**,
o item **Nome da branch principal/develop** (recomendação, não bloqueia) fica pendente enquanto houver
pedido à espera, com o comando do clone local e o botão **Abrir a tela Git**.

## Pull request e merge na Homologação

Na Homologação a IA escreve o roteiro **"Como testar"** (o que foi construído, os passos para
verificar com o resultado esperado e o que ficou de fora) na descrição da história, envia a branch,
abre o pull request com o mesmo roteiro no corpo, registra o endereço no card e pede a sua revisão.
O card mostra o link do PR.

O merge automático é opcional e começa desligado (**Configurações → Git › Pull request e merge**).
Com ele ligado, quando você aprova uma história que está na última coluna antes da conclusão:

1. o board faz o merge do PR pelo GitHub CLI (`gh`), no tipo configurado (squash, merge ou rebase);
2. só com o merge feito o card vai para Concluído, e a pasta de trabalho da história é removida;
3. se o merge falhar (conflito, checks obrigatórios, sem acesso), o card fica Bloqueado com o erro
   e continua na Homologação.

O merge não acontece se a história não tiver PR registrado ou ainda tiver sub-tarefas em aberto. Com
o merge automático desligado, aprovar leva o card para Concluído na hora (ou o deixa Aprovado, com o
aviso na conversa, se uma sub-tarefa em aberto impedir a conclusão).

## Conclusão da história no gitflow

Com o gitflow ligado, quando uma história é concluída com o PR mesclado, o board não deixa nada dela
para trás. Isso vale para o merge feito pelo board e para o merge
[detectado](#detecção-automática-de-merges). Em ordem:

1. remove a worktree (pasta de trabalho) da história;
2. apaga a branch local, mesmo quando o merge foi squash (o PR já confirmou o merge);
3. apaga a branch remota (`origin/<branch>`). Se o GitHub já a apagou, não é erro nem aviso;
4. atualiza a `develop` local **só por fast-forward**, sem trocar a branch da pasta do projeto e
   sem mexer nos arquivos dela.

O board só apaga a branch registrada no card e só depois do merge confirmado. Quando a limpeza não é
segura, ele **não apaga o que está em risco**, conclui o card do mesmo jeito e conta o motivo num
comentário na conversa, com o comando para você fazer à mão:

- a worktree tem mudanças não commitadas: nada é apagado (nem worktree, nem as branches), e o aviso
  traz o caminho e os arquivos pendentes;
- a branch local tem commits que não estão no PR: nada é apagado;
- a branch remota recebeu commits depois do PR: ela fica;
- a pasta do projeto está na branch da história: a branch local fica (o board nunca troca a branch da
  sua pasta) e a remota é apagada;
- a `develop` local tem commits que não estão no `origin`, ou está aberta em alguma pasta: ela não é
  atualizada;
- qualquer falha do `git` ou do `gh` (sem permissão de push, sem rede, sem o `gh`) também vira aviso.

Nenhuma falha da limpeza impede a conclusão do card. Com o gitflow desligado ("direto na principal")
nada muda: a conclusão só remove a worktree. Não há opção para desligar a limpeza à parte do
gitflow. Branches e worktrees que já sobraram de antes são tratadas em
[Branches e worktrees órfãs](#branches-e-worktrees-órfãs).

### Pilha e hotfix

- **História empilhada.** Se outra história foi criada sobre a branch da que acabou de ser concluída,
  o board troca a base dela para a `develop` (e a base do PR dela também) **antes** de apagar a branch
  remota. Se a troca falhar, a remota fica e a conversa avisa.
- **Merge commit para a principal.** O PR que entra na branch principal (hotfix ou release) é mesclado
  com merge commit, seja qual for o tipo de merge configurado. O commit de merge das histórias fica
  assim na tag, e o arquivamento das histórias publicadas depende disso.
- **Todo trabalho parte da `develop`.** Inclusive o Bug, que até a versão 15 do board padrão gerava
  hotfix (o "Atualizar board" o passa para bugfix). Só o tipo **Hotfix** parte da principal, que é a
  versão publicada; o `get_card` de um hotfix pede à IA que suba a versão (patch) e registre a
  correção no changelog na própria branch.
- **Depois de um hotfix.** O board abre e mescla um PR `main → develop`, também com merge commit, para
  a `develop` receber a correção. Nunca há push direto. Se houver conflito, o PR fica aberto e a
  conversa do card avisa para você resolver.
- **Release a partir da principal.** Em seguida o board cria a tag e a GitHub Release sobre o commit
  do merge (`gh release create <tag> --target <commit> --generate-notes`). A versão é a do
  `package.json` da principal; sem `package.json`, a seguinte (patch) à última tag `vX.Y.Z`. Se a
  versão do `package.json` já tem tag (o hotfix não subiu a versão), ou se não há de onde tirar a
  versão, nada é criado e a conversa avisa. A publicação numa loja continua com o processo de
  release do projeto; neste repositório, `npm run release -- current --no-git`, rodado na principal atualizada, publica a versão que
  já tem tag e release.

### Branches e worktrees órfãs

Órfã é a branch ou a worktree que o board criou e cuja história já terminou (mesclada, concluída,
cancelada, arquivada ou na lixeira) ou nem existe mais no board. Nunca entram a branch principal, a
`develop`, as branches em uso fora da pasta das worktrees e as bases de histórias ainda ativas
(a pilha de PRs). O board mede o git na abertura e a cada rodada do heartbeat (depois de conferir os
merges) e dá um veredito a cada item:

- **Segura**: não há nada a perder (worktree sem arquivos alterados; branch sem commits só dela, ou
  já mesclada na base). O board a limpa sozinho: remove a worktree e apaga a branch **local** com
  `git branch -D`. A branch remota não é tocada por esta limpeza.
- **Precisa de decisão**: tem arquivos não commitados, commits que só existem nela, uma história que o
  board não conhece ou uma branch ainda em uso por uma worktree. Nada é apagado sozinho.

Em **Configurações → Git → Branches e worktrees órfãs** cada item mostra a história, a situação e o
veredito. **Limpar** remove um item; num item de decisão abre uma confirmação que diz quantos arquivos
e commits se perdem, e só depois de confirmar o board os remove (e confere de novo no disco, antes).
**Limpar todas as seguras** age sobre todas as seguras de uma vez; **Verificar de novo** refaz a
medição. Quando um item não pôde ser removido, a linha mostra "Não removido" com o motivo, e a
próxima rodada tenta de novo. Enquanto houver órfãs de decisão, o topo do board mostra o selo
**N órfãs**, que abre essa seção. Sem heartbeat ligado, o board mede só na abertura e no
**Verificar de novo**.

## Registros de decisão

Com **Configurações → Git › Registros de decisão** apontando para uma pasta do repositório, como
`docs/decisoes`, a Homologação grava ali, antes de abrir o pull request, o registro de decisão da
história: o contexto, a decisão, as alternativas descartadas (com o motivo de cada uma), as
consequências e os diagramas do desenho do programa, a partir da Spec aprovada. O arquivo se chama
`<número da história>-<título>.md`, vai num commit da branch da história e é citado no corpo do PR.
Assim a decisão fica no repositório, junto do código, e não só no banco do board. O `get_card` traz
o caminho em `phase.decisionRecord`. Vazio, o padrão, desliga.

## Detecção automática de merges

O board observa o pull request de cada história em aberto que tem um (em qualquer coluna, com ou sem
modo autônomo; só a bloqueada e a em execução ficam de fora) e detecta quando ele é mergeado,
concluindo a história automaticamente. Não há opção própria: a consulta acontece em cada rodada do
heartbeat, no mesmo intervalo, e também no **Rodar o heartbeat agora**. Com o heartbeat desligado,
ela só acontece quando você pede uma rodada. As consultas ao GitHub vão em paralelo, até quatro ao
mesmo tempo; a conclusão e a limpeza de cada história vão uma por vez, na ordem do board. Quando o
merge é detectado:

1. o board grava o commit do merge no card;
2. registra na conversa que a história foi concluída;
3. move o card para a coluna de conclusão à frente e remove a pasta de trabalho. Com o gitflow
   ligado, faz também o resto da [conclusão da história no gitflow](#conclusão-da-história-no-gitflow):
   apaga as branches e atualiza a `develop` local.

### PR fechado sem merge ou em conflito

Se o pull request é fechado sem merge, o board registra um aviso na conversa uma única vez.

Se está aberto com conflito, o board avisa na conversa uma vez por conflito (o aviso cita o commit do
PR) e, na mesma rodada, chama a IA numa execução só para resolvê-lo, à frente da fila: ela atualiza a
branch por merge a partir da base do PR (sem rebase nem push forçado), resolve os conflitos, roda as
checagens, envia a branch e registra na conversa o que fez. Vale para qualquer história, inclusive as
autônomas e as já entregues, menos a bloqueada e a que espera a sua resposta. A execução usa o modelo
e a permissão da fase, segue os tetos das atividades com branch, aparece no card como "resolvendo
conflito" e, no fim, o card volta ao status que tinha. Se a IA não conseguir, ela bloqueia o card com
o motivo; se terminar e o PR continuar em conflito no mesmo commit, o board bloqueia o card e a
resolução fica com você (desbloquear dá à IA mais uma tentativa).

O merge continua sendo feito pela pessoa, manualmente ou pelo merge automático; o board só observa.
Falhas na consulta do estado do PR (sem rede, sem autenticação, sem o `gh` instalado) não bloqueiam
nada: o aviso aparece no log, e o board tenta de novo na próxima rodada.

### Arquivamento das histórias publicadas

Na mesma rodada, depois de olhar os pull requests, o board dá o último passo do ciclo: **quando a
versão que contém uma história concluída é publicada, ele registra na conversa qual versão a levou
(tag e link da release) e arquiva o card**. Assim a coluna Concluído fica só com o que está mergeado
e ainda não chegou a quem usa; o que já foi entregue vai para a aba Arquivados, de onde você pode
restaurar a história (com as sub-tarefas arquivadas dela) a qualquer momento. Não há o que ligar: o
passo vem junto com a detecção de merges, na mesma rodada do heartbeat.

Uma história conta como publicada quando existe uma tag que **contém** o commit do merge **e** que
tem uma **release publicada** no GitHub (é o que o `npm run release` deste projeto cria). Tag sem
release não vale, release em rascunho não vale, pré-lançamento vale. A versão registrada é a mais
antiga entre as que contêm o commit, pela data de publicação. O critério é conservador de propósito:
arquivar tarde se corrige na rodada seguinte, arquivar cedo esconde um card sem ninguém notar.

Tudo aqui é melhor esforço. Projeto sem releases, fora do GitHub ou numa máquina sem o `gh`
simplesmente não arquiva nada: nenhum card é bloqueado e o motivo aparece uma vez no log. O board
nunca publica versão (ele só lê o que você publicou), e histórias concluídas antes dessa função, que
não têm o commit do merge guardado, continuam sendo arquivadas por você, com um clique.
