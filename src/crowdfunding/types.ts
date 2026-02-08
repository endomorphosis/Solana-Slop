export type PublicKeyLike = string;

export interface Clock {
  now(): number;
}

export interface CampaignConfig {
  id: string;
  minRaiseLamports: number;
  deadlineUnix: number;
  refundWindowStartUnix: number;
  signers: PublicKeyLike[];
}

export type CampaignStatus = "active" | "locked" | "failed_refunding" | "refunding";

export type RefundReason = "auto_failed" | "multisig";
