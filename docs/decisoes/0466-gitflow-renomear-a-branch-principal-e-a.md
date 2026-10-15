# #466: gitflow, renomear a principal e a develop refletindo no origin

## Contexto

Com a #462 os nomes da principal e da `develop` passam a ser configuráveis. Mudar o nome só no board deixava o repositório como estava: o board procurava uma branch que não existia. Esta história (parte 1 de 2; a parte 2 é a #498) faz a mudança valer também no `origin`, no fluxo do editor.

## Decisão

- **Gatilho**: o nome configurado muda, o novo não existe (nem local nem no `origin`) e o antigo existe. Nome que já existe só passa a ser usado.
- **Confirmação antes de qualquer comando**: Renomear ou Desfazer. Nada é executado no repositório antes de Renomear; Desfazer só regrava o nome anterior pelo caminho normal de `settings.board.update`.
- **Ordem**: remoto (GitHub, `gh api -X POST repos/{owner}/{repo}/branches/<antiga>/rename -f new_name=<nova>`), `git fetch --prune`, `git branch -m`, `git branch -u`, e `git remote set-head origin` só na principal. O remoto vem primeiro para a falha dele não deixar o local alterado. Cada passo confere o estado antes de agir: repetir depois de uma falha só faz o que faltou.
- **`{owner}/{repo}`** por `gh repo view --json nameWithOwner`. Qualquer erro nessa descoberta (sem `gh`, sem login, remoto que não é GitHub) cai no caminho manual: nada é executado e o aviso traz os comandos, também os dos outros clones.
- **Campo da principal**: a #462 só detectava a principal. Esta história cria `GitConfig.mainBranch` e `fazai.git.mainBranch` (vazio = detectada); sem isso não existe "mudança de nome" para reagir. `BoardContext.mainBranch()` passa a respeitar o campo (origem `config`).
- **Pedido e resultado em `meta`** (`branch_rename_pending`, `branch_rename_result`), sem migração de banco, expostos no snapshot como `branchRenames` e `branchRenameResult`. O pedido sobrevive ao editor fechado (RF9).
- **Recusa com a IA executando**: a mudança de nome (que exigiria renomear) é recusada antes de gravar, com os números das histórias; a confirmação confere de novo.
- **Fora do MCP**: nenhuma ferramenta nova; instruções, skill e `get_card` não mudam.
- **`gh` síncrono injetável** (`RouterOptions.gh`): os handlers do painel são síncronos, como o `git.ts`; o teste injeta um `gh` falso que age num repositório `--bare`.

## Alternativas descartadas

- **"Apenas trocar o texto"** como terceira opção: reabre o problema do board apontando para uma branch inexistente.
- **Renomear o local antes do remoto**: uma falha do `gh` deixaria o clone alterado e o `origin` não.
- **Estado do pedido em tabela nova**: exigiria migração e `BOARD_TEMPLATE_VERSION`; o `meta` já existe e basta.
- **Engine assíncrona com `gh` do host**: o handler precisaria devolver depois, e o resultado chegaria por outra mensagem; o custo é maior que um `execFileSync` com limite de tempo no clique da pessoa.

## Não validado

- O comportamento do endpoint "Rename a branch" do GitHub (PRs abertos redirecionados, branch padrão mantida, regras de proteção com nome exato) foi conferido na documentação, não numa conta real.
- A renomeação no GitHub de uma branch protegida depende da permissão da conta; o erro do `gh` é mostrado como veio.

## Consequências

- Workflows de CI, regras de proteção e outros clones não são alterados; o aviso diz isso e lista os comandos dos clones.
- O diálogo no navegador, os campos na tela Git e o item no Diagnóstico do ambiente ficam para a #498.
