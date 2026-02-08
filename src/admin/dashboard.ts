import { Campaign } from "../crowdfunding/campaign.js";
import type { PublicKeyLike, Clock } from "../crowdfunding/types.js";
import type {
  AccountInfo,
  AccountType,
  ProposalReview,
  ProposalStatus,
  CampaignSummary,
  TransactionRecord,
  DashboardStats,
  UserProfile,
  UserAnalytics
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
      throw new Error(`Proposal already exists for campaign: ${campaignId}`);
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

  /**
   * Get detailed user profile with cross-linked data
   */
  getUserProfile(publicKey: PublicKeyLike): UserProfile | undefined {
    const account = this.accounts.get(publicKey);
    if (!account) {
      return undefined;
    }

    // Find campaigns this user is involved in
    const userCampaigns: string[] = [];
    const campaignContributions = new Map<string, number>();
    
    // Check transactions for contributions
    const userTransactions = this.getWalletTransactions(publicKey);
    for (const tx of userTransactions) {
      if (tx.type === "contribution" && tx.from === publicKey) {
        if (!userCampaigns.includes(tx.campaignId)) {
          userCampaigns.push(tx.campaignId);
        }
        campaignContributions.set(
          tx.campaignId,
          (campaignContributions.get(tx.campaignId) || 0) + tx.amount
        );
      }
    }

    // Find proposals where user is client or attorney
    const userProposals = Array.from(this.proposals.values())
      .filter(p => p.client === publicKey || p.attorney === publicKey)
      .map(p => p.campaignId);

    // For attorneys and clients, also include proposal campaigns in their campaigns list
    if (account.type === "attorney" || account.type === "client") {
      for (const proposalCampaignId of userProposals) {
        if (!userCampaigns.includes(proposalCampaignId)) {
          userCampaigns.push(proposalCampaignId);
        }
      }
    }

    // Extract invoice payments for attorneys
    const invoicePayments = userTransactions
      .filter(tx => tx.type === "invoice_payment" && tx.to === publicKey)
      .map(tx => ({
        invoiceId: tx.metadata?.invoiceId as string || tx.id,
        amount: tx.amount,
        campaignId: tx.campaignId,
        timestamp: tx.timestamp
      }));

    // Extract court fees for attorneys
    const courtFeesDeposited = userTransactions
      .filter(tx => (tx.type === "court_fee" || tx.type === "court_award") && tx.from === publicKey)
      .map(tx => ({
        campaignId: tx.campaignId,
        amount: tx.amount,
        timestamp: tx.timestamp
      }));

    // Calculate analytics
    const totalContributed = userTransactions
      .filter(tx => tx.type === "contribution" && tx.from === publicKey)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalReceived = userTransactions
      .filter(tx => tx.to === publicKey && (tx.type === "invoice_payment" || tx.type === "court_award"))
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Count active and completed campaigns
    let activeCampaigns = 0;
    let completedCampaigns = 0;
    let wonCampaigns = 0;

    for (const campaignId of userCampaigns) {
      const campaign = this.campaigns.get(campaignId);
      if (campaign) {
        const status = campaign.getStatus();
        if (status === "active" || status === "appeal_active" || status === "locked") {
          activeCampaigns++;
        } else {
          completedCampaigns++;
          if (status === "won" || status === "settled") {
            wonCampaigns++;
          }
        }
      }
    }

    // Calculate success rate for attorneys/clients
    let successRate: number | undefined;
    if (account.type === "attorney" || account.type === "client") {
      const totalCases = userProposals.length;
      if (totalCases > 0 && completedCampaigns > 0) {
        successRate = wonCampaigns / completedCampaigns;
      }
    }

    // Calculate average contribution (only for campaigns with actual contributions)
    let averageContribution: number | undefined;
    const campaignsWithContributions = campaignContributions.size;
    if (campaignsWithContributions > 0 && totalContributed > 0) {
      averageContribution = totalContributed / campaignsWithContributions;
    }

    return {
      account,
      campaigns: userCampaigns,
      proposals: userProposals,
      transactions: userTransactions,
      invoicePayments: invoicePayments.length > 0 ? invoicePayments : undefined,
      courtFeesDeposited: courtFeesDeposited.length > 0 ? courtFeesDeposited : undefined,
      analytics: {
        totalContributed,
        totalReceived,
        activeCampaigns,
        completedCampaigns,
        successRate,
        averageContribution
      }
    };
  }

  /**
   * Get user analytics across the platform
   */
  getUserAnalytics(): UserAnalytics {
    const allAccounts = Array.from(this.accounts.values());
    
    // User type distribution
    const userTypeDistribution = {
      users: allAccounts.filter(acc => acc.type === "user").length,
      clients: allAccounts.filter(acc => acc.type === "client").length,
      attorneys: allAccounts.filter(acc => acc.type === "attorney").length
    };

    // Top contributors
    const topContributors = allAccounts
      .filter(acc => acc.totalContributed > 0)
      .sort((a, b) => b.totalContributed - a.totalContributed)
      .slice(0, 10)
      .map(acc => ({
        publicKey: acc.publicKey,
        name: acc.name,
        totalContributed: acc.totalContributed
      }));

    // Top attorneys by cases
    const attorneys = allAccounts.filter(acc => acc.type === "attorney");
    const topAttorneys = attorneys
      .map(attorney => {
        const profile = this.getUserProfile(attorney.publicKey);
        const totalCases = profile?.proposals.length || 0;
        const successRate = profile?.analytics.successRate || 0;
        return {
          publicKey: attorney.publicKey,
          name: attorney.name,
          totalCases,
          successRate
        };
      })
      .filter(a => a.totalCases > 0)
      .sort((a, b) => b.totalCases - a.totalCases)
      .slice(0, 10);

    // Active users statistics
    const now = this.clock.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60;
    const oneMonthAgo = now - 30 * 24 * 60 * 60;

    const recentTransactions = this.transactions.filter(tx => tx.timestamp >= oneMonthAgo);
    const activeUsersLastWeek = new Set(
      this.transactions
        .filter(tx => tx.timestamp >= oneWeekAgo)
        .map(tx => tx.from)
    ).size;
    const activeUsersLastMonth = new Set(
      recentTransactions.map(tx => tx.from)
    ).size;

    return {
      userTypeDistribution,
      topContributors,
      topAttorneys,
      activeUsers: {
        total: allAccounts.filter(acc => acc.isActive).length,
        lastWeek: activeUsersLastWeek,
        lastMonth: activeUsersLastMonth
      }
    };
  }

  /**
   * Search users by name, email, or wallet with optional type filter
   */
  searchUsers(query: string, type?: AccountType): AccountInfo[] {
    const lowerQuery = query.toLowerCase();
    const allAccounts = type ? this.listAccounts(type) : this.listAccounts();
    
    return allAccounts.filter(acc => 
      acc.name.toLowerCase().includes(lowerQuery) ||
      acc.email.toLowerCase().includes(lowerQuery) ||
      acc.publicKey.toLowerCase().includes(lowerQuery)
    );
  }
}
