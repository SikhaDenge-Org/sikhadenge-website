# SikhaDenge Industry Sales Reply Hub — Research and Conversation Design

## Objective

Build a WhatsApp sales assistant that can answer common learner questions across AI, graphic design, UI/UX, video editing, content creation, social media, digital marketing, freelancing, business automation and career planning, while keeping replies short, useful, conversational and conversion-focused.

The assistant must not copy another brand's wording. The desired voice is witty, warm and memorable, using original SikhaDenge micro-humour with one or two relevant emojis.

## Industry signals used

1. World Economic Forum, Future of Jobs Report 2025
   - AI, big data and technological literacy are among the fastest-growing skill areas.
   - Creative thinking, resilience and collaboration remain important human skills.
   - Source: https://www.weforum.org/press/2025/01/future-of-jobs-report-2025-78-million-new-job-opportunities-by-2030-but-urgent-upskilling-needed-to-prepare-workforces/

2. LinkedIn Skills on the Rise 2025 — India
   - Creativity and innovation are highlighted as fast-growing skills.
   - AI literacy is increasingly relevant to both technical and non-technical professionals.
   - Source: https://www.linkedin.com/pulse/linkedin-skills-rise-2025-15-fastest-growing-india-fv9wc/

3. LinkedIn Jobs on the Rise 2025 — India
   - AI roles, influencer marketing, creative strategy, growth consulting and media buying are among areas of opportunity.
   - Source: https://www.linkedin.com/pulse/linkedin-jobs-rise-2025-25-fastest-growing-roles-india-lnqcc

4. Adobe Learn and Creative Cloud learning resources
   - Common learning areas include graphic design, photo editing, video editing, animation, generative AI, marketing layouts and creative production.
   - Sources:
     - https://www.adobe.com/learn
     - https://www.adobe.com/creativecloud/features.html

5. Canva Design School
   - Social-media learning covers platform selection, goals, visual style, video, content planning, community building and brand growth.
   - Source: https://www.canva.com/design-school/courses/social-media-mastery

6. Google Skillshop
   - Official learning areas include Google Ads, Google Analytics, Google Marketing Platform, YouTube and Grow with Google.
   - Source: https://support.google.com/skillshop/answer/14740021

7. Meta for Business and Meta Blueprint
   - Practical advertising learning includes objectives, audiences, creative, lead generation, click-to-message and AI-enabled campaign optimisation.
   - Sources:
     - https://www.facebook.com/business/ads/meta-advantage-plus
     - https://www.facebook.com/business/ads/click-to-message-ads

8. HubSpot Academy
   - Core digital-marketing areas include content, SEO, social media, email, lead generation, inbound strategy, reporting and performance.
   - Source: https://academy.hubspot.com/courses/digital-marketing

## Question architecture

The reply hub contains 84 core answer topics across 14 domains:

1. AI foundations
2. AI tools and generative creation
3. Graphic design
4. UI/UX and Figma
5. Video editing
6. Content creation
7. Social-media marketing
8. Digital and performance marketing
9. Career and AI scope
10. Freelancing
11. Business AI and automation
12. Eligibility and objections
13. Delivery, support and certification
14. Demo, admission and counsellor conversion

Each topic has three natural user questions and four conversational prefixes, producing 1,008 generated question variants before typo normalisation and token-based matching.

## Reply pattern

Every normal sales reply follows this structure:

1. One direct answer with one relevant emoji.
2. One memorable micro-line or practical distinction when appropriate.
3. One conversion action:
   - DEMO for course, tool and curriculum interest.
   - GOAL for career discovery.
   - YES CALL for high-intent or complex guidance.

Typical reply length: 160–420 characters.

## Brand voice rules

- Original SikhaDenge voice; do not reproduce competitor slogans or exact marketing copy.
- Use Hindi/Hinglish when the user writes Hinglish.
- Use a maximum of two meaningful emojis.
- Keep humour light and relevant, never random.
- No humour for payment failures, complaints, refunds, privacy, security or opt-out.
- Do not disclose unverified fees, discounts, batch dates or recording promises.
- Do not promise jobs, salaries, clients, income or placement.
- Position the free masterclass as the next step, not as a pressure tactic.
- Offer a counsellor call only after meaningful interest or explicit request.

## Conversion ladder

1. Understand the question.
2. Give immediate value.
3. Identify goal: study, job, freelancing or business.
4. Recommend the relevant learning path.
5. Push to the free masterclass.
6. Detect stronger intent from repeated curriculum, timing, admission or business questions.
7. Offer `YES CALL` for counsellor handover.
8. Store unknown or low-confidence questions in the supervised learning queue.

## Learning safety

The agent must not automatically treat a customer's claim as truth. Unknown and low-confidence questions should be stored for review. A manager-approved answer can then become approved knowledge for future similar questions.

## Success metrics

- Correct-intent match rate
- Fallback rate
- Repeated-question rate
- DEMO reply rate
- Masterclass-link click rate
- Registration completion rate
- YES CALL conversion rate
- Counsellor acceptance and final admission rate
- Complaint and opt-out handling accuracy
