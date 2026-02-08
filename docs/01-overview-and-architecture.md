# Overview and Architecture

## Introduction

The Solana-Slop crowdfunding platform is a legal funding system designed to support multi-year litigation campaigns through community crowdfunding, transparent financial controls, and intelligent multi-round appeal mechanisms.

## System Overview

This platform enables communities to fund legal cases with sophisticated features:
- **Initial fundraising** with automatic refunds if goals aren't met
- **Multi-round appeals** through various court levels
- **Transparent financial controls** via 3-signer multisig
- **Sustainable platform funding** through 10% DAO treasury fees
- **Risk-based approval thresholds** (different for wins vs losses)

## Architecture Principles

### 1. Domain-Driven Design

The codebase uses domain-driven design principles with clear separation:
- **Domain Model**: Pure TypeScript classes modeling legal campaign logic ([`src/crowdfunding/campaign.ts`](../src/crowdfunding/campaign.ts))
- **Types**: Explicit interfaces and type definitions ([`src/crowdfunding/types.ts`](../src/crowdfunding/types.ts))
- **Errors**: Domain-specific error handling ([`src/crowdfunding/errors.ts`](../src/crowdfunding/errors.ts))

**Design Rationale**: Domain logic can be developed, tested, and validated independently before Solana blockchain integration. This allows for rapid iteration and comprehensive testing without blockchain dependencies.

### 2. Blockchain-Agnostic Core

The core campaign logic is implemented without Solana dependencies:

```typescript
// Campaign uses abstract interfaces, not Solana-specific types
export class Campaign {
  constructor(config: CampaignConfig, clock: Clock) { ... }
}

// PublicKeyLike can be any string identifier
export type PublicKeyLike = string;
```

**Source**: [`src/crowdfunding/types.ts:1`](../src/crowdfunding/types.ts#L1), [`src/crowdfunding/campaign.ts:22-27`](../src/crowdfunding/campaign.ts#L22-L27)

**Design Rationale**: By using abstract interfaces like `PublicKeyLike` (string) and `Clock` (time interface), the campaign logic can:
- Run in pure TypeScript tests without Solana RPC
- Simulate years of litigation in milliseconds
- Be easily ported to other blockchains
- Support deterministic testing with fake clocks

### 3. Test-Driven Development

The system was built using TDD with comprehensive coverage:
- **24 unit tests** covering all features and edge cases
- **102 chaos scenarios** simulating real-world litigation trajectories
- **No blockchain dependency** for core logic tests

**Source**: [`tests/crowdfunding/campaign.test.ts`](../tests/crowdfunding/campaign.test.ts), [`tests/scenarios/`](../tests/scenarios/)

**Design Rationale**: TDD ensures:
- Features work correctly before blockchain integration
- Edge cases are handled properly
- Refactoring is safe and validated
- Multi-year scenarios can be tested in milliseconds

### 4. Immutable State Transitions

The Campaign uses clear state transitions with validation:

```typescript
export type CampaignStatus = 
  | "active"           // Accepting initial contributions
  | "locked"           // Funds locked, awaiting outcome
  | "failed_refunding" // Auto-refund (goal not met)
  | "refunding"        // Multisig-approved refund
  | "settled"          // Case settled
  | "won"              // Case won, can deposit awards
  | "lost"             // Case lost, must pay judgment
  | "appeal_active";   // Appeal fundraising active
```

**Source**: [`src/crowdfunding/types.ts:20`](../src/crowdfunding/types.ts#L20)

**Design Rationale**: Explicit state types with validation prevent invalid transitions and make the business logic clear. Each state has specific allowed operations enforced by the code.

## Component Architecture

### Core Components

```
Campaign (Main State Machine)
  ├── Contribution Tracking (initial + appeal rounds)
  ├── Refund Management (auto-failed + multisig)
  ├── DAO Fee Calculation (10% per round)
  ├── Court Award Tracking (attorney deposits)
  ├── Invoice Payment System (2-of-3 approval)
  ├── Appeal Round Management (multi-level)
  └── Fund Availability (aggregated across sources)
```

### Data Structures

The Campaign class uses efficient internal data structures:

```typescript
class Campaign {
  // Configuration (immutable)
  private readonly config: CampaignConfig;
  private readonly clock: Clock;
  
  // Initial round contributions
  private readonly contributions = new Map<PublicKeyLike, number>();
  
  // Appeal contributions (isolated per round)
  private readonly appealContributionsByRound = new Map<number, Map<PublicKeyLike, number>>();
  
  // Multisig approvals
  private readonly approvals = new Set<PublicKeyLike>();
  private readonly appealApprovals = new Set<PublicKeyLike>();
  
  // Invoice tracking
  private readonly invoicePayments: InvoicePayment[] = [];
  private readonly pendingInvoiceApprovals = new Map<string, Set<PublicKeyLike>>();
  
  // Appeal rounds
  private readonly appealRounds: AppealRound[] = [];
}
```

**Source**: [`src/crowdfunding/campaign.ts:22-43`](../src/crowdfunding/campaign.ts#L22-L43)

**Design Rationale**:
- **Maps for contributions**: O(1) lookup and update performance
- **Sets for approvals**: Automatic deduplication, O(1) membership checks
- **Separate appeal tracking**: Prevents refund accounting issues across rounds
- **Readonly config**: Prevents accidental mutation of campaign parameters

## Information Flow

### 1. Initial Fundraising Flow

```
create campaign → contributions → deadline → evaluate
  → [goal met] → locked + DAO fee deducted
  → [goal not met] → failed_refunding + auto-refunds
```

### 2. Litigation Outcome Flow

```
locked → record outcome
  → settlement → settled
  → win → won → attorney deposits award
  → loss → lost → pay judgment
```

### 3. Appeal Flow

```
won/lost → approve appeal (1/3 or 2/3)
  → check available funds
    → [sufficient] → locked immediately
    → [insufficient] → appeal_active → contributions → evaluate appeal
```

### 4. Invoice Payment Flow

```
locked → attorney submits invoice
  → approve (1st signer) → pending
  → approve (2nd signer) → payment executes
```

## Design Philosophy

### Fail-Safe Defaults

The system uses safe defaults throughout:
- Campaigns start in `"active"` state
- Refunds automatically open if goals aren't met
- Judgment amounts default to `0` if not specified
- Appeal approvals require explicit parameters

**Design Rationale**: Safe defaults prevent silent failures and ensure the system behaves correctly even with incomplete data.

### Explicit Validation

Every state transition includes validation:

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
  // ... validation passes, execute action
}
```

**Source**: [`src/crowdfunding/campaign.ts:119-138`](../src/crowdfunding/campaign.ts#L119-L138)

**Design Rationale**: Comprehensive validation at method entry ensures:
- Invalid operations are caught early
- Clear error messages guide developers
- State machine integrity is maintained
- No silent failures or corrupted state

### Separation of Concerns

Each component has a single responsibility:
- **Campaign**: Business logic and state management
- **Types**: Interfaces and type definitions
- **Errors**: Error handling
- **Tests**: Validation and examples

**Design Rationale**: Clear separation makes the code:
- Easier to understand and maintain
- Simpler to test in isolation
- More reusable across different contexts
- Less prone to coupling issues

## Scalability Considerations

### Memory Efficiency

The implementation uses efficient data structures:
- Maps for O(1) lookups instead of arrays
- Sets for unique collections
- Separate tracking per appeal round (prevents unbounded growth in single structure)

### Gas Optimization (Future)

While currently implemented in TypeScript, the design considers future Solana implementation:
- Minimal state mutations
- Batch operations where possible
- Clear separation of read and write operations
- Efficient validation checks early in methods

## Security Principles

### 1. Multisig Governance

All critical operations require multisig approval:
- **Refunds**: 2 of 3 signers
- **Invoice payments**: 2 of 3 signers  
- **Win appeals**: 1 of 3 signers (lower risk)
- **Loss appeals**: 2 of 3 signers (higher risk)

### 2. Attorney Privileges

The attorney (first signer) has special unilateral powers:
- Deposit court-awarded fees
- Deposit court awards after wins

**Design Rationale**: Attorney is trusted party receiving funds directly from courts, no approval needed for depositing funds into the campaign.

### 3. Immutable Configuration

Campaign configuration cannot be changed after creation:
- Signers are fixed
- Minimum raise cannot be adjusted
- Deadlines are immutable

**Design Rationale**: Prevents manipulation of campaign parameters after funders have committed.

## Next Steps

- [Core Concepts and Domain Model →](./02-core-concepts-domain-model.md)
- [Design Decisions and Rationale →](./11-design-decisions-rationale.md)
- [API Reference Guide →](./10-api-reference-guide.md)
