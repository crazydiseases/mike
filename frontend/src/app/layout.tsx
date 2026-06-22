import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
    variable: "--font-eb-garamond",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://mike.cornishlaw.co.uk"),
    title: "Mike - AI Legal Assistant",
    description:
        "AI-powered legal research and document analysis for Stutt Associates.",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Mike",
    },
    icons: {
        icon: [
            { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
            { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
        ],
        apple: [
            { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
            { url: "/icons/icon-167x167.png", sizes: "167x167", type: "image/png" },
            { url: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
        ],
    },
    openGraph: {
        type: "website",
        url: "https://mike.cornishlaw.co.uk",
        siteName: "Mike",
        title: "Mike - AI Legal Assistant",
        description:
            "AI-powered legal research and document analysis for Stutt Associates.",
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: "Mike",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Mike - AI Legal Assistant",
        description:
            "AI-powered legal research and document analysis for Stutt Associates.",
        images: ["/link-image.jpg"],
    },
};
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${ebGaramond.variable} font-sans antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
