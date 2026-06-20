const LEGISLATION_BASE = "https://www.legislation.gov.uk";

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
    if (isDev) console.log(...args);
};

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function truncate(value: string | null, maxChars: number): string | null {
    if (!value) return null;
    if (value.length <= maxChars) return value;
    return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function parseLegislationError(status: number, detail: string): string {
    const trimmed = detail.trim();
    if (status === 404) return "Legislation document not found at this URI.";
    if (status >= 500)
        return `legislation.gov.uk is temporarily unavailable (${status}).`;
    return `legislation.gov.uk error (${status})${trimmed ? `: ${trimmed.slice(0, 200)}` : ""}`;
}

async function legislationFetchText(
    pathOrUrl: string,
    accept: string,
): Promise<string> {
    const url = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${LEGISLATION_BASE}/${pathOrUrl.replace(/^\/+/, "")}`;
    devLog("[legislation/api] request", { url });
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: accept },
    });
    devLog("[legislation/api] response", { url, status: response.status });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(parseLegislationError(response.status, detail));
    }
    return response.text();
}

// --- Minimal XML helpers (no external dependency, mirrors style of this codebase) ---

function extractTagText(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!match) return null;
    return stripTags(match[1]).trim() || null;
}

function stripTags(value: string): string {
    return value
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

type LegislationSection = {
    id: string;
    label: string;
    title: string | null;
    text: string;
};

function extractSections(xml: string): LegislationSection[] {
    // CLML wraps each section/schedule provision in a P1group (or P2group for
    // sub-divisions) carrying id="section-N" or id="schedule-N".
    const sections: LegislationSection[] = [];
    const groupPattern = /<P\dgroup\b[^>]*id="((?:section|schedule)-[^"]+)"[^>]*>([\s\S]*?)<\/P\dgroup>/gi;
    let match: RegExpExecArray | null;

    while ((match = groupPattern.exec(xml))) {
        const id = match[1];
        const body = match[2];
        const title = extractTagText(body, "Title");
        const number =
            extractTagText(body, "Number") ?? extractTagText(body, "Pnumber");
        sections.push({
            id,
            label: number ?? id,
            title,
            text: stripTags(body),
        });
    }
    return sections;
}

// --- Exported tool implementations ---

export async function searchLegislation(args: {
    query?: string;
    maxResults?: number;
}) {
    const query = args.query?.trim();
    if (!query) return { error: "query is required." };
    const maxResults = Math.max(1, Math.min(20, Math.floor(args.maxResults ?? 10)));

    try {
        const xml = await legislationFetchText(
            `search/data.feed?text=${encodeURIComponent(query)}`,
            "application/atom+xml",
        );

        const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(
            0,
            maxResults,
        );

        const results = entries.map((entryMatch) => {
            const entry = entryMatch[1];
            const hrefMatch = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)
                ?? entry.match(/<link[^>]*href="([^"]+)"/i);
            const href = hrefMatch?.[1] ?? "";
            const uri = href
                .replace(`${LEGISLATION_BASE}/`, "")
                .replace(/\/$/, "")
                .replace(/\?.*$/, "");
            return {
                uri,
                title: extractTagText(entry, "title"),
                summary: extractTagText(entry, "summary"),
                url: href || null,
            };
        });

        return { query, result_count: results.length, results };
    } catch (err) {
        devLog("[legislation/search] failed", {
            query,
            error: err instanceof Error ? err.message : String(err),
        });
        return {
            query,
            result_count: 0,
            error: err instanceof Error ? err.message : "Legislation search failed.",
        };
    }
}

export async function getLegislationDocument(args: {
    uri?: string;
    version?: "revised" | "enacted";
    maxChars?: number;
}) {
    const uri = args.uri?.trim().replace(/^\/+|\/+$/g, "");
    if (!uri) return { error: "uri is required." };
    const version = args.version === "enacted" ? "enacted" : "revised";
    const maxChars = Math.max(2000, Math.min(200_000, args.maxChars ?? 100_000));

    const path =
        version === "enacted" ? `${uri}/enacted/data.xml` : `${uri}/data.xml`;

    try {
        const xml = await legislationFetchText(path, "application/xml");
        const title =
            extractTagText(xml, "dc:title") ?? extractTagText(xml, "Title");
        const sections = extractSections(xml).map((section) => ({
            ...section,
            text: truncate(section.text, maxChars) ?? "",
        }));

        return {
            uri,
            version,
            title,
            section_count: sections.length,
            sections,
            url: `${LEGISLATION_BASE}/${uri}${version === "enacted" ? "/enacted" : ""}`,
        };
    } catch (err) {
        devLog("[legislation/get-document] failed", {
            uri,
            version,
            error: err instanceof Error ? err.message : String(err),
        });
        return {
            uri,
            version,
            section_count: 0,
            sections: [],
            error:
                err instanceof Error ? err.message : "Failed to fetch legislation document.",
        };
    }
}
