// Shared data types for data/clans.json. Used by scripts/pull-data.ts and the site.

/** A reference to another clan. `slug` is set only when the name resolved to a clan in the dataset. */
export type ClanRef = { slug?: string; name: string };

export type NotablePerson = {
  name: string;
  wikidataId: string;
  born?: number;
  died?: number;
  wikipediaUrl?: string;
};

export type ClanTartan = {
  name: string;
  /** e.g. "Modern", "Ancient", "Hunting", "Dress #2". Not set for the plain clan tartan. */
  variant?: string;
  /** Threadcount as given by the source, e.g. "B/24 K4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K4 B/4". */
  threadcount: string;
  /** Colour code → "#rrggbb", only for the codes that appear in the threadcount. */
  palette: Record<string, string>;
  /** Source folder in thetartan/tartan-database, e.g. "register-of-tartans". */
  source: string;
};

export type Clan = {
  slug: string;
  name: string;
  /** Article URL. If the clan has no article, this points at List_of_Scottish_clans. */
  wikipediaUrl: string;
  wikidataId?: string;
  motto?: string;
  mottoTranslation?: string;
  warCry?: string;
  plantBadge?: string;
  region?: string;
  district?: string;
  seat?: string;
  historicSeat?: string;
  seatCoords?: { lat: number; lon: number };
  /** Wikidata P571 as given (formatted to its precision), never guessed. */
  inception?: string;
  chief?: string;
  /** false = armigerous clan (no chief recognised by the Lord Lyon). */
  chiefed: boolean;
  /** Crest badge image on Wikimedia Commons. */
  crestImage?: { file: string; url: string };
  /** Clans whose branches/septs list this clan (reverse lookup). */
  parents: ClanRef[];
  /** Resolved branches + septs. */
  descendants: ClanRef[];
  /**
   * "Associated names". Septs are disputed and do not prove descent.
   */
  septs: ClanRef[];
  branches: ClanRef[];
  allies: ClanRef[];
  rivals: ClanRef[];
  notablePeople: NotablePerson[];
  tartans: ClanTartan[];
};

export type ClansFile = {
  generatedFrom: string[];
  licences: Record<string, string>;
  /** Field notes, e.g. that septs are "associated names" and don't prove descent. */
  notes: Record<string, string>;
  clans: Clan[];
};

/** One surname in data/names.json, with every clan that claims it (as its own name or as a sept). */
export type NameEntry = {
  /** Normalised key (lower case, Mc/M' → mac, no punctuation). */
  key: string;
  name: string;
  /** All spellings seen in the sources, plus any grouped in data/name-variants.json. */
  spellings: string[];
  clans: (ClanRef & { slug: string; as: "clan" | "sept" })[];
};

export type NamesFile = { notes: Record<string, string>; names: NameEntry[] };
