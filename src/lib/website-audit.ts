import {
  CampaignObjective,
  WebsiteAuditCandidateStatus,
  WebsiteAuditRunStatus,
  type Offer
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { websiteAuditQueue } from "@/lib/queue";

export const DEFAULT_WEBSITE_AUDIT_SOURCE = "Website audit list";
export const DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS =
  "Public business contact listed on company website; relevant B2B service outreach.";
export const WEBSITE_AUDIT_USER_AGENT = "VirtuproseWebsiteAuditBot/1.0 (+https://virtuprose.com)";
export const WEBSITE_AUDIT_MAX_URLS = 100;
export const WEBSITE_AUDIT_MAX_PAGES = 5;

export type WebsiteAuditInputRow = {
  website: string;
  company?: string;
  email?: string;
  country?: string;
  source?: string;
};

export type WebsiteAuditPersonalization = {
  website: string;
  audit_pain_point: string;
  audit_evidence: string;
  recommended_improvement: string;
  mobile_app_signal: string;
  service_name: string;
  audit_email_subject: string;
  audit_email_body: string;
};

type AuditPage = {
  url: string;
  title: string;
  text: string;
  html: string;
};

const aiAuditSchema = z.object({
  companyName: z.string().optional().default(""),
  publicEmail: z.string().optional().default(""),
  painPoints: z.array(z.string()).default([]),
  missingFeatures: z.array(z.string()).default([]),
  recommendedService: z.string().optional().default("Website improvement"),
  mobileAppOpportunityScore: z.number().int().min(0).max(100).default(0),
  mobileAppSignals: z.array(z.string()).default([]),
  emailSubject: z.string().optional().default("Quick website idea"),
  emailBody: z.string().optional().default(""),
  confidence: z.number().int().min(0).max(100).default(50),
  riskFlags: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([])
});

export function normalizeWebsiteUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeWebsiteDomain(value: unknown) {
  const normalized = normalizeWebsiteUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

export function parseWebsiteRows(text: string): WebsiteAuditInputRow[] {
  const rows: WebsiteAuditInputRow[] = [];

  for (const line of text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    const parts = splitLooseCsvLine(line);
    const first = parts[0] ?? "";
    if (/^website$/i.test(first) || /^url$/i.test(first)) continue;
    rows.push({
      website: first,
      company: parts[1] || undefined,
      email: parts[2] || undefined,
      country: parts[3] || undefined,
      source: parts[4] || undefined
    });
  }

  return rows;
}

export function dedupeWebsiteRows(rows: WebsiteAuditInputRow[], maxRows = WEBSITE_AUDIT_MAX_URLS) {
  const seen = new Set<string>();
  const output: Array<WebsiteAuditInputRow & { websiteUrl: string; normalizedDomain: string }> = [];

  for (const row of rows) {
    const websiteUrl = normalizeWebsiteUrl(row.website);
    const normalizedDomain = normalizeWebsiteDomain(websiteUrl);
    if (!websiteUrl || !normalizedDomain || seen.has(normalizedDomain)) continue;
    seen.add(normalizedDomain);
    output.push({ ...row, websiteUrl, normalizedDomain });
    if (output.length >= maxRows) break;
  }

  return output;
}

export async function queueWebsiteAuditRun(runId: string) {
  const queue = websiteAuditQueue();
  const candidates = await prisma.websiteAuditCandidate.findMany({
    where: { runId, status: WebsiteAuditCandidateStatus.PENDING },
    select: { id: true }
  });

  await prisma.websiteAuditRun.update({
    where: { id: runId },
    data: { status: candidates.length ? WebsiteAuditRunStatus.QUEUED : WebsiteAuditRunStatus.FAILED }
  });

  for (const candidate of candidates) {
    await queue.add("website-audit.check", { candidateId: candidate.id });
  }

  await queue.close();
}

export async function processWebsiteAuditCandidate(candidateId: string) {
  const candidate = await prisma.websiteAuditCandidate.findUnique({
    where: { id: candidateId },
    include: { run: { include: { selectedOffer: true } }, suggestedOffer: true }
  });

  if (!candidate) return { ok: true, skipped: true, reason: "missing_candidate" };
  const processableStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.PENDING,
    WebsiteAuditCandidateStatus.FAILED
  ];
  if (!processableStatuses.includes(candidate.status)) {
    return { ok: true, skipped: true, reason: "not_pending" };
  }

  await prisma.websiteAuditRun.update({
    where: { id: candidate.runId },
    data: { status: WebsiteAuditRunStatus.RUNNING }
  });
  await prisma.websiteAuditCandidate.update({
    where: { id: candidate.id },
    data: { status: WebsiteAuditCandidateStatus.CHECKING, error: null }
  });

  try {
    const pages = await collectAuditPages(candidate.websiteUrl, candidate.run.maxPagesPerSite);
    const analysis = await analyzeWebsiteForOffer({
      pages,
      websiteUrl: candidate.websiteUrl,
      fallbackCompany: candidate.companyName,
      fallbackEmail: candidate.email,
      offer: candidate.run.selectedOffer
    });

    const status = analysis.publicEmail
      ? WebsiteAuditCandidateStatus.AUDITED
      : WebsiteAuditCandidateStatus.NEEDS_REVIEW;

    await prisma.websiteAuditCandidate.update({
      where: { id: candidate.id },
      data: {
        status,
        companyName: analysis.companyName || candidate.companyName,
        email: analysis.publicEmail || candidate.email,
        confidence: analysis.confidence,
        suggestedOfferId: candidate.run.selectedOfferId ?? candidate.suggestedOfferId,
        recommendedServiceName: analysis.recommendedService,
        mobileAppScore: analysis.mobileAppOpportunityScore,
        mobileAppSignals: analysis.mobileAppSignals.slice(0, 8),
        painPoints: analysis.painPoints.slice(0, 8),
        missingFeatures: analysis.missingFeatures.slice(0, 8),
        evidence: {
          items: analysis.evidence.slice(0, 12),
          checkedPages: pages.map((page) => page.url)
        },
        generatedSubject: ensureSafeSubject(analysis.emailSubject),
        generatedBody: ensureSafeBody(analysis.emailBody),
        riskFlags: analysis.riskFlags,
        error: analysis.publicEmail ? null : "No public email found. Add an email before sending.",
        checkedAt: new Date()
      }
    });

    await refreshWebsiteAuditRunCounts(candidate.runId);
    return { ok: true, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website could not be checked safely.";
    await prisma.websiteAuditCandidate.update({
      where: { id: candidate.id },
      data: {
        status: WebsiteAuditCandidateStatus.NEEDS_REVIEW,
        error: message,
        checkedAt: new Date()
      }
    });
    await refreshWebsiteAuditRunCounts(candidate.runId);
    return { ok: false, needsReview: true, error: message };
  }
}

export async function refreshWebsiteAuditRunCounts(runId: string) {
  const candidates = await prisma.websiteAuditCandidate.findMany({
    where: { runId },
    select: { status: true }
  });
  const total = candidates.length;
  const auditedStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.AUDITED,
    WebsiteAuditCandidateStatus.APPROVED,
    WebsiteAuditCandidateStatus.CONVERTED
  ];
  const audited = candidates.filter((item) => auditedStatuses.includes(item.status)).length;
  const approvedStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.APPROVED,
    WebsiteAuditCandidateStatus.CONVERTED
  ];
  const approved = candidates.filter((item) =>
    approvedStatuses.includes(item.status)
  ).length;
  const rejected = candidates.filter((item) => item.status === WebsiteAuditCandidateStatus.REJECTED).length;
  const failedStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.FAILED,
    WebsiteAuditCandidateStatus.NEEDS_REVIEW
  ];
  const failed = candidates.filter((item) =>
    failedStatuses.includes(item.status)
  ).length;
  const runningStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.PENDING,
    WebsiteAuditCandidateStatus.CHECKING
  ];
  const stillRunning = candidates.some((item) =>
    runningStatuses.includes(item.status)
  );
  const status = stillRunning
    ? WebsiteAuditRunStatus.RUNNING
    : total
      ? WebsiteAuditRunStatus.REVIEW_READY
      : WebsiteAuditRunStatus.FAILED;

  return prisma.websiteAuditRun.update({
    where: { id: runId },
    data: {
      status,
      totalCandidates: total,
      auditedCount: audited,
      approvedCount: approved,
      rejectedCount: rejected,
      failedCount: failed
    }
  });
}

export function websiteAuditPersonalization({
  candidate,
  offer
}: {
  candidate: {
    websiteUrl: string;
    painPoints: string[];
    missingFeatures: string[];
    evidence: unknown;
    mobileAppScore: number;
    mobileAppSignals: string[];
    recommendedServiceName: string | null;
    generatedSubject: string | null;
    generatedBody: string | null;
  };
  offer: Pick<Offer, "name">;
}): WebsiteAuditPersonalization {
  const evidence = extractEvidenceSummary(candidate.evidence);
  const mobileSignal =
    candidate.mobileAppScore >= 70
      ? candidate.mobileAppSignals[0] || "The site shows repeat customer workflows that may fit a mobile app."
      : candidate.mobileAppSignals[0] || "A mobile app does not look like the first recommendation from this check.";

  return {
    website: candidate.websiteUrl,
    audit_pain_point: candidate.painPoints[0] || "a possible website improvement opportunity",
    audit_evidence: evidence || "I reviewed the public website pages.",
    recommended_improvement:
      candidate.recommendedServiceName || candidate.missingFeatures[0] || "improving the website experience",
    mobile_app_signal: mobileSignal,
    service_name: offer.name,
    audit_email_subject: candidate.generatedSubject || "Quick website idea",
    audit_email_body:
      candidate.generatedBody ||
      [
        "Hi {{first_name}},",
        "",
        `I reviewed {{website}} and noticed {{audit_pain_point}}.`,
        "If useful, I can send 2-3 practical improvement ideas for {{company}}."
      ].join("\n")
  };
}

export function campaignStepForWebsiteAudit() {
  return {
    objective: CampaignObjective.AUDIT_OFFER,
    subject: "{{audit_email_subject}}",
    body: [
      "{{audit_email_body}}",
      "",
      "Best,",
      "{{sender_name}}",
      "",
      "Unsubscribe: {{unsubscribe_url}}"
    ].join("\n"),
    followUp: {
      delayDays: 3,
      subject: "Re: quick idea for {{company}}",
      body: [
        "Hi {{first_name}},",
        "",
        "Just checking if improving {{recommended_improvement}} is useful for {{company}}.",
        "If it is not relevant, no problem.",
        "",
        "Best,",
        "{{sender_name}}",
        "",
        "Unsubscribe: {{unsubscribe_url}}"
      ].join("\n")
    }
  };
}

async function collectAuditPages(websiteUrl: string, maxPages: number): Promise<AuditPage[]> {
  const homepage = normalizeWebsiteUrl(websiteUrl);
  if (!homepage) throw new Error("Website URL is not valid.");

  const robots = await fetchRobots(homepage);
  const firstPage = await fetchAuditPage(homepage, robots);
  const urls = selectRelevantInternalLinks(firstPage.html, homepage, Math.max(1, maxPages) - 1);
  const pages = [firstPage];

  for (const url of urls) {
    try {
      pages.push(await fetchAuditPage(url, robots));
    } catch {
      // A secondary page failure should not block the whole website check.
    }
    if (pages.length >= Math.max(1, maxPages)) break;
  }

  return pages;
}

async function fetchAuditPage(url: string, robots: RobotsRules) {
  if (isDisallowedByRobots(url, robots)) {
    throw new Error("This website blocks this public page from automated checks.");
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": WEBSITE_AUDIT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if ([401, 403, 429].includes(response.status)) {
    throw new Error("The website blocked this public check. Review it manually.");
  }
  if (!response.ok) {
    throw new Error(`Website returned ${response.status}. Review it manually.`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("Website did not return a public HTML page.");
  }

  const html = await response.text();
  return {
    url,
    title: extractTitle(html),
    text: cleanVisibleText(html).slice(0, 12_000),
    html: html.slice(0, 600_000)
  };
}

async function analyzeWebsiteForOffer({
  pages,
  websiteUrl,
  fallbackCompany,
  fallbackEmail,
  offer
}: {
  pages: AuditPage[];
  websiteUrl: string;
  fallbackCompany?: string | null;
  fallbackEmail?: string | null;
  offer?: Offer | null;
}) {
  const fallback = analyzeWebsiteLocally({ pages, websiteUrl, fallbackCompany, fallbackEmail, offer });
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CAMPAIGN_MODEL || "gpt-4.1-mini";

  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              "You audit public business websites for conservative B2B outreach.",
              "Use only evidence from the provided website text.",
              "Do not insult the business, invent facts, claim guaranteed outcomes, or imply you accessed private data.",
              "Recommend mobile app development only when repeat-use operational signals are strong.",
              "Return only structured JSON."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              websiteUrl,
              fallback,
              selectedOffer: offer
                ? {
                    name: offer.name,
                    targetAudience: offer.targetAudience,
                    valueProposition: offer.valueProposition,
                    servicesIncluded: offer.servicesIncluded,
                    disallowedClaims: offer.disallowedClaims
                  }
                : null,
              pages: pages.map((page) => ({
                url: page.url,
                title: page.title,
                text: page.text.slice(0, 5000)
              }))
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "website_audit_result",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "companyName",
                "publicEmail",
                "painPoints",
                "missingFeatures",
                "recommendedService",
                "mobileAppOpportunityScore",
                "mobileAppSignals",
                "emailSubject",
                "emailBody",
                "confidence",
                "riskFlags",
                "evidence"
              ],
              properties: {
                companyName: { type: "string" },
                publicEmail: { type: "string" },
                painPoints: { type: "array", items: { type: "string" } },
                missingFeatures: { type: "array", items: { type: "string" } },
                recommendedService: { type: "string" },
                mobileAppOpportunityScore: { type: "integer", minimum: 0, maximum: 100 },
                mobileAppSignals: { type: "array", items: { type: "string" } },
                emailSubject: { type: "string" },
                emailBody: { type: "string" },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
                riskFlags: { type: "array", items: { type: "string" } },
                evidence: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI audit failed with ${response.status}`);
    const parsed = aiAuditSchema.parse(JSON.parse(extractOutputText(await response.json())));
    return {
      ...parsed,
      publicEmail: normalizeEmailValue(parsed.publicEmail) || fallback.publicEmail,
      companyName: parsed.companyName || fallback.companyName,
      emailSubject: parsed.emailSubject || fallback.emailSubject,
      emailBody: parsed.emailBody || fallback.emailBody
    };
  } catch {
    return fallback;
  }
}

export function analyzeWebsiteLocally({
  pages,
  websiteUrl,
  fallbackCompany,
  fallbackEmail,
  offer
}: {
  pages: AuditPage[];
  websiteUrl: string;
  fallbackCompany?: string | null;
  fallbackEmail?: string | null;
  offer?: Pick<Offer, "name" | "valueProposition"> | null;
}) {
  const combinedText = pages.map((page) => page.text).join("\n").toLowerCase();
  const combinedHtml = pages.map((page) => page.html).join("\n");
  const emails = extractEmails(`${combinedText}\n${combinedHtml}`);
  const companyName = fallbackCompany || pages.map((page) => page.title).find(Boolean) || domainToCompany(websiteUrl);
  const publicEmail = normalizeEmailValue(fallbackEmail) || emails[0] || "";
  const hasBooking = /book now|booking|appointment|reservation|calendly|schedule/i.test(combinedText);
  const hasWhatsapp = /wa\.me|whatsapp|api\.whatsapp/i.test(combinedHtml);
  const hasStore = /cart|checkout|shopify|woocommerce|add to cart|online order|delivery/i.test(combinedText);
  const hasForms = /<form[\s>]/i.test(combinedHtml);
  const hasMobileAppLinks = /app store|google play|android app|ios app/i.test(combinedText);
  const hasAccounts = /login|account|member|portal|loyalty|track order|order status/i.test(combinedText);
  const serviceText = /service|treatment|clinic|restaurant|salon|appointment|consultation/i.test(combinedText);

  const painPoints: string[] = [];
  const missingFeatures: string[] = [];
  const evidence: string[] = [];
  const mobileSignals: string[] = [];

  if (serviceText && !hasBooking) {
    painPoints.push("Customers may not have a simple online booking path.");
    missingFeatures.push("Online booking");
    evidence.push("The public pages look service-based, but no clear booking flow was found.");
  }
  if (!hasWhatsapp) {
    painPoints.push("Visitors may not have a fast WhatsApp contact option.");
    missingFeatures.push("WhatsApp call-to-action");
  }
  if (!hasForms) {
    painPoints.push("The website may not be capturing enquiries through a clear form.");
    missingFeatures.push("Lead enquiry form");
  }
  if (hasStore) {
    evidence.push("The site shows shopping, checkout, ordering, or delivery language.");
    mobileSignals.push("Online ordering or ecommerce workflow is visible.");
  }
  if (hasAccounts) {
    evidence.push("The site references account, member, loyalty, portal, or tracking flows.");
    mobileSignals.push("Repeat customer account or tracking workflow is visible.");
  }
  if (hasBooking) {
    evidence.push("The site has booking or appointment language.");
    mobileSignals.push("Appointment or booking workflow is visible.");
  }
  if (hasMobileAppLinks) {
    evidence.push("The site references an existing mobile app.");
    mobileSignals.push("Existing mobile app links are visible.");
  }

  const mobileScore = Math.min(
    100,
    (hasStore ? 35 : 0) +
      (hasAccounts ? 30 : 0) +
      (hasBooking ? 20 : 0) +
      (hasMobileAppLinks ? 20 : 0) +
      (serviceText ? 10 : 0)
  );
  const recommendedService =
    mobileScore >= 70
      ? "Mobile app development"
      : hasStore
        ? "Ecommerce improvement"
        : serviceText
          ? "Booking and website improvement"
          : offer?.name || "Website improvement";
  const primaryPain = painPoints[0] || "There may be room to make the website clearer and easier to convert.";
  const improvement = missingFeatures[0] || recommendedService;

  return {
    companyName,
    publicEmail,
    painPoints: painPoints.length ? painPoints : [primaryPain],
    missingFeatures: missingFeatures.length ? missingFeatures : ["Website conversion improvements"],
    recommendedService,
    mobileAppOpportunityScore: mobileScore,
    mobileAppSignals: mobileSignals,
    emailSubject: `Quick idea for ${companyName}`,
    emailBody: [
      "Hi {{first_name}},",
      "",
      `I reviewed {{website}} and noticed ${primaryPain.toLowerCase()}`,
      `One practical improvement could be ${improvement.toLowerCase()}.`,
      "",
      "If useful, I can send 2-3 specific ideas for {{company}}."
    ].join("\n"),
    confidence: publicEmail ? 72 : 54,
    riskFlags: publicEmail ? [] : ["No public email found."],
    evidence: evidence.length ? evidence : ["Reviewed public website pages."]
  };
}

function splitLooseCsvLine(line: string) {
  const output: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      output.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  output.push(current.trim());
  return output;
}

function extractEmails(value: string) {
  const matches = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  return Array.from(new Set(matches.map(normalizeEmailValue).filter(Boolean))).filter(
    (email) => !/(example\.com|domain\.com|yourcompany|sentry|wixpress)/i.test(email)
  );
}

function normalizeEmailValue(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function extractTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  return cleanVisibleText(title || h1).slice(0, 120);
}

function cleanVisibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function selectRelevantInternalLinks(html: string, baseUrl: string, limit: number) {
  const base = new URL(baseUrl);
  const links = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi))
    .map((match) => {
      try {
        const url = new URL(match[1], base);
        url.hash = "";
        url.search = "";
        return url;
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => Boolean(url && url.hostname === base.hostname && /^https?:$/.test(url.protocol)));
  const scored = links.map((url) => ({
    url: url.toString(),
    score: linkScore(url.pathname)
  }));

  return Array.from(new Map(scored.filter((item) => item.score > 0).map((item) => [item.url, item])).values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.url);
}

function linkScore(pathname: string) {
  const path = pathname.toLowerCase();
  if (/contact|about|service|booking|book|appointment|reservation|shop|store|menu|pricing/.test(path)) {
    return 10;
  }
  if (/portfolio|case|work|locations|branches/.test(path)) return 6;
  return 0;
}

type RobotsRules = {
  origin: string;
  disallow: string[];
};

async function fetchRobots(websiteUrl: string): Promise<RobotsRules> {
  const origin = new URL(websiteUrl).origin;
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, {
      headers: { "User-Agent": WEBSITE_AUDIT_USER_AGENT }
    });
    if (!response.ok) return { origin, disallow: [] };
    return { origin, disallow: parseRobotsDisallow(await response.text()) };
  } catch {
    return { origin, disallow: [] };
  }
}

function parseRobotsDisallow(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim());
  const disallow: string[] = [];
  let applies = false;

  for (const line of lines) {
    const [keyRaw, valueRaw = ""] = line.split(":");
    const key = keyRaw?.trim().toLowerCase();
    const value = valueRaw.trim();
    if (key === "user-agent") {
      const agent = value.toLowerCase();
      applies = agent === "*" || agent.includes("virtuprosewebsiteauditbot");
    } else if (applies && key === "disallow" && value) {
      disallow.push(value);
    } else if (!line) {
      applies = false;
    }
  }

  return disallow;
}

function isDisallowedByRobots(url: string, robots: RobotsRules) {
  const parsed = new URL(url);
  if (parsed.origin !== robots.origin) return true;
  return robots.disallow.some((rule) => rule === "/" || parsed.pathname.startsWith(rule));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function ensureSafeSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Quick website idea";
}

function ensureSafeBody(value: string) {
  return value
    .replace(/unsubscribe:\s*\{\{unsubscribe_url\}\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}

function extractEvidenceSummary(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "";
  const items = (evidence as { items?: unknown }).items;
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => String(item))
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function domainToCompany(websiteUrl: string) {
  const domain = normalizeWebsiteDomain(websiteUrl);
  return domain
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractOutputText(data: unknown) {
  if (typeof data === "object" && data && "output_text" in data && typeof data.output_text === "string") {
    return data.output_text;
  }

  const response = data as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && typeof content.text === "string")?.text;

  if (!outputText) throw new Error("AI response did not include output text.");
  return outputText;
}
