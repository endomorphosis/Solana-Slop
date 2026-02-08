# API Reference Guide

## Introduction

This document provides a complete API reference for the `Campaign` class, the core component of the Solana-Slop crowdfunding platform. The API is designed to model real-world legal campaign processes with clear methods for contributions, approvals, outcomes, and multi-round appeals.

## Campaign Class

**Source**: [`src/crowdfunding/campaign.ts:22`](../src/crowdfunding/campaign.ts#L22)

### Constructor

```typescript
constructor(config: CampaignConfig, clock: Clock)
```

Creates a new campaign instance with the specified configuration.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `CampaignConfig` | Campaign configuration (see below) |
| `clock` | `Clock` | Time provider for deterministic testing |

**Configuration Object** (`CampaignConfig`):

**Source**: [`src/crowdfunding/types.ts:10-18`](../src/crowdfunding/types.ts#L10-L18)

```typescript
interface CampaignConfig {
  id: string;                      // Unique campaign identifier
  minRaiseLamports: number;        // Minimum funding goal (must be > 0)
  deadlineUnix: number;            // Initial fundraising deadline
  refundWindowStartUnix: number;   // When multisig refunds become possible
  signers: PublicKeyLike[];        // Exactly 3 multisig signers (attorney, platform, client)
  daoTreasury: PublicKeyLike;      // DAO treasury wallet for 10% platform fee
}
```

**Throws**:
- `CampaignError`: If signers.length !== 3
- `CampaignError`: If minRaiseLamports <= 0
- `CampaignError`: If invalid time configuration

**Example**:

```typescript
const campaign = new Campaign(
  {
    id: "case-001",
    minRaiseLamports: 100_000,
    deadlineUnix: Date.now() / 1000 + 30 * 24 * 60 * 60, // 30 days
    refundWindowStartUnix: Date.now() / 1000 + 60 * 24 * 60 * 60, // 60 days
    signers: [attorney, platform, client],
    daoTreasury: daoWallet
  },
  clock
);
```

**Source**: [`src/crowdfunding/campaign.ts:45-57`](../src/crowdfunding/campaign.ts#L45-L57)

---

## State Management Methods

### getStatus()

```typescript
getStatus(): CampaignStatus
```

Returns the current campaign status.

**Returns**: One of:
- `"active"`: Accepting initial contributions
- `"locked"`: Funds locked, awaiting outcome
- `"failed_refunding"`: Auto-refund (goal not met)
- `"refunding"`: Multisig-approved refund
- `"settled"`: Case settled
- `"won"`: Case won
- `"lost"`: Case lost
- `"appeal_active"`: Appeal fundraising active

**Source**: [`src/crowdfunding/campaign.ts:59-61`](../src/crowdfunding/campaign.ts#L59-L61), [`src/crowdfunding/types.ts:20`](../src/crowdfunding/types.ts#L20)

**Example**:

```typescript
if (campaign.getStatus() === "active") {
  campaign.contribute(funder, 10_000);
}
```

---

### evaluate()

```typescript
evaluate(): void
```

Evaluates the campaign after the deadline has passed. Transitions from `active` to either `locked` (success) or `failed_refunding` (failure).

**Behavior**:
- If deadline not reached: No action
- If minimum raise not met: Opens auto-refund, sets status to `failed_refunding`
- If minimum raise met: Deducts 10% DAO fee, sets status to `locked`

**Side Effects**:
- May change status
- May set DAO fee amount
- May open refund window

**Source**: [`src/crowdfunding/campaign.ts:104-117`](../src/crowdfunding/campaign.ts#L104-L117)

**Example**:

```typescript
// After deadline passes
campaign.evaluate();
if (campaign.getStatus() === "locked") {
  console.log("Campaign funded successfully!");
  console.log("DAO fee:", campaign.getDaoFeeAmount());
}
```

---

### recordOutcome()

```typescript
recordOutcome(outcome: CampaignOutcome, judgmentAmount?: number): void
```

Records the outcome of a trial or appeal.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `outcome` | `"settlement" \| "win" \| "loss"` | Case outcome |
| `judgmentAmount` | `number` (optional) | Judgment amount in lamports (defaults to 0) |

**Preconditions**:
- Status must be `locked`

**Side Effects**:
- Sets outcome
- Sets judgment amount (always, defaults to 0)
- Changes status to `settled`, `won`, or `lost`

**Throws**:
- `CampaignError`: If status is not `locked`

**Source**: [`src/crowdfunding/campaign.ts:281-299`](../src/crowdfunding/campaign.ts#L281-L299)

**Example**:

```typescript
// Record a win with no monetary award
campaign.recordOutcome("win");

// Record a loss with judgment
campaign.recordOutcome("loss", 50_000);

// Record a settlement
campaign.recordOutcome("settlement");
```

---

## Financial Query Methods

### getTotalRaised()

```typescript
getTotalRaised(): number
```

Returns the total amount raised across all rounds (initial + all appeal rounds).

**Returns**: Total lamports raised

**Source**: [`src/crowdfunding/campaign.ts:63-74`](../src/crowdfunding/campaign.ts#L63-L74)

**Example**:

```typescript
const total = campaign.getTotalRaised();
console.log(`Total raised: ${total} lamports`);
```

---

### getAvailableFunds()

```typescript
getAvailableFunds(): number
```

Returns currently available funds for operations.

**Calculation**:
```
availableFunds = totalRaised 
                - daoFees 
                - refundedAmount 
                + courtDeposits 
                - invoicePayments
```

**Returns**: Available lamports

**Source**: [`src/crowdfunding/campaign.ts:171-182`](../src/crowdfunding/campaign.ts#L171-L182)

**Example**:

```typescript
const available = campaign.getAvailableFunds();
if (available >= invoiceAmount) {
  campaign.approveInvoicePayment(signer, invoiceId, invoiceAmount, recipient);
}
```

---

### getDaoFeeAmount()

```typescript
getDaoFeeAmount(): number
```

Returns the total DAO treasury fees collected (10% per successful round).

**Returns**: Total DAO fees in lamports

**Source**: [`src/crowdfunding/campaign.ts:159-161`](../src/crowdfunding/campaign.ts#L159-L161)

**Example**:

```typescript
const daoFee = campaign.getDaoFeeAmount();
console.log(`Platform fee: ${daoFee} lamports (${daoFee / campaign.getTotalRaised() * 100}%)`);
```

---

### getCourtFeesDeposited()

```typescript
getCourtFeesDeposited(): number
```

Returns the total court fees/awards deposited by attorney.

**Returns**: Total deposits in lamports

**Source**: [`src/crowdfunding/campaign.ts:163-165`](../src/crowdfunding/campaign.ts#L163-L165)

**Example**:

```typescript
const deposited = campaign.getCourtFeesDeposited();
console.log(`Court awards deposited: ${deposited} lamports`);
```

---

### getJudgmentAmount()

```typescript
getJudgmentAmount(): number
```

Returns the judgment amount from the most recent loss outcome.

**Returns**: Judgment amount in lamports (0 if no judgment)

**Source**: [`src/crowdfunding/campaign.ts:273-275`](../src/crowdfunding/campaign.ts#L273-L275)

**Example**:

```typescript
if (campaign.getStatus() === "lost") {
  const judgment = campaign.getJudgmentAmount();
  console.log(`Must pay judgment: ${judgment} lamports`);
}
```

---

## Contribution Methods

### contribute()

```typescript
contribute(funder: PublicKeyLike, lamports: number): void
```

Records a contribution to the initial campaign round.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `funder` | `PublicKeyLike` (string) | Contributor's wallet address |
| `lamports` | `number` | Contribution amount (must be > 0) |

**Preconditions**:
- Status must be `active`
- Current time < deadline
- Amount must be > 0

**Side Effects**:
- Adds to funder's total contribution

**Throws**:
- `CampaignError`: If status is not `active`
- `CampaignError`: If deadline has passed
- `CampaignError`: If lamports <= 0

**Source**: [`src/crowdfunding/campaign.ts:89-102`](../src/crowdfunding/campaign.ts#L89-L102)

**Example**:

```typescript
// Single contribution
campaign.contribute("funder123", 50_000);

// Multiple contributions from same funder accumulate
campaign.contribute("funder123", 25_000); // Total: 75,000
```

---

### contributeToAppeal()

```typescript
contributeToAppeal(funder: PublicKeyLike, lamports: number): void
```

Records a contribution to the current appeal round. Contributions are tracked separately per round to enable proper per-round refunds.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `funder` | `PublicKeyLike` (string) | Contributor's wallet address |
| `lamports` | `number` | Contribution amount (must be > 0) |

**Preconditions**:
- Status must be `appeal_active`
- Current time < appeal deadline
- Amount must be > 0

**Side Effects**:
- Adds to funder's appeal round contribution
- Increases appeal round totalRaised

**Throws**:
- `CampaignError`: If status is not `appeal_active`
- `CampaignError`: If no active appeal round
- `CampaignError`: If appeal deadline has passed
- `CampaignError`: If lamports <= 0

**Source**: [`src/crowdfunding/campaign.ts:434-461`](../src/crowdfunding/campaign.ts#L434-L461)

**Example**:

```typescript
// Contribute to current appeal round
if (campaign.getStatus() === "appeal_active") {
  campaign.contributeToAppeal("funder456", 30_000);
}
```

---

## Refund Methods

### canRefund()

```typescript
canRefund(funder: PublicKeyLike): boolean
```

Checks if a funder can claim a refund.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `funder` | `PublicKeyLike` (string) | Funder's wallet address |

**Returns**: `true` if refund available, `false` otherwise

**Conditions for refund**:
- Status is `failed_refunding` or `refunding`
- Funder has contributions
- Funder has not already claimed refund

**Source**: [`src/crowdfunding/campaign.ts:84-87`](../src/crowdfunding/campaign.ts#L84-L87)

**Example**:

```typescript
if (campaign.canRefund("funder123")) {
  const amount = campaign.claimRefund("funder123");
  console.log(`Refunded: ${amount} lamports`);
}
```

---

### claimRefund()

```typescript
claimRefund(funder: PublicKeyLike): number
```

Claims a refund for a funder.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `funder` | `PublicKeyLike` (string) | Funder's wallet address |

**Returns**: Refund amount in lamports

**Side Effects**:
- Marks funder as refunded (prevents double-refund)

**Throws**:
- `CampaignError`: If refund not available for this funder

**Source**: [`src/crowdfunding/campaign.ts:140-148`](../src/crowdfunding/campaign.ts#L140-L148)

**Example**:

```typescript
try {
  const refundAmount = campaign.claimRefund("funder123");
  // Transfer refundAmount to funder
  console.log(`Refunded ${refundAmount} lamports to funder123`);
} catch (error) {
  console.error("Refund failed:", error.message);
}
```

---

### getRefundReason()

```typescript
getRefundReason(): RefundReason | null
```

Returns the reason for the refund.

**Returns**: 
- `"auto_failed"`: Automatic refund due to failed minimum raise or appeal
- `"multisig"`: Multisig-approved refund
- `null`: No refund active

**Source**: [`src/crowdfunding/campaign.ts:80-82`](../src/crowdfunding/campaign.ts#L80-L82)

**Example**:

```typescript
const reason = campaign.getRefundReason();
if (reason === "auto_failed") {
  console.log("Campaign failed to meet minimum raise");
} else if (reason === "multisig") {
  console.log("Multisig signers approved refund");
}
```

---

### getRefundOpenedAt()

```typescript
getRefundOpenedAt(): number | null
```

Returns the Unix timestamp when refund was opened.

**Returns**: Unix timestamp or `null` if no refund

**Source**: [`src/crowdfunding/campaign.ts:155-157`](../src/crowdfunding/campaign.ts#L155-L157)

---

## Approval Methods

### approveRefund()

```typescript
approveRefund(approver: PublicKeyLike): void
```

Approves a multisig refund. Requires 2 of 3 signers.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `approver` | `PublicKeyLike` (string) | Approver's wallet address |

**Preconditions**:
- Status must be `locked`
- Approver must be one of the 3 signers
- Current time >= refundWindowStartUnix
- Minimum raise was met

**Side Effects**:
- Adds approver to approvals
- If 2 approvals reached: Opens refund, changes status to `refunding`

**Throws**:
- `CampaignError`: If status is not `locked`
- `CampaignError`: If approver is not a signer
- `CampaignError`: If refund window has not started
- `CampaignError`: If minimum raise was not met

**Source**: [`src/crowdfunding/campaign.ts:119-138`](../src/crowdfunding/campaign.ts#L119-L138)

**Example**:

```typescript
// First approval
campaign.approveRefund(attorney);
console.log("Approvals:", campaign.getApprovals().length); // 1

// Second approval triggers refund
campaign.approveRefund(platform);
console.log("Status:", campaign.getStatus()); // "refunding"
```

---

### getApprovals()

```typescript
getApprovals(): PublicKeyLike[]
```

Returns the list of signers who approved the current refund.

**Returns**: Array of wallet addresses

**Source**: [`src/crowdfunding/campaign.ts:76-78`](../src/crowdfunding/campaign.ts#L76-L78)

---

### approveInvoicePayment()

```typescript
approveInvoicePayment(
  approver: PublicKeyLike, 
  invoiceId: string, 
  amount: number, 
  recipient: PublicKeyLike
): void
```

Approves an invoice payment. Requires 2 of 3 signers. Enforces parameter consistency across approvals.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `approver` | `PublicKeyLike` (string) | Approver's wallet address |
| `invoiceId` | `string` | Unique invoice identifier |
| `amount` | `number` | Invoice amount in lamports (must be > 0) |
| `recipient` | `PublicKeyLike` (string) | Payment recipient address |

**Preconditions**:
- Status must be `locked`
- Approver must be one of the 3 signers
- Amount must be > 0
- Available funds >= amount (checked on first approval)
- Amount and recipient must match existing approvals (parameter consistency)

**Side Effects**:
- Adds approver to invoice approvals
- If 2 approvals reached: Executes payment, removes from pending

**Throws**:
- `CampaignError`: If status is not `locked`
- `CampaignError`: If approver is not a signer
- `CampaignError`: If amount <= 0
- `CampaignError`: If insufficient funds
- `CampaignError`: If amount/recipient mismatch with existing approvals
- `CampaignError`: If approver already approved this invoice

**Source**: [`src/crowdfunding/campaign.ts:198-251`](../src/crowdfunding/campaign.ts#L198-L251)

**Example**:

```typescript
const invoiceId = "INV-001";
const invoiceAmount = 25_000;
const attorneyWallet = "attorney123";

// First approval
campaign.approveInvoicePayment(
  attorney, 
  invoiceId, 
  invoiceAmount, 
  attorneyWallet
);

// Second approval must match parameters
campaign.approveInvoicePayment(
  platform,
  invoiceId,
  invoiceAmount, // Must match first approval
  attorneyWallet // Must match first approval
);

// Payment is now executed
const payments = campaign.getInvoicePayments();
console.log("Payment executed:", payments[payments.length - 1]);
```

---

### getInvoiceApprovals()

```typescript
getInvoiceApprovals(invoiceId: string): PublicKeyLike[]
```

Returns the list of signers who approved a specific invoice.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `invoiceId` | `string` | Invoice identifier |

**Returns**: Array of wallet addresses (empty if not found or already executed)

**Source**: [`src/crowdfunding/campaign.ts:253-255`](../src/crowdfunding/campaign.ts#L253-L255)

---

### approveAppeal()

```typescript
approveAppeal(
  approver: PublicKeyLike, 
  estimatedCost: number, 
  deadlineUnix: number,
  courtLevel?: CourtLevel,
  path?: LitigationPath
): void
```

Approves an appeal with conditional fundraising. Requires 1 of 3 signers for win appeals, 2 of 3 for loss appeals. Enforces parameter consistency across approvals.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `approver` | `PublicKeyLike` (string) | Approver's wallet address |
| `estimatedCost` | `number` | Estimated appeal cost in lamports (must be > 0) |
| `deadlineUnix` | `number` | Appeal fundraising deadline |
| `courtLevel` | `"district" \| "appellate" \| "state_supreme" \| "us_supreme"` | Court level (default: "appellate") |
| `path` | `"appeal" \| "remand" \| "retrial" \| "final"` | Litigation path (default: "appeal") |

**Preconditions**:
- Status must be `won` or `lost`
- Approver must be one of the 3 signers
- Estimated cost must be > 0
- Deadline must be in the future
- Parameters must match first approval (if not first)

**Approval Thresholds**:
- **Win appeal**: 1 of 3 signers (lower risk)
- **Loss appeal**: 2 of 3 signers (higher risk)

**Conditional Fundraising**:
- Checks available funds
- If sufficient: Sets status to `locked` immediately
- If insufficient: Sets status to `appeal_active`, initiates fundraising for the difference

**Side Effects**:
- Adds approver to appeal approvals
- If threshold reached: Creates appeal round, may change status
- Clears appeal approvals after processing

**Throws**:
- `CampaignError`: If status is not `won` or `lost`
- `CampaignError`: If approver is not a signer
- `CampaignError`: If estimated cost <= 0
- `CampaignError`: If deadline is not in the future
- `CampaignError`: If parameters don't match first approval
- `CampaignError`: If approver already approved this appeal

**Source**: [`src/crowdfunding/campaign.ts:348-428`](../src/crowdfunding/campaign.ts#L348-L428)

**Example**:

```typescript
// Win appeal: only 1 approval needed
if (campaign.getStatus() === "won") {
  campaign.approveAppeal(
    attorney,
    80_000,
    Date.now() / 1000 + 60 * 24 * 60 * 60, // 60 days
    "appellate",
    "appeal"
  );
  // If sufficient funds: status is now "locked"
  // If insufficient funds: status is "appeal_active"
}

// Loss appeal: 2 approvals needed
if (campaign.getStatus() === "lost") {
  campaign.approveAppeal(attorney, 80_000, deadline, "appellate", "appeal");
  console.log("Approvals:", campaign.getAppealApprovals().length); // 1
  
  campaign.approveAppeal(platform, 80_000, deadline, "appellate", "appeal");
  // Status now changes based on available funds
}
```

---

### evaluateAppeal()

```typescript
evaluateAppeal(): void
```

Evaluates the current appeal round after deadline. Transitions from `appeal_active` to either `locked` (success) or `failed_refunding` (failure).

**Behavior**:
- If deadline not reached: No action
- If minimum raise not met: Opens auto-refund, sets status to `failed_refunding`
- If minimum raise met: Deducts 10% DAO fee, sets status to `locked`

**Side Effects**:
- May change status
- May increase DAO fee amount
- May open refund window

**Source**: [`src/crowdfunding/campaign.ts:466-483`](../src/crowdfunding/campaign.ts#L466-L483)

**Example**:

```typescript
// After appeal deadline passes
campaign.evaluateAppeal();
if (campaign.getStatus() === "locked") {
  console.log("Appeal funded successfully!");
} else if (campaign.getStatus() === "failed_refunding") {
  console.log("Appeal funding failed, refunds available");
}
```

---

### getAppealApprovals()

```typescript
getAppealApprovals(): PublicKeyLike[]
```

Returns the list of signers who approved the current appeal.

**Returns**: Array of wallet addresses

**Source**: [`src/crowdfunding/campaign.ts:269-271`](../src/crowdfunding/campaign.ts#L269-L271)

---

## Court Operations

### depositCourtFees()

```typescript
depositCourtFees(depositor: PublicKeyLike, amount: number): void
```

Deposits court fees into the campaign. Only the attorney (first signer) can deposit.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositor` | `PublicKeyLike` (string) | Depositor's wallet address |
| `amount` | `number` | Deposit amount in lamports (must be > 0) |

**Preconditions**:
- Status must be `locked`
- Depositor must be attorney (first signer)
- Amount must be > 0

**Side Effects**:
- Increases courtFeesDeposited
- Increases available funds

**Throws**:
- `CampaignError`: If status is not `locked`
- `CampaignError`: If depositor is not attorney
- `CampaignError`: If amount <= 0

**Source**: [`src/crowdfunding/campaign.ts:184-196`](../src/crowdfunding/campaign.ts#L184-L196)

**Example**:

```typescript
// Attorney deposits court-ordered fees
campaign.depositCourtFees(attorney, 15_000);
console.log("Available funds:", campaign.getAvailableFunds());
```

---

### depositCourtAward()

```typescript
depositCourtAward(depositor: PublicKeyLike, amount: number): void
```

Deposits court-awarded funds after a win. Only the attorney (first signer) can deposit.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositor` | `PublicKeyLike` (string) | Depositor's wallet address |
| `amount` | `number` | Award amount in lamports (must be > 0) |

**Preconditions**:
- Status must be `won`
- Depositor must be attorney (first signer)
- Amount must be > 0

**Side Effects**:
- Increases courtFeesDeposited
- Increases available funds

**Throws**:
- `CampaignError`: If status is not `won`
- `CampaignError`: If depositor is not attorney
- `CampaignError`: If amount <= 0

**Source**: [`src/crowdfunding/campaign.ts:304-316`](../src/crowdfunding/campaign.ts#L304-L316)

**Example**:

```typescript
// Attorney deposits court award after win
if (campaign.getStatus() === "won") {
  campaign.depositCourtAward(attorney, 100_000);
  console.log("Award deposited, available funds:", campaign.getAvailableFunds());
}
```

---

### payJudgment()

```typescript
payJudgment(amount: number): void
```

Pays a judgment amount after a loss. Automatically deducted from available funds.

**Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `amount` | `number` | Judgment amount in lamports (must be > 0) |

**Preconditions**:
- Status must be `lost`
- Amount must be > 0
- Available funds >= amount

**Side Effects**:
- Records special invoice payment to SYSTEM_RECIPIENT_COURT
- Decreases available funds

**Throws**:
- `CampaignError`: If status is not `lost`
- `CampaignError`: If amount <= 0
- `CampaignError`: If insufficient funds to pay judgment

**Source**: [`src/crowdfunding/campaign.ts:321-339`](../src/crowdfunding/campaign.ts#L321-L339)

**Example**:

```typescript
if (campaign.getStatus() === "lost") {
  const judgment = campaign.getJudgmentAmount();
  if (campaign.getAvailableFunds() >= judgment) {
    campaign.payJudgment(judgment);
    console.log("Judgment paid");
  }
}
```

---

## Query Methods

### getOutcome()

```typescript
getOutcome(): CampaignOutcome | null
```

Returns the most recent case outcome.

**Returns**: 
- `"settlement"`: Case settled
- `"win"`: Case won
- `"loss"`: Case lost
- `null`: No outcome recorded yet

**Source**: [`src/crowdfunding/campaign.ts:257-259`](../src/crowdfunding/campaign.ts#L257-L259)

**Example**:

```typescript
const outcome = campaign.getOutcome();
if (outcome === "win") {
  console.log("Victory!");
} else if (outcome === "loss") {
  console.log("Defeat, but we can appeal");
}
```

---

### getCurrentRound()

```typescript
getCurrentRound(): number
```

Returns the current round number (1 for initial, 2+ for appeals).

**Returns**: Round number

**Source**: [`src/crowdfunding/campaign.ts:261-263`](../src/crowdfunding/campaign.ts#L261-L263)

**Example**:

```typescript
const round = campaign.getCurrentRound();
console.log(`Currently in round ${round}`);
```

---

### getAppealRounds()

```typescript
getAppealRounds(): AppealRound[]
```

Returns all appeal rounds (excludes initial round).

**Returns**: Array of `AppealRound` objects

**AppealRound Structure**:

```typescript
interface AppealRound {
  roundNumber: number;              // Round number (2+)
  courtLevel: CourtLevel;           // Court level for this round
  path: LitigationPath;             // Litigation path taken
  minRaiseLamports: number;         // Minimum raise target
  deadlineUnix: number;             // Fundraising deadline
  totalRaised: number;              // Total raised in this round
  previousOutcome?: CampaignOutcome; // Previous round outcome
  fundraisingNeeded: boolean;       // Whether fundraising was needed
}
```

**Source**: [`src/crowdfunding/campaign.ts:265-267`](../src/crowdfunding/campaign.ts#L265-L267), [`src/crowdfunding/types.ts:34-51`](../src/crowdfunding/types.ts#L34-L51)

**Example**:

```typescript
const appeals = campaign.getAppealRounds();
appeals.forEach(round => {
  console.log(`Round ${round.roundNumber}: ${round.courtLevel}`);
  console.log(`  Raised: ${round.totalRaised} (goal: ${round.minRaiseLamports})`);
  console.log(`  Fundraising needed: ${round.fundraisingNeeded}`);
});
```

---

### getInvoicePayments()

```typescript
getInvoicePayments(): InvoicePayment[]
```

Returns all executed invoice payments.

**Returns**: Array of `InvoicePayment` objects

**InvoicePayment Structure**:

```typescript
interface InvoicePayment {
  invoiceId: string;              // Unique invoice identifier
  amount: number;                 // Payment amount in lamports
  recipient: PublicKeyLike;       // Recipient wallet address
  approvers: PublicKeyLike[];     // Signers who approved (2 or empty for system)
}
```

**Source**: [`src/crowdfunding/campaign.ts:167-169`](../src/crowdfunding/campaign.ts#L167-L169), [`src/crowdfunding/types.ts:57-66`](../src/crowdfunding/types.ts#L57-L66)

**Example**:

```typescript
const payments = campaign.getInvoicePayments();
const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
console.log(`Total invoice payments: ${totalPaid} lamports`);

payments.forEach(payment => {
  if (payment.recipient === SYSTEM_RECIPIENT_COURT) {
    console.log(`Judgment payment: ${payment.amount}`);
  } else {
    console.log(`Invoice ${payment.invoiceId}: ${payment.amount} to ${payment.recipient}`);
  }
});
```

---

## Type Definitions

### PublicKeyLike

```typescript
type PublicKeyLike = string;
```

Wallet address identifier. Uses string type for blockchain-agnostic implementation.

**Source**: [`src/crowdfunding/types.ts:1`](../src/crowdfunding/types.ts#L1)

---

### Clock

```typescript
interface Clock {
  now(): number;
}
```

Time provider interface for deterministic testing. Returns Unix timestamp.

**Source**: [`src/crowdfunding/types.ts:6-8`](../src/crowdfunding/types.ts#L6-L8)

**Example Implementation**:

```typescript
class SystemClock implements Clock {
  now(): number {
    return Math.floor(Date.now() / 1000);
  }
}

class FakeClock implements Clock {
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
```

---

### CampaignStatus

```typescript
type CampaignStatus = 
  | "active" 
  | "locked" 
  | "failed_refunding" 
  | "refunding" 
  | "settled" 
  | "won" 
  | "lost" 
  | "appeal_active";
```

**Source**: [`src/crowdfunding/types.ts:20`](../src/crowdfunding/types.ts#L20)

---

### CampaignOutcome

```typescript
type CampaignOutcome = "settlement" | "win" | "loss";
```

**Source**: [`src/crowdfunding/types.ts:25`](../src/crowdfunding/types.ts#L25)

---

### CourtLevel

```typescript
type CourtLevel = "district" | "appellate" | "state_supreme" | "us_supreme";
```

**Source**: [`src/crowdfunding/types.ts:28`](../src/crowdfunding/types.ts#L28)

---

### LitigationPath

```typescript
type LitigationPath = "appeal" | "remand" | "retrial" | "final";
```

**Source**: [`src/crowdfunding/types.ts:31`](../src/crowdfunding/types.ts#L31)

---

### RefundReason

```typescript
type RefundReason = "auto_failed" | "multisig";
```

**Source**: [`src/crowdfunding/types.ts:22`](../src/crowdfunding/types.ts#L22)

---

## Constants

### SYSTEM_RECIPIENT_COURT

```typescript
const SYSTEM_RECIPIENT_COURT = "court" as const;
```

Special recipient identifier for system payments (judgment payments).

**Source**: [`src/crowdfunding/types.ts:4`](../src/crowdfunding/types.ts#L4)

---

## Error Handling

All methods throw `CampaignError` for invalid operations.

**Source**: [`src/crowdfunding/errors.ts`](../src/crowdfunding/errors.ts)

```typescript
try {
  campaign.contribute("funder", 100);
} catch (error) {
  if (error instanceof CampaignError) {
    console.error("Campaign error:", error.message);
  }
}
```

---

## Complete Usage Example

```typescript
import { Campaign } from "./crowdfunding/campaign.js";
import { SYSTEM_RECIPIENT_COURT } from "./crowdfunding/types.js";

// Create clock
const clock = {
  now: () => Math.floor(Date.now() / 1000)
};

// Create campaign
const campaign = new Campaign(
  {
    id: "case-civil-001",
    minRaiseLamports: 100_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoWallet
  },
  clock
);

// Accept contributions
campaign.contribute("funder1", 60_000);
campaign.contribute("funder2", 50_000);

// After deadline, evaluate
campaign.evaluate();
console.log("Status:", campaign.getStatus()); // "locked"
console.log("DAO fee:", campaign.getDaoFeeAmount()); // 11,000 (10%)
console.log("Available:", campaign.getAvailableFunds()); // 99,000

// Pay attorney invoice
campaign.approveInvoicePayment(attorney, "INV-001", 25_000, attorney);
campaign.approveInvoicePayment(platform, "INV-001", 25_000, attorney);
console.log("Available:", campaign.getAvailableFunds()); // 74,000

// Record loss with judgment
campaign.recordOutcome("loss", 30_000);
campaign.payJudgment(30_000);
console.log("Available:", campaign.getAvailableFunds()); // 44,000

// Appeal (requires 2/3 for loss)
campaign.approveAppeal(attorney, 50_000, clock.now() + 30 * 24 * 60 * 60);
campaign.approveAppeal(platform, 50_000, clock.now() + 30 * 24 * 60 * 60);
console.log("Status:", campaign.getStatus()); // "appeal_active" (insufficient funds)

// Contribute to appeal
campaign.contributeToAppeal("funder3", 10_000);

// Evaluate appeal
campaign.evaluateAppeal();
console.log("Status:", campaign.getStatus()); // "locked"

// Record win on appeal
campaign.recordOutcome("win");
campaign.depositCourtAward(attorney, 80_000);
console.log("Available:", campaign.getAvailableFunds()); // 123,000 (44k + 10k - 1k fee + 80k award)
```

---

## Additional Resources

- [Core Concepts](./02-core-concepts-domain-model.md)
- [Testing Strategy](./09-testing-strategy-chaos-testing.md)
- [Usage Examples](./12-usage-examples-workflows.md)
- [Source Code](../src/crowdfunding/campaign.ts)
- [Type Definitions](../src/crowdfunding/types.ts)
- [Error Definitions](../src/crowdfunding/errors.ts)
