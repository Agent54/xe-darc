FROM node:23

RUN npm install -g pnpm
RUN npm install -g @anthropic-ai/claude-code


WORKDIR /app

COPY . /app

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 pnpm install

CMD pnpm dev
