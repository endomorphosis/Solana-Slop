# ClientPortal Class

## Overview

The `ClientPortal` class provides a comprehensive client management system for the Solana-Slop platform, implementing:

- **Client registration and authentication** with bcrypt password hashing
- **Email verification** system with time-limited tokens
- **KYC (Know Your Customer)** information submission and tracking
- **Client-side encryption** with password-derived keys (PBKDF2)
- **UCAN (User Controlled Authorization Network)** token generation for capability-based delegation
- **Document encryption/decryption** management with AES-256-GCM
- **Integration** with complaint-generator for legal complaint submission
- **Permanent decryption** for final public submission

## Architecture

### Encryption Flow

```
User Password → PBKDF2 (100k iterations) → Password Key
                                           ↓
Random Master Key ← AES-256-GCM ← Password Key (encrypted storage)
        ↓
    Documents ← AES-256-GCM ← Master Key
```

### UCAN Delegation Flow

```
Client (Issuer) → Creates UCAN Token → Attorney (Audience)
                 ↓
            Capabilities:
            - Resource: ipfs://QmDocument...
            - Access Level: read/write/admin
            - Expiration: timestamp
```

## Key Features

### 1. Client Registration & Authentication

```typescript
// Register new client
const profile = await portal.registerClient(
  "username",
  "password123",
  "email@example.com"
);

// Authenticate existing client
const authenticated = await portal.authenticateClient("username", "password123");
```

### 2. Email Verification

```typescript
// Verify email with token
const verified = portal.verifyEmail("username", token);

// Resend verification email
await portal.resendEmailVerification("username");
```

### 3. KYC Information

```typescript
// Submit KYC information
const updated = portal.submitKYCInformation("username", {
  fullName: "John Doe",
  dateOfBirth: "1990-01-01",
  address: {
    street: "123 Main St",
    city: "Anytown",
    state: "CA",
    zipCode: "12345",
    country: "USA"
  },
  phoneNumber: "+1234567890",
  idType: "drivers_license"
});

// Update KYC status (admin/third-party verification)
portal.updateKYCStatus("username", "verified", {
  provider: "VerificationProvider",
  verificationId: "VER123",
  status: "verified",
  timestamp: Date.now()
});
```

### 4. Encryption Setup

```typescript
// Setup client-side encryption
const profile = await portal.setupEncryption(
  "username",
  "password123",
  "solana_public_key"
);

// Password-derived key is used to encrypt a master key
// Master key is used for all document encryption
```

### 5. Document Management

```typescript
// Encrypt and store document
const encryptedDoc = await portal.encryptDocument(
  "username",
  Buffer.from("Sensitive content"),
  {
    type: "evidence",
    name: "evidence.pdf",
    cid: "QmIPFSContentIdentifier"
  }
);

// Decrypt document (requires password)
const decrypted = await portal.decryptDocument(
  "username",
  documentId,
  "password123"
);

// Permanently decrypt for final submission
const publicDoc = await portal.permanentlyDecryptDocument(
  "username",
  documentId,
  "password123"
);
```

### 6. UCAN Token Delegation

```typescript
// Create UCAN token for attorney access
const token = portal.createUCANToken(
  "username",
  "did:key:attorney_public_key",
  [
    {
      resource: "ipfs://QmDocument",
      access: "read"
    }
  ],
  3600 // expires in 1 hour
);

// Delegate document access to attorney
const delegationToken = portal.delegateDocumentAccess(
  "username",
  documentId,
  "did:key:attorney_public_key",
  "read",
  7200 // 2 hours
);

// Verify token validity
const isValid = portal.verifyUCANToken(token);
```

### 7. Complaint Management

```typescript
// Create complaint (draft)
const complaint = portal.createComplaint(
  "username",
  "Employment Discrimination Case",
  "Detailed description...",
  [doc1Id, doc2Id] // Document IDs
);

// Submit complaint for review (integrates with complaint-generator)
const submitted = await portal.submitComplaint("username", complaint.id);

// Access complaint information
const complaints = portal.getClientComplaints("username");
```

## Security Features

### Password Security
- **bcrypt** hashing with 10 rounds for password storage
- Passwords never stored in plain text
- Password verification required for sensitive operations

### Encryption Security
- **PBKDF2** with 100,000 iterations for key derivation
- **AES-256-GCM** for symmetric encryption
- Random salt per user (32 bytes)
- Random IV per document (16 bytes)
- Authenticated encryption with auth tags

### UCAN Security
- Capability-based access control
- Time-limited tokens with expiration
- Cryptographic signatures for token integrity
- Support for delegation chains

## Client Status Workflow

```
pending_email → pending_kyc → kyc_submitted → verified
                                            ↓
                                        rejected
                                            ↓
                                        suspended
```

### Status Descriptions

- `pending_email`: Email verification required
- `pending_kyc`: KYC information needs to be submitted
- `kyc_submitted`: KYC submitted, awaiting third-party verification
- `verified`: Fully verified and active (can submit complaints)
- `rejected`: KYC verification failed
- `suspended`: Account suspended by admin

## KYC Integration

The system supports third-party KYC verification providers:

```typescript
interface KYCVerificationResponse {
  provider: string;           // "Stripe Identity", "Onfido", etc.
  verificationId: string;     // Provider's verification ID
  status: "pending" | "verified" | "rejected";
  timestamp: number;
  data?: Record<string, any>; // Additional verification data
}
```

## Document Types

- `complaint`: Legal complaint documents
- `evidence`: Supporting evidence documents
- `correspondence`: Legal correspondence
- `other`: Other document types

## Encryption Algorithms

### Key Derivation
- **Algorithm**: PBKDF2
- **Hash**: SHA-256
- **Iterations**: 100,000
- **Key Length**: 32 bytes (256 bits)

### Symmetric Encryption
- **Algorithm**: AES-256-GCM
- **Key Size**: 256 bits
- **IV Size**: 128 bits (16 bytes)
- **Auth Tag Size**: 128 bits (16 bytes)

## Admin Functions

```typescript
// List all clients
const allClients = portal.getAllClients();

// Filter by status
const pendingKYC = portal.getClientsByStatus("kyc_submitted");

// Search clients
const results = portal.searchClients("john@example.com");
```

## Error Handling

All methods throw descriptive errors for invalid operations:

```typescript
try {
  await portal.registerClient("u", "pass", "invalid-email");
} catch (error) {
  // Error: "Username must be at least 3 characters"
  // Error: "Password must be at least 8 characters"
  // Error: "Valid email address is required"
}
```

## Integration with Complaint Generator

The ClientPortal integrates with the complaint-generator Python package:

1. Client creates complaint with documents
2. Client submits complaint (requires full verification)
3. System calls complaint-generator API
4. Complaint is classified and analyzed
5. Generated legal document is stored on IPFS
6. CID is attached to complaint submission

In production, this integration uses HTTP API or subprocess execution.

## IPFS Integration

Documents are stored on IPFS with encryption:

1. Document encrypted client-side with master key
2. Encrypted content uploaded to IPFS
3. CID (Content Identifier) stored in metadata
4. For permanent decryption:
   - Document decrypted
   - Plain content uploaded to IPFS
   - New CID stored for public access

## Usage Example

```typescript
import { ClientPortal } from "./src/client/portal.js";
import type { Clock } from "./src/crowdfunding/types.js";

// Create clock implementation
const clock: Clock = {
  now: () => Math.floor(Date.now() / 1000)
};

// Initialize portal
const portal = new ClientPortal(clock);

// Registration flow
const profile = await portal.registerClient(
  "johndoe",
  "securepassword123",
  "john@example.com"
);

// Email verification
const token = profile.credentials.emailVerificationToken!;
// ... send email with token ...
portal.verifyEmail("johndoe", token);

// KYC submission
portal.submitKYCInformation("johndoe", {
  fullName: "John Doe",
  dateOfBirth: "1990-01-01",
  address: {
    street: "123 Main St",
    city: "Anytown",
    state: "CA",
    zipCode: "12345",
    country: "USA"
  },
  phoneNumber: "+1234567890",
  idType: "drivers_license"
});

// Admin/third-party verifies KYC
portal.updateKYCStatus("johndoe", "verified");

// Setup encryption
await portal.setupEncryption(
  "johndoe",
  "securepassword123",
  "solana_public_key_123"
);

// Upload encrypted document
const doc = await portal.encryptDocument(
  "johndoe",
  Buffer.from("Evidence content"),
  {
    type: "evidence",
    name: "evidence.pdf",
    cid: "QmIPFSHash..."
  }
);

// Create and submit complaint
const complaint = portal.createComplaint(
  "johndoe",
  "My Legal Case",
  "Description of the case",
  [doc.id]
);

await portal.submitComplaint("johndoe", complaint.id);

// Delegate access to attorney
const token = portal.delegateDocumentAccess(
  "johndoe",
  doc.id,
  "did:key:attorney_pubkey",
  "read",
  86400 // 24 hours
);
```

## Testing

Comprehensive test suite included in `tests/client-portal.test.ts`:

```bash
npm test -- tests/client-portal.test.ts
```

Tests cover:
- Client registration and validation
- Email verification flow
- KYC submission and status updates
- Encryption setup and configuration
- Authentication
- Document encryption/decryption
- UCAN token generation and verification
- Complaint creation and submission
- Password management
- Admin functions

## Future Enhancements

1. **EdDSA Signatures**: Replace HMAC with proper EdDSA signatures for UCAN tokens
2. **Helia Integration**: Migrate from deprecated ipfs-http-client to Helia
3. **Multi-factor Authentication**: Add 2FA support
4. **Biometric Authentication**: Support for fingerprint/face recognition
5. **Hardware Security Module**: Integration for key storage
6. **Audit Logging**: Track all security-sensitive operations
7. **Rate Limiting**: Prevent brute-force attacks
8. **Session Management**: JWT-based session tokens

## Dependencies

- `bcryptjs` - Password hashing
- `uuid` - Unique identifier generation
- `crypto` (Node.js built-in) - Cryptographic operations
- `ipfs-http-client` - IPFS integration (to be migrated to Helia)
- `@ucanto/*` - UCAN token support

## License

See project LICENSE file.
