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
Use planning_data_search (postcode or lat/long) to check constraints: conservation area, listed building, Article 4 direction, TPO zone, flood risk, green belt, brownfield land, scheduled monument.
Limits: coverage varies by council — empty result does not mean no constraint exists, say so explicitly. Does not include live planning applications — direct users to their council's planning register for those. Beta service: treat as indicator only, not a substitute for a local land charges search.`;
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
