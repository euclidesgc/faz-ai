# Máquina "recém-instalada" para o teste e2e do Faz AI com o Kimi Code: Ubuntu 24.04 sem git, gh, uv,
# Code Review Graph nem a CLI `kimi`. Tem o Node 22 (só para rodar o board, `dist/cli.js`, que é o
# próprio Faz AI), o socat (que repete a porta do board para fora do contêiner) e o que uma máquina
# de desenvolvimento comum já tem (curl, sudo). A `kimi` não fica na imagem: o ROTEIRO.md a instala
# dentro do contêiner, como uma pessoa faria.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg sudo xdg-utils procps socat \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
# a imagem do Ubuntu já tem o usuário "ubuntu" com uid 1000: vira "dev", com sudo sem senha (para
# instalar o que o Diagnóstico pedir). A pasta de execução é dele, como numa sessão de verdade.
RUN usermod -l dev -d /home/dev -m ubuntu && groupmod -n dev ubuntu \
    && echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev
# o contêiner não tem navegador: os links (login) abrem no navegador do computador
COPY --chmod=755 open-on-host.sh /usr/local/bin/xdg-open
COPY --chmod=755 start.sh /usr/local/bin/start-board
USER dev
ENV HOME=/home/dev BROWSER=/usr/local/bin/xdg-open
# um projeto comum, sem git
RUN mkdir -p /home/dev/meu-app && cd /home/dev/meu-app \
    && printf '# Meu app\n\nProjeto de teste do Faz AI.\n' > README.md \
    && printf 'export const soma = (a, b) => a + b;\n' > index.js
WORKDIR /home/dev/meu-app
CMD ["start-board"]
