# Invoice Payment System

## Overview

The invoice payment system enables transparent, secure payments from campaign funds to service providers (primarily attorneys) through 2-of-3 multisig approval. This document explains how the system works and the design decisions behind it.

## Core Concepts

### InvoicePayment Interface

**Source**: [`src/crowdfunding/types.ts:57-66`](../src/crowdfunding/types.ts#L57-L66)

```typescript
export interface InvoicePayment {
  invoiceId: string;           // Unique invoice identifier
  amount: number;              // Payment amount in lamports
  recipient: PublicKeyLike;    // Wallet receiving payment
  approvers: PublicKeyLike[];  // Signers who approved (2 of 3)
}
```

**Design Rationale**: Complete record of each payment including:
- Unique identifier for tracking
- Amount paid
- Who received it
- Who approved it (audit trail)

### Payment Storage

**Source**: [`src/crowdfunding/campaign.ts:33-35`](../src/crowdfunding/campaign.ts#L33-L35)

```typescript
private readonly invoicePayments: InvoicePayment[] = [];
private readonly pendingInvoiceApprovals = new Map<string, Set<PublicKeyLike>>();
private readonly pendingInvoiceDetails = new Map<string, { amount: number; recipient: PublicKeyLike }>();
```

**Design Rationale**:
- **invoicePayments**: Array of executed payments (complete history)
- **pendingInvoiceApprovals**: Tracks who has approved each pending invoice
- **pendingInvoiceDetails**: Stores parameters from first approval for consistency checking

## Approval Process

### Step-by-Step Flow

**Source**: [`src/crowdfunding/campaign.ts:198-251`](../src/crowdfunding/campaign.ts#L198-L251)

```typescript
approveInvoicePayment(
  approver: PublicKeyLike, 
  invoiceId: string, 
  amount: number, 
  recipient: PublicKeyLike
): void {
  // 1. Validate campaign state
  if (this.status !== "locked") {
    throw new CampaignError("Can only approve invoice payments for locked campaigns");
  }
  
  // 2. Validate approver is a signer
  if (!this.config.signers.includes(approver)) {
    throw new CampaignError("Approver is not a multisig signer");
  }
  
  // 3. Validate amount
  if (amount <= 0) {
    throw new CampaignError("Invoice amount must be > 0");
  }

  // 4. Check consistency or store details
  const existingDetails = this.pendingInvoiceDetails.get(invoiceId);
  if (existingDetails) {
    // Subsequent approval - must match first approval
    if (existingDetails.amount !== amount || existingDetails.recipient !== recipient) {
      throw new CampaignError("Invoice amount and recipient must match existing approvals");
    }
  } else {
    // First approval - check funds and store details
    if (this.getAvailableFunds() < amount) {
      throw new CampaignError("Insufficient funds for invoice payment");
    }
    this.pendingInvoiceDetails.set(invoiceId, { amount, recipient });
  }

  // 5. Initialize approval tracking if needed
  if (!this.pendingInvoiceApprovals.has(invoiceId)) {
    this.pendingInvoiceApprovals.set(invoiceId, new Set());
  }
  const approvals = this.pendingInvoiceApprovals.get(invoiceId)!;
  
  // 6. Prevent double approval
  if (approvals.has(approver)) {
    throw new CampaignError("Approver has already approved this invoice");
  }
  
  // 7. Add approval
  approvals.add(approver);

  // 8. Execute if threshold reached
  if (approvals.size >= APPROVAL_THRESHOLD) {
    // Double-check funds before payment
    if (this.getAvailableFunds() < amount) {
      throw new CampaignError("Insufficient funds for invoice payment");
    }
    
    // Record payment
    this.invoicePayments.push({
      invoiceId,
      amount,
      recipient,
      approvers: Array.from(approvals)
    });
    
    // Cleanup pending state
    this.pendingInvoiceApprovals.delete(invoiceId);
    this.pendingInvoiceDetails.delete(invoiceId);
  }
}
```

### Validation Steps Explained

#### 1. State Validation

```typescript
if (this.status !== "locked")
```

**Design Rationale**: Only locked campaigns can make payments:
- `active`: Still fundraising
- `failed_refunding`/`refunding`: Refunds in progress
- `settled`/`won`/`lost`: Need to lock again before payments
- `appeal_active`: Appeal fundraising in progress

Only `locked` state indicates funds are available for disbursement.

#### 2. Signer Validation

```typescript
if (!this.config.signers.includes(approver))
```

**Design Rationale**: Only the 3 designated signers can approve payments. Non-signers (contributors, etc.) cannot participate in governance.

#### 3. Amount Validation

```typescript
if (amount <= 0)
```

**Design Rationale**: Payments must be positive. Zero or negative amounts are invalid.

#### 4. Parameter Consistency

```typescript
if (existingDetails.amount !== amount || existingDetails.recipient !== recipient)
```

**Design Rationale**: All approvers must approve the same invoice parameters. Prevents race conditions where different signers approve different amounts or recipients.

#### 5. Funds Check (First Approval Only)

```typescript
if (this.getAvailableFunds() < amount)
```

**Design Rationale**: Check funds at first approval to fail fast. Invalid invoices rejected immediately without waiting for more approvals.

#### 6. Double-Approval Prevention

```typescript
if (approvals.has(approver))
```

**Design Rationale**: Each signer can only approve once. Prevents single signer from executing payment alone.

#### 7. Funds Re-Check (Before Execution)

```typescript
if (this.getAvailableFunds() < amount)
```

**Design Rationale**: Double-check before execution in case funds were spent between approvals (e.g., judgment payment, another invoice).

## Use Cases

### Attorney Service Payments

**Primary Use Case**: Paying attorney for legal services

```typescript
// Attorney submits invoice for $50K
campaign.approveInvoicePayment(attorney, "INV-2024-01", 50_000, attorneyWallet);
// Status: Pending (1 of 2 approvals)

// Platform approves
campaign.approveInvoicePayment(platform, "INV-2024-01", 50_000, attorneyWallet);
// Status: Executed (2 of 2 approvals)

// Payment recorded in invoicePayments array
```

**Design Rationale**: Transparent way to pay for services rendered:
- Attorney can't pay themselves unilaterally
- Platform/client must agree
- Full audit trail
- Clear payment records

### Expert Witness Payments

```typescript
// Pay expert witness
campaign.approveInvoicePayment(attorney, "EXP-001", 15_000, expertWallet);
campaign.approveInvoicePayment(client, "EXP-001", 15_000, expertWallet);
// Executed
```

### Court Filing Fees

```typescript
// Pay court filing fees
campaign.approveInvoicePayment(platform, "FILING-001", 5_000, courtClerkWallet);
campaign.approveInvoicePayment(attorney, "FILING-001", 5_000, courtClerkWallet);
// Executed
```

## Special Case: Judgment Payments

### System Payments

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

**Design Rationale**: Judgment payments are special:
- **No approvals needed**: Court-mandated, not optional
- **System recipient**: Uses `SYSTEM_RECIPIENT_COURT` constant
- **Empty approvers**: Indicates automatic system payment
- **Tracked**: Still recorded in invoicePayments for audit

### SYSTEM_RECIPIENT_COURT

**Source**: [`src/crowdfunding/types.ts:3-4`](../src/crowdfunding/types.ts#L3-L4), [`campaign.ts:14`](../src/crowdfunding/campaign.ts#L14)

```typescript
/** Special recipient identifier for system payments (e.g., court judgments) */
export const SYSTEM_RECIPIENT_COURT = "court" as const;

import { SYSTEM_RECIPIENT_COURT } from "./types.js";
```

**Design Rationale**: Typed constant instead of magic string:
- Prevents typos
- Self-documenting (JSDoc comment)
- Type-safe
- Easily identifiable in code

## Querying Payment History

### Getting All Payments

**Source**: [`src/crowdfunding/campaign.ts:167-169`](../src/crowdfunding/campaign.ts#L167-L169)

```typescript
getInvoicePayments(): InvoicePayment[] {
  return [...this.invoicePayments];
}
```

**Design Rationale**: Returns copy of array to prevent external modification. Complete payment history available for:
- Audit trails
- Financial reports
- Contributor transparency
- Legal documentation

### Getting Pending Approvals

**Source**: [`src/crowdfunding/campaign.ts:253-255`](../src/crowdfunding/campaign.ts#L253-L255)

```typescript
getInvoiceApprovals(invoiceId: string): PublicKeyLike[] {
  return Array.from(this.pendingInvoiceApprovals.get(invoiceId) ?? []);
}
```

**Design Rationale**: Query approval status for specific invoice:
- UI can show "1 of 2 approvals"
- Show which signers have approved
- Empty array if invoice not found or already executed

## Payment Impact on Available Funds

### Deduction from Available Funds

**Source**: [`src/crowdfunding/campaign.ts:178-181`](../src/crowdfunding/campaign.ts#L178-L181)

```typescript
getAvailableFunds(): number {
  const totalInvoicePayments = this.invoicePayments.reduce(
    (sum, payment) => sum + payment.amount, 
    0
  );
  return totalRaised - daoFee - refunded + courtFees - totalInvoicePayments;
}
```

**Design Rationale**: Invoice payments reduce available funds:
- Subtracted from total pool
- Includes both regular invoices and judgments
- Affects future payment and appeal decisions

## Example Scenarios

### Scenario 1: Sequential Invoice Payments

```typescript
// Campaign has 200K available

// First invoice: $50K for attorney
campaign.approveInvoicePayment(attorney, "INV-001", 50_000, attorneyWallet);
campaign.approveInvoicePayment(platform, "INV-001", 50_000, attorneyWallet);
// Executed: 150K available

// Second invoice: $30K for expert
campaign.approveInvoicePayment(platform, "INV-002", 30_000, expertWallet);
campaign.approveInvoicePayment(client, "INV-002", 30_000, expertWallet);
// Executed: 120K available

// Third invoice: $20K for filing fees
campaign.approveInvoicePayment(attorney, "INV-003", 20_000, courtWallet);
campaign.approveInvoicePayment(client, "INV-003", 20_000, courtWallet);
// Executed: 100K available
```

### Scenario 2: Insufficient Funds

```typescript
// Campaign has 40K available

// Invoice for $50K
campaign.approveInvoicePayment(attorney, "INV-999", 50_000, attorneyWallet);
// Error: "Insufficient funds for invoice payment"

// Must wait for more funds (court award, appeal fundraising, etc.)
```

### Scenario 3: Parameter Mismatch

```typescript
// First approval
campaign.approveInvoicePayment(attorney, "INV-123", 50_000, attorneyWallet);
// Stored: amount=50K, recipient=attorneyWallet

// Second approval with different amount
campaign.approveInvoicePayment(platform, "INV-123", 60_000, attorneyWallet);
// Error: "Invoice amount and recipient must match existing approvals"

// Must approve with matching parameters
campaign.approveInvoicePayment(platform, "INV-123", 50_000, attorneyWallet);
// Executed
```

### Scenario 4: Concurrent Invoices

```typescript
// Multiple invoices can be pending simultaneously

// Invoice A: $30K
campaign.approveInvoicePayment(attorney, "INV-A", 30_000, attorneyWallet);
// Pending: A (1/2)

// Invoice B: $20K
campaign.approveInvoicePayment(platform, "INV-B", 20_000, expertWallet);
// Pending: A (1/2), B (1/2)

// Complete Invoice B
campaign.approveInvoicePayment(client, "INV-B", 20_000, expertWallet);
// Executed: B, Pending: A (1/2)

// Complete Invoice A
campaign.approveInvoicePayment(platform, "INV-A", 30_000, attorneyWallet);
// Executed: A, B
```

**Design Rationale**: Map-based tracking enables multiple simultaneous pending invoices.

## Security Features

### 1. Multisig Required

No single party can execute payments:
- Attorney + Platform
- Attorney + Client
- Platform + Client

**Design Rationale**: Prevents single point of control over funds.

### 2. Parameter Locking

First approval locks invoice parameters:
- Amount cannot be changed
- Recipient cannot be changed
- All signers approve the same action

**Design Rationale**: Prevents race conditions and ambiguity.

### 3. Funds Validation

Checked twice:
- At first approval (fail fast)
- Before execution (final check)

**Design Rationale**: Prevents overdraft situations.

### 4. State-Based Access

Only locked campaigns can approve payments.

**Design Rationale**: Payments only possible when funds are secured and available.

### 5. Audit Trail

Every payment recorded with:
- Invoice ID
- Amount
- Recipient
- Approvers

**Design Rationale**: Complete transparency and accountability.

## Comparison to Other Operations

### Invoice Payments vs. Court Deposits

| Aspect | Invoice Payments | Court Deposits |
|--------|------------------|----------------|
| Approval | 2 of 3 required | Attorney unilateral |
| Direction | Funds out | Funds in |
| Validation | Multisig + funds check | State + attorney check |
| Use Case | Services rendered | Court awards |

**Design Rationale**: Different approval requirements based on direction (in vs. out) and source (community vs. court).

### Invoice Payments vs. Judgments

| Aspect | Invoice Payments | Judgment Payments |
|--------|------------------|-------------------|
| Approval | 2 of 3 required | Automatic |
| Recipient | Service provider | Court (system) |
| Timing | Discretionary | Required after loss |
| Approvers | Recorded | Empty array |

**Design Rationale**: Court-mandated payments don't require approval, but still tracked for audit.

## Testing Coverage

**Source**: [`tests/crowdfunding/campaign.test.ts`](../tests/crowdfunding/campaign.test.ts)

Tests include:
- 2-of-3 invoice approval flow
- Parameter consistency enforcement
- Double-approval prevention
- Insufficient funds handling
- Concurrent invoice processing
- Judgment payment (system payment)
- Impact on available funds

**Design Rationale**: Comprehensive tests validate all payment scenarios.

## Next Steps

- [Multisig Approval Mechanisms →](./07-multisig-approval-mechanisms.md)
- [Financial Controls and DAO Treasury →](./03-financial-controls-dao-treasury.md)
- [API Reference Guide →](./10-api-reference-guide.md)
