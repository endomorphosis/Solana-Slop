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
});
