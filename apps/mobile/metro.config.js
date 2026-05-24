const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@supabase/supabase-js") {
    // Keep RN release builds on Hermes by using Supabase's CJS bundle, which
    // avoids the ESM tracing dynamic import that hermesc rejects.
    return {
      type: "sourceFile",
      filePath: require.resolve("@supabase/supabase-js/dist/index.cjs")
    };
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
