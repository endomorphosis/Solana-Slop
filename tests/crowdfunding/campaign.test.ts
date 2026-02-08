import { describe, expect, it } from "vitest";
import { Campaign } from "../../src/crowdfunding/campaign.js";
import { makeKeypair, pubkey } from "../helpers/participants.js";
import { SYSTEM_RECIPIENT_COURT } from "../../src/crowdfunding/types.js";

class FakeClock {
  private nowUnix: number;

  constructor(startUnix: number) {
    this.nowUnix = startUnix;
  }

  now(): number {
    return this.nowUnix;
  }

  set(unix: number): void {
    this.nowUnix = unix;
  }
}

describe("crowdfunding campaign", () => {
  const attorney = makeKeypair(1);
  const platform = makeKeypair(2);
  const client = makeKeypair(3);
  const funderA = makeKeypair(10);
  const funderB = makeKeypair(11);
  const daoTreasury = makeKeypair(99);

  it("auto-refunds when minimum raise is not met by deadline", () => {
    const clock = new FakeClock(1_000);
    const campaign = new Campaign(
      {
        id: "case-001",
        minRaiseLamports: 100,
        deadlineUnix: 1_100,
        refundWindowStartUnix: 1_300,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 40);
    campaign.contribute(pubkey(funderB), 50);

    clock.set(1_200);
    campaign.evaluate();

    expect(campaign.getStatus()).toBe("failed_refunding");
    expect(campaign.getRefundReason()).toBe("auto_failed");

    expect(campaign.claimRefund(pubkey(funderA))).toBe(40);
    expect(campaign.claimRefund(pubkey(funderB))).toBe(50);

    expect(() => campaign.claimRefund(pubkey(funderA))).toThrow(/Refund not available/);
  });

  it("requires 2-of-3 approvals to refund after minimum raise and time window", () => {
    const clock = new FakeClock(2_000);
    const campaign = new Campaign(
      {
        id: "case-002",
        minRaiseLamports: 100,
        deadlineUnix: 2_100,
        refundWindowStartUnix: 2_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 60);
    campaign.contribute(pubkey(funderB), 60);

    clock.set(2_200);
    campaign.evaluate();

    expect(campaign.getStatus()).toBe("locked");

    clock.set(2_450);
    campaign.approveRefund(pubkey(attorney));
    expect(campaign.getStatus()).toBe("locked");

    campaign.approveRefund(pubkey(platform));
    expect(campaign.getStatus()).toBe("refunding");
    expect(campaign.getRefundReason()).toBe("multisig");

    expect(campaign.claimRefund(pubkey(funderA))).toBe(60);
    expect(campaign.claimRefund(pubkey(funderB))).toBe(60);
  });

  it("rejects non-signer approvals", () => {
    const clock = new FakeClock(3_000);
    const campaign = new Campaign(
      {
        id: "case-003",
        minRaiseLamports: 100,
        deadlineUnix: 3_100,
        refundWindowStartUnix: 3_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 120);

    clock.set(3_200);
    campaign.evaluate();
    expect(campaign.getStatus()).toBe("locked");

    clock.set(3_450);
    expect(() => campaign.approveRefund(pubkey(funderA))).toThrow(/not a multisig signer/);
  });

  it("deducts 10% DAO fee on successful raise", () => {
    const clock = new FakeClock(4_000);
    const campaign = new Campaign(
      {
        id: "case-004",
        minRaiseLamports: 100,
        deadlineUnix: 4_100,
        refundWindowStartUnix: 4_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 60);
    campaign.contribute(pubkey(funderB), 60);
    expect(campaign.getTotalRaised()).toBe(120);

    clock.set(4_200);
    campaign.evaluate();

    expect(campaign.getStatus()).toBe("locked");
    expect(campaign.getDaoFeeAmount()).toBe(12); // 10% of 120
    expect(campaign.getAvailableFunds()).toBe(108); // 120 - 12
  });

  it("allows attorney to deposit court fees unilaterally", () => {
    const clock = new FakeClock(5_000);
    const campaign = new Campaign(
      {
        id: "case-005",
        minRaiseLamports: 100,
        deadlineUnix: 5_100,
        refundWindowStartUnix: 5_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 100);
    clock.set(5_200);
    campaign.evaluate();

    expect(campaign.getStatus()).toBe("locked");
    expect(campaign.getCourtFeesDeposited()).toBe(0);

    // Attorney can deposit court fees
    campaign.depositCourtFees(pubkey(attorney), 50);
    expect(campaign.getCourtFeesDeposited()).toBe(50);
    expect(campaign.getAvailableFunds()).toBe(140); // 100 - 10 (fee) + 50 (court fees)

    // Non-attorney cannot deposit
    expect(() => campaign.depositCourtFees(pubkey(platform), 20)).toThrow(/Only attorney/);
    expect(() => campaign.depositCourtFees(pubkey(funderA), 20)).toThrow(/Only attorney/);
  });

  it("requires 2-of-3 approvals to pay invoice to attorney", () => {
    const clock = new FakeClock(6_000);
    const campaign = new Campaign(
      {
        id: "case-006",
        minRaiseLamports: 100,
        deadlineUnix: 6_100,
        refundWindowStartUnix: 6_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 200);
    clock.set(6_200);
    campaign.evaluate();

    expect(campaign.getStatus()).toBe("locked");
    expect(campaign.getAvailableFunds()).toBe(180); // 200 - 20 (10% fee)

    // First approval
    campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 50, pubkey(attorney));
    expect(campaign.getInvoiceApprovals("INV-001")).toHaveLength(1);
    expect(campaign.getInvoicePayments()).toHaveLength(0);

    // Second approval triggers payment
    campaign.approveInvoicePayment(pubkey(platform), "INV-001", 50, pubkey(attorney));
    expect(campaign.getInvoicePayments()).toHaveLength(1);
    expect(campaign.getInvoicePayments()[0].amount).toBe(50);
    expect(campaign.getInvoicePayments()[0].recipient).toBe(pubkey(attorney));
    expect(campaign.getAvailableFunds()).toBe(130); // 180 - 50

    // Non-signer cannot approve
    expect(() => campaign.approveInvoicePayment(pubkey(funderA), "INV-002", 30, pubkey(attorney))).toThrow(/not a multisig signer/);
  });

  it("prevents invoice payment when insufficient funds", () => {
    const clock = new FakeClock(7_000);
    const campaign = new Campaign(
      {
        id: "case-007",
        minRaiseLamports: 100,
        deadlineUnix: 7_100,
        refundWindowStartUnix: 7_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 100);
    clock.set(7_200);
    campaign.evaluate();

    expect(campaign.getAvailableFunds()).toBe(90); // 100 - 10 (fee)

    // Try to approve payment exceeding available funds
    expect(() => campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 100, pubkey(attorney))).toThrow(/Insufficient funds/);
  });

  it("prevents double approval of same invoice by same signer", () => {
    const clock = new FakeClock(8_000);
    const campaign = new Campaign(
      {
        id: "case-008",
        minRaiseLamports: 100,
        deadlineUnix: 8_100,
        refundWindowStartUnix: 8_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 200);
    clock.set(8_200);
    campaign.evaluate();

    campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 50, pubkey(attorney));
    
    // Second approval by same signer should fail
    expect(() => campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 50, pubkey(attorney))).toThrow(/already approved/);
  });

  it("enforces consistent invoice parameters across approvals", () => {
    const clock = new FakeClock(9_000);
    const campaign = new Campaign(
      {
        id: "case-009",
        minRaiseLamports: 100,
        deadlineUnix: 9_100,
        refundWindowStartUnix: 9_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 200);
    clock.set(9_200);
    campaign.evaluate();

    // First approval with specific amount
    campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 50, pubkey(attorney));
    
    // Second approval with different amount should fail
    expect(() => campaign.approveInvoicePayment(pubkey(platform), "INV-001", 60, pubkey(attorney))).toThrow(/must match existing approvals/);
    
    // Second approval with different recipient should fail
    expect(() => campaign.approveInvoicePayment(pubkey(platform), "INV-001", 50, pubkey(platform))).toThrow(/must match existing approvals/);
  });

  it("rechecks available funds before finalizing invoice payment", () => {
    const clock = new FakeClock(10_000);
    const campaign = new Campaign(
      {
        id: "case-010",
        minRaiseLamports: 100,
        deadlineUnix: 10_100,
        refundWindowStartUnix: 10_400,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
        daoTreasury: pubkey(daoTreasury)
      },
      clock
    );

    campaign.contribute(pubkey(funderA), 200);
    clock.set(10_200);
    campaign.evaluate();

    expect(campaign.getAvailableFunds()).toBe(180); // 200 - 20 (fee)

    // First invoice approval for 100
    campaign.approveInvoicePayment(pubkey(attorney), "INV-001", 100, pubkey(attorney));
    
    // Second invoice approval for 90 (should succeed, total pending = 190)
    campaign.approveInvoicePayment(pubkey(platform), "INV-002", 90, pubkey(attorney));
    
    // Complete first invoice (reduces available funds to 80)
    campaign.approveInvoicePayment(pubkey(client), "INV-001", 100, pubkey(attorney));
    expect(campaign.getAvailableFunds()).toBe(80); // 180 - 100
    
    // Completing second invoice should fail because funds are now insufficient
    expect(() => campaign.approveInvoicePayment(pubkey(client), "INV-002", 90, pubkey(attorney))).toThrow(/Insufficient funds/);
  });

  describe("appeal system", () => {
    it("allows recording win outcome and depositing court awards", () => {
      const clock = new FakeClock(11_000);
      const campaign = new Campaign(
        {
          id: "case-011",
          minRaiseLamports: 100,
          deadlineUnix: 11_100,
          refundWindowStartUnix: 11_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(11_200);
      campaign.evaluate();

      expect(campaign.getStatus()).toBe("locked");

      // Record win with judgment
      campaign.recordOutcome("win", 200);
      expect(campaign.getStatus()).toBe("won");
      expect(campaign.getOutcome()).toBe("win");
      expect(campaign.getJudgmentAmount()).toBe(200);

      // Attorney deposits court award
      campaign.depositCourtAward(pubkey(attorney), 200);
      expect(campaign.getCourtFeesDeposited()).toBe(200);
    });

    it("allows recording loss outcome and paying judgment", () => {
      const clock = new FakeClock(12_000);
      const campaign = new Campaign(
        {
          id: "case-012",
          minRaiseLamports: 100,
          deadlineUnix: 12_100,
          refundWindowStartUnix: 12_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 200);
      clock.set(12_200);
      campaign.evaluate();

      expect(campaign.getStatus()).toBe("locked");

      // Record loss with judgment
      campaign.recordOutcome("loss", 50);
      expect(campaign.getStatus()).toBe("lost");
      expect(campaign.getOutcome()).toBe("loss");
      expect(campaign.getJudgmentAmount()).toBe(50);

      // Pay judgment
      campaign.payJudgment(50);
      expect(campaign.getInvoicePayments()).toHaveLength(1);
      expect(campaign.getInvoicePayments()[0].recipient).toBe(SYSTEM_RECIPIENT_COURT);
    });

    it("requires only 1/3 approval for appeal after win with fundraising", () => {
      const clock = new FakeClock(13_000);
      const campaign = new Campaign(
        {
          id: "case-013",
          minRaiseLamports: 100,
          deadlineUnix: 13_100,
          refundWindowStartUnix: 13_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(13_200);
      campaign.evaluate();
      campaign.recordOutcome("win", 100);

      expect(campaign.getStatus()).toBe("won");

      // Single signer can initiate appeal after win
      // Estimated cost 500 exceeds available funds (~135), so fundraising needed
      campaign.approveAppeal(pubkey(attorney), 500, 14_000, "appellate", "appeal");
      
      expect(campaign.getStatus()).toBe("appeal_active");
      expect(campaign.getCurrentRound()).toBe(2);
      expect(campaign.getAppealRounds()).toHaveLength(1);
      expect(campaign.getAppealRounds()[0].roundNumber).toBe(2);
      expect(campaign.getAppealRounds()[0].previousOutcome).toBe("win");
      expect(campaign.getAppealRounds()[0].fundraisingNeeded).toBe(true);
    });

    it("requires 2/3 approval for appeal after loss with fundraising", () => {
      const clock = new FakeClock(14_000);
      const campaign = new Campaign(
        {
          id: "case-014",
          minRaiseLamports: 100,
          deadlineUnix: 14_100,
          refundWindowStartUnix: 14_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(14_200);
      campaign.evaluate();
      campaign.recordOutcome("loss", 50);

      expect(campaign.getStatus()).toBe("lost");

      // First approval
      campaign.approveAppeal(pubkey(attorney), 200, 15_000, "appellate", "appeal");
      expect(campaign.getStatus()).toBe("lost"); // Still lost, need 2

      // Second approval triggers appeal (fundraising needed)
      campaign.approveAppeal(pubkey(platform), 200, 15_000, "appellate", "appeal");
      expect(campaign.getStatus()).toBe("appeal_active");
      expect(campaign.getCurrentRound()).toBe(2);
    });

    it("allows contributions to appeal round when fundraising needed", () => {
      const clock = new FakeClock(15_000);
      const campaign = new Campaign(
        {
          id: "case-015",
          minRaiseLamports: 100,
          deadlineUnix: 15_100,
          refundWindowStartUnix: 15_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(15_200);
      campaign.evaluate();
      campaign.recordOutcome("win");

      // Initiate appeal (1/3 for win) with high estimated cost to trigger fundraising
      campaign.approveAppeal(pubkey(attorney), 500, 16_000, "appellate", "appeal");
      expect(campaign.getStatus()).toBe("appeal_active");

      // Contribute to appeal
      campaign.contributeToAppeal(pubkey(funderB), 200);
      campaign.contributeToAppeal(pubkey(funderA), 200);
      
      expect(campaign.getAppealRounds()[0].totalRaised).toBe(400);
    });

    it("evaluates successful appeal round", () => {
      const clock = new FakeClock(16_000);
      const campaign = new Campaign(
        {
          id: "case-016",
          minRaiseLamports: 100,
          deadlineUnix: 16_100,
          refundWindowStartUnix: 16_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(16_200);
      campaign.evaluate();
      campaign.recordOutcome("win");

      // Initiate and fund appeal (need 500, have ~135)
      campaign.approveAppeal(pubkey(attorney), 500, 17_000, "appellate", "appeal");
      campaign.contributeToAppeal(pubkey(funderB), 400);

      clock.set(17_100);
      campaign.evaluateAppeal();

      expect(campaign.getStatus()).toBe("locked");
      // First round: 150 raised, 10% = 15
      // Appeal round: 400 raised, 10% = 40
      // Total: 15 + 40 = 55
      const firstRoundFee = Math.floor(150 * 0.10);
      const appealRoundFee = Math.floor(400 * 0.10);
      expect(campaign.getDaoFeeAmount()).toBe(firstRoundFee + appealRoundFee);
    });

    it("refunds if appeal round fails to meet goal", () => {
      const clock = new FakeClock(17_000);
      const campaign = new Campaign(
        {
          id: "case-017",
          minRaiseLamports: 100,
          deadlineUnix: 17_100,
          refundWindowStartUnix: 17_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(17_200);
      campaign.evaluate();
      campaign.recordOutcome("win");

      // Initiate appeal but fail to meet goal (need 500, only raise 100)
      campaign.approveAppeal(pubkey(attorney), 500, 18_000, "appellate", "appeal");
      campaign.contributeToAppeal(pubkey(funderB), 100); // Only 100, need 365 more

      clock.set(18_100);
      campaign.evaluateAppeal();

      expect(campaign.getStatus()).toBe("failed_refunding");
      expect(campaign.getRefundReason()).toBe("auto_failed");
    });

    it("skips fundraising when sufficient funds available", () => {
      const clock = new FakeClock(18_500);
      const campaign = new Campaign(
        {
          id: "case-017b",
          minRaiseLamports: 100,
          deadlineUnix: 18_600,
          refundWindowStartUnix: 18_900,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 500);
      clock.set(18_700);
      campaign.evaluate();
      campaign.recordOutcome("win", 200);
      campaign.depositCourtAward(pubkey(attorney), 200);

      // Available: 500 - 50 (fee) + 200 (award) = 650
      // Estimated cost: 100 (less than available)
      campaign.approveAppeal(pubkey(attorney), 100, 19_000, "appellate", "appeal");
      
      // Should skip fundraising and go directly to locked
      expect(campaign.getStatus()).toBe("locked");
      expect(campaign.getAppealRounds()[0].fundraisingNeeded).toBe(false);
      expect(campaign.getAppealRounds()[0].minRaiseLamports).toBe(0);
    });

    it("records settlement outcome", () => {
      const clock = new FakeClock(18_000);
      const campaign = new Campaign(
        {
          id: "case-018",
          minRaiseLamports: 100,
          deadlineUnix: 18_100,
          refundWindowStartUnix: 18_400,
          signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
          daoTreasury: pubkey(daoTreasury)
        },
        clock
      );

      campaign.contribute(pubkey(funderA), 150);
      clock.set(18_200);
      campaign.evaluate();

      campaign.recordOutcome("settlement");
      expect(campaign.getStatus()).toBe("settled");
      expect(campaign.getOutcome()).toBe("settlement");
    });
  });
});
