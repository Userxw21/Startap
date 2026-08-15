// Metro's default resolver doesn't know about pnpm workspaces or symlinked
// packages (@courier/shared-types lives in ../../packages/shared-types and
// is pnpm-symlinked into node_modules, not physically copied) — without
// this, `import from '@courier/shared-types'` fails to resolve. Standard
// Expo monorepo pattern, not something specific to this project.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
// Deliberately NOT disableHierarchicalLookup: true, despite that being in
// some Expo-monorepo guides — it broke resolution of transitive deps
// (@react-navigation/core, required by @react-navigation/native but not a
// direct dependency of this package) that live in pnpm's nested/symlinked
// node_modules structure. Found by actually running `expo export`, not by
// reasoning about it — Metro needs to walk up the tree to find these.

module.exports = config;
