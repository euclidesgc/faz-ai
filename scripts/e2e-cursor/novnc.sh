#!/bin/sh
# Dentro do contêiner, no modo noVNC: liga a tela virtual, o gerenciador de janelas e o noVNC (a tela
# no navegador do computador, na porta 6080) e então abre o Cursor como no modo Wayland.
set -e
# a imagem base aponta para o Wayland do computador: aqui a tela é X, e o x11vnc recusa rodar se vir o Wayland
unset WAYLAND_DISPLAY
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
Xvfb :1 -screen 0 1600x1000x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
# espera a tela existir antes de pendurar o resto nela
for _ in $(seq 50); do xset -display :1 q >/dev/null 2>&1 && break; sleep 0.1; done
openbox --config-file /etc/xdg/openbox/fazai-rc.xml >/tmp/openbox.log 2>&1 &
x11vnc -display :1 -forever -shared -nopw -localhost -rfbport 5900 -quiet >/tmp/x11vnc.log 2>&1 &
websockify --web /opt/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
exec start-cursor
