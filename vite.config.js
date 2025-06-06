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
import fs from 'fs';
import injectHTML from 'vite-plugin-html-inject';
// import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte'

// import wbn from 'rollup-plugin-webbundle';
// import * as wbnSign from 'wbn-sign';
import dotenv from 'dotenv';
import tailwindcss from '@tailwindcss/vite'

dotenv.config();

const plugins = [
  // globals window setting
  injectHTML(),
  // react({refresh: false, fastRefresh: false}),
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
    port: 5193,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      clientPort: 5193,
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        // web_request_test: './web_request_test.html',
        // tldraw_webview: './tldraw_webview.html'
      },
    },
  },
});
