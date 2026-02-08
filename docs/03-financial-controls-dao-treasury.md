# Financial Controls and DAO Treasury

## Overview

The crowdfunding platform implements robust financial controls to ensure transparency, sustainability, and proper fund management. This document explains the financial mechanisms and the reasoning behind them.

## DAO Treasury Fee System

### 10% Platform Fee

**Source**: [`src/crowdfunding/campaign.ts:20`](../src/crowdfunding/campaign.ts#L20)

```typescript
const DAO_FEE_PERCENT = 0.10;  // 10% fee on successful campaigns
```

**Configuration**: [`src/crowdfunding/types.ts:17`](../src/crowdfunding/types.ts#L17)

```typescript
export interface CampaignConfig {
  // ... other fields
  daoTreasury: PublicKeyLike;  // Where platform fee is allocated
}
```

### When Fees Are Collected

#### Initial Campaign Success

**Source**: [`src/crowdfunding/campaign.ts:113-115`](../src/crowdfunding/campaign.ts#L113-L115)

```typescript
evaluate(): void {
  if (this.getTotalRaised() >= this.config.minRaiseLamports) {
    // Successful raise: deduct 10% DAO fee
    this.daoFeeAmount = Math.floor(this.getTotalRaised() * DAO_FEE_PERCENT);
    this.status = "locked";
  }
}
```

**Design Rationale**: Fee is only charged when campaigns succeed (reach minimum goal). Failed campaigns don't pay fees, protecting contributors who don't get their desired outcome.

#### Appeal Round Success

**Source**: [`src/crowdfunding/campaign.ts:479-481`](../src/crowdfunding/campaign.ts#L479-L481)

```typescript
evaluateAppeal(): void {
  if (currentAppealRound.totalRaised >= currentAppealRound.minRaiseLamports) {
    // Appeal funding succeeded - collect 10% DAO fee for this round
    this.daoFeeAmount += Math.floor(currentAppealRound.totalRaised * DAO_FEE_PERCENT);
    this.status = "locked";
  }
}
```

**Design Rationale**: Each successful fundraising round pays a 10% fee. This ensures:
- Platform remains sustainable through multi-year campaigns
- Fees are proportional to funds raised
- Failed appeal rounds don't incur fees

### Fee Impact on Available Funds

**Source**: [`src/crowdfunding/campaign.ts:171-182`](../src/crowdfunding/campaign.ts#L171-L182)

```typescript
getAvailableFunds(): number {
  const totalRaised = this.getTotalRaised();
  // ... other calculations
  return totalRaised - this.daoFeeAmount - totalRefunded + this.courtFeesDeposited - totalInvoicePayments;
}
```

**Design Rationale**: DAO fee is subtracted from available funds immediately upon successful evaluation. This:
- Makes fees transparent in all calculations
- Prevents spending funds allocated to DAO
- Ensures accurate fund availability for payments

## Court Fee Deposit System

### Attorney-Only Deposits

**Source**: [`src/crowdfunding/campaign.ts:184-196`](../src/crowdfunding/campaign.ts#L184-L196)

```typescript
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
```

**Design Rationale**: Attorney is the only party who:
- Has direct relationship with the court
- Receives court-awarded fee payments
- Can verify authenticity of court awards
- Needs no multisig approval for deposits (adding money, not spending)

### Court Award Deposits After Wins

**Source**: [`src/crowdfunding/campaign.ts:304-316`](../src/crowdfunding/campaign.ts#L304-L316)

```typescript
depositCourtAward(depositor: PublicKeyLike, amount: number): void {
  if (this.status !== "won") {
    throw new CampaignError("Can only deposit court awards after a win");
  }
  // Only attorney (first signer) can deposit court awards
  if (depositor !== this.config.signers[0]) {
    throw new CampaignError("Only attorney can deposit court awards");
  }
  this.courtFeesDeposited += amount;
}
```

**Design Rationale**: Similar to court fees, awards are deposited by attorney unilaterally because:
- Attorney receives awards from court system
- Adding funds to campaign doesn't require governance
- Speed: No delay for multisig approval
- Trust: Attorney is already a trusted signer

### Impact on Fund Calculations

Court deposits increase available funds:

```typescript
getAvailableFunds(): number {
  return totalRaised - daoFee - refunded + this.courtFeesDeposited - invoicePayments;
  //                                       ^^^^^^^^^^^^^^^^^^^^^^
  //                                       Added to available funds
}
```

**Design Rationale**: Court deposits augment the campaign fund pool and can:
- Cover appeal costs without additional fundraising
- Pay attorney invoices
- Provide buffer for future litigation needs

## Judgment Payment System

### Paying Court-Ordered Judgments

**Source**: [`src/crowdfunding/campaign.ts:321-339`](../src/crowdfunding/campaign.ts#L321-L339)

```typescript
payJudgment(amount: number): void {
  if (this.status !== "lost") {
    throw new CampaignError("Can only pay judgment after a loss");
  }
  if (this.getAvailableFunds() < amount) {
    throw new CampaignError("Insufficient funds to pay judgment");
  }
  
  // Record as a special invoice payment
  this.invoicePayments.push({
    invoiceId: `JUDGMENT-${this.clock.now()}`,
    amount,
    recipient: SYSTEM_RECIPIENT_COURT,
    approvers: [] // System payment - no approvals needed
  });
}
```

**Design Rationale**: Judgment payments are:
- **Automatic**: No multisig approval (court-mandated)
- **Tracked**: Recorded in invoice payments for audit trail
- **System recipient**: Uses special `SYSTEM_RECIPIENT_COURT` constant
- **Validated**: Must have sufficient funds available

### SYSTEM_RECIPIENT_COURT Constant

**Source**: [`src/crowdfunding/types.ts:3-4`](../src/crowdfunding/types.ts#L3-L4)

```typescript
/** Special recipient identifier for system payments (e.g., court judgments) */
export const SYSTEM_RECIPIENT_COURT = "court" as const;
```

**Design Rationale**: Using a constant instead of arbitrary strings:
- Makes system payments easily identifiable
- Prevents typos ("court" vs "Court" vs "COURT")
- Documents intent (JSDoc comment)
- Type-safe (const assertion)

## Available Funds Calculation

### Comprehensive Accounting

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
  return totalRaised - this.daoFeeAmount - totalRefunded 
         + this.courtFeesDeposited - totalInvoicePayments;
}
```

### Breakdown of Components

#### 1. Total Raised

**Source**: [`src/crowdfunding/campaign.ts:63-74`](../src/crowdfunding/campaign.ts#L63-L74)

```typescript
getTotalRaised(): number {
  let total = 0;
  // Sum initial round contributions
  for (const amount of this.contributions.values()) total += amount;
  // Sum all appeal round contributions
  for (const roundContributions of this.appealContributionsByRound.values()) {
    for (const amount of roundContributions.values()) {
      total += amount;
    }
  }
  return total;
}
```

**Design Rationale**: Aggregates contributions from:
- Initial fundraising round
- All appeal rounds
- Provides complete picture of community funding

#### 2. DAO Fee Amount

- Deducted on each successful round (initial + appeals)
- 10% of amount raised per round
- Accumulated across all successful rounds

**Design Rationale**: Proportional to funds raised, ensuring platform sustainability.

#### 3. Total Refunded

- Only counts actual claimed refunds, not eligible refunds
- Sums refunds from `refunded` set matching `contributions` map

**Design Rationale**: Only subtracts money that has actually left the campaign, not just eligible refunds.

#### 4. Court Fees Deposited

- Attorney deposits from court awards
- Adds to available funds (money in)

**Design Rationale**: Increases fund pool without requiring community contributions.

#### 5. Total Invoice Payments

- Includes regular invoice payments (attorney fees)
- Includes judgment payments (court-ordered)
- All payments tracked for complete audit trail

**Design Rationale**: Subtracts all money paid out, whether for services or judgments.

## Financial Validation

### Pre-Payment Checks

All outgoing payments validate fund availability:

**Invoice Payments**: [`src/crowdfunding/campaign.ts:218-220`](../src/crowdfunding/campaign.ts#L218-L220)

```typescript
if (this.getAvailableFunds() < amount) {
  throw new CampaignError("Insufficient funds for invoice payment");
}
```

**Double-Check Before Execution**: [`src/crowdfunding/campaign.ts:237-240`](../src/crowdfunding/campaign.ts#L237-L240)

```typescript
if (this.getAvailableFunds() < amount) {
  throw new CampaignError("Insufficient funds for invoice payment");
}
```

**Judgment Payments**: [`src/crowdfunding/campaign.ts:328-330`](../src/crowdfunding/campaign.ts#L328-L330)

```typescript
if (this.getAvailableFunds() < amount) {
  throw new CampaignError("Insufficient funds to pay judgment");
}
```

**Design Rationale**: Multiple validation points prevent:
- Overdraft situations
- Negative fund balances
- Race conditions between approval and execution
- Financial inconsistencies

## Fund Flow Examples

### Example 1: Successful Initial Campaign

```
1. Initial contributions: 100,000 lamports
2. Deadline passes, goal met
3. DAO fee deducted: 10,000 lamports (10%)
4. Available funds: 90,000 lamports
```

### Example 2: Win with Court Award

```
1. Campaign raised: 100,000 lamports
2. DAO fee: -10,000 lamports
3. After win, attorney deposits award: +50,000 lamports
4. Available funds: 140,000 lamports
5. Invoice payment: -20,000 lamports
6. Final available: 120,000 lamports
```

### Example 3: Loss with Judgment

```
1. Campaign raised: 100,000 lamports
2. DAO fee: -10,000 lamports
3. Available before judgment: 90,000 lamports
4. Pay judgment: -30,000 lamports
5. Remaining for appeal: 60,000 lamports
```

### Example 4: Multi-Round Appeal

```
Round 1 (Initial):
  - Raised: 100,000
  - DAO fee: -10,000
  - Available: 90,000

Round 2 (Appeal):
  - Previous available: 90,000
  - Appeal contributions: 50,000
  - Appeal DAO fee: -5,000
  - Total raised: 150,000
  - Total DAO fees: -15,000
  - Available: 135,000
```

**Design Rationale**: Clear arithmetic shows how funds flow through various operations, making the system auditable and predictable.

## Financial Security Features

### 1. Immutable Fee Rate

The DAO fee percentage is a constant, not configurable per campaign:

```typescript
const DAO_FEE_PERCENT = 0.10;  // Cannot be changed by campaign creators
```

**Design Rationale**: Prevents manipulation or "sweetheart deals" for specific campaigns.

### 2. Automatic Deduction

Fees are deducted automatically upon successful evaluation:

```typescript
this.daoFeeAmount = Math.floor(this.getTotalRaised() * DAO_FEE_PERCENT);
```

**Design Rationale**: No manual step means no opportunity to forget or skip fees.

### 3. Separate Tracking

DAO fees are tracked separately from other amounts:

```typescript
private daoFeeAmount = 0;
```

**Design Rationale**: Clear visibility into how much has been allocated to platform sustainability.

### 4. Attorney Deposit Restrictions

Only attorney can deposit court awards:

```typescript
if (depositor !== this.config.signers[0]) {
  throw new CampaignError("Only attorney can deposit court awards");
}
```

**Design Rationale**: Prevents fake deposits or manipulation by non-attorneys.

### 5. Judgment Payment Validation

Judgments require sufficient funds:

```typescript
if (this.getAvailableFunds() < amount) {
  throw new CampaignError("Insufficient funds to pay judgment");
}
```

**Design Rationale**: Prevents over-spending or negative balances.

## Transparency and Auditability

### Complete Payment History

All payments are recorded:

**Source**: [`src/crowdfunding/campaign.ts:167-169`](../src/crowdfunding/campaign.ts#L167-L169)

```typescript
getInvoicePayments(): InvoicePayment[] {
  return [...this.invoicePayments];
}
```

**Design Rationale**: Full audit trail of every payment includes:
- Invoice ID (or judgment ID)
- Amount
- Recipient
- Approvers (for non-system payments)

### Queryable Financial State

All financial information is queryable:

```typescript
getDaoFeeAmount(): number          // Total DAO fees
getCourtFeesDeposited(): number    // Total court deposits
getAvailableFunds(): number        // Current available funds
getTotalRaised(): number           // Total community contributions
getInvoicePayments(): InvoicePayment[]  // All payments made
```

**Design Rationale**: Complete transparency enables:
- Contributors to see where their money went
- Platform to audit campaigns
- Third parties to verify financial integrity

## Next Steps

- [Invoice Payment System →](./08-invoice-payment-system.md)
- [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)
- [Design Decisions and Rationale →](./11-design-decisions-rationale.md)
