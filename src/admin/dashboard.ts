import { Campaign } from "../crowdfunding/campaign.js";
import type { PublicKeyLike, Clock } from "../crowdfunding/types.js";
import type {
  AccountInfo,
  AccountType,
  ProposalReview,
  ProposalStatus,
  CampaignSummary,
  TransactionRecord,
  DashboardStats
} from "./types.js";

/**
 * AdminDashboard manages campaigns, accounts, and provides oversight capabilities
 * for reviewing proposals, tracking transactions, and managing the crowdfunding platform.
 */
export class AdminDashboard {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly accounts = new Map<PublicKeyLike, AccountInfo>();
  private readonly proposals = new Map<string, ProposalReview>();
  private readonly transactions: TransactionRecord[] = [];
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Register a new account in the system
   */
  registerAccount(
    publicKey: PublicKeyLike,
    type: AccountType,
    name: string,
    email: string
  ): AccountInfo {
    if (this.accounts.has(publicKey)) {
      throw new Error("Account already exists");
    }

    const account: AccountInfo = {
      publicKey,
      type,
      name,
      email,
      createdAt: this.clock.now(),
      isActive: true,
      totalContributed: 0,
      campaignsParticipated: 0
    };

    this.accounts.set(publicKey, account);
    return account;
  }

  /**
   * Get account information
   */
  getAccount(publicKey: PublicKeyLike): AccountInfo | undefined {
    return this.accounts.get(publicKey);
  }

  /**
   * List all accounts, optionally filtered by type
   */
  listAccounts(type?: AccountType): AccountInfo[] {
    const allAccounts = Array.from(this.accounts.values());
    if (type) {
      return allAccounts.filter(acc => acc.type === type);
    }
    return allAccounts;
  }

  /**
   * Update account active status
   */
  setAccountActive(publicKey: PublicKeyLike, isActive: boolean): void {
    const account = this.accounts.get(publicKey);
    if (!account) {
      throw new Error("Account not found");
    }
    account.isActive = isActive;
  }

  /**
   * Submit a new proposal for review
   */
  submitProposal(
    campaignId: string,
    client: PublicKeyLike,
    attorney: PublicKeyLike,
    minRaiseLamports: number,
    deadlineUnix: number,
    description: string
  ): ProposalReview {
    if (this.proposals.has(campaignId)) {
      throw new Error("Proposal already exists for this campaign");
    }

    const proposal: ProposalReview = {
      campaignId,
      submittedAt: this.clock.now(),
      status: "pending",
      client,
      attorney,
      minRaiseLamports,
      deadlineUnix,
      description
    };

    this.proposals.set(campaignId, proposal);
    return proposal;
  }

  /**
   * Review and approve a proposal
   */
  approveProposal(
    campaignId: string,
    reviewedBy: PublicKeyLike,
    notes?: string
  ): void {
    const proposal = this.proposals.get(campaignId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    if (proposal.status !== "pending") {
      throw new Error("Proposal has already been reviewed");
    }

    proposal.status = "approved";
    proposal.reviewedBy = reviewedBy;
    proposal.reviewedAt = this.clock.now();
    proposal.reviewNotes = notes;
  }

  /**
   * Review and reject a proposal
   */
  rejectProposal(
    campaignId: string,
    reviewedBy: PublicKeyLike,
    notes: string
  ): void {
    const proposal = this.proposals.get(campaignId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    if (proposal.status !== "pending") {
      throw new Error("Proposal has already been reviewed");
    }

    proposal.status = "rejected";
    proposal.reviewedBy = reviewedBy;
    proposal.reviewedAt = this.clock.now();
    proposal.reviewNotes = notes;
  }

  /**
   * Get a specific proposal
   */
  getProposal(campaignId: string): ProposalReview | undefined {
    return this.proposals.get(campaignId);
  }

  /**
   * List all proposals, optionally filtered by status
   */
  listProposals(status?: ProposalStatus): ProposalReview[] {
    const allProposals = Array.from(this.proposals.values());
    if (status) {
      return allProposals.filter(p => p.status === status);
    }
    return allProposals;
  }

  /**
   * Register a campaign in the dashboard
   */
  registerCampaign(campaign: Campaign, campaignId: string): void {
    if (this.campaigns.has(campaignId)) {
      throw new Error("Campaign already registered");
    }
    this.campaigns.set(campaignId, campaign);
  }

  /**
   * Get a specific campaign
   */
  getCampaign(campaignId: string): Campaign | undefined {
    return this.campaigns.get(campaignId);
  }

  /**
   * List all campaigns
   */
  listCampaigns(): string[] {
    return Array.from(this.campaigns.keys());
  }

  /**
   * Get campaign summary information
   */
  getCampaignSummary(campaignId: string): CampaignSummary | undefined {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      return undefined;
    }

    // Access campaign data through public methods
    return {
      id: campaignId,
      status: campaign.getStatus(),
      outcome: campaign.getOutcome(),
      totalRaised: campaign.getTotalRaised(),
      minRaiseLamports: 0, // Would need to expose config
      deadlineUnix: 0, // Would need to expose config
      contributorCount: 0, // Would need to track this
      availableFunds: campaign.getAvailableFunds(),
      daoFeeAmount: campaign.getDaoFeeAmount(),
      currentRound: campaign.getCurrentRound(),
      signers: [] // Would need to expose config
    };
  }

  /**
   * List campaigns by status
   */
  listCampaignsByStatus(status: string): string[] {
    const result: string[] = [];
    for (const [id, campaign] of this.campaigns.entries()) {
      if (campaign.getStatus() === status) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Record a transaction
   */
  recordTransaction(transaction: TransactionRecord): void {
    this.transactions.push(transaction);
    
    // Update account statistics
    const fromAccount = this.accounts.get(transaction.from);
    if (fromAccount && transaction.type === "contribution") {
      fromAccount.totalContributed += transaction.amount;
    }
  }

  /**
   * Get all transactions for a specific wallet
   */
  getWalletTransactions(publicKey: PublicKeyLike): TransactionRecord[] {
    return this.transactions.filter(
      tx => tx.from === publicKey || tx.to === publicKey
    );
  }

  /**
   * Get all transactions for a specific campaign
   */
  getCampaignTransactions(campaignId: string): TransactionRecord[] {
    return this.transactions.filter(tx => tx.campaignId === campaignId);
  }

  /**
   * Get all transactions
   */
  getAllTransactions(): TransactionRecord[] {
    return [...this.transactions];
  }

  /**
   * Get dashboard statistics
   */
  getDashboardStats(): DashboardStats {
    const campaigns = Array.from(this.campaigns.values());
    
    let activeCampaigns = 0;
    let successfulCampaigns = 0;
    let failedCampaigns = 0;
    let totalRaised = 0;
    let totalDaoFees = 0;

    for (const campaign of campaigns) {
      const status = campaign.getStatus();
      
      if (status === "active" || status === "appeal_active") {
        activeCampaigns++;
      } else if (status === "locked" || status === "won" || status === "settled") {
        successfulCampaigns++;
      } else if (status === "failed_refunding") {
        failedCampaigns++;
      }

      totalRaised += campaign.getTotalRaised();
      totalDaoFees += campaign.getDaoFeeAmount();
    }

    return {
      totalCampaigns: this.campaigns.size,
      activeCampaigns,
      successfulCampaigns,
      failedCampaigns,
      totalRaised,
      totalDaoFees,
      totalAccounts: this.accounts.size,
      pendingProposals: this.listProposals("pending").length
    };
  }

  /**
   * Get accounts by wallet addresses
   */
  getAccountsByWallets(wallets: PublicKeyLike[]): AccountInfo[] {
    return wallets
      .map(wallet => this.accounts.get(wallet))
      .filter((acc): acc is AccountInfo => acc !== undefined);
  }
}
