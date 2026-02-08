import { describe, expect, it } from "vitest";
import { Campaign } from "../../src/crowdfunding/campaign.js";
import { makeKeypair, pubkey } from "../helpers/participants.js";

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
});
