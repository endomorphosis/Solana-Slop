# Multi-Round Appeal System

## Overview

The platform supports complex multi-year litigation through a sophisticated multi-round appeal system. This document explains how appeals work, why they're designed this way, and how they enable campaigns to pursue justice through multiple court levels.

## Appeal Fundamentals

### Why Multi-Round?

Legal cases can progress through multiple levels of courts over many years:

1. **District Court** (trial)
2. **Court of Appeals** (first appeal)
3. **State Supreme Court** (state-level final)
4. **U.S. Supreme Court** (federal final)

Each level may require additional fundraising, and each has different rules and costs.

**Design Rationale**: Real litigation often spans 5-15 years through multiple courts. The system must support this reality.

## Appeal Round Structure

### AppealRound Interface

**Source**: [`src/crowdfunding/types.ts:34-51`](../src/crowdfunding/types.ts#L34-L51)

```typescript
export interface AppealRound {
  roundNumber: number;              // 1 = initial, 2+ = appeals
  courtLevel: CourtLevel;           // "district" | "appellate" | "state_supreme" | "us_supreme"
  path: LitigationPath;             // "appeal" | "remand" | "retrial" | "final"
  minRaiseLamports: number;         // Fundraising goal (0 if sufficient funds)
  deadlineUnix: number;             // Appeal fundraising deadline
  totalRaised: number;              // Amount raised in this round
  previousOutcome?: CampaignOutcome; // What led to this appeal
  fundraisingNeeded: boolean;       // Whether community funding was required
}
```

**Design Rationale**: Each round is self-contained with:
- Clear court level and path
- Separate fundraising goals and tracking
- Connection to previous outcome
- Indication of whether fundraising was needed

### Tracking Appeal Rounds

**Source**: [`src/crowdfunding/campaign.ts:37-38`](../src/crowdfunding/campaign.ts#L37-L38)

```typescript
private readonly appealRounds: AppealRound[] = [];
private currentRound = 1;
```

**Design Rationale**: 
- Array allows unlimited appeals through court system
- Current round number tracks progress
- Round 1 = initial campaign, Round 2+ = appeals

## Differential Approval Thresholds

### Win vs Loss Appeals

**Source**: [`src/crowdfunding/campaign.ts:17-18`](../src/crowdfunding/campaign.ts#L17-L18)

```typescript
const WIN_APPEAL_THRESHOLD = 1;   // Only 1 signer needed for win appeal
const LOSS_APPEAL_THRESHOLD = 2;  // 2 signers needed for loss appeal
```

### Rationale for Different Thresholds

#### Win Appeals (1 of 3)

**Source**: [`src/crowdfunding/campaign.ts:398-399`](../src/crowdfunding/campaign.ts#L398-L399)

```typescript
const requiredApprovals = this.status === "won" 
  ? WIN_APPEAL_THRESHOLD    // 1 approval for wins
  : LOSS_APPEAL_THRESHOLD;  // 2 approvals for losses
```

**Design Rationale**: When the campaign WINS:
- **Lower risk**: Opponent is appealing, not the campaign
- **Defensive position**: Campaign is defending a victory
- **Lower threshold**: Faster decision-making makes sense
- **Single approval**: Any signer can authorize defense

#### Loss Appeals (2 of 3)

**Design Rationale**: When the campaign LOSES:
- **Higher risk**: Campaign must pay for appeal costs
- **Offensive position**: Trying to overturn an unfavorable decision
- **Higher threshold**: Requires majority signer agreement
- **Financial prudence**: More eyes on decision to spend more money

### Implementation

**Source**: [`src/crowdfunding/campaign.ts:348-428`](../src/crowdfunding/campaign.ts#L348-L428)

```typescript
approveAppeal(
  approver: PublicKeyLike, 
  estimatedCost: number, 
  deadlineUnix: number,
  courtLevel: CourtLevel = "appellate",
  path: LitigationPath = "appeal"
): void {
  if (this.status !== "won" && this.status !== "lost") {
    throw new CampaignError("Can only approve appeal after win or loss");
  }
  
  // ... validation
  
  this.appealApprovals.add(approver);
  const requiredApprovals = this.status === "won" 
    ? WIN_APPEAL_THRESHOLD 
    : LOSS_APPEAL_THRESHOLD;
    
  if (this.appealApprovals.size >= requiredApprovals) {
    // Proceed with appeal...
  }
}
```

## Conditional Fundraising

### The Smart Funding Decision

**Source**: [`src/crowdfunding/campaign.ts:400-423`](../src/crowdfunding/campaign.ts#L400-L423)

```typescript
if (this.appealApprovals.size >= requiredApprovals) {
  const availableFunds = this.getAvailableFunds();
  const needsFundraising = availableFunds < estimatedCost;
  const minRaiseLamports = needsFundraising ? estimatedCost - availableFunds : 0;
  
  // Initialize appeal round
  this.appealRounds.push({
    roundNumber: this.currentRound + 1,
    courtLevel,
    path,
    minRaiseLamports,
    deadlineUnix,
    totalRaised: 0,
    previousOutcome: this.outcome!,
    fundraisingNeeded: needsFundraising
  });
  
  if (needsFundraising) {
    this.status = "appeal_active";  // Start fundraising
  } else {
    this.status = "locked";  // Proceed immediately with available funds
  }
}
```

### Why Conditional?

**Design Rationale**: The system intelligently checks available funds before starting fundraising:

#### Scenario 1: Sufficient Funds Available

```
Win at district court: +$100K court award deposited
Appeal to appellate: estimated $50K cost
Available funds: $100K
Decision: Proceed immediately (no fundraising needed)
Result: Status → "locked", minRaiseLamports: 0
```

**Benefits**:
- No delay for fundraising
- No additional 10% DAO fee
- Lower gas costs (no contribution transactions)
- Faster legal action

#### Scenario 2: Insufficient Funds

```
Loss at district court: -$30K judgment paid
Appeal to appellate: estimated $80K cost
Available funds: $60K
Decision: Start fundraising for $20K difference
Result: Status → "appeal_active", minRaiseLamports: $20K
```

**Benefits**:
- Only raises what's needed
- Minimizes contributor burden
- Uses existing funds efficiently
- Clear fundraising goal

### Tracking Fundraising Need

**Source**: [`src/crowdfunding/types.ts:50`](../src/crowdfunding/types.ts#L50)

```typescript
export interface AppealRound {
  // ...
  fundraisingNeeded: boolean;  // Whether community funding was required
}
```

**Design Rationale**: Recording whether fundraising was needed enables:
- Historical analysis of fund usage
- Understanding of case financial trajectory
- Audit trail of when community help was required

## Separate Contribution Tracking

### Why Separate Per Round?

**Source**: [`src/crowdfunding/campaign.ts:43`](../src/crowdfunding/campaign.ts#L43)

```typescript
private readonly appealContributionsByRound = new Map<number, Map<PublicKeyLike, number>>();
```

**Design Rationale**: Each appeal round tracks contributions separately to:
- Enable per-round refunds if appeal fails
- Prevent accounting bugs when refunding
- Track which contributors funded which round
- Calculate proper dilution across rounds

### Contribution Implementation

**Source**: [`src/crowdfunding/campaign.ts:434-461`](../src/crowdfunding/campaign.ts#L434-L461)

```typescript
contributeToAppeal(funder: PublicKeyLike, lamports: number): void {
  if (this.status !== "appeal_active") {
    throw new CampaignError("Campaign is not accepting appeal contributions");
  }
  
  const currentAppealRound = this.appealRounds[this.appealRounds.length - 1];
  
  // Track appeal contributions separately from initial-round contributions
  let roundContributions = this.appealContributionsByRound.get(currentAppealRound.roundNumber);
  if (!roundContributions) {
    roundContributions = new Map<PublicKeyLike, number>();
    this.appealContributionsByRound.set(currentAppealRound.roundNumber, roundContributions);
  }

  const prev = roundContributions.get(funder) ?? 0;
  roundContributions.set(funder, prev + lamports);
  currentAppealRound.totalRaised += lamports;
}
```

### Total Raised Calculation

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

**Design Rationale**: Aggregates across all rounds for:
- Complete financial picture
- DAO fee calculations
- Available funds calculations

## Appeal Parameter Consistency

### The Problem

Multiple signers might approve appeals with different parameters:
- Signer A approves: $50K cost, Dec 31 deadline, appellate court
- Signer B approves: $75K cost, Nov 30 deadline, state supreme court

This creates ambiguity and potential race conditions.

### The Solution

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

**Design Rationale**: First approval sets the parameters, subsequent approvals must match:
- Prevents race conditions
- Ensures all signers approve same terms
- Similar to invoice payment consistency pattern
- Clear error messages for mismatches

### Cleanup After Appeal Initiation

**Source**: [`src/crowdfunding/campaign.ts:425-426`](../src/crowdfunding/campaign.ts#L425-L426)

```typescript
this.appealApprovals.clear();
this.firstAppealApprovalParams = null;
```

**Design Rationale**: Reset approval state after appeal starts, ready for next appeal round.

## Appeal Evaluation

### Evaluating Appeal Success

**Source**: [`src/crowdfunding/campaign.ts:466-483`](../src/crowdfunding/campaign.ts#L466-L483)

```typescript
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
```

**Design Rationale**:
- Similar to initial evaluation logic
- Failed appeal → automatic refunds for that round
- Successful appeal → 10% DAO fee deducted, proceed to locked state
- Consistent behavior across all fundraising rounds

## Multi-Level Court Support

### Court Hierarchy

**Source**: [`src/crowdfunding/types.ts:28-31`](../src/crowdfunding/types.ts#L28-L31)

```typescript
export type CourtLevel = 
  | "district"       // Trial court (first instance)
  | "appellate"      // Court of appeals  
  | "state_supreme"  // State supreme court
  | "us_supreme";    // U.S. Supreme Court
```

**Design Rationale**: Models U.S. federal court system hierarchy, allowing campaigns to track progression through multiple levels.

### Litigation Paths

**Source**: [`src/crowdfunding/types.ts:31`](../src/crowdfunding/types.ts#L31)

```typescript
export type LitigationPath = 
  | "appeal"   // Standard appeal to higher court
  | "remand"   // Sent back to lower court
  | "retrial"  // New trial ordered
  | "final";   // Final decision (no appeal)
```

**Design Rationale**: Different paths have different implications:
- **appeal**: Move up hierarchy (district → appellate → state supreme → US supreme)
- **remand**: Go back down (appellate → district)
- **retrial**: Stay at same level, new trial
- **final**: Terminal state, no further action

## Appeal Flow Examples

### Example 1: Win with Sufficient Funds

```typescript
// Win at district court
campaign.recordOutcome("win", 0);  // Declaratory judgment
campaign.depositCourtAward(attorney, 200_000);  // Awarded attorney fees

// Opponent appeals, we defend
campaign.approveAppeal(attorney, 50_000, deadline, "appellate", "appeal");
// Status → "locked" (no fundraising needed, have 200K available)
```

### Example 2: Loss Requiring Fundraising

```typescript
// Loss at district court
campaign.recordOutcome("loss", 100_000);
campaign.payJudgment(100_000);  // Pay the judgment

// Available: 200K raised - 20K DAO fee - 100K judgment = 80K
// Need: 150K for appeal
// Shortfall: 70K

campaign.approveAppeal(attorney, 150_000, deadline, "appellate", "appeal");
campaign.approveAppeal(platform, 150_000, deadline, "appellate", "appeal");
// Status → "appeal_active" (fundraising for 70K)

// Community contributes
campaign.contributeToAppeal(funder1, 40_000);
campaign.contributeToAppeal(funder2, 30_000);

// After deadline
campaign.evaluateAppeal();
// Status → "locked" (goal met, deduct 7K DAO fee)
```

### Example 3: Multi-Level Appeal Chain

```typescript
// Round 1: District court - initial campaign
// Raised: 200K, DAO fee: 20K

// Round 2: Appellate court - win defended
// Available: 180K + 100K award = 280K
// Cost: 75K (sufficient funds, no fundraising)

// Round 3: State Supreme Court - appeal after loss
// Available: 205K
// Cost: 200K (sufficient funds, no fundraising)

// Round 4: U.S. Supreme Court - final appeal
// Available: 5K
// Cost: 300K (need 295K fundraising)
```

## DAO Fees Across Rounds

### Per-Round Fee Collection

**Source**: [`src/crowdfunding/campaign.ts:480`](../src/crowdfunding/campaign.ts#L480)

```typescript
this.daoFeeAmount += Math.floor(currentAppealRound.totalRaised * DAO_FEE_PERCENT);
```

**Design Rationale**: Each successful fundraising round incurs a 10% fee:
- **Initial campaign**: 10% of initial raise
- **Each appeal**: 10% of that round's raise (if fundraising was needed)
- **No fee**: If appeal proceeds with existing funds (no fundraising)

### Fee Accumulation

```typescript
Round 1: Raise 100K → DAO fee: 10K
Round 2: No fundraising (sufficient funds) → DAO fee: 0K
Round 3: Raise 50K → DAO fee: 5K
Total DAO fees: 15K
```

**Design Rationale**: Fees are proportional to community contributions. If using existing funds, no additional fee.

## Next Steps

- [Court Hierarchy and Litigation Paths →](./05-court-hierarchy-litigation-paths.md)
- [Conditional Fundraising Logic →](./06-conditional-fundraising-logic.md)
- [Multisig Approval Mechanisms →](./07-multisig-approval-mechanisms.md)
