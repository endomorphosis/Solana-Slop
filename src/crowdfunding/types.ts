export type PublicKeyLike = string;

/** Special recipient identifier for system payments (e.g., court judgments) */
export const SYSTEM_RECIPIENT_COURT = "court" as const;

export interface Clock {
  now(): number;
}

export interface CampaignConfig {
  id: string;
  minRaiseLamports: number;
  deadlineUnix: number;
  refundWindowStartUnix: number;
  signers: PublicKeyLike[];
  /** Wallet address where the 10% platform fee is allocated on successful campaigns */
  daoTreasury: PublicKeyLike;
}

export type CampaignStatus = "active" | "locked" | "failed_refunding" | "refunding" | "settled" | "won" | "lost" | "appeal_active";

export type RefundReason = "auto_failed" | "multisig";

/** Campaign outcome after trial/litigation */
export type CampaignOutcome = "settlement" | "win" | "loss";

/** Court level for appeals */
export type CourtLevel = "district" | "appellate" | "state_supreme" | "us_supreme";

/** Litigation path after an outcome */
export type LitigationPath = "appeal" | "remand" | "retrial" | "final";

/** Appeal round information */
export interface AppealRound {
  /** Round number (1 for initial, 2+ for appeals) */
  roundNumber: number;
  /** Court level for this round */
  courtLevel: CourtLevel;
  /** Litigation path taken */
  path: LitigationPath;
  /** Minimum raise target for this appeal round */
  minRaiseLamports: number;
  /** Deadline for this appeal round */
  deadlineUnix: number;
  /** Total raised in this round */
  totalRaised: number;
  /** Outcome of the previous round (if applicable) */
  previousOutcome?: CampaignOutcome;
  /** Whether fundraising was needed (false if sufficient funds already available) */
  fundraisingNeeded: boolean;
}

/**
 * Represents a payment made from campaign funds to a service provider (e.g., attorney).
 * Requires 2-of-3 multisig approval to execute.
 */
export interface InvoicePayment {
  /** Unique identifier for the invoice */
  invoiceId: string;
  /** Payment amount in lamports */
  amount: number;
  /** Wallet address receiving the payment */
  recipient: PublicKeyLike;
  /** Array of multisig signers who approved this payment */
  approvers: PublicKeyLike[];
}
