# Máquina "recém-instalada" para o teste e2e do Faz AI no Cursor: Ubuntu 24.04 sem Node, git, gh,
# uv, Code Review Graph nem a CLI do Cursor. Tem só o que o Cursor precisa para abrir a janela, mais
# curl e sudo (o que uma máquina de desenvolvimento comum já tem). O Cursor não fica na imagem: é o
# do computador, montado só para leitura, e a extensão chega a cada subida (ver e2e-cursor.sh).
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl sudo locales fonts-dejavu-core fonts-noto-color-emoji xdg-utils procps \
      libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 \
      libcurl4t64 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0t64 libgtk-3-0t64 libnspr4 libnss3 \
      libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
      libxkbcommon0 libxkbfile1 libxrandr2 libsecret-1-0 libegl1 libgl1 libwayland-client0 \
      libwayland-egl1 libwayland-cursor0 libdrm2 libxshmfence1 libvulkan1 \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i 's/# pt_BR.UTF-8/pt_BR.UTF-8/' /etc/locale.gen && locale-gen
# a imagem do Ubuntu já tem o usuário "ubuntu" com uid 1000: vira "dev", com sudo sem senha (para
# instalar o que o Diagnóstico pedir). A pasta de execução é dele, como numa sessão de verdade.
RUN usermod -l dev -d /home/dev -m ubuntu && groupmod -n dev ubuntu \
    && echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev \
    && ln -s /usr/share/cursor/bin/cursor /usr/local/bin/cursor \
    && mkdir -p /tmp/runtime && chown dev:dev /tmp/runtime && chmod 700 /tmp/runtime
# o contêiner não tem navegador: os links (login, "Saiba mais") abrem no navegador do computador
COPY --chmod=755 open-on-host.sh /usr/local/bin/xdg-open
COPY --chmod=755 start.sh /usr/local/bin/start-cursor
USER dev
ENV LANG=pt_BR.UTF-8 HOME=/home/dev XDG_RUNTIME_DIR=/tmp/runtime WAYLAND_DISPLAY=wayland-0 \
    BROWSER=/usr/local/bin/xdg-open
# um projeto comum, sem git
RUN mkdir -p /home/dev/meu-app && cd /home/dev/meu-app \
    && printf '# Meu app\n\nProjeto de teste do Faz AI.\n' > README.md \
    && printf 'export const soma = (a, b) => a + b;\n' > index.js
WORKDIR /home/dev/meu-app
CMD ["start-cursor"]
