import { describe, test, expect } from "bun:test";
import { audioFileFor } from "./audio.ts";

describe("audioFileFor", () => {
  test("lowercases word into locale audio dir", () => {
    expect(audioFileFor("/c", "en", "Beautiful")).toBe("/c/en/audio/beautiful.mp3");
  });
  test("rejects traversal, bad locale, empty", () => {
    expect(audioFileFor("/c", "en", "../secret")).toBeNull();
    expect(audioFileFor("/c", "en", "a/b")).toBeNull();
    expect(audioFileFor("/c", "../../etc", "hi")).toBeNull();
    expect(audioFileFor("/c", "en", "")).toBeNull();
  });
});
