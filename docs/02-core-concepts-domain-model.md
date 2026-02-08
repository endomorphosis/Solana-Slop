# Core Concepts and Domain Model

## Domain Model Overview

The crowdfunding platform models real-world legal campaign processes through a well-defined domain model. This document explains the core concepts and their relationships.

## Campaign Lifecycle

### States and Transitions

A campaign progresses through several states during its lifecycle:

```
active → locked → {won, lost, settled}
   ↓                    ↓
failed_refunding    appeal_active → locked → ...
   ↓                    ↓
(refunds)         failed_refunding
                       ↓
                   (refunds)
```

**Source**: [`src/crowdfunding/types.ts:20`](../src/crowdfunding/types.ts#L20), [`src/crowdfunding/campaign.ts:59-117`](../src/crowdfunding/campaign.ts#L59-L117)

#### State Descriptions

1. **`active`**: Campaign is accepting contributions
   - Contributors can add funds
   - Deadline has not passed
   - Minimum raise not yet evaluated

2. **`locked`**: Funds are locked and campaign is active
   - Minimum raise was met by deadline
   - 10% DAO fee deducted
   - Awaiting case outcome or multisig actions
   - Can record outcomes, approve invoices, etc.

3. **`failed_refunding`**: Automatic refunds available
   - Minimum raise was NOT met by deadline, OR
   - Appeal round fundraising failed
   - Contributors can claim refunds immediately

4. **`refunding`**: Multisig-approved refunds
   - 2 of 3 signers approved refunds
   - Refund window has started
   - Contributors can claim their funds back

5. **`won`**: Case won in court
   - Can deposit court awards
   - Can approve appeals (1 of 3 signers needed)

6. **`lost`**: Case lost in court
   - Must pay judgment if applicable
   - Can approve appeals (2 of 3 signers needed)

7. **`settled`**: Case settled outside court
   - No further actions possible
   - Terminal state

8. **`appeal_active`**: Appeal fundraising in progress
   - Accepting contributions for appeal round
   - Appeal deadline pending
   - Will evaluate when deadline passes

**Design Rationale**: Explicit states make the business logic clear and prevent invalid operations. Each state enables specific operations and prevents others, enforcing correct usage.

## Core Entities

### Campaign

The central entity representing a legal funding campaign.

**Source**: [`src/crowdfunding/campaign.ts:22`](../src/crowdfunding/campaign.ts#L22)

```typescript
export class Campaign {
  constructor(config: CampaignConfig, clock: Clock)
}
```

**Properties**:
- Configuration (immutable)
- Current status
- Contribution tracking
- Multisig approvals
- Financial accounting
- Appeal rounds

### CampaignConfig

Immutable configuration set at campaign creation.

**Source**: [`src/crowdfunding/types.ts:10-18`](../src/crowdfunding/types.ts#L10-L18)

```typescript
export interface CampaignConfig {
  id: string;                      // Unique campaign identifier
  minRaiseLamports: number;        // Minimum funding goal
  deadlineUnix: number;            // Initial fundraising deadline
  refundWindowStartUnix: number;   // When multisig refunds become possible
  signers: PublicKeyLike[];        // 3 multisig signers [attorney, platform, client]
  daoTreasury: PublicKeyLike;      // Where 10% platform fee is sent
}
```

**Design Rationale**: Immutable configuration prevents manipulation after funders commit. All critical parameters are set upfront and cannot be changed.

### AppealRound

Represents a single appeal round with separate fundraising.

**Source**: [`src/crowdfunding/types.ts:34-51`](../src/crowdfunding/types.ts#L34-L51)

```typescript
export interface AppealRound {
  roundNumber: number;              // 1 = initial, 2+ = appeals
  courtLevel: CourtLevel;           // Court for this round
  path: LitigationPath;             // How we got here (appeal/remand/retrial)
  minRaiseLamports: number;         // Fundraising goal (0 if not needed)
  deadlineUnix: number;             // Appeal fundraising deadline
  totalRaised: number;              // Amount raised in this round
  previousOutcome?: CampaignOutcome; // Outcome that led to this appeal
  fundraisingNeeded: boolean;       // Whether community funding was required
}
```

**Design Rationale**: Separate appeal rounds enable:
- Isolated contribution tracking per round
- Independent fundraising goals
- Clear audit trail of multi-year litigation
- Proper refund accounting across rounds

### InvoicePayment

Represents a payment for legal services requiring multisig approval.

**Source**: [`src/crowdfunding/types.ts:57-66`](../src/crowdfunding/types.ts#L57-L66)

```typescript
export interface InvoicePayment {
  invoiceId: string;           // Unique invoice identifier
  amount: number;              // Payment amount in lamports
  recipient: PublicKeyLike;    // Attorney or service provider
  approvers: PublicKeyLike[];  // Signers who approved (2 of 3)
}
```

**Design Rationale**: Invoice system provides:
- Transparent payment tracking
- Multisig security on fund disbursements
- Audit trail of all payments
- Prevention of unauthorized withdrawals

## Key Value Objects

### CampaignOutcome

The result of a trial or appeal.

**Source**: [`src/crowdfunding/types.ts:25`](../src/crowdfunding/types.ts#L25)

```typescript
export type CampaignOutcome = "settlement" | "win" | "loss";
```

**Usage**:
- **settlement**: Parties agreed to resolution
- **win**: Campaign won the case (can receive awards)
- **loss**: Campaign lost the case (may owe judgment)

**Design Rationale**: Three outcomes cover all litigation results. Settlements are distinct from wins/losses as they don't involve court awards or judgments.

### CourtLevel

The level of court where the case is heard.

**Source**: [`src/crowdfunding/types.ts:28`](../src/crowdfunding/types.ts#L28)

```typescript
export type CourtLevel = 
  | "district"       // Trial court (first instance)
  | "appellate"      // Court of appeals  
  | "state_supreme"  // State supreme court
  | "us_supreme";    // U.S. Supreme Court
```

**Design Rationale**: Models the U.S. court hierarchy, allowing campaigns to track cases through multiple levels over many years.

### LitigationPath

How a case moves through the court system.

**Source**: [`src/crowdfunding/types.ts:31`](../src/crowdfunding/types.ts#L31)

```typescript
export type LitigationPath = 
  | "appeal"   // Standard appeal to higher court
  | "remand"   // Sent back to lower court
  | "retrial"  // New trial ordered
  | "final";   // Final decision (no appeal)
```

**Design Rationale**: Different paths have different implications:
- **appeal**: Move up the court hierarchy
- **remand**: Go back down for reconsideration
- **retrial**: Start over at same level
- **final**: No further legal action possible

## Participant Roles

### The 3-Signer Multisig

The platform uses a 3-signer multisig with specific roles:

**Source**: [`src/crowdfunding/campaign.ts:45-48`](../src/crowdfunding/campaign.ts#L45-L48)

```typescript
constructor(config: CampaignConfig, clock: Clock) {
  if (config.signers.length !== 3) {
    throw new CampaignError("Exactly 3 multisig signers are required");
  }
}
```

#### Signer Roles

1. **Attorney** (signers[0] - first signer)
   - Special privileges:
     - Can unilaterally deposit court fees ([`campaign.ts:184-196`](../src/crowdfunding/campaign.ts#L184-L196))
     - Can unilaterally deposit court awards ([`campaign.ts:304-316`](../src/crowdfunding/campaign.ts#L304-L316))
   - Participates in multisig approvals
   
   **Design Rationale**: Attorney receives funds directly from courts, so no approval needed for deposits. They are a trusted party in the legal process.

2. **Platform** (signers[1] - second signer)
   - Platform operator
   - Participates in multisig approvals
   - No special privileges

3. **Client** (signers[2] - third signer)
   - Campaign beneficiary
   - Participates in multisig approvals
   - No special privileges

### Contributors

Community members who fund campaigns:
- Can contribute during `active` or `appeal_active` states
- Can claim refunds when available
- No governance rights (not signers)

## Financial Concepts

### DAO Treasury Fee

**Source**: [`src/crowdfunding/campaign.ts:20`](../src/crowdfunding/campaign.ts#L20), [`campaign.ts:114`](../src/crowdfunding/campaign.ts#L114), [`campaign.ts:480`](../src/crowdfunding/campaign.ts#L480)

```typescript
const DAO_FEE_PERCENT = 0.10; // 10%

// Deducted on successful raise
this.daoFeeAmount = Math.floor(this.getTotalRaised() * DAO_FEE_PERCENT);

// Also deducted on successful appeal rounds
this.daoFeeAmount += Math.floor(currentAppealRound.totalRaised * DAO_FEE_PERCENT);
```

**Design Rationale**: 10% fee on successful campaigns funds platform maintenance. Fee is:
- Only charged on successful raises (goal met)
- Charged per round (initial + each appeal)
- Automatically deducted (no manual approval)
- Sent to DAO treasury address

### Available Funds Calculation

**Source**: [`src/crowdfunding/campaign.ts:171-182`](../src/crowdfunding/campaign.ts#L171-L182)

```typescript
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
```

**Formula**:
```
Available = TotalRaised - DaoFee - Refunded + CourtFees - InvoicePayments
```

**Design Rationale**: Comprehensive calculation across all sources:
- **TotalRaised**: Initial contributions + all appeal rounds
- **DaoFee**: 10% from each successful round
- **Refunded**: Claimed refunds (not just eligible)
- **CourtFees**: Attorney deposits from court awards
- **InvoicePayments**: Payments made for services

### Judgment Amount Handling

**Source**: [`src/crowdfunding/campaign.ts:277-299`](../src/crowdfunding/campaign.ts#L277-L299)

```typescript
recordOutcome(outcome: CampaignOutcome, judgmentAmount?: number): void {
  // Always set judgment amount deterministically (0 if not provided)
  // This ensures remands/technical losses with 0 judgment properly clear prior values
  this.judgmentAmount = judgmentAmount ?? 0;
}
```

**Design Rationale**: Using `judgmentAmount ?? 0` ensures:
- Explicit 0 judgment is recorded (not undefined)
- Prior judgment values are cleared on remands
- No stale data from previous outcomes
- Deterministic behavior in all cases

## Contribution Tracking

### Initial Round Contributions

**Source**: [`src/crowdfunding/campaign.ts:26`](../src/crowdfunding/campaign.ts#L26), [`campaign.ts:89-102`](../src/crowdfunding/campaign.ts#L89-L102)

```typescript
private readonly contributions = new Map<PublicKeyLike, number>();

contribute(funder: PublicKeyLike, lamports: number): void {
  const prev = this.contributions.get(funder) ?? 0;
  this.contributions.set(funder, prev + lamports);
}
```

### Appeal Round Contributions

**Source**: [`src/crowdfunding/campaign.ts:43`](../src/crowdfunding/campaign.ts#L43), [`campaign.ts:434-461`](../src/crowdfunding/campaign.ts#L434-L461)

```typescript
private readonly appealContributionsByRound = new Map<number, Map<PublicKeyLike, number>>();

contributeToAppeal(funder: PublicKeyLike, lamports: number): void {
  let roundContributions = this.appealContributionsByRound.get(currentAppealRound.roundNumber);
  if (!roundContributions) {
    roundContributions = new Map<PublicKeyLike, number>();
    this.appealContributionsByRound.set(currentAppealRound.roundNumber, roundContributions);
  }
  const prev = roundContributions.get(funder) ?? 0;
  roundContributions.set(funder, prev + lamports);
}
```

**Design Rationale**: Separate tracking per appeal round enables:
- Isolated refunds per round if needed
- Clear accounting of who funded which round
- Prevention of double-refund bugs
- Proper dilution tracking across rounds

## Refund Mechanisms

### Auto-Failed Refunds

Triggered when minimum raise is not met:

**Source**: [`src/crowdfunding/campaign.ts:107-111`](../src/crowdfunding/campaign.ts#L107-L111)

```typescript
if (this.getTotalRaised() < this.config.minRaiseLamports) {
  this.openRefund("auto_failed");
  this.status = "failed_refunding";
  return;
}
```

**Design Rationale**: Automatic refunds protect contributors. No manual approval needed if goal isn't reached.

### Multisig Refunds

Triggered by 2-of-3 signer approval after refund window:

**Source**: [`src/crowdfunding/campaign.ts:119-138`](../src/crowdfunding/campaign.ts#L119-L138)

```typescript
approveRefund(approver: PublicKeyLike): void {
  // Must be locked (goal was met)
  // Must be after refund window
  // Must be a valid signer
  
  this.approvals.add(approver);
  if (this.approvals.size >= APPROVAL_THRESHOLD) {
    this.openRefund("multisig");
    this.status = "refunding";
  }
}
```

**Design Rationale**: Allows returning funds to community if litigation is abandoned or circumstances change, but requires majority signer approval.

## System Constants

**Source**: [`src/crowdfunding/campaign.ts:16-20`](../src/crowdfunding/campaign.ts#L16-L20)

```typescript
const APPROVAL_THRESHOLD = 2;        // 2 of 3 for most actions
const WIN_APPEAL_THRESHOLD = 1;      // 1 of 3 for win appeals
const LOSS_APPEAL_THRESHOLD = 2;     // 2 of 3 for loss appeals  
const DAO_FEE_PERCENT = 0.10;        // 10% fee
```

**Source**: [`src/crowdfunding/types.ts:4`](../src/crowdfunding/types.ts#L4)

```typescript
export const SYSTEM_RECIPIENT_COURT = "court" as const;
```

**Design Rationale**: Constants make the system configurable and document key policy decisions in code.

## Time Handling

### Clock Abstraction

**Source**: [`src/crowdfunding/types.ts:6-8`](../src/crowdfunding/types.ts#L6-L8)

```typescript
export interface Clock {
  now(): number;  // Unix timestamp in seconds
}
```

**Design Rationale**: Abstract clock interface enables:
- Deterministic testing with fake clocks
- Simulation of multi-year campaigns in milliseconds
- No dependency on system time
- Easy mocking in tests

## Next Steps

- [Financial Controls and DAO Treasury →](./03-financial-controls-dao-treasury.md)
- [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)
- [Multisig Approval Mechanisms →](./07-multisig-approval-mechanisms.md)
