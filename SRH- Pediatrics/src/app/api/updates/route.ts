import { NextResponse } from "next/server";
import { db } from "@/db";
import { recentUpdates } from "@/db/schema";
import { desc, eq, gte, inArray } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Feed = {
  name: string;
  url: string;
  tags: string;
};

/**
 * Curated public paediatric feeds. All are open (no auth needed) and are
 * requested server-side so the browser is not blocked by CORS. If any feed is
 * unreachable we simply skip it and use whatever else succeeded.
 */
const FEEDS: Feed[] = [
  // ---- Society / news ----
  { name: "AAP News", url: "https://publications.aap.org/rss/site_1000018/1000006.xml", tags: "AAP,USA,news" },
  { name: "WHO — Child health news", url: "https://www.who.int/rss-feeds/news-english.xml", tags: "WHO,global" },
  { name: "Medscape Pediatrics", url: "https://www.medscape.com/cx/rssfeeds/2778.xml", tags: "Medscape,news" },
  { name: "CDC Newsroom", url: "https://tools.cdc.gov/api/v2/resources/media/403372.rss", tags: "CDC,public health" },

  // ---- High-impact journals ----
  { name: "Pediatrics (AAP journal)", url: "https://publications.aap.org/rss/site_1000029/1000005.xml", tags: "AAP,journal" },
  { name: "Pediatrics — Ahead of print", url: "https://publications.aap.org/rss/site_1000029/1000019.xml", tags: "AAP,journal" },
  { name: "Hospital Pediatrics (AAP)", url: "https://publications.aap.org/rss/site_1000006/1000004.xml", tags: "AAP,inpatient" },
  { name: "Pediatrics in Review (AAP)", url: "https://publications.aap.org/rss/site_1000024/1000015.xml", tags: "AAP,education" },
  { name: "NeoReviews (AAP)", url: "https://publications.aap.org/rss/site_1000020/1000012.xml", tags: "AAP,neonatology" },
  { name: "The Lancet Child & Adolescent Health", url: "https://www.thelancet.com/rssfeed/lanchi_current.xml", tags: "Lancet,journal" },
  { name: "BMJ Archives of Disease in Childhood", url: "https://adc.bmj.com/rss/current.xml", tags: "BMJ,journal" },
  { name: "ADC Fetal & Neonatal Edition", url: "https://fn.bmj.com/rss/current.xml", tags: "BMJ,neonatology" },
  { name: "ADC Education & Practice", url: "https://ep.bmj.com/rss/current.xml", tags: "BMJ,education" },
  { name: "BMJ Paediatrics Open (OA)", url: "https://bmjpaedsopen.bmj.com/rss/current.xml", tags: "BMJ,open access" },

  // ---- Open-access journals ----
  { name: "BMC Pediatrics (OA)", url: "https://bmcpediatr.biomedcentral.com/articles/most-recent/rss.xml", tags: "BMC,open access" },
  { name: "Italian Journal of Pediatrics (OA)", url: "https://ijponline.biomedcentral.com/articles/most-recent/rss.xml", tags: "BMC,open access" },
  { name: "Maternal Health, Neonatology & Perinatology (OA)", url: "https://mhnpjournal.biomedcentral.com/articles/most-recent/rss.xml", tags: "BMC,neonatology" },
  { name: "Frontiers in Pediatrics (OA)", url: "https://www.frontiersin.org/journals/pediatrics/rss", tags: "Frontiers,open access" },
  { name: "Children — MDPI (OA)", url: "https://www.mdpi.com/rss/journal/children", tags: "MDPI,open access" },
  { name: "Pediatric Reports — MDPI (OA)", url: "https://www.mdpi.com/rss/journal/pediatric", tags: "MDPI,open access" },
  { name: "Global Pediatric Health (SAGE OA)", url: "https://journals.sagepub.com/action/showFeed?ui=0&mi=ehikzz&ai=2b4&jc=gphb&type=etoc&feed=rss", tags: "SAGE,open access" },
  { name: "PLOS Medicine", url: "https://journals.plos.org/plosmedicine/feed/atom", tags: "PLOS,open access" },
  { name: "Pediatric Research (Nature)", url: "https://www.nature.com/pr.rss", tags: "Nature,research" },

  // ---- Springer (abstracts open) ----
  { name: "European Journal of Pediatrics", url: "https://link.springer.com/search.rss?facet-journal-id=431", tags: "Springer,Europe" },
  { name: "Indian Journal of Pediatrics", url: "https://link.springer.com/search.rss?facet-journal-id=12098", tags: "Springer,India,IAP" },
  { name: "World Journal of Pediatrics", url: "https://link.springer.com/search.rss?facet-journal-id=12519", tags: "Springer,global" },
  { name: "Pediatric Nephrology", url: "https://link.springer.com/search.rss?facet-journal-id=467", tags: "Springer,nephrology" },
  { name: "Pediatric Cardiology", url: "https://link.springer.com/search.rss?facet-journal-id=246", tags: "Springer,cardiology" },

  // ---- Specialty & Wiley / Oxford ----
  { name: "Acta Paediatrica", url: "https://onlinelibrary.wiley.com/feed/16512227/most-recent", tags: "Wiley,journal" },
  { name: "Journal of Paediatrics & Child Health", url: "https://onlinelibrary.wiley.com/feed/14401754/most-recent", tags: "Wiley,journal" },
  { name: "Developmental Medicine & Child Neurology", url: "https://onlinelibrary.wiley.com/feed/14698749/most-recent", tags: "Wiley,neurology" },
  { name: "Pediatric Pulmonology", url: "https://onlinelibrary.wiley.com/feed/10990496/most-recent", tags: "Wiley,pulmonology" },
  { name: "Pediatric Allergy & Immunology", url: "https://onlinelibrary.wiley.com/feed/13993038/most-recent", tags: "Wiley,allergy" },
  { name: "Paediatrics & Child Health (Oxford)", url: "https://academic.oup.com/rss/site_5348/3193.xml", tags: "Oxford,Canada" },

  // ---- PubMed core-journal live feeds (very reliable) ----
  { name: "J Pediatrics (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/2985183R/?limit=15&name=J%20Pediatr&utm_campaign=journals", tags: "PubMed,journal" },
  { name: "JAMA Pediatrics (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/101589544/?limit=15&name=JAMA%20Pediatr&utm_campaign=journals", tags: "PubMed,JAMA" },
  { name: "Pediatric Critical Care Med (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/100954653/?limit=15&name=Pediatr%20Crit%20Care%20Med&utm_campaign=journals", tags: "PubMed,PICU" },
  { name: "Neonatology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/101286577/?limit=15&name=Neonatology&utm_campaign=journals", tags: "PubMed,neonatology" },
  { name: "Indian Pediatrics (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/0064355/?limit=15", tags: "PubMed,India,IAP" },

  // ---- PubMed backups for feeds often blocked server-side ----
  { name: "Pediatrics — AAP (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/0376422/?limit=15", tags: "PubMed,AAP" },
  { name: "Arch Dis Child (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/0372434/?limit=15", tags: "PubMed,BMJ" },
  { name: "Arch Dis Child Fetal Neonatal (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/9501297/?limit=15", tags: "PubMed,neonatology" },
  { name: "BMC Pediatrics (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/100967804/?limit=15", tags: "PubMed,open access" },
  { name: "Eur J Pediatrics (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/7603873/?limit=15", tags: "PubMed,Europe" },
  { name: "J Perinatology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8501884/?limit=15", tags: "PubMed,neonatology" },
  { name: "Pediatric Infectious Disease J (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8701858/?limit=15", tags: "PubMed,infection" },
  { name: "Pediatric Cardiology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8003849/?limit=15", tags: "PubMed,cardiology" },
  { name: "Pediatric Nephrology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8708728/?limit=15", tags: "PubMed,nephrology" },
  { name: "Pediatric Pulmonology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8510590/?limit=15", tags: "PubMed,pulmonology" },
  { name: "Arch Pediatr Adolesc Med / peds (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/9422751/?limit=15", tags: "PubMed,journal" },
  { name: "J Pediatric Surgery (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/0052631/?limit=15", tags: "PubMed,surgery" },
  { name: "Pediatric Neurology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/8508183/?limit=15", tags: "PubMed,neurology" },
  { name: "Seminars in Perinatology (PubMed)", url: "https://pubmed.ncbi.nlm.nih.gov/rss/journals/7801132/?limit=15", tags: "PubMed,neonatology" },
];

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

type Parsed = { title: string; url: string; summary: string; publishedAt: Date | null };

function parseRss(xml: string): Parsed[] {
  const out: Parsed[] = [];
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const raw of items) {
    const title = decode(stripTags((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim())).slice(0, 240);
    const link =
      raw.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      (raw.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
    const desc =
      raw.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ??
      raw.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
      raw.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ??
      "";
    const pub =
      raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      raw.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ??
      raw.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
      "";
    const d = pub ? new Date(pub.trim()) : null;
    if (title && link) {
      out.push({
        title,
        url: link.trim(),
        summary: decode(stripTags(desc)).slice(0, 320),
        publishedAt: d && !Number.isNaN(d.getTime()) ? d : null,
      });
    }
  }
  return out;
}

async function fetchFeed(f: Feed, signal: AbortSignal): Promise<Parsed[]> {
  try {
    const r = await fetch(f.url, {
      signal,
      cache: "no-store",
      headers: { "User-Agent": "SRH-Pediatrics-Handover/1.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml).slice(0, 5).map((p) => ({ ...p })) as unknown as Parsed[];
  } catch {
    return [];
  }
}

async function refreshFromWeb(): Promise<number> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const per = await Promise.all(
      FEEDS.map(async (f) => {
        const items = await fetchFeed(f, ac.signal);
        return items.map((it) => ({ ...it, source: f.name, tags: f.tags }));
      }),
    );
    const flat = per.flat();
    if (flat.length === 0) return 0;

    const existingUrls = new Set(
      (
        await db
          .select({ url: recentUpdates.url })
          .from(recentUpdates)
          .where(inArray(recentUpdates.url, flat.map((f) => f.url)))
      ).map((r) => r.url),
    );
    const toInsert = flat.filter((f) => !existingUrls.has(f.url));
    if (toInsert.length) {
      await db
        .insert(recentUpdates)
        .values(
          toInsert.map((f) => ({
            title: f.title,
            source: f.source,
            url: f.url,
            summary: f.summary,
            tags: f.tags,
            publishedAt: f.publishedAt,
          })),
        );
    }
    // Trim to newest 400 rows overall (large multi-journal feed set)
    const all = await db
      .select({ id: recentUpdates.id, fetchedAt: recentUpdates.fetchedAt })
      .from(recentUpdates)
      .orderBy(desc(recentUpdates.fetchedAt));
    if (all.length > 400) {
      const keep = new Set(all.slice(0, 400).map((r) => r.id));
      const remove = all.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (remove.length) await db.delete(recentUpdates).where(inArray(recentUpdates.id, remove));
    }
    return toInsert.length;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  let refreshedCount = 0;
  try {
    // Auto-refresh when the newest row is older than 4 hours, or when ?refresh=1
    if (refresh) {
      refreshedCount = await refreshFromWeb();
    } else {
      const [newest] = await db
        .select({ fetchedAt: recentUpdates.fetchedAt })
        .from(recentUpdates)
        .orderBy(desc(recentUpdates.fetchedAt))
        .limit(1);
      const stale = !newest || Date.now() - new Date(newest.fetchedAt).getTime() > 4 * 60 * 60 * 1000;
      if (stale) refreshedCount = await refreshFromWeb();
    }
  } catch {
    /* keep serving cached data if the internet is unreachable */
  }
  const rows = await db.select().from(recentUpdates).orderBy(desc(recentUpdates.publishedAt), desc(recentUpdates.fetchedAt)).limit(150);
  return NextResponse.json({ rows, refreshedCount, sources: FEEDS.map((f) => f.name) });
}

export async function POST(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const b = await req.json();
  const [row] = await db
    .insert(recentUpdates)
    .values({
      title: String(b.title ?? "Update"),
      source: String(b.source ?? "manual"),
      url: String(b.url ?? ""),
      summary: String(b.summary ?? ""),
      tags: String(b.tags ?? "manual"),
      publishedAt: b.publishedAt ? new Date(String(b.publishedAt)) : new Date(),
      pinnedBy: editor,
    })
    .returning();
  return NextResponse.json({ row });
}

export async function DELETE(req: Request) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(recentUpdates).where(eq(recentUpdates.id, id));
  return NextResponse.json({ ok: true });
}
