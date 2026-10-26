---
name: registrar-mudanca-changelog-readme
description: Registra uma mudança visível da história nos dois CHANGELOGs (seção da próxima versão, nos títulos do Keep a Changelog), no arquivo certo de docs/ e, só quando cria ou remove um recurso, no README, em português e inglês, no formato que npm run release confere. Use ao fechar a Implementação ou a Revisão de qualquer história com efeito para a pessoa.
---

# Registrar a mudança no CHANGELOG, em docs/ e no README

A documentação tem dois níveis, sempre em português e inglês (sufixo `_EN`):

- `README.md` / `README_EN.md`: a página da extensão na loja (padrão de README de extensão do VS Code,
  até 1500 palavras). Seções: apresentação, Primeiros passos, Recursos, Requisitos, Configurações,
  Onde ficam os dados, Problemas conhecidos, Histórico de versões, Licença.
- `docs/*.md`: o manual, com o detalhe de cada comportamento.

O `npm run release -- <versão do topo>` confere o `.vsix` com `README.md`, `README_EN.md`,
`CHANGELOG.md` e `CHANGELOG_EN.md`, e exige que a primeira seção do changelog seja a versão do
`package.json`.

## Formato do changelog (Keep a Changelog)

Uma seção por versão, da mais recente para a mais antiga, com os títulos padrão nesta ordem,
omitidos os vazios: `### Adicionado` (capacidade nova), `### Alterado` (comportamento existente que
mudou), `### Removido` (o que deixou de existir) e `### Corrigido` (defeito consertado). Um item por
mudança, começando com o título em negrito e o número da história entre parênteses, seguido do que
a pessoa vê de diferente:

```
## 0.48.0

### Adicionado

- **Aprovar chama a IA na hora (#475).** O card aprovado entra na fila sem esperar o heartbeat.

### Corrigido

- **Aviso "Como usar o Harness" não volta (#283).** A escolha "Entendi, não mostrar de novo" fica guardada no host.
```

Em inglês: `### Added`, `### Changed`, `### Removed` e `### Fixed`. Comportamento que deixou de
existir ganha `**Mudança de comportamento:**` no fim do item, em "Alterado" ou "Removido".

## Onde vai o detalhe (docs/)

| Assunto | Arquivo |
| --- | --- |
| Fases, aprovação, trilha curta, perguntas com opções, Trabalhar na fase, Refinar, Resumir, vínculos e dependências, card aberto, arquivados e lixeira | `docs/fluxo.md` |
| Biblioteca do board, modos Sempre/Pelo card/Desligado, importar e exportar, agentes, perfis de CLI, instalação do MCP, Diagnóstico do ambiente | `docs/harness.md` |
| Heartbeat e modo autônomo (YOLO) | `docs/automacao.md` |
| Branch e worktree, PR e merge, histórias derivadas, detecção de merges, registros de decisão | `docs/gitflow.md` |
| Contexto estimado, aba Consumo, inventário, painel Métricas, `get_metrics` | `docs/metricas.md` |
| Telas de Configurações, seção por seção | `docs/configuracoes.md` |
| Onde ficam os dados, backup, board no navegador, comando `faz-ai` | `docs/dados.md` |
| Ferramentas, status e notas do MCP | `docs/mcp.md` |

## Passo a passo

1. Leia a primeira seção dos dois CHANGELOGs. Se ela for a versão já publicada (a última tag), a sua
   entrega é a primeira da versão seguinte: suba a versão no `package.json` e no `package-lock.json`
   (`npm version <nova> --no-git-tag-version`) e crie `## <nova>` acima dela nos dois arquivos.
2. Escreva o item no título certo (Adicionado, Alterado, Removido ou Corrigido), criando o título se
   a versão ainda não o tem, na ordem padrão. Mantenha o mesmo item em inglês no `CHANGELOG_EN.md`,
   na mesma posição.
3. Atualize o arquivo de `docs/` do assunto (tabela acima), em português e no `_EN`, parágrafo por
   parágrafo. É aqui que entram regras, telas, parâmetros e casos de borda.
4. Mexa no README só se a mudança cria ou remove um recurso (bullet em **Recursos**, 1 a 2 frases,
   terminando com o link para o doc), um requisito, uma configuração ou um problema conhecido.
   Nunca descreva no README uma regra de borda, uma tela inteira ou a implementação. Repita no
   `README_EN.md`.
5. MCP mudou (ferramenta, parâmetro, nota do `get_card`, status): atualize `docs/mcp.md` também.
6. Rode `npm run format:check` (a formatação dos `.md` é conferida pelo `npm run validate`); se acusar,
   `npm run format`.
7. Registre na conversa do card que a documentação foi atualizada, com os arquivos tocados.

## O que esta skill nunca faz

- Não cria seção "Não lançado": a seção do topo é sempre uma versão.
- Não apaga nem reescreve itens de versões já publicadas.
- Não muda o texto dos blocos de aviso alpha e de agradecimento do README sem atualizar a tabela
  `SHOWCASE` em `scripts/releaseCheck.mjs`.
- Não usa imagem fora de `docs/images/` nem SVG do repositório (o `vsce` reescreve o caminho para
  URL absoluta).
- Não documenta em um idioma só, nem deixa o README, o doc e o CHANGELOG dizendo coisas diferentes.
- Não descreve a implementação (arquivo, função): o item diz o que mudou para quem usa o board.
