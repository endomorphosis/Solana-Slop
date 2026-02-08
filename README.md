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
- Each appeal round tracks contributions separately
- 10% DAO fee is collected on each successful round
- If appeal funding fails to meet the minimum, automatic refunds are issued
- Original contributors are diluted by appeal round participants
- Each round maintains full audit trail of approvals and contributions

Run the crowdfunding unit tests with:
```bash
npm test
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
