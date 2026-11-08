import type { Metadata } from "next";
import { Alegreya, Alegreya_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const serif = Alegreya({ variable: "--font-serif", subsets: ["latin", "latin-ext"], style: ["normal", "italic"] });
const sans = Alegreya_Sans({ variable: "--font-sans", subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: { default: "Clann: an encyclopedia of Scottish clans", template: "%s | Clann" },
  description: "Find your Scottish clan by name or surname: mottoes, seats, chiefs, septs and woven tartans.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <header className="site-head">
          <Link href="/" className="wordmark">
            Clann
          </Link>
          <nav aria-label="Site">
            <Link href="/#index">All clans</Link>
            <Link href="/about">Sources</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-foot">
          <p>
            Clan facts from <a href="https://en.wikipedia.org/wiki/List_of_Scottish_clans">Wikipedia</a> (CC BY-SA 4.0)
            and <a href="https://www.wikidata.org/">Wikidata</a>. Tartan threadcounts from{" "}
            <a href="https://github.com/thetartan/tartan-database">tartan-database</a> (CC BY-NC-ND 4.0).{" "}
            <Link href="/about">About the sources</Link>.
          </p>
        </footer>
      </body>
    </html>
  );
}
