import type { CameraStatus, CameraType, ProjectStatus } from './enums.js';

/** Days in DashboardSummary.surveyedByDay (today included). */
export const DASHBOARD_DAYS = 30;

/** Calendar days are counted in this time zone (the survey teams' local time). */
export const DASHBOARD_TIME_ZONE = 'Asia/Bangkok';

/** GET /api/dashboard: exact counts over all projects, made by the database. */
export interface DashboardSummary {
  projects: {
    total: number;
    /** Statuses without projects are absent. */
    byStatus: Partial<Record<ProjectStatus, number>>;
  };
  cameras: {
    /** Camera points. */
    points: number;
    /** Cameras: the sum of cameraCount over all points. */
    units: number;
    byStatus: Partial<Record<CameraStatus, number>>;
    byType: Partial<Record<CameraType, number>>;
    photos: number;
  };
  /**
   * Points by survey date (surveyedAt, local calendar day), oldest first,
   * DASHBOARD_DAYS entries ending today; days without points have 0.
   */
  surveyedByDay: { date: string; points: number }[];
  /** Points surveyed in the same period, per surveyor, most first. */
  surveyors: { userId: string; name: string; points: number }[];
  generatedAt: string;
}
