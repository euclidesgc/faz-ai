#!/usr/bin/env bash
# Só para quem desenvolve: gera a VSIX da versão do package.json, instala no editor e recarrega a janela.
# A janela recarrega pelo link vscode://euclidesgc.faz-ai/reload, que a extensão ainda carregada (a versão
# anterior) atende; sem nenhuma versão instalada, recarregue a janela à mão na primeira vez.
#
#   scripts/dev-install.sh            # VS Code
#   scripts/dev-install.sh --cursor   # Cursor
#   scripts/dev-install.sh --no-reload
set -euo pipefail

editor=code
scheme=vscode
reload=1
for arg in "$@"; do
  case "$arg" in
    --cursor) editor=cursor scheme=cursor ;;
    --no-reload) reload=0 ;;
    -h | --help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg (use --cursor, --no-reload ou --help)" >&2
      exit 2
      ;;
  esac
done

cd "$(dirname "$0")/.."
command -v "$editor" >/dev/null || {
  echo "O comando '$editor' não está no PATH. No editor: Shell Command: Install '$editor' command in PATH." >&2
  exit 1
}

publisher=$(node -p "require('./package.json').publisher")
name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")
tmp="${TMPDIR:-/tmp}"
out="${tmp%/}/$name-$version-dev.vsix"

# o vsce roda o vscode:prepublish, que é o build da extensão e da interface
echo "Gerando $name $version…"
npx --no-install vsce package --out "$out"

echo "Instalando no $editor…"
"$editor" --install-extension "$out" --force

if [ "$reload" = 1 ]; then
  echo "Recarregando a janela…"
  "$editor" --open-url "$scheme://$publisher.$name/reload"
fi
echo "Pronto: $name $version instalada."
