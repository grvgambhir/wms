// Dev preview for the participant portal shell (WS-A). Open `/participant-shell`:
// desktop shows the dark left sidebar + EN|IT toggle in the header; narrow width
// collapses the sidebar into a hamburger drawer. Clicking nav items switches the
// active highlight (routing is wired to real screens in WS-C).
import { useState } from 'react';
import { View } from 'react-native';

import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import { PARTICIPANT_NAV } from '@/constants/portalNav';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';

export default function ParticipantShellPreview() {
  const [active, setActive] = useState('dashboard');
  const copy = useCopy();
  const activeItem = PARTICIPANT_NAV.flatMap((s) => s.items).find((i) => i.id === active);
  const label = activeItem ? copy[activeItem.labelKey] : active;

  return (
    <ParticipantPortalShell activeId={active} onNavigate={(item) => setActive(item.id)}>
      <View style={{ gap: 8, marginBottom: 20 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>{label}</Text>
        <Text style={{ color: colors.textMuted }}>
          Participant Portal — WS-A shell preview. Resize the window to see the sidebar collapse into
          a hamburger drawer; toggle EN|IT in the header.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={{
              flexGrow: 1,
              minWidth: 220,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              gap: 6,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Placeholder card {n}</Text>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>
              Content area
            </Text>
          </View>
        ))}
      </View>
    </ParticipantPortalShell>
  );
}
