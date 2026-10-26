---
name: "texto-lido-pela-ia"
description: "Altera um texto que a IA lê ao trabalhar no board: a skill do fluxo e as skills por assunto (src/extension/flowSkill.ts), as instruções do servidor MCP, as notas do get_card (src/extension/mcp/format.ts) e os pedidos do chat de sugestões (src/extension/chat.ts), com o teste que guarda cada frase. Use quando muda o comportamento esperado da IA no ciclo do card sem criar ferramenta MCP nova nem mudar texto de fase."
---

# Texto que a IA lê

O que a IA lê é produto: muda junto com o comportamento e tem teste. Os textos ficam em lugares
diferentes, e cada um tem um papel:

| Texto | Onde | Papel |
|---|---|---|
| Skill do fluxo (`FLOW_SKILL`) e skills por assunto (`FLOW_SKILLS`) | `src/extension/flowSkill.ts` | o essencial do ciclo; o detalhe fica na skill do assunto |
| Instruções do servidor | `MCP_INSTRUCTIONS` em `src/extension/mcp/server.ts` | o mínimo que vale em toda sessão |
| Notas do `get_card` | `src/extension/mcp/format.ts` (`MODEL_NOTE`, `SUBTASKS_NOW_NOTE`...) | aparecem só quando o card precisa |
| Pedidos de sugestão | `src/extension/chat.ts` (`chatPrompt`, `suggest*Prompt`) | geração de rules, skills, agentes e artefatos |

## Quando usar

- A IA precisa fazer algo de outro jeito no ciclo do card (pendência, revisão, pilha de PRs, rodadas).
- Uma nota ou instrução ficou desatualizada em relação ao código.
- O pedido de sugestão de rules/skills/agentes precisa mudar.

Não use para criar ou mudar ferramenta MCP (`nova-ferramenta-mcp`, inclusive a descrição dela) nem
para texto de fase ou modelo de documento (`mudar-board-padrao`).

## Entradas

- O comportamento novo esperado e o card que o motivou.
- Onde a IA hoje lê a instrução antiga (busque a frase em `src/`).

## Passo a passo

1. Escolha o lugar pelo papel da tabela: o que vale sempre e é curto vai na skill principal ou nas
   instruções; o detalhe vai na skill do assunto (`faz-ai-harness-do-card`, `faz-ai-workspace-e-pr`,
   `faz-ai-implementacao-rodadas`, `faz-ai-revisao-e-homologacao`, `faz-ai-modo-autonomo`); o que
   depende do estado do card vai numa nota do `get_card`. Não repita a mesma regra em dois lugares.
2. Escreva em português direto, no tom das frases existentes. Skill nova por assunto: entra em
   `FLOW_SKILLS` e a principal passa a citá-la em "Skills por assunto".
3. Procure frases que contradizem a nova (`grep` pela palavra-chave em `src/extension` e
   `src/shared`) e ajuste-as no mesmo passo.
4. Teste: um `it` que confere a frase ou a ausência da antiga, no arquivo do assunto:
   `test/flowSkillText.test.ts`, `test/flowSkillRounds.test.ts`, `test/flowSkillStack.test.ts`,
   `test/skillInstall.test.ts` (instalação dos arquivos), `test/chat.test.ts` (pedidos),
   `test/mcp.test.ts` (instruções e notas). Mantenha os testes que já guardam frases (ex.: a
   principal não cita `code-review-graph`).
5. Mudou o MCP (instruções, notas): `docs/mcp.md`. Mudou o que a pessoa vê da IA: CHANGELOG e o
   arquivo do assunto em `docs/` (`registrar-mudanca-changelog-readme`).

## Validação

- `npx vitest run test/flowSkill*.test.ts test/skillInstall.test.ts test/chat.test.ts` e, se tocou o
  MCP, `npm run build:ext && npx vitest run test/mcp.test.ts`; `npm run typecheck`; antes de entregar,
  `npm run validate`.

## Saída

Na conversa do card: qual texto mudou (arquivo e constante), a frase antiga e a nova, os textos que
contradiziam e foram ajustados, e os testes.

## Falhas

- O comportamento novo contradiz o que a pessoa combinou no fluxo (aprovações, quem fica com a vez):
  não mude; registre como pendência.
- Teste de frase falha depois da mudança: atualize o teste só se a frase antiga deixou de ser
  verdade, dizendo o motivo na conversa; nunca apague o teste.

## O que esta skill nunca faz

- Não altera as cópias instaladas (`~/.faz-ai/...`, `.claude/skills/faz-ai-*`) à mão: elas saem de
  `installFlowSkillFiles`.
- Não move para `MCP_INSTRUCTIONS` o que cabe numa skill por assunto ou numa nota.

## Lacunas para revisar

- Não foi conferido se a skill instalada nos projetos é atualizada sozinha quando `FLOW_SKILLS`
  muda (`installFlowSkillFiles(skillsRoot, replace)`): confirme antes de contar com isso.
- Os pedidos que o runner monta para cada execução de card não foram localizados nesta análise;
  acrescente o arquivo à tabela quando for confirmado.
