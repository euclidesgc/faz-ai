# Ferramenta por modo, 6: contrato de execução (`Executor`)

> História 6 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 5](ferramenta-por-modo-5-contrato-conexao.md) (os drivers e
> `driverFor`) e da [história 4](ferramenta-por-modo-4-perfil-ferramenta-modo.md) (`tool` e `mode` no perfil).

## Contexto

Depois da história 5, a conexão (sonda, requisitos, Diagnóstico, modelos) já falava com o driver, mas a
execução não: o gateway escolhia o transporte com `if (agent) spawnAcp(...) else spawnMeasured(...)`, e a
admissão montava a invocação do vínculo de isolamento com o mesmo `if` (`acpCommand` com o modo da sessão
no ACP, `headlessCommand` na CLI). Entrar com o modo API (histórias 9 e 10) exigiria um terceiro ramo nos
dois lugares. O vínculo é o hash a que cada prova de capacidade gravada está presa: mexer em como ele é
montado sem mudar o resultado é o requisito principal desta história.

## Decisão

- **Contrato `Executor`** (`drivers/types.ts`): `transport` (o que roda de fato, o mesmo que a admissão
  confere), `run(input, ctx): Measured` e `bindingContext(input, { profile, cwd })`. Todo driver cumpre a
  conexão e a execução (`ToolDriver = ConnectionDriver & Executor`); `driverFor` e `allDrivers` devolvem
  `ToolDriver`.
- **`run` recebe os `spawn` já conferidos.** O `ExecutorContext` leva o perfil resolvido, a pasta, o log,
  o id da execução, a pasta de coordenação, o manifesto do Cursor e os dois `spawn` (`spawn` da CLI e
  `spawnAcp` do agente) já embrulhados pelo gateway: a revalidação do comando pela admissão
  (`admitted.command` e `admitted.acpCommand`), o snapshot, a sessão MCP, a contagem de tentativas, o
  formato, a vigia do login e o `beforeStart`. O driver usa o do transporte dele; o ciclo do log, a
  admissão e o cancelamento continuam só no gateway. O executor de CLI (`cliExecutor`) chama
  `spawnMeasured`; o de ACP (`acpDriver`) chama `spawnAcp` com o agente do catálogo.
- **`bindingContext` devolve só a parte da ferramenta**: a `invocation` (o comando montado da CLI com a
  saída estruturada; no ACP `{ transport, agent, command, args, sessionMode }`), o comando a resolver, o
  PATH e o `lookup` próprios e as variáveis do comando. `ExecutionAdmission.binding` troca o prompt pelo
  marcador, resolve o executável, acrescenta o que é igual para toda ferramenta (versão do formato,
  plataforma, runtime, perfil, `tool`, `profileConfig` do configurável, executável real, digest do
  binário, escopo ou pasta e diretórios adicionais, o ambiente filtrado e a evidência de ambiente),
  canoniza e faz o hash. O formato do contexto não mudou (`version: 2`).
- **`executorOf(perfil)`** (`drivers/index.ts`) é quem executa: no perfil ACP (`isAcpProfile`, a regra de
  sempre do gateway e da admissão), o driver do agente do catálogo, e o agente desconhecido é recusado
  com a mesma mensagem de antes; na CLI, o driver do perfil (pronta e cópia) ou, sem driver, o executor
  genérico de CLI.
- **CLI personalizada: fallback explícito para o executor genérico de CLI.** O perfil personalizado CLI
  não tem driver de conexão (`toolModeOf` → null) e continua sem: não há ferramenta, página nem sonda
  para descrever. A execução dele, porém, nunca foi da ferramenta: o comando, os argumentos e o leitor
  vêm do provider do perfil (`providerFor`, pela base `generic` e pelo cofre). O `cliExecutor` já é
  genérico (é o mesmo que os drivers de Claude, Cursor e Kimi espalham, `toBe` no teste), então o
  personalizado roda por ele, sem um driver "genérico" de conexão que diria ter sonda e página. Hoje o
  personalizado CLI no modo estrito é bloqueado pela admissão (`tool-mapping-unavailable`) antes do
  `run`; o vínculo dele (prévia, Diagnóstico) sai pelo mesmo executor e é o de antes.
- **`admissionTransport` fica com a regra `isAcpProfile`**, sem passar por `executorOf`: a prévia e o
  Diagnóstico leem o transporte antes de montar o vínculo, e `executorOf` lança no agente desconhecido
  (quem recusa é o vínculo, como antes). O teste confere que os dois dão o mesmo transporte para todos
  os perfis do catálogo, uma cópia, a CLI personalizada e cada agente de `ACP_AGENTS`.
- **As guardas de estrutura acompanham.** `spawnMeasured` só é chamado pelo executor de CLI
  (`drivers/cli.ts`); `spawnAcp` só pelo driver ACP; `executorOf` só pelo gateway, pela admissão e pelo
  registro; `executor.run(` só pelo gateway. O gateway não importa mais `acp/run`.

## Prova de que os vínculos não mudaram

- A régua: `test/helpers/bindingReference.ts` é o cálculo da admissão antes desta história, congelado
  (o mesmo `if` por transporte, o mesmo contexto). Ele foi escrito e conferido contra o código antigo
  antes da refatoração (`test/admissionBoundary.test.ts`, verde na `develop` com o teste novo).
- `test/admissionBoundary.test.ts` ("os mesmos vínculos com o contrato de execução") compara, com a
  régua, o vínculo de isolamento e o de execução (com a pasta e um diretório adicional) do Claude Code
  pronto (pelo id e pelo perfil), do Cursor e do Kimi Code prontos, de uma cópia do Claude com comando,
  ambiente e PATH próprios, de uma CLI personalizada, de cada agente de `ACP_AGENTS` num personalizado,
  do Gemini pronto e de um agente ACP personalizado com PATH próprio no perfil (o comando do agente não
  leva o ambiente do perfil: o executável sai do PATH do host, como antes), em quatro entradas (`board` sem restrição, `edits` estrito com modelo, MCP e
  ferramentas, `full` com diretório adicional, `full` sem restrição, que no ACP é o modo sem perguntas);
  a recusa também é comparada (a CLI personalizada no modo estrito recusa igual). O segundo teste
  confere que a execução admitida do Claude e o vínculo de isolamento do ACP são os da régua.
- `test/hostAdmission.test.ts` confere o mesmo pelo caminho do host: a decisão da execução admitida está
  presa ao vínculo de isolamento da régua, e o vínculo da execução é o da régua.
- Além dos testes, um despejo de 24 vínculos (Claude, Cursor, Kimi, Gemini ACP, CLI personalizada e
  agente ACP personalizado; `board` e `full`; isolamento e execução) numa pasta fixa, antes e depois da
  refatoração, deu os mesmos hashes.

## Onde a especificação não cabia no código

- **"`ExecutionAdmission.binding` só canoniza e faz o hash do que o driver devolve."** O driver devolve
  a parte da ferramenta; a identidade do host, o digest do binário (com o cache por caminho real), o
  ambiente filtrado e a evidência de políticas continuam sendo acrescentados pela admissão antes do
  hash. Pôr isso em cada driver repetiria o código em todos e deixaria um driver novo enfraquecer a
  prova esquecendo o binário; o espírito da épica (o vínculo vem do driver, a admissão não conhece a
  ferramenta) fica atendido, porque a admissão não tem mais `if` por transporte para montar o vínculo.
- **`bindingContext(input, cwd)`** ganhou o perfil no segundo argumento (`{ profile, cwd }`): o executor
  de CLI é um só para todas as CLIs e precisa do perfil (o comando e o cofre). A pasta fica disponível
  para o modo API (história 9), que vincula endpoint e modelo; nenhum driver de hoje a usa.
- **O comando sempre tem executável.** O `BindingInvocation.command` é obrigatório; o modo API, sem
  processo, decide na história 9 como o vínculo fica sem executável.
- **Os validadores da execução admitida** (`admitted.command` e `admitted.acpCommand`) continuam na
  admissão, por transporte: eles comparam o comando de cada tentativa com o admitido e são a defesa da
  admissão, não um dado da ferramenta. Passar a montar o esperado pelo driver é uma troca possível
  quando o modo API trouxer um terceiro transporte.

## Alternativas descartadas

- **Driver genérico de conexão para a CLI personalizada**: diria ter `locate`, página, instalador e
  sonda que dependem só do que a pessoa escreveu no formulário; o personalizado sai do caminho normal na
  história 13, e um driver aqui teria de ser desfeito.
- **Fallback dentro do gateway (`driver?.run ?? spawnMeasured`)**: deixaria o gateway com dois caminhos e
  o teste de estrutura sem dono único para `spawnMeasured`.
- **Fixar os hashes em constantes no teste**: o vínculo leva a plataforma, a versão do Node, o caminho
  real e o digest do binário; a constante só valeria numa máquina. A régua congelada compara a montagem,
  que é o que a refatoração podia quebrar.

## Consequências

- Nenhuma mudança visível nem de comportamento: os vínculos são os de antes (nenhuma prova perde a
  validade), os testes existentes e os cenários de `test/scenarios/` seguem verdes, e não há entrada no
  CHANGELOG. Nenhum cenário novo: o caminho do card até a conversa é o mesmo, e os cenários A a H (ACP) e
  C (Claude CLI) passam pelo driver agora.
- Entrar com um modo é escrever `run` e `bindingContext` no driver; o modo API (histórias 9 e 10) entra
  como um terceiro `transport`, sem ramo novo no gateway nem na montagem do vínculo.
- `CONTRIBUTING.md` e `CONTRIBUTING_EN.md` ("Como entra uma ferramenta de IA") descrevem o contrato de
  execução e a régua do vínculo.
