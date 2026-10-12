import type { ConfigContext, ExpoConfig } from 'expo/config';

// Le build di sviluppo e prova usano un pacchetto diverso (…teamtime.dev), così sul telefono stanno accanto all'app
// vera degli store senza scontrarsi. Solo il profilo EAS "production" (APP_VARIANT=production) usa il pacchetto vero.
const IS_PRODUCTION = process.env.APP_VARIANT === 'production';

export default ({ config }: ConfigContext): ExpoConfig => {
  if (IS_PRODUCTION) return config as ExpoConfig;
  return {
    ...config,
    name: 'TeamTime Dev',
    slug: config.slug ?? 'teamtime',
    android: { ...config.android, package: `${config.android?.package}.dev` },
    ios: { ...config.ios, bundleIdentifier: `${config.ios?.bundleIdentifier}.dev` },
  };
};
