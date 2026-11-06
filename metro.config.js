// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require("expo/metro-config");

// shared/ is a real git submodule (billboloindia-star/pariksha-shared), not
// a symlink — its files physically live under this project root, so Metro's
// default config resolves everything normally. No special watchFolders/
// node_modules config needed here.
module.exports = getDefaultConfig(__dirname);
