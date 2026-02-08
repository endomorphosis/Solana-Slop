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

  it("auto-refunds when minimum raise is not met by deadline", () => {
    const clock = new FakeClock(1_000);
    const campaign = new Campaign(
      {
        id: "case-001",
        minRaiseLamports: 100,
        deadlineUnix: 1_100,
        refundWindowStartUnix: 1_300,
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)]
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
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)]
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
        signers: [pubkey(attorney), pubkey(platform), pubkey(client)]
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
});
