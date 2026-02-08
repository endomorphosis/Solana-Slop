# Solana Testnet Boilerplate (TypeScript)

Minimal repo to confirm you can communicate with the Solana network (defaults to **testnet**).

## Prereqs
- Node.js 18+ (recommended 20/22)

## Setup
```bash
npm install
cp .env.example .env
```

## Tests (TDD)
Run unit tests:
```bash
npm test
```

Watch mode during development:
```bash
npm run test:watch
```

Run integration tests (hits testnet RPC):
```bash
npm run test:integration
```

### Crowdfunding TDD scaffolding
The repo includes a domain-level test suite that models:
- Community funding into a campaign
- Funds moving into a 3-of-3 multisig context (attorney, platform, client)
- Auto-refunds when the minimum raise is not met by the deadline
- 2-of-3 multisig approvals to refund after a time window
- **10% DAO treasury fee** deducted automatically on successful fundraising campaigns
- **Attorney court fee deposits**: Attorney can unilaterally deposit court-awarded fees into the campaign
- **Invoice payment approvals**: 2-of-3 multisig signers can approve payments to attorney for services rendered
- **Appeal system**: Multi-round fundraising with different approval thresholds based on case outcome

#### DAO Treasury Fee
Upon a successful raise (meeting the minimum goal by the deadline), a 10% fee is automatically deducted and allocated to the DAO treasury for platform maintenance and administration. This ensures sustainable operation of the crowdfunding platform.

#### Court Fee Deposits
When a court awards fees to the campaign, the attorney (first multisig signer) can unilaterally deposit these fees into the campaign wallet. This allows the campaign to receive additional funds from legal proceedings without requiring multi-party approval.

#### Invoice Payment System
When the attorney provides an invoice for services rendered, any 2-of-3 multisig signers (attorney, platform, client) can approve payment from the campaign funds to the attorney's wallet. This provides a transparent and secure mechanism for paying for legal services while requiring consensus from the multisig participants.

#### Appeal System
The crowdfunding platform supports multi-round fundraising for legal appeals with intelligent approval mechanisms based on case outcomes:

**Case Outcomes:**
- **Settlement**: Case is resolved through agreement between parties
- **Win**: Campaign wins the case, potentially receiving court-awarded funds
- **Loss**: Campaign loses the case, potentially owing judgment payments

**Appeal Mechanics:**

After a **Win**:
- Only **1 of 3** multisig signers is required to approve an appeal
- Court-awarded funds (judgment, attorney fees) can be deposited by the attorney
- Lower threshold reflects that winning party has less risk in appealing

After a **Loss**:
- **2 of 3** multisig signers are required to approve an appeal
- Must pay judgment from existing campaign funds
- Additional community fundraising needed for appeal costs
- Higher threshold reflects greater risk and financial burden

**Multi-Round Fundraising:**
- Each appeal round tracks contributions separately from initial round
- Appeal contributions are isolated to prevent refund accounting issues
- 10% DAO fee is collected on each successful round
- If appeal funding fails to meet the minimum, automatic refunds are issued
- Original contributors are diluted by appeal round participants
- Each round maintains full audit trail of approvals and contributions

**Conditional Fundraising:**
- Appeals intelligently check available campaign funds before initiating fundraising
- If wallet has sufficient funds (≥ estimated cost), appeal proceeds directly without fundraising
- If insufficient funds, fundraising starts for only the needed difference
- Reduces unnecessary fundraising rounds and gas costs

**Multi-Level Court Hierarchy:**
- Supports multiple court levels: district, appellate, state_supreme, us_supreme
- Litigation paths: appeal, remand, retrial, final
- Models real-world legal proceedings spanning multiple jurisdictions over many years
- Each appeal round tracks court level and path for audit purposes

**Appeal Parameter Consistency:**
- First approval establishes appeal parameters (cost, deadline, court level, path)
- Subsequent approvals must match the initial parameters exactly
- Prevents race conditions where different signers approve different terms
- Similar to invoice payment consistency enforcement

**Judgment Amount Handling:**
- `recordOutcome()` always sets judgment amount deterministically
- Passing 0 or undefined properly clears any prior judgment value
- Critical for remands and technical losses with no monetary judgment
- Prevents stale judgment amounts from affecting future calculations

**Comprehensive Testing:**
- 31 unit tests covering all features and edge cases
- 102 JSON scenario files simulating real-world litigation trajectories
- Boundary value testing with extreme amounts and timings
- Fuzz testing to validate robustness over decade-long cases
- No Solana blockchain dependency for scenario tests

Run the crowdfunding unit tests with:
```bash
npm test
```

### API Examples

#### Basic Campaign Flow
```typescript
// Create campaign
const campaign = new Campaign(config, clock);

// Contributors fund the campaign
campaign.contribute(funder1, 1000);
campaign.contribute(funder2, 2000);

// Evaluate after deadline
campaign.evaluate(); // Status: "locked" if goal met

// Record outcome
campaign.recordOutcome("win", 50000);

// Attorney deposits court award
campaign.depositCourtAward(attorney, 50000);
```

#### Invoice Payment Flow
```typescript
// 2-of-3 multisig invoice payment
campaign.approveInvoicePayment(attorney, "INV-001", 5000, attorneyWallet);
campaign.approveInvoicePayment(platform, "INV-001", 5000, attorneyWallet);
// Payment executes on second approval
```

#### Appeal with Sufficient Funds
```typescript
campaign.recordOutcome("win", 100000);
campaign.depositCourtAward(attorney, 100000);

// Available funds > estimated cost - no fundraising needed
campaign.approveAppeal(attorney, 50000, deadline, "appellate", "appeal");
// Status immediately goes to "locked"
```

#### Appeal Requiring Fundraising
```typescript
campaign.recordOutcome("loss", 30000);
campaign.payJudgment(30000);

// Insufficient funds - requires 2/3 approval for loss appeal
campaign.approveAppeal(attorney, 100000, deadline, "appellate", "appeal");
campaign.approveAppeal(platform, 100000, deadline, "appellate", "appeal");
// Status goes to "appeal_active" - fundraising needed

campaign.contributeToAppeal(funder, 80000);
campaign.evaluateAppeal(); // Checks if minimum reached
```

## Ping Solana testnet
```bash
npm run ping
```

## Check balance (optional)
Set `SOLANA_PUBLIC_KEY` in `.env`, then:
```bash
npm run balance
```

## Generate a local keypair (optional)
Creates `./.keys/id.json` (gitignored):
```bash
npm run gen-keypair
```

## Sign + simulate a transaction (optional)
This builds a 0-lamport self-transfer, signs it locally, then runs `simulateTransaction` on testnet:
```bash
npm run simulate-self-tx
```

If you’ve funded the keypair and want to actually send it (pays a small fee):
```bash
npm run simulate-self-tx -- --mode=send
```

## Notes
- RPC URL is read from `SOLANA_RPC_URL` (defaults to `https://api.testnet.solana.com`).
- Some clusters may rate-limit or disable airdrops; this repo focuses on proving RPC connectivity.
