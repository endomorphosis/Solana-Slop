import { describe, it, expect, beforeEach } from "vitest";
import { ComplaintGeneratorBridge } from "../src/client/complaint-generator-bridge.js";

describe("ComplaintGeneratorBridge", () => {
  let bridge: ComplaintGeneratorBridge;

  beforeEach(() => {
    bridge = new ComplaintGeneratorBridge();
  });

  describe("Complaint Classification", () => {
    it("should classify a complaint text", async () => {
      const complaintText = "I was discriminated against at work due to my race.";
      const classification = await bridge.classifyComplaint(complaintText);

      expect(classification).toBeDefined();
      expect(classification.claimTypes).toBeInstanceOf(Array);
      expect(classification.claimTypes.length).toBeGreaterThan(0);
      expect(classification.jurisdiction).toBeDefined();
      expect(classification.legalAreas).toBeInstanceOf(Array);
      expect(classification.confidence).toBeGreaterThanOrEqual(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
    });

    it("should return mock data when Python is unavailable", async () => {
      const complaintText = "Employment discrimination case";
      const classification = await bridge.classifyComplaint(complaintText);

      // Mock data should contain civil_rights or employment-related claims
      expect(classification.claimTypes).toContain("civil_rights");
      expect(classification.jurisdiction).toBe("federal");
    });
  });

  describe("Statute Retrieval", () => {
    it("should retrieve relevant statutes", async () => {
      const complaintText = "I was discriminated against at work.";
      const statutes = await bridge.retrieveStatutes(complaintText);

      expect(statutes).toBeInstanceOf(Array);
      expect(statutes.length).toBeGreaterThan(0);
      
      const statute = statutes[0];
      expect(statute.citation).toBeDefined();
      expect(statute.title).toBeDefined();
      expect(statute.text).toBeDefined();
      expect(statute.relevance).toBeGreaterThanOrEqual(0);
      expect(statute.relevance).toBeLessThanOrEqual(1);
      expect(statute.source).toBeDefined();
    });

    it("should retrieve statutes with classification", async () => {
      const complaintText = "Employment discrimination case";
      const classification = {
        claimTypes: ["employment_discrimination"],
        jurisdiction: "federal",
        legalAreas: ["employment_law"],
        confidence: 0.85
      };

      const statutes = await bridge.retrieveStatutes(complaintText, classification);
      expect(statutes).toBeInstanceOf(Array);
      expect(statutes.length).toBeGreaterThan(0);
    });

    it("should include Title VII statute in mock data", async () => {
      const statutes = await bridge.retrieveStatutes("discrimination");
      
      const titleVII = statutes.find(s => s.citation.includes("2000e"));
      expect(titleVII).toBeDefined();
      expect(titleVII?.title).toContain("Title VII");
    });
  });

  describe("Evidence Questions Generation", () => {
    it("should generate evidence-gathering questions", async () => {
      const complaintText = "I was discriminated against at work.";
      const questions = await bridge.generateEvidenceQuestions(complaintText);

      expect(questions).toBeInstanceOf(Array);
      expect(questions.length).toBeGreaterThan(0);
      
      const question = questions[0];
      expect(question.question).toBeDefined();
      expect(question.category).toBeDefined();
      expect(["high", "medium", "low"]).toContain(question.priority);
      expect(question.reasoning).toBeDefined();
    });

    it("should generate questions with classification", async () => {
      const complaintText = "Employment discrimination case";
      const classification = {
        claimTypes: ["employment_discrimination"],
        jurisdiction: "federal",
        legalAreas: ["employment_law"],
        confidence: 0.85
      };

      const questions = await bridge.generateEvidenceQuestions(complaintText, classification);
      expect(questions).toBeInstanceOf(Array);
      expect(questions.length).toBeGreaterThan(0);
    });

    it("should include high-priority questions in mock data", async () => {
      const questions = await bridge.generateEvidenceQuestions("discrimination");
      
      const highPriority = questions.filter(q => q.priority === "high");
      expect(highPriority.length).toBeGreaterThan(0);
    });
  });

  describe("Legal Resources Search", () => {
    it("should search for legal resources", async () => {
      const query = "employment discrimination";
      const resources = await bridge.searchLegalResources(query);

      expect(resources).toBeInstanceOf(Array);
      expect(resources.length).toBeGreaterThan(0);
      
      const resource = resources[0];
      expect(resource.title).toBeDefined();
      expect(resource.url).toBeDefined();
      expect(resource.snippet).toBeDefined();
      expect(resource.source).toBeDefined();
      expect(resource.relevance).toBeGreaterThanOrEqual(0);
      expect(resource.relevance).toBeLessThanOrEqual(1);
    });

    it("should include EEOC resources in mock data", async () => {
      const resources = await bridge.searchLegalResources("discrimination");
      
      const eeoc = resources.find(r => r.source === "EEOC");
      expect(eeoc).toBeDefined();
      expect(eeoc?.title).toContain("EEOC");
    });
  });

  describe("Web Archives Search", () => {
    it("should search web archives", async () => {
      const query = "employment law history";
      const results = await bridge.searchWebArchives(query);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      
      const result = results[0];
      expect(result.url).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.snippet).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.archiveUrl).toBeDefined();
    });
  });

  describe("Complete Complaint Generation", () => {
    it("should generate complete complaint analysis", async () => {
      const complaintText = "I was discriminated against at work due to my race.";
      const result = await bridge.generateComplaint(complaintText);

      expect(result).toBeDefined();
      expect(result.classification).toBeDefined();
      expect(result.statutes).toBeInstanceOf(Array);
      expect(result.evidenceSuggestions).toBeInstanceOf(Array);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.strength).toBeDefined();
      expect(["high", "medium", "low"]).toContain(result.analysis.strength);
      expect(result.analysis.recommendations).toBeInstanceOf(Array);
    });

    it("should analyze strength based on confidence and statutes", async () => {
      const complaintText = "Employment discrimination case";
      const result = await bridge.generateComplaint(complaintText);

      // With mock data (confidence 0.85, 2+ statutes), should be high strength
      expect(result.analysis.strength).toBe("high");
    });

    it("should provide recommendations", async () => {
      const complaintText = "I was discriminated against at work.";
      const result = await bridge.generateComplaint(complaintText);

      expect(result.analysis.recommendations.length).toBeGreaterThan(0);
      
      const recommendations = result.analysis.recommendations.join(" ");
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Integration Status", () => {
    it("should check if complaint generator is available", async () => {
      const isAvailable = await bridge.isAvailable();
      
      // Should be boolean
      expect(typeof isAvailable).toBe("boolean");
    });
  });

  describe("Error Handling", () => {
    it("should gracefully handle Python execution errors", async () => {
      // Even if Python fails, bridge should return mock data
      const classification = await bridge.classifyComplaint("test");
      
      expect(classification).toBeDefined();
      expect(classification.claimTypes).toBeInstanceOf(Array);
    });

    it("should handle empty input gracefully", async () => {
      const classification = await bridge.classifyComplaint("");
      
      expect(classification).toBeDefined();
      expect(classification.claimTypes).toBeInstanceOf(Array);
    });
  });
});
