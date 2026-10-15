# #554 Versionar .claude/skills: as skills do projeto estão fora do git

## Contexto
As 5 skills do projeto em `.claude/skills/` (migracao-do-banco, mudar-board-padrao,
nova-ferramenta-mcp, registrar-mudanca-changelog-readme, texto-de-interface-i18n) existiam só na pasta
principal, sem versionamento. `.claude/agents/` já está no git, e o CLAUDE.md e os agentes dependem
delas. Um clone novo ou uma worktree não as tinha, e `npm run release` recusava rodar com a árvore suja.

## Decisão
Versionar `.claude/skills/` na develop: são produto do projeto. `.claude/skills/publicar-extensao/`
continua ignorada pelo `.gitignore` (skill privada de publicação). Nenhum arquivo traz dado pessoal.

```mermaid
flowchart LR
  A[Pasta principal: skills não rastreadas] --> B[Copiar para a worktree]
  B --> C[git add + commit]
  C --> D[PR para develop]
  D --> E[Clone novo e worktrees recebem as skills]
  F[publicar-extensao] -. ignorada pelo .gitignore .-> C
```

## Alternativas descartadas
- **Ignorar `.claude/skills/` e documentar a origem:** clone novo e worktree continuariam sem as skills
  que os agentes versionados citam, e seria preciso documentar de onde copiá-las.
- **Mover para `~/.claude/skills` (escopo usuário):** não viaja com o repositório.
- **Gerar a partir de `src/extension/flowSkill.ts`:** as 5 são específicas do projeto, não a skill do
  fluxo do produto; gerá-las custaria código sem ganho.

## Consequências
- Clone novo e worktrees têm as skills; a árvore da develop fica limpa para `npm run release`.
- As cópias não rastreadas da pasta principal precisam sair antes do merge, para o `git` não recusá-lo.
- Skill privada nova entra no `.gitignore` explicitamente, como a `publicar-extensao`.
