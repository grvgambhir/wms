import type { KeyValueStorageInterface } from '@aws-amplify/core';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { MemoryKeyValueStorage } from './memoryStorage';

const CHUNK = 1800;

function chunkMetaKey(key: string): string {
  return `${key}.n`;
}

function chunkPartKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/**
 * expo-secure-store caps a value at ~2KB on iOS. Cognito tokens are chunked
 * so they still land in the keychain, not AsyncStorage.
 */
export class SecureStoreKeyValueStorage implements KeyValueStorageInterface {
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const parts = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(chunkMetaKey(key), String(parts));
    for (let i = 0; i < parts; i += 1) {
      await SecureStore.setItemAsync(chunkPartKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
  }

  async getItem(key: string): Promise<string | null> {
    const whole = await SecureStore.getItemAsync(key);
    if (whole !== null) return whole;
    const countRaw = await SecureStore.getItemAsync(chunkMetaKey(key));
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (!Number.isFinite(count) || count <= 0) return null;
    const pieces: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const piece = await SecureStore.getItemAsync(chunkPartKey(key, i));
      if (piece === null) return null;
      pieces.push(piece);
    }
    return pieces.join('');
  }

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    const countRaw = await SecureStore.getItemAsync(chunkMetaKey(key));
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (Number.isFinite(count) && count > 0) {
      for (let i = 0; i < count; i += 1) {
        await SecureStore.deleteItemAsync(chunkPartKey(key, i)).catch(() => undefined);
      }
    }
    await SecureStore.deleteItemAsync(chunkMetaKey(key)).catch(() => undefined);
  }

  async clear(): Promise<void> {
    // Amplify never calls clear() for a full wipe in our flow. Sign-out deletes keys.
  }
}

export function createTokenStorage(): KeyValueStorageInterface {
  if (Platform.OS === 'web') return new MemoryKeyValueStorage();
  return new SecureStoreKeyValueStorage();
}
