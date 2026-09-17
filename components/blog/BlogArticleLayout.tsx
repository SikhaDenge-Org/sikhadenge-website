import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  Link2,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import type {
  GeneratedFaq,
  GeneratedHighlight,
  GeneratedLink,
  GeneratedStep,
  GeneratedTool,
} from "../generated/GeneratedPageKit";

export type {
  GeneratedFaq,
  GeneratedHighlight,
  GeneratedLink,
  GeneratedStep,
  GeneratedTool,
} from "../generated/GeneratedPageKit";

type BlogArticleLayoutProps = {
  breadcrumbs: GeneratedLink[];
  eyebrow: string;
  title: string;
  description: string;
  badges?: string[];
  answerTitle: string;
  answer: string;
  highlights: GeneratedHighlight[];
  steps: GeneratedStep[];
  tools?: GeneratedTool[];
  mistakes?: string[];
  faqs: GeneratedFaq[];
  relatedLinks?: GeneratedLink[];
  updatedAt: string;
  authorLabel?: string;
  authorHref?: string;
  primaryCta: GeneratedLink;
  secondaryCta?: GeneratedLink;
  children?: ReactNode;
};

type BlogIconName =
  | NonNullable<GeneratedHighlight["icon"]>
  | "answer"
  | "book"
  | "check"
  | "link"
  | "shield"
  | "sparkles"
  | "target"
  | "wand";

const ICONS: Record<BlogIconName, typeof Sparkles> = {
  answer: FileCheck2,
  book: BookOpen,
  bot: Sparkles,
  check: CheckCircle2,
  graduate: BookOpen,
  idea: Sparkles,
  link: Link2,
  search: Sparkles,
  shield: ShieldCheck,
  sparkles: Sparkles,
  target: Target,
  users: BadgeCheck,
  wand: WandSparkles,
};

function IconBox({
  name = "sparkles",
  tone = "blue",
}: {
  name?: BlogIconName;
  tone?: "blue" | "amber" | "slate" | "green";
}) {
  const Icon = ICONS[name];
  const toneClasses = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[tone];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${toneClasses}`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.9} />
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: BlogIconName;
}) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <IconBox name={icon} />
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-slate-950 sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function GeneratedPageLayout({
  breadcrumbs,
  eyebrow,
  title,
  description,
  badges = [],
  answerTitle,
  answer,
  highlights,
  steps,
  tools = [],
  mistakes = [],
  faqs,
  relatedLinks = [],
  updatedAt,
  authorLabel = "Sikhadenge Editorial Team",
  authorHref = "/authors/sikhadenge-editorial-team",
  primaryCta,
  secondaryCta,
  children,
}: BlogArticleLayoutProps) {
  const navigation = [
    { href: "#quick-answer", label: "Quick answer" },
    { href: "#takeaways", label: "Key takeaways" },
    { href: "#roadmap", label: "Step-by-step" },
    ...(tools.length ? [{ href: "#resources", label: "Resources" }] : []),
    ...(children ? [{ href: "#source-standard", label: "Source standard" }] : []),
    ...(mistakes.length ? [{ href: "#mistakes", label: "Mistakes" }] : []),
    { href: "#faq", label: "FAQs" },
    { href: "#editorial", label: "Editorial trust" },
    ...(relatedLinks.length ? [{ href: "#related", label: "Related guides" }] : []),
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950 selection:bg-blue-200 selection:text-blue-950">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white pt-24">
        <div className="absolute inset-0 bg-[radial-gradient(750px_360px_at_12%_5%,rgba(37,99,235,0.08),transparent_65%),radial-gradient(600px_320px_at_92%_8%,rgba(245,179,1,0.08),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.42] [background-image:linear-gradient(rgba(148,163,184,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.14)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className="relative mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-18 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.href}-${item.label}`} className="inline-flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true" className="text-slate-300">/</span> : null}
                <Link href={item.href} className="max-w-[240px] truncate transition hover:text-blue-700 sm:max-w-none">
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>

          <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
                <Sparkles className="h-4 w-4" />
                {eyebrow}
              </div>

              <h1 className="mt-6 max-w-5xl text-4xl font-black leading-[1.06] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[3.65rem]">
                {title}
              </h1>

              <p className="mt-6 max-w-4xl text-base leading-8 text-slate-600 sm:text-lg">
                {description}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
                <Link href={authorHref} className="inline-flex items-center gap-2 font-extrabold text-slate-950 hover:text-blue-700">
                  <BadgeCheck className="h-4 w-4 text-blue-700" />
                  {authorLabel}
                </Link>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-blue-700" />
                  Updated {updatedAt}
                </span>
              </div>

              {badges.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {badges.map((badge) => (
                    <span key={badge} className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="rounded-2xl border border-blue-200 bg-[linear-gradient(145deg,#ffffff,#eff6ff)] p-6 shadow-[0_18px_55px_rgba(37,99,235,0.10)] sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <IconBox name="answer" tone="blue" />
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                  Answer first
                </span>
              </div>
              <h2 className="mt-6 text-xl font-black leading-snug text-slate-950">{answerTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{answer}</p>
              <a href="#quick-answer" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-blue-900">
                Read the structured answer <ArrowRight className="h-4 w-4" />
              </a>
            </aside>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[240px_minmax(0,860px)] xl:justify-center">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
            <p className="px-2 pb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">On this page</p>
            <nav aria-label="Article sections" className="space-y-1">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} className="block rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <Link href={authorHref} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 hover:bg-slate-100">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-white">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Reviewed by</span>
                  <span className="mt-0.5 block text-xs font-black text-slate-900">Editorial team</span>
                </span>
              </Link>
            </div>
          </div>
        </aside>

        <article className="min-w-0">
          <section id="quick-answer" aria-labelledby="quick-answer-heading" className="scroll-mt-28">
            <Surface className="overflow-hidden border-blue-200">
              <div className="grid md:grid-cols-[190px_1fr]">
                <div className="bg-blue-700 p-6 text-white sm:p-7">
                  <IconBox name="check" tone="amber" />
                  <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">Quick answer</p>
                  <p className="mt-2 text-sm leading-6 text-blue-100">A clear response for readers, snippets and answer engines.</p>
                </div>
                <div className="p-7 sm:p-9">
                  <h2 id="quick-answer-heading" className="text-2xl font-black tracking-[-0.025em] text-slate-950">{answerTitle}</h2>
                  <p className="mt-4 text-base leading-8 text-slate-700">{answer}</p>
                </div>
              </div>
            </Surface>
          </section>

          <section id="takeaways" className="mt-14 scroll-mt-28">
            <SectionHeading eyebrow="At a glance" title="Key takeaways" description="Important points organised for quick scanning and practical execution." icon="target" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {highlights.map((item, index) => (
                <Surface key={`${item.title}-${index}`} className="p-6 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_20px_50px_rgba(37,99,235,0.10)]">
                  <div className="flex items-start justify-between gap-4">
                    <IconBox name={(item.icon || "sparkles") as BlogIconName} tone={index % 3 === 1 ? "amber" : "blue"} />
                    <span className="text-xs font-black text-slate-300">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                </Surface>
              ))}
            </div>
          </section>

          <section id="roadmap" className="mt-14 scroll-mt-28">
            <SectionHeading eyebrow="Execution roadmap" title="Step-by-step approach" description="Follow the sequence, create visible work, review the result and improve the process." icon="book" />
            <div className="space-y-4">
              {steps.map((step, index) => (
                <Surface key={`${index}-${step.title}`} className="p-6 sm:p-7">
                  <div className="flex gap-5">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-base font-black text-white shadow-sm">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-black text-slate-950 sm:text-xl">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600 sm:text-base">{step.description}</p>
                      {step.meta ? (
                        <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
                          <Clock3 className="h-3.5 w-3.5 text-blue-700" />
                          {step.meta}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Surface>
              ))}
            </div>
          </section>

          {tools.length > 0 ? (
            <section id="resources" className="mt-14 scroll-mt-28">
              <SectionHeading eyebrow="Useful resources" title="Recommended tools and references" description="Use a focused stack and verify changing facts on official sources." icon="wand" />
              <div className="grid gap-4 sm:grid-cols-2">
                {tools.map((tool, index) => (
                  <Surface key={tool.name} className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <IconBox name="wand" tone={index % 2 ? "amber" : "blue"} />
                      {tool.label ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">{tool.label}</span>
                      ) : null}
                    </div>
                    <h3 className="mt-5 text-lg font-black text-slate-950">{tool.name}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{tool.description}</p>
                  </Surface>
                ))}
              </div>
            </section>
          ) : null}

          {children ? (
            <section id="source-standard" className="mt-14 scroll-mt-28 [&>section]:mb-0 [&>section]:border-slate-200 [&>section]:bg-white [&>section]:text-slate-950 [&_p]:text-slate-600">
              {children}
            </section>
          ) : null}

          {mistakes.length > 0 ? (
            <section id="mistakes" className="mt-14 scroll-mt-28">
              <SectionHeading eyebrow="Quality control" title="Common mistakes to avoid" description="These checks protect usefulness, credibility and long-term search performance." icon="shield" />
              <div className="grid gap-4 sm:grid-cols-2">
                {mistakes.map((mistake) => (
                  <div key={mistake} className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <p className="text-sm leading-7 text-slate-700">{mistake}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section id="faq" className="mt-14 scroll-mt-28" aria-labelledby="faq-heading">
            <SectionHeading eyebrow="Questions and answers" title="Frequently asked questions" description="Clear, visible answers written for readers, snippets and AI retrieval systems." icon="answer" />
            <div id="faq-heading" className="space-y-3">
              {faqs.map((faq, index) => (
                <details key={faq.q} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] open:border-blue-200 open:shadow-[0_14px_36px_rgba(37,99,235,0.08)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left marker:content-none sm:px-6 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span>
                      <span className="font-black leading-7 text-slate-900">{faq.q}</span>
                    </span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180 group-open:text-blue-700" />
                  </summary>
                  <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-5 text-sm leading-8 text-slate-700 sm:px-6 sm:pl-16">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>

          <section id="editorial" className="mt-14 scroll-mt-28">
            <Surface className="border-emerald-200 bg-emerald-50/40 p-6 sm:p-8">
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.17em] text-emerald-700">
                    <BadgeCheck className="h-4 w-4" /> Editorial trust
                  </p>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">Published with clear ownership and review context</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
                    Published by <Link href={authorHref} className="font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4">{authorLabel}</Link>. Updated {updatedAt}. Material changes should be reflected in the page, metadata and sitemap date.
                  </p>
                </div>
                <Link href="/editorial-policy" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-black text-emerald-800 hover:bg-emerald-50">
                  Editorial policy <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Surface>
          </section>

          {relatedLinks.length > 0 ? (
            <section id="related" className="mt-14 scroll-mt-28">
              <SectionHeading eyebrow="Continue learning" title="Related guides" description="Relevant internal links connect this article with the wider Sikhadenge knowledge system." icon="link" />
              <div className="grid gap-4 sm:grid-cols-2">
                {relatedLinks.map((item) => (
                  <Link key={`${item.href}-${item.label}`} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_16px_40px_rgba(37,99,235,0.09)]">
                    <h3 className="font-black text-slate-950 group-hover:text-blue-700">{item.label}</h3>
                    {item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p> : null}
                    <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-blue-700">Open guide <ArrowRight className="h-3.5 w-3.5" /></span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-14 overflow-hidden rounded-2xl border border-blue-200 bg-[linear-gradient(135deg,#eff6ff,#ffffff_55%,#fffbeb)] p-7 shadow-[0_18px_55px_rgba(37,99,235,0.08)] sm:p-9">
            <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.17em] text-blue-700">Next step</p>
                <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.03em] text-slate-950">Move from reading to practical execution</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">Use the relevant Sikhadenge learning path, ask a specific question or explore a connected guide.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link href={primaryCta.href} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-4 text-sm font-black text-white shadow-sm hover:bg-blue-800">
                  {primaryCta.label} <ArrowRight className="h-4 w-4" />
                </Link>
                {secondaryCta ? (
                  <Link href={secondaryCta.href} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-4 text-sm font-black text-slate-800 hover:bg-slate-50">
                    {secondaryCta.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
