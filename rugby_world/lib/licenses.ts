import type {
  Competition,
  FederationLicense,
  FederationNode,
  FederationNodeKind,
  LicenseContact,
  Match,
  TmsModule,
} from "./types";

export const TMS_MODULES: { id: TmsModule; label: string; hint: string }[] = [
  { id: "roster", label: "Roster", hint: "Teams and players" },
  { id: "groups", label: "Groups", hint: "Pools and league tables" },
  { id: "fixtures", label: "Fixtures", hint: "Schedule and kick-off" },
  { id: "officials", label: "Officials", hint: "Match panel" },
  { id: "results", label: "Results", hint: "Scorecards" },
  { id: "venues", label: "Venues", hint: "Grounds register" },
  { id: "medical", label: "Medical", hint: "Match-day cover" },
  { id: "broadcast", label: "Broadcast", hint: "Host feed and rights" },
  { id: "ops", label: "Event ops", hint: "Accreditation, transport, workforce" },
  { id: "concussion", label: "Concussion", hint: "HIA tagging from match desk" },
];

export const CORE_TMS_MODULES: TmsModule[] = ["roster", "groups", "fixtures", "officials", "results", "venues", "medical"];
export const FULL_TMS_MODULES: TmsModule[] = TMS_MODULES.map((row) => row.id);

function day(value: string) {
  return `${value}T10:00:00.000Z`;
}

export function nextLicenseKey(abbreviation: string, existing: FederationLicense[], year = 2026) {
  const prefix = `WR-TMS-${abbreviation.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "UNION"}-${year}-`;
  const serials = existing
    .map((row) => row.licenseKey)
    .filter((key) => key.startsWith(prefix))
    .map((key) => Number(key.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = (serials.length ? Math.max(...serials) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export function moduleLabel(id: TmsModule) {
  return TMS_MODULES.find((row) => row.id === id)?.label ?? id;
}

export function licenseDaysLeft(endsAt: string, now = new Date()) {
  const end = Date.parse(`${endsAt.slice(0, 10)}T23:59:59.000Z`);
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

export function licenseWatch(license: FederationLicense, now = new Date()): "expired" | "expiring" | "ok" {
  if (license.status === "expired") return "expired";
  const days = licenseDaysLeft(license.endsAt, now);
  if (days < 0) return "expired";
  const window = license.renewalNoticeDays ?? 90;
  if (license.status !== "suspended" && days <= window) return "expiring";
  return "ok";
}

function people(...rows: LicenseContact[]): LicenseContact[] {
  return rows;
}

export function createLicenses(): FederationLicense[] {
  return [
    {
      id: "lic-eng",
      licenseKey: "WR-TMS-RFU-2026-0001",
      unionId: "eng",
      issuedAt: day("2025-11-12"),
      startsAt: "2026-01-01",
      endsAt: "2026-12-31",
      status: "active",
      modules: FULL_TMS_MODULES,
      seats: 80,
      seatsUsed: 54,
      contactName: "Bill Sweeney",
      contactRole: "Chief Executive",
      contactEmail: "demo.rfu@world.rugby",
      contactPhone: "+44 20 8831 6688",
      contacts: people(
        { name: "Bill Sweeney", role: "Chief Executive", email: "demo.rfu@world.rugby", phone: "+44 20 8831 6688" },
        { name: "Angus Bujalski", role: "Legal & licensing", email: "licensing.rfu@world.rugby.demo", phone: "+44 20 8831 6701" }
      ),
      billingEmail: "accounts.rfu@world.rugby.demo",
      officePhone: "+44 20 8892 2000",
      officeAddress: "Twickenham Stadium, Whitton Road, Twickenham TW2 7BA",
      autoRenew: true,
      renewalNoticeDays: 90,
      maxTournaments: 0,
      supportHours: "Mon-Fri 08:00-18:00 UK",
      invoiceRef: "WR-INV-RFU-2026-01",
      lastSeenAt: "2026-09-17T16:40:00.000Z",
      notes: "Full TMS for county and club championships.",
    },
    {
      id: "lic-fij",
      licenseKey: "WR-TMS-FRU-2026-0001",
      unionId: "fij",
      issuedAt: day("2026-01-20"),
      startsAt: "2026-02-01",
      endsAt: "2026-10-12",
      status: "active",
      modules: [...CORE_TMS_MODULES, "ops", "concussion"],
      seats: 24,
      seatsUsed: 17,
      contactName: "Camille Cavuilati",
      contactRole: "High Performance",
      contactEmail: "demo.fiji@world.rugby",
      contactPhone: "+679 331 2477",
      contacts: people(
        { name: "Camille Cavuilati", role: "High Performance", email: "demo.fiji@world.rugby", phone: "+679 331 2477" },
        { name: "John O'Connor", role: "Competitions manager", email: "competitions.fru@world.rugby.demo", phone: "+679 331 2480" }
      ),
      billingEmail: "finance.fru@world.rugby.demo",
      officePhone: "+679 330 0356",
      officeAddress: "Fiji Rugby Union, 35 Gordon Street, Suva",
      autoRenew: false,
      renewalNoticeDays: 90,
      maxTournaments: 8,
      supportHours: "Mon-Fri 08:00-17:00 FJT",
      invoiceRef: "WR-INV-FRU-2026-01",
      lastSeenAt: "2026-09-16T08:10:00.000Z",
      notes: "Skipper Cup pack. Renewal due before the provincial final window.",
    },
    {
      id: "lic-nzr",
      licenseKey: "WR-TMS-NZR-2026-0001",
      unionId: "nzr",
      issuedAt: day("2025-10-03"),
      startsAt: "2026-01-01",
      endsAt: "2026-12-31",
      status: "active",
      modules: FULL_TMS_MODULES,
      seats: 120,
      seatsUsed: 91,
      contactName: "Mark Robinson",
      contactRole: "Chief Executive",
      contactEmail: "demo.nzr@world.rugby",
      contactPhone: "+64 4 499 4995",
      contacts: people(
        { name: "Mark Robinson", role: "Chief Executive", email: "demo.nzr@world.rugby", phone: "+64 4 499 4995" },
        { name: "Corne van Zyl", role: "Provincial competitions", email: "npc.nzr@world.rugby.demo", phone: "+64 4 499 5002" }
      ),
      billingEmail: "accounts.nzr@world.rugby.demo",
      officePhone: "+64 4 499 4995",
      officeAddress: "New Zealand Rugby, 100 Molesworth Street, Wellington",
      autoRenew: true,
      renewalNoticeDays: 90,
      maxTournaments: 0,
      supportHours: "Mon-Fri 08:00-18:00 NZST",
      invoiceRef: "WR-INV-NZR-2026-01",
      lastSeenAt: "2026-09-18T02:05:00.000Z",
    },
    {
      id: "lic-ken",
      licenseKey: "WR-TMS-KRU-2026-0001",
      unionId: "ken",
      issuedAt: day("2026-03-04"),
      startsAt: "2026-03-15",
      endsAt: "2027-03-14",
      status: "active",
      modules: ["roster", "fixtures", "results", "venues", "medical", "concussion"],
      seats: 18,
      seatsUsed: 11,
      contactName: "Amos Wekesa",
      contactRole: "Chairman",
      contactEmail: "demo.kenya@world.rugby",
      contactPhone: "+254 20 387 5630",
      contacts: people(
        { name: "Amos Wekesa", role: "Chairman", email: "demo.kenya@world.rugby", phone: "+254 20 387 5630" },
        { name: "Benjamin Ayimba", role: "Club rugby", email: "clubs.kru@world.rugby.demo", phone: "+254 20 387 5634" }
      ),
      billingEmail: "finance.kru@world.rugby.demo",
      officePhone: "+254 20 387 5630",
      officeAddress: "RFUEA Grounds, Ngong Road, Nairobi",
      autoRenew: true,
      renewalNoticeDays: 60,
      maxTournaments: 4,
      supportHours: "Mon-Fri 08:00-17:00 EAT",
      invoiceRef: "WR-INV-KRU-2026-01",
      lastSeenAt: "2026-09-12T13:22:00.000Z",
      notes: "Club championship starter pack.",
    },
    {
      id: "lic-uru",
      licenseKey: "WR-TMS-URU-2026-0001",
      unionId: "uru",
      issuedAt: day("2026-02-11"),
      startsAt: "2026-03-01",
      endsAt: "2027-02-28",
      status: "active",
      modules: [...CORE_TMS_MODULES, "concussion"],
      seats: 16,
      seatsUsed: 9,
      contactName: "Pablo Ferrari",
      contactRole: "High Performance",
      contactEmail: "demo.uru@world.rugby",
      contactPhone: "+598 2 400 1111",
      contacts: people(
        { name: "Pablo Ferrari", role: "High Performance", email: "demo.uru@world.rugby", phone: "+598 2 400 1111" }
      ),
      billingEmail: "admin.uru@world.rugby.demo",
      officePhone: "+598 2 400 1111",
      officeAddress: "Unión de Rugby del Uruguay, Montevideo",
      autoRenew: false,
      renewalNoticeDays: 90,
      maxTournaments: 6,
      supportHours: "Mon-Fri 09:00-18:00 UYT",
      invoiceRef: "WR-INV-URU-2026-01",
      lastSeenAt: "2026-09-10T19:00:00.000Z",
    },
    {
      id: "lic-jrp",
      licenseKey: "WR-TMS-JRFU-2026-0001",
      unionId: "jrp",
      issuedAt: day("2026-04-08"),
      startsAt: "2026-05-01",
      endsAt: "2026-10-31",
      status: "active",
      modules: [...CORE_TMS_MODULES, "broadcast", "ops"],
      seats: 36,
      seatsUsed: 22,
      contactName: "Tatsuro Yamauchi",
      contactRole: "President",
      contactEmail: "demo.jrfu@world.rugby",
      contactPhone: "+81 3 5400 6300",
      contacts: people(
        { name: "Tatsuro Yamauchi", role: "President", email: "demo.jrfu@world.rugby", phone: "+81 3 5400 6300" },
        { name: "Aiko Sato", role: "University competitions", email: "university.jrfu@world.rugby.demo", phone: "+81 3 5400 6312" }
      ),
      billingEmail: "accounts.jrfu@world.rugby.demo",
      officePhone: "+81 3 5400 6300",
      officeAddress: "Japan Rugby Football Union, Tokyo",
      autoRenew: false,
      renewalNoticeDays: 90,
      maxTournaments: 12,
      supportHours: "Mon-Fri 09:00-18:00 JST",
      invoiceRef: "WR-INV-JRFU-2026-01",
      lastSeenAt: "2026-09-14T05:30:00.000Z",
      notes: "University championship window. Renew before knockout rounds.",
    },
    {
      id: "lic-ton",
      licenseKey: "WR-TMS-TRU-2025-0001",
      unionId: "ton",
      issuedAt: day("2025-01-15"),
      startsAt: "2025-02-01",
      endsAt: "2026-01-31",
      status: "expired",
      modules: CORE_TMS_MODULES,
      seats: 12,
      seatsUsed: 0,
      contactName: "ʻAlipate Fatafehi",
      contactRole: "Medical lead",
      contactEmail: "demo.tonga@world.rugby",
      contactPhone: "+676 21 555",
      contacts: people(
        { name: "ʻAlipate Fatafehi", role: "Medical lead", email: "demo.tonga@world.rugby", phone: "+676 21 555" }
      ),
      billingEmail: "office.tru@world.rugby.demo",
      officePhone: "+676 21 555",
      officeAddress: "Tonga Rugby Union, Nukuʻalofa",
      autoRenew: false,
      renewalNoticeDays: 90,
      maxTournaments: 4,
      supportHours: "Mon-Fri 09:00-16:00 TOT",
      invoiceRef: "WR-INV-TRU-2025-01",
      notes: "Lapsed. Renew to restore club championship access.",
    },
  ];
}

function node(
  id: string,
  unionId: string,
  parentId: string | null,
  kind: FederationNodeKind,
  name: string,
  city?: string,
  teams?: number,
  players?: number
): FederationNode {
  return { id, unionId, parentId, kind, name, city, teams, players };
}

export function createFederationNodes(): FederationNode[] {
  return [
    node("eng-london", "eng", null, "region", "Greater London"),
    node("eng-sw", "eng", null, "region", "South West"),
    node("eng-mid", "eng", null, "region", "Midlands"),
    node("eng-north", "eng", null, "region", "North"),
    node("eng-quins", "eng", "eng-london", "club", "Harlequins RFC", "Twickenham", 4, 186),
    node("eng-saracens", "eng", "eng-london", "club", "Saracens", "North London", 3, 164),
    node("eng-irish", "eng", "eng-london", "club", "London Irish Amateur", "Sunbury", 6, 240),
    node("eng-exeter", "eng", "eng-sw", "club", "Exeter Chiefs", "Exeter", 3, 152),
    node("eng-bath", "eng", "eng-sw", "club", "Bath Rugby", "Bath", 3, 148),
    node("eng-bristol", "eng", "eng-sw", "club", "Bristol Bears", "Bristol", 3, 141),
    node("eng-leicester", "eng", "eng-mid", "club", "Leicester Tigers", "Leicester", 4, 190),
    node("eng-saints", "eng", "eng-mid", "club", "Northampton Saints", "Northampton", 3, 155),
    node("eng-sale", "eng", "eng-north", "club", "Sale Sharks", "Salford", 3, 147),
    node("eng-falcons", "eng", "eng-north", "club", "Newcastle Falcons", "Newcastle", 3, 132),

    node("fij-suva", "fij", null, "region", "Suva"),
    node("fij-nadroga", "fij", null, "region", "Nadroga"),
    node("fij-naitasiri", "fij", null, "region", "Naitasiri"),
    node("fij-lautoka", "fij", null, "region", "Lautoka"),
    node("fij-suva-club", "fij", "fij-suva", "club", "Suva Rugby", "Suva", 2, 98),
    node("fij-police", "fij", "fij-suva", "club", "Police Rugby", "Suva", 2, 86),
    node("fij-nadroga-club", "fij", "fij-nadroga", "club", "Nadroga", "Sigatoka", 2, 112),
    node("fij-sigatoka", "fij", "fij-nadroga", "club", "Sigatoka", "Sigatoka", 1, 64),
    node("fij-naitasiri-club", "fij", "fij-naitasiri", "club", "Naitasiri", "Nausori", 2, 104),
    node("fij-tailevu", "fij", "fij-naitasiri", "club", "Tailevu", "Nausori", 1, 71),
    node("fij-lautoka-club", "fij", "fij-lautoka", "club", "Lautoka", "Lautoka", 2, 90),
    node("fij-nadi", "fij", "fij-lautoka", "club", "Nadi", "Nadi", 2, 88),

    node("nzr-akl", "nzr", null, "region", "Auckland Rugby"),
    node("nzr-can", "nzr", null, "region", "Canterbury Rugby"),
    node("nzr-wel", "nzr", null, "region", "Wellington Rugby"),
    node("nzr-wai", "nzr", null, "region", "Waikato Rugby"),
    node("nzr-ponsonby", "nzr", "nzr-akl", "club", "Ponsonby RFC", "Auckland", 5, 220),
    node("nzr-grammar", "nzr", "nzr-akl", "club", "Grammar Tec", "Auckland", 4, 176),
    node("nzr-chch", "nzr", "nzr-can", "club", "Christchurch RFC", "Christchurch", 4, 168),
    node("nzr-linwood", "nzr", "nzr-can", "club", "Linwood", "Christchurch", 3, 122),
    node("nzr-orongotai", "nzr", "nzr-wel", "club", "Oriental-Rongotai", "Wellington", 3, 140),
    node("nzr-petone", "nzr", "nzr-wel", "club", "Petone", "Lower Hutt", 4, 158),
    node("nzr-hamilton", "nzr", "nzr-wai", "club", "Hamilton Marist", "Hamilton", 3, 134),

    node("ken-nairobi", "ken", null, "region", "Nairobi"),
    node("ken-coast", "ken", null, "region", "Coast"),
    node("ken-rift", "ken", null, "region", "Rift Valley"),
    node("ken-kcb", "ken", "ken-nairobi", "club", "KCB RFC", "Nairobi", 2, 78),
    node("ken-impala", "ken", "ken-nairobi", "club", "Impala", "Nairobi", 2, 74),
    node("ken-quins", "ken", "ken-nairobi", "club", "Kenya Harlequin", "Nairobi", 2, 80),
    node("ken-mombasa", "ken", "ken-coast", "club", "Mombasa RFC", "Mombasa", 1, 52),
    node("ken-nakuru", "ken", "ken-rift", "club", "Nakuru RFC", "Nakuru", 2, 66),

    node("uru-oldc", "uru", null, "club", "Old Christians", "Montevideo", 3, 96),
    node("uru-carrasco", "uru", null, "club", "Carrasco Polo", "Montevideo", 3, 102),
    node("uru-trebol", "uru", null, "club", "Trébol", "Paysandú", 2, 70),
    node("uru-lobos", "uru", null, "club", "Lobos", "Montevideo", 2, 64),

    node("jrp-kanto", "jrp", null, "region", "Kanto"),
    node("jrp-kansai", "jrp", null, "region", "Kansai"),
    node("jrp-waseda", "jrp", "jrp-kanto", "club", "Waseda University", "Tokyo", 2, 88),
    node("jrp-meiji", "jrp", "jrp-kanto", "club", "Meiji University", "Tokyo", 2, 84),
    node("jrp-doshisha", "jrp", "jrp-kansai", "club", "Doshisha University", "Kyoto", 2, 76),
    node("jrp-ksu", "jrp", "jrp-kansai", "club", "Kyoto Sangyo", "Kyoto", 2, 72),

    node("ton-tongatapu", "ton", null, "region", "Tongatapu"),
    node("ton-toloa", "ton", "ton-tongatapu", "club", "Toloa Old Boys", "Nukuʻalofa", 1, 48),
    node("ton-hurricane", "ton", "ton-tongatapu", "club", "Hurricanes", "Nukuʻalofa", 1, 44),

    node("rau-nsw", "rau", null, "region", "New South Wales"),
    node("rau-qld", "rau", null, "region", "Queensland"),
    node("rau-randwick", "rau", "rau-nsw", "club", "Randwick", "Sydney", 4, 168),
    node("rau-eastwood", "rau", "rau-nsw", "club", "Eastwood", "Sydney", 3, 142),
    node("rau-brothers", "rau", "rau-qld", "club", "Brothers", "Brisbane", 4, 155),
    node("rau-gps", "rau", "rau-qld", "club", "GPS Rugby", "Brisbane", 3, 130),

    node("sam-upolu", "sam", null, "region", "Upolu"),
    node("sam-savaii", "sam", null, "region", "Savaiʻi"),
    node("sam-marist", "sam", "sam-upolu", "club", "Marist St Joseph", "Apia", 2, 88),
    node("sam-vaiala", "sam", "sam-upolu", "club", "Vaiala", "Apia", 2, 76),
    node("sam-safotu", "sam", "sam-savaii", "club", "Safotu", "Savaiʻi", 1, 52),

    node("sar-wp", "sar", null, "region", "Western Province"),
    node("sar-bulls", "sar", null, "region", "Blue Bulls"),
    node("sar-stellenbosch", "sar", "sar-wp", "club", "Maties", "Stellenbosch", 4, 190),
    node("sar-hamiltons", "sar", "sar-wp", "club", "Hamiltons", "Cape Town", 3, 128),
    node("sar-tuks", "sar", "sar-bulls", "club", "Tuks Rugby", "Pretoria", 4, 176),

    node("fra-idf", "fra", null, "region", "Île-de-France"),
    node("fra-occitanie", "fra", null, "region", "Occitanie"),
    node("fra-sf", "fra", "fra-idf", "club", "Stade Français", "Paris", 4, 210),
    node("fra-racing", "fra", "fra-idf", "club", "Racing 92", "Nanterre", 4, 198),
    node("fra-toulouse", "fra", "fra-occitanie", "club", "Stade Toulousain", "Toulouse", 5, 240),
    node("fra-montpellier", "fra", "fra-occitanie", "club", "Montpellier", "Montpellier", 3, 164),

    node("ire-leinster", "ire", null, "region", "Leinster"),
    node("ire-munster", "ire", null, "region", "Munster"),
    node("ire-lansdowne", "ire", "ire-leinster", "club", "Lansdowne", "Dublin", 4, 172),
    node("ire-clontarf", "ire", "ire-leinster", "club", "Clontarf", "Dublin", 3, 148),
    node("ire-corkcon", "ire", "ire-munster", "club", "Cork Constitution", "Cork", 3, 140),
    node("ire-shannon", "ire", "ire-munster", "club", "Shannon", "Limerick", 3, 136),

    node("usa-east", "usa", null, "region", "Atlantic"),
    node("usa-west", "usa", null, "region", "Pacific"),
    node("usa-nyac", "usa", "usa-east", "club", "New York AC", "New York", 2, 84),
    node("usa-life", "usa", "usa-east", "club", "Life University", "Atlanta", 2, 90),
    node("usa-seattle", "usa", "usa-west", "club", "Seattle RFC", "Seattle", 2, 78),

    node("can-ontario", "can", null, "region", "Ontario"),
    node("can-bc", "can", null, "region", "British Columbia"),
    node("can-scottish", "can", "can-ontario", "club", "Toronto Scottish", "Toronto", 3, 110),
    node("can-irish", "can", "can-ontario", "club", "Irish Canadians", "Toronto", 2, 86),
    node("can-ubc", "can", "can-bc", "club", "UBC Thunderbirds", "Vancouver", 3, 124),

    node("arg-ba", "arg", null, "region", "Buenos Aires"),
    node("arg-interior", "arg", null, "region", "Interior"),
    node("arg-hindu", "arg", "arg-ba", "club", "Hindú", "Buenos Aires", 4, 168),
    node("arg-casi", "arg", "arg-ba", "club", "CASI", "San Isidro", 4, 160),
    node("arg-tucuman", "arg", "arg-interior", "club", "Tucumán Rugby", "Tucumán", 3, 132),

    node("hkr-island", "hkr", null, "region", "Hong Kong Island"),
    node("hkr-kowloon", "hkr", null, "region", "Kowloon"),
    node("hkr-fc", "hkr", "hkr-island", "club", "Hong Kong Football Club", "Happy Valley", 4, 148),
    node("hkr-valley", "hkr", "hkr-island", "club", "Valley RFC", "Happy Valley", 3, 120),
    node("hkr-tigers", "hkr", "hkr-kowloon", "club", "USRC Tigers", "Kowloon", 3, 112),
  ];
}

function licensedComp(row: {
  id: string;
  licenseId: string;
  unionId: string;
  name: string;
  shortName: string;
  location: string;
  startDate: string;
  endDate: string;
  status: Competition["status"];
  teams: number;
  matches: number;
  hostUnion: string;
  hostCities: string;
  structure: string;
  description: string;
}): Competition {
  const { unionId, ...rest } = row;
  return {
    ...rest,
    season: "2026",
    hero: false,
    format: "15s",
    hostCountry: row.location,
    organiser: row.hostUnion,
    broadcaster: "Union production",
    lawNotes: "World Rugby Laws of the Game. Delivered on a member TMS licence.",
    ownerUnionId: unionId,
  };
}

export function createLicensedCompetitions(): Competition[] {
  return [
    licensedComp({
      id: "county-champs-2026",
      licenseId: "lic-eng",
      unionId: "eng",
      name: "County Championship 2026",
      shortName: "County 2026",
      location: "England",
      startDate: "2026-05-09",
      endDate: "2026-06-28",
      status: "completed",
      teams: 20,
      matches: 36,
      hostUnion: "Rugby Football Union",
      hostCities: "Twickenham, Exeter, Leicester, Newcastle",
      structure: "Pools then knockout",
      description: "RFU senior county championship, run on the licensed TMS.",
    }),
    licensedComp({
      id: "rfu-u18-2026",
      licenseId: "lic-eng",
      unionId: "eng",
      name: "RFU U18 Club Festival 2026",
      shortName: "U18 Clubs",
      location: "England",
      startDate: "2026-09-06",
      endDate: "2026-09-21",
      status: "live",
      teams: 16,
      matches: 24,
      hostUnion: "Rugby Football Union",
      hostCities: "Leeds, Bath, Northampton",
      structure: "Pools then ranking finals",
      description: "Club pathway festival. Live round in progress.",
    }),
    licensedComp({
      id: "skipper-cup-2026",
      licenseId: "lic-fij",
      unionId: "fij",
      name: "Skipper Cup 2026",
      shortName: "Skipper Cup",
      location: "Fiji",
      startDate: "2026-07-04",
      endDate: "2026-09-26",
      status: "live",
      teams: 8,
      matches: 28,
      hostUnion: "Fiji Rugby Union",
      hostCities: "Suva, Sigatoka, Lautoka, Nadi",
      structure: "Round robin",
      description: "Provincial club championship. Nadroga v Suva is the current window.",
    }),
    licensedComp({
      id: "npc-2026",
      licenseId: "lic-nzr",
      unionId: "nzr",
      name: "Bunnings NPC 2026",
      shortName: "NPC 2026",
      location: "New Zealand",
      startDate: "2026-08-01",
      endDate: "2026-10-25",
      status: "live",
      teams: 14,
      matches: 76,
      hostUnion: "New Zealand Rugby",
      hostCities: "Auckland, Christchurch, Wellington, Hamilton, Dunedin",
      structure: "Round robin",
      description: "National provincial championship delivered by NZR on TMS.",
    }),
    licensedComp({
      id: "kenya-cup-2026",
      licenseId: "lic-ken",
      unionId: "ken",
      name: "Kenya Cup 2026",
      shortName: "Kenya Cup",
      location: "Kenya",
      startDate: "2026-02-08",
      endDate: "2026-06-21",
      status: "completed",
      teams: 10,
      matches: 45,
      hostUnion: "Kenya Rugby Union",
      hostCities: "Nairobi, Nakuru, Mombasa",
      structure: "Round robin",
      description: "Club championship. Archive retained for HQ monitoring.",
    }),
    licensedComp({
      id: "uru-nacional-2026",
      licenseId: "lic-uru",
      unionId: "uru",
      name: "Campeonato Nacional 2026",
      shortName: "Nacional 2026",
      location: "Uruguay",
      startDate: "2026-04-12",
      endDate: "2026-09-13",
      status: "completed",
      teams: 8,
      matches: 28,
      hostUnion: "Unión de Rugby del Uruguay",
      hostCities: "Montevideo, Paysandú",
      structure: "Round robin",
      description: "Club championship run by URU.",
    }),
    licensedComp({
      id: "jrp-university-2026",
      licenseId: "lic-jrp",
      unionId: "jrp",
      name: "University Championship 2026",
      shortName: "Uni Champs",
      location: "Japan",
      startDate: "2026-09-07",
      endDate: "2026-12-14",
      status: "upcoming",
      teams: 16,
      matches: 15,
      hostUnion: "Japan Rugby Football Union",
      hostCities: "Tokyo, Kyoto, Osaka",
      structure: "Knockout only",
      description: "University knockout. Squad window is open.",
    }),
  ];
}

export function createLicensedMatches(): Match[] {
  const blankOfficials = { referee: "Union panel", ar1: "TBC", ar2: "TBC", tmo: "TBC" };
  return [
    {
      id: "skipper-nadroga-suva",
      competitionId: "skipper-cup-2026",
      round: "Round 9",
      kickoff: "2026-09-20T03:00:00.000Z",
      venueId: "suva",
      homeTeam: "Nadroga",
      homeFlag: "🇫🇯",
      awayTeam: "Suva Rugby",
      awayFlag: "🇫🇯",
      homeScore: 18,
      awayScore: 14,
      status: "live",
      period: "second-half",
      officials: blankOfficials,
      feedsRankings: false,
    },
    {
      id: "u18-leicester-exeter",
      competitionId: "rfu-u18-2026",
      round: "Pool A",
      kickoff: "2026-09-18T14:00:00.000Z",
      venueId: "newcastle",
      homeTeam: "Leicester Tigers U18",
      homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      awayTeam: "Exeter Chiefs U18",
      awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      homeScore: 22,
      awayScore: 22,
      status: "live",
      period: "second-half",
      officials: blankOfficials,
      feedsRankings: false,
    },
    {
      id: "npc-akl-can",
      competitionId: "npc-2026",
      round: "Round 7",
      kickoff: "2026-09-19T07:05:00.000Z",
      venueId: "tokyo",
      homeTeam: "Auckland",
      homeFlag: "🇳🇿",
      awayTeam: "Canterbury",
      awayFlag: "🇳🇿",
      homeScore: null,
      awayScore: null,
      status: "scheduled",
      period: "prematch",
      officials: blankOfficials,
      feedsRankings: false,
    },
    {
      id: "kenya-kcb-impala",
      competitionId: "kenya-cup-2026",
      round: "Final",
      kickoff: "2026-06-21T12:00:00.000Z",
      venueId: "hongkong",
      homeTeam: "KCB RFC",
      homeFlag: "🇰🇪",
      awayTeam: "Impala",
      awayFlag: "🇰🇪",
      homeScore: 27,
      awayScore: 19,
      status: "final",
      period: "full-time",
      officials: blankOfficials,
      feedsRankings: false,
    },
  ];
}

export function treeForUnion(nodes: FederationNode[], unionId: string) {
  const list = nodes.filter((row) => row.unionId === unionId);
  const roots = list.filter((row) => !row.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const childrenOf = (id: string) => list.filter((row) => row.parentId === id).sort((a, b) => a.name.localeCompare(b.name));
  return { roots, childrenOf, list };
}
