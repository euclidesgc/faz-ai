# Regras de fallback: a tela simples sobre as políticas de execução

> Entregue em 2026-10-24, na 0.48.0. Só a tela muda: o modelo `ExecutionPolicy`, o avaliador, o
> repositório versionado (schema 41) e o MCP `get_execution_policies` continuam iguais.

## Contexto

A seção **Políticas de execução e fallback** abria um diálogo com um editor de nove grupos de
checkboxes, três selects por destino, cinco campos numéricos mais um por perfil, uma tela de comparação
obrigatória, o checkbox "Revisei…", um simulador de doze campos e o assistente de IA, tudo no mesmo
grid de outra tela. A pessoa não sabia o que configurar nem para quê. O que ela precisa é dizer qual
modelo, ao esgotar a cota, é substituído por quais modelos de outros agentes, em que ordem, e se a
troca é automática ou perguntada.

Na exploração apareceu um fato que define o desenho: o host só reporta a falha `quota` ao avaliador
(`runner.ts`, `chat.ts`). Os outros dez tipos de falha existem no modelo, mas nunca disparam.

## Decisão

- **Uma lista na própria tela**, no estilo da tabela de Sugestão de modelo: a ordem é a prioridade
  (renumerada em duas passadas ao mover, porque o host recusa duas regras ligadas empatadas), o
  interruptor grava a política com `enabled` trocado, e cada linha é uma frase (quando, usa no lugar,
  como). Sem o diálogo "Gerenciar políticas".
- **Uma origem por regra** (qualquer modelo, qualquer modelo de um agente, ou um modelo de um agente).
  As condições guardam perfis × modelos: dois perfis e dois modelos casariam as quatro combinações,
  não as duas que a pessoa pediu. Uma regra com mais de uma origem continua válida e aparece como
  "Várias origens (regra avançada)".
- **Salvar pela tela é a revisão humana.** O editor grava com `reviewed: true` em um clique; a tela de
  comparação e o checkbox "Revisei…" saem. O que a decisão original protegia (a IA não grava nem liga
  política) continua no repositório (`actor !== 'person'` é recusado) e no assistente (a proposta só
  vira rascunho). A revisão pendente fica para o que não passou pela pessoa: importação, proposta da
  IA e reserva antiga, com **Revisar e ligar**.
- **Só a cota no caminho simples.** O editor fala em "esgotar a cota"; os tipos de falha ficam em
  Avançado, com a nota de que o board só detecta a cota hoje. Quando a execução reportar outros tipos,
  a tela não precisa mudar.
- **Avançado fechado** guarda o resto (ação bloquear/esperar, escolha à mão no card, condições de
  situação, limites, simulação do rascunho, sugestão da IA, versões anteriores), com os mesmos padrões
  de antes. `explicit` da regra nova passa de `exclude` para `include`: a pessoa que monta "Opus →
  Gemini Pro" espera a troca também no card em que escolheu o Opus à mão.
- **Conflito de versão** mantém o rascunho e oferece recarregar a base (`expectedRevision`), como antes.

## Alternativas descartadas

- **Manter comparar e confirmar com visual melhor**: duas telas e um checkbox para dizer "sim" a algo
  que a pessoa acabou de escrever; a proteção real está no host.
- **Tirar as condições avançadas da interface**: regras importadas ou antigas com fase, agente ou tipo
  ficariam invisíveis e ineditáveis.
- **Várias origens por regra**: o produto cartesiano das condições surpreende; duas regras são mais
  claras que uma com quatro combinações.

## Consequências

- `src/webview/components/settings/policies/`: `ExecutionPoliciesSettings` (lista), `PolicyEditor`
  (três blocos e Avançado) e `parts.tsx` (origem ↔ condições, destinos, a frase); simulador e
  assistente só mudam de layout.
- Os textos antigos do editor saíram do dicionário em inglês; `docs/configuracoes.md` descreve a
  tela nova.
