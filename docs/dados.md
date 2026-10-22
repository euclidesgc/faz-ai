🇧🇷 Português · [🇺🇸 English](dados_EN.md)

# Onde ficam os dados, backup e board no navegador

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório. Cada pasta tem o seu
arquivo de banco (`boards/<chave da pasta>.db`), então janelas em projetos diferentes não
interferem uma na outra. Na primeira vez, o board parte de uma cópia do banco único das versões
anteriores (`fazai.db`), que fica intacto. Regras e skills são arquivos da pasta do projeto e
entram no git normalmente. Agentes, skills, regras e definições MCP ficam guardados no banco do
board (as credenciais das definições MCP ficam no cofre local); a pasta da biblioteca guarda uma
cópia legível, e cada execução grava um snapshot próprio em `run-artifacts/`. Evite abrir a mesma
pasta em duas janelas do editor ao mesmo tempo: a última a salvar vence (a extensão avisa quando
isso acontece).

**Atualizar a extensão atualiza o banco.** Ao abrir o board, a extensão aplica sozinha, em ordem,
as mudanças de formato que faltam no banco, cada uma numa transação: se uma falhar, o banco fica
como estava. Vale para qualquer versão de origem, em qualquer máquina. O caminho inverso não existe:
uma versão anterior da extensão (por exemplo, depois de testar uma versão nova, a loja voltar para a
de antes) recusa abrir um board gravado por uma versão mais nova, sem tocar nele, e pede para
atualizar a extensão. Se o banco recusar alguma gravação ao abrir, o erro completo, com o comando
que falhou, fica em **Saída → Faz AI**.

## Backup do board

Para levar o board a outra máquina ou guardar uma cópia:

**No editor (VS Code ou Cursor):** use a paleta de comandos (`Ctrl+Shift+P`):

- **Faz AI: Exportar o board** abre o diálogo nativo de salvamento com o nome sugerido no padrão
  `<nome do board>-<data>.fazai.json`. Gera um arquivo com tudo o que está no board: colunas, tipos,
  campos, regras, modelos, agentes, cards (inclusive arquivados e na lixeira), conversas, checklists,
  vínculos, histórico e os anexos embutidos. Só o board da pasta atual sai no arquivo. Ele contém as
  conversas e os anexos: guarde-o com cuidado. Ao terminar, a extensão mostra a notificação "Board
  exportado em …" com o botão **Abrir pasta**.
- **Faz AI: Importar um board** abre o diálogo nativo de abertura de arquivo. Ao escolher um arquivo,
  mostra um resumo modal (nome do board, quantidade de cards e anexos, tamanho, versão) com aviso de
  que o board atual será substituído e que uma cópia de segurança (`.bak`) é feita antes. Ao
  confirmar, substitui o board e mostra a notificação com o resultado da importação.

Os comandos funcionam com o board fechado (sem o painel aberto): eles abrem o banco da pasta atual
do workspace sob demanda. Em um workspace com várias pastas, os comandos usam a primeira pasta
(mesma limitação já existente na extensão); não há seletor de pasta.

**Pela tela do board** (no editor ou no modo navegador, rodando `~/.faz-ai/bin/faz-ai` no
terminal): use **Configurações → Backup**:

- **Exportar board** gera um arquivo `.fazai.json` no seu computador (download).
- **Importar de um arquivo…** abre o seletor nativo da página.

**Em todos os caminhos,** o arquivo importado:

- Mostra um resumo (nome, cards, anexos, tamanho, versão) e, depois da confirmação, grava uma cópia
  do banco (`<arquivo>.bak`, ao lado dele ou na pasta de dados), move os anexos do board atual para
  uma pasta de backup (`<anexos>.bak-<data>`), apaga o board atual e o substitui pelo do arquivo, com
  os mesmos números de card. O board importado passa a ser o desta pasta. Nada muda no banco se o
  arquivo for inválido ou se algo falhar no meio. A confirmação diz que os anexos foram para backup.
- Um arquivo exportado por uma versão anterior da extensão é atualizado ao ser importado; um arquivo
  de versão mais nova é recusado com a versão necessária. Importar com a IA executando um card não é
  permitido: espere a execução terminar. Arquivo de importação com id de card ou nome de anexo
  contendo caminho (`../`) é recusado.

Limites conhecidos: o histórico mensal consolidado do log não vai no arquivo, e as branches e pastas
de trabalho das histórias são importadas como estavam na máquina de origem (recrie a pasta pelo botão
do card).

## Board no navegador, fora do editor

O board não depende da janela do editor:

- **Abrir no navegador** (no topo do board, ou o comando **Faz AI: Abrir board no navegador**)
  abre o mesmo board numa aba do navegador. O editor continua aberto e é ele que guarda o board;
  as duas telas ficam sincronizadas.
- **Sem o editor**: rode `~/.faz-ai/bin/faz-ai` na pasta do projeto (ou `faz-ai <pasta>`). O
  comando serve o board no navegador, com o servidor MCP, a execução da IA e o heartbeat, e fica
  rodando até você encerrar com Ctrl+C. O atalho é criado pela extensão e usa os mesmos dados dela;
  precisa do Node.js no PATH. Para chamar só `faz-ai`, ponha `~/.faz-ai/bin` no PATH.
  `faz-ai --help` lista as opções (`--port`, `--data`, `--no-open`).

A página só responde em `127.0.0.1` e exige o segredo que vem no link aberto pelo editor ou pelo
terminal (ele fica guardado num cookie, então o endereço pode ir para os favoritos). O tema
"Sistema" acompanha o claro ou escuro do VS Code no editor e o do sistema operacional no navegador,
sempre com as cores do próprio board. No navegador, os filtros abrem na própria barra do board. Um
board é servido por um lugar de cada vez: com o editor aberto na pasta, use **Abrir no navegador**;
o `faz-ai` do terminal avisa e não inicia.
