// P11 — Partner Finder / invite. A request stays pending until the invited athlete answers
// from their own Cognito session; this screen only reflects the server-side lifecycle.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  CheckCircle2,
  Clock,
  Search,
  UserPlus,
  Users,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { ParticipantPortalShell } from "@/components/shell/ParticipantPortalShell";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { repositories } from "@/data/providers/repositories";
import type { AthleteProfile, AthleteSummary } from "@/domain/models/athlete";
import { useRegistrationJourney } from "@/features/registration/RegistrationJourneyContext";

import { useCopy } from "@/i18n";
import { colors } from "@/theme/colors";

type InviteStatus = "idle" | "pending" | "accepted";

export default function PartnerFinderScreen() {
  const copy = useCopy();
  const router = useRouter();
  const { showToast } = useToast();
  const journey = useRegistrationJourney();

  const [query, setQuery] = useState("");
  const [invites, setInvites] = useState<Record<string, InviteStatus>>({});
  const [inviteError, setInviteError] = useState<string | null>(null);

  // The journey's `partners` list is only the partner already linked to this entry, and it
  // carries athlete-profile ids — inviting one was refused with `partner.athlete.not_found`
  // because the endpoint identifies athletes by person id. Candidates come from the real search.
  const [candidates, setCandidates] = useState<AthleteSummary[]>([]);
  const isDoubles = journey.selectedProduct?.partnerRequired ?? true;
  const refreshInvites = useCallback(async () => {
    const snapshot = journey.snapshot;
    if (!snapshot || !isDoubles) return;
    try {
      const requests = await repositories.partners.listRequests(
        snapshot.event.id,
        snapshot.athlete.id,
      );
      const next = requests.reduce<Record<string, InviteStatus>>(
        (result, request) => {
          if (
            request.fromAthleteId === snapshot.athlete.id &&
            (request.status === "pending" || request.status === "accepted")
          ) {
            result[request.toAthleteId] = request.status;
          }
          return result;
        },
        {},
      );
      setInvites(next);
      const accepted = requests.find(
        (request) =>
          request.fromAthleteId === snapshot.athlete.id &&
          request.status === "accepted",
      );
      if (accepted) {
        journey.selectPartner(accepted.toAthleteId);
        void journey.retry();
      }
    } catch (caught) {
      setInviteError(
        caught instanceof Error ? caught.message : copy.p11InviteError,
      );
    }
  }, [copy.p11InviteError, isDoubles, journey]);

  useEffect(() => {
    void refreshInvites();
    const interval = setInterval(() => void refreshInvites(), 10_000);
    return () => clearInterval(interval);
  }, [refreshInvites]);
  // "Confirmed" is driven by an accepted invitation IN this flow (not the journey's
  // default selection) so the invite → pending → accepted lifecycle is visible.
  const acceptedId = Object.keys(invites).find(
    (id) => invites[id] === "accepted",
  );
  const confirmed = candidates.find((athlete) => athlete.id === acceptedId);

  const searchCandidates = useCallback(async () => {
    const snapshot = journey.snapshot;
    const product = journey.selectedProduct;
    if (!snapshot || !product || !isDoubles) return;
    try {
      const found = await repositories.partners.searchPartners({
        eventId: snapshot.event.id,
        categoryId: product.id,
        sportId: snapshot.entry.sportId,
        query: query.trim() || undefined,
      });
      // The search returns person ids; the athlete's own profile id is a different id, so a
      // self-match is filtered by name-less comparison against the request list instead.
      setCandidates(found);
    } catch (caught) {
      setInviteError(
        caught instanceof Error ? caught.message : copy.p11InviteError,
      );
    }
  }, [copy.p11InviteError, isDoubles, journey, query]);

  useEffect(() => {
    const timer = setTimeout(() => void searchCandidates(), 250);
    return () => clearTimeout(timer);
  }, [searchCandidates]);

  const filtered = candidates;

  const invite = async (athlete: AthleteSummary) => {
    const snapshot = journey.snapshot;
    const product = journey.selectedProduct;
    if (!snapshot || !product) return;
    setInviteError(null);
    try {
      const request = await repositories.partners.sendPartnerRequest({
        eventId: snapshot.event.id,
        // A request's category is only a finder filter. The server derives the real doubles
        // category from the pinned entry rule when the other athlete accepts.
        categoryId: product.id,
        fromAthleteId: snapshot.athlete.id,
        toAthleteId: athlete.id,
        entryId: snapshot.entry.id,
      });
      setInvites((prev) => ({
        ...prev,
        [athlete.id]: request.status === "accepted" ? "accepted" : "pending",
      }));
      showToast({ title: copy.p11PendingReal, variant: "info" });
    } catch (caught) {
      setInviteError(
        caught instanceof Error ? caught.message : copy.p11InviteError,
      );
    }
  };

  return (
    <ParticipantPortalShell activeId="team">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
        My Entries › {copy.p11Breadcrumb}
      </Text>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 26,
          fontWeight: "800",
          color: colors.text,
          marginTop: 6,
        }}
      >
        {copy.p11Title}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>
        {copy.p11Subtitle}
      </Text>

      {journey.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !isDoubles ? (
        <View style={{ ...card, maxWidth: 560, gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {copy.p11NotDoublesTitle}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {copy.p11NotDoublesBody}
          </Text>
        </View>
      ) : (
        <View style={{ maxWidth: 620, gap: 16 }}>
          {/* Confirmed partner */}
          {confirmed ? (
            <View
              style={{
                ...card,
                borderColor: "rgba(22,163,74,0.4)",
                backgroundColor: "rgba(22,163,74,0.06)",
                gap: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <CheckCircle2 size={20} color={colors.success} />
                <Text
                  style={{
                    fontWeight: "800",
                    color: colors.text,
                    fontSize: 16,
                  }}
                >
                  {copy.p11ConfirmedTitle}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {copy.p11ConfirmedBody.replace(
                  "{name}",
                  `${confirmed.firstName} ${confirmed.lastName}`,
                )}
              </Text>
              <Pressable
                onPress={() => router.push("/sport-entry")}
                accessibilityRole="button"
                accessibilityLabel={copy.p11ContinueEntry}
                style={{
                  ...btnPrimary,
                  alignSelf: "flex-start",
                  paddingHorizontal: 20,
                  minHeight: 44,
                }}
              >
                <Text
                  style={{
                    color: colors.primaryForeground,
                    fontWeight: "800",
                    fontSize: 15,
                  }}
                >
                  {copy.p11ContinueEntry}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              backgroundColor: colors.surface,
            }}
          >
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.p11SearchPlaceholder}
              accessibilityLabel={copy.p11SearchPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                paddingVertical: 12,
                color: colors.text,
                fontSize: 14,
                minHeight: 44,
              }}
            />
          </View>

          {/* Candidates */}
          <View style={{ gap: 10 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Users size={16} color={colors.textMuted} />
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                }}
              >
                {copy.p11Candidates}
              </Text>
            </View>

            {filtered.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {copy.p11Empty}
              </Text>
            ) : (
              filtered.map((athlete) => {
                const status = invites[athlete.id] ?? "idle";
                return (
                  <View
                    key={athlete.id}
                    style={{
                      ...card,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        backgroundColor: colors.surfaceMuted,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "800",
                          fontSize: 13,
                        }}
                      >
                        {athlete.firstName[0]}
                        {athlete.lastName[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        {athlete.firstName} {athlete.lastName}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {athlete.nationalityCountryCode} ·{" "}
                        {copy.p11Born.replace("{date}", athlete.dateOfBirth)}
                      </Text>
                    </View>

                    {status === "accepted" ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <CheckCircle2 size={16} color={colors.success} />
                        <Text
                          style={{
                            color: colors.success,
                            fontWeight: "700",
                            fontSize: 13,
                          }}
                        >
                          {copy.p11Accepted}
                        </Text>
                      </View>
                    ) : status === "pending" ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Clock size={15} color={colors.warning} />
                        <Text
                          style={{
                            color: colors.warning,
                            fontWeight: "600",
                            fontSize: 12,
                          }}
                        >
                          {copy.p11Pending}
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void invite(athlete)}
                        accessibilityRole="button"
                        accessibilityLabel={copy.p11Invite}
                        style={{ ...btnInvite, minHeight: 44 }}
                      >
                        <UserPlus size={15} color={colors.primaryForeground} />
                        <Text
                          style={{
                            color: colors.primaryForeground,
                            fontWeight: "700",
                            fontSize: 13,
                          }}
                        >
                          {copy.p11Invite}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      )}

      {inviteError ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.danger, fontSize: 13, marginTop: 14 }}
        >
          {inviteError}
        </Text>
      ) : null}

      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 24 }}>
        {copy.p11Disclaimer}
      </Text>
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

const btnPrimary = {
  backgroundColor: colors.primary,
  borderRadius: 10,
  paddingVertical: 14,
  paddingHorizontal: 18,
  alignItems: "center",
} as const;

const btnInvite = {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  backgroundColor: colors.primary,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 9,
} as const;
