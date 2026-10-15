---
name: registrar-mudanca-changelog-readme
description: Registra uma mudança visível da história nos dois CHANGELOGs (seção "Não lançado"/"Unreleased") e na seção certa do README, em português e inglês, no formato que npm run release confere. Use ao fechar a Implementação ou a Revisão de qualquer história com efeito para a pessoa.
---

# Registrar a mudança no CHANGELOG e no README

Toda mudança visível entra em quatro arquivos: `CHANGELOG.md`, `CHANGELOG_EN.md`, `README.md` e
`README_EN.md` (e `docs/mcp.md` quando muda o MCP). O `npm run release` confere o `.vsix` com esses
arquivos e transforma a seção "Não lançado" na versão; sem ela, a release recusa.

## Arquivos

- `CHANGELOG.md`: cabeçalho `## Não lançado` logo abaixo da introdução (o nome exato está em
  `scripts/releaseCheck.mjs`, `unreleased`). `CHANGELOG_EN.md`: `## Unreleased`.
- `README.md` e `README_EN.md`: a seção do assunto ("Como usar", "Usando com IA", "Harness de IA",
  "Configurações", "Onde ficam os dados", "Desenvolvimento").
- `docs/mcp.md`: ferramentas, status e notas do MCP.
- `scripts/releaseCheck.mjs`: o que a release exige dos arquivos.

## Passo a passo

1. Leia o cabeçalho da seção não lançada nos dois CHANGELOGs. Se não existir, crie `## Não lançado` /
   `## Unreleased` acima da última versão. Se existir com outro nome (ex.: "Não publicado"),
   renomeie para o que `releaseCheck.mjs` espera, e só ele.
2. Escreva um item por mudança, começando com o título em negrito e o número da história entre
   parênteses: `- **Aprovar chama a IA na hora (#475).** ...`. Diga o que a pessoa vê de diferente,
   em frases diretas; correção começa com `**Correção:**`; comportamento que deixou de existir ganha
   `**Mudança de comportamento:**` no fim do item. Mantenha o mesmo item em inglês no `CHANGELOG_EN.md`.
3. No README, ache a seção que descreve a funcionalidade e atualize o texto; não acrescente seção nova
   quando uma existente já trata do assunto. Repita em inglês no `README_EN.md`, parágrafo por
   parágrafo.
4. MCP mudou (ferramenta, parâmetro, nota do `get_card`, status): atualize `docs/mcp.md` também.
5. Rode `npm run format:check` (a formatação dos `.md` é conferida pelo `npm test`); se acusar,
   `npm run format`.
6. Registre na conversa do card que a documentação foi atualizada, com os arquivos tocados.

## O que esta skill nunca faz

- Não cria a versão nem mexe em `package.json`: é o `npm run release` que fecha a seção.
- Não apaga nem reescreve itens de versões já publicadas.
- Não documenta em um idioma só, nem deixa o README e o CHANGELOG dizendo coisas diferentes.
- Não descreve a implementação (arquivo, função): o item diz o que mudou para quem usa o board.
