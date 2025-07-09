FROM node:20
RUN apt upgrade && apt update
RUN apt-get install openssl curl libssl-dev -y
RUN npm -g install pnpm
# RUN mkdir /workspace
# COPY --chown=app:app ./package.json /workspace/package.json
COPY --chown=app:app . /workspace/
WORKDIR /workspace
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 pnpm install

ENTRYPOINT pnpm dev
