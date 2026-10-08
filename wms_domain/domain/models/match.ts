export type MatchStatus = 'scheduled' | 'live' | 'completed';

export interface MatchSide {
  id: string;
  displayName: string;
  athleteIds: string[];
  countryCodes?: string[];
}

export interface MatchSet {
  label: string;
  a: number | string;
  b: number | string;
}

export type MatchServingSide = 'a' | 'b';

export interface MatchGamePoints {
  a: string;
  b: string;
}

export interface MatchStat {
  label: string;
  a: number;
  b: number;
}

export interface MatchResult {
  id: string;
  eventId: string;
  sportId: string;
  categoryId: string;
  venueId?: string;
  court?: string;
  /** Draw round label — e.g. Round 1, Semi Final. */
  round?: string;
  status: MatchStatus;
  sideA: MatchSide;
  sideB: MatchSide;
  scoreSummary: string;
  sets?: MatchSet[];
  gamePoints?: MatchGamePoints;
  servingSide?: MatchServingSide;
  stats?: MatchStat[];
  updatedAt: string;
}

/** One scripted live-feed tick — used by the mock results provider. */
export type MatchFeedUpdate = Pick<MatchResult, 'status' | 'scoreSummary' | 'sets' | 'updatedAt'> &
  Partial<Pick<MatchResult, 'gamePoints' | 'servingSide' | 'stats'>>;
