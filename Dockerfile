FROM node:23

RUN npm install -g pnpm
RUN npm install -g @anthropic-ai/claude-code

ENV PATH=$PATH:/root/.cargo/bin
RUN apt-get update && apt-get install -y build-essential
# RUN cargo install --locked --bin jj jj-cli
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
RUN cargo install --locked --bin jj jj-cli
RUN jj config set --user user.name "Dev" && jj config set --user user.email "devcontainer@agent54.org"

RUN mkdir /app
WORKDIR /app

COPY . /app
COPY .claude/claude.json /root/.claude.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 pnpm install

ENV container=true
CMD pnpm dev
