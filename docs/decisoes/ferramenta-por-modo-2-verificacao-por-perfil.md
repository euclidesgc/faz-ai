# Ferramenta por modo, 2: verificação de capacidades por perfil

> História 2 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 1](ferramenta-por-modo-1-agente-admitido-perfil-acp.md).

## Contexto

O comando **Faz AI: Verificar o isolamento da CLI de IA** só verificava o perfil padrão do board
(`activeProfile`), enquanto a execução usa o perfil do alvo do card. Para provar um agente ACP, a
pessoa precisava torná-lo padrão do board, rodar o comando e voltar. Pior: o host entregava ao
verificador o perfil resolvido (um objeto), e o verificador só aceitava a CLI do Claude pelo id
`'claude'`; com o Claude Code como padrão, o comando recusava o perfil.

A prévia de admissão do card (`setAdmissionReader`) também avaliava o perfil padrão, então um card
com o modelo de um agente ACP mostrava a admissão do Claude. E o Diagnóstico do ambiente mostrava as
capacidades declaradas (sempre desconhecidas), não as provas gravadas.

## Decisão

- **`BoardHost.verifyExecutor(profileId)`.** O host verifica o perfil pedido e recusa com mensagem clara
  o que não existe, não tem sonda (Cursor, Kimi, CLI personalizada) ou está desligado ou pendente de
  revisão. Duas verificações do mesmo perfil ao mesmo tempo viram uma só. Ao fim, o host confere o
  ambiente de novo, para o Diagnóstico mostrar os recibos novos.
- **Verificável = Claude ou ACP** (`verifiableProfile` em `src/shared/aiProfiles.ts`): `base === 'claude'`
  (a CLI pronta e as cópias, que rodam o mesmo binário com os próprios ajustes) ou `isAcpProfile`. O
  verificador passa a aceitar o perfil resolvido pela base, não só o id.
- **O comando pergunta o perfil.** Um QuickPick com `verifiableProfiles(board)`: ligados, revisados e
  verificáveis, com o padrão do board primeiro. O comando aceita o id como argumento, para quem já sabe.
- **Disparo automático em segundo plano**, com o resultado no log (Saída › Faz AI): ao ligar um agente
  ACP (`settings.aiProfiles.setEnabled`, pelo novo `router.onProfileEnabled`) e em `connectAI`, para o
  perfil da ferramenta conectada. Nenhuma das sondas gasta a conta da pessoa: a do Claude roda contra
  uma API local com chave falsa, a do ACP são dois handshakes.
- **Prévia pelo perfil do alvo do card** (`admissionProfileOf` em `src/shared/contextAdmissionPreview.ts`):
  o leitor da admissão recebe o alvo e avalia o perfil de `runTargetOf` (modelo do card, do agente ou da
  regra). Sem card, vale o padrão. Com a escolha explícita do card bloqueada, a prévia fica
  "indisponível" em vez de avaliar outro perfil.
- **Diagnóstico com as provas do próprio perfil** (`evidenceCapabilities` em `src/shared/profileHealth.ts`):
  para cada perfil verificável e liberado, o host lê as evidências do vínculo de isolamento dele. O bloco
  de um perfil verificável sem recibos diz como verificá-lo pela paleta (no editor; no navegador não há
  paleta).

## Alternativas descartadas

- **Pular o QuickPick quando só um perfil é verificável:** a escolha explícita mostra qual perfil vai ser
  verificado; com um item é um Enter.
- **Verificar ao ligar também o Claude Code:** o Claude Code nasce ligado e não passa pelo "ligar"; ele é
  verificado ao conectar a ferramenta e pelo comando.
- **Botão de verificar no Diagnóstico:** a épica tira o comando à parte na história 13, com a verificação
  dentro do Conectar (história 7); um botão agora seria refeito lá.
- **Prévia caindo no padrão quando o alvo do card está bloqueado:** mostraria a admissão de um perfil que
  não vai executar o card.

## Consequências

- Cada perfil ligado tem a própria evidência, e o comando não exige trocar o padrão do board.
- Enquanto o vínculo inclui o `process.env` inteiro (até a história 3), os recibos perdem a validade a
  cada reinício do editor; o disparo ao conectar e ao ligar refaz a prova.
- O Diagnóstico calcula o vínculo de cada perfil verificável a cada conferência (o hash do binário),
  como a prévia e a admissão já faziam.
- Nenhum cenário novo em `test/scenarios/`: a execução do card (plano, gateway, admissão, transporte,
  leitura e conferência) não muda; muda quem grava as provas e qual perfil a prévia lê.
