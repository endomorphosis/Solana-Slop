import type { PublicKeyLike, CampaignStatus, CampaignOutcome } from "../crowdfunding/types.js";

/**
 * Account types in the system
 */
export type AccountType = "user" | "client" | "attorney";

/**
 * Proposal submission status
 */
export type ProposalStatus = "pending" | "approved" | "rejected";

/**
 * Information about an account in the system
 */
export interface AccountInfo {
  /** Wallet public key */
  publicKey: PublicKeyLike;
  /** Account type */
  type: AccountType;
  /** Account display name */
  name: string;
  /** Email address */
  email: string;
  /** Account creation timestamp */
  createdAt: number;
  /** Whether the account is active */
  isActive: boolean;
  /** Total amount contributed across all campaigns */
  totalContributed: number;
  /** Number of campaigns participated in */
  campaignsParticipated: number;
}

/**
 * Transaction record for wallet activity
 */
export interface TransactionRecord {
  /** Transaction ID */
  id: string;
  /** Transaction timestamp */
  timestamp: number;
  /** Transaction type */
  type: "contribution" | "refund" | "invoice_payment" | "court_fee" | "court_award" | "judgment_payment" | "dao_fee";
  /** Amount in lamports */
  amount: number;
  /** From wallet */
  from: PublicKeyLike;
  /** To wallet or recipient */
  to: PublicKeyLike;
  /** Associated campaign ID */
  campaignId: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Crowdfunding proposal for review
 */
export interface ProposalReview {
  /** Campaign ID */
  campaignId: string;
  /** Proposal submission timestamp */
  submittedAt: number;
  /** Current proposal status */
  status: ProposalStatus;
  /** Client who submitted the proposal */
  client: PublicKeyLike;
  /** Attorney assigned to the case */
  attorney: PublicKeyLike;
  /** Funding goal in lamports */
  minRaiseLamports: number;
  /** Campaign deadline */
  deadlineUnix: number;
  /** Brief description of the case */
  description: string;
  /** Reviewed by (admin wallet) */
  reviewedBy?: PublicKeyLike;
  /** Review timestamp */
  reviewedAt?: number;
  /** Review notes */
  reviewNotes?: string;
}

/**
 * Campaign summary for admin dashboard
 */
export interface CampaignSummary {
  /** Campaign ID */
  id: string;
  /** Current status */
  status: CampaignStatus;
  /** Case outcome (if recorded) */
  outcome?: CampaignOutcome | null;
  /** Total amount raised */
  totalRaised: number;
  /** Minimum raise target */
  minRaiseLamports: number;
  /** Campaign deadline */
  deadlineUnix: number;
  /** Number of contributors */
  contributorCount: number;
  /** Available funds */
  availableFunds: number;
  /** DAO fee collected */
  daoFeeAmount: number;
  /** Current round number */
  currentRound: number;
  /** Multisig signers */
  signers: PublicKeyLike[];
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  /** Total number of campaigns */
  totalCampaigns: number;
  /** Active campaigns */
  activeCampaigns: number;
  /** Successful campaigns */
  successfulCampaigns: number;
  /** Failed campaigns */
  failedCampaigns: number;
  /** Total amount raised across all campaigns */
  totalRaised: number;
  /** Total DAO fees collected */
  totalDaoFees: number;
  /** Number of registered accounts */
  totalAccounts: number;
  /** Pending proposals */
  pendingProposals: number;
}
