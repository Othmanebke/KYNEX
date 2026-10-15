// Config Metro : celle d'Expo (monorepo détecté automatiquement via les workspaces npm),
// plus une seule règle pour @kynex/core.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const coreSrc = path.resolve(__dirname, "../../packages/core/src");

// Le socle est écrit en ESM Node : ses imports relatifs finissent par « .js »
// alors que les fichiers sont en « .ts ». Pour ces imports-là seulement, on retire
// l'extension et on laisse Metro résoudre normalement.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && path.resolve(context.originModulePath).startsWith(coreSrc)) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
