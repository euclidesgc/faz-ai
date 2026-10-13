#!/usr/bin/env bash
# Teste e2e do Faz AI no Cursor, numa máquina "recém-instalada" (contêiner Ubuntu sem Node, git,
# gh, uv, Code Review Graph nem a CLI do Cursor). Os links abrem no navegador do computador.
#
#   npm run e2e:cursor               do zero: contêiner novo, com a extensão da branch atual
#   npm run e2e:cursor -- continuar  o mesmo contêiner (logins e o que foi instalado ficam), com a extensão atualizada
#   npm run e2e:cursor -- parar      fecha o Cursor e para o contêiner
#   npm run e2e:cursor -- remover    apaga o contêiner, a imagem e o cache
#
# Precisa de Docker sem sudo. Num Linux com sessão Wayland e o Cursor em /usr/share/cursor, a janela
# do Cursor abre na tela do computador (modo wayland). No macOS, ou sem Wayland, o Cursor vem na
# imagem e a tela dele abre no navegador, em http://localhost:6080 (modo novnc). FAZAI_E2E_MODO=novnc
# força o segundo.
set -euo pipefail

ACAO=${1:-novo}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
DIR="$REPO/scripts/e2e-cursor"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/faz-ai-e2e"
NOME=faz-ai-e2e-cursor
WAYLAND="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/${WAYLAND_DISPLAY:-wayland-0}"
NOVNC="http://localhost:6080/vnc.html?autoconnect=1&resize=scale"
if [ -n "${FAZAI_E2E_MODO:-}" ]; then
  MODO=$FAZAI_E2E_MODO
elif [ "$(uname -s)" = Linux ] && [ -S "$WAYLAND" ]; then
  MODO=wayland
else
  MODO=novnc
fi

# abre um link no navegador do computador
abrir() { if [ "$(uname -s)" = Darwin ]; then open "$1"; else xdg-open "$1"; fi; }

rodando() { [ "$(docker inspect -f '{{.State.Running}}' "$NOME" 2>/dev/null)" = true ]; }

pacote() {
  echo "Gerando a extensão da branch $(git -C "$REPO" branch --show-current)…"
  mkdir -p "$CACHE/ext"
  local log; log=$(mktemp)
  if ! (cd "$REPO" && npm run build && npx vsce package -o "$CACHE/ext/faz-ai.vsix") >"$log" 2>&1; then
    cat "$log" >&2
    rm -f "$log"
    echo "Falhou ao gerar a extensão (saída acima)." >&2
    exit 1
  fi
  rm -f "$log"
}

imagem() {
  echo "Preparando a imagem (só na primeira vez demora)…"
  docker build -q -t "$NOME" "$DIR" >/dev/null
  # no modo novnc, por cima dela: o Cursor do site oficial e a tela virtual
  if [ "$MODO" = novnc ]; then docker build -q -t "$NOME-novnc" -f "$DIR/Dockerfile.novnc" "$DIR" >/dev/null; fi
}

# Abre no navegador do computador os links que o contêiner deixa na fila, enquanto ele estiver de
# pé; sai sozinho quando o contêiner para.
links() {
  local fila="$CACHE/links/fila" lidas=0 total
  while rodando; do
    total=$(wc -l <"$fila")
    if [ "$total" -gt "$lidas" ]; then
      sed -n "$((lidas + 1)),${total}p" "$fila" | while read -r url; do
        case "$url" in http://* | https://*) abrir "$url" >/dev/null 2>&1 || true ;; esac
      done
      lidas=$total
    fi
    sleep 1
  done
}

# no modo novnc, abre a tela do Cursor no navegador assim que o noVNC responde
tela() {
  [ "$MODO" = novnc ] || return 0
  for _ in $(seq 60); do
    curl -fsS -o /dev/null http://localhost:6080/vnc.html 2>/dev/null && break
    sleep 1
  done
  abrir "$NOVNC" >/dev/null 2>&1 || true
  echo "A tela do Cursor está em $NOVNC"
}

vigiar_links() {
  mkdir -p "$CACHE/links"
  : >"$CACHE/links/fila"
  links </dev/null >/dev/null 2>&1 &
  disown
}

criar() {
  if [ "$MODO" = novnc ]; then
    docker rm -f "$NOME" >/dev/null 2>&1 || true
    mkdir -p "$CACHE/links"
    # sem --network host (o Docker do macOS não o tem por padrão): só a tela sai, e só para este computador
    docker run -d --name "$NOME" --shm-size 1g -p 127.0.0.1:6080:6080 \
      -v "$CACHE/ext":/opt/faz-ai:ro \
      -v "$CACHE/links":/opt/links \
      "$NOME-novnc" >/dev/null
    return
  fi
  [ -S "$WAYLAND" ] || {
    echo "Sessão Wayland não encontrada em $WAYLAND." >&2
    exit 1
  }
  docker rm -f "$NOME" >/dev/null 2>&1 || true
  mkdir -p "$CACHE/links"
  local gids; gids="$(getent group render | cut -d: -f3) $(getent group video | cut -d: -f3)"
  docker run -d --name "$NOME" --network host --shm-size 1g --device /dev/dri \
    --group-add "$(getent group render | cut -d: -f3)" --group-add "$(getent group video | cut -d: -f3)" \
    -e FAZAI_HOST_GIDS="$gids" \
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
    if [ "$MODO" = novnc ]; then
      tela
      echo "Pronto: o Cursor do contêiner abre nessa aba em alguns segundos, no projeto meu-app."
    else
      echo "Pronto: o Cursor do contêiner abre numa janela em alguns segundos, no projeto meu-app."
    fi
    ;;
  continuar)
    pacote
    if docker inspect "$NOME" >/dev/null 2>&1; then
      # a extensão é reinstalada na subida (start-cursor): para trocar, o Cursor fecha e abre de novo
      docker restart "$NOME" >/dev/null
      vigiar_links
      tela
      echo "Pronto: o mesmo contêiner, com a extensão atualizada."
    else
      imagem
      criar
      vigiar_links
      tela
      echo "Não havia contêiner: criei um novo."
    fi
    ;;
  parar)
    docker stop "$NOME" >/dev/null 2>&1 || true
    echo "Contêiner parado. Para voltar: npm run e2e:cursor -- continuar"
    ;;
  remover)
    docker rm -f "$NOME" >/dev/null 2>&1 || true
    docker rmi "$NOME-novnc" "$NOME" >/dev/null 2>&1 || true
    rm -rf "$CACHE"
    echo "Contêiner, imagem e cache apagados."
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
