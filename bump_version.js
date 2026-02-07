/**
 * Bump version for IWA releases
 *
 * Usage:
 *   node bump_version.js
 *   VERSION=1.0.47 node bump_version.js
 *   VERSION=1.0.47 CHANNEL=nightly VERSION_TAG=darc-v1.0.47 REPO=Agent54/xe-darc node bump_version.js
 *
 * Environment variables:
 *   VERSION      - Explicit version (optional, auto-increments patch if omitted)
 *   CHANNEL      - Update channel: "default" or "nightly" (default: "default")
 *   VERSION_TAG  - Git tag for this version, used in download URL (default: "latest")
 *   REPO         - GitHub repo in owner/repo format (default: "Agent54/xe-darc")
 */

import fs from 'fs';

const tagPrefix = 'darc-v';
const channel = process.env.CHANNEL || 'default';
const versionTag = process.env.VERSION_TAG || 'latest';
const repo = process.env.REPO || 'Agent54/xe-darc';

let version = process.env.VERSION;
if (version) {
  version = version.replace(tagPrefix, '');
} else {
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

manifest.update_manifest_url = `https://github.com/${repo}/releases/download/iwa-manifest/iwa-updates.json`;

fs.writeFileSync(
  './public/.well-known/manifest.webmanifest',
  JSON.stringify(manifest, null, 2),
);
console.log(`Updated manifest.webmanifest to version ${version}`);

// Update IWA Update Manifest
const updateManifestPath = './iwa-updates.json';
const defaultManifest = {
  versions: [],
  channels: {
    default: { name: 'Stable' },
    nightly: { name: 'Nightly' },
  },
};

const updateManifest = fs.existsSync(updateManifestPath)
  ? JSON.parse(fs.readFileSync(updateManifestPath, 'utf-8'))
  : defaultManifest;

const existingIndex = updateManifest.versions.findIndex(v => v.version === version);
const newEntry = {
  version,
  src: `https://github.com/${repo}/releases/download/${versionTag}/darc.swbn`,
  channels: [channel],
};

if (existingIndex >= 0) {
  updateManifest.versions[existingIndex] = newEntry;
} else {
  updateManifest.versions.unshift(newEntry);
}

if (!updateManifest.channels) {
  updateManifest.channels = defaultManifest.channels;
}

fs.writeFileSync(updateManifestPath, JSON.stringify(updateManifest, null, 2));
console.log(`Updated iwa-updates.json with version ${version} on channel ${channel}`);

// Update package.json version
const packagePath = './package.json';
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  pkg.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  console.log(`Updated package.json to version ${version}`);
}

console.log(`\nVersion bump complete: ${version}`);
