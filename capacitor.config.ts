import type { CapacitorConfig } from '@capacitor/cli';

// Aplicació Android: la mateixa aplicació web compilada (dist) dins d'un WebView
const config: CapacitorConfig = {
  appId: 'cat.sportsvidia.app',
  appName: 'Sports VidIA',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
