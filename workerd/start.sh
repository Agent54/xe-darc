
# --ignore-last-opened --github-auth=token --socket=/socket
#dtach -n /workspace/dtach/code-server 
code-server --disable-telemetry --auth=none --bind-addr=0.0.0.0:8080 --user-data-dir=/workspace/code-server/data --extensions-dir=/workspace/code-server/extensions --enable-proposed-api=true --disable-workspace-trust  --app-name=darc --disable-getting-started-override /workspace &

# dtach -c /workspace/dtach/main 
pnpm dev
