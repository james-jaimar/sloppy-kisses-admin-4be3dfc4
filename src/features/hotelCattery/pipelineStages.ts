export const HOTEL_PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "action", label: "Needs action" },
  { key: "draft", label: "Enquiries & drafts" },
  { key: "needs_info", label: "Needs info" },
  { key: "pending_payment", label: "Awaiting payment" },
  { key: "confirmed", label: "Confirmed" },
  { key: "all", label: "All" },
];

export function matchesPipelineStage(status: string, stage: string): boolean {
  if (stage === "all") return true;
  if (stage === "action") return status !== "confirmed";
  return status === stage;
}
