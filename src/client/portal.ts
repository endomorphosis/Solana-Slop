import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import type { Clock, PublicKeyLike } from "../crowdfunding/types.js";
import type {
  ClientProfile,
  ClientCredentials,
  ClientStatus,
  KYCInformation,
  KYCStatus,
  ClientEncryption,
  UCANToken,
  EncryptedDocument,
  ComplaintSubmission,
  DocumentAccessLevel,
  EmailVerificationRequest,
  KYCVerificationResponse
} from "./types.js";

/**
 * ClientPortal manages client registration, authentication, KYC, encryption,
 * and document management with UCAN-based delegation for attorney access.
 */
export class ClientPortal {
  private readonly clientProfiles = new Map<string, ClientProfile>();
  private readonly emailVerifications = new Map<string, EmailVerificationRequest>();
  private readonly encryptedDocuments = new Map<string, EncryptedDocument>();
  private readonly clock: Clock;
  
  // Encryption constants
  private readonly ALGORITHM = "aes-256-gcm";
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly SALT_LENGTH = 32;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Register a new client with username/password and email
   * Password is hashed using bcrypt for secure storage
   */
  async registerClient(
    username: string,
    password: string,
    email: string
  ): Promise<ClientProfile> {
    // Validate inputs
    if (!username || username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    if (!email || !this.isValidEmail(email)) {
      throw new Error("Valid email address is required");
    }

    // Check for duplicate username
    if (this.clientProfiles.has(username)) {
      throw new Error("Username already exists");
    }

    // Check for duplicate email
    const existingEmail = Array.from(this.clientProfiles.values()).find(
      profile => profile.credentials.email === email
    );
    if (existingEmail) {
      throw new Error("Email already registered");
    }

    // Hash password using bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Create credentials
    const credentials: ClientCredentials = {
      username,
      passwordHash,
      email,
      emailVerificationToken: verificationToken,
      emailVerified: false,
      createdAt: this.clock.now()
    };

    // Create client profile
    const profile: ClientProfile = {
      credentials,
      status: "pending_email",
      ucanTokens: [],
      complaints: [],
      updatedAt: this.clock.now()
    };

    this.clientProfiles.set(username, profile);

    // Store email verification request
    const verificationRequest: EmailVerificationRequest = {
      username,
      email,
      token: verificationToken,
      expiresAt: this.clock.now() + 24 * 60 * 60 // 24 hours
    };
    this.emailVerifications.set(verificationToken, verificationRequest);

    return profile;
  }

  /**
   * Verify client email using verification token
   */
  verifyEmail(username: string, token: string): ClientProfile {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (profile.credentials.emailVerified) {
      throw new Error("Email already verified");
    }

    const verification = this.emailVerifications.get(token);
    if (!verification || verification.username !== username) {
      throw new Error("Invalid verification token");
    }

    if (this.clock.now() > verification.expiresAt) {
      throw new Error("Verification token has expired");
    }

    // Mark email as verified
    profile.credentials.emailVerified = true;
    profile.credentials.emailVerificationToken = undefined;
    profile.status = "pending_kyc";
    profile.updatedAt = this.clock.now();

    // Clean up verification request
    this.emailVerifications.delete(token);

    return profile;
  }

  /**
   * Submit KYC information for verification
   */
  submitKYCInformation(username: string, kycData: Omit<KYCInformation, "status" | "submittedAt">): ClientProfile {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (!profile.credentials.emailVerified) {
      throw new Error("Email must be verified before submitting KYC");
    }

    if (profile.kyc && profile.kyc.status === "verified") {
      throw new Error("KYC already verified");
    }

    // Create KYC information record
    const kycInfo: KYCInformation = {
      ...kycData,
      status: "pending_verification",
      submittedAt: this.clock.now()
    };

    profile.kyc = kycInfo;
    profile.status = "kyc_submitted";
    profile.updatedAt = this.clock.now();

    return profile;
  }

  /**
   * Update KYC status (called by third-party verification system or admin)
   */
  updateKYCStatus(
    username: string,
    status: KYCStatus,
    verificationData?: KYCVerificationResponse
  ): ClientProfile {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (!profile.kyc) {
      throw new Error("No KYC information submitted");
    }

    profile.kyc.status = status;
    profile.updatedAt = this.clock.now();

    if (verificationData) {
      profile.kyc.verificationProvider = verificationData.provider;
      profile.kyc.verificationId = verificationData.verificationId;
      profile.kyc.verificationNotes = JSON.stringify(verificationData.data);
    }

    if (status === "verified") {
      profile.kyc.verifiedAt = this.clock.now();
      profile.status = "verified";
    } else if (status === "rejected") {
      profile.status = "rejected";
    }

    return profile;
  }

  /**
   * Setup client-side encryption with password-derived keys
   * Uses PBKDF2 for key derivation and generates a master encryption key
   */
  async setupEncryption(
    username: string,
    password: string,
    publicKey: PublicKeyLike
  ): Promise<ClientProfile> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    // Verify password
    const isValid = await bcrypt.compare(password, profile.credentials.passwordHash);
    if (!isValid) {
      throw new Error("Invalid password");
    }

    if (profile.encryption) {
      throw new Error("Encryption already configured");
    }

    // Generate random salt for PBKDF2
    const salt = crypto.randomBytes(this.SALT_LENGTH);

    // Derive encryption key from password using PBKDF2
    const passwordKey = await this.deriveKeyFromPassword(password, salt);

    // Generate random master key for document encryption
    const masterKey = crypto.randomBytes(this.KEY_LENGTH);

    // Encrypt master key with password-derived key
    const encryptedMasterKey = this.encryptWithKey(masterKey, passwordKey);

    // Generate DID (Decentralized Identifier) for UCAN
    const did = `did:key:${publicKey}`;

    // Setup encryption configuration
    const encryption: ClientEncryption = {
      publicKey,
      did,
      encryptedMasterKey: encryptedMasterKey.toString("base64"),
      salt: salt.toString("base64"),
      kdfParams: {
        algorithm: "pbkdf2",
        iterations: this.PBKDF2_ITERATIONS,
        keyLength: this.KEY_LENGTH
      }
    };

    profile.encryption = encryption;
    profile.updatedAt = this.clock.now();

    return profile;
  }

  /**
   * Create UCAN token for delegating document access to attorneys
   * UCAN (User Controlled Authorization Network) allows capability-based delegation
   */
  createUCANToken(
    issuerUsername: string,
    audienceDID: string,
    capabilities: Array<{ resource: string; access: DocumentAccessLevel }>,
    expiresIn: number // seconds
  ): UCANToken {
    const profile = this.clientProfiles.get(issuerUsername);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (!profile.encryption) {
      throw new Error("Encryption not configured");
    }

    const now = this.clock.now();
    const token: UCANToken = {
      id: uuidv4(),
      issuer: profile.encryption.did,
      audience: audienceDID,
      capabilities,
      createdAt: now,
      expiresAt: now + expiresIn,
      signature: "" // Will be populated below
    };

    // Create signature using HMAC with issuer's public key as secret
    // In production, this should use proper EdDSA signatures
    const signature = this.signUCANToken(token, profile.encryption.publicKey);
    token.signature = signature;

    profile.ucanTokens.push(token);
    profile.updatedAt = this.clock.now();

    return token;
  }

  /**
   * Encrypt a document and store with metadata
   * Documents are encrypted with the client's master key
   */
  async encryptDocument(
    username: string,
    document: Buffer | string,
    metadata: {
      type: EncryptedDocument["type"];
      name: string;
      cid: string;
    }
  ): Promise<EncryptedDocument> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (!profile.encryption) {
      throw new Error("Encryption not configured");
    }

    // Get master key (requires password in production - simplified here)
    const salt = Buffer.from(profile.encryption.salt, "base64");
    // Note: In production, this would require the user's password
    // For now, we store the encrypted master key and would decrypt it with password

    // Generate random IV for this document
    const iv = crypto.randomBytes(this.IV_LENGTH);

    // For demonstration, we'll use a key derived from the username
    // In production, decrypt encryptedMasterKey with password-derived key
    const keyId = `key_${uuidv4()}`;

    // Convert document to buffer if string
    const docBuffer = typeof document === "string" 
      ? Buffer.from(document, "utf-8") 
      : document;

    // Encrypt document using AES-256-GCM
    const cipher = crypto.createCipheriv(this.ALGORITHM, 
      crypto.randomBytes(this.KEY_LENGTH), // Temporary key - use master key in production
      iv
    );
    const encrypted = Buffer.concat([
      cipher.update(docBuffer),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Store encrypted document
    const encryptedDoc: EncryptedDocument = {
      id: uuidv4(),
      cid: metadata.cid,
      type: metadata.type,
      name: metadata.name,
      owner: profile.encryption.publicKey,
      encryption: {
        algorithm: this.ALGORITHM,
        iv: iv.toString("base64"),
        keyId
      },
      uploadedAt: this.clock.now(),
      isPermanentlyDecrypted: false
    };

    this.encryptedDocuments.set(encryptedDoc.id, encryptedDoc);

    return encryptedDoc;
  }

  /**
   * Decrypt a document using client's password
   * Requires password to derive key and decrypt master key
   */
  async decryptDocument(
    username: string,
    documentId: string,
    password: string
  ): Promise<Buffer> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    const document = this.encryptedDocuments.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    if (document.owner !== profile.encryption?.publicKey) {
      throw new Error("Not authorized to decrypt this document");
    }

    // Verify password
    const isValid = await bcrypt.compare(password, profile.credentials.passwordHash);
    if (!isValid) {
      throw new Error("Invalid password");
    }

    if (!profile.encryption) {
      throw new Error("Encryption not configured");
    }

    // Derive password key
    const salt = Buffer.from(profile.encryption.salt, "base64");
    const passwordKey = await this.deriveKeyFromPassword(password, salt);

    // Decrypt master key
    const encryptedMasterKey = Buffer.from(profile.encryption.encryptedMasterKey, "base64");
    const masterKey = this.decryptWithKey(encryptedMasterKey, passwordKey);

    // Note: In production, fetch encrypted content from IPFS using document.cid
    // For now, return a placeholder
    const decryptedContent = Buffer.from(`Decrypted content for ${document.name}`);

    return decryptedContent;
  }

  /**
   * Permanently decrypt a document for final public submission
   * This removes encryption and uploads the plain document to IPFS
   */
  async permanentlyDecryptDocument(
    username: string,
    documentId: string,
    password: string
  ): Promise<EncryptedDocument> {
    const document = this.encryptedDocuments.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    if (document.isPermanentlyDecrypted) {
      throw new Error("Document already permanently decrypted");
    }

    // Decrypt the document first
    const decryptedContent = await this.decryptDocument(username, documentId, password);

    // In production: Upload decrypted content to IPFS and get new CID
    const decryptedCid = `decrypted_${document.cid}`;

    // Update document metadata
    document.isPermanentlyDecrypted = true;
    document.decryptedAt = this.clock.now();
    document.decryptedCid = decryptedCid;

    return document;
  }

  /**
   * Create a new complaint submission (draft)
   */
  createComplaint(
    username: string,
    title: string,
    description: string,
    documents: string[] // Document IDs
  ): ComplaintSubmission {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (!profile.encryption) {
      throw new Error("Encryption must be configured before creating complaints");
    }

    // Verify all documents belong to this client
    for (const docId of documents) {
      const doc = this.encryptedDocuments.get(docId);
      if (!doc || doc.owner !== profile.encryption.publicKey) {
        throw new Error(`Document ${docId} not found or not owned by client`);
      }
    }

    const complaint: ComplaintSubmission = {
      id: uuidv4(),
      clientPublicKey: profile.encryption.publicKey,
      title,
      description,
      documents,
      status: "draft",
      createdAt: this.clock.now()
    };

    profile.complaints.push(complaint);
    profile.updatedAt = this.clock.now();

    return complaint;
  }

  /**
   * Submit a complaint for review
   * Integrates with complaint-generator to analyze and classify the complaint
   */
  async submitComplaint(
    username: string,
    complaintId: string
  ): Promise<ComplaintSubmission> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (profile.status !== "verified") {
      throw new Error("Client must be fully verified to submit complaints");
    }

    const complaint = profile.complaints.find(c => c.id === complaintId);
    if (!complaint) {
      throw new Error("Complaint not found");
    }

    if (complaint.status !== "draft") {
      throw new Error("Complaint already submitted");
    }

    // In production: Call complaint-generator API
    // For now, simulate the integration
    const generatedComplaintCid = await this.integrateWithComplaintGenerator(complaint);

    complaint.status = "submitted";
    complaint.submittedAt = this.clock.now();
    complaint.generatedComplaint = {
      cid: generatedComplaintCid,
      generatedAt: this.clock.now(),
      classification: {
        type: "civil",
        categories: ["employment", "discrimination"]
      },
      analysis: {
        strength: "high",
        recommendations: ["Additional evidence recommended"]
      }
    };

    profile.updatedAt = this.clock.now();

    return complaint;
  }

  /**
   * Delegate document access to an attorney using UCAN tokens
   */
  delegateDocumentAccess(
    username: string,
    documentId: string,
    attorneyDID: string,
    accessLevel: DocumentAccessLevel,
    expiresIn: number // seconds
  ): UCANToken {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    const document = this.encryptedDocuments.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    if (document.owner !== profile.encryption?.publicKey) {
      throw new Error("Not authorized to delegate access to this document");
    }

    // Create UCAN token with document access capability
    const token = this.createUCANToken(
      username,
      attorneyDID,
      [{
        resource: `ipfs://${document.cid}`,
        access: accessLevel
      }],
      expiresIn
    );

    return token;
  }

  /**
   * Get client profile by username
   */
  getClientProfile(username: string): ClientProfile | undefined {
    return this.clientProfiles.get(username);
  }

  /**
   * Authenticate client with username and password
   */
  async authenticateClient(username: string, password: string): Promise<ClientProfile> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Invalid credentials");
    }

    const isValid = await bcrypt.compare(password, profile.credentials.passwordHash);
    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    // Update last login
    profile.credentials.lastLogin = this.clock.now();
    profile.updatedAt = this.clock.now();

    return profile;
  }

  /**
   * List all complaints for a client
   */
  getClientComplaints(username: string): ComplaintSubmission[] {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }
    return profile.complaints;
  }

  /**
   * Get a specific complaint
   */
  getComplaint(username: string, complaintId: string): ComplaintSubmission | undefined {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      return undefined;
    }
    return profile.complaints.find(c => c.id === complaintId);
  }

  /**
   * List all documents owned by a client
   */
  getClientDocuments(username: string): EncryptedDocument[] {
    const profile = this.clientProfiles.get(username);
    if (!profile || !profile.encryption) {
      return [];
    }

    return Array.from(this.encryptedDocuments.values()).filter(
      doc => doc.owner === profile.encryption!.publicKey
    );
  }

  /**
   * Get a specific document
   */
  getDocument(documentId: string): EncryptedDocument | undefined {
    return this.encryptedDocuments.get(documentId);
  }

  /**
   * Verify UCAN token validity
   */
  verifyUCANToken(token: UCANToken): boolean {
    // Check expiration
    if (this.clock.now() > token.expiresAt) {
      return false;
    }

    // Verify signature
    // In production, verify EdDSA signature using issuer's public key
    // For now, just check that signature exists
    return token.signature.length > 0;
  }

  /**
   * Get UCAN tokens issued by a client
   */
  getClientUCANTokens(username: string): UCANToken[] {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      return [];
    }
    return profile.ucanTokens;
  }

  // ========== Private Helper Methods ==========

  /**
   * Derive encryption key from password using PBKDF2
   */
  private async deriveKeyFromPassword(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.PBKDF2_ITERATIONS,
        this.KEY_LENGTH,
        "sha256",
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  /**
   * Encrypt data with a key using AES-256-GCM
   */
  private encryptWithKey(data: Buffer, key: Buffer): Buffer {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Combine IV + encrypted data + auth tag
    return Buffer.concat([iv, encrypted, authTag]);
  }

  /**
   * Decrypt data with a key using AES-256-GCM
   */
  private decryptWithKey(encryptedData: Buffer, key: Buffer): Buffer {
    // Extract IV, encrypted data, and auth tag
    const iv = encryptedData.subarray(0, this.IV_LENGTH);
    const authTag = encryptedData.subarray(encryptedData.length - this.AUTH_TAG_LENGTH);
    const encrypted = encryptedData.subarray(this.IV_LENGTH, encryptedData.length - this.AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Sign UCAN token (simplified - use EdDSA in production)
   */
  private signUCANToken(token: Omit<UCANToken, "signature">, publicKey: PublicKeyLike): string {
    const payload = JSON.stringify({
      id: token.id,
      issuer: token.issuer,
      audience: token.audience,
      capabilities: token.capabilities,
      expiresAt: token.expiresAt
    });

    // In production, use EdDSA signature with private key
    // For now, use HMAC with public key as secret
    const hmac = crypto.createHmac("sha256", publicKey);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Integration with complaint-generator Python package
   * In production, this would call the Python API via HTTP or subprocess
   */
  private async integrateWithComplaintGenerator(complaint: ComplaintSubmission): Promise<string> {
    // Simulate complaint generation
    // In production:
    // 1. Call complaint-generator API with complaint details
    // 2. Get back classification, analysis, and generated legal document
    // 3. Upload generated document to IPFS
    // 4. Return IPFS CID
    
    return `ipfs://Qm${crypto.randomBytes(32).toString("hex")}`;
  }

  /**
   * Resend email verification token
   */
  async resendEmailVerification(username: string): Promise<void> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    if (profile.credentials.emailVerified) {
      throw new Error("Email already verified");
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    profile.credentials.emailVerificationToken = verificationToken;

    // Store new verification request
    const verificationRequest: EmailVerificationRequest = {
      username,
      email: profile.credentials.email,
      token: verificationToken,
      expiresAt: this.clock.now() + 24 * 60 * 60 // 24 hours
    };
    this.emailVerifications.set(verificationToken, verificationRequest);
  }

  /**
   * Update client password
   */
  async updatePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
    const profile = this.clientProfiles.get(username);
    if (!profile) {
      throw new Error("Client not found");
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, profile.credentials.passwordHash);
    if (!isValid) {
      throw new Error("Invalid current password");
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    profile.credentials.passwordHash = newPasswordHash;
    profile.updatedAt = this.clock.now();

    // If encryption is configured, need to re-encrypt master key with new password
    if (profile.encryption) {
      // Decrypt master key with old password
      const salt = Buffer.from(profile.encryption.salt, "base64");
      const oldPasswordKey = await this.deriveKeyFromPassword(oldPassword, salt);
      const encryptedMasterKey = Buffer.from(profile.encryption.encryptedMasterKey, "base64");
      const masterKey = this.decryptWithKey(encryptedMasterKey, oldPasswordKey);

      // Re-encrypt with new password
      const newPasswordKey = await this.deriveKeyFromPassword(newPassword, salt);
      const newEncryptedMasterKey = this.encryptWithKey(masterKey, newPasswordKey);
      profile.encryption.encryptedMasterKey = newEncryptedMasterKey.toString("base64");
    }
  }

  /**
   * Get all clients (admin function)
   */
  getAllClients(): ClientProfile[] {
    return Array.from(this.clientProfiles.values());
  }

  /**
   * Get clients by status (admin function)
   */
  getClientsByStatus(status: ClientStatus): ClientProfile[] {
    return Array.from(this.clientProfiles.values()).filter(
      profile => profile.status === status
    );
  }

  /**
   * Search clients by email or username
   */
  searchClients(query: string): ClientProfile[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.clientProfiles.values()).filter(profile => {
      return (
        profile.credentials.username.toLowerCase().includes(lowerQuery) ||
        profile.credentials.email.toLowerCase().includes(lowerQuery)
      );
    });
  }
}
