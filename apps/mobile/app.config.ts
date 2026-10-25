import type { ConfigContext, ExpoConfig } from 'expo/config';

// La configuración base está en app.json. Acá solo se ajusta el development build (perfil "development" de
// eas.json, que define APP_VARIANT): otro nombre y otro paquete, para que se pueda instalar al lado de la app de
// release sin desinstalarla (y sin perder la música descargada).
const esDesarrollo = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (!esDesarrollo) return base;
  return {
    ...base,
    name: `${base.name} (dev)`,
    scheme: `${base.scheme}-dev`,
    android: { ...base.android, package: `${base.android?.package}.dev` },
  };
};
