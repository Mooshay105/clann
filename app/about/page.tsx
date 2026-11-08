import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources" };

export default function About() {
  return (
    <article className="prose">
      <h1>Where this comes from</h1>
      <p>
        Clann gathers what public sources say about Scottish clans and puts it in one place. Nothing here is original
        research, and clan history is often disputed. Follow the links on each page to read the source.
      </p>

      <h2>Clans</h2>
      <p>
        The list of clans, their mottoes, seats, chiefs, branches, allies, rivals and septs come from the{" "}
        <a href="https://en.wikipedia.org/wiki/List_of_Scottish_clans">List of Scottish clans</a> and each clan&rsquo;s
        article on English Wikipedia. That text is available under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Clans without their own article
        only have what the list records.
      </p>
      <p>
        Founding dates, seat coordinates and notable people come from <a href="https://www.wikidata.org/">Wikidata</a>{" "}
        (CC0). A founding date only appears when Wikidata gives one; none are estimated.
      </p>

      <h2>Septs</h2>
      <p>
        A sept is a family or surname that is counted as part of a larger clan. Lists of septs were mostly drawn up in
        the nineteenth and twentieth centuries, they disagree with one another, and the same name is often claimed by
        several clans. Clann shows them as associated names. Being on a list does not mean descent from the clan.
      </p>

      <h2>Tartans</h2>
      <p>
        Threadcounts come from <a href="https://github.com/thetartan/tartan-database">tartan-database</a>, which
        collected them in 2017 from the Scottish Register of Tartans, the Scottish Tartans Authority, House of Tartan and
        Weddslist. That data is licensed under{" "}
        <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>, which allows sharing with credit
        but not commercial use. Colours are the sources&rsquo; own approximations, and the cloth is drawn from the
        threadcount as a 2/2 twill, the weave used for kilts.
      </p>

      <h2>Corrections</h2>
      <p>
        If something is wrong, the best fix is at the source, on Wikipedia or Wikidata, so everyone benefits. Clann
        rebuilds from the sources and also keeps a short list of hand corrections.
      </p>
    </article>
  );
}
