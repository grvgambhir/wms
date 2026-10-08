import type { OpsModule, OpsStatus, TournamentOpsItem } from "./types";

type Row = [title: string, meta: string, owner: string, status: OpsStatus];

function pack(competitionId: string, module: OpsModule, rows: Row[]): TournamentOpsItem[] {
  return rows.map((row, index) => ({
    id: `ops-${competitionId}-${module}-${index + 1}`,
    competitionId,
    module,
    title: row[0],
    meta: row[1],
    owner: row[2],
    status: row[3],
  }));
}

export function starterOps(competitionId: string): TournamentOpsItem[] {
  const rows: [OpsModule, string, string][] = [
    ["officials", "Appoint tournament referee manager", "Match officials panel TBC"],
    ["medical", "Name tournament medical director", "HIA bunker and pitch-side cover TBC"],
    ["broadcast", "Confirm host broadcaster", "World feed production TBC"],
    ["media", "Open media operations plan", "Mixed zone and press conference TBC"],
    ["accreditation", "Open accreditation window", "Categories and quotas TBC"],
    ["hospitality", "Define official hospitality inventory", "Suites and village TBC"],
    ["accommodation", "Hold team hotel blocks", "Officials and media hotels TBC"],
    ["transport", "Draft team transfer plan", "Airport, hotel and venue loops TBC"],
    ["workforce", "Open volunteer and contractor plan", "Roles and vendors TBC"],
  ];
  return rows.map(([module, title, meta], index) => ({
    id: `ops-${competitionId}-${module}-${index + 1}`,
    competitionId,
    module,
    title,
    meta,
    owner: "HQ Competitions",
    status: "planned" as const,
  }));
}

export function createTournamentOps(): TournamentOpsItem[] {
  return [
    ...pack("rwc-2027", "officials", [
      ["Tournament referee manager", "Nigel Owens (programme lead) · 18-match panel", "Match Officials", "assigned"],
      ["Elite referee panel", "O’Keeffe, Amashukeli, Piardi, Gardner, Pearce, Brousset", "Match Officials", "in-progress"],
      ["Assistant referee & TMO pool", "24 ARs · 12 TMOs · bunker operators", "Match Officials", "in-progress"],
      ["Citing commissioner roster", "Independent citing for all knockout matches", "Integrity", "planned"],
      ["Laws briefing - Pool Round 1", "Sydney, 28 Sep 2027", "Match Officials", "planned"],
    ]),
    ...pack("rwc-2027", "medical", [
      ["Tournament medical director", "Dr Sarah Keating · independent of host union", "Medical", "assigned"],
      ["HIA bunker - Accor Stadium", "Independent reviewers on site for every match", "Medical", "in-progress"],
      ["Pitch-side MD roster", "Two doctors + IMS per match · 8 venues", "Medical", "in-progress"],
      ["Ambulance & hospital SLA", "Level-1 trauma within 15 minutes of each venue", "Medical", "assigned"],
      ["Player welfare desk", "24/7 RTP coordination with union IMGs", "Medical", "planned"],
    ]),
    ...pack("rwc-2027", "broadcast", [
      ["Host broadcaster", "Stan Sport / Nine · Australia domestic", "Broadcast", "assigned"],
      ["World feed production", "Gravity Media · 48-match host production", "Broadcast", "in-progress"],
      ["UK & Ireland rights", "ITV / RTÉ window confirmed", "Broadcast", "assigned"],
      ["France rights", "TF1 + France Télévisions split", "Broadcast", "assigned"],
      ["Radio world feed", "World Rugby Radio + union opt-outs", "Broadcast", "planned"],
    ]),
    ...pack("rwc-2027", "media", [
      ["Media accreditation window", "Opens Jan 2027 · closes 1 Sep 2027", "Communications", "planned"],
      ["Mixed-zone protocol", "Captains + two players · 12-minute window", "Communications", "assigned"],
      ["Main press conference room", "Accor Stadium media centre · 180 seats", "Communications", "in-progress"],
      ["Flash interview positions", "Pitch-side rights-holder first, then written press", "Communications", "assigned"],
      ["Content rights kit", "Stills, clips and social embargo timetable", "Communications", "in-progress"],
    ]),
    ...pack("rwc-2027", "accreditation", [
      ["Team staff passes", "35 per union · RFID + photo", "Accreditation", "planned"],
      ["Media P1 / P2", "Written, photo, broadcast compounds", "Accreditation", "planned"],
      ["Broadcaster workforce", "Host + rights-holder overlays", "Accreditation", "in-progress"],
      ["Hospitality & guests", "Day passes tied to ticket blocks", "Accreditation", "planned"],
      ["Workforce RFID", "Volunteers, security, medical, transport", "Accreditation", "in-progress"],
    ]),
    ...pack("rwc-2027", "hospitality", [
      ["Official hospitality - Accor", "1,200 covers · match-day village", "Commercial", "in-progress"],
      ["Corporate suites - Melbourne", "AAMI Park · 18 suites sold", "Commercial", "assigned"],
      ["Union presidents’ lounge", "All knockout venues", "Commercial", "planned"],
      ["Sponsor village - Brisbane", "Suncorp precinct activation", "Commercial", "in-progress"],
    ]),
    ...pack("rwc-2027", "accommodation", [
      ["Team hotels - Sydney CBD", "Four 5-star blocks · 20-night hold", "Operations", "assigned"],
      ["Officials hotel - Darling Harbour", "Single occupancy · secure floor", "Operations", "assigned"],
      ["Media hotel - Olympic Park", "Press shuttle to Accor", "Operations", "in-progress"],
      ["Workforce village - Brisbane", "Volunteer overflow · 400 rooms", "Operations", "planned"],
    ]),
    ...pack("rwc-2027", "transport", [
      ["Airport arrivals - Sydney T1", "Team greeters + bonded luggage", "Operations", "planned"],
      ["Team coach loops", "Hotel ↔ training ↔ venue · dedicated lanes", "Operations", "in-progress"],
      ["Officials cars", "Secure cars + police escort knockout nights", "Operations", "assigned"],
      ["Broadcast compound trucks", "Overnight park-up at each stadium", "Operations", "in-progress"],
      ["Park-and-ride - Accor", "Spectator shuttle from Olympic Park rail", "Operations", "planned"],
    ]),
    ...pack("rwc-2027", "workforce", [
      ["Volunteer programme", "8,400 roles · training from Mar 2027", "Workforce", "in-progress"],
      ["Security contractor", "Venue plus team hotel overlay", "Workforce", "assigned"],
      ["Pitch operations", "Grounds, ball crew, kicking tees, TMO cabling", "Workforce", "in-progress"],
      ["Medical stewards", "Stretchers and tunnel support per match", "Workforce", "planned"],
      ["Language services", "EN / FR / ES / JA interpreters", "Workforce", "planned"],
    ]),
    ...pack("pnc-2026", "officials", [
      ["Match officials panel", "Asia-Pacific panel for remaining rounds", "Match Officials", "assigned"],
      ["Citing commissioner", "On call for Round 3-final", "Integrity", "assigned"],
    ]),
    ...pack("pnc-2026", "medical", [
      ["Pitch-side cover - Tokyo", "Host union IMS + independent HIA reviewer", "Medical", "assigned"],
      ["Hospital SLA - Vancouver", "BC Place match window", "Medical", "in-progress"],
    ]),
    ...pack("pnc-2026", "broadcast", [
      ["World feed", "Fiji / Japan / Canada host productions", "Broadcast", "in-progress"],
      ["Rankings graphics package", "Men’s 15s exchange overlay", "Broadcast", "assigned"],
    ]),
    ...pack("pnc-2026", "media", [
      ["Mixed zone - Chichibunomiya", "Captains plus one player", "Communications", "assigned"],
    ]),
    ...pack("pnc-2026", "accreditation", [
      ["Team and media day passes", "Host union desk at each venue", "Accreditation", "in-progress"],
    ]),
    ...pack("pnc-2026", "hospitality", [
      ["Union lounge - BC Place", "Pacific & North America guests", "Commercial", "assigned"],
    ]),
    ...pack("pnc-2026", "accommodation", [
      ["Team hotel - Tokyo", "Officials on separate floor", "Operations", "assigned"],
    ]),
    ...pack("pnc-2026", "transport", [
      ["Team transfers - Suva", "Hotel to HFC Bank Stadium", "Operations", "in-progress"],
    ]),
    ...pack("pnc-2026", "workforce", [
      ["Host union match-day staff", "Ball crew and medical stewards", "Workforce", "assigned"],
    ]),
    ...pack("svns-2026", "officials", [
      ["Sevens referee panel - Hong Kong", "Flying officials for the round", "Match Officials", "assigned"],
    ]),
    ...pack("svns-2026", "medical", [
      ["Pitch-side IMS - Kai Tak", "HIA protocol for sevens window", "Medical", "assigned"],
    ]),
    ...pack("svns-2026", "broadcast", [
      ["SVNS world feed - Hong Kong", "Men’s and women’s courts", "Broadcast", "in-progress"],
    ]),
    ...pack("svns-2026", "media", [
      ["Flash zone - Kai Tak", "Rights-holder first after each final", "Communications", "assigned"],
    ]),
    ...pack("svns-2026", "accreditation", [
      ["Circuit media passes", "Season-long plus round overlays", "Accreditation", "complete"],
    ]),
    ...pack("svns-2026", "hospitality", [
      ["SVNS village - Hong Kong", "Sponsor and union hospitality", "Commercial", "in-progress"],
    ]),
    ...pack("svns-2026", "accommodation", [
      ["Team hotel - Kowloon", "Men’s and women’s squads split floors", "Operations", "assigned"],
    ]),
    ...pack("svns-2026", "transport", [
      ["Team loops - Kai Tak", "Hotel to stadium 20-minute hold", "Operations", "assigned"],
    ]),
    ...pack("svns-2026", "workforce", [
      ["Round volunteers", "Pitch, medical and guest services", "Workforce", "in-progress"],
    ]),
    ...pack("u20-2026", "officials", [
      ["U20 referee development panel", "Pathway officials with mentor TMOs", "Match Officials", "planned"],
    ]),
    ...pack("u20-2026", "medical", [
      ["Tournament medical director", "Independent of FIR", "Medical", "planned"],
    ]),
    ...pack("u20-2026", "broadcast", [
      ["Host production - Italy", "World Rugby digital world feed", "Broadcast", "planned"],
    ]),
    ...pack("u20-2026", "media", [
      ["Squad announcement window", "Opens April 2026", "Communications", "planned"],
    ]),
    ...pack("u20-2026", "accreditation", [
      ["Team staff quotas", "28 per union including medical", "Accreditation", "planned"],
    ]),
    ...pack("u20-2026", "hospitality", [
      ["Union guest packages", "Pool venues in Italy", "Commercial", "planned"],
    ]),
    ...pack("u20-2026", "accommodation", [
      ["Team hotels - host cities", "Hold requested with FIR", "Operations", "planned"],
    ]),
    ...pack("u20-2026", "transport", [
      ["Airport arrivals plan", "Milan and Rome gateways", "Operations", "planned"],
    ]),
    ...pack("u20-2026", "workforce", [
      ["FIR volunteer call", "Opens January 2026", "Workforce", "planned"],
    ]),
    ...pack("wrwc-2025", "officials", [
      ["Match officials archive", "Finals panel closed - records retained", "Match Officials", "complete"],
    ]),
    ...pack("wrwc-2025", "medical", [
      ["Medical incident archive", "HIA and RTP files retained for HQ", "Medical", "complete"],
    ]),
    ...pack("wrwc-2025", "broadcast", [
      ["World feed archive", "32-match host production library", "Broadcast", "complete"],
    ]),
    ...pack("wrwc-2025", "media", [
      ["Press conference transcripts", "Final and bronze final held", "Communications", "complete"],
    ]),
    ...pack("wrwc-2025", "accreditation", [
      ["Accreditation close-out", "Passes deactivated post-final", "Accreditation", "complete"],
    ]),
    ...pack("wrwc-2025", "hospitality", [
      ["Hospitality reconciliation", "England 2025 commercial close", "Commercial", "complete"],
    ]),
    ...pack("wrwc-2025", "accommodation", [
      ["Hotel release complete", "Team and officials blocks closed", "Operations", "complete"],
    ]),
    ...pack("wrwc-2025", "transport", [
      ["Transport close-out", "Contractor invoices archived", "Operations", "complete"],
    ]),
    ...pack("wrwc-2025", "workforce", [
      ["Volunteer programme closed", "Thank-you and certificates issued", "Workforce", "complete"],
    ]),
  ];
}
