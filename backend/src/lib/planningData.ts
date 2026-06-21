const PLANNING_DATA_BASE = "https://www.planning.data.gov.uk";
const POSTCODES_BASE = "https://api.postcodes.io";

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
    if (isDev) console.log(...args);
};

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson<T>(url: string): Promise<T> {
    devLog("[planning-data/api] request", { url });
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json" },
    });
    devLog("[planning-data/api] response", { url, status: response.status });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
            `Request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
    }
    return response.json() as Promise<T>;
}

const DEFAULT_DATASETS = [
    "conservation-area",
    "listed-building",
    "article-4-direction-area",
    "tree-preservation-zone",
    "flood-risk-zone",
    "green-belt",
    "brownfield-land",
    "scheduled-monument",
];

export async function geocodePostcode(postcode: string) {
    const url = `${POSTCODES_BASE}/postcodes/${encodeURIComponent(postcode.trim())}`;
    try {
        const data = await fetchJson<JsonRecord>(url);
        const result = (data.result ?? null) as JsonRecord | null;
        const latitude = asNumber(result?.latitude);
        const longitude = asNumber(result?.longitude);
        if (latitude == null || longitude == null) {
            return { error: "Could not geocode that postcode." };
        }
        return { postcode: postcode.trim(), latitude, longitude };
    } catch (err) {
        return {
            error: err instanceof Error ? err.message : "Postcode lookup failed.",
        };
    }
}

export async function searchPlanningConstraints(args: {
    postcode?: string;
    latitude?: number;
    longitude?: number;
    datasets?: string[];
}) {
    let latitude = args.latitude ?? null;
    let longitude = args.longitude ?? null;
    let resolvedPostcode: string | null = null;

    if ((latitude == null || longitude == null) && args.postcode?.trim()) {
        const geo = await geocodePostcode(args.postcode);
        if ("error" in geo) return { error: geo.error };
        latitude = geo.latitude;
        longitude = geo.longitude;
        resolvedPostcode = geo.postcode;
    }

    if (latitude == null || longitude == null) {
        return { error: "Provide a postcode, or latitude and longitude." };
    }

    const datasets = args.datasets?.length ? args.datasets : DEFAULT_DATASETS;
    const params = new URLSearchParams();
    params.set("latitude", String(latitude));
    params.set("longitude", String(longitude));
    params.set("limit", "100");
    for (const ds of datasets) params.append("dataset", ds);

    try {
        const data = await fetchJson<JsonRecord>(
            `${PLANNING_DATA_BASE}/entity.json?${params.toString()}`,
        );
        const rawEntities = Array.isArray(data.entities)
            ? data.entities
            : Array.isArray((data as { results?: unknown }).results)
              ? (data as { results: unknown[] }).results
              : Array.isArray(data)
                ? (data as unknown[])
                : [];

        const entities = rawEntities
            .filter((e): e is JsonRecord => !!e && typeof e === "object")
            .map((e) => ({
                dataset: asString(e.dataset),
                name: asString(e.name),
                reference: asString(e.reference),
                startDate: asString(e["start-date"]),
                endDate: asString(e["end-date"]),
                entity: asNumber(e.entity),
            }));

        return {
            postcode: resolvedPostcode,
            latitude,
            longitude,
            datasets_queried: datasets,
            result_count: entities.length,
            entities,
        };
    } catch (err) {
        return {
            postcode: resolvedPostcode,
            latitude,
            longitude,
            result_count: 0,
            error: err instanceof Error ? err.message : "Planning Data lookup failed.",
        };
    }
}
