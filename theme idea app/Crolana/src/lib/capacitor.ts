

import { App, AppState } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';



export const isCapacitor = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';



let backButtonHandler: (() => boolean | void) | null = null;


export function registerBackButtonHandler(handler: () => boolean | void) {
  backButtonHandler = handler;
}


async function setupBackButtonListener() {
  if (!isAndroid) return;

  await App.addListener('backButton', async () => {
    if (backButtonHandler) {
      const handled = backButtonHandler();
      if (handled) return;
    }
    
    if (window.history.length > 1) {
      window.history.back();
    } else {
      
      App.exitApp();
    }
  });
}




export async function setupDeepLinkListener(): Promise<PluginListenerHandle> {
  return await App.addListener('appUrlOpen', (event) => {
    const { url } = event;
    console.log('[Capacitor] Deep link opened:', url);

    
    
    
    window.dispatchEvent(new CustomEvent('deep-link', { detail: { url } }));
  });
}



let stateListener: PluginListenerHandle | null = null;


export async function setupAppStateListener() {
  if (!isCapacitor) return;

  stateListener = await App.addListener('appStateChange', (state) => {
    console.log('[Capacitor] App state:', state);

    if (state.isActive) {
      
      window.dispatchEvent(new CustomEvent('app-resumed'));
    } else {
      
      window.dispatchEvent(new CustomEvent('app-paused'));
    }
  });
}




export async function configureStatusBar(darkTheme: boolean) {
  if (!isCapacitor) return;

  try {
    await StatusBar.setStyle({
      style: darkTheme ? Style.Dark : Style.Light
    });
    await StatusBar.setBackgroundColor({
      color: darkTheme ? '#020817' : '#f8fafc'
    });
  } catch (error) {
    console.warn('[Capacitor] Status bar configuration failed:', error);
  }
}



export interface NetworkStatus {
  connected: boolean;
  connectionType?: 'wifi' | 'cellular' | 'none' | 'unknown';
}

let networkListener: PluginListenerHandle | null = null;


export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!isCapacitor) {
    return { connected: navigator.onLine };
  }

  try {
    const status = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType as NetworkStatus['connectionType']
    };
  } catch (error) {
    console.warn('[Capacitor] Network status check failed:', error);
    return { connected: false };
  }
}


export async function setupNetworkListener() {
  if (!isCapacitor) {
    
    window.addEventListener('online', () => {
      window.dispatchEvent(new CustomEvent('network-status-change', {
        detail: { connected: true }
      }));
    });
    window.addEventListener('offline', () => {
      window.dispatchEvent(new CustomEvent('network-status-change', {
        detail: { connected: false }
      }));
    });
    return;
  }

  networkListener = await Network.addListener('networkStatusChange', (status) => {
    window.dispatchEvent(new CustomEvent('network-status-change', {
      detail: { connected: status.connected, connectionType: status.connectionType }
    }));
  });
}




export async function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') {
  if (!isCapacitor) return;

  try {
    switch (type) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
    }
  } catch (error) {
    
    console.warn('[Capacitor] Haptic feedback failed:', error);
  }
}




export async function setStorageItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}

export async function getStorageItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function removeStorageItem(key: string): Promise<void> {
  localStorage.removeItem(key);
}



import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';


export async function writeFile(path: string, data: string): Promise<void> {
  if (!isCapacitor) return;

  try {
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  } catch (error) {
    console.warn('[Capacitor] File write failed:', error);
  }
}


export async function readFile(path: string): Promise<string | null> {
  if (!isCapacitor) return null;

  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
    return result.data as string;
  } catch (error) {
    if ((error as any).code !== 'FILE_NOT_FOUND') {
      console.warn('[Capacitor] File read failed:', error);
    }
    return null;
  }
}




export async function initializeCapacitor(): Promise<void> {
  if (!isCapacitor) {
    console.log('[Capacitor] Not running in native environment - skipping init');
    return;
  }

  console.log('[Capacitor] Initializing native integrations...');

  try {
    await setupBackButtonListener();
    await setupDeepLinkListener();
    await setupAppStateListener();
    await setupNetworkListener();
    await configureStatusBar(true); 

    console.log('[Capacitor] Initialization complete');
  } catch (error) {
    console.error('[Capacitor] Initialization failed:', error);
  }
}



if (isCapacitor && typeof window !== 'undefined') {
  
  setTimeout(() => {
    initializeCapacitor().catch(console.error);
  }, 100);
}
