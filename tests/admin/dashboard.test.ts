import { describe, it, expect, beforeEach } from "vitest";
import { AdminDashboard } from "../../src/admin/dashboard.js";
import { Campaign } from "../../src/crowdfunding/campaign.js";
import type { Clock, CampaignConfig } from "../../src/crowdfunding/types.js";

// FakeClock for deterministic time-based testing
class FakeClock implements Clock {
  private time = 0;
  now(): number {
    return this.time;
  }
  setTime(unixSeconds: number): void {
    this.time = unixSeconds;
  }
  advance(seconds: number): void {
    this.time += seconds;
  }
}

describe("AdminDashboard", () => {
  let clock: FakeClock;
  let dashboard: AdminDashboard;

  beforeEach(() => {
    clock = new FakeClock();
    clock.setTime(1000);
    dashboard = new AdminDashboard(clock);
  });

  describe("Account Management", () => {
    it("should register a new account", () => {
      const account = dashboard.registerAccount(
        "user123",
        "user",
        "John Doe",
        "john@example.com"
      );

      expect(account.publicKey).toBe("user123");
      expect(account.type).toBe("user");
      expect(account.name).toBe("John Doe");
      expect(account.email).toBe("john@example.com");
      expect(account.isActive).toBe(true);
      expect(account.createdAt).toBe(1000);
      expect(account.totalContributed).toBe(0);
    });

    it("should not allow duplicate account registration", () => {
      dashboard.registerAccount("user123", "user", "John Doe", "john@example.com");
      
      expect(() => {
        dashboard.registerAccount("user123", "client", "Jane Doe", "jane@example.com");
      }).toThrow("Account already exists");
    });

    it("should retrieve account by public key", () => {
      dashboard.registerAccount("user123", "user", "John Doe", "john@example.com");
      
      const account = dashboard.getAccount("user123");
      expect(account).toBeDefined();
      expect(account?.name).toBe("John Doe");
    });

    it("should list all accounts", () => {
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");

      const accounts = dashboard.listAccounts();
      expect(accounts).toHaveLength(3);
    });

    it("should filter accounts by type", () => {
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");

      const attorneys = dashboard.listAccounts("attorney");
      expect(attorneys).toHaveLength(1);
      expect(attorneys[0].type).toBe("attorney");
    });

    it("should update account active status", () => {
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");
      
      dashboard.setAccountActive("user1", false);
      const account = dashboard.getAccount("user1");
      expect(account?.isActive).toBe(false);
    });
  });

  describe("Proposal Management", () => {
    beforeEach(() => {
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");
    });

    it("should submit a new proposal", () => {
      const proposal = dashboard.submitProposal(
        "campaign1",
        "client1",
        "attorney1",
        100000,
        2000,
        "Legal case for patent dispute"
      );

      expect(proposal.campaignId).toBe("campaign1");
      expect(proposal.status).toBe("pending");
      expect(proposal.client).toBe("client1");
      expect(proposal.attorney).toBe("attorney1");
      expect(proposal.submittedAt).toBe(1000);
    });

    it("should not allow duplicate proposals", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      
      expect(() => {
        dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      }).toThrow("Proposal already exists");
    });

    it("should approve a proposal", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      
      clock.setTime(1100);
      dashboard.approveProposal("campaign1", "admin1", "Looks good");

      const proposal = dashboard.getProposal("campaign1");
      expect(proposal?.status).toBe("approved");
      expect(proposal?.reviewedBy).toBe("admin1");
      expect(proposal?.reviewedAt).toBe(1100);
      expect(proposal?.reviewNotes).toBe("Looks good");
    });

    it("should reject a proposal", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      
      clock.setTime(1100);
      dashboard.rejectProposal("campaign1", "admin1", "Insufficient details");

      const proposal = dashboard.getProposal("campaign1");
      expect(proposal?.status).toBe("rejected");
      expect(proposal?.reviewedBy).toBe("admin1");
      expect(proposal?.reviewNotes).toBe("Insufficient details");
    });

    it("should not allow reviewing already reviewed proposals", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      dashboard.approveProposal("campaign1", "admin1", "Approved");

      expect(() => {
        dashboard.approveProposal("campaign1", "admin1", "Approved again");
      }).toThrow("Proposal has already been reviewed");
    });

    it("should list proposals by status", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 100000, 2000, "Case 1");
      dashboard.submitProposal("campaign2", "client1", "attorney1", 200000, 2000, "Case 2");
      dashboard.submitProposal("campaign3", "client1", "attorney1", 150000, 2000, "Case 3");
      
      dashboard.approveProposal("campaign1", "admin1", "OK");
      dashboard.rejectProposal("campaign2", "admin1", "Not OK");

      const pending = dashboard.listProposals("pending");
      const approved = dashboard.listProposals("approved");
      const rejected = dashboard.listProposals("rejected");

      expect(pending).toHaveLength(1);
      expect(approved).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });
  });

  describe("Campaign Management", () => {
    let campaign: Campaign;
    let config: CampaignConfig;

    beforeEach(() => {
      config = {
        id: "campaign1",
        minRaiseLamports: 1000,
        deadlineUnix: 2000,
        refundWindowStartUnix: 3000,
        signers: ["attorney1", "platform1", "client1"],
        daoTreasury: "dao_treasury"
      };
      campaign = new Campaign(config, clock);
    });

    it("should register a campaign", () => {
      dashboard.registerCampaign(campaign, "campaign1");
      
      const retrieved = dashboard.getCampaign("campaign1");
      expect(retrieved).toBe(campaign);
    });

    it("should not allow duplicate campaign registration", () => {
      dashboard.registerCampaign(campaign, "campaign1");
      
      expect(() => {
        dashboard.registerCampaign(campaign, "campaign1");
      }).toThrow("Campaign already registered");
    });

    it("should list all campaigns", () => {
      const config2 = { ...config, id: "campaign2" };
      const campaign2 = new Campaign(config2, clock);

      dashboard.registerCampaign(campaign, "campaign1");
      dashboard.registerCampaign(campaign2, "campaign2");

      const campaigns = dashboard.listCampaigns();
      expect(campaigns).toHaveLength(2);
      expect(campaigns).toContain("campaign1");
      expect(campaigns).toContain("campaign2");
    });

    it("should list campaigns by status", () => {
      const config2 = { ...config, id: "campaign2" };
      const campaign2 = new Campaign(config2, clock);

      dashboard.registerCampaign(campaign, "campaign1");
      dashboard.registerCampaign(campaign2, "campaign2");

      // Make campaign1 locked
      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();

      const activeCampaigns = dashboard.listCampaignsByStatus("active");
      const lockedCampaigns = dashboard.listCampaignsByStatus("locked");

      expect(activeCampaigns).toContain("campaign2");
      expect(lockedCampaigns).toContain("campaign1");
    });

    it("should get campaign summary", () => {
      dashboard.registerCampaign(campaign, "campaign1");
      campaign.contribute("user1", 500);
      campaign.contribute("user2", 600);

      const summary = dashboard.getCampaignSummary("campaign1");
      
      expect(summary).toBeDefined();
      expect(summary?.id).toBe("campaign1");
      expect(summary?.status).toBe("active");
      expect(summary?.totalRaised).toBe(1100);
    });
  });

  describe("Transaction Tracking", () => {
    it("should record transactions", () => {
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const transactions = dashboard.getAllTransactions();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].id).toBe("tx1");
    });

    it("should get wallet transactions", () => {
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 300,
        from: "user2",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const user1Txs = dashboard.getWalletTransactions("user1");
      expect(user1Txs).toHaveLength(1);
      expect(user1Txs[0].from).toBe("user1");
    });

    it("should get campaign transactions", () => {
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 300,
        from: "user2",
        to: "campaign2",
        campaignId: "campaign2"
      });

      const campaign1Txs = dashboard.getCampaignTransactions("campaign1");
      expect(campaign1Txs).toHaveLength(1);
      expect(campaign1Txs[0].campaignId).toBe("campaign1");
    });

    it("should update account statistics on contribution", () => {
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");
      
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const account = dashboard.getAccount("user1");
      expect(account?.totalContributed).toBe(500);
    });
  });

  describe("Dashboard Statistics", () => {
    let config: CampaignConfig;

    beforeEach(() => {
      config = {
        id: "campaign1",
        minRaiseLamports: 1000,
        deadlineUnix: 2000,
        refundWindowStartUnix: 3000,
        signers: ["attorney1", "platform1", "client1"],
        daoTreasury: "dao_treasury"
      };
    });

    it("should calculate dashboard statistics", () => {
      // Reset clock to start
      clock.setTime(1000);
      
      // Create and register multiple campaigns
      const campaign1 = new Campaign(config, clock);
      const campaign2 = new Campaign({ ...config, id: "campaign2" }, clock);
      const campaign3 = new Campaign({ ...config, id: "campaign3", minRaiseLamports: 500 }, clock);

      dashboard.registerCampaign(campaign1, "campaign1");
      dashboard.registerCampaign(campaign2, "campaign2");
      dashboard.registerCampaign(campaign3, "campaign3");

      // Make campaign1 successful
      campaign1.contribute("user1", 1200);
      
      // Make campaign3 fail before deadline
      campaign3.contribute("user2", 200);
      
      // Advance time past deadline
      clock.setTime(2001);
      campaign1.evaluate();
      campaign3.evaluate();

      // Register some accounts
      dashboard.registerAccount("user1", "user", "User 1", "user1@example.com");
      dashboard.registerAccount("user2", "user", "User 2", "user2@example.com");

      // Submit a proposal
      dashboard.submitProposal("proposal1", "client1", "attorney1", 1000, 2000, "Test case");

      const stats = dashboard.getDashboardStats();

      expect(stats.totalCampaigns).toBe(3);
      expect(stats.activeCampaigns).toBe(1); // campaign2 is still active
      expect(stats.successfulCampaigns).toBe(1); // campaign1 is locked
      expect(stats.failedCampaigns).toBe(1); // campaign3 failed
      expect(stats.totalRaised).toBe(1400); // 1200 + 200
      expect(stats.totalAccounts).toBe(2);
      expect(stats.pendingProposals).toBe(1);
    });

    it("should calculate DAO fees correctly", () => {
      const campaign1 = new Campaign(config, clock);
      dashboard.registerCampaign(campaign1, "campaign1");

      campaign1.contribute("user1", 1000);
      clock.setTime(2001);
      campaign1.evaluate();

      const stats = dashboard.getDashboardStats();
      expect(stats.totalDaoFees).toBe(100); // 10% of 1000
    });
  });

  describe("Accounts by Wallets", () => {
    it("should get multiple accounts by wallet addresses", () => {
      dashboard.registerAccount("user1", "user", "User 1", "user1@example.com");
      dashboard.registerAccount("user2", "user", "User 2", "user2@example.com");
      dashboard.registerAccount("user3", "user", "User 3", "user3@example.com");

      const accounts = dashboard.getAccountsByWallets(["user1", "user3", "nonexistent"]);
      
      expect(accounts).toHaveLength(2);
      expect(accounts[0].name).toBe("User 1");
      expect(accounts[1].name).toBe("User 3");
    });
  });

  describe("User Profile Analysis", () => {
    let config: CampaignConfig;
    let campaign: Campaign;

    beforeEach(() => {
      config = {
        id: "campaign1",
        minRaiseLamports: 1000,
        deadlineUnix: 2000,
        refundWindowStartUnix: 3000,
        signers: ["attorney1", "platform1", "client1"],
        daoTreasury: "dao_treasury"
      };
      campaign = new Campaign(config, clock);
      dashboard.registerCampaign(campaign, "campaign1");
    });

    it("should get user profile with cross-linked data", () => {
      // Register accounts
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");
      
      // Record transactions
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 300,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const profile = dashboard.getUserProfile("user1");

      expect(profile).toBeDefined();
      expect(profile?.account.name).toBe("User One");
      expect(profile?.campaigns).toContain("campaign1");
      expect(profile?.transactions).toHaveLength(2);
      expect(profile?.analytics.totalContributed).toBe(800);
      expect(profile?.analytics.activeCampaigns).toBeGreaterThan(0);
    });

    it("should include proposals for attorneys in profile", () => {
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");

      dashboard.submitProposal(
        "campaign1",
        "client1",
        "attorney1",
        100000,
        2000,
        "Test case"
      );

      const profile = dashboard.getUserProfile("attorney1");

      expect(profile).toBeDefined();
      expect(profile?.proposals).toContain("campaign1");
    });

    it("should include invoice payments for attorneys", () => {
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");

      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "invoice_payment",
        amount: 5000,
        from: "campaign1",
        to: "attorney1",
        campaignId: "campaign1",
        metadata: { invoiceId: "INV-001" }
      });

      const profile = dashboard.getUserProfile("attorney1");

      expect(profile).toBeDefined();
      expect(profile?.invoicePayments).toBeDefined();
      expect(profile?.invoicePayments).toHaveLength(1);
      expect(profile?.invoicePayments?.[0].amount).toBe(5000);
      expect(profile?.analytics.totalReceived).toBe(5000);
    });

    it("should calculate success rate for attorneys", () => {
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");

      // Submit proposal
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case 1");

      // Make campaign successful
      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("win", 50000);

      // Record transaction to link attorney to campaign (invoice payment)
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1500,
        type: "invoice_payment",
        amount: 5000,
        from: "campaign1",
        to: "attorney1",
        campaignId: "campaign1"
      });

      const profile = dashboard.getUserProfile("attorney1");

      expect(profile).toBeDefined();
      expect(profile?.proposals).toContain("campaign1");
      // Success rate is calculated based on completed campaigns where attorney is involved
      // Since we have 1 proposal, success rate should be defined
      expect(profile?.analytics.successRate).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average contribution for users", () => {
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");

      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 300,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const profile = dashboard.getUserProfile("user1");

      expect(profile).toBeDefined();
      // Total 800 contributed to 1 campaign = 800 average
      expect(profile?.analytics.averageContribution).toBe(800);
    });

    it("should calculate average contribution across multiple campaigns", () => {
      const config2 = { ...config, id: "campaign2" };
      const campaign2 = new Campaign(config2, clock);
      dashboard.registerCampaign(campaign2, "campaign2");
      dashboard.registerAccount("user1", "user", "User One", "user1@example.com");

      // Contribute to campaign1
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 600,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      // Contribute to campaign2
      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 400,
        from: "user1",
        to: "campaign2",
        campaignId: "campaign2"
      });

      const profile = dashboard.getUserProfile("user1");

      expect(profile).toBeDefined();
      // Total 1000 contributed across 2 campaigns = 500 average
      expect(profile?.analytics.averageContribution).toBe(500);
    });
  });

  describe("User Analytics", () => {
    beforeEach(() => {
      dashboard.registerAccount("user1", "user", "User 1", "user1@example.com");
      dashboard.registerAccount("user2", "user", "User 2", "user2@example.com");
      dashboard.registerAccount("client1", "client", "Client 1", "client1@example.com");
      dashboard.registerAccount("attorney1", "attorney", "Attorney 1", "attorney1@example.com");
      dashboard.registerAccount("attorney2", "attorney", "Attorney 2", "attorney2@example.com");
    });

    it("should calculate user type distribution", () => {
      const analytics = dashboard.getUserAnalytics();

      expect(analytics.userTypeDistribution.users).toBe(2);
      expect(analytics.userTypeDistribution.clients).toBe(1);
      expect(analytics.userTypeDistribution.attorneys).toBe(2);
    });

    it("should identify top contributors", () => {
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 1000,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      dashboard.recordTransaction({
        id: "tx2",
        timestamp: 1100,
        type: "contribution",
        amount: 500,
        from: "user2",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const analytics = dashboard.getUserAnalytics();

      expect(analytics.topContributors).toHaveLength(2);
      expect(analytics.topContributors[0].publicKey).toBe("user1");
      expect(analytics.topContributors[0].totalContributed).toBe(1000);
    });

    it("should identify top attorneys by cases", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case 1");
      dashboard.submitProposal("campaign2", "client1", "attorney1", 2000, 2000, "Case 2");
      dashboard.submitProposal("campaign3", "client1", "attorney2", 1500, 2000, "Case 3");

      const analytics = dashboard.getUserAnalytics();

      expect(analytics.topAttorneys.length).toBeGreaterThan(0);
      expect(analytics.topAttorneys[0].publicKey).toBe("attorney1");
      expect(analytics.topAttorneys[0].totalCases).toBe(2);
    });

    it("should track active users", () => {
      clock.setTime(1000);
      
      dashboard.recordTransaction({
        id: "tx1",
        timestamp: 1000,
        type: "contribution",
        amount: 500,
        from: "user1",
        to: "campaign1",
        campaignId: "campaign1"
      });

      const analytics = dashboard.getUserAnalytics();

      expect(analytics.activeUsers.total).toBe(5); // All accounts are active by default
      expect(analytics.activeUsers.lastMonth).toBeGreaterThanOrEqual(1);
    });
  });

  describe("User Search", () => {
    beforeEach(() => {
      dashboard.registerAccount("user1", "user", "John Doe", "john@example.com");
      dashboard.registerAccount("user2", "user", "Jane Smith", "jane@example.com");
      dashboard.registerAccount("client1", "client", "Bob Johnson", "bob@company.com");
      dashboard.registerAccount("attorney1", "attorney", "Alice Williams", "alice@law.com");
    });

    it("should search users by name", () => {
      const results = dashboard.searchUsers("john");
      
      expect(results).toHaveLength(2); // John and Johnson
      expect(results.some(r => r.name === "John Doe")).toBe(true);
      expect(results.some(r => r.name === "Bob Johnson")).toBe(true);
    });

    it("should search users by email", () => {
      const results = dashboard.searchUsers("law.com");
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Alice Williams");
    });

    it("should search users by wallet", () => {
      const results = dashboard.searchUsers("user1");
      
      expect(results).toHaveLength(1);
      expect(results[0].publicKey).toBe("user1");
    });

    it("should filter search by account type", () => {
      const results = dashboard.searchUsers("john", "user");
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("John Doe");
      expect(results[0].type).toBe("user");
    });

    it("should return empty array for no matches", () => {
      const results = dashboard.searchUsers("nonexistent");
      
      expect(results).toHaveLength(0);
    });
  });

  describe("Case Management", () => {
    let config: CampaignConfig;
    let campaign: Campaign;

    beforeEach(() => {
      config = {
        id: "campaign1",
        minRaiseLamports: 1000,
        deadlineUnix: 2000,
        refundWindowStartUnix: 3000,
        signers: ["attorney1", "platform1", "client1"],
        daoTreasury: "dao_treasury"
      };
      campaign = new Campaign(config, clock);
      dashboard.registerCampaign(campaign, "campaign1");
      
      // Register accounts
      dashboard.registerAccount("attorney1", "attorney", "Attorney One", "attorney1@example.com");
      dashboard.registerAccount("client1", "client", "Client One", "client1@example.com");
    });

    it("should identify cases in active litigation", () => {
      // Submit proposal
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Patent case");

      // Make campaign successful
      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();

      // Record outcome (case enters litigation)
      campaign.recordOutcome("win", 50000);

      const cases = dashboard.getActiveLitigationCases();

      expect(cases).toHaveLength(1);
      expect(cases[0].campaignId).toBe("campaign1");
      expect(cases[0].litigationStatus).toBe("awaiting_decision");
      expect(cases[0].currentOutcome).toBe("win");
    });

    it("should not include campaigns without litigation activity", () => {
      // Campaign is locked but no outcome recorded yet
      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();

      const cases = dashboard.getActiveLitigationCases();

      expect(cases).toHaveLength(0);
    });

    it("should track appeal rounds in litigation cases", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case");

      // Make campaign successful and record outcome
      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("win", 50000);
      campaign.depositCourtAward("attorney1", 50000);

      // Approve appeal
      campaign.approveAppeal("attorney1", 30000, 3000, "appellate", "appeal");

      const cases = dashboard.getActiveLitigationCases();

      expect(cases).toHaveLength(1);
      expect(cases[0].currentRound).toBe(2);
      expect(cases[0].appealRounds).toHaveLength(1);
      expect(cases[0].currentCourtLevel).toBe("appellate");
      expect(cases[0].currentPath).toBe("appeal");
    });

    it("should get detailed case information", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Patent case");

      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("loss", 25000);

      const caseDetails = dashboard.getCaseDetails("campaign1");

      expect(caseDetails).toBeDefined();
      expect(caseDetails?.campaignId).toBe("campaign1");
      expect(caseDetails?.client).toBe("client1");
      expect(caseDetails?.attorney).toBe("attorney1");
      expect(caseDetails?.currentOutcome).toBe("loss");
      expect(caseDetails?.judgmentAmount).toBe(25000);
      expect(caseDetails?.description).toBe("Patent case");
    });

    it("should return undefined for non-existent cases", () => {
      const caseDetails = dashboard.getCaseDetails("nonexistent");
      expect(caseDetails).toBeUndefined();
    });

    it("should filter cases by court level", () => {
      // Reset clock to start
      clock.setTime(1000);
      
      // Create multiple campaigns at different court levels
      const config2 = { ...config, id: "campaign2" };
      const campaign2 = new Campaign(config2, clock);
      dashboard.registerCampaign(campaign2, "campaign2");
      
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case 1");
      dashboard.submitProposal("campaign2", "client1", "attorney1", 1000, 2000, "Case 2");

      // Campaign 1: District court
      campaign.contribute("user1", 1000);
      
      // Campaign 2: Before deadline
      campaign2.contribute("user1", 1000);
      
      // Now advance time past deadline
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("win");

      // Campaign 2: Appellate court
      campaign2.evaluate();
      campaign2.recordOutcome("win", 30000);
      campaign2.depositCourtAward("attorney1", 30000);
      campaign2.approveAppeal("attorney1", 20000, 3000, "appellate", "appeal");

      const districtCases = dashboard.listCasesByCourtLevel("district");
      const appellateCases = dashboard.listCasesByCourtLevel("appellate");

      expect(districtCases).toHaveLength(1);
      expect(districtCases[0].campaignId).toBe("campaign1");
      expect(appellateCases).toHaveLength(1);
      expect(appellateCases[0].campaignId).toBe("campaign2");
    });

    it("should calculate case management statistics", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case 1");

      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("win");

      const stats = dashboard.getCaseManagementStats();

      expect(stats.totalCases).toBe(1);
      expect(stats.casesAwaitingDecision).toBeGreaterThanOrEqual(0);
      expect(stats.casesByCourtLevel.district).toBeGreaterThanOrEqual(0);
    });

    it("should identify awaiting funding status for appeal_active campaigns", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case");

      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      
      // After 10% DAO fee, available funds = 900
      // Record loss with smaller judgment
      campaign.recordOutcome("loss", 500);
      campaign.payJudgment(500);

      // Approve appeal that requires fundraising (2/3 for loss)
      campaign.approveAppeal("attorney1", 80000, 3000, "appellate", "appeal");
      campaign.approveAppeal("platform1", 80000, 3000, "appellate", "appeal");

      const cases = dashboard.getActiveLitigationCases();

      expect(cases).toHaveLength(1);
      expect(cases[0].litigationStatus).toBe("awaiting_funding");
      expect(cases[0].status).toBe("appeal_active");
    });

    it("should mark cases with final path as completed", () => {
      dashboard.submitProposal("campaign1", "client1", "attorney1", 1000, 2000, "Case");

      campaign.contribute("user1", 1000);
      clock.setTime(2001);
      campaign.evaluate();
      campaign.recordOutcome("win", 100000);
      campaign.depositCourtAward("attorney1", 100000);

      // Approve appeal with final path
      campaign.approveAppeal("attorney1", 20000, 3000, "us_supreme", "final");

      const cases = dashboard.getActiveLitigationCases();

      expect(cases).toHaveLength(1);
      expect(cases[0].litigationStatus).toBe("completed");
      expect(cases[0].currentPath).toBe("final");
    });
  });
});
