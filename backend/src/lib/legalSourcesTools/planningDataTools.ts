export type PlanningDataToolEvent = {
    type: "planning_data_search";
    postcode: string | null;
    latitude: number | null;
    longitude: number | null;
    result_count: number;
    error?: string;
};

export const PLANNING_DATA_TOOL_NAMES = {
    search: "planning_data_search",
} as const;

export const PLANNING_DATA_SYSTEM_PROMPT = `ENGLAND PLANNING CONSTRAINTS (planning.data.gov.uk):
Use this when answering questions about planning constraints affecting a specific property or site in England — e.g. whether it is in a conservation area, is a listed building, falls within an Article 4 direction, a Tree Preservation Order zone, a flood risk zone, green belt, or other designations. This is sourced from the official MHCLG Planning Data platform.

Workflow:
- Call planning_data_search with either a postcode, or a latitude/longitude pair.
- By default it checks the most common constraint types (conservation area, listed building, Article 4 direction, tree preservation zone, flood risk zone, green belt, brownfield land, scheduled monument). Pass specific dataset names if the user asks about something else.

Important limitations:
- Coverage varies by local authority — an empty result for a dataset does NOT necessarily mean no constraint exists, only that this platform has no data for it. Say this explicitly when reporting an empty/clear result.
- This does NOT include live/individual planning application status or history — for a specific application, direct the user to the relevant council's own planning register.
- This is a beta government service; treat results as a useful indicator requiring verification, not a substitute for an official local land charges search or formal planning history check.`;

export const PLANNING_DATA_TOOLS = [
    {
        type: "function",
        function: {
            name: PLANNING_DATA_TOOL_NAMES.search,
            description:
                "Look up planning constraints (conservation area, listed building, Article 4 direction, tree preservation zone, flood risk zone, green belt, brownfield land, scheduled monument, etc.) affecting a property or site in England, via the official Planning Data platform. Provide either a postcode, or a latitude/longitude pair.",
            parameters: {
                type: "object",
                properties: {
                    postcode: {
                        type: "string",
                        description: "UK postcode of the property/site, e.g. \"TR1 2AB\".",
                    },
                    latitude: {
                        type: "number",
                        description: "Latitude, if not using postcode.",
                    },
                    longitude: {
                        type: "number",
                        description: "Longitude, if not using postcode.",
                    },
                    datasets: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Optional list of specific dataset names to check (e.g. [\"world-heritage-site\"]). Defaults to a sensible standard set of common constraints if omitted.",
                    },
                },
            },
        },
    },
];
