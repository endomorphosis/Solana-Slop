import { describe, expect, it } from "vitest";
import { RPC_URL } from "../src/env.js";

describe("env", () => {
  it("uses testnet RPC by default", () => {
    expect(RPC_URL).toBe("https://api.testnet.solana.com");
  });
});
