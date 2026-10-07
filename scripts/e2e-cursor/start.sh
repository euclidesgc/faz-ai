#!/bin/sh
# Dentro do contêiner: instala a extensão que veio do computador (a da branch em teste) e abre o
# Cursor no projeto, na tela do computador. Roda a cada subida, então "continuar" também atualiza.
cursor --install-extension /opt/faz-ai/faz-ai.vsix --force
exec /usr/share/cursor/cursor --no-sandbox --ozone-platform=wayland --remote-debugging-port=9335 /home/dev/meu-app
