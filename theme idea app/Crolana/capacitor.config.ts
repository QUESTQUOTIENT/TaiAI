import type { CapacitorConfig } from '@capacitor/cli';



const isProduction = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.crolana.app',
  appName: 'Crolana',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    
    
    url: process.env.CAPACITOR_URL || (isProduction
      ? 'https://crolana-production.up.railway.app'
      : 'http://localhost:3000'),
    cleartext: !isProduction, 
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#020817",
      androidSpinnerStyle: "large",
      androidSpinnerColor: "#3b82f6",
      iosSpinnerStyle: "small",
      iosSpinnerColor: "#3b82f6",
      showSpinner: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: "#020817"
    }
  },
  android: {
    allowMixedContent: !isProduction, 
    backgroundColor: "#020817",
    captureInput: true,
    buildOptions: {
      signingType: 'apksigner'
    }
  }
};

export default config;
