---
name: registrar-mudanca-changelog-readme
description: Registra uma mudança visível da história nos dois CHANGELOGs (seção da próxima versão, nos títulos do Keep a Changelog) e na seção certa do README, em português e inglês, no formato que npm run release confere. Use ao fechar a Implementação ou a Revisão de qualquer história com efeito para a pessoa.
---

# Registrar a mudança no CHANGELOG e no README

Toda mudança visível entra em quatro arquivos: `CHANGELOG.md`, `CHANGELOG_EN.md`, `README.md` e
`README_EN.md` (e `docs/mcp.md` quando muda o MCP). O `npm run release -- <versão do topo>` confere o `.vsix`
com esses arquivos e exige que a primeira seção do changelog seja a versão do `package.json`.

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

## Arquivos

- `CHANGELOG.md` e `CHANGELOG_EN.md`: a seção do topo é a próxima versão, a mesma do `package.json`.
- `README.md` e `README_EN.md`: a seção do assunto ("Como usar", "Usando com IA", "Harness de IA",
  "Configurações", "Onde ficam os dados", "Desenvolvimento").
- `docs/mcp.md`: ferramentas, status e notas do MCP.
- `scripts/releaseCheck.mjs`: o que a release exige dos arquivos.

## Passo a passo

1. Leia a primeira seção dos dois CHANGELOGs. Se ela for a versão já publicada (a última tag), a sua
   entrega é a primeira da versão seguinte: suba a versão no `package.json` e no `package-lock.json`
   (`npm version <nova> --no-git-tag-version`) e crie `## <nova>` acima dela nos dois arquivos.
2. Escreva o item no título certo (Adicionado, Alterado, Removido ou Corrigido), criando o título se
   a versão ainda não o tem, na ordem padrão. Mantenha o mesmo item em inglês no `CHANGELOG_EN.md`,
   na mesma posição.
3. No README, ache a seção que descreve a funcionalidade e atualize o texto; não acrescente seção nova
   quando uma existente já trata do assunto. Repita em inglês no `README_EN.md`, parágrafo por
   parágrafo.
4. MCP mudou (ferramenta, parâmetro, nota do `get_card`, status): atualize `docs/mcp.md` também.
5. Rode `npm run format:check` (a formatação dos `.md` é conferida pelo `npm test`); se acusar,
   `npm run format`.
6. Registre na conversa do card que a documentação foi atualizada, com os arquivos tocados.

## O que esta skill nunca faz

- Não cria seção "Não lançado": a seção do topo é sempre uma versão.
- Não apaga nem reescreve itens de versões já publicadas.
- Não documenta em um idioma só, nem deixa o README e o CHANGELOG dizendo coisas diferentes.
- Não descreve a implementação (arquivo, função): o item diz o que mudou para quem usa o board.
