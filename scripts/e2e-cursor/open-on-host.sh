#!/bin/sh
# Dentro do contêiner, no lugar do xdg-open: em vez de abrir, deixa o link na fila que o
# e2e-cursor.sh lê no computador e abre no navegador de lá. Só http(s); arquivos e outros esquemas
# não saem do contêiner.
case "$1" in
  http://* | https://*) printf '%s\n' "$1" >> /opt/links/fila ;;
  *) echo "xdg-open: só links http(s) abrem no navegador do computador: $1" >&2; exit 1 ;;
esac
