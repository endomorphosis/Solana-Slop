import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Campaign } from "../../src/crowdfunding/campaign.js";
import { makeKeypair, pubkey } from "../helpers/participants.js";
import { CourtLevel, LitigationPath } from "../../src/crowdfunding/types.js";

class FakeClock {
  private nowUnix: number;

  constructor(startUnix: number) {
    this.nowUnix = startUnix;
  }

  now(): number {
    return this.nowUnix;
  }

  set(unix: number): void {
    this.nowUnix = unix;
  }
}

interface ScenarioEvent {
  type: string;
  timestamp: number;
  [key: string]: any;
}

interface Scenario {
  name: string;
  description: string;
  initialFunding: number;
  minRaise: number;
  events: ScenarioEvent[];
  expectedFinalStatus?: string;
  notes?: string;
}

async function loadScenario(filename: string): Promise<Scenario> {
  const path = resolve(__dirname, "../scenarios", filename);
  const content = await readFile(path, "utf-8");
  return JSON.parse(content);
}

function executeScenario(scenario: Scenario): Campaign {
  const clock = new FakeClock(0);
  const attorney = makeKeypair(1);
  const platform = makeKeypair(2);
  const client = makeKeypair(3);
  const daoTreasury = makeKeypair(99);
  const funderA = makeKeypair(10);

  const signerMap: Record<string, string> = {
    attorney: pubkey(attorney),
    platform: pubkey(platform),
    client: pubkey(client)
  };

  // Find initial funding event to set deadline
  const initialEvent = scenario.events.find(e => e.type === "initial_funding");
  const deadline = initialEvent ? initialEvent.timestamp + 100 : 1100;

  const campaign = new Campaign(
    {
      id: `scenario-${scenario.name}`,
      minRaiseLamports: scenario.minRaise,
      deadlineUnix: deadline,
      refundWindowStartUnix: deadline + 200,
      signers: [pubkey(attorney), pubkey(platform), pubkey(client)],
      daoTreasury: pubkey(daoTreasury)
    },
    clock
  );

  for (const event of scenario.events) {
    clock.set(event.timestamp);

    try {
      switch (event.type) {
        case "initial_funding":
          campaign.contribute(pubkey(funderA), event.amount);
          break;

        case "evaluate":
          campaign.evaluate();
          if (event.expectedStatus) {
            expect(campaign.getStatus()).toBe(event.expectedStatus);
          }
          break;

        case "record_outcome":
          campaign.recordOutcome(
            event.outcome,
            event.judgmentAmount
          );
          break;

        case "deposit_court_award":
          campaign.depositCourtAward(pubkey(attorney), event.amount);
          break;

        case "pay_judgment":
          campaign.payJudgment(event.amount);
          break;

        case "approve_appeal": {
          const approvers = event.approvers || ["attorney"];
          const estimatedCost = event.estimatedCost;
          const courtLevel = event.courtLevel as CourtLevel || "appellate";
          const path = event.path as LitigationPath || "appeal";
          const deadline = event.deadline;

          for (const approverName of approvers) {
            const approverKey = signerMap[approverName];
            campaign.approveAppeal(approverKey, estimatedCost, deadline, courtLevel, path);
          }
          break;
        }

        case "contribute_to_appeal":
          campaign.contributeToAppeal(pubkey(funderA), event.amount);
          break;

        case "evaluate_appeal":
          campaign.evaluateAppeal();
          if (event.expectedStatus) {
            expect(campaign.getStatus()).toBe(event.expectedStatus);
          }
          break;

        default:
          console.warn(`Unknown event type: ${event.type}`);
      }
    } catch (error: any) {
      // Log error with context for debugging
      console.error(`Error executing event ${event.type} at timestamp ${event.timestamp}:`, error.message);
      if (event.comment) {
        console.error(`Event comment: ${event.comment}`);
      }
      throw error;
    }
  }

  return campaign;
}

describe("Scenario-based chaos testing", () => {
  it("executes simple-win-no-appeal scenario", async () => {
    const scenario = await loadScenario("simple-win-no-appeal.json");
    const campaign = executeScenario(scenario);
    
    expect(campaign.getStatus()).toBe("won");
    expect(campaign.getOutcome()).toBe("win");
    // Initial 150k - 15k DAO fee + 200k award = 335k
    expect(campaign.getAvailableFunds()).toBe(335000);
  });

  it("executes loss-appeal-to-supreme scenario", async () => {
    const scenario = await loadScenario("loss-appeal-to-supreme.json");
    const campaign = executeScenario(scenario);
    
    // Verify multiple appeal rounds were created
    const appealRounds = campaign.getAppealRounds();
    expect(appealRounds.length).toBeGreaterThan(2);
    
    // Verify court level progression
    const courtLevels = appealRounds.map(r => r.courtLevel);
    expect(courtLevels).toContain("appellate");
    expect(courtLevels).toContain("state_supreme");
    expect(courtLevels).toContain("us_supreme");
  });

  it("executes win-remand-retrial scenario", async () => {
    const scenario = await loadScenario("win-remand-retrial.json");
    const campaign = executeScenario(scenario);
    
    expect(campaign.getStatus()).toBe("won");
    
    // Verify retrial path was taken
    const appealRounds = campaign.getAppealRounds();
    const retrialRound = appealRounds.find(r => r.path === "retrial");
    expect(retrialRound).toBeDefined();
  });

  it("executes decade-long-litigation scenario", async () => {
    const scenario = await loadScenario("decade-long-litigation.json");
    const campaign = executeScenario(scenario);
    
    expect(campaign.getStatus()).toBe("settled");
    expect(campaign.getOutcome()).toBe("settlement");
    
    // Verify extensive appeal history
    const appealRounds = campaign.getAppealRounds();
    expect(appealRounds.length).toBeGreaterThanOrEqual(4);
    
    // Verify multiple court levels were visited
    const courtLevels = new Set(appealRounds.map(r => r.courtLevel));
    expect(courtLevels.size).toBeGreaterThan(1);
  });

  it("verifies conditional fundraising logic", async () => {
    const scenario = await loadScenario("loss-appeal-to-supreme.json");
    const campaign = executeScenario(scenario);
    
    const appealRounds = campaign.getAppealRounds();
    
    // First appeal should not need fundraising (sufficient funds)
    const firstAppeal = appealRounds[0];
    expect(firstAppeal.fundraisingNeeded).toBe(false);
    
    // Later appeals should need fundraising (depleted funds)
    const laterAppeals = appealRounds.slice(1);
    const needsFunding = laterAppeals.some(r => r.fundraisingNeeded);
    expect(needsFunding).toBe(true);
  });
});
