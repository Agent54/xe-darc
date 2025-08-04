FROM node:23

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm
RUN npm install -g @anthropic-ai/claude-code

ENV PATH=$PATH:/root/.cargo/bin
RUN apt-get update && apt-get install -y build-essential

RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
# RUN cargo install --locked --bin jj jj-cli
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
RUN cargo binstall --strategies crate-meta-data jj-cli
RUN jj config set --user user.name "Dev" && jj config set --user user.email "devcontainer@agent54.org"

RUN mkdir /app
WORKDIR /app

COPY . /app
COPY .claude/claude.json /root/.claude.json

# --mount=type=cache,id=pnpm,target=/pnpm/store
RUN pnpm install

ENV container=true
CMD pnpm dev
