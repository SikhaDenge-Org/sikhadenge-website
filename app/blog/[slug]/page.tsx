import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  GeneratedPageLayout,
  type GeneratedFaq,
  type GeneratedHighlight,
  type GeneratedStep,
  type GeneratedTool,
} from "../../../components/blog/BlogArticleLayout";
import {
  getBlogBySlug,
  getBlogCandidatesForSlug,
  getBlogs,
  type BlogItem as BaseBlogItem,
} from "@/lib/blogs";
import {
  getBlogRedirectTarget,
} from "@/lib/blog-redirects";

const BASE_URL = "https://sikhadenge.in";
const RELEASE_DATE_ISO = "2026-07-24";
const RELEASE_DATE_LABEL = "July 24, 2026";

type BlogItem = BaseBlogItem & {
  publishedAt?: string;
  updatedAt?: string;
  datePublished?: string;
  dateModified?: string;
};

function getTypedBlogs(): BlogItem[] {
  return getBlogs() as BlogItem[];
}

function getTypedBlogBySlug(slug: string): BlogItem | undefined {
  return getBlogBySlug(slug) as BlogItem | undefined;
}

function getTypedBlogCandidatesForSlug(slug: string): BlogItem[] {
  return getBlogCandidatesForSlug(slug) as BlogItem[];
}

function getYearCanonicalSlug(slug: string) {
  if (/-in-\d{4}$/.test(slug)) return null;

  const canonicalSlug = `${slug}-in-2026`;

  return getTypedBlogBySlug(canonicalSlug)
    ? canonicalSlug
    : null;
}

type ParsedSlug = {
  year: string;
  audienceLabel: string;
  skillLabel: string;
  intentLabel: string;
};

const audienceMap: Record<string, string> = {
  students: "students",
  student: "students",
  beginners: "beginners",
  beginner: "beginners",
  freelancers: "freelancers",
  freelancer: "freelancers",
  professionals: "working professionals",
  professional: "working professionals",
  marketers: "marketers",
  developers: "developers",
  teachers: "teachers",
  business: "business owners",
  businesses: "business owners",
  founders: "founders",
  creators: "creators",
  youtubers: "creators",
  agencies: "agencies",
  designers: "designers",
  jobs: "job seekers",
};

const skillMap: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Google Gemini",
  claude: "Claude",
  prompt: "prompt engineering",
  prompts: "prompt engineering",
  seo: "SEO",
  ai: "AI skills",
  automation: "business automation",
  marketing: "AI marketing",
  content: "AI content creation",
  writing: "AI content creation",
  coding: "AI coding",
  code: "AI coding",
  graphic: "AI graphic design",
  design: "AI graphic design",
  generative: "generative AI",
};

const intentMap: Record<string, string> = {
  benefits: "benefits",
  examples: "examples",
  trends: "trends",
  workflow: "workflow",
  automation: "workflow",
  guide: "guide",
  complete: "guide",
  skills: "skills",
  career: "career",
  earn: "earning",
  money: "earning",
  tools: "tools",
};

function parseSlug(slug: string, post: BlogItem): ParsedSlug {
  const segments = slug.toLowerCase().split("-").filter(Boolean);
  const year = segments.find((segment) => /^20\d{2}$/.test(segment)) || "2026";
  const audienceKey = segments.find((segment) => audienceMap[segment]);
  const skillKey = segments.find((segment) => skillMap[segment]);
  const intentKey = segments.find((segment) => intentMap[segment]);

  return {
    year,
    audienceLabel: audienceKey ? audienceMap[audienceKey] : "learners and professionals",
    skillLabel: skillKey ? skillMap[skillKey] : post.category || "AI and digital skills",
    intentLabel: intentKey ? intentMap[intentKey] : "guide",
  };
}

function buildDescription(post: BlogItem, parsed: ParsedSlug) {
  return (
    post.excerpt ||
    `A practical ${parsed.intentLabel} to ${parsed.skillLabel} for ${parsed.audienceLabel}, with clear answers, a step-by-step workflow, common mistakes, tools, and next actions.`
  );
}

function buildAnswer(post: BlogItem, parsed: ParsedSlug) {
  return (
    post.intro ||
    `${parsed.skillLabel} becomes useful when it is connected to a specific task, a clear output standard, and a repeatable review process. Start with one relevant use case, use a focused tool stack, produce a small real-world output, and improve it using feedback rather than trying to learn every feature at once.`
  );
}

function buildHighlights(post: BlogItem, parsed: ParsedSlug): GeneratedHighlight[] {
  const supplied = post.summaryPoints?.filter(Boolean).slice(0, 6) || [];
  if (supplied.length >= 3) {
    return supplied.map((point, index) => ({
      title: `Takeaway ${index + 1}`,
      description: point,
      icon: index % 3 === 0 ? "target" : index % 3 === 1 ? "sparkles" : "check",
    }));
  }

  return [
    {
      title: "Start with user intent",
      description: `Define what ${parsed.audienceLabel} need to achieve before selecting tools or prompts.`,
      icon: "target",
    },
    {
      title: "Create a repeatable workflow",
      description: `Turn ${parsed.skillLabel} into a sequence that can be tested, documented, and improved.`,
      icon: "wand",
    },
    {
      title: "Produce visible proof",
      description: "Use a project, example, checklist, comparison, or measured result to demonstrate practical capability.",
      icon: "check",
    },
    {
      title: "Review before publishing",
      description: "Check factual accuracy, usefulness, originality, clarity, links, and whether the answer matches the query.",
      icon: "shield",
    },
    {
      title: "Connect related topics",
      description: "Use descriptive internal links so readers and crawlers can discover the next relevant resource.",
      icon: "link",
    },
    {
      title: "Update material changes",
      description: "Revise the page when features, recommendations, examples, or the main answer materially change.",
      icon: "book",
    },
  ];
}

function buildSteps(post: BlogItem, parsed: ParsedSlug): GeneratedStep[] {
  const supplied = post.practicalSteps?.filter(Boolean).slice(0, 6) || [];
  if (supplied.length >= 4) {
    // BLOG_D1E_RENDERER_SPECIFICITY_V1: render the page-specific source step
    // as the visible explanation instead of repeating one generic sentence.
    return supplied.map((step, index) => ({
      title: `Step ${index + 1}`,
      description: step,
      meta: index === 0 ? "Define the goal" : index === supplied.length - 1 ? "Measure and improve" : "Build and review",
    }));
  }

  return [
    {
      title: "Define one concrete outcome",
      description: `Choose a task where ${parsed.skillLabel} can create a useful result for ${parsed.audienceLabel}. Write down the required format, quality standard, and success measure.`,
      meta: "30–45 minutes",
    },
    {
      title: "Choose a focused tool stack",
      description: "Use one primary tool and only the supporting tools required for the task. Verify current capabilities and limitations in official documentation.",
      meta: "Same day",
    },
    {
      title: "Build a small real-world output",
      description: "Create an example that can be inspected: a draft, design, automation, analysis, prompt system, portfolio item, or documented workflow.",
      meta: "1–3 practice sessions",
    },
    {
      title: "Apply a quality review",
      description: "Check accuracy, clarity, completeness, originality, usability, accessibility, and whether a human can act on the result without searching again.",
      meta: "Before publishing",
    },
    {
      title: "Measure the result",
      description: "Track the metric that matches the goal, such as time saved, fewer errors, better output quality, engagement, leads, or task completion.",
      meta: "After real use",
    },
    {
      title: "Document and update the system",
      description: "Save the working process, sources, prompts, templates, and review checklist. Update the page when material facts or tool behavior change.",
      meta: "Ongoing",
    },
  ];
}

function buildTools(parsed: ParsedSlug): GeneratedTool[] {
  const common: GeneratedTool[] = [
    {
      name: "Official product documentation",
      description: "Use the provider's current documentation for features, limitations, privacy, pricing, and technical behavior.",
      label: "Primary source",
    },
    {
      name: "Sikhadenge practice checklist",
      description: "Define the task, required evidence, review criteria, and measurable result before starting.",
      label: "Workflow",
    },
  ];

  if (parsed.skillLabel.includes("SEO")) {
    return [
      { name: "Google Search Console", description: "Inspect indexing, canonical selection, search performance, and crawl-related issues.", label: "Official" },
      { name: "Bing Webmaster Tools", description: "Review Bing discovery, sitemap status, recommendations, and URL health.", label: "Official" },
      ...common,
    ];
  }

  if (parsed.skillLabel.includes("design")) {
    return [
      { name: "Figma or Adobe tools", description: "Create, review, and present visual work using a professional design workflow.", label: "Creation" },
      { name: "Accessibility checks", description: "Review contrast, hierarchy, readability, text alternatives, and responsive behavior.", label: "Quality" },
      ...common,
    ];
  }

  return [
    { name: "ChatGPT", description: "Useful for structured drafts, analysis, explanations, and iterative workflows when outputs are reviewed.", label: "AI tool" },
    { name: "Google Gemini", description: "Useful for multimodal assistance, research support, and Google ecosystem workflows.", label: "AI tool" },
    ...common,
  ];
}

function buildMistakes(post: BlogItem, parsed: ParsedSlug) {
  const supplied = post.mistakes?.filter(Boolean).slice(0, 6) || [];
  if (supplied.length >= 4) return supplied;
  return [
    `Using ${parsed.skillLabel} without a defined user need or output standard.`,
    "Publishing automated drafts without factual checks, original value, or a clear ownership trail.",
    "Creating many near-duplicate pages for query variations instead of building a useful topic hierarchy.",
    "Adding unsupported statistics, ratings, earnings claims, urgency, or guarantees.",
    "Treating schema markup as a substitute for visible, useful page content.",
    "Changing sitemap dates on every build when the main content did not materially change.",
  ];
}

function buildFaqs(post: BlogItem, parsed: ParsedSlug): GeneratedFaq[] {
  const supplied = post.faqs?.filter((faq) => faq?.q && faq?.a) || [];
  const generated: GeneratedFaq[] = [
    {
      q: `What is the practical meaning of ${parsed.skillLabel}?`,
      a: `${parsed.skillLabel} is practical when it helps complete a defined task to a clear quality standard. The useful part is not the tool name; it is the repeatable process, evidence, and result.`,
    },
    {
      q: `Who should use this ${parsed.intentLabel}?`,
      a: `It is designed for ${parsed.audienceLabel} who want a structured starting point, a review checklist, and a practical next action rather than a keyword-only overview.`,
    },
    {
      q: `What should a beginner learn first?`,
      a: "Start with the underlying task and basic terminology, then learn one tool through a small project. Avoid switching between many tools before completing a useful output.",
    },
    {
      q: `How long does it take to become useful with ${parsed.skillLabel}?`,
      a: "A basic workflow can often be learned through a few focused practice sessions. Reliable professional capability takes repeated projects, review, correction, and exposure to real constraints.",
    },
    {
      q: "Do I need paid tools to start?",
      a: "Not always. Many tools offer free access or trials, but features and limits change. Verify current terms on the provider's official website before choosing a workflow.",
    },
    {
      q: "How should I evaluate the quality of an output?",
      a: "Check accuracy, relevance, completeness, clarity, originality, accessibility, consistency, and whether the intended user can act on the result without additional clarification.",
    },
    {
      q: "Can this help with jobs or freelancing?",
      a: "It can support jobs or freelancing when you can demonstrate real work, explain your process, handle feedback, and connect the skill to a business or user outcome. No page can guarantee employment or income.",
    },
    {
      q: "What should I include in a portfolio?",
      a: "Include the problem, constraints, your process, tools used, key decisions, final output, and what changed after review. A smaller number of well-explained projects is stronger than many unexplained samples.",
    },
    {
      q: "How do I avoid incorrect AI-generated information?",
      a: "Use primary sources, verify important claims, test outputs where possible, label uncertainty, and keep a human responsible for the final published result.",
    },
    {
      q: "How is this page designed for answer engines?",
      a: "The page includes a direct answer, descriptive headings, visible FAQs, structured steps, entity context, internal links, and matching structured data. These features improve clarity but do not guarantee citations or rankings.",
    },
    {
      q: "Does FAQ schema guarantee a Google rich result?",
      a: "No. Structured data can help machines understand visible content, but search engines decide eligibility and presentation. The FAQs are included primarily because they are useful to readers.",
    },
    {
      q: "How often should this guide be updated?",
      a: "Update it when the main answer, recommended workflow, material facts, tool capabilities, or important links change. Cosmetic rebuilds alone should not trigger a new modified date.",
    },
    {
      q: "What sources should I trust first?",
      a: "Prefer official product documentation, recognized standards bodies, original research, government sources, and first-party evidence. Use secondary summaries for context, not as the only support for important claims.",
    },
    {
      q: "What is the best next step after reading?",
      a: "Choose one relevant task, complete the first step today, save the result, and review it against a written quality checklist before expanding the workflow.",
    },
    {
      q: "Can I use this process on mobile?",
      a: "Some learning, drafting, and review tasks work on mobile, but complex production, file management, design, coding, or automation is usually more reliable on a desktop or laptop.",
    },
  ];

  const dedupeFaqs = (items: GeneratedFaq[]) =>
    items.filter(
      (faq, index, all) =>
        all.findIndex((item) => item.q.trim().toLowerCase() === faq.q.trim().toLowerCase()) === index,
    );

  // BLOG_D1E_RENDERER_SPECIFICITY_V1: complete source FAQs are authoritative.
  // Appending the same generic FAQ set to every page inflated template
  // dominance and weakened intent differentiation across otherwise distinct URLs.
  if (supplied.length >= 4) {
    return dedupeFaqs(supplied).slice(0, 8);
  }

  return dedupeFaqs([...supplied, ...generated]).slice(0, 6);
}


const RELATED_LINK_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "using",
  "use",
  "how",
  "what",
  "why",
  "when",
  "where",
  "this",
  "that",
  "your",
  "you",
  "our",
  "are",
  "can",
  "best",
  "complete",
  "guide",
  "guides",
  "tips",
  "ideas",
  "online",
  "daily",
  "practical",
  "learn",
  "learning",
  "begin",
  "start",
  "2024",
  "2025",
  "2026",
  "2027",
]);

function normalizeRelatedValue(value?: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getRelatedTokens(item: BlogItem) {
  const text = normalizeRelatedValue(
    `${item.slug} ${item.title} ${item.category || ""}`,
  );

  return new Set(
    text
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token.length >= 3)
      .filter((token) => !RELATED_LINK_STOP_WORDS.has(token))
      .filter((token) => !/^20\d{2}$/.test(token)),
  );
}

function tokenJaccard(
  left: Set<string>,
  right: Set<string>,
) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;

  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });

  const union =
    left.size + right.size - intersection;

  return union > 0
    ? intersection / union
    : 0;
}

function scoreRelatedPost(
  sourcePost: BlogItem,
  sourceParsed: ParsedSlug,
  candidate: BlogItem,
) {
  const candidateParsed =
    parseSlug(candidate.slug, candidate);

  const sourceTokens =
    getRelatedTokens(sourcePost);

  const candidateTokens =
    getRelatedTokens(candidate);

  const sharedTokens = Array.from(
    sourceTokens,
  ).filter((token) =>
    candidateTokens.has(token),
  );

  let score = 0;

  const sourceCategory =
    normalizeRelatedValue(sourcePost.category);

  const candidateCategory =
    normalizeRelatedValue(candidate.category);

  if (
    sourceCategory &&
    candidateCategory &&
    sourceCategory === candidateCategory
  ) {
    score += 52;
  }

  if (
    sourceParsed.skillLabel !==
      "AI and digital skills" &&
    sourceParsed.skillLabel !==
      "AI skills" &&
    sourceParsed.skillLabel ===
      candidateParsed.skillLabel
  ) {
    score += 38;
  }

  if (
    sourceParsed.audienceLabel !==
      "learners and professionals" &&
    sourceParsed.audienceLabel ===
      candidateParsed.audienceLabel
  ) {
    score += 24;
  }

  if (
    sourceParsed.intentLabel !== "guide" &&
    sourceParsed.intentLabel ===
      candidateParsed.intentLabel
  ) {
    score += 18;
  }

  score += Math.min(
    sharedTokens.length * 6,
    36,
  );

  if (
    sourceParsed.year === candidateParsed.year
  ) {
    score += 2;
  }

  const sourceSimilarity = tokenJaccard(
    sourceTokens,
    candidateTokens,
  );

  if (sourceSimilarity >= 0.9) {
    score -= 80;
  } else if (sourceSimilarity >= 0.76) {
    score -= 35;
  }

  return {
    item: candidate,
    score,
    sharedTokenCount: sharedTokens.length,
    tokens: candidateTokens,
  };
}

function selectRelatedPosts(
  post: BlogItem,
  parsed: ParsedSlug,
) {
  const scored =
    getTypedBlogCandidatesForSlug(post.slug)
      .filter((item) => item.slug !== post.slug)
      .map((item) =>
        scoreRelatedPost(post, parsed, item),
      )
      .filter((entry) => entry.score >= 12)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.sharedTokenCount -
            left.sharedTokenCount ||
          left.item.slug.localeCompare(
            right.item.slug,
          ),
      );

  const selected:
    typeof scored = [];

  for (const entry of scored) {
    if (selected.length >= 6) {
      break;
    }

    const tooSimilarToSelected =
      selected.some(
        (existing) =>
          tokenJaccard(
            existing.tokens,
            entry.tokens,
          ) >= 0.88,
      );

    if (!tooSimilarToSelected) {
      selected.push(entry);
    }
  }

  if (selected.length < 6) {
    const selectedSlugs = new Set(
      selected.map(
        (entry) => entry.item.slug,
      ),
    );

    for (const entry of scored) {
      if (selected.length >= 6) {
        break;
      }

      if (
        !selectedSlugs.has(entry.item.slug)
      ) {
        selected.push(entry);
        selectedSlugs.add(entry.item.slug);
      }
    }
  }

  return selected
    .slice(0, 6)
    .map((entry) => entry.item);
}

function safeDate(value?: string) {
  if (!value) return RELEASE_DATE_ISO;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? RELEASE_DATE_ISO : date.toISOString().slice(0, 10);
}


export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = getTypedBlogBySlug(params.slug);
  if (!post) {
    return {
      title: "Article Not Found",
      description: "The requested Sikhadenge article is not available.",
      robots: { index: false, follow: false },
    };
  }

  const parsed = parseSlug(params.slug, post);
  const description = buildDescription(post, parsed);
  const canonical = `${BASE_URL}/blog/${post.slug}`;

  return {
    title: post.title,
    description,
    alternates: { canonical },
    authors: [{ name: "Sikhadenge Editorial Team", url: `${BASE_URL}/authors/sikhadenge-editorial-team` }],
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "Sikhadenge",
      title: post.title,
      description,
      publishedTime: safeDate(post.publishedAt || post.datePublished),
      modifiedTime: safeDate(post.updatedAt || post.dateModified),
      images: [
        {
          url: `${BASE_URL}/images/courses/ai-mastery-design-editing-cover.webp`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [`${BASE_URL}/images/courses/ai-mastery-design-editing-cover.webp`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const redirectTarget =
    getBlogRedirectTarget(params.slug);

  if (redirectTarget) {
    permanentRedirect(
      `/blog/${redirectTarget}`,
    );
  }

  const post =
    getTypedBlogBySlug(params.slug);

  if (!post) {
    const canonicalSlug = getYearCanonicalSlug(params.slug);

    if (canonicalSlug) {
      permanentRedirect(`/blog/${canonicalSlug}`);
    }

    notFound();
  }

  const parsed = parseSlug(params.slug, post);
  const description = buildDescription(post, parsed);
  const answer = buildAnswer(post, parsed);
  const faqs = buildFaqs(post, parsed);
  const canonical = `${BASE_URL}/blog/${post.slug}`;
  const publishedDate = safeDate(post.publishedAt || post.datePublished);
  const modifiedDate = safeDate(post.updatedAt || post.dateModified);
  const category = post.category || parsed.skillLabel;

  const relatedPosts =
    selectRelatedPosts(post, parsed);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: post.title,
        description,
        mainEntityOfPage: { "@id": canonical },
        url: canonical,
        image: `${BASE_URL}/images/courses/ai-mastery-design-editing-cover.webp`,
        datePublished: publishedDate,
        dateModified: modifiedDate,
        inLanguage: "en-IN",
        author: {
          "@type": "Organization",
          "@id": `${BASE_URL}/authors/sikhadenge-editorial-team#organization`,
          name: "Sikhadenge Editorial Team",
          url: `${BASE_URL}/authors/sikhadenge-editorial-team`,
        },
        publisher: { "@id": `${BASE_URL}/#organization` },
        isPartOf: { "@id": `${BASE_URL}/#website` },
        about: [parsed.skillLabel, parsed.audienceLabel, category],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: canonical },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <GeneratedPageLayout
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/blog", label: "Blog" },
          { href: `/blog/${post.slug}`, label: post.title },
        ]}
        eyebrow={`${category} guide`}
        title={post.title}
        description={description}
        badges={[post.readTime || "8 min read", `For ${parsed.audienceLabel}`, `Updated ${RELEASE_DATE_LABEL}`]}
        answerTitle={`How should you approach ${parsed.skillLabel}?`}
        answer={answer}
        highlights={buildHighlights(post, parsed)}
        steps={buildSteps(post, parsed)}
        tools={buildTools(parsed)}
        mistakes={buildMistakes(post, parsed)}
        faqs={faqs}
        relatedLinks={[
          ...relatedPosts.map((item) => ({
            href: `/blog/${item.slug}`,
            label: item.title,
            description: item.excerpt || "Read the related practical Sikhadenge guide.",
          })),
          { href: "/blog", label: "Browse all blog topics", description: "Explore the Sikhadenge knowledge hub." },
        ].slice(0, 6)}
        updatedAt={RELEASE_DATE_LABEL}
        primaryCta={{ href: "/gen-ai-masterclass/register-one-step", label: "Join the free masterclass" }}
        secondaryCta={{ href: "/contact-us", label: "Contact Sikhadenge" }}
      >
        <section className="mb-14 rounded-3xl border border-white/10 bg-[#111827]/70 p-6 sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#F5B301]">Source standard</div>
          <h2 className="mt-3 text-2xl font-extrabold">Verify changing facts at the primary source</h2>
          <p className="mt-3 max-w-4xl text-sm leading-8 text-[#B0B7C3] sm:text-base">
            Product features, model access, prices, policies, and platform limits can change. Use official documentation for current facts, keep important evidence with the project, and update this page when a material recommendation changes.
          </p>
        </section>
      </GeneratedPageLayout>
    </>
  );
}
