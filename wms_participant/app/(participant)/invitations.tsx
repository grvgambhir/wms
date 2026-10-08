import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, XCircle } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import { repositories } from '@/data/providers/repositories';
import type { IncomingInvitation } from '@/domain/models/partner';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';

/** The recipient-owned half of partner and team invitations (REG-07). */
export default function InvitationsScreen() {
  const copy = useCopy();
  const [invitations, setInvitations] = useState<IncomingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvitations(await repositories.partners.listIncomingInvitations());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.invitationsError);
    } finally {
      setLoading(false);
    }
  }, [copy.invitationsError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const respond = async (invitation: IncomingInvitation, decision: 'accepted' | 'declined') => {
    setActingId(invitation.id);
    setError(null);
    try {
      if (invitation.kind === 'team') {
        await repositories.teamRosters.respondToInvitation(invitation.id, decision);
      } else {
        await repositories.partners.respondToPartnerRequest(invitation.id, decision);
      }
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.invitationsError);
    } finally {
      setActingId(null);
    }
  };

  return (
    <ParticipantPortalShell activeId="team">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.invitationsBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 6 }}>
        {copy.invitationsTitle}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>{copy.invitationsSubtitle}</Text>

      {loading ? (
        <View style={{ padding: 36, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : invitations.length === 0 ? (
        <View style={card}>
          <Inbox size={22} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 8 }}>{copy.invitationsEmpty}</Text>
        </View>
      ) : (
        <View style={{ gap: 12, maxWidth: 700 }}>
          {invitations.map((invitation) => (
            <View key={`${invitation.kind}-${invitation.id}`} style={card}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
                {invitation.kind === 'team'
                  ? copy.invitationsTeam.replace('{name}', invitation.fromName).replace('{team}', invitation.teamName)
                  : copy.invitationsPartner.replace('{name}', invitation.fromName)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>
                {invitation.kind === 'team' && invitation.role ? copy.invitationsRole.replace('{role}', invitation.role) : copy.invitationsAnswerHint}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable disabled={actingId !== null} onPress={() => void respond(invitation, 'accepted')} style={acceptButton}>
                  <CheckCircle2 size={16} color={colors.primaryForeground} />
                  <Text style={acceptText}>{actingId === invitation.id ? copy.invitationsSaving : copy.invitationsAccept}</Text>
                </Pressable>
                <Pressable disabled={actingId !== null} onPress={() => void respond(invitation, 'declined')} style={declineButton}>
                  <XCircle size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.invitationsDecline}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 14 }}>{error}</Text> : null}
    </ParticipantPortalShell>
  );
}

const card = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 14,
  padding: 16,
} as const;

const acceptButton = {
  backgroundColor: colors.primary,
  borderRadius: 9,
  paddingHorizontal: 14,
  paddingVertical: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
} as const;

const acceptText = { color: colors.primaryForeground, fontWeight: '800' } as const;

const declineButton = {
  borderWidth: 1,
  borderColor: colors.primary,
  borderRadius: 9,
  paddingHorizontal: 14,
  paddingVertical: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
} as const;
