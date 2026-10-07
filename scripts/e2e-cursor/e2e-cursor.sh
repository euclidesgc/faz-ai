#!/usr/bin/env bash
# Teste e2e do Faz AI no Cursor, numa máquina "recém-instalada" (contêiner Ubuntu sem Node, git,
# gh, uv, Code Review Graph nem a CLI do Cursor). A janela do Cursor abre na tela do computador e
# os links abrem no navegador dele.
#
#   npm run e2e:cursor               do zero: contêiner novo, com a extensão da branch atual
#   npm run e2e:cursor -- continuar  o mesmo contêiner (logins e o que foi instalado ficam), com a extensão atualizada
#   npm run e2e:cursor -- parar      fecha o Cursor e para o contêiner
#   npm run e2e:cursor -- remover    apaga o contêiner, a imagem e o cache
#
# Precisa de Docker sem sudo, de uma sessão Wayland e do Cursor instalado em /usr/share/cursor.
set -euo pipefail

ACAO=${1:-novo}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
DIR="$REPO/scripts/e2e-cursor"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/faz-ai-e2e"
NOME=faz-ai-e2e-cursor
WAYLAND="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/${WAYLAND_DISPLAY:-wayland-0}"

rodando() { [ "$(docker inspect -f '{{.State.Running}}' "$NOME" 2>/dev/null)" = true ]; }

pacote() {
  echo "Empacotando a extensão da branch $(git -C "$REPO" branch --show-current)…"
  mkdir -p "$CACHE/ext"
  (cd "$REPO" && npm run build >/dev/null && npx vsce package -o "$CACHE/ext/faz-ai.vsix" >/dev/null)
}

imagem() {
  echo "Preparando a imagem (só na primeira vez demora)…"
  docker build -q -t "$NOME" "$DIR" >/dev/null
}

# Abre no navegador do computador os links que o contêiner deixa na fila, enquanto ele estiver de
# pé; sai sozinho quando o contêiner para.
links() {
  local fila="$CACHE/links/fila" lidas=0 total
  while rodando; do
    total=$(wc -l <"$fila")
    if [ "$total" -gt "$lidas" ]; then
      sed -n "$((lidas + 1)),${total}p" "$fila" | while read -r url; do
        case "$url" in http://* | https://*) xdg-open "$url" >/dev/null 2>&1 || true ;; esac
      done
      lidas=$total
    fi
    sleep 1
  done
}

vigiar_links() {
  mkdir -p "$CACHE/links"
  : >"$CACHE/links/fila"
  links </dev/null >/dev/null 2>&1 &
  disown
}

criar() {
  [ -S "$WAYLAND" ] || {
    echo "Sessão Wayland não encontrada em $WAYLAND." >&2
    exit 1
  }
  docker rm -f "$NOME" >/dev/null 2>&1 || true
  mkdir -p "$CACHE/links"
  docker run -d --name "$NOME" --network host --shm-size 1g --device /dev/dri \
    --group-add "$(getent group render | cut -d: -f3)" --group-add "$(getent group video | cut -d: -f3)" \
    -v /usr/share/cursor:/usr/share/cursor:ro \
    -v "$WAYLAND":/tmp/runtime/wayland-0 \
    -v "$CACHE/ext":/opt/faz-ai:ro \
    -v "$CACHE/links":/opt/links \
    "$NOME" >/dev/null
}

case "$ACAO" in
  novo)
    pacote
    imagem
    criar
    vigiar_links
    echo "Pronto: o Cursor do contêiner abre numa janela em alguns segundos, no projeto meu-app."
    ;;
  continuar)
    pacote
    if docker inspect "$NOME" >/dev/null 2>&1; then
      # a extensão é reinstalada na subida (start-cursor): para trocar, o Cursor fecha e abre de novo
      docker restart "$NOME" >/dev/null
      vigiar_links
      echo "Pronto: o mesmo contêiner, com a extensão atualizada."
    else
      imagem
      criar
      vigiar_links
      echo "Não havia contêiner: criei um novo."
    fi
    ;;
  parar)
    docker stop "$NOME" >/dev/null 2>&1 || true
    echo "Contêiner parado. Para voltar: npm run e2e:cursor -- continuar"
    ;;
  remover)
    docker rm -f "$NOME" >/dev/null 2>&1 || true
    docker rmi "$NOME" >/dev/null 2>&1 || true
    rm -rf "$CACHE"
    echo "Contêiner, imagem e cache apagados."
    ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
