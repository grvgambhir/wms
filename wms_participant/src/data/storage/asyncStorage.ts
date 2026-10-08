import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function getAllKeys(): Promise<readonly string[]> {
  return AsyncStorage.getAllKeys();
}

export async function removeMany(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await AsyncStorage.multiRemove(keys);
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.clear();
}
