# Legal Crowdfunding Campaign Scenarios

This directory contains comprehensive JSON scenario files for chaos testing the crowdfunding platform. These scenarios simulate real-world litigation trajectories without requiring blockchain transactions.

## Overview

**Total Scenarios**: 52+ comprehensive test cases

The scenarios are organized into categories covering all possible case trajectories:

## Categories

### Simple Outcomes (01-10)
Basic win/loss/settlement scenarios with no appeals
- Small and large cases
- Various judgment amounts
- Declaratory judgments (no monetary award)
- Edge cases (barely funded, overfunded)

### Single Appeal - Win Defended (11-20)
Win at district court, opponent appeals
- Sufficient funds (no fundraising needed)
- Insufficient funds (fundraising required)
- Wins and losses on appeal
- Settlement during appeal
- Various award adjustments

### Single Appeal - Loss Appeals (21-30)
Loss at district court, client appeals
- 2/3 multisig approval required
- Win and loss outcomes
- Settlement during appeal
- Judgment reduction/increase scenarios

### Remand and Retrial (31-35)
Cases sent back for retrial
- Win → remand → retrial → win
- Win → remand → retrial → loss
- Loss → remand → retrial → win
- Multiple remands
- Settlement after remand

### Multi-Level Appeals - State Supreme (36-40)
Cases reaching state supreme court
- Win through all levels
- Loss at lower, win at supreme
- Mixed outcomes
- Settlement at supreme level

### US Supreme Court (41-43)
Cases reaching the highest court
- Full progression through all courts
- Loss reversal at SCOTUS
- Settlement at SCOTUS level

### Conditional Fundraising (44-50)
Testing the intelligent fundraising system
- Sufficient funds available (no fundraising)
- Just enough funds
- Depleted funds (fundraising required)
- Intermittent funding needs
- Large awards covering multiple appeals

### Edge Cases and Timing (51-58)
Unusual timing and complex scenarios
- Very fast resolution
- Extremely slow cases (15+ years)
- Rapid succession of appeals
- Delayed payments
- Multiple retrials
- Alternating win/loss patterns

### Special Scenarios (59-68)
Comprehensive edge cases
- Minimal vs massive funding
- Equal judgments and awards
- Cascading losses/wins
- Multiple small judgments
- Yo-yo outcomes (flipping back and forth)
- Strategic settlements
- Multi-year marathons

## Scenario Structure

Each JSON scenario file contains:

```json
{
  "name": "unique-scenario-identifier",
  "description": "Human-readable description",
  "initialFunding": 200000,
  "minRaise": 100000,
  "events": [
    {
      "type": "initial_funding | evaluate | record_outcome | deposit_court_award | pay_judgment | approve_appeal | contribute_to_appeal | evaluate_appeal",
      "timestamp": 1000,
      "...": "type-specific fields"
    }
  ],
  "expectedFinalStatus": "won | lost | settled | locked",
  "notes": "Additional information"
}
```

## Event Types

### initial_funding
Initial campaign contribution
- `amount`: Contribution in lamports

### evaluate
Evaluate campaign after deadline
- `expectedStatus`: Expected status after evaluation

### record_outcome
Record trial/appeal outcome
- `outcome`: "win" | "loss" | "settlement"
- `courtLevel`: "district" | "appellate" | "state_supreme" | "us_supreme"
- `judgmentAmount`: Optional monetary judgment

### deposit_court_award
Attorney deposits court-awarded funds
- `amount`: Award amount in lamports

### pay_judgment
Pay judgment after loss
- `amount`: Judgment amount in lamports

### approve_appeal
Approve an appeal
- `approvers`: Array of signer names ["attorney", "platform", "client"]
- `estimatedCost`: Estimated cost for appeal
- `courtLevel`: Court level for appeal
- `path`: "appeal" | "remand" | "retrial" | "final"
- `deadline`: Appeal deadline timestamp

### contribute_to_appeal
Contribute funds to active appeal round
- `amount`: Contribution in lamports

### evaluate_appeal
Evaluate appeal round after deadline
- `expectedStatus`: Expected status after evaluation

## Court Levels

- **district**: Trial court (first instance)
- **appellate**: Court of appeals (intermediate)
- **state_supreme**: State supreme court
- **us_supreme**: US Supreme Court

## Litigation Paths

- **appeal**: Standard appeal to higher court
- **remand**: Case sent back to lower court
- **retrial**: New trial ordered
- **final**: Final decision (no further appeal)

## Key Features Tested

### Conditional Fundraising
- Automatically checks available funds before initiating fundraising
- If sufficient funds exist, proceeds without community fundraising
- If insufficient, raises only the needed difference

### Differential Approval Thresholds
- **Win appeals**: 1 of 3 signers (lower risk)
- **Loss appeals**: 2 of 3 signers (higher risk)

### Multi-Round Accounting
- Each appeal round tracked separately
- 10% DAO fee collected per round
- Proper fund availability calculations

### Complex Trajectories
- Remands and retrials
- Multiple levels of appeals
- Decade-long litigation
- Conditional fundraising at each stage

## Running Scenarios

The scenario-runner test automatically loads and executes all JSON scenarios:

```bash
npm test tests/crowdfunding/scenario-runner.test.ts
```

## Adding New Scenarios

To add a new scenario:

1. Create a new JSON file in this directory
2. Follow the structure above
3. Use a sequential number (69+) for the filename
4. Add appropriate timestamps (use realistic intervals)
5. Ensure events are in chronological order
6. The scenario runner will automatically pick it up

## Coverage

These scenarios comprehensively cover:
- ✅ All court levels (district through US Supreme)
- ✅ All litigation paths (appeal, remand, retrial)
- ✅ All outcomes (win, loss, settlement)
- ✅ Conditional fundraising logic
- ✅ Differential approval thresholds
- ✅ Multi-year cases
- ✅ Complex multi-level appeals
- ✅ Edge cases and timing variations
- ✅ Fund depletion and replenishment
- ✅ Award and judgment scenarios

## Notes

- All scenarios are deterministic and repeatable
- No blockchain dependency required
- Tests run in milliseconds
- Can simulate decades of litigation
- Validates complete business logic
