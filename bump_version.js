/**
 * Bump version for IWA releases
 * 
 * Usage:
 *   VERSION=1.0.47 node bump_version.js
 *   
 * Or with full tag format:
 *   VERSION=darc-v1.0.47 node bump_version.js
 */

import fs from 'fs';

const tagPrefix = 'darc-v';

let version = process.env?.VERSION;
if (version) {
  version = version.replace(tagPrefix, '');
} else {
  // Auto-increment patch version from manifest
  const manifest = JSON.parse(
    fs.readFileSync('./public/.well-known/manifest.webmanifest', 'utf-8'),
  );
  const parts = manifest.version.split('.');
  parts[parts.length - 1] = String(parseInt(parts[parts.length - 1], 10) + 1);
  version = parts.join('.');
  console.log(`Auto-incrementing to version: ${version}`);
}

// Update Web App Manifest
const manifest = JSON.parse(
  fs.readFileSync('./public/.well-known/manifest.webmanifest', 'utf-8'),
);
manifest.version = version;
fs.writeFileSync(
  './public/.well-known/manifest.webmanifest',
  JSON.stringify(manifest, null, 2),
);
console.log(`Updated manifest.webmanifest to version ${version}`);

// Update IWA Update Manifest
const updateManifestPath = './public/iwa-updates.json';
if (fs.existsSync(updateManifestPath)) {
  const updateManifest = JSON.parse(fs.readFileSync(updateManifestPath, 'utf-8'));
  
  // Check if version already exists
  const existingIndex = updateManifest.versions.findIndex(v => v.version === version);
  
  const newEntry = {
    version,
    src: `https://github.com/Agent54/xe-darc/releases/download/latest/darc.swbn`,
    channels: ['default']
  };
  
  if (existingIndex >= 0) {
    updateManifest.versions[existingIndex] = newEntry;
  } else {
    // Add new version at the beginning (newest first)
    updateManifest.versions.unshift(newEntry);
  }
  
  fs.writeFileSync(updateManifestPath, JSON.stringify(updateManifest, null, 2));
  console.log(`Updated iwa-updates.json with version ${version}`);
}

// Update package.json version
const packagePath = './package.json';
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  pkg.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  console.log(`Updated package.json to version ${version}`);
}

console.log(`\nVersion bump complete: ${version}`);
console.log(`Run 'pnpm build:swbn' to create the signed bundle.`);
