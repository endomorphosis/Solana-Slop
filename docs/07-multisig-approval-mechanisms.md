# Multisig Approval Mechanisms

## Overview

The platform uses a 3-signer multisig system for governance and financial controls. This document explains the various approval mechanisms, why different thresholds are used for different operations, and how parameter consistency is enforced.

## The 3-Signer Multisig

### Configuration

**Source**: [`src/crowdfunding/types.ts:15`](../src/crowdfunding/types.ts#L15), [`campaign.ts:45-48`](../src/crowdfunding/campaign.ts#L45-L48)

```typescript
export interface CampaignConfig {
  signers: PublicKeyLike[];  // Must be exactly 3
}

constructor(config: CampaignConfig, clock: Clock) {
  if (config.signers.length !== 3) {
    throw new CampaignError("Exactly 3 multisig signers are required");
  }
}
```

**Design Rationale**: Exactly 3 signers required. Not configurable to ensure consistent governance model across all campaigns.

### Signer Roles

**Source**: [`src/crowdfunding/campaign.ts:189`](../src/crowdfunding/campaign.ts#L189), [`campaign.ts:309`](../src/crowdfunding/campaign.ts#L309)

```typescript
// signers[0] = Attorney (first signer)
if (depositor !== this.config.signers[0]) {
  throw new CampaignError("Only attorney can deposit court fees");
}
```

**Position-Based Roles**:

1. **signers[0] - Attorney**
   - Can unilaterally deposit court fees
   - Can unilaterally deposit court awards
   - Participates in multisig approvals
   
2. **signers[1] - Platform**
   - Participates in multisig approvals
   - No special privileges
   
3. **signers[2] - Client**
   - Participates in multisig approvals
   - No special privileges

**Design Rationale**: Position-based rather than role-based for simplicity. Array index determines role, no need for additional role metadata.

## Approval Thresholds

### Standard 2-of-3 Approval

**Source**: [`src/crowdfunding/campaign.ts:16`](../src/crowdfunding/campaign.ts#L16)

```typescript
const APPROVAL_THRESHOLD = 2;  // 2 of 3 signers required
```

**Used For**:
- Multisig refunds
- Invoice payments
- Loss appeals

**Design Rationale**: 2-of-3 is standard multisig configuration:
- Prevents single point of failure
- Requires majority agreement
- Allows operation if one signer unavailable
- More secure than simple majority of 2

### Win Appeal 1-of-3 Approval

**Source**: [`src/crowdfunding/campaign.ts:17`](../src/crowdfunding/campaign.ts#L17)

```typescript
const WIN_APPEAL_THRESHOLD = 1;  // Only 1 signer for win appeals
```

**Used For**:
- Appeals after winning (defending victory)

**Design Rationale**: Lower threshold because:
- **Lower Risk**: Defending a win vs. pursuing after loss
- **Defensive Posture**: Opponent initiated appeal, not us
- **Speed**: Faster response to opponent's appeal
- **Trust**: Any signer can authorize defense

### Loss Appeal 2-of-3 Approval

**Source**: [`src/crowdfunding/campaign.ts:18`](../src/crowdfunding/campaign.ts#L18)

```typescript
const LOSS_APPEAL_THRESHOLD = 2;  // 2 signers for loss appeals
```

**Used For**:
- Appeals after losing (trying to overturn)

**Design Rationale**: Higher threshold because:
- **Higher Risk**: Offensive action with uncertain outcome
- **Financial Burden**: Additional costs after already losing
- **Major Decision**: Requires broader consensus
- **Prudence**: More review before spending more money

## Refund Approvals

### Multisig Refund Process

**Source**: [`src/crowdfunding/campaign.ts:119-138`](../src/crowdfunding/campaign.ts#L119-L138)

```typescript
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
```

**Validation Steps**:
1. Campaign must be "locked" (successful campaign)
2. Approver must be valid signer
3. Refund window must have started
4. Minimum raise must have been met (successful campaign)
5. Collect approval from signer
6. Execute refund when 2 approvals reached

**Design Rationale**: Multiple validations ensure refunds only happen when appropriate. 2-of-3 prevents unilateral refund decisions.

### Why Refund Window?

**Source**: [`src/crowdfunding/types.ts:14`](../src/crowdfunding/types.ts#L14)

```typescript
export interface CampaignConfig {
  refundWindowStartUnix: number;  // When refunds become possible
}
```

**Design Rationale**: Grace period before refunds are possible:
- Prevents immediate refund after successful raise
- Gives campaign time to begin work
- Protects against "buyer's remorse"
- Set at campaign creation (e.g., 6 months after deadline)

## Invoice Payment Approvals

### 2-of-3 Invoice Approval

**Source**: [`src/crowdfunding/campaign.ts:198-251`](../src/crowdfunding/campaign.ts#L198-L251)

```typescript
approveInvoicePayment(
  approver: PublicKeyLike, 
  invoiceId: string, 
  amount: number, 
  recipient: PublicKeyLike
): void {
  if (this.status !== "locked") {
    throw new CampaignError("Can only approve invoice payments for locked campaigns");
  }
  if (!this.config.signers.includes(approver)) {
    throw new CampaignError("Approver is not a multisig signer");
  }
  
  // First approval: check funds and store details
  if (!this.pendingInvoiceDetails.has(invoiceId)) {
    if (this.getAvailableFunds() < amount) {
      throw new CampaignError("Insufficient funds for invoice payment");
    }
    this.pendingInvoiceDetails.set(invoiceId, { amount, recipient });
  }
  
  // Add approval
  this.pendingInvoiceApprovals.get(invoiceId)!.add(approver);
  
  // Execute on 2nd approval
  if (approvals.size >= APPROVAL_THRESHOLD) {
    // Double-check funds before payment
    if (this.getAvailableFunds() < amount) {
      throw new CampaignError("Insufficient funds for invoice payment");
    }
    
    this.invoicePayments.push({
      invoiceId,
      amount,
      recipient,
      approvers: Array.from(approvals)
    });
  }
}
```

**Design Rationale**: 2-of-3 approval for payments ensures:
- No single signer can drain funds
- Majority agreement on all payments
- Transparent approval process
- Full audit trail

## Parameter Consistency Enforcement

### The Race Condition Problem

Without consistency enforcement:

```
Time T0: Attorney approves invoice "INV-001" for $10K to Address A
Time T1: Platform approves invoice "INV-001" for $15K to Address B
Result: Which parameters win? Ambiguous!
```

### Invoice Payment Consistency

**Source**: [`src/crowdfunding/campaign.ts:210-222`](../src/crowdfunding/campaign.ts#L210-L222)

```typescript
// Check if this invoice already has approvals and validate consistency
const existingDetails = this.pendingInvoiceDetails.get(invoiceId);
if (existingDetails) {
  // Ensure amount and recipient are consistent with first approval
  if (existingDetails.amount !== amount || existingDetails.recipient !== recipient) {
    throw new CampaignError("Invoice amount and recipient must match existing approvals");
  }
} else {
  // First approval - store details
  this.pendingInvoiceDetails.set(invoiceId, { amount, recipient });
}
```

**Design Rationale**:
1. First approval stores parameters
2. Subsequent approvals must match exactly
3. Prevents ambiguity about what's being approved
4. Clear error messages on mismatch

### Appeal Parameter Consistency

**Source**: [`src/crowdfunding/campaign.ts:40-41`](../src/crowdfunding/campaign.ts#L40-L41), [`campaign.ts:368-389`](../src/crowdfunding/campaign.ts#L368-L389)

```typescript
/** Stores parameters from first appeal approval to enforce consistency */
private firstAppealApprovalParams: { 
  estimatedCost: number; 
  deadlineUnix: number; 
  courtLevel: CourtLevel; 
  path: LitigationPath 
} | null = null;

// In approveAppeal:
if (this.appealApprovals.size === 0) {
  // First approval - store parameters
  this.firstAppealApprovalParams = { estimatedCost, deadlineUnix, courtLevel, path };
} else {
  // Subsequent approvals - enforce consistency
  if (this.firstAppealApprovalParams.estimatedCost !== estimatedCost) {
    throw new CampaignError("Appeal estimated cost does not match first approval");
  }
  if (this.firstAppealApprovalParams.deadlineUnix !== deadlineUnix) {
    throw new CampaignError("Appeal deadline does not match first approval");
  }
  if (this.firstAppealApprovalParams.courtLevel !== courtLevel) {
    throw new CampaignError("Appeal court level does not match first approval");
  }
  if (this.firstAppealApprovalParams.path !== path) {
    throw new CampaignError("Appeal path does not match first approval");
  }
}
```

**Parameters Checked**:
- **estimatedCost**: Must match exactly
- **deadlineUnix**: Must match exactly
- **courtLevel**: Must match exactly
- **path**: Must match exactly

**Design Rationale**: Same pattern as invoices:
- First approval establishes terms
- Subsequent approvals must agree to same terms
- Prevents race conditions
- Ensures all signers know what they're approving

### Cleanup After Execution

**Source**: [`src/crowdfunding/campaign.ts:248-249`](../src/crowdfunding/campaign.ts#L248-L249), [`campaign.ts:425-426`](../src/crowdfunding/campaign.ts#L425-L426)

```typescript
// Invoice payment executed
this.pendingInvoiceApprovals.delete(invoiceId);
this.pendingInvoiceDetails.delete(invoiceId);

// Appeal approved and initiated
this.appealApprovals.clear();
this.firstAppealApprovalParams = null;
```

**Design Rationale**: Clean up after execution:
- Prevents stale data
- Ready for next approval cycle
- Frees memory
- Clear state

## Double-Approval Prevention

### Invoice Payments

**Source**: [`src/crowdfunding/campaign.ts:230-232`](../src/crowdfunding/campaign.ts#L230-L232)

```typescript
// Prevent double approval by same signer
if (approvals.has(approver)) {
  throw new CampaignError("Approver has already approved this invoice");
}
```

**Design Rationale**: Same signer can't approve twice:
- Would allow 1 signer to execute payment alone
- Defeats purpose of multisig
- Clear error message prevents confusion

### Appeals

**Source**: [`src/crowdfunding/campaign.ts:391-394`](../src/crowdfunding/campaign.ts#L391-L394)

```typescript
// Check for double approval
if (this.appealApprovals.has(approver)) {
  throw new CampaignError("Approver has already approved this appeal");
}
```

**Design Rationale**: Same logic as invoices - one vote per signer per action.

## Approval State Tracking

### Using Sets for Approvals

**Source**: [`src/crowdfunding/campaign.ts:28-29`](../src/crowdfunding/campaign.ts#L28-L29), [`campaign.ts:39`](../src/crowdfunding/campaign.ts#L39)

```typescript
private readonly approvals = new Set<PublicKeyLike>();           // Refund approvals
private readonly appealApprovals = new Set<PublicKeyLike>();     // Appeal approvals
```

**Design Rationale**: Sets provide:
- **O(1) membership checks**: `approvals.has(approver)`
- **Automatic deduplication**: Can't add same signer twice
- **O(1) size checks**: `approvals.size`
- **Clear semantics**: Set of unique approvers

### Using Maps for Pending Details

**Source**: [`src/crowdfunding/campaign.ts:34-35`](../src/crowdfunding/campaign.ts#L34-L35)

```typescript
private readonly pendingInvoiceApprovals = new Map<string, Set<PublicKeyLike>>();
private readonly pendingInvoiceDetails = new Map<string, { amount: number; recipient: PublicKeyLike }>();
```

**Structure**:
- **Key**: Invoice ID (string)
- **Value**: Set of approvers OR details object

**Design Rationale**: Maps enable:
- Multiple invoices pending simultaneously
- O(1) lookup by invoice ID
- Clear tracking of approval state per invoice
- Easy cleanup after execution

## Querying Approval State

### Public Getters

**Source**: [`src/crowdfunding/campaign.ts:76-78`](../src/crowdfunding/campaign.ts#L76-L78), [`campaign.ts:253-255`](../src/crowdfunding/campaign.ts#L253-L255), [`campaign.ts:269-271`](../src/crowdfunding/campaign.ts#L269-L271)

```typescript
getApprovals(): PublicKeyLike[] {
  return Array.from(this.approvals.values());
}

getInvoiceApprovals(invoiceId: string): PublicKeyLike[] {
  return Array.from(this.pendingInvoiceApprovals.get(invoiceId) ?? []);
}

getAppealApprovals(): PublicKeyLike[] {
  return Array.from(this.appealApprovals);
}
```

**Design Rationale**: Public getters allow:
- UI to display approval status
- Users to see who has approved
- Testing to verify approval state
- Returns arrays (copies) to prevent external modification

## Approval Flow Examples

### Example 1: Refund Approval

```typescript
// Campaign is locked (goal was met)
// Refund window has started
// Signers decide to return funds

campaign.approveRefund(attorney);
// approvals.size = 1, status = "locked" (still)

campaign.approveRefund(platform);
// approvals.size = 2, status = "refunding" (opens refunds)

// Contributors can now claim refunds
campaign.claimRefund(contributor1);
```

### Example 2: Invoice Payment with Consistency Check

```typescript
// Attorney submits invoice
campaign.approveInvoicePayment(attorney, "INV-123", 50_000, attorneyWallet);
// First approval - stores parameters

// Platform tries to approve different amount
campaign.approveInvoicePayment(platform, "INV-123", 75_000, attorneyWallet);
// Error: "Invoice amount and recipient must match existing approvals"

// Platform approves with correct parameters
campaign.approveInvoicePayment(platform, "INV-123", 50_000, attorneyWallet);
// Second approval - payment executes
```

### Example 3: Win Appeal (1-of-3)

```typescript
// Campaign won at district court
campaign.recordOutcome("win", 0);

// Opponent appeals - single signer can approve defense
campaign.approveAppeal(attorney, 75_000, deadline, "appellate", "appeal");
// appealApprovals.size = 1, threshold met immediately
// Status changes to "locked" or "appeal_active" depending on funds
```

### Example 4: Loss Appeal (2-of-3)

```typescript
// Campaign lost at district court
campaign.recordOutcome("loss", 100_000);

// First signer approves appeal
campaign.approveAppeal(attorney, 150_000, deadline, "appellate", "appeal");
// appealApprovals.size = 1, threshold not met yet

// Second signer tries different parameters
campaign.approveAppeal(platform, 200_000, deadline, "appellate", "appeal");
// Error: "Appeal estimated cost does not match first approval"

// Second signer approves with matching parameters
campaign.approveAppeal(platform, 150_000, deadline, "appellate", "appeal");
// appealApprovals.size = 2, threshold met
// Appeal initiated
```

## Security Considerations

### 1. Signer Validation

All approval methods validate signer membership:

```typescript
if (!this.config.signers.includes(approver)) {
  throw new CampaignError("Approver is not a multisig signer");
}
```

**Design Rationale**: Prevents non-signers from participating in governance.

### 2. Double-Approval Prevention

Sets prevent same signer from approving multiple times.

**Design Rationale**: Maintains integrity of multisig threshold.

### 3. Parameter Consistency

First approval locks parameters, preventing race conditions.

**Design Rationale**: All signers approve the same action, not different actions.

### 4. State-Based Validation

Operations only allowed in appropriate states:

```typescript
if (this.status !== "locked") {
  throw new CampaignError("Can only approve invoice payments for locked campaigns");
}
```

**Design Rationale**: Prevents operations in invalid states.

## Testing Coverage

**Source**: [`tests/crowdfunding/campaign.test.ts`](../tests/crowdfunding/campaign.test.ts)

Tests include:
- 2-of-3 refund approvals
- 2-of-3 invoice payment approvals
- 1-of-3 win appeal approvals
- 2-of-3 loss appeal approvals
- Parameter consistency enforcement (both invoice and appeal)
- Double-approval prevention
- Non-signer rejection

**Design Rationale**: Comprehensive tests validate all approval mechanisms work correctly.

## Next Steps

- [Invoice Payment System →](./08-invoice-payment-system.md)
- [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)
- [Design Decisions and Rationale →](./11-design-decisions-rationale.md)
