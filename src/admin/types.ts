import type { PublicKeyLike, CampaignStatus, CampaignOutcome, CourtLevel, LitigationPath, AppealRound } from "../crowdfunding/types.js";

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

/**
 * Detailed user profile with cross-linked data
 */
export interface UserProfile {
  /** Account information */
  account: AccountInfo;
  /** Campaigns this user has contributed to */
  campaigns: string[];
  /** Proposals where this user is client or attorney */
  proposals: string[];
  /** Transaction history for this user */
  transactions: TransactionRecord[];
  /** Invoice payments (for attorneys) */
  invoicePayments?: {
    invoiceId: string;
    amount: number;
    campaignId: string;
    timestamp: number;
  }[];
  /** Court fees deposited (for attorneys) */
  courtFeesDeposited?: {
    campaignId: string;
    amount: number;
    timestamp: number;
  }[];
  /** Analytics data */
  analytics: {
    /** Total contributed amount */
    totalContributed: number;
    /** Total received amount (invoices, court awards) */
    totalReceived: number;
    /** Number of active campaigns */
    activeCampaigns: number;
    /** Number of completed campaigns */
    completedCampaigns: number;
    /** Success rate (for attorneys/clients) */
    successRate?: number;
    /** Average contribution amount */
    averageContribution?: number;
  };
}

/**
 * User analytics aggregation
 */
export interface UserAnalytics {
  /** User type distribution */
  userTypeDistribution: {
    users: number;
    clients: number;
    attorneys: number;
  };
  /** Top contributors */
  topContributors: {
    publicKey: PublicKeyLike;
    name: string;
    totalContributed: number;
  }[];
  /** Top attorneys by cases */
  topAttorneys: {
    publicKey: PublicKeyLike;
    name: string;
    totalCases: number;
    successRate: number;
  }[];
  /** Active users statistics */
  activeUsers: {
    total: number;
    lastWeek: number;
    lastMonth: number;
  };
}

/**
 * Litigation case status
 */
export type LitigationStatus = "in_trial" | "in_appeal" | "awaiting_decision" | "awaiting_funding" | "completed";

/**
 * Detailed litigation case information for case management
 */
export interface LitigationCase {
  /** Campaign ID */
  campaignId: string;
  /** Client public key (optional if proposal data is missing) */
  client?: PublicKeyLike;
  /** Attorney public key (optional if proposal data is missing) */
  attorney?: PublicKeyLike;
  /** Current campaign status */
  status: CampaignStatus;
  /** Current litigation status */
  litigationStatus: LitigationStatus;
  /** Current case outcome (if recorded) */
  currentOutcome: CampaignOutcome | null;
  /** Current court level */
  currentCourtLevel: CourtLevel;
  /** Current litigation path */
  currentPath: LitigationPath;
  /** Current round number */
  currentRound: number;
  /** All appeal rounds */
  appealRounds: AppealRound[];
  /** Total amount raised */
  totalRaised: number;
  /** Available funds */
  availableFunds: number;
  /** Judgment amount (if any) */
  judgmentAmount: number;
  /** Case description */
  description?: string;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Case management statistics
 */
export interface CaseManagementStats {
  /** Total cases in litigation */
  totalCases: number;
  /** Cases in trial */
  casesInTrial: number;
  /** Cases in appeal */
  casesInAppeal: number;
  /** Cases awaiting decision */
  casesAwaitingDecision: number;
  /** Cases by court level */
  casesByCourtLevel: {
    district: number;
    appellate: number;
    state_supreme: number;
    us_supreme: number;
  };
  /** Average case duration (in days) */
  averageCaseDuration?: number;
}
