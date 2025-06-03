import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  // compilerOptions: { npm i https://pkg.pr.new/svelte@async
  //   experimental: {
  //     async: true
  //   }
  // },
}
