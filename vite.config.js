/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';
// import fs from 'fs';
import path from 'path';
import injectHTML from 'vite-plugin-html-inject';
import { svelte } from '@sveltejs/vite-plugin-svelte'
// import { cloudflare } from "@cloudflare/vite-plugin";
import fs from 'node:fs';

// import wbn from 'rollup-plugin-webbundle';
// import * as wbnSign from 'wbn-sign';
// import dotenv from 'dotenv';
import tailwindcss from '@tailwindcss/vite'

// dotenv.config();

const plugins = [
  // cloudflare(),
  {
    name: 'patch-link-color',
    transform(code, id) {      
      // Try broader matching first to see if we can catch the files
      
      if (code.includes('stroke="#1971c2"')) { 
        // console.log("MATCHED FILE ID:", id)
        return {
          code: code.replace(
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1971c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',

            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="black" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link" style="background-color: black;"></svg>'),
          map: null
        }
      }

      // Also try matching any file that contains the target string
      // if (code.includes('stroke="#1971c2"')) {
      //   console.log("FOUND TARGET STRING in:", id)
      //   return {
      //     code: code.replace(/stroke="#1971c2"/g, 'stroke="red"'),
      //     map: null
      //   }
      // }
    },
    
    // Alternative: use generateBundle hook for post-processing chunks
    generateBundle(options, bundle) {
      Object.keys(bundle).forEach(fileName => {
        const chunk = bundle[fileName]
        if (chunk.type === 'chunk' && chunk.code) {
          console.log("Bundle chunk:", fileName)
          if (fileName.includes('FX7ZIABN') || fileName.includes('3KPV5WBD') || fileName.includes('UAGCFJAM')
            ) {
              //chunk.code.includes('stroke="#1971c2"')
            console.log("PROCESSING CHUNK:", fileName)
            chunk.code = chunk.code.replace(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1971c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
             
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="black" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-external-link" style="background-color: black;"></svg>')
          }
        }
      })
    }
  },
  injectHTML(),
  svelte(),
  tailwindcss()
];
  // // something
  // const viteClientRegex = /node_modules\/vite\/dist\/client\/client\.mjs$/gi;

  //   // regex'es to add CSP
  // // TODO: make one normal regex to handle all three
  // const regexScript = /<script(.*?)/gi;
  // const replacementScript = `<script nonce="${nonce}"$1`;

  // const regexStyle = /<style(.*?)/gi;
  // const replacementStyle = `<style nonce="${nonce}"$1`;

  // const regexLink = /<link(.*?)/gi;
  // const replacementLink = `<link nonce="${nonce}"$1`;

  // const nonce = "{SERVER-GENERATED-NONCE}";

  // console.log("NONCE", nonce);
  // console.log("NODE_ENV", process.env.NODE_ENV);


if (process.env.NODE_ENV === 'production') {
  // Get the key and decrypt it to sign the web bundle
  // const key = wbnSign.parsePemKey(
  //   process.env.KEY || fs.readFileSync('./certs/encrypted_key.pem'),
  //   process.env.KEY_PASSPHRASE ||
  //     (await wbnSign.readPassphrase(
  //       /*description=*/ './certs/encrypted_key.pem',
  //     )),
  // );

  // Add the wbn bundle only during a production build
  // plugins.push({
  //   ...wbn({
  //     // Ensures the web bundle is signed as an isolated web app
  //     baseURL: new wbnSign.WebBundleId(key).serializeWithIsolatedWebAppOrigin(),
  //     // Ensure that all content in the `public` directory is included in the web bundle
  //     static: {
  //       dir: 'public',
  //     },
  //     // The name of the output web bundle
  //     output: 'controlled-frame-test-app.swbn',
  //     // This ensures the web bundle is signed with the key
  //     integrityBlockSign: {
  //       strategy: new wbnSign.NodeCryptoSigningStrategy(key),
  //     },
  //   }),
  //   enforce: 'post',
  // });

}
// } else {



// plugins.push({
//   name: "transform-file",

//   transform(src, id) {
//     if (viteClientRegex.test(id)) {
//       return {
//         code: src.replace(
//           "style.setAttribute('data-vite-dev-id', id);",
//           `style.setAttribute('data-vite-dev-id', id); style.setAttribute('nonce', '${nonce.toString()}');`
//         ),
//       };
//     }
//   },
// });

// plugins.push({
//   name: "html-inject-nonce-into-script-tag",
//   enforce: "post",
//   transformIndexHtml(html) {
//     return html
//       .replace(regexScript, replacementScript)
//       .replace(regexStyle, replacementStyle)
//       .replace(regexLink, replacementLink);
//   },
// })
// }

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
    },
    proxy: {
      '/agents': {
        target: 'ws://localhost:8787',
        ws: true,
        rewriteWsOrigin: true,
      },
      '/devtools-api': {
        target: 'http://127.0.0.1:9226',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/devtools-api/, '')
      }
      
     // 'http://localhost:8787',
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // 'Cross-Origin-Opener-Policy': 'cross-origin',
      'cross-origin-resource-policy': 'cross-origin'
    },
    // ...(process.env.container === 'true' && { allowedHosts: true }),
    hmr: {
      protocol: 'wss', 
      clientPort: 5194,
      host: '192.168.31.196' // FIXME: localhost
      // ...(process.env.container !== 'true' && { clientPort: 5193,  host: 'localhost' }),
    },
    watch: {
      ignored: ['**/todo.md']
    }
  },
  resolve:{
    alias: {
      '@excalidraw/excalidraw/components/hyperlink/helpers': path.resolve(__dirname, './app/lib/excalidraw-helpers.ts')
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        agent_app: './agent_app.html',
        // web_request_test: './web_request_test.html',
        // tldraw_webview: './tldraw_webview.html'
      }
    }
  }
})
