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

export const FIND_CASE_LAW_SYSTEM_PROMPT = `ENGLAND & WALES CASE LAW RESEARCH (Find Case Law, The National Archives):
Use Find Case Law when answering questions that require the text of an England & Wales (or UK-wide Supreme Court/Privy Council) judgment. Use it as a failsafe alongside textbook/treatise knowledge — a case may have been overruled, distinguished, or clarified since a textbook was written, so verify the current position where it matters.

Workflow:
1. Search with find_case_law_search using case name, neutral citation, or subject-matter terms.
2. Fetch the matched judgment with find_case_law_get_document. This returns the judgment's full text (flattened, tags stripped) and caches it for this turn.
3. Find the relevant passage(s) with find_case_law_find_in_document. Use short 1-4 word searches, maximum 3 searches per assistant turn.
4. If snippets are insufficient, read more of the cached judgment with find_case_law_read_document.

Citation rules:
- Final statements about what a judgment says or decided must be based on text actually fetched in this turn, not on memory alone.
- If you cite a judgment as authority in the final answer, include both: (a) a clickable markdown link to the judgment on caselaw.nationalarchives.gov.uk (the htmlUrl returned by the search/get tools), and (b) an inline [N] marker. Use standard neutral citation format in the link text where available, e.g. [Smith v Jones [2024] EWCA Civ 123](url). Include the link only the first time you cite that judgment; later references to the same judgment should reuse the existing [N] marker.
- Always note the court and date handed down when citing a case for the first time, so the reader can assess its weight (e.g. a first-instance decision carries less weight than Court of Appeal or Supreme Court authority).
- If a case appears potentially overruled, distinguished, or superseded based on what you find, say so explicitly rather than presenting it as settled law.
- If you have not fetched the actual judgment text for a case, do not cite it as fetched authority; say you are relying on general legal knowledge instead and flag that the primary source was not verified this turn.

Limits:
- If any Find Case Law call returns a rate-limit/throttling/5xx error, stop all Find Case Law calls for that turn and answer using only information already available, noting that the position could not be verified against the primary source.`;

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
