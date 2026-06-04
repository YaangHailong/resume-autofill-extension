import { ExecuteFillOptions, FillPlan } from "./types";

export type RuntimeMessage =
  | { type: "OPEN_OPTIONS" }
  | { type: "RESUME_AUTOFILL_SCAN" }
  | { type: "RESUME_AUTOFILL_EXECUTE"; options: ExecuteFillOptions }
  | { type: "RESUME_AUTOFILL_PLAN_READY"; plan: FillPlan }
  | { type: "RESUME_AUTOFILL_ERROR"; message: string };

export interface ScanResponse {
  ok: boolean;
  message?: string;
}

