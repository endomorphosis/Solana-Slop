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

## Admin Dashboard

The platform includes a comprehensive admin dashboard for managing campaigns, proposals, accounts, and transactions.

### Features

- **Proposal Review & Approval**: Review and approve/reject crowdfunding proposals submitted by clients
- **Campaign Oversight**: Monitor all campaigns, their status, funding progress, and workflow history
- **Case Management**: Track cases in active litigation whose campaigns have completed fundraising
- **Account Management**: Manage user, client, and attorney accounts
- **User Profile Analysis**: Detailed user profiles with cross-linked data across campaigns, proposals, and transactions
- **Transaction Tracking**: View complete transaction history including contributions, refunds, court awards, and invoice payments
- **Dashboard Statistics**: Real-time overview of platform metrics and user analytics

### API Usage

```typescript
import { AdminDashboard } from "./src/admin/dashboard.js";
import { Campaign } from "./src/crowdfunding/campaign.js";

// Initialize dashboard
const dashboard = new AdminDashboard(clock);

// Register accounts
dashboard.registerAccount("user1", "user", "John Doe", "john@example.com");
dashboard.registerAccount("client1", "client", "Jane Smith", "jane@example.com");
dashboard.registerAccount("attorney1", "attorney", "Bob Law", "bob@lawfirm.com");

// Submit and review proposals
dashboard.submitProposal(
  "campaign1",
  "client1",
  "attorney1",
  100000,
  deadline,
  "Patent infringement case"
);

dashboard.approveProposal("campaign1", "admin_wallet", "Approved");
// or
dashboard.rejectProposal("campaign1", "admin_wallet", "Insufficient details");

// Register and monitor campaigns (now requires config for full tracking)
const campaign = new Campaign(config, clock);
dashboard.registerCampaign(campaign, "campaign1", config);

// Get campaign summary (now includes real config data)
const summary = dashboard.getCampaignSummary("campaign1");
console.log(`Min raise: ${summary.minRaiseLamports}`);
console.log(`Deadline: ${summary.deadlineUnix}`);
console.log(`Contributors: ${summary.contributorCount}`);

// Track transactions (now updates campaignsParticipated)
dashboard.recordTransaction({
  id: "tx1",
  timestamp: Date.now(),
  type: "contribution",
  amount: 50000,
  from: "user1",
  to: "campaign1",
  campaignId: "campaign1"
});

// View statistics
const stats = dashboard.getDashboardStats();
console.log(`Total raised: ${stats.totalRaised}`);
console.log(`Pending proposals: ${stats.pendingProposals}`);

// Query data (now type-safe with CampaignStatus)
const pendingProposals = dashboard.listProposals("pending");
const activeCampaigns = dashboard.listCampaignsByStatus("active");
const walletTxs = dashboard.getWalletTransactions("user1");

// Get detailed user profile with cross-linked data
const profile = dashboard.getUserProfile("attorney1");
console.log(`Campaigns: ${profile.campaigns.join(", ")}`);
console.log(`Proposals: ${profile.proposals.join(", ")}`);
console.log(`Total Received: ${profile.analytics.totalReceived}`);
console.log(`Success Rate: ${profile.analytics.successRate}`);

// Get user analytics
const analytics = dashboard.getUserAnalytics();
console.log(`Users: ${analytics.userTypeDistribution.users}`);
console.log(`Top Contributor: ${analytics.topContributors[0].name}`);
console.log(`Top Attorney: ${analytics.topAttorneys[0].name}`);

// Search users by type
const attorneys = dashboard.searchUsers("smith", "attorney");

// Get active litigation cases
const cases = dashboard.getActiveLitigationCases();
console.log(`Active cases: ${cases.length}`);

// Get specific case details
const caseDetails = dashboard.getCaseDetails("campaign1");
console.log(`Case status: ${caseDetails?.litigationStatus}`);
console.log(`Court level: ${caseDetails?.currentCourtLevel}`);

// Filter cases by court level
const appellateCases = dashboard.listCasesByCourtLevel("appellate");

// Get case management statistics
const caseStats = dashboard.getCaseManagementStats();
console.log(`Total cases in litigation: ${caseStats.totalCases}`);
console.log(`Cases in appeal: ${caseStats.casesInAppeal}`);
```

### Web Interface

A demo web interface is available at `web/admin-dashboard.html`. Open it in a browser to see the dashboard UI:

```bash
# Using Python's built-in server
python3 -m http.server 8000
# Then visit http://localhost:8000/web/admin-dashboard.html

# Or using Node.js http-server (install globally: npm i -g http-server)
http-server
# Then visit http://localhost:8080/web/admin-dashboard.html
```

The web interface provides:
- **Overview tab**: Platform statistics and recent activity
- **Proposals tab**: Review and manage proposal submissions with filtering
- **Campaigns tab**: Monitor all campaigns and their status
- **Case Management tab**: Track cases in active litigation
  - Filter by litigation status (In Trial, In Appeal, Awaiting Decision, Awaiting Funding)
  - Filter by court level (District, Appellate, State Supreme, US Supreme)
  - View case details including current outcome, available funds, and appeal rounds
  - Statistics showing cases by status and court level
  - Identify cases that have completed fundraising but are still in legal proceedings
- **Attorney Verification tab**: Review and verify attorney profiles
  - View pending attorney registrations with bar license details
  - Verify bar licenses using state bar website links
  - Approve or reject attorney profiles with notes
  - Filter by verification status (Pending, Verified, Rejected)
- **Accounts tab**: Manage user, client, and attorney accounts with filtering
- **User Profiles tab**: Detailed profile analysis with cross-linking
  - Filter by investors, clients, or attorneys
  - View user analytics (distribution, activity trends)
  - Top contributors leaderboard
  - Top attorneys by cases and success rate
  - Each profile shows campaigns participated, proposals managed, transaction history, and analytics
  - Cross-references link to other admin sections (campaigns, proposals, transactions)
- **Transactions tab**: View complete transaction history by wallet or campaign

*Note: The web interface is a frontend demo. In production, connect it to the AdminDashboard API via a backend service.*

### Attorney Sign-Up Portal

A separate attorney sign-up portal is available at `web/attorney-signup.html` for attorneys to register and create profiles on the platform.

```bash
# Visit http://localhost:8000/web/attorney-signup.html
```

#### Attorney Registration Workflow

**Step 1: Account Creation**
- Attorneys create an account with username, email, and password
- Password must be at least 8 characters

**Step 2: Email Verification**
- System sends verification email with token
- Attorney verifies email by entering verification code

**Step 3: Profile Completion**
- Attorney provides professional details:
  - Full name and Solana wallet address
  - Bar license information (state, license number, year admitted, status)
  - Practice areas (multiple selections allowed)
  - Professional bio
  - Solicitation preferences (whether to accept client inquiries)

**Step 4: Admin Verification**
- Profile enters "Pending" status
- Admin reviews profile in the Attorney Verification tab
- Admin verifies bar license with state bar website
- Admin approves or rejects with notes
- Attorney receives email notification of decision

**Step 5: Profile Goes Live**
- Approved attorneys are registered as accounts in the system
- Profiles become visible to potential clients
- Attorneys can update their practice areas, bio, and solicitation preferences

#### API Usage

```typescript
import { AdminDashboard } from "./src/admin/dashboard.js";

const dashboard = new AdminDashboard(clock);

// Step 1: Attorney registers
const registration = dashboard.registerAttorneySignup(
  "attorney_username",
  "attorney@example.com"
);

// Step 2: Verify email
dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);

// Step 3: Submit profile details
const profile = dashboard.submitAttorneyDetails(
  registration.id,
  "attorney_wallet",
  "John Attorney",
  {
    state: "California",
    licenseNumber: "CA123456",
    yearAdmitted: 2015,
    status: "active"
  },
  ["civil_litigation", "personal_injury"],
  true, // accepts solicitations
  "Experienced attorney with 10+ years in civil litigation"
);

// Step 4: Admin verifies profile
dashboard.verifyAttorneyProfile(
  "attorney_wallet",
  "admin_wallet",
  true, // approved
  "Verified with California State Bar"
);

// Update attorney profile
dashboard.updateAttorneyProfile("attorney_wallet", {
  practiceAreas: ["civil_litigation", "personal_injury", "employment_law"],
  acceptsSolicitations: false,
  bio: "Updated professional bio"
});

// Search for verified attorneys
const civilLitigators = dashboard.searchVerifiedAttorneys("civil_litigation", true);

// Get attorney profile
const attorneyProfile = dashboard.getAttorneyProfile("attorney_wallet");

// List pending attorneys for admin review
const pendingAttorneys = dashboard.listPendingAttorneys();
```

### Accessibility
The web interface includes ARIA attributes for improved accessibility:
- Tab navigation with `role="tablist"`, `role="tab"`, and `role="tabpanel"`
- Proper `aria-selected` states for active tabs
- `aria-labelledby` and `aria-controls` linking tabs to panels
- Keyboard navigation support for screen readers

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
