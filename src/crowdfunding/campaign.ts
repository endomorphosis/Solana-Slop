import { CampaignError } from "./errors.js";
import type {
  CampaignConfig,
  CampaignStatus,
  Clock,
  PublicKeyLike,
  RefundReason
} from "./types.js";

const APPROVAL_THRESHOLD = 2;

export class Campaign {
  private readonly config: CampaignConfig;
  private readonly clock: Clock;
  private status: CampaignStatus = "active";
  private readonly contributions = new Map<PublicKeyLike, number>();
  private readonly refunded = new Set<PublicKeyLike>();
  private readonly approvals = new Set<PublicKeyLike>();
  private refundReason: RefundReason | null = null;
  private refundOpenedAt: number | null = null;

  constructor(config: CampaignConfig, clock: Clock) {
    if (config.signers.length !== 3) {
      throw new CampaignError("Exactly 3 multisig signers are required");
    }
    if (config.minRaiseLamports <= 0) {
      throw new CampaignError("minRaiseLamports must be > 0");
    }
    if (config.deadlineUnix <= 0 || config.refundWindowStartUnix <= 0) {
      throw new CampaignError("Invalid time configuration");
    }
    this.config = config;
    this.clock = clock;
  }

  getStatus(): CampaignStatus {
    return this.status;
  }

  getTotalRaised(): number {
    let total = 0;
    for (const amount of this.contributions.values()) total += amount;
    return total;
  }

  getApprovals(): PublicKeyLike[] {
    return Array.from(this.approvals.values());
  }

  getRefundReason(): RefundReason | null {
    return this.refundReason;
  }

  canRefund(funder: PublicKeyLike): boolean {
    if (this.status !== "failed_refunding" && this.status !== "refunding") return false;
    return this.contributions.has(funder) && !this.refunded.has(funder);
  }

  contribute(funder: PublicKeyLike, lamports: number): void {
    if (this.status !== "active") {
      throw new CampaignError("Campaign is not accepting contributions");
    }
    if (this.clock.now() >= this.config.deadlineUnix) {
      throw new CampaignError("Campaign deadline has passed");
    }
    if (lamports <= 0) {
      throw new CampaignError("Contribution must be > 0");
    }

    const prev = this.contributions.get(funder) ?? 0;
    this.contributions.set(funder, prev + lamports);
  }

  evaluate(): void {
    if (this.status !== "active") return;

    if (this.clock.now() >= this.config.deadlineUnix) {
      if (this.getTotalRaised() < this.config.minRaiseLamports) {
        this.openRefund("auto_failed");
        this.status = "failed_refunding";
        return;
      }
      this.status = "locked";
    }
  }

  approveRefund(approver: PublicKeyLike): void {
    if (this.status !== "locked") {
      throw new CampaignError("Campaign must be locked to approve refunds");
    }
    if (!this.config.signers.includes(approver)) {
      throw new CampaignError("Approver is not a multisig signer");
    }
    if (this.clock.now() < this.config.refundWindowStartUnix) {
      throw new CampaignError("Refund window has not started");
    }
    if (this.getTotalRaised() < this.config.minRaiseLamports) {
      throw new CampaignError("Minimum raise not met");
    }

    this.approvals.add(approver);
    if (this.approvals.size >= APPROVAL_THRESHOLD) {
      this.openRefund("multisig");
      this.status = "refunding";
    }
  }

  claimRefund(funder: PublicKeyLike): number {
    if (!this.canRefund(funder)) {
      throw new CampaignError("Refund not available for this funder");
    }

    const amount = this.contributions.get(funder) ?? 0;
    this.refunded.add(funder);
    return amount;
  }

  private openRefund(reason: RefundReason): void {
    this.refundReason = reason;
    this.refundOpenedAt = this.clock.now();
  }

  getRefundOpenedAt(): number | null {
    return this.refundOpenedAt;
  }
}
