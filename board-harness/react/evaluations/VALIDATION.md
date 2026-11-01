# Verificações executadas — 17/10/2026

## Estrutura e compatibilidade com o board

- 32 pastas de skills; frontmatter com `name` e `description`, sem metadados obrigatórios específicos de fornecedor.
- 96 referências de modo, todas com links relativos resolvidos dentro da própria skill.
- Catálogo, modelo de contrato inativo e casos de avaliação separados das instruções carregadas.
- Fontes Bulletproof referenciadas existem no checkout do commit `9506629ed003a561c6627735480cce4994244bb4`; complementações estão identificadas.
- O `quick_validate.py` da skill `skill-creator` foi executado nas 32 skills com PyYAML em ambiente temporário, sem dependência adicionada ao projeto.
- O verificador local de estrutura/links/cobertura foi executado; as verificações de descoberta e sugestões usam o código real do Faz AI em leitura, sem instalação ou mudança no Harness.

## Sugestões por assunto

Resultado nos 32 pedidos de projeto definidos em `cases.json`: skill esperada em primeiro em **15/32**, entre as três primeiras em **28/32** e entre as oito sugestões em **32/32**. Metadados foram refinados para explicitar histórico/voltar/avançar e abertura/fechamento, responsabilidades já previstas. Este conjunto de autoria não equivale a um benchmark independente.

O matcher é lexical: palavras de API, estado ou navegador podem colocar outra especialidade acima da responsável pela entrega. Consulte o mapa de responsabilidades e atribua explicitamente a skill e o modo no card. Não tratar sugestão em primeiro lugar como decisão arquitetural.

[selection-results.json](selection-results.json) registra ranking dos casos positivos/próximos e hashes das entradas para reprodução. Os casos próximos verificam sugestões de temas vizinhos; não comprovam que um agente deixou de carregar uma skill irrelevante.

## O que permanece para avaliação de uso

Os 160 casos de capacidade/não ativação/manutenção estão definidos e **não executados por agentes**. Os cenários integrados em aplicação nova e existente também precisam de execução conforme [PROTOCOL.md](PROTOCOL.md).

Não foram medidos tokens, economia, qualidade de implementações produzidas ou descoberta automática em instalações reais do Codex/Claude. Esta entrega cria a biblioteca e verifica sua estrutura e compatibilidade de descoberta com o board, sem anunciar aprovação comportamental dessas avaliações futuras.
