export type FindCaseLawToolEvent =
    | {
          type: "find_case_law_search";
          query: string;
          result_count: number;
          error?: string;
      }
    | {
          type: "find_case_law_get_document";
          uri: string;
          title?: string | null;
          char_count: number;
          error?: string;
      }
    | {
          type: "find_case_law_find_in_document";
          uri: string | null;
          query: string;
          total_matches: number;
          title?: string | null;
          error?: string;
      }
    | {
          type: "find_case_law_read_document";
          uri: string | null;
          title?: string | null;
          char_count: number;
          error?: string;
      };

export const FIND_CASE_LAW_TOOL_NAMES = {
    search: "find_case_law_search",
    getDocument: "find_case_law_get_document",
    findInDocument: "find_case_law_find_in_document",
    readDocument: "find_case_law_read_document",
} as const;

export const FIND_CASE_LAW_SYSTEM_PROMPT = `ENGLAND & WALES CASE LAW (Find Case Law, The National Archives):
Use Find Case Law for questions requiring judgment text. Use as a failsafe — cases may have been overruled or clarified since any textbook was written.
Workflow: find_case_law_search → find_case_law_get_document → find_case_law_find_in_document (max 3 searches per turn) → find_case_law_read_document if needed.
Citations: base statements on fetched text only, not memory. Cite with a markdown link in neutral citation format plus an [N] marker. Note court and date on first citation. Flag if a case appears overruled or distinguished.
On 5xx/rate-limit errors: stop all Find Case Law calls and answer from available information only.`;
export const FIND_CASE_LAW_TOOLS = [
    {
        type: "function",
        function: {
            name: FIND_CASE_LAW_TOOL_NAMES.search,
            description:
                "Search Find Case Law (The National Archives) for England & Wales / UK-wide judgments matching a query (case name, neutral citation, or subject matter). Returns candidate judgments with metadata and links, not full text.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "Search terms, e.g. a case name, neutral citation, or subject (\"Caparo v Dickman\", \"duty of care economic loss\").",
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
            name: FIND_CASE_LAW_TOOL_NAMES.getDocument,
            description:
                "Fetch and cache the full text of a judgment by the document URI returned from find_case_law_search. Returns the flattened judgment text and metadata. After this, call find_case_law_find_in_document for targeted passages or find_case_law_read_document to read more broadly.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description:
                            "The judgment's XML document URI, exactly as returned by find_case_law_search.",
                    },
                    title: {
                        type: "string",
                        description:
                            "The case title/name as returned by find_case_law_search, passed through so it can be cached alongside the text.",
                    },
                    html_url: {
                        type: "string",
                        description:
                            "The human-readable page URL for this judgment, as returned by find_case_law_search, used for citation links.",
                    },
                },
                required: ["uri"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: FIND_CASE_LAW_TOOL_NAMES.findInDocument,
            description:
                "Search within an already-fetched judgment for specific keyword(s) or phrases. Returns matches with surrounding context. Call find_case_law_get_document first; this tool does not fetch judgments. Use no more than 3 calls to this tool in a single assistant turn.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description: "Document URI previously fetched with find_case_law_get_document.",
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
            name: FIND_CASE_LAW_TOOL_NAMES.readDocument,
            description:
                "Read the cached text of an already-fetched judgment, starting at an optional character offset. Use after find_case_law_find_in_document if snippets are insufficient. Returns a chunk of text, not necessarily the whole judgment for long documents.",
            parameters: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description: "Document URI previously fetched with find_case_law_get_document.",
                    },
                    offset: {
                        type: "integer",
                        description: "Character offset to start reading from. Default 0.",
                    },
                    max_chars: {
                        type: "integer",
                        description: "Maximum characters to return. Default 8000.",
                    },
                },
                required: ["uri"],
            },
        },
    },
];
