# Execução híbrida: estado dos testes em 02/11/2026

Esta matriz descreve o que foi observado em sondas isoladas. **Ainda não existe teste de aceitação de uma história executada pelo board com filhos nativos.** As quatro provas estão definidas em `teste_modos/PLANO.md`.

| Ferramenta e modo | P1 Delegação | P2 Escopo por filho | P3 Observação | P4 Retomada | Decisão para a extensão |
| --- | --- | --- | --- | --- | --- |
| Kimi 2.4.1 CLI | Sim | Ferramentas, MCP e invocação de skill controlados pelo perfil; leitura arbitrária de arquivos ainda é possível | Sim, stream e logs por filho | Pendente com novo turno | Candidato a piloto, após P4 e teste real pelo board |
| Kimi 2.4.1 ACP | Sim | Mesmos controles de ferramenta; MCP enviado no `session/new` | Tool calls no ACP e consumo por filho no `wire.jsonl` | `session/load` reabriu e reproduziu histórico sem chamada ao modelo; novo turno pendente | Candidato a piloto, com adaptador e prova de recuperação |
| Codex 0.163.0 CLI | Sim | Falhou: leitor escreveu e acessou MCP em teste real | Sim | Pendente | Não habilitar filhos com escopo de card individual |
| Codex ACP 2.2.2 | Sim | Falhou: leitor escreveu e acessou MCP | Ciclo do filho observado no pai; negociação nativa de sessões filhas ainda pendente | `session/load` reabriu sem novo turno; restrições após retomada pendentes | Não habilitar filhos com escopo de card individual |
| Antigravity CLI 1.4.5 | Sim | Ferramentas e MCP por perfil observados; `run_command` também alcança executável local de MCP | Sim | Pendente | Requer controle de processo e P4 |
| Antigravity ACP | Início observado | Resultado assíncrono pode chegar depois do fim do turno pai | Parcial | Rodada 2 ainda sem conclusão documentada | Aguardar prova de coleta e retomada |
| Cursor CLI/ACP | Não avaliado | Não avaliado | Não avaliado | Não avaliado | Cota de Agent interrompeu no primeiro turno |
| Claude CLI | Já havia fixture e documentação | Controles descritos pela documentação; teste atualizado de todos os campos pendente | Fixture mostra filho | Documentado; reteste atual pendente | Manter como candidato, sem extrapolar a evidência antiga |

## Evidência recuperada

- `fase1-cli-kimi.md` e `fase2-acp-kimi.md` registram as rodadas Kimi 2.4.1. Os logs brutos ficam em `../sandbox/kimi/`; o arquivo `acp1.log` mostra os eventos de delegação. A primeira falha de descoberta ocorreu porque o sandbox não tinha raiz Git; após `git init`, os perfis foram encontrados.
- `fase1-cli-codex.md` e `fase2-acp-codex.md` registram a falha de escopo. Os arquivos `resultado-leitor.txt` e `resultado-leitor-acp.txt` são prova material da escrita do leitor; os logs mostram o acesso ao MCP.
- `fase1-cli-antigravity.md` e `fase2-acp-antigravity.md` registram a diferença entre CLI e ACP. A rodada ACP 2 ainda consta como em andamento; não há conclusão registrada.
- `fase1-cli-cursor.md` e `fase2-acp-cursor.md` registram erro explícito de limite antes de executar o cenário.
- `fase1-cli-claude.md` é consolidação de fixture e documentação, não uma rodada nova com a versão instalada.

## Teste de retomada sem gastar tokens

O cliente `../acp/client.mjs` ganhou `--load-only` e passou a preservar o ID solicitado quando `session/load` não o repete na resposta. O Kimi reabriu `session_247e43d5-a967-4d85-9deb-7e20a54a1e54`: a resposta trouxe `configOptions` de modelo `kimi-code/k3`, pensamento `high` e modo `default`; o fluxo reproduziu eventos anteriores. Log: `../sandbox/kimi/acp-resume-load-only.log`. O Codex também aceitou o ID de sessão usado na sonda anterior e devolveu opções em `../sandbox/codex/acp-resume-load-only.log`. Isso prova carga da sessão, **não** preservação de restrições em nova delegação.

## O que falta para decidir o padrão

1. Repetir P4 com novo turno e filho, comparando modelo efetivo, ferramentas, MCP, skill e resultado após a retomada. A cota do Kimi impediu esse turno em 02/11.
2. Completar negociação bilateral das sessões filhas no Codex ACP e confirmar identidade/atribuição em eventos. Mesmo que passe, P2 continua falhando até existir isolamento real por filho ou o board impor outro desenho.
3. Exercitar negação de permissão, cancelamento de trabalho do filho, limite de consumo e recuperação. Uma sonda anterior de Codex enviou `session/cancel`, mas o processo do filho continuou e criou `depois.txt` 25 segundos depois; não assumir cancelamento seguro.
4. Validar o modo API **do produto** separadamente. O script `../api/teste-api.mjs` demonstra um laço próprio para APIs de provedores, mas não prova que a extensão oferece esses modos. Na versão inspecionada, o driver API do board é Gemini.
5. Executar uma história real pelo board com as subtarefas como filhos, checagens, revisão independente, reinício e métricas. Só isso comprova o objetivo de produto e autoriza promover o híbrido ao padrão.

Os resultados positivos do Kimi provam escolha de ferramentas declaradas. Como um filho com `Bash` pode chamar diretamente um executável instalado, o board precisa tratar permissão de comando e acesso ao servidor MCP como uma mesma fronteira. Uma skill ser acessível como arquivo também não equivale a injeção autorizada de skill no contexto.
