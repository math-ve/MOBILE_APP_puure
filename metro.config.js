const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// supabase-js ≥2.10x : le build ESM (dist/index.mjs) contient un `import()` dynamique
// (tracing OpenTelemetry optionnel) que Hermes ne sait pas parser en release
// → "Invalid expression encountered" au moment de hermesc dans le build Gradle.
// On force le build CJS (dist/index.cjs), qui utilise un require() différé sans danger.
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    return context.resolveRequest(context, '@supabase/supabase-js/dist/index.cjs', platform)
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
