import { resolveAsset } from '@/theme/assets';

const ASSET_PREFIX = 'asset:';

/** Bundled require() result or a device URI — matches expo-image `source`. */
export type AppImageSource = number | { uri: string };

/** POC photo refs may be a device URI or `asset:<AssetKey>` from fixtures. */
export function toAssetPhotoRef(assetKey: string): string {
  return `${ASSET_PREFIX}${assetKey}`;
}

export function resolvePhotoSource(ref?: string | null): AppImageSource | undefined {
  if (!ref) return undefined;
  if (ref.startsWith(ASSET_PREFIX)) {
    return resolveAsset(ref.slice(ASSET_PREFIX.length));
  }
  const bundled = resolveAsset(ref);
  if (bundled) return bundled;
  return { uri: ref };
}
