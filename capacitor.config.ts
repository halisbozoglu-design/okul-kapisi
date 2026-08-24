import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tr.mimaros.okulkapisi',
  appName: 'MİMAROS',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    useLegacyBridge: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
