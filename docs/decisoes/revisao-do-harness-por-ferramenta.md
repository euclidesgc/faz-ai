# Revisão do Harness: organização por ferramenta e banco de artefatos do board

> **Atualização (#615):** a decisão "o board referencia, não copia" foi substituída. O board agora guarda a própria cópia dos artefatos no banco dele, e as execuções usam só essa cópia, com um snapshot por execução. Atualizar a partir da origem é uma ação explícita da pessoa.

## Vocabulário

- **Artefato**: qualquer componente do harness de uma ferramenta de IA: regra, skill, sub-agente,
  servidor MCP, comando ou prompt, hook e o que mais a ferramenta tiver.
- **Fonte do artefato**: onde ele está instalado. Há três níveis:
  - **Global**: na máquina da pessoa (ex.: `~/.claude/`).
  - **Projeto**: no repositório (ex.: `.claude/`, `.cursor/`).
  - **Importados**: artefatos encontrados em pastas que a pessoa indicou, fora do projeto e da
    pasta global (ver "Importar artefatos" no item 2).
  - **Board**: o subconjunto de artefatos globais, de projeto e importados que a pessoa escolheu
    disponibilizar para os cards deste board.

## 1. Organização da tela

**Nível 1: uma aba por ferramenta.** Nesta revisão, só Claude Code e Cursor; a estrutura fica
pronta para Codex, Kimi e outras, mas elas não entram agora.

**Nível 2: dentro de cada ferramenta, uma aba por assunto**, nesta ordem de prioridade:

1. Regras (regras principais e regras por assunto na mesma aba, quando a ferramenta tiver as duas).
2. Skills.
3. Sub-agentes.
4. MCPs.
5. Comandos ou prompts.
6. Hooks.
7. Demais particularidades da ferramenta.

Cada ferramenta expõe só as abas que fazem sentido para ela: o Claude tem assuntos que o Cursor não
tem, e novas ferramentas seguirão o mesmo padrão com suas próprias particularidades.

**Escopo**: dentro de cada aba de assunto, separar Projeto e Global quando a ferramenta distinguir
os dois, mais a aba Importados quando houver pasta importada, organizada da mesma forma.

> **Adendo de 2026-10-14: o escopo sobe para antes do assunto.** Usando a tela, a pergunta que a
> pessoa faz é "o que está no board?" ou "o que há no projeto?", e não "quais skills existem em todo
> lugar?". Com o escopo dentro de cada assunto, trocar de assunto voltava o seletor para Projeto e a
> busca para vazio, e para ver o Board inteiro era preciso escolher Board sete vezes. A ordem passa a
> ser **ferramenta → escopo → assunto**: o seletor (Board, Projeto, Global, Importados) e a busca
> ficam uma vez só, acima das abas de assunto, e valem para todas elas. As abas de assunto não
> mudam: mesma lista e mesma ordem do nível 2 acima, em todos os escopos; no Board, os assuntos sem
> marcação (Comandos, Hooks, Demais) dizem que não entram no board. O título de cada aba passa a
> contar o que há naquele escopo ("3 no board" no Board; o número de artefatos no catálogo). Os
> atalhos de outras telas levam ao escopo certo: a pendência "nenhum agente do board" cai em Board →
> Sub-agentes; os de Projeto e Global, no escopo de cada um.

**Motivação**: a tela atual está pesada e lenta. A organização em abas deve carregar e renderizar
só o que está visível, economizando memória e deixando a leitura rápida.

## 2. Objetivo da área: banco de artefatos do board

- Cada aba de assunto lista **todos** os artefatos daquele tipo encontrados nas fontes Global e
  Projeto da ferramenta. Essa listagem é um catálogo: existir no catálogo não ocupa espaço na janela
  de contexto da IA.
- **Busca**: um campo que filtra por parte do nome ou da descrição, porque o ambiente pode ter
  muitos artefatos.
- **Seleção múltipla**: marcar vários artefatos e aplicar uma ação em massa: enviar para o board,
  remover do board, ou definir o modo (ver abaixo).
- **Enviar para o board**: a pessoa seleciona, das fontes Global, Projeto e Importados, quais
  artefatos o board pode usar. O artefato passa a aparecer na aba Board daquele assunto. Vale para
  skills, sub-agentes, MCPs e qualquer tipo que faça sentido levar para o board.
- **O board referencia, não copia**: o board guarda o caminho de origem do artefato e lê o arquivo
  na hora de usar. Assim, uma atualização na fonte (Global, Projeto ou pasta importada) vale no board
  sem retrabalho. Uma origem movida ou apagada deixa o artefato marcado como ausente no board, sem
  quebrar o card que o lista.
- **Comportamento no board**: na aba Board, a pessoa define como cada artefato se comporta. Só
  artefatos que estão no board podem ser atribuídos a um card.

### Modo da skill no board

Cada skill do board tem um de dois modos:

- **Pelo card** (padrão): a skill não entra no contexto sozinha. Ela só é carregada quando um card
  a lista nas skills da tarefa.
- **Sempre**: a skill entra em toda interação com a IA neste board, independente do card. É o caso
  da skill do fluxo do Faz AI, que conduz o board e precisa estar em todas as iterações.

Os modos nativos da ferramenta (automática pela descrição do frontmatter, ou só quando invocada
explicitamente) **não se aplicam ao board**. Ao entrar no board, a skill passa a seguir um dos dois
modos acima; o board garante que a ferramenta não a carregue por conta própria.

O modo é um atributo genérico do artefato no board, mas "Sempre" é exposto só em skills e MCPs por
enquanto (o servidor MCP do Faz AI precisa estar sempre ligado). Para sub-agentes não há uso
previsto.

## 3. Padrão: tudo desligado, o planejamento escolhe

- Hoje a maioria das skills é auto-invocada pela descrição do frontmatter. Com este fluxo, **os
  artefatos do board ficam em "Pelo card" por padrão**: não entram no contexto sozinhos. Só o que
  estiver marcado como "Sempre" é carregado em toda interação.
- **Regras também entram desligadas.** Ao enviar uma regra (CLAUDE.md, regras por assunto, regras
  do Cursor) para o board, ela fica desligada até a pessoa ativá-la. A tela convida a revisar o texto
  antes de ativar, porque regras escritas para outro contexto podem conflitar com o fluxo e as
  definições do board (fases, aprovação, uso do MCP). Regra ativa entra em toda interação, como uma
  skill em modo "Sempre".
- Na fase de **planejamento**, a IA define no card quais skills, sub-agentes e MCPs a tarefa
  precisa, escolhendo só entre os artefatos do board em modo "Pelo card". O plano estipula de
  antemão todos os recursos necessários, o que dá mais precisão e economia na execução.
- **O card mostra tudo que será usado**: além do que a IA escolheu, o card exibe os artefatos em
  modo "Sempre" (skills e MCPs), marcados como tal. A pessoa não precisa indicá-los, mas vê o custo
  completo da execução e pode decidir melhor se mantém ou não um artefato sempre ligado.
- **Minimalismo obrigatório**: no máximo uma skill por assunto em cada card, sempre a mais próxima
  do objetivo da tarefa. O card pode ter mais de uma skill, desde que sejam de assuntos diferentes
  e cada uma faça sentido para a tarefa: uma de navegação e outra de acesso a dados e SQL, por
  exemplo. O que não pode é duas skills do mesmo assunto. Excesso de skills produz o efeito
  contrário ao desejado.
- O mesmo vale para histórias e sub-tarefas: cada uma recebe só o que a sua execução pede.

### Importar artefatos de outras pastas

Nem todo artefato útil está no projeto ou na pasta global: pode estar em outro repositório, numa
coleção compartilhada pela equipe ou numa pasta baixada. Cada ferramenta tem um botão **"Importar
artefatos"** que abre o seletor de pasta. O board faz uma varredura na pasta escolhida atrás de
artefatos compatíveis com a ferramenta em questão (no Claude Code, por exemplo: skills, agentes,
comandos, hooks e configuração de MCP no formato que a CLI reconhece) e passa a exibi-los numa aba
**"Importados"**, ao lado de Projeto e Global, organizada da mesma forma: por assunto, com busca,
seleção múltipla e "Indicar artefatos".

- A pessoa escolhe quais dos importados vão para o board; nada entra sem seleção.
- O board guarda as pastas importadas e refaz a varredura ao abrir, para a aba refletir o que está
  lá. Uma pasta pode ser removida da lista.
- Como o board referencia a origem, uma pasta movida ou apagada deixa os artefatos dela marcados
  como ausentes no board, sem quebrar os cards que os listam.

### Assistência na seleção: botão "Indicar artefatos"

Como o ambiente pode ter muitas skills, agentes e MCPs, cada aba de assunto tem um botão
**"Indicar artefatos"**. Ao clicar, a IA analisa o projeto (stack, estrutura, CLAUDE.md, dependências)
e o catálogo daquela aba, e **deixa pré-selecionados** os artefatos que fazem mais sentido para o
projeto. A pessoa decide: envia todos para o board de uma vez ou desmarca alguns antes. A IA só
sugere; nada entra no board sem a confirmação da pessoa.

### "Refinar com IA" continua, mas só vê o board

O botão "Refinar com IA" do card continua funcionando: ele escolhe o agente, as skills e os MCPs do
card. A diferença é que ele **busca apenas entre os artefatos do board**, nunca no catálogo Global ou
Projeto. Se o artefato certo não está no board, o refinamento não o encontra; a pessoa precisa
enviá-lo ao board antes. Vale também para o planejamento feito pela IA na fase (item 3): a mesma
restrição.

### Sub-agentes: editor por ferramenta e assistente de criação

O editor de agentes de hoje tem os campos certos (descrição de uma frase, instruções, modelo e
esforço, ferramentas disponíveis e negadas, servidores MCP, skills), mas as ferramentas são um campo
de texto livre e as opções não variam por ferramenta. A revisão muda isso em duas frentes.

**Editor por ferramenta.** Cada ferramenta tem seu formato de agente e sua lista de ferramentas
nativas (o Claude Code tem Read, Edit, Bash, WebFetch, Agent etc.; o Cursor tem outras). O editor
mostra só o que a ferramenta em questão aceita, como lista de opções marcáveis, nunca texto livre.
Um agente criado para o Claude Code não aparece na aba do Cursor. Antes de definir a lista de cada
ferramenta, ler a documentação oficial atual.

**Assistente de criação ("Criar agente com ajuda").** Um fluxo guiado, pergunta a pergunta, para
produzir agentes de escopo reduzido: quanto menos ferramentas e contexto, mais econômico e preciso.
A cada pergunta o assistente dá um exemplo de resposta e sugestões, mas lista todas as opções para a
pessoa escolher.

1. **Para que o agente existe.** Pergunta a diretriz: o papel e o objetivo. Exemplo de resposta:
   "Revisa o diff de uma branch antes do pull request e aponta bugs, sem alterar nada."
2. **Ferramentas.** A partir do objetivo, sugere o conjunto mínimo (no exemplo: Read, Grep, Glob e
   Bash só para `git diff`), explica por que cada uma entra, e mostra a lista completa da ferramenta
   para marcar ou desmarcar. Avisa quando uma escolha amplia o escopo (Edit, Write, Bash sem
   restrição, Agent).
3. **Servidores MCP.** Mesma lógica: só o do board por padrão; os demais do board como opções.
4. **Skills de apoio.** Entre as skills do board, sugere as ligadas ao objetivo e permite marcar
   outras. Vale a regra de uma por assunto.
5. **Modelo e esforço.** Sugere conforme o tipo de trabalho (leitura e revisão: modelo menor e
   esforço baixo; planejamento ou arquitetura: maior).
6. **Instruções.** Gera um rascunho a partir das respostas (como trabalha, padrões, o que nunca
   fazer) para a pessoa editar.
7. **Resumo e confirmação.** Mostra o agente inteiro antes de gravar. Nada é gravado sem
   confirmação.

**Sugestões prontas.** Na aba de sub-agentes, um botão "Sugerir agentes" propõe, a partir do
projeto, alguns agentes úteis já com escopo reduzido (ex.: revisor somente leitura, escritor de
testes, redator de documentação, executor de migrações). Cada sugestão abre no assistente com as
respostas preenchidas, para a pessoa ajustar e confirmar.

### Assistentes para regras e skills, nos mesmos moldes

Quem começa um projeto do zero com o board não tem regra nem skill nenhuma. Os mesmos princípios do
assistente de agentes (pergunta a pergunta, exemplo de resposta em cada uma, sugestões sem esconder
as opções, escopo mínimo, nada gravado sem confirmação) valem para dois assistentes a mais, cada um
gravando no formato da ferramenta em questão.

**Assistente de regras ("Criar regra com ajuda").**

1. **Onde a regra vale.** Regra principal (todo o projeto) ou por assunto (uma pasta, uma linguagem,
   um tipo de arquivo, conforme a ferramenta permitir). Exemplo: "Só nos arquivos de teste".
2. **O que a regra garante.** Exemplo: "Mensagens de commit em português, no imperativo, sem
   ponto final."
3. **Convenções do projeto.** O assistente lê o projeto (stack, lint, formatação, estrutura de
   pastas, comandos do package) e sugere itens para incluir; a pessoa marca os que quer.
4. **Conflito com o board.** Confere o texto contra o fluxo do board (fases, aprovação, uso do MCP) e
   aponta o que pode conflitar antes de gravar.
5. **Rascunho, resumo e confirmação.** Gera o texto, mostra inteiro, grava no arquivo e no escopo
   escolhidos. A regra entra no board desligada, como as demais.

**Assistente de skills ("Criar skill com ajuda").**

1. **Que tarefa a skill ensina.** Uma frase, que vira a descrição do frontmatter. Exemplo: "Escrever
   uma migração nova do banco, subindo a versão do schema e sem editar migração antiga."
2. **Quando a IA deve usá-la.** O gatilho: tipos de pedido ou de arquivo. Serve para a descrição e
   para a pessoa indicá-la no card com segurança.
3. **O passo a passo.** O assistente propõe os passos a partir do projeto (arquivos envolvidos,
   comandos, checagens) e a pessoa ajusta.
4. **O que a skill nunca faz.** Limites explícitos, para o escopo ficar reduzido.
5. **Arquivos de apoio.** Opcional: exemplos, modelos ou scripts que a skill referencia, no formato
   que a ferramenta aceita.
6. **Rascunho, resumo e confirmação.** Gera o arquivo no formato da ferramenta, grava no escopo
   escolhido (Projeto ou Global) e envia ao board em modo "Pelo card".

**Sugestões prontas.** Como nos agentes, um botão "Sugerir regras" e um "Sugerir skills" propõem,
a partir do projeto, itens já preenchidos para a pessoa ajustar e confirmar.

### Diagnóstico do ambiente: o harness vira uma pendência

O Diagnóstico do ambiente (tela acessível pelas Configurações e pelo aviso no topo do board) confere
hoje o que o board precisa na máquina: Node.js, a CLI da ferramenta, o login, o MCP do board, a skill
do fluxo, o nível de permissão, git, GitHub CLI e Code Review Graph. Cada item tem status pronto,
falta ou pulado, e os que são do board se resolvem por um botão.

Com esta revisão, **a definição do harness entra como item do diagnóstico**, dentro do bloco da
ferramenta do projeto, logo depois da skill do fluxo. Ele aponta o que falta para o board trabalhar
com artefatos de forma controlada:

- **Nenhum artefato no board.** Nenhuma skill, agente ou MCP foi enviado ao board: o planejamento
  dos cards não tem de onde escolher. Resolve abrindo a aba da ferramenta no Harness, com a sugestão
  de usar "Indicar artefatos".
- **Nenhum agente do board.** Sem agente, toda execução roda com o escopo cheio. Resolve abrindo o
  assistente de agentes ou "Sugerir agentes".
- **Regras do board sem revisão.** Há regras enviadas ao board ainda desligadas e nunca abertas.
  Resolve abrindo a aba de Regras para revisar e ativar ou descartar.
- **Artefato ausente.** Um artefato referenciado pelo board (ou listado num card) sumiu da origem.
  Resolve abrindo a aba correspondente, que mostra quais estão ausentes.
- **No Cursor: artefatos do projeto ligados.** Como a CLI do Cursor não desliga nada (item 4), o
  diagnóstico encontra regras, MCPs ou outros artefatos ativos no projeto e avisa que eles entram no
  contexto sem passar pelo board. Resolve a pessoa desligando ou removendo; o board só confere.

O item segue o padrão dos demais: status pronto, falta ou pulado (pulado quando a ferramenta ainda
não está instalada), hint de como o board usa, e botão ou link que leva direto ao lugar que resolve.
Entra também no aviso do topo do board, como os outros requisitos do board, mas como recomendação,
não como bloqueio: o board continua funcionando sem harness definido, só sem o ganho de economia e
precisão que esta revisão busca.

## 4. Como a CLI é chamada: o que dá para desligar em cada ferramenta

O "tudo desligado" depende do que a linha de comando de cada ferramenta permite. O custo fixo da
própria CLI (prompt de sistema e definições das ferramentas nativas) fica em qualquer caso; o que se
controla é a entrada dos artefatos.

### Claude Code

Garantido pela CLI (já é o que o runner do board faz hoje, em `src/extension/ai/providers/claude.ts`):

- Fontes de configuração vazias: sem CLAUDE.md, skills, agentes, hooks e plugins do usuário nem do
  projeto.
- Skills invocáveis desligadas em bloco.
- Servidores MCP: só o do board e os liberados pelo agente; os do usuário e do projeto ficam de fora.
- Agentes: só os que vão inline na chamada.
- Ferramentas nativas: restritas ou negadas conforme o agente.

Os artefatos do card e os em modo "Sempre" entram pelo mesmo caminho: o board injeta o arquivo no
pedido. Nada depende de a ferramenta carregar o artefato por conta própria.

### Cursor

A CLI do Cursor não oferece o mesmo controle: o runner só adiciona a pasta extra, e regras, MCPs e
demais artefatos do projeto entram conforme o Cursor decidir. Por isso, no Cursor, o "tudo desligado"
é responsabilidade da pessoa: **desligar todos os artefatos nas configurações do Cursor ou removê-los
do projeto**, para que nenhum entre no contexto das tarefas sem que ela saiba de antemão. O board
deve avisar isso na aba do Cursor e, se a CLI passar a oferecer controle equivalente, assumir a tarefa.

### Ferramentas futuras

**O foco agora é só Claude Code e Cursor.** Codex, Kimi e outras ficam fora desta revisão; a
organização em abas por ferramenta e por assunto só precisa ser extensível para elas. Quando uma
entrar, ler a documentação oficial da CLI antes de prometer o regime: classificá-la como "garantido
pela CLI" ou "responsabilidade da pessoa", e registrar aqui.

## Resumo em uma frase

O harness vira um catálogo por ferramenta e por assunto; a pessoa escolhe o que vai para o board e
marca o pouco que deve estar sempre presente; o planejamento de cada card pega, do resto, o mínimo
necessário.

## Decisões tomadas

1. **Enviar para o board referencia, não copia.** O board guarda o caminho de origem e lê o arquivo
   ao usar, para acompanhar as atualizações da fonte. Origem ausente marca o artefato como ausente.
2. **Regras entram desligadas.** A pessoa revisa e ativa cada regra, porque ela pode conflitar com o
   fluxo e as definições do board. Regra ativa vale como "Sempre".
