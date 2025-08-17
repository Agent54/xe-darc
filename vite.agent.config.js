// TODO: can be mergen when all is enabled for https

import { defineConfig } from 'vite'
import path from 'path'
import fs from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

const plugins = [
  svelte(),
  tailwindcss()
]

export default defineConfig({
  plugins,
  define: { globals: 'window' },
  server: {
    host: '0.0.0.0',
    port: 5194,
    strictPort: true,
    https: {
      key: fs.readFileSync('./certs/device.key'),
      cert: fs.readFileSync('./certs/localhost.crt'),
    },
    cors: { 
      origin: '*' // /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/ 

    } ,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // 'Cross-Origin-Opener-Policy': 'cross-origin',
      'cross-origin-resource-policy': 'cross-origin'
    },
    hmr: {
      protocol: 'wss', 
      clientPort: 5194,
      host: 'localhost' 
    },
    watch: {
      ignored: ['**/todo.md']
    }
  },
  build: {
    rollupOptions: {
      input: {
        agent: './agent.html'
      }
    }
  }
})
