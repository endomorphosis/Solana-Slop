import { describe, expect, it } from "vitest";
import { Connection } from "@solana/web3.js";
import { RPC_URL } from "../../src/env.js";

describe("integration: testnet RPC", () => {
  const shouldRun = process.env.RUN_INTEGRATION === "1";
  const testFn = shouldRun ? it : it.skip;

  testFn("fetches cluster version", async () => {
    const connection = new Connection(RPC_URL, "confirmed");
    const version = await connection.getVersion();
    expect(version["solana-core"]).toBeDefined();
  });
});
