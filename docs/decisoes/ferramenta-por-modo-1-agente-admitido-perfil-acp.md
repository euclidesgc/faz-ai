# Ferramenta por modo, 1: agente do card em perfil ACP e personalizado

> História 1 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Corrige a admissão descrita no [registro 1090](1090-admissao-por-capacidades-cobre-o-transporte-acp.md).

## Contexto

Um card com agente escolhido e um perfil ACP ou personalizado falhava no **Refinar** e no **Trabalhar na
fase** com "Agente obrigatório precisa de definição do board; descoberta nativa não é permitida". Todo
perfil personalizado e ACP só orienta o agente pelo pedido: o nome do agente vai no prompt ("Você atua
como o agente ..."), sem a definição inline que o Claude Code carrega como subagente.

A causa estava no plano de execução. `execution.ts` mandava o nome do agente (`agent: manifest.agent`)
também quando a definição inline não ia junto. A admissão (`admission.ts`) recusa nome sem definição,
porque nesse caso a CLI faria descoberta nativa do agente, que a admissão não aceita. No transporte ACP
essa descoberta não existe, então o nome sozinho não tinha efeito útil e só derrubava a execução.

## Decisão

- **O plano só leva o nome quando a definição vai junto.** `execution.ts` grava
  `agent: agentDefinition ? manifest.agent : ''`. O manifesto e o resumo seguem com o nome do agente, para
  o card, o log e a conferência de execução continuarem mostrando o agente escolhido.
- **Defesa no host.** `prepare` da admissão zera `exec.agent` quando o transporte é `acp`, antes da
  checagem de descoberta nativa. Assim a regra "nome sem definição" não atinge o ACP, que não tem
  descoberta nativa, mesmo que um chamador monte o plano de outro jeito.
- **Nada muda no provider do Claude.** O único leitor do nome do agente no plano é o provider do Claude
  (`providers/claude.ts`), que só monta o subagente quando há definição inline. O comportamento dele não
  muda.

## Alternativas descartadas

- **Afrouxar a admissão para aceitar nome sem definição em qualquer transporte:** a garantia de que a
  CLI não faz descoberta nativa de agente deixaria de valer para o transporte da CLI, onde a descoberta
  existe e pode carregar um agente que o board não revisou.
- **Mandar a definição inline para todo perfil:** os providers não-Claude não leem essa definição; seria
  mudar o contrato dos providers, fora do escopo desta história.
- **Corrigir só no plano, sem a defesa no host:** um chamador futuro que monte o plano com o nome do
  agente reintroduziria o bug no ACP, sem nenhum teste pegando a falha antes da execução.

## Consequências

- Refinar e Trabalhar na fase rodam com perfil ACP ou personalizado e agente no card; o agente segue pelo
  prompt, como já ia.
- No transporte da CLI, a recusa por nome sem definição continua valendo: a descoberta nativa segue
  bloqueada onde ela existe.
- O plano de um perfil ACP sai sem o nome do agente, e o manifesto segue com ele. Quem precisar do
  nome fora da execução deve lê-lo do manifesto.
