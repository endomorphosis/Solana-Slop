# Conditional Fundraising Logic

## Overview

One of the most sophisticated features of the platform is **conditional fundraising**: the system intelligently checks if sufficient funds are available before initiating community fundraising for appeals. This document explains how it works and why it was designed this way.

## The Problem

Traditional crowdfunding platforms treat each funding round independently:

```
Need: $50K for appeal
Action: Start fundraising for $50K
Result: Raise $50K from community + charge 10% fee
```

**Issue**: What if the campaign already has $60K available? Why raise more money and charge additional fees?

## The Solution: Smart Fund Checking

**Source**: [`src/crowdfunding/campaign.ts:400-423`](../src/crowdfunding/campaign.ts#L400-L423)

```typescript
if (this.appealApprovals.size >= requiredApprovals) {
  const availableFunds = this.getAvailableFunds();
  const needsFundraising = availableFunds < estimatedCost;
  const minRaiseLamports = needsFundraising ? estimatedCost - availableFunds : 0;
  
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
    this.status = "locked";  // Proceed immediately
  }
}
```

**Design Rationale**: Before starting fundraising, the system:
1. Calculates available funds
2. Compares to estimated appeal cost
3. Only raises difference if insufficient
4. Proceeds immediately if sufficient

## Conditional Logic Breakdown

### Step 1: Calculate Available Funds

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

**Components**:
- **Total Raised**: All contributions from all rounds
- **DAO Fees**: Deducted per successful round
- **Refunded**: Claimed refunds
- **Court Deposits**: Attorney deposits (+)
- **Invoice Payments**: Services and judgments (-)

**Design Rationale**: Comprehensive calculation includes all sources and uses of funds.

### Step 2: Determine Fundraising Need

```typescript
const availableFunds = this.getAvailableFunds();
const needsFundraising = availableFunds < estimatedCost;
```

**Logic**:
- `availableFunds >= estimatedCost` → No fundraising needed
- `availableFunds < estimatedCost` → Need fundraising

**Design Rationale**: Simple boolean check makes decision clear.

### Step 3: Calculate Shortfall

```typescript
const minRaiseLamports = needsFundraising 
  ? estimatedCost - availableFunds  // Only raise the difference
  : 0;                               // Raise nothing
```

**Design Rationale**: Only raise what's actually needed:
- If have $70K, need $50K → raise $0
- If have $30K, need $50K → raise $20K
- If have $0, need $50K → raise $50K

### Step 4: Set Campaign Status

```typescript
if (needsFundraising) {
  this.status = "appeal_active";  // Start community fundraising
} else {
  this.status = "locked";  // Skip fundraising, proceed immediately
}
```

**Design Rationale**: Different status enables different operations:
- `appeal_active`: Accept contributions, wait for deadline
- `locked`: Ready for outcome immediately

## Scenarios and Examples

### Scenario 1: Win with Large Court Award

```typescript
// Initial campaign
campaign.contribute(funder1, 100_000);
campaign.evaluate();
// Status: "locked", available: 90K (after 10% fee)

// Win at district court
campaign.recordOutcome("win", 0);
campaign.depositCourtAward(attorney, 200_000);
// Status: "won", available: 290K

// Opponent appeals - estimated cost $50K
campaign.approveAppeal(attorney, 50_000, deadline, "appellate", "appeal");

// Decision: Available (290K) >= Cost (50K)
// Result: 
//   - minRaiseLamports = 0
//   - fundraisingNeeded = false
//   - Status → "locked" immediately
//   - No community fundraising
//   - No additional DAO fee
```

**Benefits**:
- Instant decision (no waiting for fundraising)
- No additional 10% fee
- Preserves community goodwill
- Lower transaction costs

### Scenario 2: Loss with Judgment Paid

```typescript
// Initial campaign: 150K raised
// Available after DAO fee: 135K

// Loss at district court with $80K judgment
campaign.recordOutcome("loss", 80_000);
campaign.payJudgment(80_000);
// Status: "lost", available: 55K

// Appeal estimated cost: $100K
campaign.approveAppeal(attorney, 100_000, deadline, "appellate", "appeal");
campaign.approveAppeal(platform, 100_000, deadline, "appellate", "appeal");

// Decision: Available (55K) < Cost (100K)
// Shortfall: 45K
// Result:
//   - minRaiseLamports = 45_000
//   - fundraisingNeeded = true
//   - Status → "appeal_active"
//   - Community must contribute 45K
```

**Benefits**:
- Only raises needed amount ($45K, not $100K)
- Uses existing $55K efficiently
- Smaller DAO fee (10% of $45K = $4.5K instead of 10% of $100K = $10K)
- Clearer ask to community ("help us bridge the gap")

### Scenario 3: Multiple Appeals with Varying Needs

```typescript
// Round 1: Initial (2020)
// Raised: 200K, available: 180K after fee

// Round 2: Appellate (2022)
// Cost: 75K, available: 180K
// Decision: Sufficient → No fundraising

// Round 3: State Supreme (2024)
// Cost: 120K, available: 105K (after some payments)
// Decision: Shortfall 15K → Fundraising
// Raised: 15K, DAO fee: 1.5K, available: 118.5K

// Round 4: U.S. Supreme (2026)
// Cost: 250K, available: 118.5K
// Decision: Shortfall 131.5K → Fundraising
// Raised: 140K, DAO fee: 14K, available: 244.5K
```

**Design Rationale**: Over a 6-year case:
- 2 rounds needed no fundraising (saved fees)
- 2 rounds needed partial fundraising (minimized amounts)
- Total community burden minimized
- Existing funds used efficiently

## Recording Fundraising Status

### fundraisingNeeded Field

**Source**: [`src/crowdfunding/types.ts:50`](../src/crowdfunding/types.ts#L50)

```typescript
export interface AppealRound {
  // ... other fields
  fundraisingNeeded: boolean;  // Whether community funding was required
}
```

**Design Rationale**: Recording this enables:

1. **Transparency**: Contributors can see which rounds required help
2. **Analytics**: Platform can analyze fund efficiency
3. **Audit Trail**: Clear history of when community was needed
4. **Reporting**: Show "4 of 7 rounds self-funded" metrics

### Example Appeal Round Records

```typescript
// Round 2: Self-funded from court award
{
  roundNumber: 2,
  courtLevel: "appellate",
  path: "appeal",
  minRaiseLamports: 0,           // No fundraising goal
  totalRaised: 0,                // No contributions needed
  fundraisingNeeded: false,      // ← Indicates self-funded
  previousOutcome: "win"
}

// Round 3: Needed community help
{
  roundNumber: 3,
  courtLevel: "state_supreme",
  path: "appeal",
  minRaiseLamports: 45_000,      // Needed $45K
  totalRaised: 45_000,           // Raised $45K
  fundraisingNeeded: true,       // ← Indicates community funded
  previousOutcome: "loss"
}
```

## Benefits Summary

### 1. Financial Efficiency

**Without Conditional Fundraising**:
```
Round 2: Raise $50K → DAO fee $5K → Net $45K
Round 3: Raise $75K → DAO fee $7.5K → Net $67.5K
Round 4: Raise $100K → DAO fee $10K → Net $90K
Total: $225K raised, $22.5K fees, $202.5K net
```

**With Conditional Fundraising**:
```
Round 2: Sufficient funds → $0 raised, $0 fee
Round 3: Need $20K → Raise $20K → DAO fee $2K → Net $18K
Round 4: Need $80K → Raise $80K → DAO fee $8K → Net $72K
Total: $100K raised, $10K fees, $90K net
```

**Savings**: $125K less burden on community, $12.5K less fees

### 2. Speed

**Without Conditional**:
- Every appeal requires 30-60 day fundraising period
- Delays legal action

**With Conditional**:
- Self-funded appeals proceed immediately
- Faster legal response
- Better strategic positioning

### 3. Community Goodwill

**Without Conditional**:
- Asking for money when already have it seems greedy
- Contributors may feel exploited
- Trust erodes

**With Conditional**:
- Only ask when genuinely needed
- Transparent about fund status
- Builds trust and credibility

### 4. Gas Cost Savings (Blockchain)

**Without Conditional**:
- Every appeal = 100+ contribution transactions
- High gas costs

**With Conditional**:
- Self-funded appeals = 0 contribution transactions
- Significant gas savings

## Implementation Considerations

### Why Not Check After Approvals?

**Alternative Design**:
```typescript
// Wait until all approvals, THEN check funds
if (this.appealApprovals.size >= requiredApprovals) {
  // Start fundraising automatically
  this.status = "appeal_active";
}

// Later, in evaluateAppeal:
if (availableFunds >= estimatedCost) {
  // Oh wait, we don't need funds
  this.status = "locked";
}
```

**Problem**: Contributors might start sending money before system realizes it's not needed.

**Chosen Design**: Check immediately upon approval, before any contributions possible.

### Why Not Let Signers Decide?

**Alternative Design**:
```typescript
approveAppeal(skipFundraising: boolean) {
  // Signers manually specify if fundraising needed
}
```

**Problem**: 
- Signers might make mistakes
- Manual decision = room for error
- Less transparent

**Chosen Design**: Automatic calculation based on objective data (available funds vs cost).

### Edge Case: Exact Match

```typescript
availableFunds = 75_000
estimatedCost = 75_000
needsFundraising = (75_000 < 75_000) = false
```

**Decision**: No fundraising (sufficient funds)

**Design Rationale**: Exact match counts as sufficient. Better to be slightly under estimate than ask for unnecessary funds.

## Testing Coverage

### Unit Tests

**Source**: [`tests/crowdfunding/campaign.test.ts`](../tests/crowdfunding/campaign.test.ts)

Tests include:
- Appeals with sufficient funds
- Appeals with insufficient funds
- Appeals with exact fund match
- Multiple appeals with varying fund availability

### Scenario Tests

**Source**: [`tests/scenarios/`](../tests/scenarios/)

Relevant scenarios:
- [`44-sufficient-funds-no-fundraising-win.json`](../tests/scenarios/44-sufficient-funds-no-fundraising-win.json)
- [`45-just-enough-funds-no-fundraising.json`](../tests/scenarios/45-just-enough-funds-no-fundraising.json)
- [`46-depleted-funds-need-fundraising.json`](../tests/scenarios/46-depleted-funds-need-fundraising.json)
- [`48-intermittent-funding-needed.json`](../tests/scenarios/48-intermittent-funding-needed.json)
- [`50-large-award-covers-all-appeals.json`](../tests/scenarios/50-large-award-covers-all-appeals.json)

**Design Rationale**: Comprehensive testing validates conditional logic across various fund availability scenarios.

## Related Systems

### Connection to Multi-Round Appeals

Conditional fundraising is essential for multi-round appeals because:
- Funds accumulate from various sources over time
- Each round may have different financial situations
- Efficiency matters more in long campaigns
- Court awards can replenish funds mid-litigation

**See**: [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)

### Connection to Financial Controls

Available funds calculation is critical for conditional fundraising:
- Must accurately track all sources
- Must account for all uses
- Must include court deposits
- Must subtract fees and payments

**See**: [Financial Controls and DAO Treasury →](./03-financial-controls-dao-treasury.md)

## Next Steps

- [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)
- [Financial Controls and DAO Treasury →](./03-financial-controls-dao-treasury.md)
- [Design Decisions and Rationale →](./11-design-decisions-rationale.md)
