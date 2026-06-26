import { ExecuteFillOptions, FillPlan } from "./types";

// 所有跨 popup/background/content 的消息类型集中在这里，避免字符串散落各处。
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
