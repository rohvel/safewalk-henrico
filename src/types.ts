/**
 * Shared types for SafeWalk Henrico.
 *
 * The most important one is Project — the shape of every entry in
 * src/data/projects.json. If you add a field there, add it here too,
 * and TypeScript will point out every place that needs updating.
 */

/** Henrico's five magisterial districts. */
export type District = 'Brookland' | 'Fairfield' | 'Three Chopt' | 'Tuckahoe' | 'Varina';

export const DISTRICTS: District[] = ['Brookland', 'Fairfield', 'Three Chopt', 'Tuckahoe', 'Varina'];

/** The four stages of the crosswalk stepper, in order. */
export type ProjectStatus = 'announced' | 'design' | 'construction' | 'complete';

export const STATUSES: ProjectStatus[] = ['announced', 'design', 'construction', 'complete'];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  announced: 'Announced',
  design: 'Design',
  construction: 'Construction',
  complete: 'Complete',
};

export type ProjectType = 'sidewalk' | 'crosswalk' | 'shared-use-path' | 'signal' | 'other';

export const TYPE_LABEL: Record<ProjectType, string> = {
  sidewalk: 'Sidewalk',
  crosswalk: 'Crosswalk',
  'shared-use-path': 'Shared-use path',
  signal: 'Signal',
  other: 'Other',
};

/** Every claim needs a citation: a document name and a link to it. */
export interface ProjectSource {
  label: string;
  url: string;
}

export interface Project {
  /** URL slug, e.g. "example-sidewalk-varina". Lowercase, hyphens only. */
  id: string;
  name: string;
  description: string;
  district: District;
  status: ProjectStatus;
  /** Optional plain-language note, e.g. "Design funded in FY26 budget". */
  statusNote?: string;
  /** ISO date (YYYY-MM-DD) the county first announced/committed the project. */
  dateAnnounced: string;
  /** ISO date the status last changed (or was last confirmed). */
  dateStatusUpdated: string;
  /** Optional ISO date or year the county estimates completion. */
  estimatedCompletion?: string;
  type: ProjectType;
  sources: ProjectSource[];
  /**
   * A [lng, lat] point, or an array of [lng, lat] points drawn as a line
   * (for sidewalk segments and paths).
   */
  geometry: [number, number] | [number, number][];
  /**
   * true = seed/example entry. Placeholder projects are labeled
   * "EXAMPLE" everywhere they render. Set to false only when the entry
   * is verified against a county document listed in `sources`.
   */
  placeholder: boolean;
}

/** One dated entry in the changelog. */
export interface ChangelogEntry {
  date: string; // ISO date
  entries: string[];
}

/** Properties of a crash point in public/data/crashes.geojson. */
export type TimeBand = 'overnight' | 'morning' | 'afternoon' | 'evening';

export interface CrashProperties {
  year: number;
  /** ISO date (YYYY-MM-DD), Eastern-timezone-correct — see toEasternISODate() in fetch-crashes.mjs. */
  date: string;
  /** "HH:MM", 24-hour. Empty string if the source recorded no time. */
  time: string;
  /** Coarse 6-hour bucket of `time`, for filtering. Empty string alongside an empty `time`. */
  timeBand: TimeBand | '';
  mode: 'ped' | 'bike' | 'both';
  sev: 'fatal' | 'injury' | 'other';
  /**
   * Road name derived from VDOT's own RTE_NM field by
   * scripts/fetch-crashes.mjs. Empty string when the source records no road
   * (VDOT's "99999UK" unknown placeholder) — never geocoded or guessed.
   */
  loc: string;
  /** Plain-language light condition (VDOT's numeric prefix stripped), e.g. "Daylight". */
  light: string;
  /** Plain-language traffic control at the crash location, e.g. "Traffic Signal". */
  trafficControl: string;
  hitRun: boolean;
  /**
   * True for VDOT's "Yes" and "Yes - With School Activity" school-zone
   * codes. Small subset (38 of 976 records, 2017-2026) — filter and count
   * only; not broken down further. See CrashesPage.tsx.
   */
  schoolZone: boolean;
}
