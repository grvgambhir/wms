import { Platform } from 'react-native';

/**
 * TEMPORARY POC (REV-010): leave the Expo app for the saved World Masters page.
 * Must be a full browser navigation — Expo Router `/` is the in-app index, while
 * Docker nginx serves the landing HTML only on a real document load of `/`.
 */
export function openWorldMastersHome(): void {
  if (Platform.OS !== 'web') {
    return;
  }

  const loc = globalThis.location;
  if (loc && typeof loc.assign === 'function') {
    loc.assign('/');
  }
}
