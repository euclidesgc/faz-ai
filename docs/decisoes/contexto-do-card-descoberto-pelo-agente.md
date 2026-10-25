# Contexto do card descoberto pelo próprio agente

## Contexto

Um card só gasta o necessário e só segue as instruções dele quando a IA usa apenas o que o board
entrega. Até aqui, o board sabia disso de dois jeitos, nenhum deles bom para a pessoa:

- **O verificador de capacidades**, com uma API falsa e iscas. Prova o isolamento de verdade, mas só
  funciona com ferramentas que deixam trocar o endereço da API: Claude Code e Gemini CLI. O Cursor fala
  só com os servidores dele.
- **Uma lista fixa** (`BUILTIN_ISOLATION`) do que cada CLI pronta carrega. Envelhece a cada versão da
  ferramenta e não existe para um agente novo.

Na tela, isso aparecia como "regime exclusivo/compatível", "ciência" e "contexto vazio (imposto)":
quatro nomes para a mesma ideia, nenhum dizendo por que ela importa. Um agente lançado amanhã não teria
teste nenhum sem uma versão nova da extensão.

## Decisão

O board descobre e verifica o contexto em tempo de execução, com qualquer agente, usando só o que já sabe
fazer com todos: mandar um pedido e ler a resposta.

1. **Descoberta pelo agente.** O board pergunta ao agente de onde a ferramenta dele carrega contexto
   sozinha e pede a resposta em JSON. O exemplo do pedido é de uma ferramenta fictícia ("Foo"), porque,
   com nomes reais, o agente tende a copiá-los. A leitura acha o JSON no meio do raciocínio (o Kimi Code
   responde com o pensamento em volta) e limpa notas como `settings.json (hooks)`.
2. **Verificação por citação.** O board roda o agente pelo gateway como roda um card: contrato fechado,
   sem ferramentas, sem MCP e com as travas do perfil. Para cada arquivo que existe, ele escolhe uma linha
   longa ao acaso (na skill e no agente, a `description:`, que fica no contexto mesmo quando o corpo só
   carrega sob demanda), manda o começo e pede a linha inteira. O resto da linha na resposta prova que o
   arquivo chegou ao modelo. Não se plantam iscas nos arquivos da pessoa.
3. **Iscas só onde nada existe ainda.** Os locais do projeto que não existem (o `AGENTS.md` que ninguém
   criou) ganham uma isca numa pasta descartável, com um repositório git próprio. Cada isca tem um código
   no começo e outro no fim: duas iscas nunca dividem o trecho pedido nem o resto que prova a leitura.
4. **Controle.** Uma linha vai no próprio pedido. Se o agente não a citar, nenhum "fica de fora" vale.
   Ferramentas usadas durante o teste anulam a rodada inteira.
5. **O que o agente diz não é veredito.** A declaração vira a coluna "Padrão da ferramenta" (como ela
   se comporta rodando sozinha). O veredito sai só da citação: "entra sozinho", "fica de fora: só entra
   se o card incluir" ou "não testado", com o motivo.
6. **Na tela, um nome só:** contexto do card, fechado ou aberto. "Regime exclusivo/compatível" fica entre
   parênteses, onde a pessoa precisa ligar uma coisa à outra.

O resultado fica na `meta` do board (`ai_context_scopes`), fora da exportação: depende do projeto e da
máquina. Os locais que a pessoa acrescenta ficam em `ai_context_extra`, e uma nova descoberta não os
apaga. O teste roda sozinho depois de um Conectar numa versão ainda não testada.

## Alternativas descartadas

- **Manter um mapa de locais na extensão**, local ou baixado do repositório: alguém teria de atualizá-lo
  a cada agente e a cada versão. A pessoa pediu explicitamente que não houvesse índice para manter.
- **Iscas em todos os locais**, inclusive na pasta pessoal: o agente precisa da pasta pessoal verdadeira
  para entrar na conta, e o board não escreve nos arquivos de configuração da pessoa. A citação do que já
  existe dispensa as iscas.
- **Perguntar ao agente o que ele leu**, sem citação: o modelo pode alucinar a lista. A citação de um
  trecho que ele não recebeu no pedido não se adivinha.
- **Observar os arquivos que o processo abre**: no macOS e no Windows não há jeito confiável sem
  permissão de administrador, e abrir um arquivo não é o mesmo que mandá-lo ao modelo.
- **Interceptar o tráfego até o servidor da ferramenta**: frágil a cada atualização e contra os termos
  de uso.

## Consequências

- Vale para qualquer agente que o gateway roda (CLI pronta, cópia, personalizado, ACP), sem código por
  ferramenta. Conferido de verdade: o Claude Code 2.1.296 deixa tudo de fora com as travas do board; o
  Kimi Code 2.3.0 carrega sozinho o `AGENTS.md` do projeto e as descrições das skills da pasta pessoal.
- Gasta pedidos da conta da ferramenta: a descoberta e uma ou duas rodadas de citação. A pessoa
  aceitou o custo porque é a informação que explica a economia e a precisão de cada card.
- O teste informa; não muda a admissão, que continua decidida pelo regime de cada perfil. Ligar o
  resultado à admissão é outra decisão.
- A descoberta pode esquecer um local. A conferência dos arquivos de instrução do projeto e o
  "Acrescentar um local" cobrem parte disso; o resto fica "não verificado", nunca "fechado".
- Configuração, hooks e MCP não entram como texto e ficam fora da citação: continuam com o verificador
  de capacidades.
