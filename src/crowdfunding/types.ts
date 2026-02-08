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
  /** Wallet address where the 10% platform fee is allocated on successful campaigns */
  daoTreasury: PublicKeyLike;
}

export type CampaignStatus = "active" | "locked" | "failed_refunding" | "refunding";

export type RefundReason = "auto_failed" | "multisig";

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
