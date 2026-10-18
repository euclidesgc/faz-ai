# Evidências locais para a admissão de execução

Consulta em 18/10/2026. Este registro é preparação de #711/#729, não uma verificação de isolamento.

| Executor | Probe local sem inferência | Situação |
| --- | --- | --- |
| Claude Code | `/opt/homebrew/bin/claude --version`: 2.1.296; `--help` consultado | Instalado. Sem teste de artefatos-sentinela, MCP proibido ou delegação nesta consulta. |
| Kimi Code | `/opt/homebrew/bin/kimi --version`: 2.2.0; `--help` consultado | Instalado, versão diferente de 2.1.1 citada no provider atual. Não herda aquela evidência. |
| Cursor | `cursor-agent` ausente do PATH do shell desta consulta | Não validado; verificar também o resolvedor de binários embutidos antes de concluir ausência na máquina. |

## Documentação oficial consultada

- [Claude Code: referência da CLI](https://code.claude.com/docs/en/cli-reference), [settings](https://code.claude.com/docs/en/settings) e [subagentes](https://code.claude.com/docs/en/sub-agents). `--tools` controla disponibilidade; `--allowedTools` trata aprovação. Há controles separados de settings, skills e MCP. Políticas gerenciadas exigem consideração própria: não deduzir isolamento completo de `--setting-sources` vazio.
- [Cursor: permissões](https://prod.cursor.com/docs/cli/reference/permissions) e [MCP](https://prod.cursor.com/docs/cli/mcp). A documentação de permissões descreve configuração global e por projeto; sua existência não comprova isolamento da descoberta de artefatos.
- [Kimi: configuração](https://moonshotai.github.io/kimi-code/en/configuration/config-files.html) e [MCP no repositório oficial](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/mcp.md). O help local de 2.2.0 deve ser considerado separadamente das referências históricas do provider.

Nenhuma credencial foi lida, nenhum comando de login executado e nenhuma inferência iniciada por estes probes. Mudanças de flags, novos estados verificados e o piloto de qualidade/consumo continuam exigindo evidência própria. Não converter a disponibilidade de uma opção ou um processo com código zero em capacidade verificada.

A base de admissão passou a usar, somente na preparação v1, `--tools` inclusive vazio e `dontAsk` com a lista exata de ferramentas/operacões autorizadas. Foram consultadas novamente a [referência da CLI](https://code.claude.com/docs/en/cli-reference) e a [documentação de permissões](https://code.claude.com/docs/en/permissions). Testes de montagem do comando e recibos sintéticos não comprovam que a versão instalada impõe todas essas restrições; o verificador real continua pendente.

## Contrato observado com Claude Code real e API local

Em 18/10/2026, `npm run test:cli-real` passou com Claude Code **2.1.296**, macOS/arm64, binário SHA-256 `c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`. O comando usa o provider real do repositório, configuração temporária (`CLAUDE_CONFIG_DIR`) e API/MCPs em loopback; a resposta da API é determinística, sem modelo remoto ou credenciais da pessoa. O JSON de saída identifica o binário e fornece hashes das observações, sem publicar prompts/requisições. Não cria recibos em `CapabilityEvidenceStore`.

- Controle positivo: as seis sentinelas (projeto, usuário, ancestral, pasta adicional, skill e agente) chegaram à requisição; o hook criou o marcador e o MCP proibido foi conectado.
- Contrato estrito: sentinelas e hook ausentes; o MCP externo não conectou. Read e a operação MCP permitida executaram. Write, Bash, Agent e a segunda operação do mesmo servidor receberam erro, sem escrita ou chamada ao handler proibido.
- Lista vazia não expôs ferramentas nem conectou MCP. Dois processos iniciaram sessões distintas sem carregar a conversa anterior.
- Mutação de controle: reativar `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` reproduziu o carregamento da sentinela adicional. O provider agora fixa `0` no contrato estrito; esse ambiente faz parte do vínculo de admissão.

A [referência oficial de variáveis](https://code.claude.com/docs/en/env-vars) documenta a leitura de memória das pastas adicionais e o redirecionamento de API. O endpoint alternativo também altera recursos como tool search/feature flags; por isso esta prova **não** é transportável automaticamente para o perfil autenticado de produção. A [referência da CLI](https://code.claude.com/docs/en/cli-reference) e a [precedência de configurações](https://code.claude.com/docs/en/settings) foram consultadas antes da correção.

**Ainda pendente em #717/#729:** ligar estes cenários ao AiGateway/spawnHeadless real e completar concorrência/cancelamento/queda/fronteiras de WAL por CLI; políticas gerenciadas/MDM/servidor, observação do ambiente real de cada perfil e integração da coleta ao vínculo da admissão; Cursor/Kimi e Windows; leituras diferidas/revisões suportadas e a matriz final exigida nos cards. Os três testes verificam mecanismos no ambiente declarado, não cinco capacidades de produção. Ausência de binário/plataforma não validada falha explicitamente; não existe teste verde por pulo. Os valores de usage da API de teste são sintéticos e não servem ao piloto de consumo/qualidade.
