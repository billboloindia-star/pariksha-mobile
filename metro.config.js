// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
// shared/ is a symlink to ../exam-app/shared — the same business-logic files
// the web app imports, so Metro needs to watch the real (symlinked) target
// and resolve symlinks, since it sits outside this project's root.
const sharedRoot = path.resolve(projectRoot, "../exam-app/shared");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.unstable_enableSymlinks = true;
// Files under shared/ physically live outside this project (their real path
// resolves to ../exam-app/shared/...), so Metro's normal "look upward from
// the file" node_modules search can't find react/etc there. Fall back to
// this project's own node_modules for any bare import Metro can't otherwise
// resolve, without disabling its normal hierarchical lookup (which would
// break resolution of nested/hoisted transitive deps like expo-asset).
const projectNodeModules = path.resolve(projectRoot, "node_modules");
config.resolver.extraNodeModules = new Proxy(
  {},
  { get: (_target, name) => path.join(projectNodeModules, String(name)) }
);

module.exports = config;
