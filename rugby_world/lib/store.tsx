"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Article,
  Certificate,
  Competition,
  CompetitionStatus,
  Course,
  CourseCategory,
  CourseMaterial,
  CourseModule,
  FederationLicense,
  FederationNode,
  FederationNodeKind,
  LicenseContact,
  HiaOutcome,
  Learner,
  Match,
  MatchOfficials,
  MatchScoreEvent,
  OpsModule,
  OpsStatus,
  Player,
  PoolStanding,
  RankingCategory,
  RugbyFormat,
  RtpStatus,
  SessionUser,
  Team,
  TmsModule,
  TournamentOpsItem,
  Venue,
} from "./types";
import { createSeedState, DEMO_PASSWORD, DEMO_USER } from "./seed";
import { starterOps } from "./seed-ops";
import { applyRankingDeltas, projectExchange } from "./ranking-engine";
import { pairKey, roundRobinPairings } from "./round-robin";
import { SCORE_POINTS, recomputePoolStandings, scoresFromEvents } from "./match-card";
import { normalizeStructure, structureNeedsKnockout } from "./tournament-hub";
import { buildKnockoutSlots, isKnockoutMatch } from "./bracket";
import { buildConcussionCase, type ConcussionDraft } from "./concussion";
import { examForCourse, examScore, isOnCourse, nextCredentialId, resultForScore } from "./education";
import { nextLicenseKey } from "./licenses";
import { matchDeskUntouched } from "./seed-rwc-pools";

const STATE_KEY = "wr-admin-state-v9";
const SESSION_KEY = "wr-admin-session-v1";

type StoreContextValue = {
  hydrated: boolean;
  session: SessionUser | null;
  state: AppState;
  login: (email: string, password: string) => { ok: boolean; message: string };
  logout: () => void;
  resetDemo: () => void;
  enterMatchResult: (matchId: string, homeScore: number, awayScore: number) => string | null;
  updateLiveScore: (matchId: string, homeScore: number, awayScore: number) => void;
  addMatchEvent: (matchId: string, input: Omit<MatchScoreEvent, "id" | "points">) => void;
  removeMatchEvent: (matchId: string, eventId: string) => void;
  completeHia: (caseId: string, stage: "HIA1" | "HIA2" | "HIA3", outcome: HiaOutcome, notes: string) => void;
  setRtpStage: (caseId: string, stage: number, status: Extract<RtpStatus, "cleared" | "hold">) => void;
  createConcussionCase: (draft: ConcussionDraft) => string | null;
  startMatchClock: (matchId: string) => void;
  pauseMatchClock: (matchId: string) => void;
  resetMatchClock: (matchId: string) => void;
  kickOffMatch: (matchId: string) => void;
  callHalfTime: (matchId: string) => void;
  startSecondHalf: (matchId: string, halfMinutes?: number) => void;
  saveArticle: (article: Article) => void;
  publishArticle: (id: string) => void;
  setPageStatus: (id: string, status: "draft" | "published") => void;
  moveHomepageBlock: (id: string, direction: "up" | "down") => void;
  toggleHomepageBlock: (id: string) => void;
  decideApplication: (id: string, decision: "approved" | "rejected") => void;
  addUnionNote: (unionId: string, note: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  createCompetition: (input: {
    name: string;
    shortName: string;
    season: string;
    location: string;
    startDate: string;
    endDate: string;
    description: string;
    status: CompetitionStatus;
    format: RugbyFormat;
    hostCountry: string;
    hostUnion: string;
    organiser: string;
    hostCities: string;
    structure: string;
    lawNotes: string;
    broadcaster: string;
    licenseId?: string;
    ownerUnionId?: string;
  }) => string;
  updateCompetition: (id: string, patch: Partial<Competition>) => void;
  deleteCompetition: (id: string) => void;
  createVenue: (input: {
    name: string;
    city: string;
    country: string;
    capacity: number;
    competitionId: string;
    shortName: string;
  }) => string;
  attachVenueToCompetition: (venueId: string, shortName: string) => void;
  createOpsItem: (input: {
    competitionId: string;
    module: OpsModule;
    title: string;
    meta: string;
    owner: string;
    status: OpsStatus;
  }) => string;
  updateOpsItem: (item: TournamentOpsItem) => void;
  createMatch: (input: {
    competitionId: string;
    round: string;
    kickoff: string;
    venueId: string;
    homeTeamId: string;
    awayTeamId: string;
    referee: string;
    ar1: string;
    ar2: string;
    tmo: string;
    feedsRankings: boolean;
  }) => string | null;
  createTeam: (input: { name: string; flag: string; unionId: string; coach: string; competitionId: string; pool?: string }) => string;
  attachTeamToCompetition: (teamId: string, competitionId: string, poolName?: string) => void;
  createGroup: (competitionId: string, name: string) => boolean;
  assignTeamToGroup: (competitionId: string, teamId: string, poolName: string) => void;
  generateRoundRobinSchedule: (competitionId: string) => number;
  generateKnockoutBracket: (competitionId: string) => number;
  updateMatchOfficials: (matchId: string, officials: MatchOfficials) => void;
  createPlayer: (input: Omit<Player, "id">) => string;
  updatePlayer: (player: Player) => void;
  createCourse: (input: {
    title: string;
    category: CourseCategory;
    durationHours: number;
    targetRole: string;
    passMark: number;
    mandatory: boolean;
    awardsCertificate: boolean;
    description: string;
    modules: CourseModule[];
  }) => string;
  addCourseModule: (courseId: string, module: CourseModule) => void;
  addCourseMaterial: (input: Omit<CourseMaterial, "id">) => string;
  setCourseStatus: (id: string, status: "draft" | "published") => void;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  enrollLearner: (input: { courseId: string; name: string; unionId: string; role?: string }) => string | null;
  decideEnrolment: (learnerId: string, decision: "accepted" | "declined", note?: string) => boolean;
  recordLearnerResult: (learnerId: string, score: number) => boolean;
  issueCertificate: (input: { learnerId: string; expiresAt?: string }) => string | null;
  saveExamAnswers: (learnerId: string, answers: { questionId: string; selectedIndex: number }[]) => boolean;
  submitProject: (learnerId: string, input: { title: string; fileName: string; notes: string }) => boolean;
  createLicense: (input: {
    unionId: string;
    modules: TmsModule[];
    startsAt: string;
    endsAt: string;
    seats: number;
    contactName: string;
    contactRole?: string;
    contactEmail?: string;
    contactPhone?: string;
    billingEmail?: string;
    officePhone?: string;
    officeAddress?: string;
    autoRenew?: boolean;
    notes?: string;
  }) => string | null;
  updateLicense: (id: string, patch: Partial<FederationLicense>) => void;
  addFederationNode: (input: {
    unionId: string;
    parentId: string | null;
    kind: FederationNodeKind;
    name: string;
    city?: string;
  }) => string | null;
};

const StoreContext = createContext<StoreContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function certificateForLearner(prev: AppState, learner: Learner, expiresAt?: string): Certificate {
  const years = learner.courseId === "course-concussion" || learner.courseId === "course-firstaid" ? 3 : 0;
  const issued = new Date();
  return {
    id: `cert-${Date.now()}`,
    holder: learner.name,
    unionName: learner.unionName,
    unionId: learner.unionId,
    courseId: learner.courseId,
    learnerId: learner.id,
    issuedAt: nowIso(),
    expiresAt:
      expiresAt ||
      (years
        ? new Date(Date.UTC(issued.getUTCFullYear() + years, issued.getUTCMonth(), issued.getUTCDate())).toISOString()
        : undefined),
    credentialId: nextCredentialId(learner.courseId, prev.certificates),
  };
}

function emptyStanding(team: { name: string; flag: string }): PoolStanding {
  return {
    team: team.name,
    flag: team.flag,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    bp: 0,
    pts: 0,
  };
}

function withNotification(state: AppState, notification: AppState["notifications"][number]): AppState {
  return { ...state, notifications: [notification, ...state.notifications] };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [state, setState] = useState<AppState>(() => createSeedState());

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const rawState = localStorage.getItem(STATE_KEY);
        const rawSession = localStorage.getItem(SESSION_KEY);
        if (rawState) {
          const parsed = JSON.parse(rawState) as AppState;
          const seed = createSeedState();
          if (!parsed.teams?.length || !parsed.players?.length) {
            parsed.teams = seed.teams;
            parsed.players = seed.players;
          }
          parsed.competitions = (parsed.competitions ?? seed.competitions).map((c) => {
            const fromSeed = seed.competitions.find((s) => s.id === c.id);
            return {
              ...c,
              format: c.format ?? "15s",
              hostCountry: c.hostCountry || fromSeed?.hostCountry || c.location,
              hostUnion: c.hostUnion || fromSeed?.hostUnion || "World Rugby",
              organiser: c.organiser || fromSeed?.organiser || "World Rugby",
              hostCities: c.hostCities || fromSeed?.hostCities || c.location,
              structure: normalizeStructure(c.structure || fromSeed?.structure || ""),
              lawNotes: c.lawNotes || fromSeed?.lawNotes || "",
              broadcaster: c.broadcaster || fromSeed?.broadcaster || "TBC",
            };
          });
          if (!parsed.tournamentOps?.length) {
            parsed.tournamentOps = seed.tournamentOps;
          }
          parsed.courses = (parsed.courses ?? seed.courses).map((c) => ({
            ...c,
            awardsCertificate: c.awardsCertificate ?? true,
            status: c.status ?? "published",
            publishedAt: c.publishedAt ?? (c.status === "draft" ? null : c.publishedAt ?? seed.courses.find((s) => s.id === c.id)?.publishedAt ?? null),
          }));
          if (!parsed.courseMaterials?.length) {
            parsed.courseMaterials = seed.courseMaterials;
          }
          if (
            !parsed.learners?.length ||
            parsed.learners.length < 70 ||
            (parsed.certificates?.length ?? 0) < 30 ||
            parsed.learners.every((row) => !row.role) ||
            parsed.learners.every((row) => !row.examAnswers?.length) ||
            parsed.learners.filter((row) => row.status === "requested").length < 6
          ) {
            parsed.learners = seed.learners;
            parsed.certificates = seed.certificates;
          }
          parsed.certificates = (parsed.certificates ?? seed.certificates).map((cert, index) => ({
            ...cert,
            credentialId: cert.credentialId || `WR-EDU-${String(index + 1).padStart(4, "0")}`,
          }));
          parsed.matches = (parsed.matches ?? seed.matches).map((match) => {
            const seeded = seed.matches.find((row) => row.id === match.id);
            if (!seeded || match.status === "final" || !matchDeskUntouched(match)) return match;
            if (seeded.period === "prematch" && seeded.status !== "final") return seeded;
            return match;
          });
          const matchIds = new Set(parsed.matches.map((match) => match.id));
          for (const seeded of seed.matches) {
            if (!matchIds.has(seeded.id)) parsed.matches.push(seeded);
          }
          if (
            !parsed.licenses?.length ||
            parsed.licenses.some((row) => !row.contacts?.length || row.renewalNoticeDays == null)
          ) {
            const existing = parsed.licenses ?? [];
            const extras = existing.filter((row) => !seed.licenses.some((item) => item.id === row.id));
            parsed.licenses = [
              ...seed.licenses.map((seeded) => {
                const current = existing.find((row) => row.id === seeded.id);
                if (!current) return seeded;
                return {
                  ...seeded,
                  ...current,
                  contacts: current.contacts?.length ? current.contacts : seeded.contacts,
                  billingEmail: current.billingEmail ?? seeded.billingEmail,
                  officePhone: current.officePhone ?? seeded.officePhone,
                  officeAddress: current.officeAddress ?? seeded.officeAddress,
                  autoRenew: current.autoRenew ?? seeded.autoRenew,
                  renewalNoticeDays: current.renewalNoticeDays ?? seeded.renewalNoticeDays,
                  maxTournaments: current.maxTournaments ?? seeded.maxTournaments,
                  supportHours: current.supportHours ?? seeded.supportHours,
                  invoiceRef: current.invoiceRef ?? seeded.invoiceRef,
                  contactEmail: current.contactEmail ?? seeded.contactEmail,
                  contactPhone: current.contactPhone ?? seeded.contactPhone,
                  contactRole: current.contactRole ?? seeded.contactRole,
                  endsAt:
                    current.endsAt === "2026-12-31" && seeded.endsAt !== "2026-12-31"
                      ? seeded.endsAt
                      : current.endsAt,
                };
              }),
              ...extras.map((row) => ({
                ...row,
                contacts: row.contacts ?? [],
              })),
            ];
          }
          parsed.licenses = (parsed.licenses ?? []).map((row) => {
            const seeded = seed.licenses.find((item) => item.id === row.id);
            if (!seeded) return row;
            if (row.endsAt === "2026-12-31" && seeded.endsAt !== "2026-12-31") {
              return { ...row, endsAt: seeded.endsAt };
            }
            return row;
          });
          if (!(parsed.notifications ?? []).some((row) => row.id === "n7")) {
            const extra = seed.notifications.filter((row) => row.id === "n6" || row.id === "n7");
            parsed.notifications = [...extra, ...(parsed.notifications ?? []).filter((row) => row.id !== "n6")];
          }
          if (!parsed.federationNodes?.length || parsed.federationNodes.length < 90) {
            parsed.federationNodes = seed.federationNodes;
          }
          const competitionIds = new Set(parsed.competitions.map((row) => row.id));
          for (const seeded of seed.competitions) {
            if (!competitionIds.has(seeded.id)) parsed.competitions.push(seeded);
          }
          parsed.competitions = parsed.competitions.map((row) => {
            const fromSeed = seed.competitions.find((item) => item.id === row.id);
            return {
              ...row,
              licenseId: row.licenseId ?? fromSeed?.licenseId,
              ownerUnionId: row.ownerUnionId ?? fromSeed?.ownerUnionId,
            };
          });
          setState(parsed);
        }
        if (rawSession) setSession(JSON.parse(rawSession) as SessionUser);
      } catch {
        setState(createSeedState());
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session, hydrated]);

  const login = useCallback((email: string, password: string) => {
    if (email.trim().toLowerCase() !== DEMO_USER.email || password !== DEMO_PASSWORD) {
      return { ok: false, message: "Use the HQ demo credentials shown below the form." };
    }
    setSession(DEMO_USER);
    return { ok: true, message: "Signed in" };
  }, []);

  const logout = useCallback(() => {
    setSession(null);
  }, []);

  const resetDemo = useCallback(() => {
    const seed = createSeedState();
    setState(seed);
    localStorage.setItem(STATE_KEY, JSON.stringify(seed));
  }, []);

  const enterMatchResult = useCallback((matchId: string, homeScore: number, awayScore: number) => {
    let banner: string | null = null;
    setState((prev) => {
      const match = prev.matches.find((m) => m.id === matchId);
      if (!match) return prev;
      const extra =
        match.clockRunning && match.clockStartedAt
          ? Math.max(0, Date.now() - Date.parse(match.clockStartedAt))
          : 0;
      const matches = prev.matches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              homeScore,
              awayScore,
              status: "final" as const,
              period: "full-time" as const,
              clockRunning: false,
              clockStartedAt: null,
              clockElapsedMs: (m.clockElapsedMs ?? 0) + extra,
            }
          : m
      );
      const competitionId = match.competitionId;
      let rankings = prev.rankings;
      if (match.feedsRankings && match.rankingCategory) {
        const category = match.rankingCategory as RankingCategory;
        const table = rankings[category];
        const home = table.find((t) => t.team === match.homeTeam);
        const away = table.find((t) => t.team === match.awayTeam);
        if (home && away) {
          const result = homeScore === awayScore ? "draw" : homeScore > awayScore ? "home" : "away";
          const { homeDelta, awayDelta } = projectExchange(home.points, away.points, result, {
            margin16: Math.abs(homeScore - awayScore) >= 16,
          });
          rankings = {
            ...rankings,
            [category]: applyRankingDeltas(table, match.homeTeam, match.awayTeam, homeDelta, awayDelta),
          };
          const winner = homeScore >= awayScore ? match.homeTeam : match.awayTeam;
          banner = `Result stored. Rankings updated - ${winner} ${homeDelta > 0 || awayDelta > 0 ? "gain points" : "points exchanged"}.`;
        }
      }
      const next = withNotification(
        {
          ...prev,
          matches,
          rankings,
          competitions: prev.competitions.map((c) =>
            c.id === competitionId
              ? { ...c, pools: recomputePoolStandings(c.pools, matches.filter((m) => m.competitionId === c.id)) }
              : c
          ),
        },
        {
          id: `n-result-${matchId}-${Date.now()}`,
          title: `Result: ${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam}`,
          body: match.feedsRankings ? "World Rugby Rankings have been recalculated." : "Match archive updated.",
          href: "/rankings",
          read: false,
          at: nowIso(),
          tone: "success",
        }
      );
      return next;
    });
    return banner;
  }, []);

  const updateLiveScore = useCallback((matchId: string, homeScore: number, awayScore: number) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              homeScore,
              awayScore,
              status: "live" as const,
              clockRunning: m.clockRunning ? true : true,
              clockStartedAt: m.clockRunning ? m.clockStartedAt : nowIso(),
              clockElapsedMs: m.clockElapsedMs ?? 0,
            }
          : m
      ),
    }));
  }, []);

  const addMatchEvent = useCallback((matchId: string, input: Omit<MatchScoreEvent, "id" | "points">) => {
    setState((prev) => {
      const match = prev.matches.find((m) => m.id === matchId);
      if (!match) return prev;
      const nextEvent: MatchScoreEvent = {
        ...input,
        id: `ev-${matchId}-${Date.now()}`,
        points: SCORE_POINTS[input.kind],
      };
      const prior = match.events ?? [];
      const events = [...prior, nextEvent];
      const scores = scoresFromEvents(events);
      const offsetHome = (match.homeScore ?? 0) - scoresFromEvents(prior).home;
      const offsetAway = (match.awayScore ?? 0) - scoresFromEvents(prior).away;
      const status = match.status === "final" ? "final" : "live";
      return {
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                events,
                homeScore: scores.home + offsetHome,
                awayScore: scores.away + offsetAway,
                status,
              }
            : m
        ),
      };
    });
  }, []);

  const removeMatchEvent = useCallback((matchId: string, eventId: string) => {
    setState((prev) => {
      const match = prev.matches.find((m) => m.id === matchId);
      if (!match) return prev;
      const prior = match.events ?? [];
      const events = prior.filter((event) => event.id !== eventId);
      const scores = scoresFromEvents(events);
      const offsetHome = (match.homeScore ?? 0) - scoresFromEvents(prior).home;
      const offsetAway = (match.awayScore ?? 0) - scoresFromEvents(prior).away;
      return {
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                events,
                homeScore: events.length || m.status !== "scheduled" ? scores.home + offsetHome : null,
                awayScore: events.length || m.status !== "scheduled" ? scores.away + offsetAway : null,
              }
            : m
        ),
      };
    });
  }, []);

  const completeHia = useCallback(
    (caseId: string, stage: "HIA1" | "HIA2" | "HIA3", outcome: HiaOutcome, notes: string) => {
      setState((prev) => ({
        ...prev,
        cases: prev.cases.map((c) => {
          if (c.id !== caseId) return c;
          const hia = c.hia.map((h) =>
            h.stage === stage
              ? { ...h, outcome, notes: notes || h.notes, completedAt: nowIso() }
              : h
          );
          const order = { HIA1: 0, HIA2: 1, HIA3: 2, complete: 3 } as const;
          const nextStage =
            stage === "HIA1" ? "HIA2" : stage === "HIA2" ? "HIA3" : "complete";
          let diagnosis = c.diagnosis;
          if (outcome === "diagnose") diagnosis = "confirmed";
          if (outcome === "clear" && stage === "HIA3") diagnosis = "cleared";
          if (outcome === "return" && stage === "HIA1") diagnosis = "closed";
          return {
            ...c,
            hia,
            currentHia: order[nextStage] >= order[c.currentHia] ? nextStage : c.currentHia,
            diagnosis,
          };
        }),
      }));
    },
    []
  );

  const setRtpStage = useCallback(
    (caseId: string, stage: number, status: Extract<RtpStatus, "cleared" | "hold">) => {
      setState((prev) => ({
        ...prev,
        cases: prev.cases.map((c) => {
          if (c.id !== caseId) return c;
          const rtp = c.rtp.map((r) =>
            r.stage === stage
              ? { ...r, status, clearedAt: status === "cleared" ? nowIso() : null }
              : r
          );
          const active = rtp.find((r) => r.status !== "cleared");
          const rtpOverall: RtpStatus = rtp.every((r) => r.status === "cleared")
            ? "cleared"
            : status === "hold"
              ? "hold"
              : "in-progress";
          return { ...c, rtp, rtpOverall: active ? rtpOverall : "cleared" };
        }),
      }));
    },
    []
  );

  const createConcussionCase = useCallback((draft: ConcussionDraft) => {
    let createdId: string | null = null;
    setState((prev) => {
      const already = prev.cases.find(
        (row) =>
          draft.playerId &&
          row.playerId === draft.playerId &&
          row.matchId &&
          draft.matchId &&
          row.matchId === draft.matchId &&
          row.diagnosis !== "closed" &&
          row.diagnosis !== "cleared"
      );
      if (already) {
        createdId = already.id;
        return prev;
      }
      const id = `hia-${Date.now()}`;
      createdId = id;
      const record = buildConcussionCase(id, draft);
      return {
        ...prev,
        cases: [record, ...prev.cases],
        players: draft.playerId
          ? prev.players.map((player) =>
              player.id === draft.playerId ? { ...player, status: "hia" as const } : player
            )
          : prev.players,
        notifications: [
          {
            id: `n-hia-${id}`,
            title: `HIA tagged - ${draft.player}`,
            body: `${draft.matchLabel}${draft.minute != null ? ` · ${draft.minute}'` : ""}`,
            href: `/concussion/${id}`,
            read: false,
            at: nowIso(),
            tone: "alert",
          },
          ...prev.notifications,
        ],
      };
    });
    return createdId;
  }, []);

  const startMatchClock = useCallback((matchId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => {
        if (m.id !== matchId || m.clockRunning) return m;
        return {
          ...m,
          status: m.status === "final" ? m.status : "live",
          period: m.period === "prematch" || !m.period ? "first-half" : m.period,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          clockRunning: true,
          clockStartedAt: nowIso(),
          clockElapsedMs: m.clockElapsedMs ?? 0,
        };
      }),
    }));
  }, []);

  const pauseMatchClock = useCallback((matchId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => {
        if (m.id !== matchId || !m.clockRunning) return m;
        const extra = m.clockStartedAt ? Math.max(0, Date.now() - Date.parse(m.clockStartedAt)) : 0;
        return {
          ...m,
          clockRunning: false,
          clockStartedAt: null,
          clockElapsedMs: (m.clockElapsedMs ?? 0) + extra,
        };
      }),
    }));
  }, []);

  const resetMatchClock = useCallback((matchId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              clockRunning: false,
              clockStartedAt: null,
              clockElapsedMs: 0,
              period: "prematch",
              status: m.status === "final" ? m.status : "scheduled",
            }
          : m
      ),
    }));
  }, []);

  const freezeClock = (m: Match) => {
    const extra = m.clockRunning && m.clockStartedAt ? Math.max(0, Date.now() - Date.parse(m.clockStartedAt)) : 0;
    return {
      clockRunning: false as const,
      clockStartedAt: null,
      clockElapsedMs: (m.clockElapsedMs ?? 0) + extra,
    };
  };

  const kickOffMatch = useCallback((matchId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => {
        if (m.id !== matchId || m.status === "final") return m;
        return {
          ...m,
          status: "live" as const,
          period: "first-half" as const,
          homeScore: m.events?.length ? (m.homeScore ?? 0) : 0,
          awayScore: m.events?.length ? (m.awayScore ?? 0) : 0,
          clockRunning: true,
          clockStartedAt: nowIso(),
          clockElapsedMs: 0,
        };
      }),
    }));
  }, []);

  const callHalfTime = useCallback((matchId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          status: "live" as const,
          period: "half-time" as const,
          ...freezeClock(m),
        };
      }),
    }));
  }, []);

  const startSecondHalf = useCallback((matchId: string, halfMinutes = 40) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => {
        if (m.id !== matchId || m.status === "final") return m;
        const frozen = freezeClock(m);
        const halfMs = halfMinutes * 60 * 1000;
        return {
          ...m,
          status: "live" as const,
          period: "second-half" as const,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          clockRunning: true,
          clockStartedAt: nowIso(),
          clockElapsedMs: Math.max(frozen.clockElapsedMs, halfMs),
        };
      }),
    }));
  }, []);

  const saveArticle = useCallback((article: Article) => {
    setState((prev) => ({
      ...prev,
      articles: prev.articles.some((a) => a.id === article.id)
        ? prev.articles.map((a) => (a.id === article.id ? { ...article, updatedAt: nowIso() } : a))
        : [{ ...article, updatedAt: nowIso() }, ...prev.articles],
    }));
  }, []);

  const publishArticle = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      articles: prev.articles.map((a) =>
        a.id === id
          ? { ...a, status: "published", publishedAt: nowIso(), updatedAt: nowIso() }
          : a
      ),
    }));
  }, []);

  const setPageStatus = useCallback((id: string, status: "draft" | "published") => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === id ? { ...p, status, updatedAt: nowIso() } : p)),
    }));
  }, []);

  const moveHomepageBlock = useCallback((id: string, direction: "up" | "down") => {
    setState((prev) => {
      const blocks = [...prev.homepageBlocks];
      const index = blocks.findIndex((b) => b.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return prev;
      const [item] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, item);
      return { ...prev, homepageBlocks: blocks };
    });
  }, []);

  const toggleHomepageBlock = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      homepageBlocks: prev.homepageBlocks.map((b) =>
        b.id === id ? { ...b, enabled: !b.enabled } : b
      ),
    }));
  }, []);

  const decideApplication = useCallback((id: string, decision: "approved" | "rejected") => {
    setState((prev) => ({
      ...prev,
      applications: prev.applications.map((a) =>
        a.id === id ? { ...a, status: decision } : a
      ),
    }));
  }, []);

  const addUnionNote = useCallback((unionId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      unions: prev.unions.map((u) =>
        u.id === unionId ? { ...u, notes: [note, ...u.notes] } : u
      ),
    }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const createCompetition = useCallback((input: {
    name: string;
    shortName: string;
    season: string;
    location: string;
    startDate: string;
    endDate: string;
    description: string;
    status: CompetitionStatus;
    format: RugbyFormat;
    hostCountry: string;
    hostUnion: string;
    organiser: string;
    hostCities: string;
    structure: string;
    lawNotes: string;
    broadcaster: string;
    licenseId?: string;
    ownerUnionId?: string;
  }) => {
    const id = `comp-${Date.now()}`;
    const competition: Competition = {
      ...input,
      id,
      teams: 0,
      matches: 0,
      hero: false,
      pools: [],
    };
    setState((prev) => ({
      ...prev,
      competitions: [competition, ...prev.competitions],
      tournamentOps: [...starterOps(id), ...prev.tournamentOps],
    }));
    return id;
  }, []);

  const updateCompetition = useCallback((id: string, patch: Partial<Competition>) => {
    setState((prev) => ({
      ...prev,
      competitions: prev.competitions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const deleteCompetition = useCallback((id: string) => {
    setState((prev) => {
      const competition = prev.competitions.find((c) => c.id === id);
      const labels = new Set(
        [competition?.id, competition?.shortName, competition?.name].filter(Boolean) as string[]
      );
      return {
        ...prev,
        competitions: prev.competitions.filter((c) => c.id !== id),
        matches: prev.matches.filter((m) => m.competitionId !== id),
        tournamentOps: prev.tournamentOps.filter((item) => item.competitionId !== id),
        teams: prev.teams.map((t) => ({
          ...t,
          competitionIds: t.competitionIds.filter((cid) => cid !== id),
        })),
        venues: prev.venues.map((v) => ({
          ...v,
          competitions: v.competitions.filter((label) => !labels.has(label)),
        })),
      };
    });
  }, []);

  const createVenue = useCallback((input: {
    name: string;
    city: string;
    country: string;
    capacity: number;
    competitionId: string;
    shortName: string;
  }) => {
    const id = `venue-${Date.now()}`;
    const venue: Venue = {
      id,
      name: input.name,
      city: input.city,
      country: input.country,
      capacity: input.capacity,
      competitions: [input.shortName],
    };
    setState((prev) => ({ ...prev, venues: [...prev.venues, venue] }));
    return id;
  }, []);

  const attachVenueToCompetition = useCallback((venueId: string, shortName: string) => {
    setState((prev) => ({
      ...prev,
      venues: prev.venues.map((v) =>
        v.id === venueId && !v.competitions.includes(shortName)
          ? { ...v, competitions: [...v.competitions, shortName] }
          : v
      ),
    }));
  }, []);

  const createOpsItem = useCallback((input: {
    competitionId: string;
    module: OpsModule;
    title: string;
    meta: string;
    owner: string;
    status: OpsStatus;
  }) => {
    const id = `ops-${input.competitionId}-${Date.now()}`;
    const item: TournamentOpsItem = { id, ...input };
    setState((prev) => ({ ...prev, tournamentOps: [item, ...prev.tournamentOps] }));
    return id;
  }, []);

  const updateOpsItem = useCallback((item: TournamentOpsItem) => {
    setState((prev) => ({
      ...prev,
      tournamentOps: prev.tournamentOps.map((row) => (row.id === item.id ? item : row)),
    }));
  }, []);

  const createMatch = useCallback((input: {
    competitionId: string;
    round: string;
    kickoff: string;
    venueId: string;
    homeTeamId: string;
    awayTeamId: string;
    referee: string;
    ar1: string;
    ar2: string;
    tmo: string;
    feedsRankings: boolean;
  }) => {
    let createdId: string | null = null;
    setState((prev) => {
      const home = prev.teams.find((t) => t.id === input.homeTeamId);
      const away = prev.teams.find((t) => t.id === input.awayTeamId);
      if (!home || !away) return prev;
      const id = `match-${Date.now()}`;
      createdId = id;
      const match: Match = {
        id,
        competitionId: input.competitionId,
        round: input.round,
        kickoff: input.kickoff,
        venueId: input.venueId,
        homeTeam: home.name,
        homeFlag: home.flag,
        awayTeam: away.name,
        awayFlag: away.flag,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: null,
        awayScore: null,
        status: "scheduled",
        period: "prematch",
        events: [],
        officials: {
          referee: input.referee || "TBC",
          ar1: input.ar1 || "TBC",
          ar2: input.ar2 || "TBC",
          tmo: input.tmo || "TBC",
        },
        feedsRankings: input.feedsRankings,
        rankingCategory: input.feedsRankings ? "mens-15s" : undefined,
      };
      return {
        ...prev,
        matches: [match, ...prev.matches],
        competitions: prev.competitions.map((c) =>
          c.id === input.competitionId ? { ...c, matches: c.matches + 1 } : c
        ),
        teams: prev.teams.map((t) =>
          t.id === home.id || t.id === away.id
            ? {
                ...t,
                competitionIds: t.competitionIds.includes(input.competitionId)
                  ? t.competitionIds
                  : [...t.competitionIds, input.competitionId],
              }
            : t
        ),
      };
    });
    return createdId;
  }, []);

  const createTeam = useCallback((input: {
    name: string;
    flag: string;
    unionId: string;
    coach: string;
    competitionId: string;
    pool?: string;
  }) => {
    const id = `team-${Date.now()}`;
    const team: Team = {
      id,
      name: input.name,
      flag: input.flag,
      unionId: input.unionId,
      coach: input.coach,
      competitionIds: [input.competitionId],
      pool: input.pool,
    };
    setState((prev) => ({
      ...prev,
      teams: [...prev.teams, team],
      competitions: prev.competitions.map((c) => {
        if (c.id !== input.competitionId) return c;
        const pools = c.pools ?? [];
        const nextPools =
          input.pool && pools.some((p) => p.name === input.pool)
            ? pools.map((p) =>
                p.name === input.pool
                  ? { ...p, standings: [...p.standings.filter((row) => row.team !== team.name), emptyStanding(team)] }
                  : p
              )
            : pools;
        return { ...c, teams: c.teams + 1, pools: nextPools };
      }),
    }));
    return id;
  }, []);

  const attachTeamToCompetition = useCallback((teamId: string, competitionId: string, poolName?: string) => {
    setState((prev) => {
      const team = prev.teams.find((t) => t.id === teamId);
      if (!team) return prev;
      const already = team.competitionIds.includes(competitionId);
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === teamId
            ? {
                ...t,
                competitionIds: already ? t.competitionIds : [...t.competitionIds, competitionId],
                pool: poolName || t.pool,
              }
            : t
        ),
        competitions: prev.competitions.map((c) => {
          if (c.id !== competitionId) return c;
          const pools = c.pools ?? [];
          const nextPools =
            poolName && pools.some((p) => p.name === poolName)
              ? pools.map((p) =>
                  p.name === poolName
                    ? {
                        ...p,
                        standings: [
                          ...p.standings.filter((row) => row.team !== team.name),
                          emptyStanding(team),
                        ],
                      }
                    : { ...p, standings: p.standings.filter((row) => row.team !== team.name) }
                )
              : pools;
          return { ...c, teams: already ? c.teams : c.teams + 1, pools: nextPools };
        }),
      };
    });
  }, []);

  const createGroup = useCallback((competitionId: string, name: string) => {
    const label = name.trim();
    if (!label) return false;
    let created = false;
    setState((prev) => {
      const competition = prev.competitions.find((c) => c.id === competitionId);
      if (!competition) return prev;
      const pools = competition.pools ?? [];
      if (pools.some((p) => p.name.toLowerCase() === label.toLowerCase())) return prev;
      created = true;
      return {
        ...prev,
        competitions: prev.competitions.map((c) =>
          c.id === competitionId ? { ...c, pools: [...pools, { name: label, standings: [] }] } : c
        ),
      };
    });
    return created;
  }, []);

  const assignTeamToGroup = useCallback((competitionId: string, teamId: string, poolName: string) => {
    setState((prev) => {
      const team = prev.teams.find((t) => t.id === teamId);
      const competition = prev.competitions.find((c) => c.id === competitionId);
      if (!team || !competition) return prev;
      const pools = competition.pools ?? [];
      if (!pools.some((p) => p.name === poolName)) return prev;
      const already = team.competitionIds.includes(competitionId);
      const standing = emptyStanding(team);
      const nextPools = pools.map((pool) => {
        const without = pool.standings.filter((row) => row.team !== team.name);
        if (pool.name !== poolName) return { ...pool, standings: without };
        return { ...pool, standings: [...without, standing] };
      });
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === teamId
            ? {
                ...t,
                competitionIds: already ? t.competitionIds : [...t.competitionIds, competitionId],
                pool: poolName,
              }
            : t
        ),
        competitions: prev.competitions.map((c) =>
          c.id === competitionId ? { ...c, pools: nextPools, teams: already ? c.teams : c.teams + 1 } : c
        ),
      };
    });
  }, []);

  const generateRoundRobinSchedule = useCallback((competitionId: string) => {
    let created = 0;
    setState((prev) => {
      const competition = prev.competitions.find((c) => c.id === competitionId);
      if (!competition) return prev;
      const squads = prev.teams.filter((t) => t.competitionIds.includes(competitionId));
      const groups =
        competition.pools && competition.pools.length > 0
          ? competition.pools.map((pool) => ({
              name: pool.name,
              teams: pool.standings
                .map((row) => squads.find((t) => t.name === row.team))
                .filter((t): t is Team => Boolean(t)),
            }))
          : [{ name: competition.shortName, teams: squads }];
      const venues = prev.venues.filter(
        (v) =>
          v.competitions.includes(competition.shortName) ||
          v.competitions.includes(competition.name) ||
          v.competitions.includes(competition.id)
      );
      const venueIds = (venues.length ? venues : prev.venues).map((v) => v.id);
      if (!venueIds.length) return prev;
      const existing = new Set(
        prev.matches
          .filter((m) => m.competitionId === competitionId && m.homeTeamId && m.awayTeamId)
          .map((m) => pairKey(m.homeTeamId as string, m.awayTeamId as string))
      );
      const start = new Date(`${competition.startDate}T14:00:00.000Z`);
      const gapHours = competition.format === "7s" ? 2 : 36;
      const nextMatches = [...prev.matches];
      let slot = 0;
      let added = 0;
      for (const group of groups) {
        const pairings = roundRobinPairings(group.teams.map((t) => t.id));
        for (const pairing of pairings) {
          const key = pairKey(pairing.homeId, pairing.awayId);
          if (existing.has(key)) continue;
          const home = group.teams.find((t) => t.id === pairing.homeId);
          const away = group.teams.find((t) => t.id === pairing.awayId);
          if (!home || !away) continue;
          existing.add(key);
          const kickoff = new Date(start.getTime() + slot * gapHours * 60 * 60 * 1000);
          nextMatches.unshift({
            id: `match-${competitionId}-${key}`,
            competitionId,
            round: `${group.name} · Round ${pairing.round}`,
            kickoff: kickoff.toISOString(),
            venueId: venueIds[slot % venueIds.length] ?? venueIds[0],
            homeTeam: home.name,
            homeFlag: home.flag,
            awayTeam: away.name,
            awayFlag: away.flag,
            homeTeamId: home.id,
            awayTeamId: away.id,
            homeScore: null,
            awayScore: null,
            status: "scheduled",
            period: "prematch",
            events: [],
            officials: { referee: "TBC", ar1: "TBC", ar2: "TBC", tmo: "TBC" },
            feedsRankings: competition.format !== "7s",
            rankingCategory: competition.format !== "7s" ? "mens-15s" : undefined,
          });
          added += 1;
          slot += 1;
        }
      }
      created = added;
      if (!added) return prev;
      return {
        ...prev,
        matches: nextMatches,
        competitions: prev.competitions.map((c) =>
          c.id === competitionId ? { ...c, matches: c.matches + added } : c
        ),
      };
    });
    return created;
  }, []);

  const generateKnockoutBracket = useCallback((competitionId: string) => {
    let created = 0;
    setState((prev) => {
      const competition = prev.competitions.find((c) => c.id === competitionId);
      if (!competition || !structureNeedsKnockout(competition.structure)) return prev;
      const existingKnockouts = prev.matches.filter((m) => m.competitionId === competitionId && isKnockoutMatch(m));
      if (existingKnockouts.length > 0) return prev;
      const squads = prev.teams.filter((t) => t.competitionIds.includes(competitionId));
      const slots = buildKnockoutSlots({
        knockoutOnly: normalizeStructure(competition.structure) === "Knockout only",
        poolNames: (competition.pools ?? []).map((pool) => pool.name),
        teams: squads.map((team) => ({ id: team.id, name: team.name, flag: team.flag })),
      });
      if (slots.length === 0) return prev;
      const venues = prev.venues.filter(
        (v) =>
          v.competitions.includes(competition.shortName) ||
          v.competitions.includes(competition.name) ||
          v.competitions.includes(competition.id)
      );
      const venueIds = (venues.length ? venues : prev.venues).map((v) => v.id);
      if (!venueIds.length) return prev;
      const existing = prev.matches.filter((m) => m.competitionId === competitionId);
      const lastKickoff = [...existing].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).at(-1)?.kickoff;
      const start = lastKickoff
        ? new Date(new Date(lastKickoff).getTime() + 48 * 60 * 60 * 1000)
        : new Date(`${competition.endDate || competition.startDate}T14:00:00.000Z`);
      const gapHours = competition.format === "7s" ? 3 : 24;
      const nextMatches = [...prev.matches];
      slots.forEach((row, index) => {
        const kickoff = new Date(start.getTime() + index * gapHours * 60 * 60 * 1000);
        nextMatches.unshift({
          id: `ko-${competitionId}-${index + 1}`,
          competitionId,
          round: row.round,
          kickoff: kickoff.toISOString(),
          venueId: venueIds[index % venueIds.length] ?? venueIds[0],
          homeTeam: row.homeTeam,
          homeFlag: row.homeFlag,
          awayTeam: row.awayTeam,
          awayFlag: row.awayFlag,
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          homeScore: null,
          awayScore: null,
          status: "scheduled",
          period: "prematch",
          events: [],
          officials: { referee: "TBC", ar1: "TBC", ar2: "TBC", tmo: "TBC" },
          feedsRankings: competition.format !== "7s",
          rankingCategory: competition.format !== "7s" ? "mens-15s" : undefined,
        });
      });
      created = slots.length;
      return {
        ...prev,
        matches: nextMatches,
        competitions: prev.competitions.map((c) =>
          c.id === competitionId ? { ...c, matches: c.matches + slots.length } : c
        ),
      };
    });
    return created;
  }, []);

  const updateMatchOfficials = useCallback((matchId: string, officials: MatchOfficials) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((row) => (row.id === matchId ? { ...row, officials } : row)),
    }));
  }, []);

  const createPlayer = useCallback((input: Omit<Player, "id">) => {
    const id = `pl-${input.teamId}-${Date.now()}`;
    setState((prev) => ({ ...prev, players: [...prev.players, { ...input, id }] }));
    return id;
  }, []);

  const updatePlayer = useCallback((player: Player) => {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === player.id ? player : p)),
    }));
  }, []);

  const createCourse = useCallback((input: {
    title: string;
    category: CourseCategory;
    durationHours: number;
    targetRole: string;
    passMark: number;
    mandatory: boolean;
    awardsCertificate: boolean;
    description: string;
    modules: CourseModule[];
  }) => {
    const id = `course-${Date.now()}`;
    const course: Course = { ...input, id, enrolled: 0, status: "draft", publishedAt: null };
    setState((prev) => ({ ...prev, courses: [course, ...prev.courses] }));
    return id;
  }, []);

  const addCourseModule = useCallback((courseId: string, module: CourseModule) => {
    setState((prev) => ({
      ...prev,
      courses: prev.courses.map((c) =>
        c.id === courseId ? { ...c, modules: [...c.modules, module] } : c
      ),
    }));
  }, []);

  const addCourseMaterial = useCallback((input: Omit<CourseMaterial, "id">) => {
    const id = `mat-${input.courseId}-${Date.now()}`;
    setState((prev) => ({
      ...prev,
      courseMaterials: [{ id, ...input }, ...prev.courseMaterials],
    }));
    return id;
  }, []);

  const setCourseStatus = useCallback((id: string, status: "draft" | "published") => {
    setState((prev) => ({
      ...prev,
      courses: prev.courses.map((course) =>
        course.id === id
          ? {
              ...course,
              status,
              publishedAt: status === "published" ? course.publishedAt ?? nowIso() : course.publishedAt,
            }
          : course
      ),
    }));
  }, []);

  const updateCourse = useCallback((id: string, patch: Partial<Course>) => {
    setState((prev) => ({
      ...prev,
      courses: prev.courses.map((course) => (course.id === id ? { ...course, ...patch, id: course.id } : course)),
    }));
  }, []);

  const enrollLearner = useCallback((input: { courseId: string; name: string; unionId: string; role?: string }) => {
    const name = input.name.trim();
    if (!name) return null;
    let createdId: string | null = null;
    setState((prev) => {
      const course = prev.courses.find((row) => row.id === input.courseId);
      const union = prev.unions.find((row) => row.id === input.unionId);
      if (!course || !union) return prev;
      const already = prev.learners.find(
        (row) =>
          row.courseId === input.courseId &&
          row.name.toLowerCase() === name.toLowerCase() &&
          row.unionId === input.unionId &&
          row.status !== "failed"
      );
      if (already) {
        createdId = already.id;
        if (already.status === "declined") {
          return {
            ...prev,
            learners: prev.learners.map((row) =>
              row.id === already.id
                ? { ...row, status: "requested", enrolledAt: nowIso(), decidedAt: undefined, decisionNote: undefined }
                : row
            ),
          };
        }
        return prev;
      }
      const id = `lr-${Date.now()}`;
      createdId = id;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
      const learner: Learner = {
        id,
        courseId: input.courseId,
        name,
        unionId: union.id,
        unionName: union.name,
        role: input.role?.trim() || course.targetRole,
        email: `${slug}@${union.id}.worldrugby.demo`,
        enrolledAt: nowIso(),
        status: "requested",
      };
      return {
        ...prev,
        learners: [learner, ...prev.learners],
      };
    });
    return createdId;
  }, []);

  const decideEnrolment = useCallback((learnerId: string, decision: "accepted" | "declined", note?: string) => {
    let ok = false;
    setState((prev) => {
      const learner = prev.learners.find((row) => row.id === learnerId);
      if (!learner) return prev;
      if (decision === "accepted") {
        if (learner.status !== "requested" && learner.status !== "declined") return prev;
      } else if (learner.status !== "requested") {
        return prev;
      }
      ok = true;
      const nextStatus = decision === "accepted" ? "enrolled" : "declined";
      const bump = decision === "accepted" ? 1 : 0;
      return {
        ...prev,
        learners: prev.learners.map((row) =>
          row.id === learnerId
            ? {
                ...row,
                status: nextStatus,
                decidedAt: nowIso(),
                decisionNote: note?.trim() || (decision === "accepted" ? undefined : row.decisionNote),
              }
            : row
        ),
        courses: bump
          ? prev.courses.map((row) => (row.id === learner.courseId ? { ...row, enrolled: row.enrolled + bump } : row))
          : prev.courses,
      };
    });
    return ok;
  }, []);

  const recordLearnerResult = useCallback((learnerId: string, score: number) => {
    if (!Number.isFinite(score) || score < 0 || score > 100) return false;
    let ok = false;
    setState((prev) => {
      const learner = prev.learners.find((row) => row.id === learnerId);
      const course = learner ? prev.courses.find((row) => row.id === learner.courseId) : undefined;
      if (!learner || !course || !isOnCourse(learner.status)) return prev;
      ok = true;
      const status = resultForScore(score, course.passMark);
      const graded: Learner = {
        ...learner,
        score,
        status,
        completedAt: nowIso(),
      };
      const shouldIssue = status === "passed" && course.awardsCertificate && !learner.certificateId;
      const certificate = shouldIssue ? certificateForLearner(prev, graded) : null;
      return {
        ...prev,
        learners: prev.learners.map((row) =>
          row.id === learnerId ? { ...graded, certificateId: certificate?.id ?? row.certificateId } : row
        ),
        certificates: certificate ? [certificate, ...prev.certificates] : prev.certificates,
      };
    });
    return ok;
  }, []);

  const issueCertificate = useCallback((input: { learnerId: string; expiresAt?: string }) => {
    let createdId: string | null = null;
    setState((prev) => {
      const learner = prev.learners.find((row) => row.id === input.learnerId);
      const course = learner ? prev.courses.find((row) => row.id === learner.courseId) : undefined;
      if (!learner || !course || learner.status !== "passed") return prev;
      if (learner.certificateId) {
        createdId = learner.certificateId;
        return prev;
      }
      const certificate = certificateForLearner(prev, learner, input.expiresAt);
      createdId = certificate.id;
      return {
        ...prev,
        certificates: [certificate, ...prev.certificates],
        learners: prev.learners.map((row) => (row.id === learner.id ? { ...row, certificateId: certificate.id } : row)),
      };
    });
    return createdId;
  }, []);

  const saveExamAnswers = useCallback((learnerId: string, answers: { questionId: string; selectedIndex: number }[]) => {
    let ok = false;
    setState((prev) => {
      const learner = prev.learners.find((row) => row.id === learnerId);
      const course = learner ? prev.courses.find((row) => row.id === learner.courseId) : undefined;
      if (!learner || !course || !isOnCourse(learner.status)) return prev;
      ok = true;
      const questions = examForCourse(course.id);
      const complete = questions.every((question) => answers.some((row) => row.questionId === question.id));
      const score = complete ? examScore(questions, answers) : learner.score;
      const status = complete
        ? resultForScore(score ?? 0, course.passMark)
        : learner.status === "enrolled"
          ? "in-progress"
          : learner.status;
      const graded = {
        ...learner,
        examAnswers: answers,
        examSubmittedAt: complete ? nowIso() : learner.examSubmittedAt,
        score: complete ? score : learner.score,
        status,
        completedAt: complete ? nowIso() : learner.completedAt,
      };
      const shouldIssue = status === "passed" && course.awardsCertificate && !learner.certificateId && complete;
      const certificate = shouldIssue ? certificateForLearner(prev, graded) : null;
      return {
        ...prev,
        learners: prev.learners.map((row) =>
          row.id === learnerId ? { ...graded, certificateId: certificate?.id ?? row.certificateId } : row
        ),
        certificates: certificate ? [certificate, ...prev.certificates] : prev.certificates,
      };
    });
    return ok;
  }, []);

  const submitProject = useCallback((learnerId: string, input: { title: string; fileName: string; notes: string }) => {
    let ok = false;
    setState((prev) => {
      const learner = prev.learners.find((row) => row.id === learnerId);
      if (!learner || !isOnCourse(learner.status)) return prev;
      ok = true;
      return {
        ...prev,
        learners: prev.learners.map((row) =>
          row.id === learnerId
            ? {
                ...row,
                status: row.status === "enrolled" ? "in-progress" : row.status,
                project: {
                  title: input.title.trim(),
                  fileName: input.fileName.trim() || "project.pdf",
                  notes: input.notes.trim(),
                  submittedAt: nowIso(),
                  status: "submitted" as const,
                },
              }
            : row
        ),
      };
    });
    return ok;
  }, []);

  const createLicense = useCallback((input: {
    unionId: string;
    modules: TmsModule[];
    startsAt: string;
    endsAt: string;
    seats: number;
    contactName: string;
    contactRole?: string;
    contactEmail?: string;
    contactPhone?: string;
    billingEmail?: string;
    officePhone?: string;
    officeAddress?: string;
    autoRenew?: boolean;
    notes?: string;
  }) => {
    let createdId: string | null = null;
    setState((prev) => {
      const union = prev.unions.find((row) => row.id === input.unionId);
      if (!union || input.modules.length === 0) return prev;
      const blocking = prev.licenses.find(
        (row) => row.unionId === input.unionId && (row.status === "active" || row.status === "draft")
      );
      if (blocking) {
        createdId = blocking.id;
        return prev;
      }
      const id = `lic-${Date.now()}`;
      createdId = id;
      const name = input.contactName.trim() || union.contacts[0]?.name || "Union admin";
      const email = input.contactEmail?.trim() || union.contacts[0]?.email;
      const role = input.contactRole?.trim() || union.contacts[0]?.role || "Licence admin";
      const primary: LicenseContact = { name, role, email: email || `${union.id}.licence@world.rugby.demo`, phone: input.contactPhone?.trim() };
      const license: FederationLicense = {
        id,
        licenseKey: nextLicenseKey(union.abbreviation, prev.licenses),
        unionId: union.id,
        issuedAt: nowIso(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "active",
        modules: input.modules,
        seats: Math.max(1, input.seats) || 10,
        seatsUsed: 0,
        contactName: name,
        contactRole: role,
        contactEmail: primary.email,
        contactPhone: primary.phone,
        contacts: [primary],
        billingEmail: input.billingEmail?.trim() || primary.email,
        officePhone: input.officePhone?.trim() || primary.phone,
        officeAddress: input.officeAddress?.trim() || union.hq,
        autoRenew: input.autoRenew ?? false,
        renewalNoticeDays: 90,
        maxTournaments: 0,
        notes: input.notes?.trim() || undefined,
        lastSeenAt: nowIso(),
      };
      return { ...prev, licenses: [license, ...prev.licenses] };
    });
    return createdId;
  }, []);

  const updateLicense = useCallback((id: string, patch: Partial<FederationLicense>) => {
    setState((prev) => ({
      ...prev,
      licenses: prev.licenses.map((row) => (row.id === id ? { ...row, ...patch, id: row.id, licenseKey: row.licenseKey, unionId: row.unionId } : row)),
    }));
  }, []);

  const addFederationNode = useCallback((input: {
    unionId: string;
    parentId: string | null;
    kind: FederationNodeKind;
    name: string;
    city?: string;
  }) => {
    const name = input.name.trim();
    if (!name) return null;
    const id = `fn-${Date.now()}`;
    const node: FederationNode = {
      id,
      unionId: input.unionId,
      parentId: input.parentId,
      kind: input.kind,
      name,
      city: input.city?.trim() || undefined,
      teams: input.kind === "club" ? 1 : undefined,
      players: input.kind === "club" ? 0 : undefined,
    };
    setState((prev) => ({ ...prev, federationNodes: [...prev.federationNodes, node] }));
    return id;
  }, []);

  const value = useMemo(
    () => ({
      hydrated,
      session,
      state,
      login,
      logout,
      resetDemo,
      enterMatchResult,
      updateLiveScore,
      addMatchEvent,
      removeMatchEvent,
      completeHia,
      setRtpStage,
      createConcussionCase,
      startMatchClock,
      pauseMatchClock,
      resetMatchClock,
      kickOffMatch,
      callHalfTime,
      startSecondHalf,
      saveArticle,
      publishArticle,
      setPageStatus,
      moveHomepageBlock,
      toggleHomepageBlock,
      decideApplication,
      addUnionNote,
      markNotificationRead,
      markAllNotificationsRead,
      createCompetition,
      updateCompetition,
      deleteCompetition,
      createVenue,
      attachVenueToCompetition,
      createOpsItem,
      updateOpsItem,
      createMatch,
      createTeam,
      attachTeamToCompetition,
      createGroup,
      assignTeamToGroup,
      generateRoundRobinSchedule,
      generateKnockoutBracket,
      updateMatchOfficials,
      createPlayer,
      updatePlayer,
      createCourse,
      addCourseModule,
      addCourseMaterial,
      setCourseStatus,
      updateCourse,
      enrollLearner,
      decideEnrolment,
      recordLearnerResult,
      issueCertificate,
      saveExamAnswers,
      submitProject,
      createLicense,
      updateLicense,
      addFederationNode,
    }),
    [
      hydrated,
      session,
      state,
      login,
      logout,
      resetDemo,
      enterMatchResult,
      updateLiveScore,
      addMatchEvent,
      removeMatchEvent,
      completeHia,
      setRtpStage,
      createConcussionCase,
      startMatchClock,
      pauseMatchClock,
      resetMatchClock,
      kickOffMatch,
      callHalfTime,
      startSecondHalf,
      saveArticle,
      publishArticle,
      setPageStatus,
      moveHomepageBlock,
      toggleHomepageBlock,
      decideApplication,
      addUnionNote,
      markNotificationRead,
      markAllNotificationsRead,
      createCompetition,
      updateCompetition,
      deleteCompetition,
      createVenue,
      attachVenueToCompetition,
      createOpsItem,
      updateOpsItem,
      createMatch,
      createTeam,
      attachTeamToCompetition,
      createGroup,
      assignTeamToGroup,
      generateRoundRobinSchedule,
      generateKnockoutBracket,
      updateMatchOfficials,
      createPlayer,
      updatePlayer,
      createCourse,
      addCourseModule,
      addCourseMaterial,
      setCourseStatus,
      updateCourse,
      enrollLearner,
      decideEnrolment,
      recordLearnerResult,
      issueCertificate,
      saveExamAnswers,
      submitProject,
      createLicense,
      updateLicense,
      addFederationNode,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
