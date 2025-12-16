/**
 * Build signed IWA bundle (.swbn) using rollup-plugin-webbundle
 * 
 * This script runs a separate Rollup build that bundles dist/ into a signed .swbn
 * 
 * Usage:
 *   node build-swbn.js
 * 
 * Environment variables:
 *   KEY_PASSPHRASE - Passphrase for encrypted key (optional if key is unencrypted)
 *   IWA_KEY_PATH   - Path to signing key (default: ./certs/iwa_signing_key.pem)
 */

import fs from 'fs';
import path from 'path';
import { rollup } from 'rollup';
import wbn from 'rollup-plugin-webbundle';
import * as wbnSign from 'wbn-sign';

const DIST_DIR = './dist';
const OUTPUT_SWBN = 'darc.swbn';

// Key path (unencrypted for CI/CD)
const KEY_PATHS = [
  process.env.IWA_KEY_PATH,
  './certs/iwa_signing_key.pem',
].filter(Boolean);

async function main() {
  console.log('Building signed IWA bundle...\n');

  // Check dist exists
  if (!fs.existsSync(DIST_DIR)) {
    console.error('Error: dist/ directory not found. Run "pnpm build" first.');
    process.exit(1);
  }

  // Find signing key
  let keyPath = null;
  for (const p of KEY_PATHS) {
    if (fs.existsSync(p)) {
      keyPath = p;
      break;
    }
  }

  if (!keyPath) {
    console.error('Error: No IWA signing key found.');
    console.error('Run: ./certs/create-iwa-key.sh to generate one.');
    process.exit(1);
  }

  console.log(`Using signing key: ${keyPath}`);

  // Parse the key (unencrypted for CI/CD)
  let key;
  try {
    const keyData = fs.readFileSync(keyPath);
    key = wbnSign.parsePemKey(keyData);
  } catch (err) {
    console.error('Error parsing key:', err.message);
    process.exit(1);
  }

  // Get Web Bundle ID
  const webBundleId = new wbnSign.WebBundleId(key);
  const iwaOrigin = webBundleId.serializeWithIsolatedWebAppOrigin();
  
  console.log(`\nWeb Bundle ID: ${webBundleId.serialize()}`);
  console.log(`IWA Origin: ${iwaOrigin}\n`);

  // Use rollup with webbundle plugin
  console.log('Creating signed web bundle from dist/...');
  
  // Create a virtual entry point for rollup
  const virtualEntry = 'virtual:entry';
  
  try {
    const bundle = await rollup({
      input: virtualEntry,
      plugins: [
        {
          name: 'virtual-entry',
          resolveId(id) {
            if (id === virtualEntry) return id;
            return null;
          },
          load(id) {
            if (id === virtualEntry) return 'export default {}';
            return null;
          },
        },
        wbn({
          baseURL: iwaOrigin,
          static: {
            dir: 'dist',
          },
          output: OUTPUT_SWBN,
          integrityBlockSign: {
            strategy: new wbnSign.NodeCryptoSigningStrategy(key),
          },
        }),
      ],
    });

    await bundle.write({
      dir: 'bundle-out',
      format: 'es',
    });

    await bundle.close();
    
    // Move the swbn from bundle-out to root
    if (fs.existsSync(`bundle-out/${OUTPUT_SWBN}`)) {
      fs.renameSync(`bundle-out/${OUTPUT_SWBN}`, OUTPUT_SWBN);
      fs.rmSync('bundle-out', { recursive: true });
    }
  } catch (err) {
    console.error('Error creating bundle:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  if (fs.existsSync(OUTPUT_SWBN)) {
    const stats = fs.statSync(OUTPUT_SWBN);
    console.log(`\n✓ Signed bundle created: ${OUTPUT_SWBN} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.log(`\n✓ Signed bundle created in dist/${OUTPUT_SWBN}`);
  }
  
  console.log(`\nTo install in Chrome:`);
  console.log(`  1. Enable IWA flags (see INSTALL.md)`);
  console.log(`  2. Open chrome://web-app-internals`);
  console.log(`  3. Use "Install IWA from Signed Web Bundle"`);
  console.log(`  4. Select the .swbn file`);
}

main().catch(console.error);
