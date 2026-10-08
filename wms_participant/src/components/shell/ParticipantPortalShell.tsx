// Participant portal shell (WS-A) — Como Lake 2027 branding, EN|IT toggle,
// notification bell and user chip in the header. Wraps page content; nav
// selection is reported via onNavigate (routing wired in WS-C).
import { type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { View } from 'react-native';

import { ParticipantAccountMenu } from '@/components/shell/ParticipantAccountMenu';
import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { PortalShell } from '@/components/shell/PortalShell';
import { useToast } from '@/components/ui/toast';
import { PARTICIPANT_NAV, type PortalNavItem } from '@/constants/portalNav';
import { usePortalUserEmail, usePortalUserName, useSignOut } from '@/features/auth/hooks/useAuth';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';
import { portalTheme } from '@/theme/portal';

type ParticipantPortalShellProps = {
  activeId: string;
  children: ReactNode;
  onNavigate?: (item: PortalNavItem) => void;
  userName?: string;
};

export function ParticipantPortalShell({
  activeId,
  children,
  onNavigate,
  userName,
}: ParticipantPortalShellProps) {
  const router = useRouter();
  const copy = useCopy();
  const { showToast } = useToast();
  const signOut = useSignOut();
  const resolvedName = usePortalUserName(userName, copy.accountAthleteFallback);
  const resolvedEmail = usePortalUserEmail();

  const handleLogout = async () => {
    await signOut.mutateAsync();
    showToast({
      title: copy.toastSignedOut,
      description: copy.toastSignedOutBody,
      variant: 'info',
    });
  };

  return (
    <PortalShell
      brand={{
        title: copy.portalParticipantBrandTitle,
        subtitle: copy.portalParticipantBrandSubtitle,
      }}
      sections={PARTICIPANT_NAV}
      activeId={activeId}
      theme={portalTheme}
      topbarRight={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 90, overflow: 'visible' }}>
          <LanguageToggle />
          <Bell size={20} color={colors.textMuted} />
          <ParticipantAccountMenu
            userName={resolvedName}
            userEmail={resolvedEmail}
            labels={{
              menu: copy.accountMenuA11y,
              signedInAs: copy.cognitoSignedInAs,
              logout: copy.accountLogout,
              loggingOut: copy.accountLoggingOut,
            }}
            onSignOut={() => void handleLogout()}
            signingOut={signOut.isPending}
          />
        </View>
      }
      onNavigate={(item) => {
        if (onNavigate) {
          onNavigate(item);
          return;
        }
        if (item.href) router.push(item.href);
      }}>
      {children}
    </PortalShell>
  );
}
