FROM node:23
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt upgrade && apt update
RUN apt-get install openssl curl dtach libssl-dev -y

# Install Docker CLI for Docker-in-Docker
RUN curl -fsSL https://get.docker.com | sh

# RUN npm -g install pnpm
# RUN mkdir /workspace
# COPY --chown=app:app ./package.json /workspace/package.json
COPY --chown=app:app . /workspace/
WORKDIR /workspace
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

RUN docker context create workerd --docker "host=unix:///var/run/workerd.sock"

RUN curl -fsSL https://code-server.dev/install.sh | sh

ENTRYPOINT pnpm dev
