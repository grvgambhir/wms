import { colors } from './colors';

/** Asset key registry — resolve bundled images; screens use keys from fixtures only. */
export type AssetKey =
  | 'wmsLogoLandscape'
  | 'danielHarper'
  | 'ksg2026Hero'
  | 'tennis'
  | 'wmgKansai2027Card'
  | 'wmgKansai2027Hero'
  | 'omgComoLake2027Card'
  | 'omgComoLake2027Hero'
  | 'wwmgLahti2028Card'
  | 'wwmgLahti2028Hero'
  | 'wmgPerth2029Card'
  | 'wmgPerth2029Hero'
  | 'abuDhabi2026Card'
  | 'abuDhabi2026Hero'
  | 'taipei2025Card'
  | 'taipei2025Hero'
  | 'cleveland2024Card'
  | 'cleveland2024Hero'
  | 'lombardia2024Card'
  | 'lombardia2024Hero'
  | 'tampere2023Card'
  | 'tampere2023Hero'
  | 'jeonbuk2023Card'
  | 'jeonbuk2023Hero'
  | 'innsbruck2020Card'
  | 'innsbruck2020Hero'
  | 'torino2019Card'
  | 'penang2018Card'
  | 'auckland2017Card'
  | 'vancouver2016Card'
  | 'nice2015Card'
  | 'torino2013Card'
  | 'torino2013Hero'
  | 'sydney2009Card'
  | 'sydney2009Hero';

const assetMap: Record<AssetKey, number> = {
  // Official World Masters Sport wordmark — used by WmsMark on login + featured cards
  wmsLogoLandscape: require('../../assets/images/brand/wms-logo-landscape-white.png'),
  danielHarper: require('../../assets/images/athletes/daniel-harper.jpg'),
  ksg2026Hero: require('../../assets/images/events/ksg-2026-hero.png'),
  tennis: require('../../assets/images/sports/tennis.jpg'),
  wmgKansai2027Card: require('../../assets/images/events/catalog/upcoming/wmg-kansai-2027-card.png'),
  wmgKansai2027Hero: require('../../assets/images/events/catalog/upcoming/wmg-kansai-2027-hero.png'),
  omgComoLake2027Card: require('../../assets/images/events/catalog/upcoming/omg-como-lake-2027-card.png'),
  omgComoLake2027Hero: require('../../assets/images/events/catalog/upcoming/omg-como-lake-2027-hero.jpg'),
  wwmgLahti2028Card: require('../../assets/images/events/catalog/upcoming/wwmg-lahti-2028-card.jpg'),
  wwmgLahti2028Hero: require('../../assets/images/events/catalog/upcoming/wwmg-lahti-2028-hero.jpg'),
  wmgPerth2029Card: require('../../assets/images/events/catalog/upcoming/wmg-perth-2029-card.jpg'),
  wmgPerth2029Hero: require('../../assets/images/events/catalog/upcoming/wmg-perth-2029-hero.jpg'),
  abuDhabi2026Card: require('../../assets/images/events/catalog/previous/abu-dhabi-2026-card.jpg'),
  abuDhabi2026Hero: require('../../assets/images/events/catalog/previous/abu-dhabi-2026-hero.jpg'),
  taipei2025Card: require('../../assets/images/events/catalog/previous/taipei-2025-card.jpg'),
  taipei2025Hero: require('../../assets/images/events/catalog/previous/taipei-2025-hero.jpg'),
  cleveland2024Card: require('../../assets/images/events/catalog/previous/cleveland-2024-card.png'),
  cleveland2024Hero: require('../../assets/images/events/catalog/previous/cleveland-2024-hero.jpg'),
  lombardia2024Card: require('../../assets/images/events/catalog/previous/lombardia-2024-card.png'),
  lombardia2024Hero: require('../../assets/images/events/catalog/previous/lombardia-2024-hero.jpg'),
  tampere2023Card: require('../../assets/images/events/catalog/previous/tampere-2023-card.png'),
  tampere2023Hero: require('../../assets/images/events/catalog/previous/tampere-2023-hero.jpg'),
  jeonbuk2023Card: require('../../assets/images/events/catalog/previous/jeonbuk-2023-card.png'),
  jeonbuk2023Hero: require('../../assets/images/events/catalog/previous/jeonbuk-2023-hero.jpg'),
  innsbruck2020Card: require('../../assets/images/events/catalog/previous/innsbruck-2020-card.jpg'),
  innsbruck2020Hero: require('../../assets/images/events/catalog/previous/innsbruck-2020-hero.jpg'),
  torino2019Card: require('../../assets/images/events/catalog/previous/torino-2019-card.jpg'),
  penang2018Card: require('../../assets/images/events/catalog/previous/penang-2018-card.jpg'),
  auckland2017Card: require('../../assets/images/events/catalog/previous/auckland-2017-card.jpg'),
  vancouver2016Card: require('../../assets/images/events/catalog/previous/vancouver-2016-card.jpg'),
  nice2015Card: require('../../assets/images/events/catalog/previous/nice-2015-card.jpg'),
  torino2013Card: require('../../assets/images/events/catalog/previous/torino-2013-card.jpg'),
  torino2013Hero: require('../../assets/images/events/catalog/previous/torino-2013-hero.jpg'),
  sydney2009Card: require('../../assets/images/events/catalog/previous/sydney-2009-card.jpg'),
  sydney2009Hero: require('../../assets/images/events/catalog/previous/sydney-2009-hero.jpg'),
};

export function resolveAsset(key?: string): number | undefined {
  if (!key) return undefined;
  return assetMap[key as AssetKey];
}

export function getHeroFallbackColor(key?: string): string {
  switch (key) {
    case 'ksg2026Hero':
      return '#C41E3A';
    case 'wmgKansai2027Hero':
      return colors.primary;
    case 'omgComoLake2027Hero':
      return colors.gradientHeroEnd;
    default:
      return colors.primary;
  }
}
