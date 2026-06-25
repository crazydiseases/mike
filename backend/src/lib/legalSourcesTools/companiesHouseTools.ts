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
Use Companies House for questions about a UK company's officers, ownership, status, or filing history.
1. If you only have a name, call companies_house_search first to get the company number.
2. Call companies_house_get_company for the full review: profile, officers (with other directorships), persons with significant control, and filing history.
Flag: unusual officer movement, filing gaps or overdue accounts, dissolved/administration status, cross-directorships with problematic companies, mismatches between officers and PSC list.
Limits: never state a full date of birth (only month/year disclosed); never state financial figures (only filing history available); present findings as analysis for the user's judgement, not legal conclusions.`;
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
