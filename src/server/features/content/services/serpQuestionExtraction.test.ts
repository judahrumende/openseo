import { describe, expect, it } from "vitest";
import {
  extractPeopleAlsoAsk,
  extractRelatedSearches,
} from "./serpQuestionExtraction";
import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";

describe("extractPeopleAlsoAsk", () => {
  it("pulls question text out of the people_also_ask block's nested items", () => {
    const items: SerpLiveItem[] = [
      { type: "organic", domain: "example.com" },
      {
        type: "people_also_ask",
        items: [
          { type: "people_also_ask_element", title: "How much does it cost?" },
          { type: "people_also_ask_element", title: "Is it worth it?" },
        ],
      },
    ];

    expect(extractPeopleAlsoAsk(items)).toEqual([
      "How much does it cost?",
      "Is it worth it?",
    ]);
  });

  it("returns an empty list when there is no people_also_ask block", () => {
    const items: SerpLiveItem[] = [{ type: "organic" }];
    expect(extractPeopleAlsoAsk(items)).toEqual([]);
  });

  it("dedupes and trims questions", () => {
    const items: SerpLiveItem[] = [
      {
        type: "people_also_ask",
        items: [{ title: "  Is it safe?  " }, { title: "Is it safe?" }],
      },
    ];

    expect(extractPeopleAlsoAsk(items)).toEqual(["Is it safe?"]);
  });
});

describe("extractRelatedSearches", () => {
  it("pulls the plain-string list out of the related_searches block", () => {
    const items: SerpLiveItem[] = [
      { type: "organic" },
      {
        type: "related_searches",
        items: ["best widget", "cheap widget", "best widget"],
      },
    ];

    expect(extractRelatedSearches(items)).toEqual([
      "best widget",
      "cheap widget",
    ]);
  });

  it("returns an empty list when there is no related_searches block", () => {
    const items: SerpLiveItem[] = [{ type: "organic" }];
    expect(extractRelatedSearches(items)).toEqual([]);
  });
});
