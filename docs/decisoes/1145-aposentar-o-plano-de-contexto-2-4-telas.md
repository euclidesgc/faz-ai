# 1145 — Aposentar o Plano de contexto (2/4): telas, mensagens e ferramenta MCP

## Contexto
Parte 2 de 4 de #1144. O Plano de contexto e o runtime v1 saem do produto. Esta parte tira o que o usuário e a IA veem: telas, mensagens `contextPlanning.*`, a ferramenta MCP `preview_context_draft` e as traduções.

## Decisão
- Remover toda a superfície visível numa só fatia. A maior parte já saiu no commit da parte 3/4 (#1146), base desta branch.
- Esta branch limpa os resíduos: texto "Modo legado…" de `ExecutionContext.tsx` e a tradução em `metrics.ts`, `contextPlanning.propose` de `test/ui/setup.tsx`, 7 chaves órfãs em `harness.ts` e um comentário em `boardStore.ts`.
- `CONTEXT_ACTIONS` e as políticas ficam. Documentação e CHANGELOG ficam para as partes 3 e 4.

## Alternativas descartadas
- Remover também o código do host/runtime v1 sem uso: pertence às partes 3 e 4; misturar aumentaria o diff.
- Limpar `docs/` agora: fora do escopo desta parte.

## Consequências
- Nenhuma tela, mensagem ou ferramenta MCP do plano existe (`rg "contextPlanning\.|preview_context_draft" src test` vazio).
- Referências ao plano permanecem só em `docs/` até as partes seguintes.

## Diagramas
```mermaid
flowchart LR
  P1[1/4 mapa] --> P2[2/4 telas, mensagens, MCP] --> P3[3/4 runtime v1] --> P4[4/4 banco]
```
