# Usage Examples and Workflows

## Introduction

This document provides practical, real-world examples of using the Solana-Slop crowdfunding platform. Each workflow demonstrates complete scenarios from campaign creation through final resolution, with code snippets and explanations.

## Basic Workflow: Successful Campaign

### Scenario: Small Civil Rights Case

A community wants to fund a civil rights lawsuit with a $100,000 goal.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Setup: Create clock and participants
const clock = {
  now: () => Math.floor(Date.now() / 1000)
};

const attorney = "attorney_wallet_address";
const platform = "platform_wallet_address";
const client = "client_wallet_address";
const daoTreasury = "dao_treasury_address";

// Step 1: Create campaign with 30-day deadline
const campaign = new Campaign(
  {
    id: "civil-rights-001",
    minRaiseLamports: 100_000_000, // 100k lamports (symbolic)
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60, // 30 days from now
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60, // 60 days
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

console.log("Campaign created, status:", campaign.getStatus()); // "active"

// Step 2: Community members contribute
campaign.contribute("contributor_1", 40_000_000);
campaign.contribute("contributor_2", 35_000_000);
campaign.contribute("contributor_3", 30_000_000);

console.log("Total raised:", campaign.getTotalRaised()); // 105,000,000

// Step 3: After deadline, evaluate campaign
// (In real app, this would be triggered by time-based job)
campaign.evaluate();

console.log("Status after evaluation:", campaign.getStatus()); // "locked"
console.log("DAO fee collected:", campaign.getDaoFeeAmount()); // 10,500,000 (10%)
console.log("Available funds:", campaign.getAvailableFunds()); // 94,500,000

// Step 4: Pay attorney's initial retainer
campaign.approveInvoicePayment(attorney, "invoice-retainer-001", 30_000_000, attorney);
campaign.approveInvoicePayment(platform, "invoice-retainer-001", 30_000_000, attorney);

console.log("Invoice payments:", campaign.getInvoicePayments());
// [{ invoiceId: "invoice-retainer-001", amount: 30000000, recipient: attorney, approvers: [attorney, platform] }]

console.log("Available after payment:", campaign.getAvailableFunds()); // 64,500,000

// Step 5: Case goes to trial, client wins!
campaign.recordOutcome("win");
console.log("Outcome:", campaign.getOutcome()); // "win"
console.log("Status:", campaign.getStatus()); // "won"

// Step 6: Attorney deposits court award
campaign.depositCourtAward(attorney, 200_000_000); // Client awarded $200k
console.log("Available after award:", campaign.getAvailableFunds()); // 264,500,000

// Step 7: Pay final attorney fees
campaign.approveInvoicePayment(attorney, "invoice-final-001", 50_000_000, attorney);
campaign.approveInvoicePayment(client, "invoice-final-001", 50_000_000, attorney);

console.log("Final available funds:", campaign.getAvailableFunds()); // 214,500,000
// Remaining funds distributed according to terms
```

**Key Points**:
- 10% DAO fee collected on initial $105k raised ($10.5k)
- Two multisig approvals required for invoice payments
- Attorney unilaterally deposits court award
- Final pool: $214.5k available after all fees and payments

**Source**: [`src/crowdfunding/campaign.ts`](../src/crowdfunding/campaign.ts)

---

## Failed Campaign with Automatic Refunds

### Scenario: Campaign Fails to Meet Goal

Campaign doesn't reach minimum funding by deadline, triggering automatic refunds.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Create campaign with 50k minimum
const campaign = new Campaign(
  {
    id: "case-underfunded",
    minRaiseLamports: 50_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Only partial funding received
campaign.contribute("contributor_1", 20_000_000);
campaign.contribute("contributor_2", 15_000_000);

console.log("Total raised:", campaign.getTotalRaised()); // 35,000,000
console.log("Minimum needed:", 50_000_000);

// After deadline, evaluate
campaign.evaluate();

console.log("Status:", campaign.getStatus()); // "failed_refunding"
console.log("Refund reason:", campaign.getRefundReason()); // "auto_failed"
console.log("DAO fee:", campaign.getDaoFeeAmount()); // 0 (no fee on failed campaigns)

// Contributors claim refunds
if (campaign.canRefund("contributor_1")) {
  const refund1 = campaign.claimRefund("contributor_1");
  console.log("Contributor 1 refunded:", refund1); // 20,000,000
}

if (campaign.canRefund("contributor_2")) {
  const refund2 = campaign.claimRefund("contributor_2");
  console.log("Contributor 2 refunded:", refund2); // 15,000,000
}

// Cannot claim twice
try {
  campaign.claimRefund("contributor_1");
} catch (error) {
  console.error("Error:", error.message); // "Refund not available for this funder"
}
```

**Key Points**:
- Automatic refund when minimum not met
- No DAO fee charged on failed campaigns
- Contributors get 100% of their contributions back
- Cannot claim refund twice

---

## Multisig Refund After Successful Raise

### Scenario: Case Dismissed, Multisig Approves Refunds

Campaign succeeds but case is dismissed early. Multisig signers approve refunds.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Campaign succeeds
const campaign = new Campaign(
  {
    id: "case-dismissed",
    minRaiseLamports: 50_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 45 * 24 * 60 * 60, // 45 days
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

campaign.contribute("contributor_1", 30_000_000);
campaign.contribute("contributor_2", 25_000_000);

campaign.evaluate();
console.log("Status:", campaign.getStatus()); // "locked"
console.log("DAO fee:", campaign.getDaoFeeAmount()); // 5,500,000 (10%)

// Case dismissed before trial
// Signers decide to refund contributors

// Wait for refund window to start
// (In real app, check clock.now() >= refundWindowStartUnix)

// First approval
campaign.approveRefund(attorney);
console.log("Approvals:", campaign.getApprovals().length); // 1
console.log("Status:", campaign.getStatus()); // "locked" (still need one more)

// Second approval triggers refund
campaign.approveRefund(platform);
console.log("Approvals:", campaign.getApprovals().length); // 2
console.log("Status:", campaign.getStatus()); // "refunding"
console.log("Refund reason:", campaign.getRefundReason()); // "multisig"

// Contributors claim refunds (get original amounts, not minus DAO fee)
const refund1 = campaign.claimRefund("contributor_1");
const refund2 = campaign.claimRefund("contributor_2");

console.log("Refunds:", refund1, refund2); // 30,000,000, 25,000,000
console.log("DAO keeps fee:", campaign.getDaoFeeAmount()); // 5,500,000
```

**Key Points**:
- Requires 2 of 3 signers to approve refund
- Must wait until refund window starts
- Contributors get back their original contributions
- DAO retains the 10% fee (platform provided service)

---

## Win Appeal Workflow

### Scenario: Win at District, Opponent Appeals, Client Defends and Wins

Client wins at district court. Opponent appeals. Client defends with 1 approval (low risk).

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Initial campaign
const campaign = new Campaign(
  {
    id: "case-defended-win",
    minRaiseLamports: 100_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Fundraising and initial work
campaign.contribute("contributor_1", 120_000_000);
campaign.evaluate();
console.log("Initial funds:", campaign.getAvailableFunds()); // 108,000,000 (after 10% fee)

// Pay attorney for trial work
campaign.approveInvoicePayment(attorney, "trial-work", 60_000_000, attorney);
campaign.approveInvoicePayment(platform, "trial-work", 60_000_000, attorney);
console.log("After trial payment:", campaign.getAvailableFunds()); // 48,000,000

// Win at district court
campaign.recordOutcome("win");
console.log("Status:", campaign.getStatus()); // "won"

// Attorney deposits court award
campaign.depositCourtAward(attorney, 150_000_000);
console.log("After award:", campaign.getAvailableFunds()); // 198,000,000

// Opponent appeals - client must defend
// Win appeal requires only 1 signer approval (lower risk)
const appealDeadline = clock.now() + 60 * 24 * 60 * 60;

campaign.approveAppeal(
  attorney,
  80_000_000, // Estimated cost for appellate work
  appealDeadline,
  "appellate",
  "appeal"
);

console.log("Status after approval:", campaign.getStatus()); // "locked"
// Status is "locked" not "appeal_active" because sufficient funds exist!
// Conditional fundraising: 198M available > 80M needed, so no fundraising

const appeals = campaign.getAppealRounds();
console.log("Appeal round:", appeals[0]);
// {
//   roundNumber: 2,
//   courtLevel: "appellate",
//   path: "appeal",
//   minRaiseLamports: 0,
//   deadlineUnix: appealDeadline,
//   totalRaised: 0,
//   fundraisingNeeded: false
// }

// Pay attorney for appellate work
campaign.approveInvoicePayment(attorney, "appellate-work", 70_000_000, attorney);
campaign.approveInvoicePayment(client, "appellate-work", 70_000_000, attorney);

// Win on appeal - affirmed
campaign.recordOutcome("win");
console.log("Final status:", campaign.getStatus()); // "won"
console.log("Final funds:", campaign.getAvailableFunds()); // 128,000,000

// Distribute remaining funds according to terms
```

**Key Points**:
- Win appeal requires only 1 signer (attorney) approval
- Conditional fundraising: sufficient funds exist, no community fundraising needed
- Court award from initial win funds the appeal
- No DAO fee on appeal round (no fundraising occurred)

**Source**: [`src/crowdfunding/campaign.ts:348-428`](../src/crowdfunding/campaign.ts#L348-L428)

---

## Loss Appeal Workflow

### Scenario: Loss at District, Client Appeals, Wins on Appeal

Client loses at district, wants to appeal. Requires 2/3 approval (higher risk).

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Initial campaign
const campaign = new Campaign(
  {
    id: "case-loss-appeal-win",
    minRaiseLamports: 120_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Fundraising
campaign.contribute("contributor_1", 130_000_000);
campaign.evaluate();
console.log("Initial funds:", campaign.getAvailableFunds()); // 117,000,000

// Pay attorney for trial
campaign.approveInvoicePayment(attorney, "trial", 80_000_000, attorney);
campaign.approveInvoicePayment(platform, "trial", 80_000_000, attorney);
console.log("After trial:", campaign.getAvailableFunds()); // 37,000,000

// Loss at district with $20k judgment
campaign.recordOutcome("loss", 20_000_000);
console.log("Status:", campaign.getStatus()); // "lost"
console.log("Judgment:", campaign.getJudgmentAmount()); // 20,000,000

// Pay judgment
campaign.payJudgment(20_000_000);
console.log("After judgment:", campaign.getAvailableFunds()); // 17,000,000

// Client wants to appeal
// Loss appeal requires 2 of 3 signers (higher risk)
const appealDeadline = clock.now() + 45 * 24 * 60 * 60;

// First approval
campaign.approveAppeal(
  attorney,
  90_000_000,
  appealDeadline,
  "appellate",
  "appeal"
);
console.log("Appeal approvals:", campaign.getAppealApprovals().length); // 1
console.log("Status:", campaign.getStatus()); // "lost" (need one more approval)

// Second approval triggers appeal
campaign.approveAppeal(
  platform,
  90_000_000, // Must match first approval
  appealDeadline,
  "appellate",
  "appeal"
);
console.log("Status after 2nd approval:", campaign.getStatus()); // "appeal_active"
// Conditional fundraising: 17M available < 90M needed, so fundraising initiated

const appeals = campaign.getAppealRounds();
console.log("Appeal round:", appeals[0]);
// {
//   roundNumber: 2,
//   courtLevel: "appellate",
//   path: "appeal",
//   minRaiseLamports: 73000000, // 90M - 17M already available
//   deadlineUnix: appealDeadline,
//   totalRaised: 0,
//   fundraisingNeeded: true
// }

// Community contributes to appeal
campaign.contributeToAppeal("contributor_2", 40_000_000);
campaign.contributeToAppeal("contributor_3", 35_000_000);
console.log("Appeal raised:", appeals[0].totalRaised); // 75,000,000

// Evaluate appeal after deadline
campaign.evaluateAppeal();
console.log("Status:", campaign.getStatus()); // "locked"
console.log("DAO fee (appeal):", campaign.getDaoFeeAmount()); // 20,500,000 total
// Initial: 13M, Appeal: 7.5M (10% of 75M)

// Pay attorney for appellate work
campaign.approveInvoicePayment(attorney, "appellate", 85_000_000, attorney);
campaign.approveInvoicePayment(client, "appellate", 85_000_000, attorney);

// Win on appeal!
campaign.recordOutcome("win");
console.log("Final status:", campaign.getStatus()); // "won"
```

**Key Points**:
- Loss appeal requires 2 of 3 signers (higher risk consensus)
- Conditional fundraising: only raises difference ($73M = $90M - $17M available)
- 10% DAO fee collected on appeal round ($7.5M on $75M raised)
- Separate contribution tracking for appeal round
- Appeal contributors can be refunded separately if appeal fails

**Source**: [`tests/scenarios/loss-appeal-to-supreme.json`](../tests/scenarios/loss-appeal-to-supreme.json)

---

## Multi-Round Appeal: All the Way to Supreme Court

### Scenario: Case Goes Through All Court Levels

Complex case with multiple appeals through entire court hierarchy.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Initial campaign - district court
const campaign = new Campaign(
  {
    id: "case-supreme-court",
    minRaiseLamports: 150_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Round 1: Initial district court campaign
campaign.contribute("contributor_1", 160_000_000);
campaign.evaluate();
console.log("Round 1 - Initial:", campaign.getAvailableFunds()); // 144M

// Pay for district trial
campaign.approveInvoicePayment(attorney, "district-trial", 100_000_000, attorney);
campaign.approveInvoicePayment(platform, "district-trial", 100_000_000, attorney);

// Win at district
campaign.recordOutcome("win");
campaign.depositCourtAward(attorney, 200_000_000);
console.log("After district win:", campaign.getAvailableFunds()); // 244M

// Round 2: Opponent appeals to appellate court
campaign.approveAppeal(attorney, 90_000_000, clock.now() + 60 * 24 * 60 * 60, "appellate", "appeal");
console.log("Round 2 - Appellate, status:", campaign.getStatus()); // "locked" (sufficient funds)

campaign.approveInvoicePayment(attorney, "appellate", 85_000_000, attorney);
campaign.approveInvoicePayment(client, "appellate", 85_000_000, attorney);

// Win at appellate (affirmed)
campaign.recordOutcome("win");
console.log("After appellate win:", campaign.getAvailableFunds()); // 159M

// Round 3: Opponent appeals to state supreme court
campaign.approveAppeal(attorney, 120_000_000, clock.now() + 60 * 24 * 60 * 60, "state_supreme", "appeal");
console.log("Round 3 - State Supreme, status:", campaign.getStatus()); // "locked"

campaign.approveInvoicePayment(attorney, "state-supreme", 110_000_000, attorney);
campaign.approveInvoicePayment(platform, "state-supreme", 110_000_000, attorney);

// Win at state supreme (affirmed)
campaign.recordOutcome("win");
console.log("After state supreme win:", campaign.getAvailableFunds()); // 49M

// Round 4: Opponent petitions US Supreme Court
// Insufficient funds, need fundraising
campaign.approveAppeal(attorney, 150_000_000, clock.now() + 90 * 24 * 60 * 60, "us_supreme", "appeal");
console.log("Round 4 - US Supreme, status:", campaign.getStatus()); // "appeal_active"

const lastAppeal = campaign.getAppealRounds()[campaign.getAppealRounds().length - 1];
console.log("Need to raise:", lastAppeal.minRaiseLamports); // 101M (150M - 49M available)

// Community rallies for SCOTUS defense
campaign.contributeToAppeal("contributor_4", 60_000_000);
campaign.contributeToAppeal("contributor_5", 50_000_000);

campaign.evaluateAppeal();
console.log("After SCOTUS funding:", campaign.getStatus()); // "locked"

campaign.approveInvoicePayment(attorney, "scotus", 140_000_000, attorney);
campaign.approveInvoicePayment(client, "scotus", 140_000_000, attorney);

// Win at US Supreme Court (affirmed)
campaign.recordOutcome("win");
console.log("Final status:", campaign.getStatus()); // "won"

// Summary
console.log("Current round:", campaign.getCurrentRound()); // 5
console.log("Appeal rounds:", campaign.getAppealRounds().length); // 4
console.log("Total DAO fees:", campaign.getDaoFeeAmount()); // 27M
// Initial 160M (16M) + SCOTUS 110M (11M) = 27M total fees

console.log("Total raised across all rounds:", campaign.getTotalRaised()); // 270M
console.log("Invoice payments:", campaign.getInvoicePayments().length); // 5
```

**Key Points**:
- Four appeal rounds through complete court hierarchy
- Conditional fundraising at each level (only when needed)
- DAO fees collected on initial + SCOTUS rounds (only rounds with fundraising)
- Win appeals require only 1 approval throughout
- Proper accounting across multiple years of litigation

**Source**: [`tests/scenarios/41-win-all-courts-to-scotus.json`](../tests/scenarios/41-win-all-courts-to-scotus.json)

---

## Remand and Retrial Workflow

### Scenario: Appellate Court Remands for New Trial

Win at district, opponent appeals, appellate court remands case for retrial.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Initial campaign
const campaign = new Campaign(
  {
    id: "case-remand-retrial",
    minRaiseLamports: 100_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Initial fundraising
campaign.contribute("contributor_1", 110_000_000);
campaign.evaluate();

// Pay for district trial
campaign.approveInvoicePayment(attorney, "district", 70_000_000, attorney);
campaign.approveInvoicePayment(platform, "district", 70_000_000, attorney);

// Win at district
campaign.recordOutcome("win");
campaign.depositCourtAward(attorney, 180_000_000);
console.log("After district win:", campaign.getAvailableFunds()); // 219M

// Opponent appeals
campaign.approveAppeal(attorney, 80_000_000, clock.now() + 60 * 24 * 60 * 60, "appellate", "appeal");

campaign.approveInvoicePayment(attorney, "appellate", 75_000_000, attorney);
campaign.approveInvoicePayment(client, "appellate", 75_000_000, attorney);

// Appellate court remands for new trial (not a simple win/loss)
// Record as technical loss with 0 judgment (remand sends back to district)
campaign.recordOutcome("loss", 0); // 0 judgment on remand
console.log("Status after remand:", campaign.getStatus()); // "lost"
console.log("Judgment:", campaign.getJudgmentAmount()); // 0

// Approve retrial (requires 2/3 since status is "lost")
campaign.approveAppeal(attorney, 90_000_000, clock.now() + 60 * 24 * 60 * 60, "district", "retrial");
campaign.approveAppeal(platform, 90_000_000, clock.now() + 60 * 24 * 60 * 60, "district", "retrial");
console.log("Status after retrial approval:", campaign.getStatus()); // "locked"
// Conditional fundraising: 144M available > 90M needed

const retrialRound = campaign.getAppealRounds().find(r => r.path === "retrial");
console.log("Retrial round:", retrialRound);
// {
//   roundNumber: 3,
//   courtLevel: "district",
//   path: "retrial",
//   minRaiseLamports: 0,
//   fundraisingNeeded: false
// }

// Pay for retrial
campaign.approveInvoicePayment(attorney, "retrial", 85_000_000, attorney);
campaign.approveInvoicePayment(client, "retrial", 85_000_000, attorney);

// Win on retrial
campaign.recordOutcome("win");
campaign.depositCourtAward(attorney, 200_000_000);
console.log("Final status:", campaign.getStatus()); // "won"
console.log("Final funds:", campaign.getAvailableFunds()); // 259M
```

**Key Points**:
- Remand recorded as loss with 0 judgment
- Retrial path goes back to same court level
- Requires 2/3 approval (since status is "lost" from remand)
- Can win on retrial after remand

**Source**: [`tests/scenarios/win-remand-retrial.json`](../tests/scenarios/win-remand-retrial.json)

---

## Settlement Workflow

### Scenario: Case Settles Mid-Litigation

Parties reach settlement agreement during appeal process.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Initial campaign
const campaign = new Campaign(
  {
    id: "case-settlement",
    minRaiseLamports: 80_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

// Fundraising
campaign.contribute("contributor_1", 90_000_000);
campaign.evaluate();
console.log("Initial funds:", campaign.getAvailableFunds()); // 81M

// Pay for district trial
campaign.approveInvoicePayment(attorney, "district", 55_000_000, attorney);
campaign.approveInvoicePayment(platform, "district", 55_000_000, attorney);

// Loss at district with $30k judgment
campaign.recordOutcome("loss", 30_000_000);
campaign.payJudgment(30_000_000);
console.log("After judgment:", campaign.getAvailableFunds()); // -4M (need funds!)

// Parties negotiate settlement during appeal preparation
// Settlement agreement: $50k payment, no admission of liability

// Record settlement (terminates case)
campaign.recordOutcome("settlement");
console.log("Status:", campaign.getStatus()); // "settled"
console.log("Outcome:", campaign.getOutcome()); // "settlement"

// No further actions possible after settlement
try {
  campaign.approveAppeal(attorney, 50_000_000, clock.now() + 60 * 24 * 60 * 60);
} catch (error) {
  console.error("Error:", error.message); 
  // "Can only approve appeal after win or loss"
}

console.log("Final status: settled");
// Remaining funds distributed per settlement terms
```

**Key Points**:
- Settlement is terminal state - no further appeals
- Can settle at any stage (before trial, during appeal, etc.)
- Settlement doesn't have judgment amount
- No further operations after settlement

---

## Complex Invoice Payment Workflow

### Scenario: Multiple Invoices with Different Approvers

Managing multiple invoice payments with various approval combinations.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Locked campaign with funds available
const campaign = new Campaign(
  {
    id: "case-invoices",
    minRaiseLamports: 200_000_000,
    deadlineUnix: clock.now() + 30 * 24 * 60 * 60,
    refundWindowStartUnix: clock.now() + 60 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

campaign.contribute("contributor_1", 220_000_000);
campaign.evaluate();
console.log("Available:", campaign.getAvailableFunds()); // 198M

// Invoice 1: Attorney retainer (attorney + platform approve)
campaign.approveInvoicePayment(attorney, "invoice-001", 50_000_000, attorney);
console.log("Invoice 001 approvals:", campaign.getInvoiceApprovals("invoice-001").length); // 1

campaign.approveInvoicePayment(platform, "invoice-001", 50_000_000, attorney);
console.log("Invoice 001 executed");
console.log("Payments:", campaign.getInvoicePayments().length); // 1

// Invoice 2: Expert witness (platform + client approve)
campaign.approveInvoicePayment(platform, "invoice-002", 30_000_000, "expert_witness_addr");
campaign.approveInvoicePayment(client, "invoice-002", 30_000_000, "expert_witness_addr");
console.log("Invoice 002 executed");

// Invoice 3: Court filing fees (attorney + client approve)
campaign.approveInvoicePayment(attorney, "invoice-003", 5_000_000, "court_clerk_addr");
campaign.approveInvoicePayment(client, "invoice-003", 5_000_000, "court_clerk_addr");
console.log("Invoice 003 executed");

// Check all payments
const payments = campaign.getInvoicePayments();
console.log("Total payments:", payments.length); // 3
console.log("Total paid:", payments.reduce((sum, p) => sum + p.amount, 0)); // 85M

payments.forEach(payment => {
  console.log(`Invoice ${payment.invoiceId}:`);
  console.log(`  Amount: ${payment.amount}`);
  console.log(`  Recipient: ${payment.recipient}`);
  console.log(`  Approvers: ${payment.approvers.join(", ")}`);
});

// Try to approve with wrong parameters
try {
  campaign.approveInvoicePayment(attorney, "invoice-004", 20_000_000, "recipient_addr");
  campaign.approveInvoicePayment(platform, "invoice-004", 25_000_000, "recipient_addr"); // Different amount!
} catch (error) {
  console.error("Parameter mismatch:", error.message);
  // "Invoice amount and recipient must match existing approvals"
}

// Try to double-approve
try {
  campaign.approveInvoicePayment(attorney, "invoice-005", 10_000_000, "recipient_addr");
  campaign.approveInvoicePayment(attorney, "invoice-005", 10_000_000, "recipient_addr");
} catch (error) {
  console.error("Double approval:", error.message);
  // "Approver has already approved this invoice"
}

console.log("Final available:", campaign.getAvailableFunds()); // 113M
```

**Key Points**:
- Each invoice requires 2 of 3 signers (any combination)
- Parameter consistency enforced across approvals
- Cannot double-approve same invoice
- Complete audit trail of all payments

**Source**: [`src/crowdfunding/campaign.ts:198-251`](../src/crowdfunding/campaign.ts#L198-L251)

---

## Real-World Simulation: Decade-Long Litigation

### Scenario: Complex Case Over 10+ Years

Realistic long-term case with multiple appeals, awards, and fundraising rounds.

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

// Use FakeClock to simulate years of litigation
class FakeClock {
  private nowUnix: number;
  
  constructor(startUnix: number) {
    this.nowUnix = startUnix;
  }
  
  now(): number {
    return this.nowUnix;
  }
  
  advance(seconds: number): void {
    this.nowUnix += seconds;
  }
}

const ONE_YEAR = 365 * 24 * 60 * 60;
const clock = new FakeClock(1_000_000_000); // Start timestamp

// Year 1: Initial campaign
const campaign = new Campaign(
  {
    id: "decade-case",
    minRaiseLamports: 200_000_000,
    deadlineUnix: clock.now() + 90 * 24 * 60 * 60, // 90 days
    refundWindowStartUnix: clock.now() + 120 * 24 * 60 * 60,
    signers: [attorney, platform, client],
    daoTreasury: daoTreasury
  },
  clock
);

campaign.contribute("contributor_1", 250_000_000);
clock.advance(90 * 24 * 60 * 60); // 90 days pass
campaign.evaluate();
console.log("Year 1 - Campaign funded:", campaign.getAvailableFunds()); // 225M

// Year 2: District court trial
clock.advance(ONE_YEAR);
campaign.approveInvoicePayment(attorney, "district", 150_000_000, attorney);
campaign.approveInvoicePayment(platform, "district", 150_000_000, attorney);

campaign.recordOutcome("loss", 100_000_000);
campaign.payJudgment(100_000_000);
console.log("Year 2 - District loss, funds:", campaign.getAvailableFunds()); // -25M

// Year 3: Appeal to appellate court
clock.advance(ONE_YEAR);
campaign.approveAppeal(attorney, 180_000_000, clock.now() + 120 * 24 * 60 * 60, "appellate", "appeal");
campaign.approveAppeal(platform, 180_000_000, clock.now() + 120 * 24 * 60 * 60, "appellate", "appeal");

// Fundraising needed
campaign.contributeToAppeal("contributor_2", 120_000_000);
campaign.contributeToAppeal("contributor_3", 90_000_000);
clock.advance(120 * 24 * 60 * 60);
campaign.evaluateAppeal();
console.log("Year 3 - Appeal funded:", campaign.getAvailableFunds()); // 164M

// Year 4: Appellate argument and decision
clock.advance(ONE_YEAR);
campaign.approveInvoicePayment(attorney, "appellate", 160_000_000, attorney);
campaign.approveInvoicePayment(client, "appellate", 160_000_000, attorney);

campaign.recordOutcome("win");
campaign.depositCourtAward(attorney, 300_000_000);
console.log("Year 4 - Appellate win, funds:", campaign.getAvailableFunds()); // 304M

// Year 5-6: Opponent appeals to state supreme court
clock.advance(2 * ONE_YEAR);
campaign.approveAppeal(attorney, 200_000_000, clock.now() + 150 * 24 * 60 * 60, "state_supreme", "appeal");

campaign.approveInvoicePayment(attorney, "state-supreme", 190_000_000, attorney);
campaign.approveInvoicePayment(platform, "state-supreme", 190_000_000, attorney);

campaign.recordOutcome("win");
console.log("Year 6 - State supreme win, funds:", campaign.getAvailableFunds()); // 114M

// Year 7-10: Final resolution
clock.advance(4 * ONE_YEAR);
// Opponent petitions SCOTUS but cert denied - case final
console.log("Year 10 - Case final");

// Summary after 10 years
console.log("=== Decade Litigation Summary ===");
console.log("Total rounds:", campaign.getCurrentRound()); // 4
console.log("Appeal rounds:", campaign.getAppealRounds().length); // 3
console.log("Total raised:", campaign.getTotalRaised()); // 460M
console.log("DAO fees:", campaign.getDaoFeeAmount()); // 46M (10%)
console.log("Court awards:", campaign.getCourtFeesDeposited()); // 300M
console.log("Invoice payments:", campaign.getInvoicePayments().length); // 5
console.log("Final available:", campaign.getAvailableFunds()); // 114M
console.log("Final status:", campaign.getStatus()); // "won"

// All done in milliseconds using FakeClock!
```

**Key Points**:
- FakeClock simulates 10 years in milliseconds
- Multiple appeal rounds with different fundraising needs
- Conditional fundraising throughout
- Court award replenishes funds mid-litigation
- Complex accounting across years and rounds
- Complete audit trail maintained

**Source**: [`tests/scenarios/decade-long-litigation.json`](../tests/scenarios/decade-long-litigation.json), [`tests/crowdfunding/campaign.test.ts:6-20`](../tests/crowdfunding/campaign.test.ts#L6-L20)

---

## Error Handling Examples

### Common Error Scenarios

```typescript
import { Campaign } from "./crowdfunding/campaign.js";
import { CampaignError } from "./crowdfunding/errors.js";

const campaign = new Campaign(config, clock);

// Error 1: Contribute after deadline
try {
  // After deadline passes
  campaign.contribute("funder", 100_000);
} catch (error) {
  if (error instanceof CampaignError) {
    console.error("Contribution error:", error.message);
    // "Campaign deadline has passed"
  }
}

// Error 2: Non-signer approval
try {
  campaign.approveRefund("random_user");
} catch (error) {
  console.error("Approval error:", error.message);
  // "Approver is not a multisig signer"
}

// Error 3: Insufficient funds for invoice
try {
  campaign.approveInvoicePayment(attorney, "big-invoice", 999_999_999, attorney);
} catch (error) {
  console.error("Invoice error:", error.message);
  // "Insufficient funds for invoice payment"
}

// Error 4: Wrong status for operation
try {
  campaign.depositCourtAward(attorney, 100_000);
  // But status is "locked", not "won"
} catch (error) {
  console.error("Status error:", error.message);
  // "Can only deposit court awards after a win"
}

// Error 5: Parameter mismatch on approvals
try {
  campaign.approveAppeal(attorney, 100_000, deadline, "appellate", "appeal");
  campaign.approveAppeal(platform, 150_000, deadline, "appellate", "appeal"); // Different cost!
} catch (error) {
  console.error("Parameter error:", error.message);
  // "Appeal estimated cost does not match first approval"
}

// Error 6: Attorney-only operations
try {
  campaign.depositCourtFees(platform, 50_000);
  // Platform is not attorney (first signer)
} catch (error) {
  console.error("Privilege error:", error.message);
  // "Only attorney can deposit court fees"
}

// Proper error handling pattern
function safeContribute(campaign: Campaign, funder: string, amount: number): boolean {
  try {
    campaign.contribute(funder, amount);
    return true;
  } catch (error) {
    if (error instanceof CampaignError) {
      console.error("Cannot contribute:", error.message);
      // Handle gracefully, show user message
    } else {
      throw error; // Unexpected error, re-throw
    }
    return false;
  }
}
```

**Key Points**:
- All operations validate preconditions
- Clear error messages indicate problem
- Use `CampaignError` for domain errors
- Validate state before operations
- Check available funds before large operations

**Source**: [`src/crowdfunding/errors.ts`](../src/crowdfunding/errors.ts)

---

## Testing Patterns

### Using FakeClock for Testing

```typescript
import { Campaign } from "./crowdfunding/campaign.js";

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
  
  advance(seconds: number): void {
    this.nowUnix += seconds;
  }
}

// Test scenario: Failed campaign
function testFailedCampaign() {
  const clock = new FakeClock(1000);
  const campaign = new Campaign(
    {
      id: "test-001",
      minRaiseLamports: 100,
      deadlineUnix: 2000,
      refundWindowStartUnix: 3000,
      signers: ["attorney", "platform", "client"],
      daoTreasury: "dao"
    },
    clock
  );
  
  // Contribute below minimum
  campaign.contribute("funder", 50);
  
  // Jump to after deadline
  clock.set(2500);
  campaign.evaluate();
  
  // Assert failed status
  console.assert(campaign.getStatus() === "failed_refunding");
  console.assert(campaign.getRefundReason() === "auto_failed");
  console.assert(campaign.getDaoFeeAmount() === 0);
  
  // Test refund
  const refund = campaign.claimRefund("funder");
  console.assert(refund === 50);
  
  console.log("✓ Failed campaign test passed");
}

testFailedCampaign();
```

**Key Points**:
- FakeClock enables deterministic testing
- Can simulate years in milliseconds
- Complete control over time progression
- No dependencies on real time or blockchain

**Source**: [`tests/crowdfunding/campaign.test.ts:6-20`](../tests/crowdfunding/campaign.test.ts#L6-L20)

---

## Best Practices

### 1. Check Status Before Operations

```typescript
if (campaign.getStatus() === "active") {
  campaign.contribute(funder, amount);
}

if (campaign.getStatus() === "locked") {
  campaign.approveInvoicePayment(signer, invoiceId, amount, recipient);
}

if (campaign.getStatus() === "won") {
  campaign.depositCourtAward(attorney, awardAmount);
}
```

### 2. Validate Available Funds

```typescript
const available = campaign.getAvailableFunds();
const invoiceAmount = 50_000_000;

if (available >= invoiceAmount) {
  campaign.approveInvoicePayment(signer, invoiceId, invoiceAmount, recipient);
} else {
  console.error("Insufficient funds:", available, "need:", invoiceAmount);
}
```

### 3. Coordinate Multisig Approvals

```typescript
// First approval
campaign.approveInvoicePayment(attorney, invoiceId, amount, recipient);

const approvals = campaign.getInvoiceApprovals(invoiceId);
console.log(`Invoice has ${approvals.length} of 2 required approvals`);

// Second approval must use same parameters
campaign.approveInvoicePayment(platform, invoiceId, amount, recipient);
```

### 4. Handle Appeal Rounds Properly

```typescript
const appeals = campaign.getAppealRounds();
const currentAppeal = appeals[appeals.length - 1];

if (currentAppeal) {
  console.log("Current appeal:");
  console.log("  Court:", currentAppeal.courtLevel);
  console.log("  Fundraising needed:", currentAppeal.fundraisingNeeded);
  console.log("  Raised:", currentAppeal.totalRaised);
  console.log("  Goal:", currentAppeal.minRaiseLamports);
}
```

### 5. Track Complete Financial History

```typescript
const summary = {
  totalRaised: campaign.getTotalRaised(),
  daoFees: campaign.getDaoFeeAmount(),
  courtDeposits: campaign.getCourtFeesDeposited(),
  invoicePayments: campaign.getInvoicePayments(),
  availableFunds: campaign.getAvailableFunds()
};

console.log("Financial Summary:", summary);

// Calculate total paid out
const totalPaid = summary.invoicePayments.reduce((sum, p) => sum + p.amount, 0);
const netFunds = summary.totalRaised + summary.courtDeposits - summary.daoFees - totalPaid;
console.assert(netFunds === summary.availableFunds);
```

---

## Conclusion

These workflows demonstrate the full capabilities of the Solana-Slop crowdfunding platform:

**Core Features**:
- Initial fundraising with automatic refunds
- Multisig invoice payments with parameter consistency
- Case outcomes (win/loss/settlement)
- Court awards and judgment payments
- Multi-round appeals with conditional fundraising
- Differential approval thresholds (1/3 vs 2/3)
- Complete financial accounting

**Advanced Features**:
- Multi-year litigation simulation
- Appeals through entire court hierarchy
- Remands and retrials
- Conditional fundraising (only when needed)
- Separate contribution tracking per round
- Attorney unilateral deposit privileges

**Testing**:
- FakeClock for deterministic testing
- Blockchain-agnostic core logic
- Can simulate decades in milliseconds

**Links**:
- [API Reference](./10-api-reference-guide.md)
- [Core Concepts](./02-core-concepts-domain-model.md)
- [Testing Strategy](./09-testing-strategy-chaos-testing.md)
- [Design Decisions](./11-design-decisions-rationale.md)
- [Source Code](../src/crowdfunding/campaign.ts)
- [Test Scenarios](../tests/scenarios/)
