# Ferramenta por modo, 3: vínculo de isolamento saneado

> História 3 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 2](ferramenta-por-modo-2-verificacao-por-perfil.md).

## Contexto

O vínculo de isolamento (`ExecutionAdmission.binding`, o hash a que cada recibo de capacidade está
preso) levava duas coisas que não mudam o isolamento:

- **a permissão do card.** O verificador prova sempre em `board`, então um card em `edits` ou `full`
  procurava recibos de outro vínculo e ficava em `capability-not-verified`. No modo estrito (o
  `toolSet: 'explicit'` da admissão) a linha de comando do Claude Code é a mesma nos três níveis, e no
  ACP a permissão não entra no comando (o board responde cada pedido do agente);
- **o `process.env` inteiro.** Qualquer variável volátil (terminal, sessão do editor, sockets, as
  `CLAUDE_CODE_*` da sessão que abriu o editor) mudava o hash: a prova caía a cada reinício do editor.

## Decisão

- **A permissão sai do contexto do vínculo.** Onde ela muda a linha de comando (perfil personalizado
  com `permissionArgs`), ela continua entrando pela invocação, que faz parte do vínculo. O vínculo da
  execução (com a pasta) também já fixa o conjunto exato de ferramentas admitido para o nível.
- **`environment` é uma lista** (`bindingEnvironment`): o ambiente que a execução recebe (o do host, o
  PATH do shell e as variáveis do comando, sem as da sessão do Claude Code que o spawn tira, agora em
  `INHERITED_SESSION_ENV`), filtrado ao PATH, às pastas de configuração (`HOME`, `USERPROFILE`,
  `XDG_CONFIG_HOME`), às variáveis que o verificador neutraliza na fixture (`VERIFIER_OBSERVED_ENV`:
  `ANTHROPIC_*`, `CLAUDE_*`, `AWS_*`, `GOOGLE_*`, `AZURE_*`, `NODE_OPTIONS`, `NODE_PATH`, a mesma
  expressão que o verificador usa), às do Gemini (`GEMINI_*`) e às do próprio perfil.
- **Segredo só por digest.** O vínculo nunca foi gravado em claro (o store guarda só o hash, no nome
  do arquivo e no recibo), mas o valor de variável com nome de segredo (`KEY`, `TOKEN`, `SECRET`,
  `PASSW`, `CREDENTIAL`, `AUTH`, `COOKIE`) entra como `sha256:<digest>` também no contexto em memória.
  Um teste lê todos os arquivos da pasta de evidências depois de verificar com chaves no ambiente e
  confere que nem o valor nem o nome aparecem.
- **`version: 2` no contexto.** O hash muda para todo perfil: toda prova gravada antes perde a
  validade, sem migração (a prova é refeita, não convertida).
- **O host sabe que uma prova perdeu a validade.** O store guarda em `profiles.json` o vínculo da
  última prova de cada perfil (só id e hash; não é prova, não passa pela assinatura e nunca decide
  admissão). Na conferência do ambiente, um perfil ligado e verificável cujo vínculo atual difere do
  da última prova ganha `evidenceInvalidated` (`automatic` no agente ACP, `command` no Claude), e a
  faixa de requisitos mostra um aviso que não bloqueia: "{perfil}: a verificação de capacidades perdeu
  a validade", dizendo o que pode ter mudado e como refazer (no ACP, "o board já está verificando de
  novo"; no Claude, o comando da paleta).
- **A verificação automática da história 2 refaz a prova.** Além de ligar e conectar, a conferência do
  ambiente manda verificar, em segundo plano, cada agente ACP ligado sem prova em vigor no vínculo
  atual, **uma vez por vínculo por sessão**: uma verificação que falha antes de gravar não repete a
  cada conferência (que roda a cada 10 s enquanto falta login), e um vínculo novo (ferramenta
  atualizada) ganha uma tentativa nova. Cobre a prova invalidada pelo formato novo e a do agente
  ligado que nunca foi provado.

## Onde a especificação não cabia no código

- "A faixa de requisitos avisa" que a prova antiga perdeu a validade: as provas gravadas antes desta
  história não dizem de qual perfil são (o arquivo tem só o hash, e o vínculo antigo dependia do
  ambiente inteiro, então nem recalculá-lo daria o mesmo hash depois de um reinício). O aviso vale a
  partir da primeira prova gravada nesta versão. Nenhuma versão lançada gravou recibos (a 0.46.0 não
  tem o verificador, e a 0.47.0 ainda não saiu), então quem perde a prova antiga são só as instalações
  da `develop`; no ACP o board a refaz sozinho, no Claude o CHANGELOG pede o comando.

## Alternativas descartadas

- **Gravar a prova nos três níveis (rodar o verificador três vezes):** triplica as sondas do Claude
  (que rodam a CLI quatro vezes cada) para provar a mesma linha de comando.
- **Lista fixa de variáveis por ferramenta no driver:** é o que a história 6 traz (`bindingContext` por
  driver); aqui a lista é uma só, com as variáveis que o verificador já observa.
- **Ambiente inteiro com as voláteis conhecidas tiradas:** a lista de voláteis nunca fecha (cada
  terminal e cada editor inventa as suas); a lista do que importa é curta e estável.
- **Assinar o `profiles.json` com a chave local:** ele só decide o aviso e a nova verificação; um
  índice alterado no máximo mostra um aviso a mais ou a menos, e a admissão continua lendo os recibos
  assinados do vínculo atual.
- **Bloquear o perfil com prova invalidada (`stale` em `profileProblem`):** a validação ainda não é
  requisito (`validationRequired: false`); bloquear derrubaria o board de quem nunca verificou.

## Consequências

- A prova de um perfil vale para `board`, `edits` e `full` e sobrevive ao reinício do editor; ela cai
  quando muda o binário, as políticas gerenciadas, os argumentos de isolamento ou uma das variáveis da
  lista.
- Um agente ACP ligado é verificado sozinho ao abrir o board quando não tem prova em vigor (dois
  handshakes, sem gastar a conta), uma vez por vínculo.
- O índice `profiles.json` é escrito sem trava entre duas verificações simultâneas de perfis
  diferentes; a corrida perde, no pior caso, um aviso.
- Cenários novos em `test/scenarios/cardAcp.scenario.test.ts`: o card em `edits` admitido com os
  recibos feitos em `board` (F) e uma variável volátil mudada depois da prova sem bloquear o card (G);
  o mundo do cenário passa a gravar os recibos em `board`, como o verificador.
