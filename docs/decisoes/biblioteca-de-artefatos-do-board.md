# Biblioteca de artefatos do board

## Contexto

A aba **Configurações › Harness › Artefatos do board** mostrava as regras, skills, agentes e servidores
MCP com três modos (Sempre, Pelo card, Desligado) que valiam diferente para cada tipo: uma regra podia ir
pelo card, uma skill podia ir em todo pedido. Quem configurava o board precisava saber o que cada modo fazia
em cada tipo, e o contexto da IA crescia sem que a tela deixasse isso claro.

## Decisão

Cada artefato passa a ter um único **ativo** por board, e o tipo decide o que ativo quer dizer:

| Tipo | Ativo | Inativo |
| --- | --- | --- |
| Regra | entra em todo pedido de IA do board | não entra em nada |
| Skill | pode ser vinculada a cards (N por card) e só entra no contexto deles | some dos cards e não pode ser vinculada |
| Agente | pode ser escolhido no card (1 por card) | some dos cards |
| Servidor MCP | mantém Sempre ou Pelo card | não entra em nada |

O ativo é derivado do `usage` que já existia (`off` = inativo), sem coluna nova: a versão anterior da
extensão continua lendo o mesmo valor. A migração 50 normaliza os valores que deixaram de existir.

- **Migração conservadora:** regra "Pelo card" vira inativa (a tela avisa para revisar); skill "Sempre" vira
  ativa, vinculável. O contexto nunca cresce sozinho na atualização.
- **Tools neutras:** skills e agentes guardam ids neutros (`read search write edit shell network mcp
  delegate`), traduzidos por um mapa na exportação e na execução. `delegate` só existe em agentes. A
  coluna `tools_json` nula quer dizer "ainda não escolhida": o board deriva das categorias antigas do agente
  ou do `allowed-tools` da skill.
- **Compatibilidade só avisa:** as ferramentas efetivas de um card são as do agente ∩ as pedidas pelas
  skills; a tela mostra a diferença, mas a execução recebe as tools do agente. Um card sem skill não perde
  ferramentas.
- **Pastas de skill:** `folder` na skill e a tabela `skill_folders` para as pastas criadas vazias.
- **Versão:** texto livre por artefato (`1` na regra, semver em skill e agente), à parte da `revision`
  interna, que continua contando gravações.
- **Criar com IA:** a IA escreve cada pergunta (uma chamada por pergunta, com o contexto do projeto e as
  respostas anteriores) e devolve o rascunho atualizado; "Finalizar" abre o formulário preenchido.

## Alternativas descartadas

- **Coluna `active` separada do `usage`:** dois campos que podem discordar, e a versão anterior não
  entenderia o desligado novo.
- **Migrar mantendo tudo ligado:** toda regra "Pelo card" passaria a entrar em todo pedido, aumentando o
  contexto sem a pessoa pedir.
- **Interseção de tools aplicada na execução:** com skills vinculadas, o agente perderia ferramentas que a
  skill não citou; um card sem skill ficaria ambíguo.
- **Roteiro fixo de perguntas no assistente:** mais rápido e sem custo, mas não se adapta ao projeto; a
  pessoa preferiu as perguntas escritas pela IA.

## Consequências

- O campo Rules do card deixa de ter efeito (as regras ativas já vão em tudo) e sai da tela; o valor
  gravado fica.
- A exportação para o Claude Code grava `allowed-tools` na skill e `tools` no agente; Cursor e Kimi não
  têm o campo, e a prévia avisa que ele foi omitido.
