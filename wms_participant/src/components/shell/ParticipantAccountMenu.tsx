import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

export type ParticipantAccountMenuLabels = {
  menu: string;
  signedInAs: string;
  logout: string;
  loggingOut: string;
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

type ParticipantAccountMenuProps = {
  userName: string;
  /** Login identifier (email) — shown under the name in the dropdown, industry-menu style. */
  userEmail?: string;
  labels: ParticipantAccountMenuLabels;
  onSignOut: () => void;
  signingOut: boolean;
};

export function ParticipantAccountMenu({
  userName,
  userEmail,
  labels,
  onSignOut,
  signingOut,
}: ParticipantAccountMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.menu}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
            {initials(userName)}
          </Text>
        </View>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
          {userName}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>▾</Text>
      </Pressable>
      {open ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 44,
            minWidth: 220,
            zIndex: 80,
            elevation: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingVertical: 8,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
          }}>
          <View
            style={{
              paddingHorizontal: 14,
              paddingTop: 6,
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              marginBottom: 4,
            }}>
            <Text
              accessibilityLabel={`${labels.signedInAs} ${userName}`}
              style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}
              numberOfLines={1}>
              {userName}
            </Text>
            {userEmail ? (
              <Text
                style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}>
                {userEmail}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.logout}
            disabled={signingOut}
            onPress={() => {
              onSignOut();
            }}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 14,
            }}>
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 14 }}>
              {signingOut ? labels.loggingOut : labels.logout}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
