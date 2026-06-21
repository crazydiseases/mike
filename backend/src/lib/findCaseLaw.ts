const FIND_CASE_LAW_BASE = "https://caselaw.nationalarchives.gov.uk";
const ALLOWED_HOST = "caselaw.nationalarchives.gov.uk";

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
    if (isDev) console.log(...args);
};

function assertAllowedUrl(url: string): void {
    const parsed = new URL(url);
    if (parsed.hostname !== ALLOWED_HOST) {
        throw new Error(`Refusing to fetch non-Find Case Law URL: ${url}`);
    }
}

function parseFindCaseLawError(status: number, detail: string): string {
    if (status === 404) return "Judgment not found at this URI.";
    if (status === 429) return "Find Case Law rate limit exceeded. Try again shortly.";
    if (status >= 500) return `Find Case Law is temporarily unavailable (${status}).`;
    const trimmed = detail.trim();
    return `Find Case Law error (${status})${trimmed ? `: ${trimmed.slice(0, 200)}` : ""}`;
}

async function findCaseLawFetchText(url: string, accept: string): Promise<string> {
    assertAllowedUrl(url);
    devLog("[find-case-law/api] request", { url });
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: accept },
    });
    devLog("[find-case-law/api] response", { url, status: response.status });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(parseFindCaseLawError(response.status, detail));
    }
    return response.text();
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

function extractTagText(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!match) return null;
    return stripTags(match[1]).trim() || null;
}

function extractAttr(xml: string, tagPattern: string, attr: string): string | null {
    const match = xml.match(new RegExp(`<${tagPattern}[^>]*\\b${attr}="([^"]*)"`, "i"));
    return match ? match[1] : null;
}

function parseLinkTags(entryXml: string): { rel?: string; type?: string; href?: string }[] {
    const links: { rel?: string; type?: string; href?: string }[] = [];
    const linkPattern = /<link\b([^>]*)\/?>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkPattern.exec(entryXml))) {
        const attrsStr = linkMatch[1];
        const attrs: Record<string, string> = {};
        const attrPattern = /([a-zA-Z:-]+)="([^"]*)"/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrPattern.exec(attrsStr))) {
            attrs[attrMatch[1]] = attrMatch[2];
        }
        links.push(attrs);
    }
    return links;
}
// --- Exported tool implementations ---

export async function searchFindCaseLaw(args: {
    query?: string;
    maxResults?: number;
}) {
    const query = args.query?.trim();
    if (!query) return { error: "query is required." };
    const maxResults = Math.max(1, Math.min(20, Math.floor(args.maxResults ?? 10)));

    try {
        const xml = await findCaseLawFetchText(
            `${FIND_CASE_LAW_BASE}/atom.xml?query=${encodeURIComponent(query)}`,
            "application/atom+xml",
        );

        const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, maxResults);

        const results = entries.map((entryMatch) => {
            const entry = entryMatch[1];
            const links = parseLinkTags(entry);
            const xmlLink = links.find((l) => l.type === "application/akn+xml");
            const htmlLink =
                links.find((l) => l.rel === "alternate" && l.type !== "application/akn+xml") ??
                links.find((l) => !l.type);
            return {
                uri: xmlLink?.href ?? null,
                title: extractTagText(entry, "title"),
                summary: extractTagText(entry, "summary"),
                published: extractTagText(entry, "published"),
                htmlUrl: htmlLink?.href ?? null,
            };
        }).filter((r) => !!r.uri);

        return { query, result_count: results.length, results };
    } catch (err) {
        devLog("[find-case-law/search] failed", {
            query,
            error: err instanceof Error ? err.message : String(err),
        });
        return {
            query,
            result_count: 0,
            error: err instanceof Error ? err.message : "Find Case Law search failed.",
        };
    }
}

export async function getFindCaseLawDocument(args: {
    uri?: string;
    title?: string | null;
    htmlUrl?: string | null;
    maxChars?: number;
}) {
    const uri = args.uri?.trim();
    if (!uri) return { error: "uri is required." };
    const maxChars = Math.max(2000, Math.min(300_000, args.maxChars ?? 200_000));

    try {
        const xml = await findCaseLawFetchText(uri, "application/xml");
        const flatText = stripTags(xml);
        const title =
            args.title?.trim() ||
            extractTagText(xml, "docTitle") ||
            extractTagText(xml, "FRBRname") ||
            null;
        const text = flatText.length > maxChars
            ? `${flatText.slice(0, maxChars - 1)}…`
            : flatText;

        return {
            uri,
            title,
            htmlUrl: args.htmlUrl ?? null,
            char_count: text.length,
            text,
        };
    } catch (err) {
        devLog("[find-case-law/get-document] failed", {
            uri,
            error: err instanceof Error ? err.message : String(err),
        });
        return {
            uri,
            char_count: 0,
            error: err instanceof Error ? err.message : "Failed to fetch judgment.",
        };
    }
}
