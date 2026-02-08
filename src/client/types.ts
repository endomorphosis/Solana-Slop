import type { PublicKeyLike } from "../crowdfunding/types.js";

/**
 * Client account status
 */
export type ClientStatus = 
  | "pending_email"        // Email verification pending
  | "pending_kyc"          // KYC information required
  | "kyc_submitted"        // KYC submitted, awaiting third-party verification
  | "verified"             // Fully verified and active
  | "rejected"             // KYC rejected
  | "suspended";           // Account suspended

/**
 * KYC verification status
 */
export type KYCStatus = 
  | "not_started"
  | "in_progress"
  | "pending_verification"
  | "verified"
  | "rejected";

/**
 * Document access level for UCAN delegation
 */
export type DocumentAccessLevel = 
  | "read"
  | "write"
  | "admin";

/**
 * Client authentication credentials
 */
export interface ClientCredentials {
  /** Unique username */
  username: string;
  /** Hashed password (bcrypt) */
  passwordHash: string;
  /** Email address */
  email: string;
  /** Email verification token */
  emailVerificationToken?: string;
  /** Email verified status */
  emailVerified: boolean;
  /** Account creation timestamp */
  createdAt: number;
  /** Last login timestamp */
  lastLogin?: number;
}

/**
 * KYC personal information
 */
export interface KYCInformation {
  /** Full legal name */
  fullName: string;
  /** Date of birth (ISO format) */
  dateOfBirth: string;
  /** Social Security Number (last 4 digits stored) */
  ssnLast4?: string;
  /** Residential address */
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  /** Phone number */
  phoneNumber: string;
  /** Government ID type */
  idType: "drivers_license" | "passport" | "state_id" | "other";
  /** Third-party verification provider */
  verificationProvider?: string;
  /** Third-party verification ID */
  verificationId?: string;
  /** Verification status */
  status: KYCStatus;
  /** Verification timestamp */
  verifiedAt?: number;
  /** Verification notes */
  verificationNotes?: string;
  /** Submitted timestamp */
  submittedAt?: number;
}

/**
 * Client encryption keys and UCAN configuration
 */
export interface ClientEncryption {
  /** Client's Solana wallet public key */
  publicKey: PublicKeyLike;
  /** UCAN DID (Decentralized Identifier) */
  did: string;
  /** Encrypted master key (encrypted with password-derived key) */
  encryptedMasterKey: string;
  /** Salt for password-based key derivation */
  salt: string;
  /** IPFS node URL for client-side operations */
  ipfsNodeUrl?: string;
  /** Key derivation parameters */
  kdfParams: {
    algorithm: "pbkdf2" | "scrypt" | "argon2";
    iterations: number;
    keyLength: number;
  };
}

/**
 * UCAN token for document delegation
 */
export interface UCANToken {
  /** Token ID */
  id: string;
  /** Issuer DID (client) */
  issuer: string;
  /** Audience DID (attorney or other delegate) */
  audience: string;
  /** Capabilities/permissions */
  capabilities: {
    /** Resource identifier (document CID or path) */
    resource: string;
    /** Access level */
    access: DocumentAccessLevel;
  }[];
  /** Expiration timestamp */
  expiresAt: number;
  /** Creation timestamp */
  createdAt: number;
  /** Token signature */
  signature: string;
  /** Parent token (for delegation chains) */
  parentToken?: string;
}

/**
 * Encrypted document stored on IPFS
 */
export interface EncryptedDocument {
  /** Document ID */
  id: string;
  /** IPFS CID of encrypted content */
  cid: string;
  /** Document type */
  type: "complaint" | "evidence" | "correspondence" | "other";
  /** Document name/title */
  name: string;
  /** Owner's public key */
  owner: PublicKeyLike;
  /** Encryption metadata */
  encryption: {
    /** Algorithm used */
    algorithm: string;
    /** Initialization vector (base64) */
    iv: string;
    /** Key identifier */
    keyId: string;
  };
  /** Upload timestamp */
  uploadedAt: number;
  /** Is permanently decrypted (for final submission) */
  isPermanentlyDecrypted: boolean;
  /** Permanent decryption timestamp */
  decryptedAt?: number;
  /** IPFS CID of decrypted content (if permanently decrypted) */
  decryptedCid?: string;
}

/**
 * Complaint submission
 */
export interface ComplaintSubmission {
  /** Submission ID */
  id: string;
  /** Client's public key */
  clientPublicKey: PublicKeyLike;
  /** Complaint title */
  title: string;
  /** Complaint description */
  description: string;
  /** Associated campaign ID (if approved for crowdfunding) */
  campaignId?: string;
  /** Attached document IDs */
  documents: string[];
  /** Submission status */
  status: "draft" | "submitted" | "under_review" | "approved" | "rejected";
  /** Created timestamp */
  createdAt: number;
  /** Submitted timestamp */
  submittedAt?: number;
  /** Generated complaint document (from complaint-generator) */
  generatedComplaint?: {
    /** IPFS CID of generated complaint */
    cid: string;
    /** Generation timestamp */
    generatedAt: number;
    /** Classification results */
    classification?: any;
    /** Legal analysis results */
    analysis?: any;
  };
}

/**
 * Complete client profile
 */
export interface ClientProfile {
  /** Authentication credentials */
  credentials: ClientCredentials;
  /** KYC information */
  kyc?: KYCInformation;
  /** Encryption configuration */
  encryption?: ClientEncryption;
  /** Account status */
  status: ClientStatus;
  /** UCAN tokens issued by this client */
  ucanTokens: UCANToken[];
  /** Complaint submissions */
  complaints: ComplaintSubmission[];
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Email verification request
 */
export interface EmailVerificationRequest {
  username: string;
  email: string;
  token: string;
  expiresAt: number;
}

/**
 * Third-party KYC verification response
 */
export interface KYCVerificationResponse {
  /** Verification provider */
  provider: string;
  /** Verification ID from provider */
  verificationId: string;
  /** Verification status */
  status: "pending" | "verified" | "rejected";
  /** Verification timestamp */
  timestamp: number;
  /** Additional verification data */
  data?: Record<string, any>;
}
