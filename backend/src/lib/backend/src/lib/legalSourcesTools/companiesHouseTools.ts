export type CompaniesHouseToolEvent =
    | {
          type: "companies_house_search";
          query: string;
          result_count: number;
          error?: string;
      }
    | {
          type: "companies_house_get_company";
          company_number: string;
          company_name: string | null;
          officer_count: number;
          psc_count: number;
          filing_count: number;
          error?: string;
      };

export const COMPANIES_HOUSE_TOOL_NAMES = {
    search: "companies_house_search",
    getCompany: "companies_house_get_company",
} as const;

export const COMPANIES_HOUSE_SYSTEM_PROMPT = `UK COMPANY RESEARCH (Companies House):
Use Companies House when answering questions about a UK company's officers, ownership, status, or filing history.

Workflow:
1. If you only have a company name, call companies_house_search to find the company number.
2. Call companies_house_get_company with the company number to fetch a full structured review: company profile, officers (each with their other directorships), persons with significant control, and filing history.

When presenting results, give both the factual data and a plain-language risk narrative covering:
- Unusual officer movement: multiple resignations/appointments in a short period, especially clustered close together.
- Filing health: gaps, overdue filings, or a dissolved/liquidation/administration status.
- Cross-directorships: officers who hold appointments across an unusually large number of companies, or whose other companies show problematic statuses.
- Any apparent mismatch between the officers list and the persons-with-significant-control list.

Hard limits, do not violate:
- Companies House only ever discloses an officer's month and year of birth, never the full date. Do not imply you have or could obtain a full date of birth.
- The API does not provide structured financial figures (turnover, balance sheet values, etc.) — only the filing history of accounts documents. Never state or estimate specific financial figures; you may only note when accounts were filed and of what type.
- Present the risk narrative as analysis and pattern-flagging for the user's own judgement, not as a definitive legal or financial conclusion.`;

export const COMPANIES_HOUSE_TOOLS = [
    {
        type: "function",
        function: {
            name: COMPANIES_HOUSE_TOOL_NAMES.search,
            description:
                "Search Companies House for a UK company by name. Returns company numbers, status, and incorporation dates. Use this first when you only have a company name.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Company name or partial name to search for.",
                    },
                    limit: {
                        type: "integer",
                        description: "Maximum number of results. Default 10.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: COMPANIES_HOUSE_TOOL_NAMES.getCompany,
            description:
                "Fetch a full Companies House review for a UK company by its company number: profile, officers (with their other directorships), persons with significant control, and filing history. Use this after companies_house_search, or directly if the company number is already known.",
            parameters: {
                type: "object",
                properties: {
                    companyNumber: {
                        type: "string",
                        description: "Companies House company number, e.g. '12345678'.",
                    },
                },
                required: ["companyNumber"],
            },
        },
    },
];
