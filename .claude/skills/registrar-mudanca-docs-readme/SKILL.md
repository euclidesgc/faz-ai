---
name: registrar-mudanca-docs-readme
description: Registra uma mudança visível da história no arquivo certo de docs/ e, só quando cria ou remove um recurso, no README, em português e inglês, no formato que npm run release confere. Use ao fechar a Implementação ou a Revisão de qualquer história com efeito para a pessoa.
---

# Registrar a mudança em docs/ e no README

O projeto não mantém changelog: o que mudou fica no pull request da história e, para quem usa, na
documentação. Ela tem dois níveis, sempre em português e inglês (sufixo `_EN`):

- `README.md` / `README_EN.md`: a página da extensão na loja (padrão de README de extensão do VS Code,
  até 1500 palavras). Seções: apresentação, Primeiros passos, Recursos, Requisitos, Configurações,
  Onde ficam os dados, Problemas conhecidos, Licença.
- `docs/*.md`: o manual, com o detalhe de cada comportamento.

O `npm run release -- <versão>` confere o `.vsix` com `README.md` e `README_EN.md`: cada um precisa
ter os blocos de aviso de fase alpha e de agradecimento (tabela `SHOWCASE` em
`scripts/releaseCheck.mjs`).

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

1. Se a sua entrega é a primeira da versão seguinte (a versão do `package.json` é a última tag
   publicada), suba a versão no `package.json` e no `package-lock.json`
   (`npm version <nova> --no-git-tag-version`).
2. Atualize o arquivo de `docs/` do assunto (tabela acima), em português e no `_EN`, parágrafo por
   parágrafo. É aqui que entram regras, telas, parâmetros e casos de borda.
3. Mexa no README só se a mudança cria ou remove um recurso (bullet em **Recursos**, 1 a 2 frases,
   terminando com o link para o doc), um requisito, uma configuração ou um problema conhecido.
   Nunca descreva no README uma regra de borda, uma tela inteira ou a implementação. Repita no
   `README_EN.md`.
4. MCP mudou (ferramenta, parâmetro, nota do `get_card`, status): atualize `docs/mcp.md` também.
5. Rode `npm run format:check` (a formatação dos `.md` é conferida pelo `npm run validate`); se acusar,
   `npm run format`.
6. Registre na conversa do card que a documentação foi atualizada, com os arquivos tocados.

## O que esta skill nunca faz

- Não cria `CHANGELOG.md` nem seção de histórico de versões no README: o projeto não mantém
  changelog, e o que mudou fica no pull request.
- Não muda o texto dos blocos de aviso alpha e de agradecimento do README sem atualizar a tabela
  `SHOWCASE` em `scripts/releaseCheck.mjs`.
- Não usa imagem fora de `docs/images/` nem SVG do repositório (o `vsce` reescreve o caminho para
  URL absoluta).
- Não documenta em um idioma só, nem deixa o README e o doc dizendo coisas diferentes.
- Não descreve a implementação (arquivo, função): o texto diz o que mudou para quem usa o board.
