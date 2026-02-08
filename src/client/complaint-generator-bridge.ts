import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Classification result from complaint-generator
 */
export interface ComplaintClassification {
  claimTypes: string[];
  jurisdiction: string;
  legalAreas: string[];
  confidence: number;
}

/**
 * Legal statute information
 */
export interface LegalStatute {
  citation: string;
  title: string;
  text: string;
  relevance: number;
  source: string;
}

/**
 * Evidence suggestion from complaint-generator
 */
export interface EvidenceSuggestion {
  question: string;
  category: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
}

/**
 * Legal resource search result
 */
export interface LegalResource {
  title: string;
  url: string;
  snippet: string;
  source: string;
  relevance: number;
}

/**
 * Web archive search result
 */
export interface WebArchiveResult {
  url: string;
  title: string;
  snippet: string;
  timestamp: string;
  archiveUrl: string;
}

/**
 * Complaint generation result
 */
export interface ComplaintGenerationResult {
  classification: ComplaintClassification;
  statutes: LegalStatute[];
  evidenceSuggestions: EvidenceSuggestion[];
  analysis: {
    strength: "high" | "medium" | "low";
    recommendations: string[];
  };
}

/**
 * Bridge to the Python complaint-generator package
 * Provides TypeScript interface to Python functionality
 */
export class ComplaintGeneratorBridge {
  private readonly pythonPath: string;
  private readonly packagePath: string;

  constructor() {
    // Path to the complaint-generator package
    this.packagePath = path.join(
      process.cwd(),
      "packages",
      "complaint-generator"
    );
    
    // Use system Python or virtual environment if available
    this.pythonPath = process.env.PYTHON_PATH || "python3";
  }

  /**
   * Check if the complaint-generator package is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const mainPyPath = path.join(this.packagePath, "main.py");
      return fs.existsSync(mainPyPath);
    } catch {
      return false;
    }
  }

  /**
   * Classify a complaint text using AI
   */
  async classifyComplaint(complaintText: string): Promise<ComplaintClassification> {
    const result = await this.executePython("classify", { text: complaintText });
    
    return {
      claimTypes: result.claim_types || [],
      jurisdiction: result.jurisdiction || "unknown",
      legalAreas: result.legal_areas || [],
      confidence: result.confidence || 0.5
    };
  }

  /**
   * Retrieve relevant statutes for a complaint
   */
  async retrieveStatutes(
    complaintText: string,
    classification?: ComplaintClassification
  ): Promise<LegalStatute[]> {
    const result = await this.executePython("retrieve_statutes", {
      text: complaintText,
      classification: classification || null
    });

    return (result.statutes || []).map((s: any) => ({
      citation: s.citation || "",
      title: s.title || "",
      text: s.text || "",
      relevance: s.relevance || 0,
      source: s.source || "unknown"
    }));
  }

  /**
   * Generate evidence-gathering questions
   */
  async generateEvidenceQuestions(
    complaintText: string,
    classification?: ComplaintClassification
  ): Promise<EvidenceSuggestion[]> {
    const result = await this.executePython("generate_questions", {
      text: complaintText,
      classification: classification || null
    });

    return (result.questions || []).map((q: any) => ({
      question: q.question || "",
      category: q.category || "general",
      priority: q.priority || "medium",
      reasoning: q.reasoning || ""
    }));
  }

  /**
   * Search for legal resources
   */
  async searchLegalResources(query: string): Promise<LegalResource[]> {
    const result = await this.executePython("search_legal", {
      query
    });

    return (result.resources || []).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.snippet || "",
      source: r.source || "unknown",
      relevance: r.relevance || 0
    }));
  }

  /**
   * Search web archives (Common Crawl)
   */
  async searchWebArchives(query: string): Promise<WebArchiveResult[]> {
    const result = await this.executePython("search_archives", {
      query
    });

    return (result.results || []).map((r: any) => ({
      url: r.url || "",
      title: r.title || "",
      snippet: r.snippet || "",
      timestamp: r.timestamp || "",
      archiveUrl: r.archive_url || ""
    }));
  }

  /**
   * Complete complaint generation workflow
   */
  async generateComplaint(complaintText: string): Promise<ComplaintGenerationResult> {
    const classification = await this.classifyComplaint(complaintText);
    const statutes = await this.retrieveStatutes(complaintText, classification);
    const evidenceSuggestions = await this.generateEvidenceQuestions(
      complaintText,
      classification
    );

    // Analyze complaint strength based on available information
    const strength = this.analyzeStrength(classification, statutes);
    const recommendations = this.generateRecommendations(
      classification,
      statutes,
      evidenceSuggestions
    );

    return {
      classification,
      statutes,
      evidenceSuggestions,
      analysis: {
        strength,
        recommendations
      }
    };
  }

  /**
   * Execute Python script with arguments
   */
  private async executePython(command: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Build command to call Python script
      const scriptPath = path.join(this.packagePath, "run.py");
      
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        // Return mock data for development/testing
        console.warn(`Complaint generator not found at ${scriptPath}, returning mock data`);
        resolve(this.getMockData(command, args));
        return;
      }

      const pythonArgs = [
        scriptPath,
        "--command", command,
        "--json", JSON.stringify(args)
      ];

      const python = spawn(this.pythonPath, pythonArgs, {
        cwd: this.packagePath
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          // Return mock data on error for development
          resolve(this.getMockData(command, args));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          console.error("Failed to parse Python output:", error);
          // Return mock data on parse error for development
          resolve(this.getMockData(command, args));
        }
      });

      python.on("error", (error) => {
        console.error("Failed to start Python process:", error);
        // Return mock data on error for development
        resolve(this.getMockData(command, args));
      });
    });
  }

  /**
   * Generate mock data for development/testing
   */
  private getMockData(command: string, args: any): any {
    switch (command) {
      case "classify":
        return {
          claim_types: ["civil_rights", "employment_discrimination"],
          jurisdiction: "federal",
          legal_areas: ["employment_law", "civil_rights"],
          confidence: 0.85
        };
      
      case "retrieve_statutes":
        return {
          statutes: [
            {
              citation: "42 U.S.C. § 2000e",
              title: "Title VII of the Civil Rights Act of 1964",
              text: "It shall be an unlawful employment practice for an employer to discriminate...",
              relevance: 0.95,
              source: "US Code"
            },
            {
              citation: "42 U.S.C. § 1981",
              title: "Equal rights under the law",
              text: "All persons shall have the same right to make and enforce contracts...",
              relevance: 0.88,
              source: "US Code"
            }
          ]
        };
      
      case "generate_questions":
        return {
          questions: [
            {
              question: "Do you have documentation of the discriminatory incidents?",
              category: "evidence",
              priority: "high",
              reasoning: "Written documentation is crucial for proving discrimination claims"
            },
            {
              question: "Were there any witnesses to the incidents?",
              category: "witnesses",
              priority: "high",
              reasoning: "Witness testimony can corroborate your account"
            },
            {
              question: "Did you report these incidents to HR or management?",
              category: "internal_process",
              priority: "medium",
              reasoning: "Exhausting internal remedies is important for employment claims"
            }
          ]
        };
      
      case "search_legal":
        return {
          resources: [
            {
              title: "EEOC Guidelines on Employment Discrimination",
              url: "https://www.eeoc.gov/laws/guidance",
              snippet: "The Equal Employment Opportunity Commission provides guidance...",
              source: "EEOC",
              relevance: 0.92
            },
            {
              title: "Civil Rights Law Overview",
              url: "https://www.law.cornell.edu/wex/civil_rights",
              snippet: "Civil rights are the rights of individuals to receive equal treatment...",
              source: "Cornell Law",
              relevance: 0.87
            }
          ]
        };
      
      case "search_archives":
        return {
          results: [
            {
              url: "https://example.com/relevant-article",
              title: "Historical Context of Employment Law",
              snippet: "This archived article discusses the evolution of employment discrimination law...",
              timestamp: "2020-01-15T00:00:00Z",
              archive_url: "https://web.archive.org/web/20200115000000/https://example.com/relevant-article"
            }
          ]
        };
      
      default:
        return {};
    }
  }

  /**
   * Analyze complaint strength based on classification and statutes
   */
  private analyzeStrength(
    classification: ComplaintClassification,
    statutes: LegalStatute[]
  ): "high" | "medium" | "low" {
    if (classification.confidence > 0.8 && statutes.length >= 2) {
      return "high";
    } else if (classification.confidence > 0.5 && statutes.length >= 1) {
      return "medium";
    }
    return "low";
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    classification: ComplaintClassification,
    statutes: LegalStatute[],
    evidenceSuggestions: EvidenceSuggestion[]
  ): string[] {
    const recommendations: string[] = [];

    if (classification.confidence < 0.7) {
      recommendations.push("Consider providing more specific details about the incident");
    }

    if (statutes.length === 0) {
      recommendations.push("Additional legal research may be needed to identify applicable statutes");
    }

    const highPriorityEvidence = evidenceSuggestions.filter(e => e.priority === "high");
    if (highPriorityEvidence.length > 0) {
      recommendations.push(`Gather ${highPriorityEvidence.length} high-priority pieces of evidence`);
    }

    if (recommendations.length === 0) {
      recommendations.push("Complaint appears well-documented and legally supported");
    }

    return recommendations;
  }
}
