# Court Hierarchy and Litigation Paths

## Overview

The platform models the U.S. court system hierarchy, enabling campaigns to track complex litigation through multiple levels over many years. This document explains the court levels, litigation paths, and how they interact.

## U.S. Court Hierarchy

### Court Levels

**Source**: [`src/crowdfunding/types.ts:28`](../src/crowdfunding/types.ts#L28)

```typescript
export type CourtLevel = 
  | "district"       // Trial court (first instance)
  | "appellate"      // Court of appeals  
  | "state_supreme"  // State supreme court
  | "us_supreme";    // U.S. Supreme Court
```

### Level Descriptions

#### 1. District Court

- **Type**: Trial court
- **Function**: First instance, facts are determined
- **Typical Duration**: 1-3 years
- **Next Level**: Can appeal to appellate court
- **Remand To**: N/A (lowest level)

**Design Rationale**: Where cases begin. District courts hear evidence, testimony, and make initial rulings.

#### 2. Appellate Court

- **Type**: Intermediate appellate court
- **Function**: Reviews district court decisions for legal errors
- **Typical Duration**: 1-2 years per appeal
- **Next Level**: Can appeal to state supreme court
- **Remand To**: District court

**Design Rationale**: Reviews lower court decisions without hearing new evidence. Focuses on legal procedure and interpretation.

#### 3. State Supreme Court

- **Type**: State-level highest court
- **Function**: Final say on state law matters
- **Typical Duration**: 1-3 years
- **Next Level**: Can appeal to U.S. Supreme Court (if federal question)
- **Remand To**: Appellate or district courts

**Design Rationale**: Highest authority on state law. Can send cases back to lower courts or settle them finally.

#### 4. U.S. Supreme Court

- **Type**: Federal highest court
- **Function**: Final arbiter on federal constitutional questions
- **Typical Duration**: 1-2 years (if cert granted)
- **Next Level**: None (terminal)
- **Remand To**: Any lower court

**Design Rationale**: Rare to reach. Final say on federal law and Constitution. Cases can span 10-15 years to reach this level.

## Litigation Paths

### Path Types

**Source**: [`src/crowdfunding/types.ts:31`](../src/crowdfunding/types.ts#L31)

```typescript
export type LitigationPath = 
  | "appeal"   // Standard appeal to higher court
  | "remand"   // Sent back to lower court
  | "retrial"  // New trial ordered
  | "final";   // Final decision (no appeal)
```

### Path Descriptions

#### Appeal

**Direction**: Up the hierarchy

```
district → appellate → state_supreme → us_supreme
```

**Use Cases**:
- Challenging adverse decision
- Defending favorable decision (opponent appeals)
- Seeking higher court review

**Design Rationale**: Standard progression up court hierarchy. Each level reviews previous level's decision.

#### Remand

**Direction**: Down the hierarchy

```
us_supreme → any lower court
state_supreme → appellate or district
appellate → district
```

**Use Cases**:
- Higher court finds procedural error
- New evidence emerges
- Legal standard has changed
- Further fact-finding needed

**Design Rationale**: Higher court sends case back for reconsideration with specific instructions. Case continues at lower level.

#### Retrial

**Direction**: Same level

```
district → district (new trial)
```

**Use Cases**:
- Mistrial declared
- Jury misconduct discovered
- New trial granted on appeal

**Design Rationale**: Case starts over at same court level. Fresh jury, new proceedings.

#### Final

**Direction**: None (terminal)

```
Any court → (end)
```

**Use Cases**:
- Supreme Court declines cert
- Parties agree to accept decision
- No further appeals possible

**Design Rationale**: Litigation ends. Case outcome is final.

## Path Combinations in AppealRounds

### Tracking Court Progress

**Source**: [`src/crowdfunding/types.ts:38-40`](../src/crowdfunding/types.ts#L38-L40)

```typescript
export interface AppealRound {
  courtLevel: CourtLevel;     // Where is the case?
  path: LitigationPath;       // How did we get here?
  previousOutcome?: CampaignOutcome;  // What was the last result?
}
```

**Design Rationale**: Combined tracking enables complete case history:
- **Court level**: Current jurisdiction
- **Path**: How we arrived here
- **Previous outcome**: Context for current round

## Real-World Scenarios

### Scenario 1: Direct Appeal Chain

```
Round 1: District Court (initial trial)
  - Outcome: Loss
  - Court: district
  - Path: N/A (initial)

Round 2: Court of Appeals
  - Outcome: Win (reversed)
  - Court: appellate
  - Path: appeal (appealing loss)

Round 3: State Supreme Court
  - Outcome: Win (affirmed)
  - Court: state_supreme
  - Path: appeal (opponent appeals our win)

Result: Case ends with two appellate wins
```

### Scenario 2: Remand and Retrial

```
Round 1: District Court
  - Outcome: Win
  - Court: district
  - Path: N/A (initial)

Round 2: Court of Appeals
  - Decision: Remand for retrial
  - Court: appellate
  - Path: appeal (opponent appealed our win)

Round 3: District Court (retrial)
  - Outcome: Win (again)
  - Court: district
  - Path: remand (case was sent back)

Round 4: Court of Appeals (second appeal)
  - Outcome: Win (affirmed)
  - Court: appellate
  - Path: appeal (opponent appeals again)

Result: Two trial wins, two appellate wins
```

### Scenario 3: Supreme Court Journey

```
Round 1: District Court (2020)
  - Outcome: Loss
  - Judgment: $1M

Round 2: Appellate Court (2022)
  - Outcome: Loss (affirmed)
  - Court: appellate
  - Path: appeal

Round 3: State Supreme Court (2024)
  - Outcome: Win (reversed)
  - Court: state_supreme
  - Path: appeal

Round 4: U.S. Supreme Court (2026)
  - Outcome: Win (affirmed)
  - Court: us_supreme
  - Path: appeal (opponent's final appeal)

Result: 6-year litigation, ultimate victory
```

## Implementation Examples

### Recording Outcomes with Court Context

**Source**: [`src/crowdfunding/campaign.ts:281-299`](../src/crowdfunding/campaign.ts#L281-L299)

```typescript
recordOutcome(outcome: CampaignOutcome, judgmentAmount?: number): void {
  if (this.status !== "locked") {
    throw new CampaignError("Can only record outcome for locked campaigns");
  }
  
  this.outcome = outcome;
  this.judgmentAmount = judgmentAmount ?? 0;
  
  if (outcome === "settlement") {
    this.status = "settled";
  } else if (outcome === "win") {
    this.status = "won";
  } else if (outcome === "loss") {
    this.status = "lost";
  }
}
```

**Design Rationale**: Outcome is recorded independently of court level. Court level is specified when approving the next appeal.

### Approving Appeals with Court Context

**Source**: [`src/crowdfunding/campaign.ts:348-354`](../src/crowdfunding/campaign.ts#L348-L354)

```typescript
approveAppeal(
  approver: PublicKeyLike, 
  estimatedCost: number, 
  deadlineUnix: number,
  courtLevel: CourtLevel = "appellate",  // Specify target court
  path: LitigationPath = "appeal"        // Specify how we're getting there
): void
```

**Design Rationale**: Explicit parameters make the litigation strategy clear. Signers must agree on both the target court and the path to get there.

### Creating Appeal Rounds

**Source**: [`src/crowdfunding/campaign.ts:406-415`](../src/crowdfunding/campaign.ts#L406-L415)

```typescript
this.appealRounds.push({
  roundNumber: this.currentRound + 1,
  courtLevel,                    // Target court level
  path,                          // Litigation path
  minRaiseLamports,
  deadlineUnix,
  totalRaised: 0,
  previousOutcome: this.outcome!, // What led us here
  fundraisingNeeded: needsFundraising
});
```

**Design Rationale**: Complete context preserved for each round:
- Where we are (court level)
- How we got here (path)
- What happened before (previous outcome)
- Financial details (costs, funding)

## Valid Path Transitions

### From District Court

After district court outcome, valid next moves:

```
district + win → appellate (appeal) [opponent appeals]
district + loss → appellate (appeal) [we appeal]
district + any → district (retrial) [new trial ordered]
district + any → final [accept outcome]
```

### From Appellate Court

After appellate court decision:

```
appellate + win → state_supreme (appeal) [opponent appeals]
appellate + loss → state_supreme (appeal) [we appeal]
appellate + any → district (remand) [sent back for retrial]
appellate + any → final [accept outcome]
```

### From State Supreme Court

After state supreme court decision:

```
state_supreme + win → us_supreme (appeal) [opponent appeals, federal question]
state_supreme + loss → us_supreme (appeal) [we appeal, federal question]
state_supreme + any → appellate (remand) [sent back]
state_supreme + any → district (remand) [sent all the way back]
state_supreme + any → final [accept outcome]
```

### From U.S. Supreme Court

After U.S. Supreme Court decision:

```
us_supreme + any → any lower court (remand) [sent back with instructions]
us_supreme + any → final [accept outcome, no higher court]
```

**Design Rationale**: These transitions model real legal proceedings. The system doesn't enforce them programmatically (trusts signers' judgment), but documents valid patterns.

## Duration and Cost Implications

### Typical Timelines

```
District Court Trial:       6 months - 3 years
Appellate Brief + Decision: 1 - 2 years
State Supreme Court:        1 - 3 years
U.S. Supreme Court Cert:    1 - 2 years

Total for all levels:       5 - 15 years
```

**Design Rationale**: The platform must support decade-long campaigns, which is why:
- Appeal rounds are isolated
- Contributions tracked separately per round
- Multiple DAO fees charged over time
- System remains stateless between rounds

### Cost Escalation

Legal costs typically increase at higher levels:

```
District Trial:       $50K - $200K
Appellate Brief:      $30K - $100K
State Supreme:        $50K - $150K
U.S. Supreme:         $100K - $300K
```

**Design Rationale**: Different estimated costs per round reflect reality. Conditional fundraising becomes more important at higher levels when costs accumulate.

## Testing Coverage

### Scenario Tests Include

**Source**: [`tests/scenarios/README.md`](../tests/scenarios/README.md)

The 102 scenario files comprehensively test:

```
✓ All court levels (district through US Supreme)
✓ All litigation paths (appeal, remand, retrial, final)
✓ Complex multi-level appeals
✓ Remands and retrials
✓ Cases spanning 5-20 years
✓ Cost accumulation across levels
✓ Fund availability at each level
```

Example scenarios:
- [`36-win-appellate-state-supreme-affirmed.json`](../tests/scenarios/36-win-appellate-state-supreme-affirmed.json)
- [`41-win-all-courts-to-scotus.json`](../tests/scenarios/41-win-all-courts-to-scotus.json)
- [`79-all-courts-all-paths.json`](../tests/scenarios/79-all-courts-all-paths.json)
- [`83-maximum-appeal-depth.json`](../tests/scenarios/83-maximum-appeal-depth.json)

**Design Rationale**: Comprehensive testing validates the system handles real-world litigation complexity.

## Example: Complete Case History

```typescript
// Round 1: Initial trial (2020)
campaign.recordOutcome("loss", 500_000);
campaign.payJudgment(500_000);

// Round 2: Appeal to appellate court (2021)
campaign.approveAppeal(attorney, 75_000, deadline2021, "appellate", "appeal");
campaign.approveAppeal(platform, 75_000, deadline2021, "appellate", "appeal");
// Fundraising succeeds
campaign.recordOutcome("win", 0);  // Judgment reversed

// Round 3: Opponent appeals to state supreme (2023)
campaign.approveAppeal(attorney, 100_000, deadline2023, "state_supreme", "appeal");
// Sufficient funds, no fundraising needed
campaign.recordOutcome("win", 0);  // Affirmed

// Round 4: Remanded back to district for retrial (2024)
campaign.approveAppeal(attorney, 120_000, deadline2024, "district", "remand");
campaign.approveAppeal(platform, 120_000, deadline2024, "district", "remand");
// Fundraising succeeds
campaign.recordOutcome("win", 250_000);  // Win with damages

// Final: Attorney deposits award (2025)
campaign.depositCourtAward(attorney, 250_000);
```

## Audit Trail Benefits

### Complete Case History

With court levels and paths tracked per round, the system provides:

1. **Timeline**: When each court proceeding occurred
2. **Costs**: How much each level cost
3. **Outcomes**: What happened at each level
4. **Paths**: How the case moved through courts
5. **Funding**: Which rounds required community help

**Design Rationale**: Complete audit trail enables:
- Transparency for contributors
- Analysis of litigation strategies
- Understanding of fund usage
- Verification of case progression

## Next Steps

- [Conditional Fundraising Logic →](./06-conditional-fundraising-logic.md)
- [Multi-Round Appeal System →](./04-multi-round-appeal-system.md)
- [Testing Strategy and Chaos Testing →](./09-testing-strategy-chaos-testing.md)
