import { Campaign } from "../crowdfunding/campaign.js";
import type { PublicKeyLike, Clock, CampaignConfig, CampaignStatus } from "../crowdfunding/types.js";
import type {
  AccountInfo,
  AccountType,
  ProposalReview,
  ProposalStatus,
  CampaignSummary,
  TransactionRecord,
  DashboardStats,
  UserProfile,
  UserAnalytics,
  LitigationCase,
  LitigationStatus,
  CaseManagementStats,
  AttorneyProfile,
  AttorneyRegistration,
  BarLicenseInfo,
  PracticeArea,
  AttorneyVerificationStatus
} from "./types.js";

/**
 * Campaign metadata stored alongside campaign instances
 */
interface CampaignMetadata {
  campaign: Campaign;
  config: CampaignConfig;
  contributorCount: number;
  contributors: Set<PublicKeyLike>;
}

/**
 * AdminDashboard manages campaigns, accounts, and provides oversight capabilities
 * for reviewing proposals, tracking transactions, and managing the crowdfunding platform.
 */
export class AdminDashboard {
  private readonly campaigns = new Map<string, CampaignMetadata>();
  private readonly accounts = new Map<PublicKeyLike, AccountInfo>();
  private readonly proposals = new Map<string, ProposalReview>();
  private readonly transactions: TransactionRecord[] = [];
  private readonly attorneyRegistrations = new Map<string, AttorneyRegistration>();
  private readonly attorneyProfiles = new Map<PublicKeyLike, AttorneyProfile>();
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
  registerCampaign(campaign: Campaign, campaignId: string, config: CampaignConfig): void {
    if (this.campaigns.has(campaignId)) {
      throw new Error("Campaign already registered");
    }
    this.campaigns.set(campaignId, {
      campaign,
      config,
      contributorCount: 0,
      contributors: new Set()
    });
  }

  /**
   * Get a specific campaign
   */
  getCampaign(campaignId: string): Campaign | undefined {
    return this.campaigns.get(campaignId)?.campaign;
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
    const metadata = this.campaigns.get(campaignId);
    if (!metadata) {
      return undefined;
    }

    const { campaign, config, contributorCount } = metadata;

    // Access campaign data through public methods and stored config
    return {
      id: campaignId,
      status: campaign.getStatus(),
      outcome: campaign.getOutcome(),
      totalRaised: campaign.getTotalRaised(),
      minRaiseLamports: config.minRaiseLamports,
      deadlineUnix: config.deadlineUnix,
      contributorCount,
      availableFunds: campaign.getAvailableFunds(),
      daoFeeAmount: campaign.getDaoFeeAmount(),
      currentRound: campaign.getCurrentRound(),
      signers: config.signers
    };
  }

  /**
   * List campaigns by status
   */
  listCampaignsByStatus(status: CampaignStatus): string[] {
    const result: string[] = [];
    for (const [id, metadata] of this.campaigns.entries()) {
      if (metadata.campaign.getStatus() === status) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Record a transaction
   */
  recordTransaction(transaction: TransactionRecord): void {
    // Persist transaction
    this.transactions.push(transaction);
    
    // Update account statistics for contribution transactions
    if (transaction.type === "contribution") {
      const fromAccount = this.accounts.get(transaction.from);
      if (fromAccount) {
        fromAccount.totalContributed += transaction.amount;

        // Increment campaignsParticipated only on the first contribution
        // from this account to this specific campaign
        if (transaction.campaignId) {
          const hasContributedBefore = this.transactions.some(
            (tx) =>
              tx !== transaction &&
              tx.type === "contribution" &&
              tx.from === transaction.from &&
              tx.campaignId === transaction.campaignId
          );

          if (!hasContributedBefore) {
            fromAccount.campaignsParticipated += 1;
          }
        }
      }

      // Update campaign contributor tracking
      const metadata = this.campaigns.get(transaction.campaignId);
      if (metadata && !metadata.contributors.has(transaction.from)) {
        metadata.contributors.add(transaction.from);
        metadata.contributorCount++;
      }
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
    const campaignMetadatas = Array.from(this.campaigns.values());
    
    let activeCampaigns = 0;
    let successfulCampaigns = 0;
    let failedCampaigns = 0;
    let totalRaised = 0;
    let totalDaoFees = 0;

    for (const metadata of campaignMetadatas) {
      const campaign = metadata.campaign;
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
      const metadata = this.campaigns.get(campaignId);
      if (metadata) {
        const campaign = metadata.campaign;
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
    
    return allAccounts.filter(acc => {
      const nameMatches = acc.name.toLowerCase().includes(lowerQuery);
      const emailMatches = acc.email.toLowerCase().includes(lowerQuery);
      const publicKeyStr = acc.publicKey != null ? String(acc.publicKey).toLowerCase() : "";
      const publicKeyMatches = publicKeyStr.includes(lowerQuery);
      return nameMatches || emailMatches || publicKeyMatches;
    });
  }

  /**
   * Get all cases in active litigation (campaigns completed but still in legal proceedings)
   */
  getActiveLitigationCases(): LitigationCase[] {
    const cases: LitigationCase[] = [];

    for (const [campaignId, metadata] of this.campaigns.entries()) {
      const campaign = metadata.campaign;
      const status = campaign.getStatus();
      const outcome = campaign.getOutcome();
      const appealRounds = campaign.getAppealRounds();
      
      // Check if campaign has completed fundraising and is in litigation
      // Include locked campaigns even without outcome/appeals (in_trial state)
      const hasCompletedFundraising = status === "locked" || status === "won" || 
                                       status === "lost" || status === "settled" || 
                                       status === "appeal_active";
      const isInLitigation = hasCompletedFundraising; // All completed campaigns are potentially in litigation

      if (isInLitigation) {
        const litigationCase = this.buildLitigationCase(campaignId, campaign);
        cases.push(litigationCase);
      }
    }

    return cases;
  }

  /**
   * Get detailed case information for a specific campaign
   */
  getCaseDetails(campaignId: string): LitigationCase | undefined {
    const metadata = this.campaigns.get(campaignId);
    if (!metadata) {
      return undefined;
    }

    const campaign = metadata.campaign;
    const status = campaign.getStatus();
    
    // Return case details for any completed campaign (including in_trial)
    const hasCompletedFundraising = status === "locked" || status === "won" || 
                                     status === "lost" || status === "settled" || 
                                     status === "appeal_active";
    
    if (!hasCompletedFundraising) {
      return undefined;
    }

    return this.buildLitigationCase(campaignId, campaign);
  }

  /**
   * List cases by court level
   */
  listCasesByCourtLevel(courtLevel: string): LitigationCase[] {
    const allCases = this.getActiveLitigationCases();
    return allCases.filter(c => c.currentCourtLevel === courtLevel);
  }

  /**
   * Get case management statistics
   */
  getCaseManagementStats(): CaseManagementStats {
    const allCases = this.getActiveLitigationCases();
    
    const stats: CaseManagementStats = {
      totalCases: allCases.length,
      casesInTrial: allCases.filter(c => c.litigationStatus === "in_trial").length,
      casesInAppeal: allCases.filter(c => c.litigationStatus === "in_appeal").length,
      casesAwaitingDecision: allCases.filter(c => c.litigationStatus === "awaiting_decision").length,
      casesByCourtLevel: {
        district: allCases.filter(c => c.currentCourtLevel === "district").length,
        appellate: allCases.filter(c => c.currentCourtLevel === "appellate").length,
        state_supreme: allCases.filter(c => c.currentCourtLevel === "state_supreme").length,
        us_supreme: allCases.filter(c => c.currentCourtLevel === "us_supreme").length
      }
    };

    return stats;
  }

  /**
   * Build a LitigationCase object from a campaign
   */
  private buildLitigationCase(campaignId: string, campaign: Campaign): LitigationCase {
    const status = campaign.getStatus();
    const outcome = campaign.getOutcome();
    const appealRounds = campaign.getAppealRounds();
    const currentRound = campaign.getCurrentRound();
    
    // Determine litigation status
    let litigationStatus: LitigationStatus;
    if (status === "appeal_active") {
      litigationStatus = "awaiting_funding";
    } else if (appealRounds.length > 0) {
      const lastRound = appealRounds[appealRounds.length - 1];
      if (lastRound.path === "final") {
        litigationStatus = "completed";
      } else if (lastRound.path === "appeal") {
        litigationStatus = "in_appeal";
      } else {
        litigationStatus = "awaiting_decision";
      }
    } else if (outcome !== null) {
      litigationStatus = "awaiting_decision";
    } else {
      litigationStatus = "in_trial";
    }

    // Determine current court level and path
    let currentCourtLevel: import("../crowdfunding/types.js").CourtLevel = "district";
    let currentPath: import("../crowdfunding/types.js").LitigationPath = "appeal";
    
    if (appealRounds.length > 0) {
      const lastRound = appealRounds[appealRounds.length - 1];
      currentCourtLevel = lastRound.courtLevel;
      currentPath = lastRound.path;
    }

    // Get proposal for client/attorney info
    const proposal = Array.from(this.proposals.values()).find(p => p.campaignId === campaignId);
    
    return {
      campaignId,
      client: proposal?.client,
      attorney: proposal?.attorney,
      status,
      litigationStatus,
      currentOutcome: outcome,
      currentCourtLevel,
      currentPath,
      currentRound,
      appealRounds,
      totalRaised: campaign.getTotalRaised(),
      availableFunds: campaign.getAvailableFunds(),
      judgmentAmount: campaign.getJudgmentAmount(),
      description: proposal?.description,
      lastUpdated: this.clock.now()
    };
  }

  /**
   * Register a new attorney signup (initial registration)
   */
  registerAttorneySignup(
    username: string,
    email: string
  ): AttorneyRegistration {
    // Check for duplicate username
    const existingRegistration = Array.from(this.attorneyRegistrations.values()).find(
      reg => reg.username === username
    );
    if (existingRegistration) {
      throw new Error("Username already exists");
    }

    // Check for duplicate email
    const existingByEmail = Array.from(this.attorneyRegistrations.values()).find(
      reg => reg.email === email
    );
    if (existingByEmail) {
      throw new Error("Email already registered");
    }

    const registration: AttorneyRegistration = {
      id: `attorney_reg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      username,
      email,
      emailVerified: false,
      registeredAt: this.clock.now(),
      verificationToken: Math.random().toString(36).substring(2, 15)
    };

    this.attorneyRegistrations.set(registration.id, registration);
    return registration;
  }

  /**
   * Verify attorney email
   */
  verifyAttorneyEmail(registrationId: string, token: string): void {
    const registration = this.attorneyRegistrations.get(registrationId);
    if (!registration) {
      throw new Error("Registration not found");
    }

    if (registration.verificationToken !== token) {
      throw new Error("Invalid verification token");
    }

    registration.emailVerified = true;
    registration.verificationToken = undefined;
  }

  /**
   * Submit attorney profile details (after email verification)
   */
  submitAttorneyDetails(
    registrationId: string,
    publicKey: PublicKeyLike,
    fullName: string,
    barLicense: BarLicenseInfo,
    practiceAreas: PracticeArea[],
    acceptsSolicitations: boolean,
    bio?: string
  ): AttorneyProfile {
    const registration = this.attorneyRegistrations.get(registrationId);
    if (!registration) {
      throw new Error("Registration not found");
    }

    if (!registration.emailVerified) {
      throw new Error("Email must be verified before submitting profile");
    }

    // Check if profile already exists for this public key
    if (this.attorneyProfiles.has(publicKey)) {
      throw new Error("Profile already exists for this public key");
    }

    const profile: AttorneyProfile = {
      publicKey,
      fullName,
      email: registration.email,
      emailVerified: true,
      barLicense,
      practiceAreas,
      acceptsSolicitations,
      verificationStatus: "pending",
      registeredAt: registration.registeredAt,
      bio
    };

    this.attorneyProfiles.set(publicKey, profile);
    return profile;
  }

  /**
   * Get attorney profile by public key
   */
  getAttorneyProfile(publicKey: PublicKeyLike): AttorneyProfile | undefined {
    return this.attorneyProfiles.get(publicKey);
  }

  /**
   * List attorney profiles, optionally filtered by verification status
   */
  listAttorneyProfiles(verificationStatus?: AttorneyVerificationStatus): AttorneyProfile[] {
    const profiles = Array.from(this.attorneyProfiles.values());
    if (verificationStatus) {
      return profiles.filter(p => p.verificationStatus === verificationStatus);
    }
    return profiles;
  }

  /**
   * List pending attorney profiles awaiting admin verification
   */
  listPendingAttorneys(): AttorneyProfile[] {
    return this.listAttorneyProfiles("pending");
  }

  /**
   * Verify attorney profile (admin action)
   */
  verifyAttorneyProfile(
    publicKey: PublicKeyLike,
    adminWallet: PublicKeyLike,
    approved: boolean,
    notes?: string
  ): AttorneyProfile {
    const profile = this.attorneyProfiles.get(publicKey);
    if (!profile) {
      throw new Error("Attorney profile not found");
    }

    if (profile.verificationStatus !== "pending") {
      throw new Error("Profile is not in pending status");
    }

    profile.verificationStatus = approved ? "verified" : "rejected";
    profile.verifiedBy = adminWallet;
    profile.verifiedAt = this.clock.now();
    profile.verificationNotes = notes;

    // If verified, also register as an account in the system
    if (approved) {
      try {
        this.registerAccount(
          publicKey,
          "attorney",
          profile.fullName,
          profile.email
        );
      } catch (error) {
        // Account may already exist, ignore error
      }
    }

    return profile;
  }

  /**
   * Update attorney profile (by the attorney themselves)
   */
  updateAttorneyProfile(
    publicKey: PublicKeyLike,
    updates: Partial<Pick<AttorneyProfile, "practiceAreas" | "acceptsSolicitations" | "bio">>
  ): AttorneyProfile {
    const profile = this.attorneyProfiles.get(publicKey);
    if (!profile) {
      throw new Error("Attorney profile not found");
    }

    if (updates.practiceAreas !== undefined) {
      profile.practiceAreas = updates.practiceAreas;
    }
    if (updates.acceptsSolicitations !== undefined) {
      profile.acceptsSolicitations = updates.acceptsSolicitations;
    }
    if (updates.bio !== undefined) {
      profile.bio = updates.bio;
    }

    return profile;
  }

  /**
   * Get attorney registration by ID
   */
  getAttorneyRegistration(registrationId: string): AttorneyRegistration | undefined {
    return this.attorneyRegistrations.get(registrationId);
  }

  /**
   * Search verified attorneys by criteria
   */
  searchVerifiedAttorneys(
    practiceArea?: PracticeArea,
    acceptsSolicitations?: boolean
  ): AttorneyProfile[] {
    let profiles = this.listAttorneyProfiles("verified");

    if (practiceArea) {
      profiles = profiles.filter(p => p.practiceAreas.includes(practiceArea));
    }

    if (acceptsSolicitations !== undefined) {
      profiles = profiles.filter(p => p.acceptsSolicitations === acceptsSolicitations);
    }

    return profiles;
  }
}
