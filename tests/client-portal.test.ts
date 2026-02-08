import { describe, it, expect, beforeEach } from "vitest";
import { ClientPortal } from "../src/client/portal.js";
import type { Clock } from "../src/crowdfunding/types.js";

// Mock clock for testing
class MockClock implements Clock {
  private timestamp = 1000000;

  now(): number {
    return this.timestamp;
  }

  advance(seconds: number): void {
    this.timestamp += seconds;
  }

  set(timestamp: number): void {
    this.timestamp = timestamp;
  }
}

describe("ClientPortal", () => {
  let portal: ClientPortal;
  let clock: MockClock;

  beforeEach(() => {
    clock = new MockClock();
    portal = new ClientPortal(clock);
  });

  describe("Client Registration", () => {
    it("should register a new client with valid credentials", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      expect(profile.credentials.username).toBe("testuser");
      expect(profile.credentials.email).toBe("test@example.com");
      expect(profile.credentials.emailVerified).toBe(false);
      expect(profile.status).toBe("pending_email");
      expect(profile.credentials.passwordHash).toBeDefined();
      expect(profile.credentials.emailVerificationToken).toBeDefined();
    });

    it("should reject registration with short username", async () => {
      await expect(
        portal.registerClient("ab", "password123", "test@example.com")
      ).rejects.toThrow("Username must be at least 3 characters");
    });

    it("should reject registration with short password", async () => {
      await expect(
        portal.registerClient("testuser", "short", "test@example.com")
      ).rejects.toThrow("Password must be at least 8 characters");
    });

    it("should reject registration with invalid email", async () => {
      await expect(
        portal.registerClient("testuser", "password123", "invalid-email")
      ).rejects.toThrow("Valid email address is required");
    });

    it("should reject duplicate username", async () => {
      await portal.registerClient("testuser", "password123", "test1@example.com");
      
      await expect(
        portal.registerClient("testuser", "password456", "test2@example.com")
      ).rejects.toThrow("Username already exists");
    });

    it("should reject duplicate email", async () => {
      await portal.registerClient("user1", "password123", "test@example.com");
      
      await expect(
        portal.registerClient("user2", "password456", "test@example.com")
      ).rejects.toThrow("Email already registered");
    });
  });

  describe("Email Verification", () => {
    it("should verify email with valid token", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const token = profile.credentials.emailVerificationToken!;
      const verified = portal.verifyEmail("testuser", token);

      expect(verified.credentials.emailVerified).toBe(true);
      expect(verified.status).toBe("pending_kyc");
      expect(verified.credentials.emailVerificationToken).toBeUndefined();
    });

    it("should reject verification with invalid token", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      expect(() => {
        portal.verifyEmail("testuser", "invalid-token");
      }).toThrow("Invalid verification token");
    });

    it("should reject verification with expired token", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const token = profile.credentials.emailVerificationToken!;
      
      // Advance time beyond 24 hours
      clock.advance(25 * 60 * 60);

      expect(() => {
        portal.verifyEmail("testuser", token);
      }).toThrow("Verification token has expired");
    });

    it("should reject double verification", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const token = profile.credentials.emailVerificationToken!;
      portal.verifyEmail("testuser", token);

      expect(() => {
        portal.verifyEmail("testuser", token);
      }).toThrow("Email already verified");
    });

    it("should allow resending verification email", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const originalToken = profile.credentials.emailVerificationToken!;
      await portal.resendEmailVerification("testuser");

      const updatedProfile = portal.getClientProfile("testuser")!;
      const newToken = updatedProfile.credentials.emailVerificationToken!;

      expect(newToken).not.toBe(originalToken);
      expect(newToken).toBeDefined();
    });
  });

  describe("KYC Submission", () => {
    it("should submit KYC information after email verification", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const token = profile.credentials.emailVerificationToken!;
      portal.verifyEmail("testuser", token);

      const kycData = {
        fullName: "John Doe",
        dateOfBirth: "1990-01-01",
        ssnLast4: "1234",
        address: {
          street: "123 Main St",
          city: "Anytown",
          state: "CA",
          zipCode: "12345",
          country: "USA"
        },
        phoneNumber: "+1234567890",
        idType: "drivers_license" as const
      };

      const updated = portal.submitKYCInformation("testuser", kycData);

      expect(updated.kyc).toBeDefined();
      expect(updated.kyc!.fullName).toBe("John Doe");
      expect(updated.kyc!.status).toBe("pending_verification");
      expect(updated.status).toBe("kyc_submitted");
    });

    it("should reject KYC submission without email verification", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      expect(() => {
        portal.submitKYCInformation("testuser", {
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
      }).toThrow("Email must be verified before submitting KYC");
    });

    it("should update KYC status", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const token = profile.credentials.emailVerificationToken!;
      portal.verifyEmail("testuser", token);

      portal.submitKYCInformation("testuser", {
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
        idType: "passport"
      });

      const updated = portal.updateKYCStatus("testuser", "verified", {
        provider: "TestKYC",
        verificationId: "VER123",
        status: "verified",
        timestamp: clock.now()
      });

      expect(updated.kyc!.status).toBe("verified");
      expect(updated.status).toBe("verified");
      expect(updated.kyc!.verificationProvider).toBe("TestKYC");
      expect(updated.kyc!.verifiedAt).toBeDefined();
    });
  });

  describe("Encryption Setup", () => {
    it("should setup encryption with valid password", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      const publicKey = "solana_public_key_123";
      const updated = await portal.setupEncryption("testuser", "password123", publicKey);

      expect(updated.encryption).toBeDefined();
      expect(updated.encryption!.publicKey).toBe(publicKey);
      expect(updated.encryption!.did).toBe(`did:key:${publicKey}`);
      expect(updated.encryption!.salt).toBeDefined();
      expect(updated.encryption!.encryptedMasterKey).toBeDefined();
      expect(updated.encryption!.kdfParams.algorithm).toBe("pbkdf2");
      expect(updated.encryption!.kdfParams.iterations).toBe(100000);
    });

    it("should reject encryption setup with invalid password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      await expect(
        portal.setupEncryption("testuser", "wrongpassword", "solana_key")
      ).rejects.toThrow("Invalid password");
    });

    it("should reject duplicate encryption setup", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      await expect(
        portal.setupEncryption("testuser", "password123", "solana_key_2")
      ).rejects.toThrow("Encryption already configured");
    });
  });

  describe("Authentication", () => {
    it("should authenticate client with valid credentials", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      const profile = await portal.authenticateClient("testuser", "password123");

      expect(profile.credentials.username).toBe("testuser");
      expect(profile.credentials.lastLogin).toBe(clock.now());
    });

    it("should reject authentication with invalid username", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      await expect(
        portal.authenticateClient("wronguser", "password123")
      ).rejects.toThrow("Invalid credentials");
    });

    it("should reject authentication with invalid password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      await expect(
        portal.authenticateClient("testuser", "wrongpassword")
      ).rejects.toThrow("Invalid credentials");
    });
  });

  describe("Document Management", () => {
    it("should encrypt and store a document", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      await portal.setupEncryption("testuser", "password123", "solana_key");

      const document = Buffer.from("Sensitive legal document content");
      const encryptedDoc = await portal.encryptDocument(
        "testuser",
        "password123",
        document,
        {
          type: "evidence",
          name: "evidence.pdf",
          cid: "QmTest123"
        }
      );

      expect(encryptedDoc.id).toBeDefined();
      expect(encryptedDoc.type).toBe("evidence");
      expect(encryptedDoc.name).toBe("evidence.pdf");
      expect(encryptedDoc.encryption.algorithm).toBe("aes-256-gcm");
      expect(encryptedDoc.encryption.iv).toBeDefined();
      expect(encryptedDoc.isPermanentlyDecrypted).toBe(false);
    });

    it("should decrypt a document with valid password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const originalContent = "Test document content";
      const document = Buffer.from(originalContent);
      const encryptedDoc = await portal.encryptDocument(
        "testuser",
        "password123",
        document,
        {
          type: "complaint",
          name: "test.pdf",
          cid: "QmTest"
        }
      );

      const decrypted = await portal.decryptDocument(
        "testuser",
        encryptedDoc.id,
        "password123"
      );

      expect(decrypted).toBeDefined();
      expect(decrypted.toString("utf-8")).toBe(originalContent);
    });

    it("should permanently decrypt a document", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const document = Buffer.from("Final submission");
      const encryptedDoc = await portal.encryptDocument(
        "testuser",
        "password123",
        document,
        {
          type: "complaint",
          name: "final.pdf",
          cid: "QmFinal"
        }
      );

      const permanentlyDecrypted = await portal.permanentlyDecryptDocument(
        "testuser",
        encryptedDoc.id,
        "password123"
      );

      expect(permanentlyDecrypted.isPermanentlyDecrypted).toBe(true);
      expect(permanentlyDecrypted.decryptedAt).toBeDefined();
      expect(permanentlyDecrypted.decryptedCid).toBeDefined();
    });

    it("should list client documents", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Doc 1"),
        {
          type: "evidence",
          name: "doc1.pdf",
          cid: "QmDoc1"
        }
      );

      await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Doc 2"),
        {
          type: "complaint",
          name: "doc2.pdf",
          cid: "QmDoc2"
        }
      );

      const documents = portal.getClientDocuments("testuser");
      expect(documents.length).toBe(2);
    });
  });

  describe("UCAN Token Management", () => {
    it("should create UCAN token for document delegation", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const attorneyDID = "did:key:attorney_123";
      const token = portal.createUCANToken(
        "testuser",
        attorneyDID,
        [{ resource: "ipfs://QmDoc", access: "read" }],
        3600 // 1 hour
      );

      expect(token.id).toBeDefined();
      expect(token.issuer).toBe("did:key:solana_key");
      expect(token.audience).toBe(attorneyDID);
      expect(token.capabilities).toHaveLength(1);
      expect(token.capabilities[0].access).toBe("read");
      expect(token.signature).toBeDefined();
      expect(token.expiresAt).toBe(clock.now() + 3600);
    });

    it("should verify valid UCAN token", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const token = portal.createUCANToken(
        "testuser",
        "did:key:attorney",
        [{ resource: "ipfs://QmDoc", access: "read" }],
        3600
      );

      const isValid = portal.verifyUCANToken(token);
      expect(isValid).toBe(true);
    });

    it("should reject expired UCAN token", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const token = portal.createUCANToken(
        "testuser",
        "did:key:attorney",
        [{ resource: "ipfs://QmDoc", access: "read" }],
        3600
      );

      // Advance time past expiration
      clock.advance(3601);

      const isValid = portal.verifyUCANToken(token);
      expect(isValid).toBe(false);
    });

    it("should delegate document access to attorney", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const encryptedDoc = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence"),
        {
          type: "evidence",
          name: "evidence.pdf",
          cid: "QmEvidence"
        }
      );

      const attorneyDID = "did:key:attorney_123";
      const token = portal.delegateDocumentAccess(
        "testuser",
        encryptedDoc.id,
        attorneyDID,
        "read",
        7200 // 2 hours
      );

      expect(token.audience).toBe(attorneyDID);
      expect(token.capabilities[0].resource).toBe("ipfs://QmEvidence");
      expect(token.capabilities[0].access).toBe("read");
    });
  });

  describe("Complaint Management", () => {
    it("should create a complaint with documents", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const doc1 = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence 1"),
        {
          type: "evidence",
          name: "evidence1.pdf",
          cid: "QmEvidence1"
        }
      );

      const doc2 = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence 2"),
        {
          type: "evidence",
          name: "evidence2.pdf",
          cid: "QmEvidence2"
        }
      );

      const complaint = portal.createComplaint(
        "testuser",
        "Employment Discrimination Case",
        "Detailed description of the case...",
        [doc1.id, doc2.id]
      );

      expect(complaint.id).toBeDefined();
      expect(complaint.title).toBe("Employment Discrimination Case");
      expect(complaint.documents).toHaveLength(2);
      expect(complaint.status).toBe("draft");
    });

    it("should submit a complaint for review", async () => {
      const profile = await portal.registerClient(
        "testuser",
        "password123",
        "test@example.com"
      );

      // Complete verification flow
      const token = profile.credentials.emailVerificationToken!;
      portal.verifyEmail("testuser", token);
      portal.submitKYCInformation("testuser", {
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
      portal.updateKYCStatus("testuser", "verified");

      await portal.setupEncryption("testuser", "password123", "solana_key");

      const doc = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence"),
        {
          type: "evidence",
          name: "evidence.pdf",
          cid: "QmEvidence"
        }
      );

      const complaint = portal.createComplaint(
        "testuser",
        "Test Case",
        "Description",
        [doc.id]
      );

      const submitted = await portal.submitComplaint("testuser", complaint.id);

      expect(submitted.status).toBe("submitted");
      expect(submitted.submittedAt).toBeDefined();
      expect(submitted.generatedComplaint).toBeDefined();
      expect(submitted.generatedComplaint!.cid).toBeDefined();

      // Verify that attached documents are permanently decrypted
      const documents = portal.getClientDocuments("testuser");
      const attachedDoc = documents.find(d => d.id === doc.id);
      expect(attachedDoc).toBeDefined();
      expect(attachedDoc!.isPermanentlyDecrypted).toBe(true);
      expect(attachedDoc!.decryptedAt).toBeDefined();
      expect(attachedDoc!.decryptedCid).toBeDefined();
    });

    it("should permanently decrypt multiple attached documents on submission", async () => {
      const profile = await portal.registerClient("testuser", "password123", "test@example.com");
      const token = profile.credentials.emailVerificationToken!;
      portal.verifyEmail("testuser", token);
      
      portal.submitKYCInformation("testuser", {
        fullName: "Test User",
        dateOfBirth: "1990-01-01",
        ssnLast4: "1234",
        address: {
          street: "123 Test St",
          city: "Test City",
          state: "CA",
          zipCode: "12345",
          country: "USA"
        },
        phoneNumber: "+1234567890",
        idType: "drivers_license"
      });
      portal.updateKYCStatus("testuser", "verified");

      await portal.setupEncryption("testuser", "password123", "solana_key");

      // Create multiple documents
      const doc1 = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("evidence 1"),
        { type: "evidence", name: "Document 1", cid: "QmDoc1" }
      );

      const doc2 = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("evidence 2"),
        { type: "evidence", name: "Document 2", cid: "QmDoc2" }
      );

      const complaint = portal.createComplaint(
        "testuser",
        "Test Complaint",
        "Complaint with multiple documents",
        [doc1.id, doc2.id]
      );

      await portal.submitComplaint("testuser", complaint.id);

      // Verify both documents are permanently decrypted
      const documents = portal.getClientDocuments("testuser");
      const attachedDoc1 = documents.find(d => d.id === doc1.id);
      const attachedDoc2 = documents.find(d => d.id === doc2.id);
      
      expect(attachedDoc1!.isPermanentlyDecrypted).toBe(true);
      expect(attachedDoc2!.isPermanentlyDecrypted).toBe(true);
    });

    it("should reject complaint submission for unverified client", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const doc = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence"),
        {
          type: "evidence",
          name: "evidence.pdf",
          cid: "QmEvidence"
        }
      );

      const complaint = portal.createComplaint(
        "testuser",
        "Test Case",
        "Description",
        [doc.id]
      );

      await expect(
        portal.submitComplaint("testuser", complaint.id)
      ).rejects.toThrow("Client must be fully verified to submit complaints");
    });

    it("should list client complaints", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const doc = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Evidence"),
        {
          type: "evidence",
          name: "evidence.pdf",
          cid: "QmEvidence"
        }
      );

      portal.createComplaint("testuser", "Case 1", "Description 1", [doc.id]);
      portal.createComplaint("testuser", "Case 2", "Description 2", [doc.id]);

      const complaints = portal.getClientComplaints("testuser");
      expect(complaints).toHaveLength(2);
    });
  });

  describe("Password Management", () => {
    it("should update password with valid old password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      await portal.updatePassword("testuser", "password123", "newpassword456");

      // Should authenticate with new password
      const profile = await portal.authenticateClient("testuser", "newpassword456");
      expect(profile.credentials.username).toBe("testuser");

      // Should reject old password
      await expect(
        portal.authenticateClient("testuser", "password123")
      ).rejects.toThrow("Invalid credentials");
    });

    it("should reject password update with invalid old password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");

      await expect(
        portal.updatePassword("testuser", "wrongpassword", "newpassword456")
      ).rejects.toThrow("Invalid current password");
    });

    it("should re-encrypt master key when updating password", async () => {
      await portal.registerClient("testuser", "password123", "test@example.com");
      await portal.setupEncryption("testuser", "password123", "solana_key");

      const doc = await portal.encryptDocument(
        "testuser",
        "password123",
        Buffer.from("Test"),
        {
          type: "complaint",
          name: "test.pdf",
          cid: "QmTest"
        }
      );

      // Update password
      await portal.updatePassword("testuser", "password123", "newpassword456");

      // Should be able to decrypt with new password
      const decrypted = await portal.decryptDocument("testuser", doc.id, "newpassword456");
      expect(decrypted).toBeDefined();

      // Should fail with old password
      await expect(
        portal.decryptDocument("testuser", doc.id, "password123")
      ).rejects.toThrow("Invalid password");
    });
  });

  describe("Admin Functions", () => {
    it("should list all clients", async () => {
      await portal.registerClient("user1", "password123", "user1@example.com");
      await portal.registerClient("user2", "password123", "user2@example.com");

      const clients = portal.getAllClients();
      expect(clients).toHaveLength(2);
    });

    it("should filter clients by status", async () => {
      const profile1 = await portal.registerClient("user1", "password123", "user1@example.com");
      await portal.registerClient("user2", "password123", "user2@example.com");

      // Verify user1's email
      portal.verifyEmail("user1", profile1.credentials.emailVerificationToken!);

      const pendingEmail = portal.getClientsByStatus("pending_email");
      expect(pendingEmail).toHaveLength(1);

      const pendingKYC = portal.getClientsByStatus("pending_kyc");
      expect(pendingKYC).toHaveLength(1);
    });

    it("should search clients by username or email", async () => {
      await portal.registerClient("johnsmith", "password123", "john@example.com");
      await portal.registerClient("janesmith", "password123", "jane@example.com");
      await portal.registerClient("bobdoe", "password123", "bob@example.com");

      const smithResults = portal.searchClients("smith");
      expect(smithResults).toHaveLength(2);

      const johnResults = portal.searchClients("john");
      expect(johnResults).toHaveLength(1);

      const emailResults = portal.searchClients("bob@example");
      expect(emailResults).toHaveLength(1);
    });
  });
});
