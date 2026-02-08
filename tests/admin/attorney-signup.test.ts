import { describe, it, expect, beforeEach } from "vitest";
import { AdminDashboard } from "../../src/admin/dashboard.js";
import type { AttorneyProfile, BarLicenseInfo, PracticeArea } from "../../src/admin/types.js";

class FakeClock {
  private currentTime: number;

  constructor(startTime = 1000000) {
    this.currentTime = startTime;
  }

  now(): number {
    return this.currentTime;
  }

  advance(ms: number): void {
    this.currentTime += ms;
  }
}

describe("Attorney Signup Flow", () => {
  let dashboard: AdminDashboard;
  let clock: FakeClock;

  beforeEach(() => {
    clock = new FakeClock();
    dashboard = new AdminDashboard(clock);
  });

  describe("registerAttorneySignup", () => {
    it("should register a new attorney signup", () => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );

      expect(registration.username).toBe("attorney1");
      expect(registration.email).toBe("attorney1@example.com");
      expect(registration.emailVerified).toBe(false);
      expect(registration.registeredAt).toBe(clock.now());
      expect(registration.verificationToken).toBeDefined();
    });

    it("should reject duplicate username", () => {
      dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");

      expect(() => {
        dashboard.registerAttorneySignup("attorney1", "different@example.com");
      }).toThrow("Username already exists");
    });

    it("should reject duplicate email", () => {
      dashboard.registerAttorneySignup("attorney1", "attorney@example.com");

      expect(() => {
        dashboard.registerAttorneySignup("attorney2", "attorney@example.com");
      }).toThrow("Email already registered");
    });
  });

  describe("verifyAttorneyEmail", () => {
    it("should verify email with correct token", () => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );

      dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);

      const retrieved = dashboard.getAttorneyRegistration(registration.id);
      expect(retrieved?.emailVerified).toBe(true);
      expect(retrieved?.verificationToken).toBeUndefined();
    });

    it("should reject invalid token", () => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );

      expect(() => {
        dashboard.verifyAttorneyEmail(registration.id, "invalid_token");
      }).toThrow("Invalid verification token");
    });

    it("should reject invalid registration ID", () => {
      expect(() => {
        dashboard.verifyAttorneyEmail("invalid_id", "some_token");
      }).toThrow("Registration not found");
    });
  });

  describe("submitAttorneyDetails", () => {
    const barLicense: BarLicenseInfo = {
      state: "California",
      licenseNumber: "123456",
      yearAdmitted: 2015,
      status: "active"
    };

    const practiceAreas: PracticeArea[] = ["civil_litigation", "personal_injury"];

    it("should submit attorney profile after email verification", () => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );
      dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);

      const profile = dashboard.submitAttorneyDetails(
        registration.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        practiceAreas,
        true,
        "Experienced attorney with 10 years in civil litigation"
      );

      expect(profile.publicKey).toBe("attorney1_wallet");
      expect(profile.fullName).toBe("John Attorney");
      expect(profile.email).toBe("attorney1@example.com");
      expect(profile.emailVerified).toBe(true);
      expect(profile.barLicense).toEqual(barLicense);
      expect(profile.practiceAreas).toEqual(practiceAreas);
      expect(profile.acceptsSolicitations).toBe(true);
      expect(profile.verificationStatus).toBe("pending");
      expect(profile.bio).toBe("Experienced attorney with 10 years in civil litigation");
    });

    it("should reject submission without email verification", () => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );

      expect(() => {
        dashboard.submitAttorneyDetails(
          registration.id,
          "attorney1_wallet",
          "John Attorney",
          barLicense,
          practiceAreas,
          true
        );
      }).toThrow("Email must be verified before submitting profile");
    });

    it("should reject duplicate public key", () => {
      const registration1 = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );
      dashboard.verifyAttorneyEmail(registration1.id, registration1.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration1.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        practiceAreas,
        true
      );

      const registration2 = dashboard.registerAttorneySignup(
        "attorney2",
        "attorney2@example.com"
      );
      dashboard.verifyAttorneyEmail(registration2.id, registration2.verificationToken!);

      expect(() => {
        dashboard.submitAttorneyDetails(
          registration2.id,
          "attorney1_wallet",
          "Jane Attorney",
          barLicense,
          practiceAreas,
          false
        );
      }).toThrow("Profile already exists for this public key");
    });

    it("should reject invalid registration ID", () => {
      expect(() => {
        dashboard.submitAttorneyDetails(
          "invalid_id",
          "attorney1_wallet",
          "John Attorney",
          barLicense,
          practiceAreas,
          true
        );
      }).toThrow("Registration not found");
    });
  });

  describe("verifyAttorneyProfile", () => {
    const barLicense: BarLicenseInfo = {
      state: "California",
      licenseNumber: "123456",
      yearAdmitted: 2015,
      status: "active"
    };

    const practiceAreas: PracticeArea[] = ["civil_litigation"];

    beforeEach(() => {
      const registration = dashboard.registerAttorneySignup(
        "attorney1",
        "attorney1@example.com"
      );
      dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        practiceAreas,
        true
      );
    });

    it("should approve attorney profile", () => {
      clock.advance(10000);

      const profile = dashboard.verifyAttorneyProfile(
        "attorney1_wallet",
        "admin_wallet",
        true,
        "Verified with California State Bar"
      );

      expect(profile.verificationStatus).toBe("verified");
      expect(profile.verifiedBy).toBe("admin_wallet");
      expect(profile.verifiedAt).toBe(clock.now());
      expect(profile.verificationNotes).toBe("Verified with California State Bar");

      // Should also be registered as an account
      const account = dashboard.getAccount("attorney1_wallet");
      expect(account).toBeDefined();
      expect(account?.type).toBe("attorney");
      expect(account?.name).toBe("John Attorney");
    });

    it("should reject attorney profile", () => {
      clock.advance(10000);

      const profile = dashboard.verifyAttorneyProfile(
        "attorney1_wallet",
        "admin_wallet",
        false,
        "Could not verify with state bar"
      );

      expect(profile.verificationStatus).toBe("rejected");
      expect(profile.verifiedBy).toBe("admin_wallet");
      expect(profile.verifiedAt).toBe(clock.now());
      expect(profile.verificationNotes).toBe("Could not verify with state bar");
    });

    it("should reject verification of non-pending profile", () => {
      dashboard.verifyAttorneyProfile("attorney1_wallet", "admin_wallet", true);

      expect(() => {
        dashboard.verifyAttorneyProfile("attorney1_wallet", "admin_wallet", true);
      }).toThrow("Profile is not in pending status");
    });

    it("should reject verification of non-existent profile", () => {
      expect(() => {
        dashboard.verifyAttorneyProfile("unknown_wallet", "admin_wallet", true);
      }).toThrow("Attorney profile not found");
    });
  });

  describe("listAttorneyProfiles", () => {
    const barLicense: BarLicenseInfo = {
      state: "California",
      licenseNumber: "123456",
      yearAdmitted: 2015,
      status: "active"
    };

    it("should list all attorney profiles", () => {
      const registration1 = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(registration1.id, registration1.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration1.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation"],
        true
      );

      const registration2 = dashboard.registerAttorneySignup("attorney2", "attorney2@example.com");
      dashboard.verifyAttorneyEmail(registration2.id, registration2.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration2.id,
        "attorney2_wallet",
        "Jane Attorney",
        barLicense,
        ["criminal_defense"],
        false
      );

      const profiles = dashboard.listAttorneyProfiles();
      expect(profiles).toHaveLength(2);
    });

    it("should filter by verification status", () => {
      const registration1 = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(registration1.id, registration1.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration1.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation"],
        true
      );

      const registration2 = dashboard.registerAttorneySignup("attorney2", "attorney2@example.com");
      dashboard.verifyAttorneyEmail(registration2.id, registration2.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration2.id,
        "attorney2_wallet",
        "Jane Attorney",
        barLicense,
        ["criminal_defense"],
        false
      );

      dashboard.verifyAttorneyProfile("attorney1_wallet", "admin_wallet", true);

      const pending = dashboard.listAttorneyProfiles("pending");
      expect(pending).toHaveLength(1);
      expect(pending[0].publicKey).toBe("attorney2_wallet");

      const verified = dashboard.listAttorneyProfiles("verified");
      expect(verified).toHaveLength(1);
      expect(verified[0].publicKey).toBe("attorney1_wallet");
    });
  });

  describe("listPendingAttorneys", () => {
    it("should list only pending attorney profiles", () => {
      const barLicense: BarLicenseInfo = {
        state: "California",
        licenseNumber: "123456",
        yearAdmitted: 2015,
        status: "active"
      };

      const registration1 = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(registration1.id, registration1.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration1.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation"],
        true
      );

      const registration2 = dashboard.registerAttorneySignup("attorney2", "attorney2@example.com");
      dashboard.verifyAttorneyEmail(registration2.id, registration2.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration2.id,
        "attorney2_wallet",
        "Jane Attorney",
        barLicense,
        ["criminal_defense"],
        false
      );

      dashboard.verifyAttorneyProfile("attorney1_wallet", "admin_wallet", true);

      const pending = dashboard.listPendingAttorneys();
      expect(pending).toHaveLength(1);
      expect(pending[0].publicKey).toBe("attorney2_wallet");
    });
  });

  describe("updateAttorneyProfile", () => {
    const barLicense: BarLicenseInfo = {
      state: "California",
      licenseNumber: "123456",
      yearAdmitted: 2015,
      status: "active"
    };

    beforeEach(() => {
      const registration = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation"],
        true
      );
    });

    it("should update practice areas", () => {
      const updated = dashboard.updateAttorneyProfile("attorney1_wallet", {
        practiceAreas: ["civil_litigation", "personal_injury", "employment_law"]
      });

      expect(updated.practiceAreas).toEqual([
        "civil_litigation",
        "personal_injury",
        "employment_law"
      ]);
    });

    it("should update solicitation acceptance", () => {
      const updated = dashboard.updateAttorneyProfile("attorney1_wallet", {
        acceptsSolicitations: false
      });

      expect(updated.acceptsSolicitations).toBe(false);
    });

    it("should update bio", () => {
      const updated = dashboard.updateAttorneyProfile("attorney1_wallet", {
        bio: "New bio text"
      });

      expect(updated.bio).toBe("New bio text");
    });

    it("should update multiple fields", () => {
      const updated = dashboard.updateAttorneyProfile("attorney1_wallet", {
        practiceAreas: ["family_law"],
        acceptsSolicitations: false,
        bio: "Updated bio"
      });

      expect(updated.practiceAreas).toEqual(["family_law"]);
      expect(updated.acceptsSolicitations).toBe(false);
      expect(updated.bio).toBe("Updated bio");
    });

    it("should reject update of non-existent profile", () => {
      expect(() => {
        dashboard.updateAttorneyProfile("unknown_wallet", { bio: "test" });
      }).toThrow("Attorney profile not found");
    });
  });

  describe("searchVerifiedAttorneys", () => {
    const barLicense: BarLicenseInfo = {
      state: "California",
      licenseNumber: "123456",
      yearAdmitted: 2015,
      status: "active"
    };

    beforeEach(() => {
      // Attorney 1: civil litigation, accepts solicitations
      const reg1 = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(reg1.id, reg1.verificationToken!);
      dashboard.submitAttorneyDetails(
        reg1.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation", "personal_injury"],
        true
      );
      dashboard.verifyAttorneyProfile("attorney1_wallet", "admin_wallet", true);

      // Attorney 2: criminal defense, does not accept solicitations
      const reg2 = dashboard.registerAttorneySignup("attorney2", "attorney2@example.com");
      dashboard.verifyAttorneyEmail(reg2.id, reg2.verificationToken!);
      dashboard.submitAttorneyDetails(
        reg2.id,
        "attorney2_wallet",
        "Jane Attorney",
        barLicense,
        ["criminal_defense"],
        false
      );
      dashboard.verifyAttorneyProfile("attorney2_wallet", "admin_wallet", true);

      // Attorney 3: civil litigation, does not accept solicitations
      const reg3 = dashboard.registerAttorneySignup("attorney3", "attorney3@example.com");
      dashboard.verifyAttorneyEmail(reg3.id, reg3.verificationToken!);
      dashboard.submitAttorneyDetails(
        reg3.id,
        "attorney3_wallet",
        "Bob Attorney",
        barLicense,
        ["civil_litigation"],
        false
      );
      dashboard.verifyAttorneyProfile("attorney3_wallet", "admin_wallet", true);

      // Attorney 4: pending verification
      const reg4 = dashboard.registerAttorneySignup("attorney4", "attorney4@example.com");
      dashboard.verifyAttorneyEmail(reg4.id, reg4.verificationToken!);
      dashboard.submitAttorneyDetails(
        reg4.id,
        "attorney4_wallet",
        "Alice Attorney",
        barLicense,
        ["family_law"],
        true
      );
    });

    it("should return all verified attorneys with no filters", () => {
      const results = dashboard.searchVerifiedAttorneys();
      expect(results).toHaveLength(3);
    });

    it("should filter by practice area", () => {
      const results = dashboard.searchVerifiedAttorneys("civil_litigation");
      expect(results).toHaveLength(2);
      expect(results.map(r => r.publicKey).sort()).toEqual([
        "attorney1_wallet",
        "attorney3_wallet"
      ]);
    });

    it("should filter by solicitation acceptance", () => {
      const results = dashboard.searchVerifiedAttorneys(undefined, true);
      expect(results).toHaveLength(1);
      expect(results[0].publicKey).toBe("attorney1_wallet");
    });

    it("should filter by both practice area and solicitation acceptance", () => {
      const results = dashboard.searchVerifiedAttorneys("civil_litigation", true);
      expect(results).toHaveLength(1);
      expect(results[0].publicKey).toBe("attorney1_wallet");
    });

    it("should return empty array when no matches", () => {
      const results = dashboard.searchVerifiedAttorneys("tax_law");
      expect(results).toHaveLength(0);
    });
  });

  describe("getAttorneyProfile", () => {
    it("should retrieve attorney profile by public key", () => {
      const barLicense: BarLicenseInfo = {
        state: "California",
        licenseNumber: "123456",
        yearAdmitted: 2015,
        status: "active"
      };

      const registration = dashboard.registerAttorneySignup("attorney1", "attorney1@example.com");
      dashboard.verifyAttorneyEmail(registration.id, registration.verificationToken!);
      dashboard.submitAttorneyDetails(
        registration.id,
        "attorney1_wallet",
        "John Attorney",
        barLicense,
        ["civil_litigation"],
        true
      );

      const profile = dashboard.getAttorneyProfile("attorney1_wallet");
      expect(profile).toBeDefined();
      expect(profile?.fullName).toBe("John Attorney");
    });

    it("should return undefined for non-existent profile", () => {
      const profile = dashboard.getAttorneyProfile("unknown_wallet");
      expect(profile).toBeUndefined();
    });
  });
});
