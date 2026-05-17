import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const offers = [
  {
    name: "Website Redesign and Conversion Improvement",
    targetAudience: "Businesses with outdated websites, weak conversion paths, or poor mobile experiences.",
    painPoints: ["Low trust", "Weak conversion", "Slow website", "Poor mobile UX"],
    valueProposition: "Virtuprose rebuilds the website into a clearer, faster, more credible sales asset.",
    proofPoints: ["Use only verified Virtuprose case studies or portfolio links when available."],
    servicesIncluded: ["UX audit", "Website redesign", "Frontend implementation", "Performance cleanup"],
    ctaStyle: "Offer a short website review or ask if they want specific improvement ideas.",
    disallowedClaims: ["Guaranteed revenue", "Fake before/after numbers", "Unverified client names"],
    aiVoiceRules: "Direct, useful, low-pressure, and specific to the prospect's website."
  },
  {
    name: "Shopify and Ecommerce Revamp",
    targetAudience:
      "Shopify or ecommerce stores that need a cleaner storefront, better product pages, or maintenance.",
    painPoints: [
      "Poor product discovery",
      "Low checkout confidence",
      "Weak storefront design",
      "Maintenance backlog"
    ],
    valueProposition:
      "Virtuprose improves ecommerce storefront quality, trust, product presentation, and ongoing reliability.",
    proofPoints: ["Mention Shopify experience only when the offer fit is clear."],
    servicesIncluded: ["Storefront redesign", "Theme customization", "Speed cleanup", "Maintenance"],
    ctaStyle: "Offer a concise store review focused on conversion and trust issues.",
    disallowedClaims: ["Guaranteed sales lift", "Platform certifications unless verified"],
    aiVoiceRules: "Commercial, practical, and focused on store performance without sounding pushy."
  },
  {
    name: "SaaS and MVP Product Build",
    targetAudience:
      "Founders and operators who need to launch or improve a SaaS, dashboard, or internal tool.",
    painPoints: [
      "Unclear MVP scope",
      "Slow development",
      "Poor product UX",
      "Unreliable handoff from freelancers"
    ],
    valueProposition:
      "Virtuprose helps define, design, and build practical software products from MVP to production.",
    proofPoints: ["Use only approved product work examples."],
    servicesIncluded: ["Product planning", "Backend architecture", "Frontend build", "Deployment"],
    ctaStyle: "Ask if they are planning a product build or need help turning an idea into an MVP.",
    disallowedClaims: ["Guaranteed funding", "Guaranteed launch timeline without discovery"],
    aiVoiceRules: "Strategic, technical, and grounded in execution."
  },
  {
    name: "Website Maintenance and Support",
    targetAudience:
      "Companies with existing websites that need fixes, updates, reliability, or ongoing technical support.",
    painPoints: [
      "Broken pages",
      "Slow updates",
      "No reliable technical owner",
      "Security and performance concerns"
    ],
    valueProposition:
      "Virtuprose acts as a reliable technical partner for ongoing website improvements and support.",
    proofPoints: ["Mention maintenance only as a practical service, not a vague retainer promise."],
    servicesIncluded: ["Bug fixes", "Content updates", "Performance checks", "Ongoing improvements"],
    ctaStyle: "Ask if they have current website issues or maintenance backlog.",
    disallowedClaims: ["24/7 support unless explicitly offered", "Unverified security guarantees"],
    aiVoiceRules: "Helpful, operational, and calm."
  },
  {
    name: "Automation and AI Workflow Setup",
    targetAudience:
      "Businesses doing repetitive manual work across sales, operations, reporting, or customer communication.",
    painPoints: ["Manual workflows", "Slow follow-up", "Scattered data", "Repeated admin work"],
    valueProposition:
      "Virtuprose designs and builds practical automations and AI-assisted workflows to reduce manual work.",
    proofPoints: ["Use examples only when approved in the claim library."],
    servicesIncluded: ["Workflow mapping", "Automation setup", "AI-assisted tools", "Internal dashboards"],
    ctaStyle: "Ask about one repetitive process they would like to reduce.",
    disallowedClaims: ["Fully replacing staff", "Unverified AI accuracy claims"],
    aiVoiceRules: "Specific, useful, and careful about AI limitations."
  }
];

async function main() {
  await prisma.user.upsert({
    where: { email: "owner@virtuprose.com" },
    update: {},
    create: {
      email: "owner@virtuprose.com",
      name: "Virtuprose Owner"
    }
  });

  for (const offer of offers) {
    await prisma.offer.upsert({
      where: { name: offer.name },
      update: offer,
      create: offer
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
