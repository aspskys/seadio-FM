import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seadio.fm',
  appName: 'Seadio',
  webDir: 'pwa',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {},
};

export default config;
