# Exportação em CSV

`exportCsv(tasks)` (em `src/export.js`) devolve um texto com o cabeçalho `id,titulo,concluida` e uma linha por
tarefa. As células com vírgula, aspas ou quebra de linha vão entre aspas, e as aspas internas são dobradas.
O arquivo termina com uma quebra de linha.
