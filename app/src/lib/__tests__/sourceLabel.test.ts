import { describe, expect, it } from "vitest";
import { relayLabel, sourceLabel } from "../sourceLabel";

describe("price source labels", () => {
  it("names the admin relay honestly instead of a Dispatch override", () => {
    expect(sourceLabel("relay")).toBe("Admin-relayed reference price (ECB daily)");
    expect(relayLabel("hermes")).toBe("Pyth via Hermes");
    expect(sourceLabel("ecb-ref")).toMatch(/not a live feed/);
    expect(sourceLabel("pyth")).toBe("Pyth (live)");
  });
});
