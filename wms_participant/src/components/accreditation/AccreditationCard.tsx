import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Share2 } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { Accreditation } from '@/domain/models/accreditation';
import { useAppLayout } from '@/hooks/useAppLayout';
import { countryName, flagEmoji, formatCompactDate } from '@/lib/format';
import { resolvePhotoSource } from '@/lib/photo';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';
import { gradients } from '@/theme/gradients';

type AccreditationCardProps = {
  athleteName: string;
  nationalityCountryCode?: string;
  sportLabel: string;
  categoryLabel: string;
  partnerLabel?: string;
  eventName: string;
  eventLocation: string;
  photoUri?: string;
  accreditation: Accreditation;
};

/** Digital pass card for A16 — photo, QR, access dates (mockup-aligned). */
export function AccreditationCard({
  athleteName,
  nationalityCountryCode,
  sportLabel,
  categoryLabel,
  partnerLabel,
  eventName,
  eventLocation,
  photoUri,
  accreditation,
}: AccreditationCardProps) {
  return (
    <View className="overflow-hidden rounded-2xl border-2 border-primary bg-white">
      <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, paddingBottom: 48 }}>
        <View className="items-center gap-2">
          <WmsMark size="sm" />
          <Text className="text-center text-[11px] font-bold uppercase tracking-[2px] text-white">
            {eventName}
          </Text>
          <Text className="text-center text-[10px] font-semibold uppercase tracking-[1.5px] text-white/80">
            {eventLocation}
          </Text>
        </View>
      </LinearGradient>

      <View className="-mt-10 items-center px-5 pb-5">
        <View className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-primary/10 shadow-md">
          {resolvePhotoSource(photoUri) ? (
            <Image
              source={resolvePhotoSource(photoUri)}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-3xl font-bold text-primary">{athleteName.slice(0, 1)}</Text>
            </View>
          )}
        </View>

        <Text className="mt-3 text-center text-2xl font-bold text-foreground">{athleteName}</Text>
        {nationalityCountryCode ? (
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {countryName(nationalityCountryCode)} {flagEmoji(nationalityCountryCode)}
          </Text>
        ) : null}
        <Text className="mt-1 text-center text-sm text-foreground">
          {sportLabel} · {categoryLabel}
        </Text>
        {partnerLabel ? (
          <Text className="mt-1 text-center text-xs text-muted-foreground">
            {copy.accreditationPartner}: {partnerLabel}
          </Text>
        ) : null}

        <View className="mt-3 rounded-full bg-emerald-600 px-4 py-1.5">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-white">
            {copy.accreditationAccredited}
          </Text>
        </View>

        <View className="mt-5 items-center rounded-xl bg-white p-3">
          <QRCode value={accreditation.qrValue} size={168} />
        </View>
        <Text className="mt-2 text-xs font-mono text-muted-foreground">
          {copy.accreditationId}: {accreditation.badgeNumber}
        </Text>

        <View className="mt-4 w-full flex-row overflow-hidden rounded-xl border border-border">
          <View className="flex-1 items-center gap-0.5 px-3 py-3">
            <Text className="text-[10px] uppercase text-muted-foreground">{copy.accreditationAccess}</Text>
            <Text className="text-sm font-semibold text-foreground">{accreditation.accessLevel}</Text>
          </View>
          <View className="w-px bg-border" />
          <View className="flex-1 items-center gap-0.5 px-3 py-3">
            <Text className="text-[10px] uppercase text-muted-foreground">{copy.accreditationValid}</Text>
            <Text className="text-center text-xs font-semibold text-foreground">
              {formatCompactDate(accreditation.validFrom)} – {formatCompactDate(accreditation.validUntil)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Share stub on A16; GamesHub stays the bottom-bar primary CTA. */
export function AccreditationPassActions() {
  return (
    <View className="gap-3">
      <Text className="text-center text-xs text-muted-foreground">{copy.accreditationShowPass}</Text>
      <Pressable
        onPress={() => Alert.alert(copy.accreditationShare, copy.accreditationShareStub)}
        className="h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-border bg-white active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={copy.accreditationShare}>
        <Share2 size={18} color={colors.primary} />
        <Text className="text-sm font-semibold text-primary">{copy.accreditationShare}</Text>
      </Pressable>
    </View>
  );
}

/** Pass card plus venue hint / share. Wide web keeps the pass readable, not a wallet column. */
export function AccreditationPassBody(props: AccreditationCardProps) {
  const { isWideWeb } = useAppLayout();

  return (
    <View className="gap-4">
      <View className={cn(isWideWeb && 'max-w-lg')}>
        <AccreditationCard {...props} />
      </View>
      <View className={cn(isWideWeb && 'max-w-lg')}>
        <AccreditationPassActions />
      </View>
    </View>
  );
}