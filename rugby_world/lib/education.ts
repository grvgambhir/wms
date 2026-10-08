import type { Certificate, CourseMaterial, Enrolment, ExamAnswer, ExamQuestion, Learner, LearnerStatus, ProjectWork } from "./types";

type Row = Omit<CourseMaterial, "id">;

function pack(rows: Row[]): CourseMaterial[] {
  return rows.map((row, index) => ({
    ...row,
    id: `mat-${row.courseId}-${index + 1}`,
  }));
}

export function createCourseMaterials(): CourseMaterial[] {
  return pack([
    {
      courseId: "course-concussion",
      kind: "video",
      title: "Recognising concussion - HQ briefing",
      url: "https://www.world.rugby/the-game/player-welfare/medical/concussion",
      notes: "Paste a YouTube or Vimeo URL to embed the film in the course.",
    },
    {
      courseId: "course-concussion",
      kind: "link",
      title: "HIA protocol (World Rugby)",
      url: "https://www.world.rugby/the-game/player-welfare/medical/concussion",
    },
    {
      courseId: "course-concussion",
      kind: "document",
      title: "Graduated return to play - pocket guide",
      url: "",
      fileName: "WR-GRTP-2026.pdf",
      sizeLabel: "1.4 MB",
    },
    {
      courseId: "course-ready",
      kind: "video",
      title: "Rugby Ready warm-up",
      url: "https://passport.world.rugby",
      notes: "Passport module video.",
    },
    {
      courseId: "course-ready",
      kind: "link",
      title: "Rugby Ready resource hub",
      url: "https://passport.world.rugby",
    },
    {
      courseId: "course-l1-coach",
      kind: "document",
      title: "Session planner template",
      url: "",
      fileName: "WR-L1-session-planner.docx",
      sizeLabel: "220 KB",
    },
    {
      courseId: "course-l1-coach",
      kind: "link",
      title: "Coaching competency framework",
      url: "https://www.world.rugby/the-game/education",
    },
    {
      courseId: "course-mo",
      kind: "video",
      title: "Advantage and game management",
      url: "https://www.world.rugby/the-game/laws",
    },
    {
      courseId: "course-mo",
      kind: "document",
      title: "Match officials Level 1 workbook",
      url: "",
      fileName: "WR-MO-L1-workbook.pdf",
      sizeLabel: "3.1 MB",
    },
    {
      courseId: "course-firstaid",
      kind: "link",
      title: "First Aid in Rugby course page",
      url: "https://passport.world.rugby",
    },
    {
      courseId: "course-firstaid",
      kind: "document",
      title: "Emergency action plan template",
      url: "",
      fileName: "WR-EAP-template.pdf",
      sizeLabel: "480 KB",
    },
    {
      courseId: "course-laws",
      kind: "link",
      title: "Laws of the Game 2026",
      url: "https://www.world.rugby/the-game/laws",
    },
    {
      courseId: "course-sc",
      kind: "document",
      title: "Contact preparation checklist",
      url: "",
      fileName: "WR-SC-L1-checklist.pdf",
      sizeLabel: "310 KB",
    },
  ]);
}

export function youtubeId(url: string) {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return match?.[1] ?? null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resultForScore(score: number, passMark: number): "passed" | "failed" {
  return score >= passMark ? "passed" : "failed";
}

export function unionStatsFromLearners(learners: Learner[], unionId: string): Enrolment[] {
  const byCourse = new Map<string, Learner[]>();
  for (const learner of learners.filter((row) => row.unionId === unionId)) {
    const list = byCourse.get(learner.courseId) ?? [];
    list.push(learner);
    byCourse.set(learner.courseId, list);
  }
  return [...byCourse.entries()]
    .map(([courseId, rows]) => {
      const first = rows[0];
      return {
        id: `u-${unionId}-${courseId}`,
        courseId,
        unionId,
        unionName: first?.unionName ?? "",
        enrolled: rows.filter((row) => row.status !== "requested" && row.status !== "declined").length,
        completed: rows.filter((row) => row.status === "passed" || row.certificateId).length,
        inProgress: rows.filter((row) => row.status === "enrolled" || row.status === "in-progress").length,
      };
    })
    .filter((row) => row.enrolled > 0);
}

const UNIONS: Record<string, string> = {
  eng: "Rugby Football Union",
  nzr: "New Zealand Rugby",
  rau: "Rugby Australia",
  fij: "Fiji Rugby Union",
  sam: "Samoa Rugby Union",
  ton: "Tonga Rugby Union",
  sar: "SA Rugby",
  ken: "Kenya Rugby Union",
  fra: "Fédération Française de Rugby",
  ire: "Irish Rugby Football Union",
  jrp: "Japan Rugby Football Union",
  usa: "USA Rugby",
  can: "Rugby Canada",
  arg: "Unión Argentina de Rugby",
  uru: "Unión de Rugby del Uruguay",
  hkr: "Hong Kong China Rugby",
};

const ROLE_BANK: Record<string, string[]> = {
  "course-concussion": ["Team Doctor", "Union Medical Officer", "Match-day doctor", "Tournament doctor"],
  "course-ready": ["Community coach", "School teacher", "Age-grade coach", "Club coach"],
  "course-l1-coach": ["Community coach", "Women's coach", "Age-grade coach", "Academy coach"],
  "course-mo": ["Referee", "Assistant referee", "TMO pathway", "Match observer"],
  "course-firstaid": ["Pitch-side first-aider", "Physiotherapist", "Club medic", "Team manager"],
  "course-laws": ["Competition manager", "Match commissioner", "Coach", "Match official"],
};

function slugEmail(name: string, unionId: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}@${unionId}.worldrugby.demo`;
}

export function credentialPrefix(courseId: string) {
  return CERT_PREFIX[courseId] ?? "EDU";
}

export function nextCredentialId(courseId: string, existing: { courseId: string }[]) {
  const n = existing.filter((row) => row.courseId === courseId).length + 1;
  return `WR-EDU-${credentialPrefix(courseId)}-${String(n).padStart(4, "0")}`;
}

export function certificateValidity(expiresAt?: string) {
  if (!expiresAt) return "No expiry" as const;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "Expired" as const;
  if (days <= 90) return "Expiring" as const;
  return "Valid" as const;
}

const CERT_PREFIX: Record<string, string> = {
  "course-concussion": "CONC",
  "course-ready": "RDY",
  "course-l1-coach": "L1",
  "course-mo": "MO",
  "course-firstaid": "FA",
  "course-laws": "LAW",
};

function q(id: string, prompt: string, options: string[], correctIndex: number): ExamQuestion {
  return { id, prompt, options, correctIndex };
}

const EXAMS: Record<string, ExamQuestion[]> = {
  "course-concussion": [
    q("conc-1", "A player is dazed after a tackle and slow to get up. What is the first action?", ["Play on and review at half-time", "Remove the player for an HIA", "Give water and continue", "Ask the captain to decide"], 1),
    q("conc-2", "HIA1 is completed:", ["In the changing room after the match", "Pitch-side during the temporary replacement window", "By the team manager on the bench", "Only if the player requests it"], 1),
    q("conc-3", "A confirmed concussion means graduated return to play starts at:", ["Stage 4, full contact", "Stage 1, symptom-limited activity", "Match minutes next weekend", "Gym only, no review"], 1),
    q("conc-4", "Which sign requires immediate and permanent removal?", ["Mild fatigue", "Loss of consciousness", "A missed tackle", "A yellow card"], 1),
  ],
  "course-ready": [
    q("rdy-1", "The main aim of a Rugby Ready warm-up is to:", ["Tire players before kick-off", "Prepare body and mind for contact", "Replace the cool-down", "Shorten training"], 1),
    q("rdy-2", "Safe tackle technique starts with:", ["Head above the ball", "Eyes up, short steps, wrap with the arms", "Leaving the feet early", "A high fend"], 1),
    q("rdy-3", "Who holds duty of care for a community session?", ["Only World Rugby", "The coach running the session", "The referee only", "Spectators"], 1),
    q("rdy-4", "A player reports a headache after a bump. You should:", ["Keep them in the game", "Remove them and follow concussion guidance", "Move them to the wing", "Wait until full time"], 1),
  ],
  "course-l1-coach": [
    q("l1-1", "A Level 1 session plan should always include:", ["A hotel booking", "Purpose, activity, time and safety notes", "A broadcast plan", "Rankings points"], 1),
    q("l1-2", "The best way to correct a skill is to:", ["Stop the whole session for 20 minutes", "Freeze, demo, replay with a simple cue", "Shout from the far touchline", "Ignore it until Saturday"], 1),
    q("l1-3", "Game understanding at this level is taught by:", ["Lecture only", "Even-sided games with a clear constraint", "Fitness tests", "Video of a Test match only"], 1),
    q("l1-4", "Before contact, players need:", ["No briefing", "Space, body position and permission to go to ground", "Full 15-a-side immediately", "A scrum machine"], 1),
  ],
  "course-mo": [
    q("mo-1", "Advantage should be played when:", ["A team is in its own 22 and kicking", "There is a clear chance of territorial or tactical gain", "The crowd is noisy", "Time is almost up"], 1),
    q("mo-2", "Primary position at the tackle is:", ["On the goal line", "Where you can see the ball and both arriving players", "In the coaching box", "Behind the TMO screen"], 1),
    q("mo-3", "A high tackle with no mitigation is:", ["Play on", "A foul-play sanction", "Always a penalty try", "A scrum to the defending team"], 1),
    q("mo-4", "Communication with players should be:", ["Long speeches", "Short, early and specific", "Only via the captain after full time", "Silent"], 1),
  ],
  "course-firstaid": [
    q("fa-1", "The first check in an emergency action plan is:", ["The scoreboard", "Scene safety and response", "Social media", "The substitution card"], 1),
    q("fa-2", "A player is unconscious after a collapse. You:", ["Sit them up for water", "Protect the airway and call emergency services", "Roll them onto the ball", "Wait for the next stoppage"], 1),
    q("fa-3", "Suspected spinal injury management starts with:", ["Removing the headguard", "Manual in-line stabilisation", "A scrum reset", "Walking them off"], 1),
    q("fa-4", "Pitch-side first aid kits must include:", ["Only tape", "An up-to-date EAP and airway kit", "Match programmes", "Captain's armband"], 1),
  ],
  "course-laws": [
    q("law-1", "The 2026 breakdown trial expects the tackler to:", ["Seal off on the ball", "Release and roll away so the ball can be played", "Stay on the ball until a ruck forms", "Kick the ball immediately"], 1),
    q("law-2", "Offside at the ruck is judged from:", ["The 10-metre line", "The hindmost foot of the player's own team", "The touchline", "The posts"], 1),
    q("law-3", "A dangerous clear-out targeting the head is:", ["A scrum", "Foul play", "Advantage only", "A free kick"], 1),
    q("law-4", "A penalty try is awarded when:", ["A try would probably have been scored but for foul play", "A conversion is missed", "The clock is red", "A scrum wheels"], 1),
  ],
};

const PROJECTS: Record<string, { title: string; brief: string }> = {
  "course-concussion": {
    title: "HIA case review",
    brief: "Write up one match-day HIA from pitch-side to GRTP stage 2. Include timestamps, who made the call, and what you would do differently.",
  },
  "course-ready": {
    title: "Session warm-up plan",
    brief: "Submit a 15-minute Rugby Ready warm-up for an age-grade side, with diagrams or a short video note.",
  },
  "course-l1-coach": {
    title: "Session planner",
    brief: "Plan a 60-minute community session with purpose, organisation, key coaching points and a safety check.",
  },
  "course-mo": {
    title: "Game management clip",
    brief: "Review a 5-minute passage: where you would stand, when you would play advantage, and one communication example.",
  },
  "course-firstaid": {
    title: "Emergency action plan",
    brief: "Complete an EAP for your home ground: access, kit, roles and a suspected spinal scenario.",
  },
  "course-laws": {
    title: "Law-trial briefing",
    brief: "Brief a club on one 2026 law trial. One page: what changed, how to coach it, one common error.",
  },
};

const DEFAULT_EXAM: ExamQuestion[] = [
  q("gen-1", "The course assessment is complete when you:", ["Close the tab", "Submit the exam and the project", "Email a friend", "Watch the first video"], 1),
  q("gen-2", "Duty of care sits with:", ["Spectators", "The person delivering the session", "Broadcast", "Ticketing"], 1),
];

const DEFAULT_PROJECT = {
  title: "Course project",
  brief: "Upload a short written or video reflection on how you will use this course in your union.",
};

export function examForCourse(courseId: string): ExamQuestion[] {
  return EXAMS[courseId] ?? DEFAULT_EXAM;
}

export function projectForCourse(courseId: string) {
  return PROJECTS[courseId] ?? DEFAULT_PROJECT;
}

export function examScore(questions: ExamQuestion[], answers: ExamAnswer[]) {
  if (!questions.length) return 0;
  const byId = new Map(answers.map((row) => [row.questionId, row.selectedIndex]));
  const marks = questions.filter((question) => byId.get(question.id) === question.correctIndex).length;
  return Math.round((marks / questions.length) * 100);
}

function workFor(person: SeedPerson, learnerId: string): Pick<Learner, "examAnswers" | "examSubmittedAt" | "project"> {
  const questions = examForCourse(person.courseId);
  const project = projectForCourse(person.courseId);
  const salt = learnerId.charCodeAt(learnerId.length - 1) + (person.score ?? 0);
  if (person.status === "enrolled" || person.status === "requested" || person.status === "declined") return {};
  const answered = person.status === "in-progress" ? questions.slice(0, 2) : questions;
  const examAnswers = answered.map((question, index) => {
    const wantCorrect =
      person.status === "passed" ? index < questions.length - (person.score && person.score < 92 ? 1 : 0) : person.status === "failed" ? index === 0 : index === 0;
    return {
      questionId: question.id,
      selectedIndex: wantCorrect ? question.correctIndex : (question.correctIndex + 1 + (salt % 3)) % question.options.length,
    };
  });
  const examSubmittedAt = person.status === "in-progress" ? undefined : person.completedAt ?? person.enrolledAt;
  if (person.status === "in-progress" && salt % 2 === 0) {
    return { examAnswers };
  }
  const fileStem = person.name.replace(/^Dr\s+/, "").split(" ")[1] ?? "Learner";
  const projectWork: ProjectWork | undefined =
    person.status === "in-progress" && salt % 3 === 0
      ? undefined
      : {
            title: project.title,
            fileName: `${fileStem}-${project.title.replace(/\s+/g, "-")}.pdf`,
            notes:
              person.status === "failed"
                ? "Submitted late. Need a clearer timeline and named roles."
                : person.status === "in-progress"
                  ? "First draft uploaded. Waiting on feedback."
                  : "Match-day notes attached. Ready for review.",
            submittedAt: person.completedAt ?? person.enrolledAt,
            status: person.status === "passed" || person.status === "failed" ? "graded" : "submitted",
            grade: person.status === "passed" ? Math.max(70, (person.score ?? 80) - 8) : person.status === "failed" ? 58 : undefined,
            feedback:
              person.status === "passed"
                ? "Clear structure. Sign off and share with the union medical lead."
                : person.status === "failed"
                  ? "Resubmit with the missing HIA timestamps and a named decision-maker."
                  : undefined,
          };
  return { examAnswers, examSubmittedAt, project: projectWork };
}

type SeedPerson = {
  courseId: string;
  name: string;
  unionId: string;
  enrolledAt: string;
  status: LearnerStatus;
  score?: number;
  completedAt?: string;
  certified?: boolean;
  decisionNote?: string;
};

function day(value: string) {
  return `${value}T10:00:00.000Z`;
}

const PEOPLE: SeedPerson[] = [
  // Concussion Management for Doctors
  { courseId: "course-concussion", name: "Dr Priya Shah", unionId: "eng", enrolledAt: day("2026-06-01"), status: "passed", score: 96, completedAt: day("2026-08-19"), certified: true },
  { courseId: "course-concussion", name: "Dr Hemi Rangi", unionId: "nzr", enrolledAt: day("2026-05-12"), status: "passed", score: 94, completedAt: day("2026-07-02"), certified: true },
  { courseId: "course-concussion", name: "Dr Leah Ngata", unionId: "nzr", enrolledAt: day("2026-07-18"), status: "passed", score: 91, completedAt: day("2026-09-12"), certified: true },
  { courseId: "course-concussion", name: "Dr Tom Brennan", unionId: "ire", enrolledAt: day("2026-04-08"), status: "passed", score: 93, completedAt: day("2026-06-21"), certified: true },
  { courseId: "course-concussion", name: "Dr Siobhan Walsh", unionId: "ire", enrolledAt: day("2026-05-03"), status: "passed", score: 90, completedAt: day("2026-07-14"), certified: true },
  { courseId: "course-concussion", name: "Dr Jean-Luc Petit", unionId: "fra", enrolledAt: day("2026-03-22"), status: "passed", score: 95, completedAt: day("2026-05-30"), certified: true },
  { courseId: "course-concussion", name: "Dr Thabo Nkosi", unionId: "sar", enrolledAt: day("2026-04-16"), status: "passed", score: 92, completedAt: day("2026-06-11"), certified: true },
  { courseId: "course-concussion", name: "Dr Hiroshi Tanaka", unionId: "jrp", enrolledAt: day("2026-06-09"), status: "passed", score: 89, completedAt: day("2026-08-02"), certified: true },
  { courseId: "course-concussion", name: "Dr Claire Bennett", unionId: "eng", enrolledAt: day("2026-06-20"), status: "passed", score: 97, completedAt: day("2026-09-01"), certified: true },
  { courseId: "course-concussion", name: "Dr Camila Rossi", unionId: "arg", enrolledAt: day("2026-07-01"), status: "passed", score: 91, completedAt: day("2026-09-05") },
  { courseId: "course-concussion", name: "Dr Niko Vunibobo", unionId: "fij", enrolledAt: day("2026-07-11"), status: "passed", score: 90, completedAt: day("2026-09-08") },
  { courseId: "course-concussion", name: "Dr Ana Tui", unionId: "fij", enrolledAt: day("2026-08-20"), status: "failed", score: 72, completedAt: day("2026-09-10") },
  { courseId: "course-concussion", name: "Dr Sione Palu", unionId: "ton", enrolledAt: day("2026-08-04"), status: "in-progress" },
  { courseId: "course-concussion", name: "Dr Mateo Silva", unionId: "arg", enrolledAt: day("2026-09-01"), status: "enrolled" },
  { courseId: "course-concussion", name: "Dr Losa Tuala", unionId: "sam", enrolledAt: day("2026-08-28"), status: "in-progress" },
  { courseId: "course-concussion", name: "Dr Amina Otieno", unionId: "ken", enrolledAt: day("2026-09-03"), status: "requested" },
  { courseId: "course-concussion", name: "Dr Helen Park", unionId: "usa", enrolledAt: day("2026-08-15"), status: "failed", score: 81, completedAt: day("2026-09-06") },
  { courseId: "course-concussion", name: "Dr Marc Duval", unionId: "can", enrolledAt: day("2026-09-07"), status: "in-progress" },
  { courseId: "course-concussion", name: "Dr Olivia Chen", unionId: "hkr", enrolledAt: day("2026-09-10"), status: "requested" },
  { courseId: "course-concussion", name: "Dr James Whitaker", unionId: "rau", enrolledAt: day("2026-05-19"), status: "passed", score: 94, completedAt: day("2026-07-28"), certified: true },
  { courseId: "course-concussion", name: "Dr Alan Crowe", unionId: "eng", enrolledAt: day("2023-06-01"), status: "passed", score: 94, completedAt: day("2023-09-20"), certified: true },
  { courseId: "course-concussion", name: "Dr Keiko Mori", unionId: "jrp", enrolledAt: day("2026-09-08"), status: "requested" },
  { courseId: "course-concussion", name: "Dr Paul Mensah", unionId: "ken", enrolledAt: day("2026-08-11"), status: "in-progress" },
  { courseId: "course-concussion", name: "Dr Samir Haddad", unionId: "eng", enrolledAt: day("2026-09-16"), status: "requested" },
  { courseId: "course-concussion", name: "Dr Paula Mendes", unionId: "uru", enrolledAt: day("2026-09-17"), status: "requested" },
  { courseId: "course-concussion", name: "Dr Ivan Petrov", unionId: "usa", enrolledAt: day("2026-09-04"), status: "declined", decisionNote: "Not listed as a team doctor on a World Rugby competition." },

  // Rugby Ready
  { courseId: "course-ready", name: "Sophie Martin", unionId: "can", enrolledAt: day("2026-07-09"), status: "passed", score: 84, completedAt: day("2026-08-30"), certified: true },
  { courseId: "course-ready", name: "James Holloway", unionId: "eng", enrolledAt: day("2026-09-05"), status: "in-progress" },
  { courseId: "course-ready", name: "Mia Thompson", unionId: "rau", enrolledAt: day("2026-04-02"), status: "passed", score: 88, completedAt: day("2026-05-18"), certified: true },
  { courseId: "course-ready", name: "Tane Williams", unionId: "nzr", enrolledAt: day("2026-03-14"), status: "passed", score: 91, completedAt: day("2026-04-22"), certified: true },
  { courseId: "course-ready", name: "Aoife Byrne", unionId: "ire", enrolledAt: day("2026-05-11"), status: "passed", score: 86, completedAt: day("2026-06-29"), certified: true },
  { courseId: "course-ready", name: "Pieter Botha", unionId: "sar", enrolledAt: day("2026-06-03"), status: "passed", score: 83, completedAt: day("2026-07-20"), certified: true },
  { courseId: "course-ready", name: "Yuki Nakamura", unionId: "jrp", enrolledAt: day("2026-06-18"), status: "passed", score: 90, completedAt: day("2026-08-04"), certified: true },
  { courseId: "course-ready", name: "Luis Herrera", unionId: "uru", enrolledAt: day("2026-07-22"), status: "passed", score: 81, completedAt: day("2026-09-02") },
  { courseId: "course-ready", name: "Grace Okello", unionId: "ken", enrolledAt: day("2026-08-01"), status: "in-progress" },
  { courseId: "course-ready", name: "Ethan Brooks", unionId: "usa", enrolledAt: day("2026-08-12"), status: "requested" },
  { courseId: "course-ready", name: "Sera Naisoro", unionId: "fij", enrolledAt: day("2026-08-19"), status: "in-progress" },
  { courseId: "course-ready", name: "Camille Laurent", unionId: "fra", enrolledAt: day("2026-04-27"), status: "passed", score: 87, completedAt: day("2026-06-08"), certified: true },
  { courseId: "course-ready", name: "Noah Patel", unionId: "eng", enrolledAt: day("2026-09-11"), status: "requested" },
  { courseId: "course-ready", name: "Isabel Cruz", unionId: "arg", enrolledAt: day("2026-07-30"), status: "failed", score: 74, completedAt: day("2026-08-28") },

  // Coaching Level 1
  { courseId: "course-l1-coach", name: "Lauren Brooks", unionId: "can", enrolledAt: day("2026-06-15"), status: "passed", score: 82, completedAt: day("2026-09-08"), certified: true },
  { courseId: "course-l1-coach", name: "Diego Costa", unionId: "uru", enrolledAt: day("2026-09-02"), status: "requested" },
  { courseId: "course-l1-coach", name: "Marcus Hale", unionId: "eng", enrolledAt: day("2026-03-09"), status: "passed", score: 88, completedAt: day("2026-05-16"), certified: true },
  { courseId: "course-l1-coach", name: "Kiri Te Aho", unionId: "nzr", enrolledAt: day("2026-04-01"), status: "passed", score: 85, completedAt: day("2026-06-12"), certified: true },
  { courseId: "course-l1-coach", name: "Patrick O'Shea", unionId: "ire", enrolledAt: day("2026-04-20"), status: "passed", score: 79, completedAt: day("2026-07-03"), certified: true },
  { courseId: "course-l1-coach", name: "Amelie Roux", unionId: "fra", enrolledAt: day("2026-05-08"), status: "passed", score: 84, completedAt: day("2026-07-22"), certified: true },
  { courseId: "course-l1-coach", name: "Sipho Dlamini", unionId: "sar", enrolledAt: day("2026-05-27"), status: "passed", score: 80, completedAt: day("2026-08-09"), certified: true },
  { courseId: "course-l1-coach", name: "Mei Ling", unionId: "hkr", enrolledAt: day("2026-06-14"), status: "passed", score: 86, completedAt: day("2026-08-25"), certified: true },
  { courseId: "course-l1-coach", name: "Tevita Koro", unionId: "fij", enrolledAt: day("2026-07-06"), status: "in-progress" },
  { courseId: "course-l1-coach", name: "Rosa Alvarez", unionId: "arg", enrolledAt: day("2026-08-03"), status: "in-progress" },
  { courseId: "course-l1-coach", name: "Daniel Kim", unionId: "usa", enrolledAt: day("2026-08-21"), status: "requested" },
  { courseId: "course-l1-coach", name: "Hannah Reid", unionId: "rau", enrolledAt: day("2026-03-18"), status: "passed", score: 83, completedAt: day("2026-05-02"), certified: true },
  { courseId: "course-l1-coach", name: "Joseph Mallia", unionId: "ken", enrolledAt: day("2026-09-04"), status: "failed", score: 68, completedAt: day("2026-09-14") },

  // Match Officials Level 1
  { courseId: "course-mo", name: "Marie Dubois", unionId: "fra", enrolledAt: day("2026-07-01"), status: "passed", score: 88, completedAt: day("2026-09-01"), certified: true },
  { courseId: "course-mo", name: "Kenji Sato", unionId: "jrp", enrolledAt: day("2026-08-11"), status: "in-progress" },
  { courseId: "course-mo", name: "Andrew Cole", unionId: "eng", enrolledAt: day("2026-02-16"), status: "passed", score: 91, completedAt: day("2026-04-05"), certified: true },
  { courseId: "course-mo", name: "Niamh Kelly", unionId: "ire", enrolledAt: day("2026-03-03"), status: "passed", score: 87, completedAt: day("2026-04-28"), certified: true },
  { courseId: "course-mo", name: "Benji Cavanagh", unionId: "nzr", enrolledAt: day("2026-03-21"), status: "passed", score: 90, completedAt: day("2026-05-17"), certified: true },
  { courseId: "course-mo", name: "Lerato Mokoena", unionId: "sar", enrolledAt: day("2026-04-09"), status: "passed", score: 84, completedAt: day("2026-06-01"), certified: true },
  { courseId: "course-mo", name: "Paolo Ricci", unionId: "uru", enrolledAt: day("2026-05-13"), status: "passed", score: 82, completedAt: day("2026-07-07"), certified: true },
  { courseId: "course-mo", name: "Aisha Rahman", unionId: "usa", enrolledAt: day("2026-06-02"), status: "passed", score: 86, completedAt: day("2026-07-26"), certified: true },
  { courseId: "course-mo", name: "Sione Mafileo", unionId: "ton", enrolledAt: day("2026-07-15"), status: "in-progress" },
  { courseId: "course-mo", name: "Chloe Nguyen", unionId: "can", enrolledAt: day("2026-08-06"), status: "requested" },
  { courseId: "course-mo", name: "Ratu Nawalu", unionId: "fij", enrolledAt: day("2026-08-24"), status: "failed", score: 71, completedAt: day("2026-09-09") },
  { courseId: "course-mo", name: "Emma Fraser", unionId: "rau", enrolledAt: day("2026-05-29"), status: "passed", score: 89, completedAt: day("2026-08-11"), certified: true },

  // First Aid in Rugby
  { courseId: "course-firstaid", name: "Tevita Ratu", unionId: "fij", enrolledAt: day("2026-04-02"), status: "passed", score: 90, completedAt: day("2026-06-12"), certified: true },
  { courseId: "course-firstaid", name: "Amina Otieno", unionId: "ken", enrolledAt: day("2026-08-22"), status: "in-progress" },
  { courseId: "course-firstaid", name: "Sarah Jenkins", unionId: "eng", enrolledAt: day("2026-02-20"), status: "passed", score: 93, completedAt: day("2026-04-11"), certified: true },
  { courseId: "course-firstaid", name: "Wiremu Hohepa", unionId: "nzr", enrolledAt: day("2026-03-07"), status: "passed", score: 88, completedAt: day("2026-04-30"), certified: true },
  { courseId: "course-firstaid", name: "Cian Doyle", unionId: "ire", enrolledAt: day("2026-03-25"), status: "passed", score: 91, completedAt: day("2026-05-19"), certified: true },
  { courseId: "course-firstaid", name: "Fatima El Idrissi", unionId: "fra", enrolledAt: day("2026-04-14"), status: "passed", score: 87, completedAt: day("2026-06-06"), certified: true },
  { courseId: "course-firstaid", name: "Nomsa Khumalo", unionId: "sar", enrolledAt: day("2026-05-05"), status: "passed", score: 92, completedAt: day("2026-06-27"), certified: true },
  { courseId: "course-firstaid", name: "Liam Okafor", unionId: "usa", enrolledAt: day("2026-06-16"), status: "passed", score: 86, completedAt: day("2026-08-03"), certified: true },
  { courseId: "course-firstaid", name: "Peni Taufa", unionId: "ton", enrolledAt: day("2026-07-08"), status: "in-progress" },
  { courseId: "course-firstaid", name: "Malia Ioane", unionId: "sam", enrolledAt: day("2026-07-27"), status: "requested" },
  { courseId: "course-firstaid", name: "Hugo Perez", unionId: "uru", enrolledAt: day("2026-08-09"), status: "failed", score: 79, completedAt: day("2026-09-04") },
  { courseId: "course-firstaid", name: "Rachel Adams", unionId: "can", enrolledAt: day("2026-08-18"), status: "requested" },
  { courseId: "course-firstaid", name: "Koji Yamamoto", unionId: "jrp", enrolledAt: day("2026-05-22"), status: "passed", score: 89, completedAt: day("2026-07-15"), certified: true },
  { courseId: "course-firstaid", name: "Mark Ellis", unionId: "eng", enrolledAt: day("2022-08-01"), status: "passed", score: 88, completedAt: day("2022-09-10"), certified: true },

  // Laws of the Game 2026
  { courseId: "course-laws", name: "Kenji Sato", unionId: "jrp", enrolledAt: day("2026-03-01"), status: "passed", score: 86, completedAt: day("2026-04-22"), certified: true },
  { courseId: "course-laws", name: "Olivia Grant", unionId: "eng", enrolledAt: day("2026-01-20"), status: "passed", score: 92, completedAt: day("2026-02-14"), certified: true },
  { courseId: "course-laws", name: "Sean Fitzgerald", unionId: "ire", enrolledAt: day("2026-01-22"), status: "passed", score: 88, completedAt: day("2026-02-18"), certified: true },
  { courseId: "course-laws", name: "Luc Moreau", unionId: "fra", enrolledAt: day("2026-01-28"), status: "passed", score: 90, completedAt: day("2026-02-26"), certified: true },
  { courseId: "course-laws", name: "Anika van der Berg", unionId: "sar", enrolledAt: day("2026-02-03"), status: "passed", score: 85, completedAt: day("2026-03-04"), certified: true },
  { courseId: "course-laws", name: "Hana Kato", unionId: "jrp", enrolledAt: day("2026-02-11"), status: "passed", score: 91, completedAt: day("2026-03-12"), certified: true },
  { courseId: "course-laws", name: "Tyler Scott", unionId: "usa", enrolledAt: day("2026-02-19"), status: "passed", score: 83, completedAt: day("2026-03-21"), certified: true },
  { courseId: "course-laws", name: "Moana Palu", unionId: "ton", enrolledAt: day("2026-08-05"), status: "in-progress" },
  { courseId: "course-laws", name: "Elena Vargas", unionId: "arg", enrolledAt: day("2026-08-14"), status: "requested" },
  { courseId: "course-laws", name: "Jack Morrison", unionId: "rau", enrolledAt: day("2026-03-06"), status: "passed", score: 87, completedAt: day("2026-04-01"), certified: true },
  { courseId: "course-laws", name: "Priya Nair", unionId: "hkr", enrolledAt: day("2026-03-16"), status: "failed", score: 76, completedAt: day("2026-04-08") },
  { courseId: "course-laws", name: "Callum Reid", unionId: "can", enrolledAt: day("2026-09-01"), status: "in-progress" },
];

export function createLearners(): Learner[] {
  const byCourse: Record<string, number> = {};
  return PEOPLE.map((person, index) => {
    const n = String(index + 1).padStart(3, "0");
    const id = `lr-${n}`;
    const slot = byCourse[person.courseId] ?? 0;
    byCourse[person.courseId] = slot + 1;
    const roles = ROLE_BANK[person.courseId] ?? ["Staff"];
    return {
      id,
      courseId: person.courseId,
      name: person.name,
      unionId: person.unionId,
      unionName: UNIONS[person.unionId] ?? person.unionId,
      role: roles[slot % roles.length],
      email: slugEmail(person.name, person.unionId),
      enrolledAt: person.enrolledAt,
      status: person.status,
      score: person.score,
      completedAt: person.completedAt,
      certificateId: person.certified ? `c-${n}` : undefined,
      decidedAt: person.status === "declined" || person.status === "enrolled" ? person.enrolledAt : undefined,
      decisionNote: person.decisionNote,
      ...workFor(person, id),
    };
  });
}

export function createCertificates(learners: Learner[] = createLearners()): Certificate[] {
  const counts: Record<string, number> = {};
  return learners
    .filter((row) => row.certificateId && row.completedAt)
    .map((row) => {
      counts[row.courseId] = (counts[row.courseId] ?? 0) + 1;
      const prefix = CERT_PREFIX[row.courseId] ?? "EDU";
      const years = row.courseId === "course-concussion" || row.courseId === "course-firstaid" ? 3 : 0;
      const issued = new Date(row.completedAt as string);
      const expiresAt = years
        ? new Date(Date.UTC(issued.getUTCFullYear() + years, issued.getUTCMonth(), issued.getUTCDate())).toISOString()
        : undefined;
      return {
        id: row.certificateId as string,
        holder: row.name,
        unionName: row.unionName,
        unionId: row.unionId,
        courseId: row.courseId,
        learnerId: row.id,
        issuedAt: row.completedAt as string,
        expiresAt,
        credentialId: `WR-EDU-${prefix}-${String(counts[row.courseId]).padStart(4, "0")}`,
      };
    });
}

export function courseEnrolmentCount(learners: Learner[], courseId: string) {
  return learners.filter((row) => row.courseId === courseId && row.status !== "requested" && row.status !== "declined").length;
}

export function isOnCourse(status: LearnerStatus) {
  return status !== "requested" && status !== "declined";
}
