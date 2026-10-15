#!/usr/bin/env bash
# Teste e2e do Faz AI com o Kimi Code, numa máquina "recém-instalada" (contêiner Ubuntu sem git, gh,
# uv nem a CLI kimi). O board roda pelo src/cli; os links (login) abrem no navegador do computador.
#
#   npm run e2e:kimi               do zero: contêiner novo, com o board da branch atual
#   npm run e2e:kimi -- continuar  o mesmo contêiner (login e o que foi instalado ficam), com o board atualizado
#   npm run e2e:kimi -- parar      para o contêiner
#   npm run e2e:kimi -- remover    apaga o contêiner, a imagem e o cache
#
# O board abre em http://localhost:7878 (FAZAI_E2E_PORTA troca a porta). A CLI kimi é instalada
# dentro do contêiner pelo roteiro (scripts/e2e-kimi/ROTEIRO.md). Precisa de Docker sem sudo.
set -euo pipefail

ACAO=${1:-novo}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
DIR="$REPO/scripts/e2e-kimi"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/faz-ai-e2e"
NOME=faz-ai-e2e-kimi
PORTA=${FAZAI_E2E_PORTA:-7878}

command -v docker >/dev/null 2>&1 || {
  echo "Docker não encontrado: instale o Docker (sem sudo) e tente de novo." >&2
  exit 1
}

# abre um link no navegador do computador
abrir() { if [ "$(uname -s)" = Darwin ]; then open "$1"; else xdg-open "$1"; fi; }

rodando() { [ "$(docker inspect -f '{{.State.Running}}' "$NOME" 2>/dev/null)" = true ]; }

# a porta com que o contêiner foi criado (o "continuar" mantém a publicação dele)
porta_do_conteiner() { docker inspect -f '{{index .Config.Labels "faz-ai.porta"}}' "$NOME" 2>/dev/null; }

pacote() {
  echo "Gerando o board da branch $(git -C "$REPO" branch --show-current)…"
  local log; log=$(mktemp)
  if ! (cd "$REPO" && npm run build) >"$log" 2>&1; then
    cat "$log" >&2
    rm -f "$log"
    echo "Falhou ao gerar o board (saída acima)." >&2
    exit 1
  fi
  rm -f "$log"
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
        case "$url" in http://* | https://*) abrir "$url" >/dev/null 2>&1 || true ;; esac
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
  docker rm -f "$NOME" >/dev/null 2>&1 || true
  mkdir -p "$CACHE/links"
  # sem --network host (o Docker do macOS não o tem por padrão): só a porta do board sai, e só para este computador
  docker run -d --name "$NOME" --label "faz-ai.porta=$PORTA" \
    -p "127.0.0.1:$PORTA:$PORTA" -e "FAZAI_E2E_PORTA=$PORTA" \
    -v "$REPO/dist":/opt/faz-ai/dist:ro \
    -v "$REPO/media":/opt/faz-ai/media:ro \
    -v "$CACHE/links":/opt/links \
    "$NOME" >/dev/null
}

# espera o board dizer o endereço (com o token) e o abre no navegador do computador
board() {
  local porta="$1" url=""
  for _ in $(seq 60); do
    url=$(docker logs "$NOME" 2>&1 | grep -o "http://[^ ]*[?&]t=[^ ]*" | tail -n 1 || true)
    [ -n "$url" ] && break
    rodando || break
    sleep 1
  done
  if [ -z "$url" ]; then
    docker logs "$NOME" >&2 || true
    echo "O board não respondeu em 60 s (saída acima)." >&2
    exit 1
  fi
  # dentro do contêiner o host é 127.0.0.1; no computador, localhost:<porta> (o mesmo Host aceito)
  url=$(printf '%s' "$url" | sed -E "s#^http://[^/]+#http://localhost:$porta#")
  abrir "$url" >/dev/null 2>&1 || true
  echo "O board está em $url"
}

case "$ACAO" in
  novo)
    pacote
    imagem
    criar
    vigiar_links
    board "$PORTA"
    echo "Pronto. Próximo passo: scripts/e2e-kimi/ROTEIRO.md (docker exec -it $NOME bash para instalar a kimi)."
    ;;
  continuar)
    pacote
    if docker inspect "$NOME" >/dev/null 2>&1; then
      # o board é reiniciado na subida (start-board): lê o dist/ novo
      docker restart "$NOME" >/dev/null
      vigiar_links
      board "$(porta_do_conteiner)"
      echo "Pronto: o mesmo contêiner, com o board atualizado."
    else
      imagem
      criar
      vigiar_links
      board "$PORTA"
      echo "Não havia contêiner: criei um novo."
    fi
    ;;
  parar)
    docker stop "$NOME" >/dev/null 2>&1 || true
    echo "Contêiner parado. Para voltar: npm run e2e:kimi -- continuar"
    ;;
  remover)
    docker rm -f "$NOME" >/dev/null 2>&1 || true
    docker rmi "$NOME" >/dev/null 2>&1 || true
    rm -rf "$CACHE/links"
    rmdir "$CACHE" 2>/dev/null || true
    echo "Contêiner, imagem e cache apagados."
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
