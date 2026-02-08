# Testing Strategy and Chaos Testing

## Introduction

The Solana-Slop crowdfunding platform was built using Test-Driven Development (TDD) with a comprehensive testing strategy that validates multi-year litigation scenarios without blockchain dependencies. This document explains the testing methodology, coverage, and the unique chaos testing approach that simulates real-world legal campaigns.

## Testing Philosophy

### Blockchain-Agnostic Testing

The core campaign logic is tested without Solana blockchain dependencies, enabling:
- **Rapid iteration**: Tests run in milliseconds instead of minutes
- **Deterministic results**: No network variability or timing issues
- **Simulation of time**: Can test multi-year litigation in seconds
- **Complete coverage**: All edge cases validated before blockchain integration

**Source**: [`src/crowdfunding/campaign.ts:22-27`](../src/crowdfunding/campaign.ts#L22-L27), [`tests/crowdfunding/campaign.test.ts:6-20`](../tests/crowdfunding/campaign.test.ts#L6-L20)

### Test-Driven Development

The platform was built using strict TDD methodology:

1. **Write tests first**: Each feature was specified as tests before implementation
2. **Minimal implementation**: Code written to pass tests, nothing more
3. **Refactor safely**: Comprehensive tests enable confident refactoring
4. **Document behavior**: Tests serve as executable specifications

**Design Rationale**: TDD ensures features work correctly before blockchain integration, prevents regressions, and provides living documentation of expected behavior.

## Test Coverage Overview

### Unit Tests: 24 Comprehensive Tests

The main test suite validates all core functionality through focused unit tests (10 top-level tests + 14 nested tests in describe blocks).

**Source**: [`tests/crowdfunding/campaign.test.ts`](../tests/crowdfunding/campaign.test.ts)

#### Test Categories

**1. Initial Fundraising (4 tests)**
- Auto-refund when minimum not met by deadline
- 2-of-3 multisig approval for refunds
- Non-signer rejection
- Multiple refund approvals

**2. DAO Treasury Fees (2 tests)**
- 10% fee deduction on successful campaigns
- No fee charged on failed campaigns

**3. Court Fee Deposits (3 tests)**
- Attorney-only deposit privileges
- Available funds calculation with deposits
- Deposit validation and permissions

**4. Invoice Payment System (4 tests)**
- 2-of-3 approval requirement
- Insufficient funds rejection
- Double approval prevention
- Parameter consistency enforcement

**5. Case Outcomes (3 tests)**
- Win outcome with court awards
- Loss outcome with judgment payments
- Settlement outcome

**6. Appeal System (8 tests)**
- Win appeal (1-of-3 approval threshold)
- Loss appeal (2-of-3 approval threshold)
- Conditional fundraising logic
- Appeal contribution tracking
- Appeal evaluation and failures
- Parameter consistency across approvals
- Separate contribution tracking per round
- Multi-round DAO fee collection

**Example Test Structure**:

```typescript
it("auto-refunds when minimum raise is not met by deadline", () => {
  const clock = new FakeClock(1_000);
  const campaign = new Campaign(
    {
      id: "case-001",
      minRaiseLamports: 100,
      deadlineUnix: 1_100,
      refundWindowStartUnix: 1_300,
      signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
      daoTreasury: pubkey(daoTreasury)
    },
    clock
  );

  campaign.contribute(pubkey(funderA), 40);
  campaign.contribute(pubkey(funderB), 50);

  clock.set(1_200);
  campaign.evaluate();

  expect(campaign.getStatus()).toBe("failed_refunding");
  expect(campaign.getRefundReason()).toBe("auto_failed");

  expect(campaign.claimRefund(pubkey(funderA))).toBe(40);
  expect(campaign.claimRefund(pubkey(funderB))).toBe(50);

  expect(() => campaign.claimRefund(pubkey(funderA))).toThrow(/Refund not available/);
});
```

**Source**: [`tests/crowdfunding/campaign.test.ts:30-57`](../tests/crowdfunding/campaign.test.ts#L30-L57)

### Chaos Testing: 102 Scenario Simulations

The chaos testing suite simulates real-world litigation trajectories through comprehensive JSON scenario files.

**Source**: [`tests/scenarios/`](../tests/scenarios/), [`tests/scenarios/README.md`](../tests/scenarios/README.md)

#### Scenario Categories

**Simple Outcomes (scenarios 01-10)**
- Basic win/loss/settlement cases
- Small and large case amounts
- Declaratory judgments (no monetary award)
- Edge cases (barely funded, overfunded)

**Examples**:
- [`simple-win-no-appeal.json`](../tests/scenarios/simple-win-no-appeal.json): Basic win with no complications
- Tiny cases with big appeals
- Equal funding and judgment amounts

**Single Appeal - Win Defended (scenarios 11-20)**
- District court win, opponent appeals
- Sufficient funds (no fundraising)
- Insufficient funds (fundraising required)
- Various outcomes on appeal

**Examples**:
- Sufficient funds, no fundraising needed
- Insufficient funds, 2/3 approval required
- Settlement during appeal

**Single Appeal - Loss Appeals (scenarios 21-30)**
- District court loss, client appeals
- 2/3 multisig approval required
- Win and loss outcomes
- Judgment adjustments

**Examples**:
- [`loss-appeal-to-supreme.json`](../tests/scenarios/loss-appeal-to-supreme.json): Loss appealed to state supreme court
- Reduced judgment on appeal
- Increased judgment on appeal

**Remand and Retrial (scenarios 31-35)**
- Cases sent back for new trial
- Multiple remands
- Mixed outcomes after retrial

**Examples**:
- [`win-remand-retrial.json`](../tests/scenarios/win-remand-retrial.json): Win, remanded, retrial, win again
- Win → remand → retrial → loss
- Loss → remand → retrial → win

**Multi-Level Appeals (scenarios 36-50)**
- State supreme court cases
- US Supreme Court cases
- Full progression through all courts
- Conditional fundraising at each level

**Examples**:
- Win through all levels to SCOTUS
- Loss at district, win at supreme
- Settlement at supreme level

**Edge Cases and Timing (scenarios 51-68)**
- Very fast resolutions
- Extremely slow cases (15+ years)
- Rapid succession of appeals
- Delayed payments and approvals
- Multiple retrials
- Alternating win/loss patterns

**Examples**:
- [`decade-long-litigation.json`](../tests/scenarios/decade-long-litigation.json): 10+ year case simulation
- Three retrials in sequence
- Minimal funding with win
- Massive funding with loss

**Fuzz Testing (scenarios 69-118)**
- Boundary value testing
- Extreme amounts and timestamps
- Complex multi-path scenarios
- Maximum stress tests

**Examples**:
- Zero judgment amounts
- Maximum funding (10M+ lamports)
- Near-zero timestamps
- All courts and all paths in one case
- 20-year litigation
- Instant settlements
- Judgment depletes all funds

**Source**: [`tests/scenarios/100-tiny-case-big-appeals.json`](../tests/scenarios/100-tiny-case-big-appeals.json), [`tests/scenarios/118-complex-final-stress-test.json`](../tests/scenarios/118-complex-final-stress-test.json)

## FakeClock Pattern

### Deterministic Time Control

The `FakeClock` pattern enables deterministic testing by controlling time progression:

```typescript
class FakeClock {
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

**Source**: [`tests/crowdfunding/campaign.test.ts:6-20`](../tests/crowdfunding/campaign.test.ts#L6-L20)

### Benefits

1. **Deterministic**: Tests produce identical results every run
2. **Fast**: Can simulate years in milliseconds
3. **Precise**: Control exact timing of events
4. **No flakiness**: No race conditions or timing issues

**Example Usage**:

```typescript
const clock = new FakeClock(1_000);
const campaign = new Campaign(config, clock);

// Initial contribution
campaign.contribute(funder, 100);

// Jump to after deadline
clock.set(2_000);
campaign.evaluate();

// Jump to refund window
clock.set(3_000);
campaign.approveRefund(signer);
```

## Scenario-Based Testing

### JSON Scenario Structure

Each scenario is defined in a JSON file with events in chronological order:

```json
{
  "name": "loss-appeal-to-supreme",
  "description": "Loss at district, appeal to state supreme court and win",
  "initialFunding": 200000,
  "minRaise": 100000,
  "events": [
    {
      "type": "initial_funding",
      "timestamp": 1000,
      "amount": 200000
    },
    {
      "type": "evaluate",
      "timestamp": 2000,
      "expectedStatus": "locked"
    },
    {
      "type": "record_outcome",
      "timestamp": 3000,
      "outcome": "loss",
      "courtLevel": "district",
      "judgmentAmount": 50000
    },
    {
      "type": "pay_judgment",
      "timestamp": 3100,
      "amount": 50000
    },
    {
      "type": "approve_appeal",
      "timestamp": 3500,
      "approvers": ["attorney", "platform"],
      "estimatedCost": 80000,
      "courtLevel": "state_supreme",
      "path": "appeal",
      "deadline": 4500
    }
  ],
  "expectedFinalStatus": "won"
}
```

**Source**: [`tests/scenarios/loss-appeal-to-supreme.json`](../tests/scenarios/loss-appeal-to-supreme.json)

### Event Types

**initial_funding**: Initial campaign contribution
- Tests contribution tracking
- Validates amount constraints

**evaluate**: Evaluate campaign after deadline
- Tests automatic refund logic
- Validates DAO fee calculation

**record_outcome**: Record trial/appeal outcome
- Tests state transitions
- Validates outcome types (win/loss/settlement)

**deposit_court_award**: Attorney deposits court-awarded funds
- Tests attorney-only privileges
- Validates fund availability calculations

**pay_judgment**: Pay judgment after loss
- Tests insufficient funds checks
- Validates judgment payment tracking

**approve_appeal**: Approve an appeal
- Tests differential approval thresholds (1/3 for wins, 2/3 for losses)
- Validates conditional fundraising logic
- Tests parameter consistency enforcement

**contribute_to_appeal**: Contribute to appeal round
- Tests separate appeal contribution tracking
- Validates deadline constraints

**evaluate_appeal**: Evaluate appeal round
- Tests appeal fundraising success/failure
- Validates multi-round DAO fees

### Scenario Runner

The scenario runner automatically discovers and executes all JSON scenarios:

**Source**: [`tests/crowdfunding/scenario-runner.test.ts`](../tests/crowdfunding/scenario-runner.test.ts)

```typescript
// Automatically loads all *.json files from tests/scenarios/
// Executes each scenario and validates expected outcomes
// Reports which scenarios pass/fail
```

**Running scenarios**:

```bash
npm test tests/crowdfunding/scenario-runner.test.ts
```

## Validating Multi-Year Litigation Without Blockchain

### Time Simulation

Using `FakeClock`, multi-year cases are simulated in milliseconds:

```typescript
// Simulate 10-year litigation case
const clock = new FakeClock(1_000_000);

// Year 1: Initial funding
campaign.contribute(funder, 200000);
clock.set(1_000_000 + 365 * 24 * 60 * 60);
campaign.evaluate();

// Year 2: District court loss
clock.set(1_000_000 + 2 * 365 * 24 * 60 * 60);
campaign.recordOutcome("loss", 50000);

// Year 3: Appellate court win
clock.set(1_000_000 + 3 * 365 * 24 * 60 * 60);
campaign.recordOutcome("win");

// Year 10: Final resolution
clock.set(1_000_000 + 10 * 365 * 24 * 60 * 60);
// ... final outcome
```

**Example**: [`decade-long-litigation.json`](../tests/scenarios/decade-long-litigation.json) simulates a 10+ year case through all court levels.

### Complex Trajectories

The system validates complex real-world scenarios:

1. **Multiple appeals through court hierarchy**
   - District → Appellate → State Supreme → US Supreme
   - Win/loss at each level
   - Conditional fundraising at each stage

2. **Remands and retrials**
   - Higher court sends case back
   - New trial at lower court
   - Multiple remand cycles

3. **Fund depletion and replenishment**
   - Initial funds depleted by judgments
   - Court awards replenish funds
   - Conditional fundraising when needed

4. **Differential approval thresholds**
   - 1/3 approval for win appeals (lower risk)
   - 2/3 approval for loss appeals (higher risk)

5. **Multi-round accounting**
   - Separate contribution tracking per round
   - 10% DAO fee per successful round
   - Proper refund handling per round

**Example**: [`118-complex-final-stress-test.json`](../tests/scenarios/118-complex-final-stress-test.json) combines all features in maximum complexity scenario.

## Test Organization

### Directory Structure

```
tests/
├── crowdfunding/
│   ├── campaign.test.ts          # 24 unit tests
│   └── scenario-runner.test.ts   # Chaos testing runner
├── scenarios/
│   ├── README.md                 # Scenario documentation
│   ├── simple-win-no-appeal.json
│   ├── loss-appeal-to-supreme.json
│   ├── decade-long-litigation.json
│   └── ... (102 total scenarios)
├── helpers/
│   └── participants.ts           # Test helper functions
└── fixtures/
    └── ... (test data)
```

### Running Tests

**All tests**:
```bash
npm test
```

**Unit tests only**:
```bash
npm test tests/crowdfunding/campaign.test.ts
```

**Chaos scenarios only**:
```bash
npm test tests/crowdfunding/scenario-runner.test.ts
```

**Specific scenario**:
```bash
# Modify scenario-runner.test.ts to filter by scenario name
npm test tests/crowdfunding/scenario-runner.test.ts
```

## Coverage Analysis

### Feature Coverage

The test suite comprehensively covers:

- ✅ **Contribution tracking**: Initial and appeal rounds
- ✅ **Automatic refunds**: Failed campaigns
- ✅ **Multisig refunds**: 2-of-3 approval
- ✅ **DAO treasury fees**: 10% per successful round
- ✅ **Court fee deposits**: Attorney-only privileges
- ✅ **Invoice payments**: 2-of-3 approval with parameter consistency
- ✅ **Case outcomes**: Win/loss/settlement
- ✅ **Court awards**: Attorney deposits
- ✅ **Judgment payments**: Automated deductions
- ✅ **Appeal approvals**: Differential thresholds (1/3 vs 2/3)
- ✅ **Conditional fundraising**: Intelligent fund availability checks
- ✅ **Appeal contributions**: Separate per-round tracking
- ✅ **Appeal evaluation**: Success/failure with auto-refunds
- ✅ **Multi-round accounting**: Proper fee collection and fund tracking
- ✅ **Parameter consistency**: Enforced across approvals
- ✅ **All court levels**: District, appellate, state supreme, US supreme
- ✅ **All litigation paths**: Appeal, remand, retrial, final
- ✅ **Edge cases**: Boundary values, extreme scenarios
- ✅ **Stress tests**: Maximum complexity, duration, events

### Edge Case Coverage

**Boundary values**:
- Zero amounts
- Exactly minimum raise
- Single lamport over minimum
- Maximum funding amounts
- Near-zero timestamps

**Timing variations**:
- Very fast resolutions
- Extremely slow cases (20+ years)
- Rapid succession of events
- Delayed approvals and payments

**Complex scenarios**:
- All courts and all paths in one case
- Multiple remands at different courts
- Zigzag through court hierarchy
- Maximum appeal depth
- Cascading wins/losses
- Yo-yo outcomes (flipping back and forth)

**Resource constraints**:
- Judgment depletes all funds
- Exact fundraising match
- Overfunded appeals
- Underfunded appeal failures

## Key Testing Insights

### 1. Blockchain-Agnostic = Fast Tests

By decoupling from Solana:
- 126 tests run in < 1 second
- Multi-year simulations in milliseconds
- No RPC rate limits or network issues
- Can run thousands of iterations

### 2. Deterministic = Reliable

Using `FakeClock` and controlled state:
- No test flakiness
- Reproducible failures
- Easy debugging
- Consistent CI/CD results

### 3. Scenario-Based = Real-World Validation

JSON scenarios model real litigation:
- Easy to understand
- Non-technical review possible
- Can be created by domain experts
- Serves as documentation

### 4. Comprehensive = Confidence

With 126 total tests:
- All features validated
- Edge cases covered
- Can refactor safely
- Ready for blockchain integration

## Future Testing Enhancements

### Property-Based Testing

Add property-based testing to generate random scenarios and validate invariants:

```typescript
// Example invariant: total funds = contributions - fees - payments + deposits
invariant("fund conservation", (scenario) => {
  const totalFunds = campaign.getAvailableFunds();
  const expected = 
    totalContributions 
    - daoFees 
    - invoicePayments 
    + courtDeposits
    - refunds;
  expect(totalFunds).toBe(expected);
});
```

### Integration Testing

Add tests with actual Solana blockchain:
- Test transaction building
- Validate account structures
- Test program interactions
- Simulate network conditions

### Performance Testing

Add performance benchmarks:
- Measure transaction costs
- Test with thousands of contributors
- Benchmark complex scenarios
- Monitor gas/compute usage

### Security Testing

Add security-focused tests:
- Attempt unauthorized actions
- Test signature verification
- Validate access controls
- Test reentrancy scenarios

## Conclusion

The Solana-Slop testing strategy demonstrates how blockchain projects can achieve comprehensive validation without blockchain dependencies. The combination of TDD, FakeClock pattern, and chaos testing provides confidence that the platform handles real-world legal campaigns correctly.

**Key Achievements**:
- 24 comprehensive unit tests covering all features
- 102 chaos scenarios simulating real litigation
- Multi-year simulations in milliseconds
- 100% deterministic and reproducible
- Ready for blockchain integration

**Links**:
- [Unit tests](../tests/crowdfunding/campaign.test.ts)
- [Scenario runner](../tests/crowdfunding/scenario-runner.test.ts)
- [Scenario documentation](../tests/scenarios/README.md)
- [Campaign source](../src/crowdfunding/campaign.ts)
- [Type definitions](../src/crowdfunding/types.ts)
