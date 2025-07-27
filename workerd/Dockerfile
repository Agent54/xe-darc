FROM node:23

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PATH=$PATH:/root/.cargo/bin

RUN apt upgrade && apt update
RUN apt-get install apt-utils openssl curl dtach libssl-dev build-essential -y

RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash

RUN cargo binstall --strategies crate-meta-data jj-cli
RUN jj config set --user user.name "Dev" && jj config set --user user.email "devcontainer@agent54.org"

RUN curl -fsSL https://get.docker.com | sh

RUN npm -g install pnpm
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install -g @anthropic-ai/claude-code

RUN mkdir /workspace
RUN mkdir /workspace/dtach
RUN mkdir /workspace/code-server
RUN mkdir /workspace/code-server/data
RUN mkdir /workspace/code-server/extensions

WORKDIR /workspace

RUN docker context create workerd --docker "host=unix:///var/run/workerd.sock"

RUN curl -fsSL https://code-server.dev/install.sh | sh

RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension github.github-vscode-theme
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension svelte.svelte-vscode
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension bradlc.vscode-tailwindcss
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension kokakiwi.vscode-capnproto
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension file-icons.file-icons
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension anthropic.claude-code
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension rooveterinaryinc.roo-cline
# RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension saoudrizwan.claude-dev
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension visualjj.visualjj
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension github.vscode-pull-request-github
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension github.vscode-github-actions
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension ms-vscode.vscode-github-issue-notebooks
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension ms-azuretools.vscode-containers
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension ms-playwright.playwright
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension ms-toolsai.jupyter
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension gruntfuggly.todo-tree
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension yoavbls.pretty-ts-errors
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension esbenp.prettier-vscode
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension pomdtr.excalidraw-editor
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension dbaeumer.vscode-eslint
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension arktypeio.arkdark
RUN code-server --extensions-dir=/workspace/code-server/extensions --user-data-dir=/workspace/code-server/data --install-extension sourcegraph.amp

# lanes
# RUN code-server --install-extension l-igh-t.vscode-theme-seti-folder
# RUN code-server --install-extension thang-nm.flow-icons
# RUN code-server --install-extension adrianwilczynski.toggle-hidden
# remove: dart, groovy, etc.

COPY ./workerd/start.sh /root/start.sh
RUN chmod +x /root/start.sh
COPY ./.claude/claude.json /root/.claude.json
COPY ./package.json /workspace/package.json
# --mount=type=cache,id=pnpm,target=/pnpm/store
RUN  pnpm install

COPY ./workerd /workspace/

# ENTRYPOINT bash
CMD /root/start.sh
