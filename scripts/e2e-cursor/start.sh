#!/bin/sh
# Dentro do contêiner: instala a extensão que veio do computador (a da branch em teste) e abre o
# Cursor no projeto, na tela do computador. Roda a cada subida, então "continuar" também atualiza.
# os grupos render/video vêm do computador por GID; sem nome dentro da imagem, o Cursor avisa "groups: cannot find name for group ID"
for gid in ${FAZAI_HOST_GIDS:-}; do
  getent group "$gid" >/dev/null 2>&1 || sudo groupadd -g "$gid" "host-$gid"
done
cursor --install-extension /opt/faz-ai/faz-ai.vsix --force
# o contêiner não tem chaveiro do sistema: sem --password-store=basic, o Cursor pergunta a cada subida.
# No modo noVNC (Dockerfile.novnc), a tela é X e sem GPU: FAZAI_OZONE e FAZAI_CURSOR_FLAGS trocam isso
# shellcheck disable=SC2086
exec /usr/share/cursor/cursor --no-sandbox --password-store=basic --ozone-platform="${FAZAI_OZONE:-wayland}" ${FAZAI_CURSOR_FLAGS:-} \
  --remote-debugging-port=9335 /home/dev/meu-app
