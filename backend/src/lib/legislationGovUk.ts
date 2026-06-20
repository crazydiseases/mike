export type LegislationToolEvent =
    | {
          type: "legislation_search";
          query: string;
          result_count: number;
          error?: string;
      }
    | {
          type: "legislation_get_document";
          uri: string;
          title?: string | null;
          version?: "revised" | "enacted" | null;
          section_count: number;
          error?: string;
      }
    | {
          type: "legislation_find_in_document";
          uri: string | null;
          query: string;
          total_matches: number;
          title?: string | null;
          searches?: {
              uri: string | null;
              query: string;
              total_matches: number;
              title?: string | null;
              error?: string;
          }[];
          error?: string;
      }
    | {
          type: "legislation_read_section";
          uri: string | null;
          title?: string | null;
          section_count: number;
          error?: string;
      };

export type LegislationCitationEvent = {
    type: "legislation_citation";
    uri: string;
    title: string | null;
    section: string | null;
    url: string;
    version: "revised" | "enacted";
};

export const LEGISLATION_TOOL_NAMES = {
    search: "legislation_search",
    getDocument: "legislation_get_document",
    findInDocument: "legislation_find_in_document",
    readSection: "legislation_read_section",
} as const;

export const LEGISLATION_SYSTEM_PROMPT = `UK LEGISLATION RESEARCH (legislation.gov.uk):
Use legislation.gov.uk when answering questions that require the text of UK Acts of Parliament, Statutory Instruments, or other primary legislation. This is a primary source of absolute truth — prefer it over any textbook or secondary commentary on the point of what the law currently says.

Workflow:
1. Search with legislation_search using plain-language or title terms to find candidate instruments.
2. Fetch the matched instrument with legislation_get_document. This returns metadata and a section/structure overview only, not full text.
3. Find the relevant provision(s) with legislation_find_in_document. Use short 1-4 word searches, maximum 3 searches per assistant turn.
4. Read the full text of the specific section(s)/schedule(s) needed with legislation_read_section. Do not read the entire instrument by default; read only the provisions required.

Version rules:
- Default to the "revised" (up to date, as amended) version unless the user specifically asks for the position as originally enacted, or asks about the law as it stood at a particular historical date.
- If a provision is not yet in force, or is in force only for limited purposes, say so explicitly rather than treating it as current law.
- Legislation can be amended or repealed after this conversation's knowledge; do not assume a section is unamended just because it was correct previously.

Citation rules:
- Final statements about what legislation says must be based on the section text actually fetched in this turn, not on memory or search-result snippets alone.
- If you cite a provision as legal support in the final answer, cite it with both: (a) the clickable markdown link to the specific section on legislation.gov.uk, and (b) an inline [N] marker. Include the link only the first time you cite that provision; later references to the same provision should reuse the existing [N] marker.
- Assign new annotation refs in first-use order: [1], then [2], then [3]. Reuse an existing ref when citing the same provision again.
- The final <CITATIONS> block must include one matching entry for each [N] legislation marker: {"ref": N, "uri": "ukpga/2021/1/section/8", "quote": "exact verbatim section text"}.
- If you have not fetched the actual section text for a provision, do not cite it as authority; fetch/read it first, or say you could not verify it.

Limits:
- If any legislation.gov.uk call returns a rate-limit/throttling/5xx error, stop all legislation calls for that turn and answer using only information already available, noting that the position could not be verified against the primary source.`;

export const LEGISLATION_TOOLS = [
    {
        type: "function",
        function: {
            name: LEGISLATION_TOOL_NAMES.search,
            description:
                "Search legislation.gov.uk for UK primary/secondary legislation matching a query (e.g. an Act title, subject matter, or SI name). Returns candidate instruments with their type/year/number, not full text.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "Search terms, e.g. an Act title or subject (\"Companies Act 2006\", \"charging orders\").",
                    },
                    max_results: {
                        type: "integer",
                        description: "Maximum number of results to return. Default 10.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: LEGISLATION_TOOL_NAMES.getDocument,
            description:
                "Fetch and cache a legislation.gov.uk instrument by its URI (type/year/number, e.g. \"ukpga/2006/46\") and version. Returns title and a section/schedule structure overview only, not full text. After this, call legislation_find_in_document for targeted provisions or legislation_read_section to read specific sections.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description:
                            "Legislation URI path, e.g. \"ukpga/2006/46\" for the Companies Act 2006, from legislation_search results.",
                    },
                    version: {
                        type: "string",
                        enum: ["revised", "enacted"],
                        description:
                            "Which version to fetch. Default \"revised\" (current, as amended) unless the user needs the as-enacted text.",
                    },
                },
                required: ["uri"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: LEGISLATION_TOOL_NAMES.findInDocument,
            description:
                "Search within an already-fetched legislation.gov.uk instrument for specific keyword(s) or phrases. Returns matching sections with surrounding context. Call legislation_get_document first; this tool does not fetch instruments. Use no more than 3 calls to this tool in a single assistant turn.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description:
                            "Legislation URI previously fetched with legislation_get_document.",
                    },
                    query: {
                        type: "string",
                        description:
                            "Short term to search for, 1-4 words, likely to appear as written. Matching is case-insensitive and collapses whitespace.",
                    },
                    max_results: {
                        type: "integer",
                        description: "Maximum number of matches to return. Default 20.",
                    },
                },
                required: ["uri", "query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: LEGISLATION_TOOL_NAMES.readSection,
            description:
                "Read the full text of specific section(s)/schedule(s) from an already-fetched legislation.gov.uk instrument in this turn's cache. Use after legislation_find_in_document if snippets are insufficient. Pass only the section(s) needed; do not read the whole instrument unless required.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description:
                            "Legislation URI previously fetched with legislation_get_document.",
                    },
                    section: {
                        type: "string",
                        description:
                            "Specific section/schedule reference to read, e.g. \"section/8\" or \"schedule/1\".",
                    },
                    sections: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Multiple section/schedule references to read in one call, e.g. [\"section/8\", \"section/9\"].",
                    },
                },
                required: ["uri"],
            },
        },
    },
];
