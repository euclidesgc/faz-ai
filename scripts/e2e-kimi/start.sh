#!/bin/sh
# Dentro do contêiner: sobe o board do Faz AI (src/cli) no projeto meu-app. O servidor só escuta em
# 127.0.0.1 e confere o Host; o socat repete a porta no IP do contêiner (o que o Docker publica no
# computador, em 127.0.0.1:<porta>), com a mesma porta nos dois lados para o Host passar. Não pode
# ser em 0.0.0.0: ele tomaria a porta do próprio board.
# Roda a cada subida, então "continuar" também usa o dist/ novo.
PORTA=${FAZAI_E2E_PORTA:-7878}
IP=$(hostname -i | awk '{print $1}')
socat "TCP-LISTEN:$PORTA,fork,reuseaddr,bind=$IP" "TCP:127.0.0.1:$PORTA" &
exec node /opt/faz-ai/dist/cli.js --port "$PORTA" --no-open /home/dev/meu-app
