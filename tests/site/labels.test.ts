import { describe, expect, test } from "bun:test";
import { selvedge, tartanLabel } from "@/lib/tartan/labels";

describe("tartanLabel", () => {
  test("plain clan tartan", () => {
    expect(tartanLabel({ name: "MacDonald" })).toBe("MacDonald tartan");
  });

  test("adds the variant", () => {
    expect(tartanLabel({ name: "MacDonald", variant: "Modern" })).toBe("MacDonald Modern tartan");
  });

  test("does not repeat a variant already in the name", () => {
    expect(tartanLabel({ name: "MacDonald Modern", variant: "Modern" })).toBe("MacDonald Modern tartan");
  });

  test("drops the '#n' number from the variant", () => {
    expect(tartanLabel({ name: "MacDonald", variant: "Dress #2" })).toBe("MacDonald Dress tartan");
    expect(tartanLabel({ name: "MacDonald", variant: "#2" })).toBe("MacDonald tartan");
  });

  test("removes commas from the name", () => {
    expect(tartanLabel({ name: "Stewart, Royal" })).toBe("Stewart Royal tartan");
  });
});

describe("selvedge", () => {
  test("builds a hard-stop gradient across one sett", () => {
    expect(selvedge({ threadcount: "R4 G4", palette: { R: "#ff0000", G: "#00ff00" } })).toBe(
      "linear-gradient(90deg, #ff0000 0.00% 50.00%, #00ff00 50.00% 100.00%)",
    );
  });

  test("uses grey for a colour missing from the palette", () => {
    expect(selvedge({ threadcount: "R4 G4", palette: { R: "#ff0000" } })).toContain("#808080 50.00% 100.00%");
  });

  test("is undefined with no tartan or a bad threadcount", () => {
    expect(selvedge(undefined)).toBeUndefined();
    expect(selvedge({ threadcount: "rubbish!", palette: {} })).toBeUndefined();
  });
});
