export type CompetitionStatus = "upcoming" | "live" | "completed";
export type MatchStatus = "scheduled" | "live" | "final";
export type MatchPeriod = "prematch" | "first-half" | "half-time" | "second-half" | "full-time";
export type MembershipType = "Full Member" | "Associate Member";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type PublishStatus = "draft" | "published";
export type RankingCategory = "mens-15s" | "womens-15s" | "mens-7s" | "womens-7s";
export type HiaOutcome = "return" | "remove" | "confirm" | "refer" | "diagnose" | "clear" | "pending";
export type RtpStatus = "not-started" | "in-progress" | "cleared" | "hold" | "overdue";
export type PlayerStatus = "available" | "injured" | "hia" | "suspended";
export type RugbyFormat = "15s" | "7s" | "u20";
export type CourseCategory =
  | "Coaching"
  | "Match Officials"
  | "Medical"
  | "Strength & Conditioning"
  | "Laws";

export type PoolStanding = {
  team: string;
  flag: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  bp: number;
  pts: number;
};

export type Pool = {
  name: string;
  standings: PoolStanding[];
};

export type Competition = {
  id: string;
  name: string;
  shortName: string;
  season: string;
  status: CompetitionStatus;
  location: string;
  startDate: string;
  endDate: string;
  teams: number;
  matches: number;
  description: string;
  hero: boolean;
  format: RugbyFormat;
  hostCountry: string;
  hostUnion: string;
  organiser: string;
  hostCities: string;
  structure: string;
  lawNotes: string;
  broadcaster: string;
  pools?: Pool[];
  licenseId?: string;
  ownerUnionId?: string;
};

export type OpsModule =
  | "officials"
  | "medical"
  | "broadcast"
  | "media"
  | "accreditation"
  | "hospitality"
  | "accommodation"
  | "transport"
  | "workforce";

export type OpsStatus = "planned" | "assigned" | "in-progress" | "complete" | "at-risk";

export type TournamentOpsItem = {
  id: string;
  competitionId: string;
  module: OpsModule;
  title: string;
  meta: string;
  owner: string;
  status: OpsStatus;
};

export type Team = {
  id: string;
  name: string;
  flag: string;
  unionId: string;
  coach: string;
  competitionIds: string[];
  pool?: string;
};

export type Player = {
  id: string;
  teamId: string;
  unionId: string;
  name: string;
  position: string;
  number: number;
  dob: string;
  heightCm: number;
  weightKg: number;
  club: string;
  caps: number;
  tries: number;
  status: PlayerStatus;
  bio: string;
};

export type MatchOfficials = {
  referee: string;
  ar1: string;
  ar2: string;
  tmo: string;
};

export type ScoreEventKind = "try" | "conversion" | "penalty" | "drop-goal" | "penalty-try";

export type MatchScoreEvent = {
  id: string;
  minute: number;
  kind: ScoreEventKind;
  team: "home" | "away";
  playerId?: string;
  playerName: string;
  points: number;
};

export type MatchTeamStats = {
  possession: number;
  territory: number;
  metres: number;
  carries: number;
  tackles: number;
  missedTackles: number;
  scrumsWon: number;
  scrumsTotal: number;
  lineoutsWon: number;
  lineoutsTotal: number;
  turnovers: number;
  penaltiesConceded: number;
  yellowCards: number;
  redCards: number;
};

export type Match = {
  id: string;
  competitionId: string;
  round: string;
  kickoff: string;
  venueId: string;
  homeTeam: string;
  homeFlag: string;
  awayTeam: string;
  awayFlag: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  officials: MatchOfficials;
  feedsRankings: boolean;
  rankingCategory?: RankingCategory;
  events?: MatchScoreEvent[];
  stats?: { home: MatchTeamStats; away: MatchTeamStats };
  clockElapsedMs?: number;
  clockRunning?: boolean;
  clockStartedAt?: string | null;
  period?: MatchPeriod;
};

export type Venue = {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number;
  competitions: string[];
};

export type HiaStageRecord = {
  stage: "HIA1" | "HIA2" | "HIA3";
  label: string;
  due: string;
  completedAt: string | null;
  outcome: HiaOutcome;
  notes: string;
};

export type RtpStageRecord = {
  stage: number;
  name: string;
  due: string;
  status: RtpStatus;
  clearedAt: string | null;
};

export type ConcussionCase = {
  id: string;
  player: string;
  playerId?: string;
  position: string;
  unionId: string;
  unionName: string;
  teamName?: string;
  teamFlag?: string;
  matchId: string | null;
  matchLabel: string;
  competitionId?: string;
  minute?: number;
  notes?: string;
  source?: "manual" | "match";
  occurredAt: string;
  currentHia: "HIA1" | "HIA2" | "HIA3" | "complete";
  diagnosis: "suspected" | "confirmed" | "cleared" | "closed";
  rtpOverall: RtpStatus;
  hia: HiaStageRecord[];
  rtp: RtpStageRecord[];
  confidential: true;
};

export type CmsPage = {
  id: string;
  title: string;
  slug: string;
  status: PublishStatus;
  updatedAt: string;
  summary: string;
};

export type Article = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  hero: string;
  tags: string[];
  status: PublishStatus;
  author: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type MediaItem = {
  id: string;
  name: string;
  type: "image" | "video" | "document";
  usedOn: string;
  size: string;
  uploadedAt: string;
};

export type HomepageBlock = {
  id: string;
  title: string;
  kind: "hero" | "match" | "rankings" | "news" | "education";
  enabled: boolean;
  detail: string;
};

export type UnionContact = {
  name: string;
  role: string;
  email: string;
};

export type MemberUnion = {
  id: string;
  name: string;
  abbreviation: string;
  country: string;
  flag: string;
  region: string;
  membership: MembershipType;
  joined: string;
  hq: string;
  contacts: UnionContact[];
  competitions: string[];
  concussionCompliance: number;
  educationCompletion: number;
  notes: string[];
};

export type AffiliationApplication = {
  id: string;
  organisation: string;
  country: string;
  flag: string;
  region: string;
  submittedAt: string;
  status: ApplicationStatus;
  summary: string;
};

export type RankedTeam = {
  id: string;
  rank: number;
  previousRank: number;
  team: string;
  flag: string;
  points: number;
  previousPoints: number;
  history: number[];
};

export type CourseModule = {
  title: string;
  minutes: number;
};

export type CourseMaterialKind = "video" | "link" | "document";

export type CourseMaterial = {
  id: string;
  courseId: string;
  kind: CourseMaterialKind;
  title: string;
  url: string;
  fileName?: string;
  sizeLabel?: string;
  notes?: string;
};

export type Course = {
  id: string;
  title: string;
  category: CourseCategory;
  durationHours: number;
  targetRole: string;
  passMark: number;
  mandatory: boolean;
  awardsCertificate: boolean;
  description: string;
  modules: CourseModule[];
  enrolled: number;
  status: PublishStatus;
  publishedAt: string | null;
};

export type LearnerStatus = "requested" | "declined" | "enrolled" | "in-progress" | "passed" | "failed";

export type ExamQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type ExamAnswer = {
  questionId: string;
  selectedIndex: number;
};

export type ProjectWork = {
  title: string;
  fileName: string;
  notes: string;
  submittedAt: string;
  status: "submitted" | "graded";
  grade?: number;
  feedback?: string;
};

export type Learner = {
  id: string;
  courseId: string;
  name: string;
  unionId: string;
  unionName: string;
  role?: string;
  email?: string;
  enrolledAt: string;
  status: LearnerStatus;
  score?: number;
  completedAt?: string;
  certificateId?: string;
  examAnswers?: ExamAnswer[];
  examSubmittedAt?: string;
  project?: ProjectWork;
  decidedAt?: string;
  decisionNote?: string;
};

export type Enrolment = {
  id: string;
  courseId: string;
  unionId: string;
  unionName: string;
  enrolled: number;
  completed: number;
  inProgress: number;
};

export type Certificate = {
  id: string;
  holder: string;
  unionName: string;
  unionId?: string;
  courseId: string;
  learnerId?: string;
  issuedAt: string;
  expiresAt?: string;
  credentialId: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  at: string;
  tone: "alert" | "info" | "success";
};

export type SessionUser = {
  name: string;
  email: string;
  role: string;
  title: string;
};

export type TmsModule =
  | "groups"
  | "roster"
  | "fixtures"
  | "results"
  | "officials"
  | "venues"
  | "medical"
  | "broadcast"
  | "ops"
  | "concussion";

export type LicenseStatus = "active" | "suspended" | "expired" | "draft";

export type LicenseContact = {
  name: string;
  role: string;
  email: string;
  phone?: string;
};

export type FederationLicense = {
  id: string;
  licenseKey: string;
  unionId: string;
  issuedAt: string;
  startsAt: string;
  endsAt: string;
  status: LicenseStatus;
  modules: TmsModule[];
  seats: number;
  seatsUsed: number;
  contactName: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  contacts: LicenseContact[];
  billingEmail?: string;
  officePhone?: string;
  officeAddress?: string;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  maxTournaments?: number;
  supportHours?: string;
  invoiceRef?: string;
  notes?: string;
  lastSeenAt?: string;
};

export type FederationNodeKind = "region" | "club";

export type FederationNode = {
  id: string;
  unionId: string;
  parentId: string | null;
  kind: FederationNodeKind;
  name: string;
  city?: string;
  teams?: number;
  players?: number;
};

export type AppState = {
  competitions: Competition[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  venues: Venue[];
  tournamentOps: TournamentOpsItem[];
  cases: ConcussionCase[];
  pages: CmsPage[];
  articles: Article[];
  media: MediaItem[];
  homepageBlocks: HomepageBlock[];
  unions: MemberUnion[];
  applications: AffiliationApplication[];
  rankings: Record<RankingCategory, RankedTeam[]>;
  courses: Course[];
  courseMaterials: CourseMaterial[];
  enrolments: Enrolment[];
  learners: Learner[];
  certificates: Certificate[];
  notifications: AppNotification[];
  licenses: FederationLicense[];
  federationNodes: FederationNode[];
};
