FROM node:23

RUN npm install -g pnpm
RUN npm install -g @anthropic-ai/claude-code


WORKDIR /app

COPY . /app
COPY .claude/claude.json /root/.claude.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 pnpm install

ENV container=true
CMD pnpm dev
