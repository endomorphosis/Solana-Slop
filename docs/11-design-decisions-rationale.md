# Design Decisions and Rationale

## Introduction

This document explains the major design decisions made in the Solana-Slop crowdfunding platform, the alternatives considered, and the trade-offs accepted. Understanding these decisions helps developers maintain consistency and make informed changes.

## Core Architectural Decisions

### 1. Blockchain-Agnostic Core

**Decision**: Implement core campaign logic without Solana-specific dependencies.

**Implementation**:

```typescript
// Abstract types instead of Solana types
export type PublicKeyLike = string;

export interface Clock {
  now(): number;
}

// Campaign uses abstract interfaces
export class Campaign {
  constructor(config: CampaignConfig, clock: Clock) { ... }
}
```

**Source**: [`src/crowdfunding/types.ts:1-8`](../src/crowdfunding/types.ts#L1-L8), [`src/crowdfunding/campaign.ts:22-27`](../src/crowdfunding/campaign.ts#L22-L27)

**Rationale**:

1. **Rapid Development**: Can develop and test domain logic without blockchain RPC dependencies
2. **Fast Testing**: Tests run in milliseconds instead of minutes
3. **Deterministic Testing**: No network variability or timing issues
4. **Time Simulation**: Can simulate years of litigation in seconds using `FakeClock`
5. **Portability**: Core logic can be ported to other blockchains with minimal changes
6. **Clear Separation**: Domain logic separated from infrastructure concerns

**Alternatives Considered**:

- **Direct Solana Integration**: Implement with Solana types from the start
  - **Rejected**: Would slow down development, make testing difficult, couple domain logic to blockchain
  
- **Mock Solana Types**: Use mocked Solana types for testing
  - **Rejected**: Still couples logic to Solana, harder to port, adds complexity

**Trade-offs**:

- **Pro**: Fast development, comprehensive testing, easy to understand
- **Con**: Requires adaptation layer for Solana integration
- **Con**: String-based PublicKeyLike less type-safe than native Solana PublicKey

**Impact**: This decision enabled TDD with 24 unit tests and 102 chaos scenarios that run instantly, validating multi-year litigation without blockchain.

---

### 2. Separate Appeal Contribution Tracking

**Decision**: Track contributions separately for each appeal round instead of lumping all contributions together.

**Implementation**:

```typescript
export class Campaign {
  // Initial round contributions
  private readonly contributions = new Map<PublicKeyLike, number>();
  
  // Appeal round contributions tracked separately
  private readonly appealContributionsByRound = new Map<
    number, 
    Map<PublicKeyLike, number>
  >();
}
```

**Source**: [`src/crowdfunding/campaign.ts:26`](../src/crowdfunding/campaign.ts#L26), [`src/crowdfunding/campaign.ts:43`](../src/crowdfunding/campaign.ts#L43)

**Rationale**:

1. **Per-Round Refunds**: Different contributors per round need separate refund tracking
2. **Fair Refunds**: If appeal fails, only appeal contributors get refunds (not initial contributors)
3. **Transparency**: Clear accounting of who contributed to which round
4. **Audit Trail**: Complete history of funding per litigation stage

**Alternatives Considered**:

- **Single Contribution Pool**: Track all contributions in one map
  - **Rejected**: Cannot distinguish which round a contribution belongs to
  - **Rejected**: Cannot properly refund failed appeal rounds
  
- **Contribution History Array**: Store all contributions with round tags
  - **Rejected**: More complex to query, harder to aggregate

**Trade-offs**:

- **Pro**: Clear per-round accounting, proper refunds, better transparency
- **Con**: Slightly more complex data structure
- **Con**: Must iterate multiple maps to calculate total raised

**Impact**: Enables proper handling of failed appeal rounds - only appeal contributors are refunded while initial contributors remain funded.

---

### 3. Differential Approval Thresholds

**Decision**: Require different approval thresholds for win appeals (1/3) vs loss appeals (2/3).

**Implementation**:

```typescript
const WIN_APPEAL_THRESHOLD = 1;  // Only 1 signer needed for win appeal
const LOSS_APPEAL_THRESHOLD = 2; // 2 signers needed for loss appeal

approveAppeal(...): void {
  const requiredApprovals = this.status === "won" 
    ? WIN_APPEAL_THRESHOLD 
    : LOSS_APPEAL_THRESHOLD;
  
  if (this.appealApprovals.size >= requiredApprovals) {
    // Approve appeal
  }
}
```

**Source**: [`src/crowdfunding/campaign.ts:17-18`](../src/crowdfunding/campaign.ts#L17-L18), [`src/crowdfunding/campaign.ts:398-400`](../src/crowdfunding/campaign.ts#L398-L400)

**Rationale**:

1. **Risk Asymmetry**: Defending a win is less risky than appealing a loss
2. **Different Motivations**: 
   - Win appeals: Opponent appeals, client must defend (defensive, lower risk)
   - Loss appeals: Client appeals, seeking reversal (offensive, higher risk)
3. **Cost-Benefit Balance**: Loss appeals have higher costs and lower success rates, justify more consensus
4. **Protect Contributors**: Higher threshold for riskier decisions protects community funds

**Alternatives Considered**:

- **Uniform 2/3 Threshold**: Same approval for all appeals
  - **Rejected**: Doesn't account for risk differences
  - **Rejected**: May delay defensive appeals unnecessarily
  
- **Uniform 1/3 Threshold**: Single approval for all appeals
  - **Rejected**: Insufficient oversight for risky loss appeals
  
- **3/3 Unanimous**: All signers must approve
  - **Rejected**: Too restrictive, single signer can block necessary appeals

**Trade-offs**:

- **Pro**: Balances risk and agility, protects contributors, reflects real-world legal strategy
- **Con**: More complex to explain, asymmetric thresholds may confuse users
- **Con**: Single signer can approve win appeals (less oversight)

**Impact**: Win appeals can proceed quickly with attorney approval alone, while loss appeals require attorney + platform/client consensus, balancing protection and agility.

---

### 4. Parameter Consistency Enforcement

**Decision**: Enforce parameter consistency across multiple approvals for both invoices and appeals.

**Implementation**:

```typescript
// Invoice approval
approveInvoicePayment(...): void {
  const existingDetails = this.pendingInvoiceDetails.get(invoiceId);
  if (existingDetails) {
    if (existingDetails.amount !== amount || existingDetails.recipient !== recipient) {
      throw new CampaignError("Invoice amount and recipient must match existing approvals");
    }
  } else {
    this.pendingInvoiceDetails.set(invoiceId, { amount, recipient });
  }
}

// Appeal approval
approveAppeal(...): void {
  if (this.appealApprovals.size === 0) {
    this.firstAppealApprovalParams = { estimatedCost, deadlineUnix, courtLevel, path };
  } else {
    // Enforce consistency
    if (this.firstAppealApprovalParams.estimatedCost !== estimatedCost) {
      throw new CampaignError("Appeal estimated cost does not match first approval");
    }
    // ... check other parameters
  }
}
```

**Source**: [`src/crowdfunding/campaign.ts:210-222`](../src/crowdfunding/campaign.ts#L210-L222), [`src/crowdfunding/campaign.ts:369-389`](../src/crowdfunding/campaign.ts#L369-L389)

**Rationale**:

1. **Prevent Confusion**: Signers must approve the same parameters, not different versions
2. **Security**: Prevents one signer from approving high amount while others approve low amount
3. **Intentionality**: Forces signers to communicate and agree on exact terms
4. **Transparency**: Community sees what was actually approved, no ambiguity

**Alternatives Considered**:

- **Last Parameter Wins**: Use parameters from most recent approval
  - **Rejected**: Allows later signers to change terms without earlier signers' knowledge
  
- **First Parameter Wins**: Use parameters from first approval, ignore subsequent
  - **Rejected**: Later signers may not realize they're approving different parameters
  
- **Parameter Averaging**: Average amounts across approvals
  - **Rejected**: Doesn't make sense for most parameters (court level, recipient)

**Trade-offs**:

- **Pro**: Strong protection against parameter manipulation, clear approval semantics
- **Con**: Requires coordination between signers
- **Con**: If signers disagree on parameters, must start over
- **Con**: More complex implementation with parameter storage

**Impact**: Ensures multisig approvals are meaningful - all signers approve identical terms. Prevents scenario where attorney approves $10k invoice while platform approves $5k invoice.

---

### 5. Conditional Fundraising

**Decision**: Automatically check available funds before initiating appeal fundraising. Only fundraise if insufficient funds exist.

**Implementation**:

```typescript
approveAppeal(...): void {
  if (this.appealApprovals.size >= requiredApprovals) {
    const availableFunds = this.getAvailableFunds();
    const needsFundraising = availableFunds < estimatedCost;
    const minRaiseLamports = needsFundraising ? estimatedCost - availableFunds : 0;
    
    this.appealRounds.push({
      // ...
      minRaiseLamports,
      fundraisingNeeded: needsFundraising
    });
    
    if (needsFundraising) {
      this.status = "appeal_active";
    } else {
      this.status = "locked";  // Sufficient funds, proceed immediately
    }
  }
}
```

**Source**: [`src/crowdfunding/campaign.ts:401-423`](../src/crowdfunding/campaign.ts#L401-L423)

**Rationale**:

1. **Efficiency**: Don't burden community with fundraising if funds already exist
2. **Speed**: Appeals can proceed immediately if funds available
3. **Transparency**: Clear indication whether fundraising was needed
4. **Better UX**: Contributors aren't asked to contribute when unnecessary
5. **Award Utilization**: Court awards from wins can fund subsequent appeals

**Alternatives Considered**:

- **Always Fundraise**: Require fundraising for every appeal regardless of available funds
  - **Rejected**: Wastes time, poor UX, ignores available resources
  
- **Manual Decision**: Let signers decide whether to fundraise
  - **Rejected**: Adds complexity, room for error, less transparent
  
- **Fixed Reserve**: Require maintaining specific reserve, fundraise if below
  - **Rejected**: Arbitrary threshold, may fundraise unnecessarily or insufficiently

**Trade-offs**:

- **Pro**: Efficient use of resources, faster appeals when possible, better UX
- **Con**: Slightly more complex state transitions
- **Con**: Must accurately track available funds across all sources

**Impact**: Large court awards can fund multiple appeal rounds without community involvement. Example: $500k award covers 3 appeals at $80k each, no fundraising needed.

---

### 6. 10% DAO Fee

**Decision**: Charge 10% platform fee on successful campaigns and appeal rounds, allocated to DAO treasury.

**Implementation**:

```typescript
const DAO_FEE_PERCENT = 0.10;

// On initial campaign success
evaluate(): void {
  this.daoFeeAmount = Math.floor(this.getTotalRaised() * DAO_FEE_PERCENT);
  this.status = "locked";
}

// On appeal round success
evaluateAppeal(): void {
  this.daoFeeAmount += Math.floor(currentAppealRound.totalRaised * DAO_FEE_PERCENT);
  this.status = "locked";
}
```

**Source**: [`src/crowdfunding/campaign.ts:20`](../src/crowdfunding/campaign.ts#L20), [`src/crowdfunding/campaign.ts:114`](../src/crowdfunding/campaign.ts#L114), [`src/crowdfunding/campaign.ts:480`](../src/crowdfunding/campaign.ts#L480)

**Rationale**:

1. **Sustainability**: Platform needs revenue to maintain operations, development, support
2. **Aligned Incentives**: Fee only charged on successful campaigns (aligned with contributors)
3. **Fair Distribution**: Percentage-based fee scales with campaign size
4. **Industry Standard**: 10% is competitive with crowdfunding platforms (Kickstarter: 5% + payment fees, GoFundMe: 2.9% + fees)
5. **DAO Control**: Treasury managed by DAO, transparent allocation

**Alternatives Considered**:

- **No Fee**: Free platform
  - **Rejected**: Unsustainable, no development funding, tragedy of the commons
  
- **5% Fee**: Lower fee
  - **Rejected**: May be insufficient for platform sustainability
  
- **15-20% Fee**: Higher fee
  - **Rejected**: Reduces available funds for legal work, less competitive
  
- **Fixed Fee**: Flat amount per campaign
  - **Rejected**: Unfair to small campaigns, doesn't scale
  
- **Subscription Model**: Monthly fee for campaigns
  - **Rejected**: Complex to manage, unclear cost for long campaigns

**Trade-offs**:

- **Pro**: Sustainable platform, aligned incentives, industry-standard rate
- **Con**: Reduces available funds by 10%
- **Con**: Multi-round campaigns pay multiple fees (but each round is a separate service)

**Impact**: On $500k campaign: $50k to DAO, $450k available. Multi-round: Initial $500k → $50k fee. Appeal $100k → $10k fee. Total fees: $60k on $600k raised (10% overall).

---

### 7. Attorney Unilateral Deposit Privileges

**Decision**: Only attorney (first signer) can deposit court fees and awards, without requiring multisig approval.

**Implementation**:

```typescript
depositCourtFees(depositor: PublicKeyLike, amount: number): void {
  if (depositor !== this.config.signers[0]) {
    throw new CampaignError("Only attorney can deposit court fees");
  }
  this.courtFeesDeposited += amount;
}

depositCourtAward(depositor: PublicKeyLike, amount: number): void {
  if (depositor !== this.config.signers[0]) {
    throw new CampaignError("Only attorney can deposit court awards");
  }
  this.courtFeesDeposited += amount;
}
```

**Source**: [`src/crowdfunding/campaign.ts:188-191`](../src/crowdfunding/campaign.ts#L188-L191), [`src/crowdfunding/campaign.ts:308-311`](../src/crowdfunding/campaign.ts#L308-L311)

**Rationale**:

1. **Practicality**: Attorney handles court interactions and receives awards directly
2. **Efficiency**: Awards can be deposited immediately without waiting for approvals
3. **Trust Model**: Attorney is trusted party managing legal work
4. **No Harm**: Deposits increase available funds (benefit campaign), no risk of theft
5. **Speed**: Quick replenishment enables faster appeal decisions

**Alternatives Considered**:

- **Multisig Deposits**: Require 2/3 approval for deposits
  - **Rejected**: Slows down award deposits, no security benefit (deposits help campaign)
  
- **Any Signer Can Deposit**: Allow all signers to deposit
  - **Rejected**: Less clear ownership, potential for confusion about deposit source
  
- **Public Deposits**: Anyone can deposit
  - **Rejected**: Opens possibility of incorrect/malicious deposits, unclear accounting

**Trade-offs**:

- **Pro**: Fast deposits, practical for attorney workflow, no security risk
- **Con**: Single point of control for deposits
- **Con**: Requires trusting attorney for accurate deposit amounts

**Impact**: Attorney receives $200k court award, deposits immediately. Appeal approved same day with sufficient funds. No waiting for multisig approval coordination.

---

### 8. Judgment Payment System

**Decision**: Record judgment payments as special invoice payments to system recipient, not as separate mechanism.

**Implementation**:

```typescript
export const SYSTEM_RECIPIENT_COURT = "court" as const;

payJudgment(amount: number): void {
  this.invoicePayments.push({
    invoiceId: `JUDGMENT-${this.clock.now()}`,
    amount,
    recipient: SYSTEM_RECIPIENT_COURT,
    approvers: []  // System payment, no approvers needed
  });
}
```

**Source**: [`src/crowdfunding/types.ts:4`](../src/crowdfunding/types.ts#L4), [`src/crowdfunding/campaign.ts:333-338`](../src/crowdfunding/campaign.ts#L333-L338)

**Rationale**:

1. **Unified Accounting**: All payments tracked in single system (invoicePayments)
2. **Complete History**: Invoice payments include all fund outflows
3. **Simplified Queries**: Single method to get all payments
4. **Consistent Interface**: Reuses existing payment infrastructure
5. **Clear Distinction**: SYSTEM_RECIPIENT_COURT identifies judgment vs normal invoices

**Alternatives Considered**:

- **Separate Judgment Tracking**: Dedicated array for judgment payments
  - **Rejected**: Duplicates payment tracking logic, fragments history
  
- **Balance Deduction Only**: Just decrease available funds, no record
  - **Rejected**: Loses audit trail, unclear where funds went
  
- **Status-Only Tracking**: Track judgment in separate field
  - **Rejected**: Inconsistent with invoice payment tracking

**Trade-offs**:

- **Pro**: Unified payment history, simplified implementation, clear audit trail
- **Con**: Must filter by recipient to separate judgments from invoices
- **Con**: Empty approvers array for system payments (inconsistent with normal invoices)

**Impact**: `getInvoicePayments()` returns all outflows including judgments. Filter by `SYSTEM_RECIPIENT_COURT` to separate judgment payments: `payments.filter(p => p.recipient === SYSTEM_RECIPIENT_COURT)`.

---

### 9. Explicit State Machine

**Decision**: Use explicit state enum with clear transitions instead of computed status.

**Implementation**:

```typescript
export type CampaignStatus = 
  | "active" 
  | "locked" 
  | "failed_refunding" 
  | "refunding" 
  | "settled" 
  | "won" 
  | "lost" 
  | "appeal_active";

export class Campaign {
  private status: CampaignStatus = "active";
  
  // Explicit state transitions
  evaluate(): void {
    if (goalMet) {
      this.status = "locked";
    } else {
      this.status = "failed_refunding";
    }
  }
}
```

**Source**: [`src/crowdfunding/types.ts:20`](../src/crowdfunding/types.ts#L20), [`src/crowdfunding/campaign.ts:25`](../src/crowdfunding/campaign.ts#L25)

**Rationale**:

1. **Clarity**: State is explicit and obvious at any time
2. **Validation**: Can enforce valid transitions and prevent invalid operations
3. **Simplicity**: No complex state derivation logic
4. **Performance**: No repeated computation of status
5. **Debugging**: Easy to see current state, track state changes

**Alternatives Considered**:

- **Computed Status**: Calculate status from other fields
  ```typescript
  getStatus(): CampaignStatus {
    if (this.outcome === "win") return "won";
    if (this.refundReason) return "refunding";
    // ... complex logic
  }
  ```
  - **Rejected**: Complex, error-prone, hard to validate transitions
  
- **Boolean Flags**: Multiple boolean flags (isLocked, isRefunding, etc.)
  - **Rejected**: Can have invalid combinations, unclear precedence
  
- **Numeric Status Codes**: Use numbers instead of strings
  - **Rejected**: Less readable, requires constant lookup

**Trade-offs**:

- **Pro**: Clear, simple, easy to validate, performant
- **Con**: Must remember to update state on transitions
- **Con**: Can theoretically set invalid states (mitigated by private field)

**Impact**: Methods can easily check `if (this.status === "locked")` and throw clear errors for invalid operations. State transitions are explicit and traceable.

---

## Domain Modeling Decisions

### 10. Immutable Configuration

**Decision**: Campaign configuration (CampaignConfig) is immutable after creation.

**Implementation**:

```typescript
export class Campaign {
  private readonly config: CampaignConfig;
  
  constructor(config: CampaignConfig, clock: Clock) {
    this.config = config;  // Stored as-is, never modified
  }
}
```

**Source**: [`src/crowdfunding/campaign.ts:23`](../src/crowdfunding/campaign.ts#L23), [`src/crowdfunding/campaign.ts:55`](../src/crowdfunding/campaign.ts#L55)

**Rationale**:

1. **Integrity**: Core parameters cannot be changed mid-campaign
2. **Trust**: Contributors know parameters won't change after they contribute
3. **Simplicity**: No need to track parameter changes or validate updates
4. **Security**: Prevents malicious parameter changes
5. **Blockchain Alignment**: On-chain accounts typically have immutable config

**Alternatives Considered**:

- **Mutable Config**: Allow updating configuration
  - **Rejected**: Security risk, trust issues, complex validation
  
- **Partial Mutability**: Allow some fields to change (e.g., deadline extension)
  - **Rejected**: Unclear which fields are mutable, complexity, potential for abuse

**Trade-offs**:

- **Pro**: Strong guarantees, simple implementation, trustworthy
- **Con**: Cannot fix mistakes in configuration
- **Con**: Cannot adapt to changed circumstances (e.g., extend deadline)

**Impact**: If configuration mistake, must create new campaign. Contributors have certainty that parameters won't change after contribution.

---

### 11. Map-Based Contribution Storage

**Decision**: Store contributions in Map<PublicKeyLike, number> instead of array.

**Implementation**:

```typescript
private readonly contributions = new Map<PublicKeyLike, number>();

contribute(funder: PublicKeyLike, lamports: number): void {
  const prev = this.contributions.get(funder) ?? 0;
  this.contributions.set(funder, prev + lamports);
}
```

**Source**: [`src/crowdfunding/campaign.ts:26`](../src/crowdfunding/campaign.ts#L26), [`src/crowdfunding/campaign.ts:100-101`](../src/crowdfunding/campaign.ts#L100-L101)

**Rationale**:

1. **Efficient Lookup**: O(1) lookup by funder address
2. **Easy Aggregation**: Sum contributions per funder automatically
3. **Refund Tracking**: Easy to check if funder has contribution
4. **Deduplication**: Single entry per funder, no duplicate tracking

**Alternatives Considered**:

- **Array of Contributions**: Store array of {funder, amount, timestamp} objects
  - **Rejected**: O(n) lookup, must aggregate manually, duplicates per contribution
  
- **Two Arrays**: Separate arrays for funders and amounts
  - **Rejected**: Hard to keep in sync, error-prone, unclear relationship

**Trade-offs**:

- **Pro**: Fast lookups, automatic aggregation, simple refunds
- **Con**: Loses individual contribution timestamps
- **Con**: Cannot distinguish multiple contributions from same funder
- **Con**: Loses contribution ordering

**Impact**: Fast refund checks and processing. Trade-off: cannot show "Alice contributed 3 times" or exact contribution timestamps. For crowdfunding, per-funder total is sufficient.

---

### 12. Set-Based Approval Tracking

**Decision**: Track approvals in Set<PublicKeyLike> instead of array.

**Implementation**:

```typescript
private readonly approvals = new Set<PublicKeyLike>();

approveRefund(approver: PublicKeyLike): void {
  this.approvals.add(approver);
  if (this.approvals.size >= APPROVAL_THRESHOLD) {
    // Execute
  }
}
```

**Source**: [`src/crowdfunding/campaign.ts:28`](../src/crowdfunding/campaign.ts#L28), [`src/crowdfunding/campaign.ts:133-137`](../src/crowdfunding/campaign.ts#L133-L137)

**Rationale**:

1. **Automatic Deduplication**: Set prevents double-approval automatically
2. **Efficient Membership Check**: O(1) check if signer already approved
3. **Simple Threshold Check**: Just check `.size`
4. **Clear Semantics**: Set represents "has approved" boolean for each signer

**Alternatives Considered**:

- **Array of Approvers**: Push approvers to array
  - **Rejected**: Must manually check for duplicates, O(n) membership check
  
- **Boolean Map**: Map<PublicKeyLike, boolean>
  - **Rejected**: More complex than Set, same functionality
  
- **Approval Count**: Just track number of approvals
  - **Rejected**: Cannot identify who approved, cannot expose approvers

**Trade-offs**:

- **Pro**: Automatic deduplication, efficient checks, simple implementation
- **Con**: Loses approval order and timestamps
- **Con**: Cannot track multiple approval rounds (must clear between rounds)

**Impact**: No need for manual duplicate checking. Prevents double-approval bugs. Trade-off: cannot show "attorney approved first at timestamp X".

---

## Security and Safety Decisions

### 13. No Arbitrary Fund Withdrawal

**Decision**: Funds can only exit through multisig-approved invoices, court judgments, or refunds. No arbitrary withdrawal mechanism.

**Rationale**:

1. **Contributor Protection**: Funds used only for stated purpose (legal work)
2. **Transparency**: Every outflow has clear purpose and approval
3. **Trust**: No backdoor for signers to drain funds
4. **Audit Trail**: All withdrawals tracked in invoicePayments

**Impact**: Even with 3/3 signer agreement, cannot arbitrarily withdraw. Must create invoice and approve through proper channels. Protects against compromised signer accounts.

---

### 14. Validation in Every Method

**Decision**: Every public method validates preconditions and throws CampaignError for invalid operations.

**Implementation**:

```typescript
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
  // ... proceed
}
```

**Source**: Throughout [`src/crowdfunding/campaign.ts`](../src/crowdfunding/campaign.ts)

**Rationale**:

1. **Safety**: Prevents invalid operations early
2. **Clear Errors**: Explicit error messages for debugging
3. **Fail Fast**: Catch mistakes immediately, not later
4. **Documentation**: Error messages document preconditions

**Impact**: Cannot accidentally contribute to locked campaign or approve invalid invoices. Clear error messages guide correct usage.

---

## Future Considerations

### Potential Improvements

1. **Contribution History**: Store individual contributions with timestamps for transparency
2. **Configurable DAO Fee**: Allow different fee percentages per campaign
3. **Flexible Approval Thresholds**: Allow configuring thresholds per campaign
4. **Partial Refunds**: Support refunding only some contributors
5. **Time Extensions**: Allow extending deadlines with multisig approval
6. **Award Validation**: Require evidence/documentation for court awards
7. **Withdrawal Limits**: Rate-limit invoice payments for safety

### Lessons Learned

1. **TDD Works**: Building with tests first caught many edge cases early
2. **Simple is Better**: Explicit state machine clearer than computed status
3. **Type Safety Helps**: TypeScript prevented many bugs
4. **Parameter Consistency Crucial**: Easy to overlook, important for security
5. **Conditional Logic Complex**: Fundraising logic requires careful testing

## Conclusion

These design decisions prioritize security, transparency, and usability while enabling efficient multi-year litigation support. The blockchain-agnostic approach enabled rapid development with comprehensive testing, and the explicit state machine provides clarity and safety.

**Key Principles**:
- **Safety First**: Validate everything, fail fast
- **Transparency**: Clear audit trail for all operations  
- **Efficiency**: Conditional fundraising, quick deposits
- **Fairness**: Differential thresholds based on risk
- **Sustainability**: DAO fee for platform longevity

**Links**:
- [Core Concepts](./02-core-concepts-domain-model.md)
- [API Reference](./10-api-reference-guide.md)
- [Testing Strategy](./09-testing-strategy-chaos-testing.md)
- [Source Code](../src/crowdfunding/campaign.ts)
