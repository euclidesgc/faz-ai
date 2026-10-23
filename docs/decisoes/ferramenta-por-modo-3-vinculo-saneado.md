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
- **No ACP, o modo da sessão entra no vínculo, e a execução admitida nunca usa o modo sem perguntas.**
  Até aqui, `full` pedia `session/set_mode` com o `fullMode` do agente (`yolo` no Gemini e no
  Antigravity, `agent-full-access` no Codex). Nesse modo o agente não manda `session/request_permission`,
  então `boardDecision` não roda e as negações do card (a delegação, que toda execução admitida nega, as
  ferramentas negadas, os servidores MCP fora do card) deixavam de valer. Com a permissão fora do
  vínculo, a prova do modo padrão passaria a autorizar esse modo. Decisão: `acpSessionMode` só devolve
  o `fullMode` para uma execução sem restrição declarada (sem `toolSet: 'explicit'` e sem
  `deniedTools`), o que nenhuma execução admitida é; no admitido, `full` roda no modo padrão e o board
  responde cada pedido, liberando tudo o que o card não nega. O vínculo do ACP leva `sessionMode`
  (`padrao` ou o `fullMode`), então `board`, `edits` e `full` admitidos compartilham a prova do modo
  padrão, e uma sessão no modo sem perguntas é outro vínculo, que nenhuma prova cobre. A admissão ainda
  recusa, por defesa, uma execução ACP admitida cujo modo não seja o padrão. O verificador não precisa
  provar o `fullMode`: ele nunca roda numa execução admitida.
- **`environment` é uma lista** (`bindingEnvironment`): o ambiente que a execução recebe (o do host, o
  PATH do shell e as variáveis do comando, sem as da sessão do Claude Code que o spawn tira, agora em
  `INHERITED_SESSION_ENV`), filtrado ao PATH, às pastas de configuração (`HOME`, `USERPROFILE`,
  `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`,
  `HOMEDRIVE`, `HOMEPATH`), à rede (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, em maiúsculas
  ou minúsculas, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_TLS_REJECT_UNAUTHORIZED`),
  à carga de bibliotecas nativas (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`), às variáveis que o
  verificador neutraliza na fixture (`VERIFIER_OBSERVED_ENV`: `ANTHROPIC_*`, `CLAUDE_*`, `AWS_*`,
  `GOOGLE_*`, `AZURE_*`, `NODE_OPTIONS`, `NODE_PATH`, a mesma expressão que o verificador usa), às do
  Gemini (`GEMINI_*`) e às do próprio perfil.
- **`CLAUDE_CODE_*` só as de comportamento.** As que o editor herda da sessão do Claude Code que o
  abriu (`CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_ENTRYPOINT`, ids e sockets)
  mudam a cada sessão e ficam fora; entram só as de uma lista que muda o que a CLI faz (provedor
  Bedrock, Vertex ou Foundry, tráfego não essencial, memória dos diretórios adicionais, shell, limite
  de saída, certificado do cliente). `CLAUDE_CONFIG_DIR` segue pelo `CLAUDE_*`.
- **Credencial só pela presença.** O vínculo nunca foi gravado em claro (o store guarda só o hash, no
  nome do arquivo e no recibo). De variável com nome de credencial (`KEY`, `TOKEN`, `SECRET`, `PASSW`,
  `CREDENTIAL`, `AUTH`, `COOKIE`) entra só que ela está definida, nem o valor nem o digest: o token de
  sessão que gira (`AWS_SESSION_TOKEN`, o do login) não derruba a prova, e o segredo não entra nem no
  contexto em memória. Um teste lê todos os arquivos da pasta de evidências depois de verificar com
  chaves no ambiente e confere que nem o valor nem o nome aparecem.
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
  ligado que nunca foi provado. Uma verificação do perfil já em andamento (ligar e conferir ao mesmo
  tempo) não abre outro handshake: vale a deduplicação por perfil da história 2. Com o login faltando
  ou vencido, e no clique em **Verificar de novo** (o clique depois de entrar na conta), a tentativa é
  esquecida, e a prova que falhou sem login (o `authRequired` do handshake) é refeita. Uma falha ao
  gravar o índice não perde os recibos nem o resultado: o verificador devolve `indexError`, e o host o
  registra em Saída › Faz AI.

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
- **Provar também o `fullMode` (sondar com `session/set_mode` no handshake):** a prova diria que o
  agente abre a sessão nesse modo, não que as negações do card valem nele; elas não valem, porque o
  agente para de perguntar. A saída é não usar o modo numa execução admitida.
- **Digest do valor da credencial:** cada rotação de token derrubaria a prova sem mudar o isolamento.
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
- Num agente ACP, **Sem restrições** deixa de dispensar as perguntas do agente: cada pedido passa pelo
  card. Uma sessão com muitas chamadas troca mais mensagens com o board, mas a permissão é a mesma.
- Cenários novos em `test/scenarios/cardAcp.scenario.test.ts`: o card em `edits` admitido com os
  recibos feitos em `board` (F), uma variável volátil mudada depois da prova sem bloquear o card (G) e
  o card em `full` admitido com a prova de `board`, sem `session/set_mode`, com a delegação negada pelo
  card (H). O cenário A passa a conferir que o `full` não pede o modo sem perguntas. O mundo do cenário
  grava os recibos em `board`, como o verificador.
