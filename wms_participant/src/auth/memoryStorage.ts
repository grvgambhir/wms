import type { KeyValueStorageInterface } from '@aws-amplify/core';

/** In-memory Amplify token store. Used on web, in tests, and as SecureStore fallback. */
export class MemoryKeyValueStorage implements KeyValueStorageInterface {
  private readonly store = new Map<string, string>();

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Test helper — keys only, never log values (values may be tokens). */
  keys(): string[] {
    return [...this.store.keys()];
  }

  hasValue(needle: string): boolean {
    for (const value of this.store.values()) {
      if (value.includes(needle)) return true;
    }
    return false;
  }
}
