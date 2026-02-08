import { CampaignError } from "./errors.js";
import type {
  CampaignConfig,
  CampaignStatus,
  Clock,
  PublicKeyLike,
  RefundReason,
  InvoicePayment,
  CampaignOutcome,
  AppealRound
} from "./types.js";

const APPROVAL_THRESHOLD = 2;
const WIN_APPEAL_THRESHOLD = 1; // Only 1 signer needed for win appeal
const LOSS_APPEAL_THRESHOLD = 2; // 2 signers needed for loss appeal
/** Platform fee percentage (10%) deducted from successful campaigns and allocated to DAO treasury */
const DAO_FEE_PERCENT = 0.10;

export class Campaign {
  private readonly config: CampaignConfig;
  private readonly clock: Clock;
  private status: CampaignStatus = "active";
  private readonly contributions = new Map<PublicKeyLike, number>();
  private readonly refunded = new Set<PublicKeyLike>();
  private readonly approvals = new Set<PublicKeyLike>();
  private refundReason: RefundReason | null = null;
  private refundOpenedAt: number | null = null;
  private daoFeeAmount = 0;
  private courtFeesDeposited = 0;
  private readonly invoicePayments: InvoicePayment[] = [];
  private readonly pendingInvoiceApprovals = new Map<string, Set<PublicKeyLike>>();
  private readonly pendingInvoiceDetails = new Map<string, { amount: number; recipient: PublicKeyLike }>();
  private outcome: CampaignOutcome | null = null;
  private readonly appealRounds: AppealRound[] = [];
  private currentRound = 1;
  private readonly appealApprovals = new Set<PublicKeyLike>();
  private judgmentAmount = 0;

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
      // Successful raise: deduct 10% DAO fee
      this.daoFeeAmount = Math.floor(this.getTotalRaised() * DAO_FEE_PERCENT);
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

  getDaoFeeAmount(): number {
    return this.daoFeeAmount;
  }

  getCourtFeesDeposited(): number {
    return this.courtFeesDeposited;
  }

  getInvoicePayments(): InvoicePayment[] {
    return [...this.invoicePayments];
  }

  getAvailableFunds(): number {
    const totalRaised = this.getTotalRaised();
    const totalRefunded = Array.from(this.refunded).reduce(
      (sum, funder) => sum + (this.contributions.get(funder) ?? 0), 
      0
    );
    const totalInvoicePayments = this.invoicePayments.reduce(
      (sum, payment) => sum + payment.amount, 
      0
    );
    return totalRaised - this.daoFeeAmount - totalRefunded + this.courtFeesDeposited - totalInvoicePayments;
  }

  depositCourtFees(depositor: PublicKeyLike, amount: number): void {
    if (this.status !== "locked") {
      throw new CampaignError("Can only deposit court fees to locked campaigns");
    }
    // Only attorney (first signer) can deposit court fees
    if (depositor !== this.config.signers[0]) {
      throw new CampaignError("Only attorney can deposit court fees");
    }
    if (amount <= 0) {
      throw new CampaignError("Court fee amount must be > 0");
    }
    this.courtFeesDeposited += amount;
  }

  approveInvoicePayment(approver: PublicKeyLike, invoiceId: string, amount: number, recipient: PublicKeyLike): void {
    if (this.status !== "locked") {
      throw new CampaignError("Can only approve invoice payments for locked campaigns");
    }
    if (!this.config.signers.includes(approver)) {
      throw new CampaignError("Approver is not a multisig signer");
    }
    if (amount <= 0) {
      throw new CampaignError("Invoice amount must be > 0");
    }

    // Check if this invoice already has approvals and validate consistency
    const existingDetails = this.pendingInvoiceDetails.get(invoiceId);
    if (existingDetails) {
      // Ensure amount and recipient are consistent with first approval
      if (existingDetails.amount !== amount || existingDetails.recipient !== recipient) {
        throw new CampaignError("Invoice amount and recipient must match existing approvals");
      }
    } else {
      // First approval - check available funds and store details
      if (this.getAvailableFunds() < amount) {
        throw new CampaignError("Insufficient funds for invoice payment");
      }
      this.pendingInvoiceDetails.set(invoiceId, { amount, recipient });
    }

    if (!this.pendingInvoiceApprovals.has(invoiceId)) {
      this.pendingInvoiceApprovals.set(invoiceId, new Set());
    }
    const approvals = this.pendingInvoiceApprovals.get(invoiceId)!;
    
    // Prevent double approval by same signer
    if (approvals.has(approver)) {
      throw new CampaignError("Approver has already approved this invoice");
    }
    
    approvals.add(approver);

    if (approvals.size >= APPROVAL_THRESHOLD) {
      // Double-check funds are still available before payment
      if (this.getAvailableFunds() < amount) {
        throw new CampaignError("Insufficient funds for invoice payment");
      }
      
      this.invoicePayments.push({
        invoiceId,
        amount,
        recipient,
        approvers: Array.from(approvals)
      });
      this.pendingInvoiceApprovals.delete(invoiceId);
      this.pendingInvoiceDetails.delete(invoiceId);
    }
  }

  getInvoiceApprovals(invoiceId: string): PublicKeyLike[] {
    return Array.from(this.pendingInvoiceApprovals.get(invoiceId) ?? []);
  }

  getOutcome(): CampaignOutcome | null {
    return this.outcome;
  }

  getCurrentRound(): number {
    return this.currentRound;
  }

  getAppealRounds(): AppealRound[] {
    return [...this.appealRounds];
  }

  getAppealApprovals(): PublicKeyLike[] {
    return Array.from(this.appealApprovals);
  }

  getJudgmentAmount(): number {
    return this.judgmentAmount;
  }

  /**
   * Record the outcome of the case (settlement, win, or loss)
   */
  recordOutcome(outcome: CampaignOutcome, judgmentAmount?: number): void {
    if (this.status !== "locked") {
      throw new CampaignError("Can only record outcome for locked campaigns");
    }
    
    this.outcome = outcome;
    
    if (outcome === "settlement") {
      this.status = "settled";
    } else if (outcome === "win") {
      this.status = "won";
      if (judgmentAmount !== undefined && judgmentAmount > 0) {
        this.judgmentAmount = judgmentAmount;
      }
    } else if (outcome === "loss") {
      this.status = "lost";
      if (judgmentAmount !== undefined && judgmentAmount > 0) {
        this.judgmentAmount = judgmentAmount;
      }
    }
  }

  /**
   * Deposit court-awarded funds after a win
   */
  depositCourtAward(depositor: PublicKeyLike, amount: number): void {
    if (this.status !== "won") {
      throw new CampaignError("Can only deposit court awards after a win");
    }
    // Only attorney (first signer) can deposit court awards
    if (depositor !== this.config.signers[0]) {
      throw new CampaignError("Only attorney can deposit court awards");
    }
    if (amount <= 0) {
      throw new CampaignError("Court award amount must be > 0");
    }
    this.courtFeesDeposited += amount;
  }

  /**
   * Pay judgment amount after a loss
   */
  payJudgment(amount: number): void {
    if (this.status !== "lost") {
      throw new CampaignError("Can only pay judgment after a loss");
    }
    if (amount <= 0) {
      throw new CampaignError("Judgment payment amount must be > 0");
    }
    if (this.getAvailableFunds() < amount) {
      throw new CampaignError("Insufficient funds to pay judgment");
    }
    
    // Record as a special invoice payment
    this.invoicePayments.push({
      invoiceId: `JUDGMENT-${this.clock.now()}`,
      amount,
      recipient: "court",
      approvers: [] // System payment
    });
  }

  /**
   * Approve an appeal (different thresholds for win vs loss)
   * Win appeal: requires 1/3 approval
   * Loss appeal: requires 2/3 approval
   */
  approveAppeal(approver: PublicKeyLike, minRaiseLamports: number, deadlineUnix: number): void {
    if (this.status !== "won" && this.status !== "lost") {
      throw new CampaignError("Can only approve appeal after win or loss");
    }
    if (!this.config.signers.includes(approver)) {
      throw new CampaignError("Approver is not a multisig signer");
    }
    if (minRaiseLamports <= 0) {
      throw new CampaignError("Appeal raise target must be > 0");
    }
    if (deadlineUnix <= this.clock.now()) {
      throw new CampaignError("Appeal deadline must be in the future");
    }

    this.appealApprovals.add(approver);

    const requiredApprovals = this.status === "won" ? WIN_APPEAL_THRESHOLD : LOSS_APPEAL_THRESHOLD;
    
    if (this.appealApprovals.size >= requiredApprovals) {
      // Initialize appeal round
      this.appealRounds.push({
        roundNumber: this.currentRound + 1,
        minRaiseLamports,
        deadlineUnix,
        totalRaised: 0,
        previousOutcome: this.outcome!
      });
      this.currentRound++;
      this.status = "appeal_active";
      this.appealApprovals.clear();
    }
  }

  /**
   * Contribute to current appeal round
   */
  contributeToAppeal(funder: PublicKeyLike, lamports: number): void {
    if (this.status !== "appeal_active") {
      throw new CampaignError("Campaign is not accepting appeal contributions");
    }
    
    const currentAppealRound = this.appealRounds[this.appealRounds.length - 1];
    if (!currentAppealRound) {
      throw new CampaignError("No active appeal round");
    }
    
    if (this.clock.now() >= currentAppealRound.deadlineUnix) {
      throw new CampaignError("Appeal deadline has passed");
    }
    if (lamports <= 0) {
      throw new CampaignError("Contribution must be > 0");
    }

    const prev = this.contributions.get(funder) ?? 0;
    this.contributions.set(funder, prev + lamports);
    currentAppealRound.totalRaised += lamports;
  }

  /**
   * Evaluate appeal round
   */
  evaluateAppeal(): void {
    if (this.status !== "appeal_active") return;

    const currentAppealRound = this.appealRounds[this.appealRounds.length - 1];
    if (!currentAppealRound) return;

    if (this.clock.now() >= currentAppealRound.deadlineUnix) {
      if (currentAppealRound.totalRaised < currentAppealRound.minRaiseLamports) {
        // Appeal funding failed
        this.openRefund("auto_failed");
        this.status = "failed_refunding";
        return;
      }
      // Appeal funding succeeded
      this.daoFeeAmount += Math.floor(currentAppealRound.totalRaised * DAO_FEE_PERCENT);
      this.status = "locked";
    }
  }
}
