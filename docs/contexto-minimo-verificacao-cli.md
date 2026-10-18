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
