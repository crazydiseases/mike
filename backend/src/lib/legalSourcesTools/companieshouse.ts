const COMPANIESHOUSE_BASE = "https://api.company-information.service.gov.uk";

type JsonRecord = Record<string, unknown>;

function companieshouseHeaders(apiKey?: string | null): HeadersInit {
    const key = apiKey?.trim() || process.env.COMPANIESHOUSE_API_KEY?.trim();
    if (!key) {
        throw new Error(
            "COMPANIESHOUSE_API_KEY must be set to use Companies House tools.",
        );
    }
    const encoded = Buffer.from(`${key}:`).toString("base64");
    return {
        Accept: "application/json",
        Authorization: `Basic ${encoded}`,
    };
}

function parseCompaniesHouseError(status: number, detail: string): string {
    if (status === 404) return "Company not found on Companies House.";
    if (status === 401)
        return "Companies House authentication failed. Check the API key.";
    if (status === 429)
        return "Companies House rate limit exceeded. Try again shortly.";
    return `Companies House error (${status}): ${detail || "unknown error"}`;
}

async function companieshouseFetch<T>(
    path: string,
    apiKey?: string | null,
): Promise<T> {
    const url = `${COMPANIESHOUSE_BASE}${path}`;
    const response = await fetch(url, {
        headers: companieshouseHeaders(apiKey),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(parseCompaniesHouseError(response.status, detail));
    }
    return response.json() as Promise<T>;
}

export async function searchCompaniesHouse(args: {
    query?: string;
    limit?: number;
    apiKey?: string | null;
}) {
    const query = args.query?.trim();
    if (!query) return { error: "query is required." };
    const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 10)));
    const params = new URLSearchParams({
        q: query,
        items_per_page: String(limit),
    });
    const data = await companieshouseFetch<JsonRecord>(
        `/search/companies?${params}`,
        args.apiKey,
    );
    const items = Array.isArray(data.items) ? data.items : [];
    return {
        query,
        results: items.map((raw) => {
            const c = raw as JsonRecord;
            return {
                companyNumber: c.company_number,
                title: c.title,
                status: c.company_status,
                dateOfCreation: c.date_of_creation,
                address: c.address_snippet,
            };
        }),
    };
}

export async function getCompanyProfile(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };
    return companieshouseFetch<JsonRecord>(
        `/company/${companyNumber}`,
        args.apiKey,
    );
}

export async function getCompanyOfficers(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };
    return companieshouseFetch<JsonRecord>(
        `/company/${companyNumber}/officers`,
        args.apiKey,
    );
}

export async function getCompanyCharges(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };
    return companieshouseFetch<JsonRecord>(
        `/company/${companyNumber}/charges`,
        args.apiKey,
    );
}

export async function getFilingHistory(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };
    return companieshouseFetch<JsonRecord>(
        `/company/${companyNumber}/filing-history`,
        args.apiKey,
    );
}

export async function getOfficerAppointments(args: {
    officerId?: string;
    apiKey?: string | null;
}) {
    const officerId = args.officerId?.trim();
    if (!officerId) return { error: "officerId is required." };
    return companieshouseFetch<JsonRecord>(
        `/officers/${officerId}/appointments`,
        args.apiKey,
    );
}

export async function getPersonsWithSignificantControl(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };
    return companieshouseFetch<JsonRecord>(
        `/company/${companyNumber}/persons-with-significant-control`,
        args.apiKey,
    );
}

export async function getCompanyFullReview(args: {
    companyNumber?: string;
    apiKey?: string | null;
}) {
    const companyNumber = args.companyNumber?.trim();
    if (!companyNumber) return { error: "companyNumber is required." };

    const [profile, officersRaw, pscRaw, filingHistory] = await Promise.all([
        getCompanyProfile({ companyNumber, apiKey: args.apiKey }),
        getCompanyOfficers({ companyNumber, apiKey: args.apiKey }),
        getPersonsWithSignificantControl({ companyNumber, apiKey: args.apiKey }),
        getFilingHistory({ companyNumber, apiKey: args.apiKey }),
    ]);

    const officerItems = Array.isArray((officersRaw as JsonRecord)?.items)
        ? ((officersRaw as JsonRecord).items as JsonRecord[])
        : [];

    const enrichedOfficers = await Promise.all(
        officerItems.slice(0, 15).map(async (officer) => {
            const links = officer.links as JsonRecord | undefined;
            const officerSelfLink = links?.officer as JsonRecord | undefined;
            const appointmentsLink = officerSelfLink?.appointments as
                | string
                | undefined;
            const officerId = appointmentsLink
                ?.split("/officers/")[1]
                ?.split("/appointments")[0];
            let otherAppointments: JsonRecord | { error: string } | null = null;
            if (officerId) {
                try {
                    otherAppointments = await getOfficerAppointments({
                        officerId,
                        apiKey: args.apiKey,
                    });
                } catch (err) {
                    otherAppointments = {
                        error: err instanceof Error ? err.message : "fetch failed",
                    };
                }
            }
            return {
                name: officer.name,
                role: officer.officer_role,
                appointedOn: officer.appointed_on,
                resignedOn: officer.resigned_on ?? null,
                nationality: officer.nationality,
                dateOfBirth: officer.date_of_birth,
                address: officer.address,
                otherAppointmentsCount:
                    (otherAppointments as JsonRecord)?.total_results ?? null,
                otherCompanies: Array.isArray(
                    (otherAppointments as JsonRecord)?.items,
                )
                    ? (
                          (otherAppointments as JsonRecord).items as JsonRecord[]
                      ).map((a) => ({
                          companyName: (a.appointed_to as JsonRecord)
                              ?.company_name,
                          companyNumber: (a.appointed_to as JsonRecord)
                              ?.company_number,
                          companyStatus: (a.appointed_to as JsonRecord)
                              ?.company_status,
                          appointedOn: a.appointed_on,
                          resignedOn: a.resigned_on ?? null,
                      }))
                    : [],
            };
        }),
    );

    return {
        companyNumber,
        profile,
        officers: enrichedOfficers,
        personsWithSignificantControl: pscRaw,
        filingHistory,
    };
}
