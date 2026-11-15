/*
 * Which stores Dupe Dupe sends friends to (Maggie, Nov 15).
 * - Only APPROVED stores show: established retailers and real brands' own sites.
 *   Anything else is hidden with the reason "Store not approved", and
 *   `scripts/unknown-stores.ts` lists those so Maggie can approve good ones.
 * - BLOCKED stores never show, even if added to APPROVED by mistake: ultra-cheap
 *   fast fashion and marketplaces known for poor quality or scams.
 * - Amazon shows only items rated 4 stars or more with at least 100 reviews.
 *
 * Each entry is "domain | other names it goes by". A store matches by its web
 * address (Lens and Amazon give one) or by its name (Google Shopping gives only
 * the name, like "Macy's" or "Azazie.com").
 */

const APPROVED_ENTRIES = [
  // Department stores and big retailers
  "nordstrom.com | Nordstrom", "nordstromrack.com | Nordstrom Rack", "macys.com | Macy's", "bloomingdales.com | Bloomingdale's",
  "saksfifthavenue.com | Saks Fifth Avenue | Saks", "saksoff5th.com | Saks Off 5th | Saks OFF 5TH", "neimanmarcus.com | Neiman Marcus",
  "bergdorfgoodman.com | Bergdorf Goodman", "dillards.com | Dillard's", "belk.com | Belk", "vonmaur.com | Von Maur", "kohls.com | Kohl's",
  "jcpenney.com | JCPenney | JC Penney", "target.com | Target", "amazon.com | Amazon", "lordandtaylor.com | Lord & Taylor",
  "johnlewis.com | John Lewis", "marksandspencer.com | Marks & Spencer | M&S", "selfridges.com | Selfridges", "harrods.com | Harrods",
  "libertylondon.com | Liberty London",
  // Multi-brand fashion sites
  "revolve.com | REVOLVE", "fwrd.com | FWRD", "shopbop.com | Shopbop", "net-a-porter.com | NET-A-PORTER", "mytheresa.com | Mytheresa",
  "farfetch.com | FARFETCH", "ssense.com | SSENSE", "modaoperandi.com | Moda Operandi", "matchesfashion.com | MATCHES",
  "asos.com | ASOS", "lyst.com | Lyst", "editorialist.com | Editorialist", "anthropologie.com | Anthropologie", "freepeople.com | Free People",
  "urbanoutfitters.com | Urban Outfitters", "bhldn.com | BHLDN", "tuckernuck.com | Tuckernuck", "intermixonline.com | Intermix",
  "shopredone.com | RE/DONE", "theoutnet.com | THE OUTNET", "zappos.com | Zappos", "dsw.com | DSW",
  // Mall and high-street brands
  "zara.com | ZARA", "mango.com | MANGO", "hm.com | H&M", "cos.com | COS | cosstores.com", "stories.com | & Other Stories",
  "arket.com | ARKET", "uniqlo.com | UNIQLO", "massimodutti.com | Massimo Dutti", "jcrew.com | J.Crew", "madewell.com | Madewell",
  "gap.com | Gap", "oldnavy.com | Old Navy", "bananarepublic.com | Banana Republic", "athleta.com | Athleta",
  "abercrombie.com | Abercrombie & Fitch | Abercrombie", "hollisterco.com | Hollister", "ae.com | American Eagle | Aerie",
  "anntaylor.com | Ann Taylor", "loft.com | LOFT", "whbm.com | White House Black Market", "chicos.com | Chico's", "talbots.com | Talbots",
  "express.com | Express", "jcrewfactory.com | J.Crew Factory", "everlane.com | Everlane", "aritzia.com | Aritzia", "reiss.com | Reiss",
  "karenmillen.com | Karen Millen", "whistles.com | Whistles", "tedbaker.com | Ted Baker", "clubmonaco.com | Club Monaco",
  "bodenusa.com | Boden | boden.com", "toa.st | TOAST", "quince.com | Quince", "levi.com | Levi's", "lulus.com | Lulus",
  "windsorstore.com | Windsor", "eloquii.com | ELOQUII", "torrid.com | Torrid", "lanebryant.com | Lane Bryant", "11honore.com | 11 Honoré",
  "universalstandard.com | Universal Standard", "spanx.com | Spanx", "skims.com | SKIMS", "goodamerican.com | Good American",
  "princesspolly.com | Princess Polly", "hellomolly.com | Hello Molly", "showpo.com | Showpo", "ohpolly.com | Oh Polly",
  "meshki.us | Meshki", "houseofcb.com | House of CB", "superdown.com | superdown", "lovers-friends.com | Lovers and Friends",
  // Designer and contemporary brands' own sites
  "reformation.com | Reformation | thereformation.com", "sezane.com | Sézane | Sezane", "rouje.com | Rouje", "realisationpar.com | Réalisation Par",
  "faithfullthebrand.com | Faithfull the Brand", "staud.clothing | STAUD", "ganni.com | GANNI", "ullajohnson.com | Ulla Johnson",
  "cultgaia.com | Cult Gaia", "zimmermann.com | Zimmermann", "self-portrait.com | Self-Portrait", "rixo.co.uk | Rixo",
  "theory.com | Theory", "vince.com | Vince", "eileenfisher.com | Eileen Fisher", "cuyana.com | Cuyana", "jennikayne.com | Jenni Kayne",
  "naadam.co | Naadam", "doen.com | Dôen | shopdoen.com", "loveshackfancy.com | LoveShackFancy", "hillhousehome.com | Hill House Home",
  "mirrorpalais.com | Mirror Palais", "selkiecollection.com | Selkie", "farmrio.com | FARM Rio", "huntertbell.com | Hunter Bell | hunterbellnyc.com",
  "neverfullydressed.com | Never Fully Dressed", "aliceandolivia.com | Alice + Olivia | alice and olivia", "dvf.com | Diane von Furstenberg | DVF",
  "toryburch.com | Tory Burch", "katespade.com | Kate Spade", "coach.com | Coach", "michaelkors.com | Michael Kors", "ralphlauren.com | Ralph Lauren",
  "tommy.com | Tommy Hilfiger", "calvinklein.us | Calvin Klein", "rag-bone.com | rag & bone", "agolde.com | AGOLDE", "motherdenim.com | MOTHER",
  "frame-store.com | FRAME", "citizensofhumanity.com | Citizens of Humanity", "paige.com | PAIGE", "dl1961.com | DL1961", "milly.com | MILLY",
  "likelynyc.com | Likely", "amandauprichard.com | Amanda Uprichard", "saylornyc.com | Saylor", "parkerny.com | Parker",
  "sachinandbabi.com | Sachin & Babi", "hutchdesign.com | Hutch", "rhoderesort.com | Rhode", "dressthepopulation.com | Dress the Population",
  "bronxandbanco.com | Bronx and Banco", "elliatt.com | Elliatt", "nadinemerabi.com | Nadine Merabi", "bardot.com | Bardot",
  "shonajoy.com | Shona Joy", "becandbridge.com | Bec + Bridge", "sirthelabel.com | SIR the label", "alemais.com | Alémais",
  "aje.com.au | Aje", "camilla.com | CAMILLA", "ratandboa.com | Rat & Boa", "rebeccavallance.com | Rebecca Vallance", "sau-lee.com | Sau Lee",
  "moniquelhuillier.com | Monique Lhuillier", "marchesa.com | Marchesa", "badgleymischka.com | Badgley Mischka",
  "jennyyoo.com | Jenny Yoo", "adriannapapell.com | Adrianna Papell", "aidanmattox.com | Aidan Mattox", "terijon.com | Teri Jon",
  "macduggal.com | Mac Duggal", "sherrihill.com | Sherri Hill", "jovani.com | Jovani", "azazie.com | Azazie", "birdygrey.com | Birdy Grey",
  "davidsbridal.com | David's Bridal", "promgirl.com | PromGirl", "couturecandy.com | Couture Candy", "amarra.com | Amarra",
  "petalandpup.com | Petal & Pup | Petal & Pup USA", "bohme.com | Böhme | Bohme", "marsthelabel.com | Mars The Label | Mars The Label USA",
  "safiyaa.com | SAFIYAA",
  // From Maggie's test set (Nov 15): stores of dupes she picked as good
  "clubllondon.us | Club L London | clubllondon.com", "selfieleslie.com | Selfie Leslie", "rosier.com | Rosier",
  "dessy.com | Dessy | Dessy Group", "dollskill.com | Dolls Kill", "shopakira.com | Akira | AKIRA",
  "femme.la | Femme LA | FEMME LA", "allegra-k.com | Allegra K", "babyboofashion.com | Babyboo | Babyboo Fashion",
  "terrycosta.com | Terry Costa", "nookie.com.au | Nookie", "jdjune.com | JD June", "lilysilk.com | LilySilk | LILYSILK", "luckyvintageseattle.com | Lucky Vintage", "ounass.com | Ounass", "cultmia.com | CULT MIA", "katiemay.com | Katie May", "vicicollection.com | VICI",
  // Shoes and bags
  "stevemadden.com | Steve Madden", "samedelman.com | Sam Edelman", "vincecamuto.com | Vince Camuto", "stuartweitzman.com | Stuart Weitzman",
  "sarahflint.com | Sarah Flint", "margauxny.com | Margaux", "rothys.com | Rothy's", "loefflerrandall.com | Loeffler Randall",
  "staudclothing.com | Staud", "polene-paris.com | Polène", "mansurgavriel.com | Mansur Gavriel", "cuyana.com | Cuyana",
  // Secondhand (shown from phase 5)
  "poshmark.com | Poshmark", "depop.com | Depop", "ebay.com | eBay", "therealreal.com | The RealReal",
  "vestiairecollective.com | Vestiaire Collective", "thredup.com | thredUP", "mercari.com | Mercari", "fashionphile.com | Fashionphile", "rebag.com | Rebag",
];

const BLOCKED_ENTRIES = [
  "shein.com | SHEIN", "temu.com | Temu", "aliexpress.com | AliExpress", "alibaba.com | Alibaba", "wish.com | Wish", "dhgate.com | DHgate",
  "romwe.com | ROMWE", "zaful.com | ZAFUL", "fashionnova.com | Fashion Nova", "boohoo.com | boohoo", "boohooman.com | boohooMAN",
  "prettylittlething.com | PrettyLittleThing | PLT", "nastygal.com | Nasty Gal", "missguided.com | Missguided", "emmiol.com | Emmiol",
  "rosegal.com | Rosegal", "dresslily.com | DressLily", "newchic.com | Newchic", "banggood.com | Banggood", "lightinthebox.com | LightInTheBox",
  "miniinthebox.com | MiniInTheBox", "emmacloth.com | Emmacloth", "cider.com | shopcider.com | Cider", "jjshouse.com | JJsHouse",
  "patpat.com | PatPat", "halara.com | Halara", "cupshe.com | Cupshe", "bloomchic.com | BloomChic", "sammydress.com | SammyDress",
  "yoins.com | YOINS", "berrylook.com | Berrylook", "noracora.com | Noracora", "chicwish.com | Chicwish",
];

type Entry = { domains: string[]; names: string[] };

function parse(entries: string[]): Entry[] {
  return entries.map((e) => {
    const parts = e.split("|").map((p) => p.trim()).filter(Boolean);
    const domains = parts.filter((p) => /^[a-z0-9.-]+\.[a-z.]+$/i.test(p.replace(/\s+/g, ""))).map((p) => p.replace(/\s+/g, "").toLowerCase());
    const names = parts.map(nameKey).filter(Boolean);
    for (const d of domains) names.push(nameKey(d.split(".")[0]));
    return { domains, names: [...new Set(names)] };
  });
}

const APPROVED = parse(APPROVED_ENTRIES);
const BLOCKED = parse(BLOCKED_ENTRIES);

/** "Azazie.com" → "azazie", "Macy's" → "macys", "SAU LEE" → "saulee". */
export function nameKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\.(com|us|co|net|shop|store|clothing)(\.[a-z]{2})?$/, "")
    .replace(/&/g, "and")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(official|officialstore|officialsite|usa|us)$/, "");
}

function matches(list: Entry[], store: string, domain: string) {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const key = nameKey(store);
  return list.some(
    (e) =>
      (host && e.domains.some((d) => host === d || host.endsWith(`.${d}`))) ||
      (key && e.names.includes(key)),
  );
}

export type StoreVerdict = "approved" | "blocked" | "unknown";

export function vetStore(store: string, domain: string): StoreVerdict {
  if (matches(BLOCKED, store, domain)) return "blocked";
  if (matches(APPROVED, store, domain)) return "approved";
  return "unknown";
}

/** Amazon items need a track record: 4 stars or more from at least 100 reviews. */
export const AMAZON_MIN_RATING = 4;
export const AMAZON_MIN_REVIEWS = 100;
