import type { AgentIntent, AgentKnowledgeReference, AgentLanguage } from "./types";

type ConversionAction = "DEMO" | "GOAL" | "CALL" | "NONE";
type IndustryReplyTopic = {
  id: string;
  category: string;
  intent: AgentIntent;
  emoji: string;
  questions: readonly [string, string, string];
  keywords: readonly string[];
  answer: { en: string; hinglish: string };
  action: ConversionAction;
  minScore: number;
};

const PREFIXES = ["", "bhai ", "sir ", "please "] as const;

const RAW_TOPICS = String.raw`
ai-basics|AI_FOUNDATIONS|COURSE_DETAILS|🧠|ai kya hai~ai basics kaise seekhe~what is artificial intelligence|ai~artificial~intelligence~basics|AI machines ko data aur instructions ke basis par smart tasks karne mein help karta hai. Basics ko practical examples se simple banate hain - rocket science wala tension nahi 😄|AI helps machines perform smart tasks using data and instructions. We explain the basics through practical examples.|DEMO
generative-ai|AI_FOUNDATIONS|COURSE_DETAILS|✨|generative ai kya hai~gen ai kaise kaam karta hai~what is generative ai|generative~gen~ai~create|Generative AI text, image, video aur audio jaise naye outputs create kar sakta hai. Sahi prompt mile to creativity turbo mode mein aa jaati hai 🚀|Generative AI can create new text, images, video and audio. The right prompt makes creative work much faster.|DEMO
prompting|AI_FOUNDATIONS|COURSE_DETAILS|✍️|prompt engineering sikhayenge~achha prompt kaise likhe~is prompt engineering included|prompt~prompting~engineering~instruction|Prompting mein clear instruction, context, examples aur output format dena sikhaya jaata hai. AI mind-reader nahi hai - brief jitna clear, result utna solid 😉|Prompting teaches clear instructions, context, examples and output formats. Better briefs usually produce better results.|DEMO
ai-research|AI_FOUNDATIONS|COURSE_DETAILS|🔎|ai se research kaise kare~research tools sikhayenge~is ai research covered|research~information~sources~verify|AI-assisted research mein question framing, source checking, summarising aur fact verification cover hota hai. Fast answer useful hai, verified answer priceless ✅|AI-assisted research covers question framing, source checking, summarising and fact verification.|DEMO
ai-productivity|AI_FOUNDATIONS|COURSE_DETAILS|⚡|office work me ai kaise use hoga~ai productivity sikhayenge~can ai improve office work|office~productivity~document~email|AI emails, documents, presentations, planning aur repetitive work ko faster bana sakta hai. Goal shortcut nahi - smart workflow hai ⚡|AI can speed up emails, documents, presentations, planning and repetitive work through smarter workflows.|DEMO
excel-data|AI_FOUNDATIONS|COURSE_DETAILS|📊|excel me ai sikhayenge~data analysis ai se kaise kare~is excel and data included|excel~data~sheet~analysis|Excel aur data workflows mein cleaning, formulas, summaries, charts aur insight generation cover hota hai. Spreadsheet ka jungle thoda civilised ho jaata hai 😄|Excel and data workflows cover cleaning, formulas, summaries, charts and insight generation.|DEMO
chatgpt-tools|AI_TOOLS|COURSE_DETAILS|💬|chatgpt sikhayenge~kaun se ai chat tools honge~will you teach chatgpt|chatgpt~chat~llm~tools|AI chat tools ko research, writing, planning, learning aur business tasks ke liye practical tareeke se use karna sikhaya jaata hai.|AI chat tools are taught for practical research, writing, planning, learning and business tasks.|DEMO
image-generation|AI_TOOLS|COURSE_DETAILS|🖼️|ai image banana sikhayenge~text se image kaise banaye~is ai image generation included|image~generate~text~visual|AI image creation mein prompt, composition, style, consistency aur editing workflow cover hota hai. Idea aapka, pixels ko mehnat karne dijiye 🎨|AI image creation covers prompts, composition, style, consistency and editing workflows.|DEMO
video-generation|AI_TOOLS|COURSE_DETAILS|🎥|ai video banana sikhayenge~text to video kaise kare~is ai video generation covered|video~generate~text~scene|AI video workflow mein idea, script, shots, generation aur final editing ka process samjhaya jaata hai. Sirf button nahi - story bhi chahiye 🎬|AI video workflows cover ideas, scripts, shots, generation and final editing.|DEMO
voice-audio-ai|AI_TOOLS|COURSE_DETAILS|🎙️|ai voiceover sikhayenge~audio ai tools cover honge~is ai voice and audio included|voice~audio~voiceover~sound|AI voice aur audio workflows mein voiceover, cleanup, transcription aur content-production use cases cover hote hain.|AI voice and audio workflows cover voiceovers, cleanup, transcription and content-production use cases.|DEMO
ai-avatar|AI_TOOLS|COURSE_DETAILS|🧑‍💻|ai avatar video banana hai~virtual presenter sikhayenge~will you teach ai avatars|avatar~presenter~virtual~video|AI avatar aur virtual-presenter workflows explain kiye ja sakte hain. Exact tools active batch ke according confirm honge - avatar smart ho, message human rahe 😊|AI avatar and presenter workflows can be covered, with exact tools confirmed for the active batch.|DEMO
tool-list-cost|AI_TOOLS|COURSE_DETAILS|🧰|kaun kaun se tools honge~paid tools lene padenge~which tools and subscriptions are required|tools~paid~subscription~list|Research, content, design, image-video aur automation ke practical tools use honge. Free plans se start karenge; paid tool bina need-check ke nahi 😄|Practical tools for research, content, design, image-video and automation are used. Free plans are preferred before paid subscriptions.|DEMO
graphic-design|DESIGN|COURSE_DETAILS|🎨|graphic design kya hai~graphic designing sikhna hai~what is graphic design|graphic~design~visual~creative|Graphic design visual communication hai - colour, typography, layout aur brand message ko ek strong design mein combine karna. Pretty ke saath purposeful bhi ✨|Graphic design combines colour, typography, layout and brand messaging into purposeful visual communication.|DEMO
canva|DESIGN|COURSE_DETAILS|🟣|canva sikhayenge~canva se professional design kaise banaye~is canva covered|canva~template~design~social|Canva se social posts, presentations, reels, flyers aur branded content fast banaya ja sakta hai. Template se start, brand par finish - copy-paste par nahi 😄|Canva can be used for social posts, presentations, reels, flyers and branded content with a focus on brand consistency.|DEMO
photoshop|DESIGN|COURSE_DETAILS|🖌️|photoshop sikhayenge~photo editing course hai~is photoshop included|photoshop~photo~editing~retouch|Photoshop workflows mein photo editing, retouching, compositing, background work aur campaign assets cover kiye ja sakte hain. Exact module active batch mein confirm hoga.|Photoshop workflows may cover photo editing, retouching, compositing, backgrounds and campaign assets, subject to the active module.|DEMO
illustrator|DESIGN|COURSE_DETAILS|✒️|illustrator sikhayenge~vector design kaise banaye~is adobe illustrator covered|illustrator~vector~logo~illustration|Illustrator aur vector workflows logo, icons, typography aur scalable artwork ke liye useful hain. Zoom karo, quality ko hiccup nahi aata 😄|Illustrator and vector workflows are useful for logos, icons, typography and scalable artwork.|DEMO
branding-logo|DESIGN|COURSE_DETAILS|🏷️|logo design sikhayenge~branding kaise kare~will you teach branding and logo design|logo~branding~identity~brand|Branding sirf logo nahi - colour, type, tone, consistency aur customer memory ka system hai. Logo face hai, brand poori personality 😉|Branding covers identity, colour, typography, tone and consistency; a logo is only one part of the brand system.|DEMO
social-media-design|DESIGN|COURSE_DETAILS|📱|social media post design sikhayenge~instagram creatives kaise banaye~is social media design covered|social~post~instagram~creative|Social-media design mein scroll-stopping layout, readable text, brand consistency aur platform-size discipline cover hota hai. Design sundar bhi, readable bhi 👀|Social-media design covers attention-grabbing layouts, readable text, brand consistency and platform-specific formats.|DEMO
figma|UI_UX|COURSE_DETAILS|🧩|figma sikhayenge~figma course hai~is figma included|figma~ui~ux~prototype|Figma UI design, components, collaboration aur prototypes ke liye use hota hai. Exact coverage active design module ke according confirm hogi.|Figma is used for UI design, components, collaboration and prototypes, with exact coverage confirmed for the active module.|DEMO
uiux-basics|UI_UX|COURSE_DETAILS|🧭|ui ux kya hai~ui ux design sikhna hai~what is ui ux design|ui~ux~user~experience|UI screen ka look hai, UX user ka experience. Button shiny ho par mil hi na raha ho, to UX naraz ho jaata hai 😄|UI is the visual interface, while UX is the user's overall experience and ease of completing a task.|DEMO
prototyping|UI_UX|COURSE_DETAILS|🔗|prototype banana sikhayenge~clickable prototype kaise banaye~is prototyping included|prototype~clickable~flow~interaction|Prototyping se app ya website flow ko development se pehle test kiya jaata hai. Code se pehle confusion pakadna usually sasta padta hai 😉|Prototyping helps test an app or website flow before development, reducing avoidable confusion and rework.|DEMO
mobile-app-design|UI_UX|COURSE_DETAILS|📲|mobile app design sikhayenge~app ui kaise banaye~will you teach mobile app design|mobile~app~screen~ui|Mobile-app design mein user flow, screen hierarchy, components aur usability cover hoti hai. Thumb ko marathon na karana bhi UX hai 😄|Mobile-app design covers user flows, screen hierarchy, components and usability.|DEMO
website-design|UI_UX|COURSE_DETAILS|🌐|website design sikhayenge~landing page design kaise kare~is website design covered|website~landing~page~web|Website aur landing-page design mein hierarchy, trust, mobile responsiveness aur clear CTA important hote hain. Visitor ko treasure hunt nahi, direction chahiye 🎯|Website and landing-page design focuses on hierarchy, trust, mobile responsiveness and clear calls to action.|DEMO
uiux-portfolio|UI_UX|COURSE_DETAILS|📁|ui ux portfolio kaise banaye~case study banana sikhayenge~how do i build a ui ux portfolio|portfolio~case~study~ui|Strong UI/UX portfolio final screens ke saath problem, process, decisions aur outcome dikhata hai. Portfolio aapka silent salesperson hota hai 😉|A strong UI/UX portfolio shows the problem, process, decisions and outcome, not just final screens.|DEMO
premiere-pro|VIDEO_EDITING|COURSE_DETAILS|🎞️|premiere pro sikhayenge~professional video editing course hai~is premiere pro covered|premiere~video~editing~timeline|Premiere Pro workflows mein timeline editing, cuts, audio, colour, captions aur export cover kiye ja sakte hain. Exact module active batch mein confirm hoga.|Premiere Pro workflows may cover timeline editing, cuts, audio, colour, captions and export, subject to the active module.|DEMO
after-effects|VIDEO_EDITING|COURSE_DETAILS|💫|after effects sikhayenge~vfx motion graphics course hai~is after effects included|after~effects~vfx~motion|After Effects motion graphics, compositing, titles aur visual effects ke liye useful hai. Har transition ko earthquake banana zaroori nahi 😄|After Effects is useful for motion graphics, compositing, titles and visual effects, with an emphasis on purposeful editing.|DEMO
capcut-mobile|VIDEO_EDITING|COURSE_DETAILS|📱|mobile se video editing sikhayenge~capcut sikhayenge~can i learn editing on mobile|capcut~mobile~phone~editing|Mobile editing se reels, captions, cuts aur quick social content banaya ja sakta hai. Advanced workflow ke liye laptop options useful rahenge.|Mobile editing can handle reels, captions, cuts and quick social content, while laptop workflows are useful for advanced work.|DEMO
davinci-resolve|VIDEO_EDITING|COURSE_DETAILS|🎛️|davinci resolve sikhayenge~color grading kaise seekhe~is davinci resolve covered|davinci~resolve~colour~grading|DaVinci Resolve editing, colour grading aur audio workflows ke liye powerful option hai. Exact software coverage active batch mein confirm hogi.|DaVinci Resolve is a strong option for editing, colour grading and audio, with exact coverage confirmed for the active batch.|DEMO
motion-graphics|VIDEO_EDITING|COURSE_DETAILS|🌀|motion graphics sikhayenge~animated text kaise banaye~is motion design included|motion~graphics~animation~text|Motion graphics mein animated text, shapes, brand elements aur visual rhythm cover hota hai. Movement tabhi useful hai jab message bhi move kare 🚀|Motion graphics covers animated text, shapes, brand elements and visual rhythm.|DEMO
reels-shorts-editing|VIDEO_EDITING|COURSE_DETAILS|📹|reels editing sikhayenge~youtube shorts kaise edit kare~will you teach reels and shorts editing|reels~shorts~vertical~editing|Reels aur Shorts editing mein hook, fast pacing, captions, pattern breaks aur clear CTA important hain. Pehle 3 seconds attendance lete hain 😄|Reels and Shorts editing focuses on hooks, pacing, captions, pattern breaks and a clear call to action.|DEMO
script-writing|CONTENT_CREATION|COURSE_DETAILS|📝|video script kaise likhe~script writing sikhayenge~is script writing included|script~video~story~hook|Script workflow mein hook, problem, value, proof aur CTA structure cover hota hai. Camera se pehle clarity on honi chahiye 🎬|Script writing covers hooks, problems, value, proof and calls to action.|DEMO
captions-copywriting|CONTENT_CREATION|COURSE_DETAILS|✍️|caption writing sikhayenge~copywriting kaise kare~is copywriting included|caption~copywriting~copy~writing|Captions aur copywriting mein attention, benefit, emotion aur action ka balance hota hai. Long paragraph tabhi, jab reader ne chai order ki ho 😄|Captions and copywriting balance attention, benefits, emotion and action.|DEMO
thumbnails|CONTENT_CREATION|COURSE_DETAILS|🖼️|youtube thumbnail sikhayenge~thumbnail kaise banaye~will you teach thumbnail design|thumbnail~youtube~click~design|Thumbnail mein one clear idea, strong contrast, readable text aur curiosity important hai. Clickbait nahi - click-worthy banna hai 👀|Thumbnail design needs one clear idea, strong contrast, readable text and honest curiosity.|DEMO
carousel-posts|CONTENT_CREATION|COURSE_DETAILS|📚|instagram carousel kaise banaye~carousel content sikhayenge~is carousel creation covered|carousel~slides~instagram~post|Carousel mein first slide hook, middle slides value aur last slide CTA hota hai. Swipe ko reason dijiye, exercise nahi 😄|A good carousel uses a strong first-slide hook, useful middle slides and a clear final call to action.|DEMO
blog-seo-content|CONTENT_CREATION|COURSE_DETAILS|🔍|blog writing sikhayenge~seo content kaise likhe~is blog and seo content covered|blog~seo~article~content|SEO content mein search intent, structure, useful information aur natural keywords cover hote hain. Search engine ko khush karte-karte reader ko bore nahi karna 😄|SEO content focuses on search intent, structure, useful information and natural keyword use.|DEMO
content-calendar|CONTENT_CREATION|COURSE_DETAILS|🗓️|content calendar kaise banaye~monthly content plan sikhayenge~will you teach content planning|content~calendar~plan~monthly|Content calendar goals, audience, formats, frequency aur campaign dates ko organise karta hai. Daily aaj kya post karein wali emergency kam ho jaati hai 😄|A content calendar organises goals, audiences, formats, frequency and campaign dates.|DEMO
instagram-growth|SOCIAL_MEDIA|COURSE_DETAILS|📸|instagram grow kaise kare~followers kaise badhaye~will you teach instagram growth|instagram~followers~growth~reach|Instagram growth mein positioning, useful content, consistency, community aur analytics ka role hai. Viral hona bonus hai, valuable hona strategy 📈|Instagram growth depends on positioning, useful content, consistency, community and analytics.|DEMO
youtube-growth|SOCIAL_MEDIA|COURSE_DETAILS|▶️|youtube channel grow kaise kare~youtube seo sikhayenge~will you teach youtube growth|youtube~channel~views~growth|YouTube growth topic selection, title-thumbnail, retention, consistency aur audience feedback par build hoti hai. Algorithm ko audience pasand aati hai, magic mantra nahi 😄|YouTube growth is built through topic selection, titles and thumbnails, retention, consistency and audience feedback.|DEMO
facebook-linkedin|SOCIAL_MEDIA|COURSE_DETAILS|🌐|facebook marketing sikhayenge~linkedin content kaise kare~are facebook and linkedin covered|facebook~linkedin~platform~content|Facebook community aur ads ke liye, LinkedIn authority aur networking ke liye useful hai. Same post har jagah chipkana strategy nahi, forwarding hai 😄|Facebook is useful for communities and ads, while LinkedIn supports authority and professional networking; content should be adapted by platform.|DEMO
community-building|SOCIAL_MEDIA|COURSE_DETAILS|🤝|online community kaise banaye~audience engagement sikhayenge~will you teach community building|community~engagement~audience~loyal|Community building regular value, genuine replies, participation aur trust se hoti hai. Audience number nahi - relationship hoti hai 🤝|Community building grows through regular value, genuine replies, participation and trust.|DEMO
influencer-marketing|SOCIAL_MEDIA|COURSE_DETAILS|📣|influencer marketing sikhayenge~creator collaboration kaise kare~is influencer marketing covered|influencer~creator~collaboration~partnership|Influencer marketing mein audience fit, brief, deliverables, tracking aur brand safety important hain. Followers bade, fit zero - campaign weak 😄|Influencer marketing requires audience fit, clear briefs, deliverables, tracking and brand safety.|DEMO
social-analytics|SOCIAL_MEDIA|COURSE_DETAILS|📈|social media analytics sikhayenge~reach engagement kaise samjhe~will you teach social analytics|analytics~reach~engagement~metrics|Analytics mein reach, watch time, saves, clicks, leads aur conversion ko goal ke context mein samjha jaata hai. Likes cute hain, direction metrics dete hain 📊|Social analytics looks at reach, watch time, saves, clicks, leads and conversions in the context of the goal.|DEMO
digital-marketing|DIGITAL_MARKETING|COURSE_DETAILS|📢|digital marketing kya hai~digital marketing sikhna hai~what is digital marketing|digital~marketing~online~business|Digital marketing content, SEO, ads, email, social media, analytics aur conversion ka combined system hai. Sirf post dalna trailer hai 🎬|Digital marketing combines content, SEO, advertising, email, social media, analytics and conversion systems.|DEMO
meta-ads|DIGITAL_MARKETING|COURSE_DETAILS|📱|facebook instagram ads sikhayenge~meta ads kaise chalaye~are meta ads covered|meta~facebook~instagram~ads|Meta Ads mein objective, audience, creative, tracking aur optimisation cover hote hain. Boost button se duniya chalti to media buyers holiday par hote 😄|Meta Ads involves objectives, audiences, creative, tracking and optimisation.|DEMO
google-ads|DIGITAL_MARKETING|COURSE_DETAILS|🔎|google ads sikhayenge~search ads kaise chalaye~are google ads covered|google~ads~search~campaign|Google Ads mein search intent, keywords, ads, landing pages aur conversion tracking important hain. Click kharidna easy, profitable click banana skill hai 🎯|Google Ads focuses on search intent, keywords, ads, landing pages and conversion tracking.|DEMO
seo|DIGITAL_MARKETING|COURSE_DETAILS|🔍|seo sikhayenge~website rank kaise kare~is seo covered|seo~rank~website~search|SEO mein technical health, search intent, useful content, on-page structure aur authority build karna hota hai. Ranking instant noodles nahi - consistent cooking hai 😄|SEO covers technical health, search intent, useful content, on-page structure and authority building.|DEMO
email-whatsapp-marketing|DIGITAL_MARKETING|COURSE_DETAILS|💌|whatsapp marketing sikhayenge~email marketing kaise kare~are email and whatsapp marketing covered|email~whatsapp~message~marketing|Email aur WhatsApp marketing mein consent, segmentation, useful messages, follow-up aur measurement zaroori hain. Har din buy now bhejna relationship nahi, alarm hai 😄|Email and WhatsApp marketing require consent, segmentation, useful messages, follow-up and measurement.|DEMO
funnel-lead-generation|DIGITAL_MARKETING|COURSE_DETAILS|🎯|lead generation sikhayenge~sales funnel kaise banaye~is funnel building covered|lead~funnel~conversion~sales|Lead funnel attention se enquiry, qualification, follow-up aur conversion tak ka journey design karta hai. Lead ko map chahiye, maze nahi 🎯|A lead funnel designs the journey from attention to enquiry, qualification, follow-up and conversion.|DEMO
ai-career-scope|CAREER|COURSE_DISCOVERY|🚀|ai ka career scope kya hai~ai seekhne ka future hai~what is the career scope of ai|ai~career~scope~future|AI literacy design, marketing, content, operations aur business roles mein useful hoti ja rahi hai. Best scope unka hai jo AI ko real problem-solving skill ke saath combine karte hain 🚀|AI literacy is increasingly useful across design, marketing, content, operations and business roles, especially with real problem-solving skills.|GOAL
design-career-scope|CAREER|COURSE_DISCOVERY|🎨|graphic design me career hai~designer ka scope kya hai~what is the career scope in design|design~career~scope~designer|Design ka scope branding, social media, advertising, UI/UX, content aur product teams mein hai. Tool chalana entry hai; visual thinking real advantage hai 🎨|Design careers span branding, social media, advertising, UI/UX, content and product teams; visual thinking matters beyond tools.|GOAL
editing-career-scope|CAREER|COURSE_DISCOVERY|🎬|video editing me career hai~editor ka future kya hai~what is the scope of video editing|video~editing~career~editor|Video editing ka scope creators, agencies, brands, films, education aur short-form content mein hai. Footage sabke paas hai; story banana editor ki value hai 🎬|Video-editing careers exist across creators, agencies, brands, films, education and short-form content; storytelling creates the value.|GOAL
marketing-career-scope|CAREER|COURSE_DISCOVERY|📈|digital marketing me career hai~marketing ka future kya hai~what is the career scope in digital marketing|marketing~career~scope~digital|Digital marketing ka scope content, SEO, ads, analytics, influencer, CRM aur growth roles mein hai. Creative plus data ka combo powerful hai 📈|Digital-marketing careers include content, SEO, advertising, analytics, influencer, CRM and growth roles.|GOAL
job-roles|CAREER|COURSE_DISCOVERY|💼|course ke baad kaun si job milegi~ai design marketing job roles kya hai~which job roles can i target|job~roles~career~position|Skills ke basis par AI content creator, graphic designer, video editor, social-media executive, performance marketer, creative strategist ya automation assistant jaise roles target kiye ja sakte hain.|Depending on skills, learners may target roles such as AI content creator, graphic designer, video editor, social-media executive, performance marketer, creative strategist or automation assistant.|GOAL
salary-job-guarantee|CAREER|COURSE_DETAILS|🛡️|salary kitni milegi~job guarantee hai~is salary or placement guaranteed|salary~job~guarantee~placement|Salary, job ya income guarantee promise nahi ki jaati. Outcome skill depth, portfolio, communication, market aur practice par depend karta hai - shortcut ka poster achha hota hai, result nahi 😄|Salary, job or income is not guaranteed; outcomes depend on skill depth, portfolio, communication, the market and practice.|CALL
freelancing-start|FREELANCING|COURSE_DISCOVERY|🧑‍💻|freelancing kaise start kare~beginner freelancer kaise bane~how do i start freelancing|freelancing~start~beginner~service|Freelancing start karne ke liye ek clear service, 3-5 strong samples, simple offer aur daily outreach chahiye. Logo se pehle client problem choose kijiye 🎯|Freelancing starts with a clear service, several strong samples, a simple offer and consistent outreach.|GOAL
client-finding|FREELANCING|COURSE_DETAILS|🔎|freelancing clients kaise mile~client finding sikhayenge~how can i find freelance clients|client~find~outreach~freelance|Clients portfolio, referrals, targeted outreach, communities aur marketplaces se mil sakte hain. Hi work se better hai problem-specific message 😉|Clients can come from portfolios, referrals, targeted outreach, communities and marketplaces.|DEMO
pricing|FREELANCING|COURSE_DETAILS|💰|freelancing price kaise set kare~service charge kitna rakhe~how should i price my freelance work|pricing~charge~rate~freelance|Pricing scope, complexity, time, revisions aur client value ke basis par set hoti hai. Sirf hours nahi - outcome bhi bill mein bolta hai 💼|Pricing should consider scope, complexity, time, revisions and client value, not only hours worked.|DEMO
proposal|FREELANCING|COURSE_DETAILS|📄|client proposal kaise banaye~proposal writing sikhayenge~how do i write a freelance proposal|proposal~client~scope~deliverables|Strong proposal mein problem, solution, deliverables, timeline, revisions aur next step clear hote hain. Fancy PDF se pehle clear promise chahiye ✅|A strong proposal clearly states the problem, solution, deliverables, timeline, revisions and next step.|DEMO
freelance-portfolio|FREELANCING|COURSE_DETAILS|📁|freelance portfolio kaise banaye~portfolio me kya dale~how do i build a freelance portfolio|portfolio~samples~work~freelance|Portfolio mein best relevant work, process, before-after aur result dikhaiye. 50 average samples se 5 focused samples better hote hain 📁|A portfolio should show relevant work, process, before-and-after examples and results; a few focused samples beat many average ones.|DEMO
international-clients|FREELANCING|COURSE_DETAILS|🌍|foreign clients kaise mile~international freelancing sikhayenge~how do i get international clients|international~foreign~client~global|International clients ke liye clear communication, niche portfolio, professional process aur reliable delivery important hai. Time zone alag, professionalism universal 🌍|International clients value clear communication, a niche portfolio, professional processes and reliable delivery.|DEMO
ai-for-business|BUSINESS_AI|COURSE_DISCOVERY|🏢|business me ai kaise use kare~ai se business grow kaise kare~how can ai help my business|business~ai~growth~operations|AI research, content, customer support, lead follow-up, reporting aur internal productivity mein help kar sakta hai. Tool se pehle business bottleneck identify kijiye 🎯|AI can support research, content, customer service, lead follow-up, reporting and internal productivity; start with the bottleneck.|GOAL
business-automation|BUSINESS_AI|COURSE_DETAILS|⚙️|business automation sikhayenge~workflow automate kaise kare~is business automation covered|business~automation~workflow~automate|Business automation repetitive steps ko connect karke time aur errors kam karti hai. Advanced automation AI Business Growth Architect Program mein depth se cover hoti hai ⚙️|Business automation connects repetitive steps to save time and reduce errors; advanced automation is covered in the business-focused program.|DEMO
chatbot|BUSINESS_AI|COURSE_DETAILS|🤖|chatbot banana sikhayenge~whatsapp chatbot course hai~is chatbot building included|chatbot~whatsapp~bot~assistant|Chatbots aur knowledge assistants AI Business Growth Architect Program mein cover hote hain. Bot ka goal reply dena nahi - sahi next action dilana hai 🤖|Chatbots and knowledge assistants are covered in the AI Business Growth Architect Program, with a focus on useful next actions.|DEMO
voice-ai|BUSINESS_AI|COURSE_DETAILS|📞|voice ai sikhayenge~calling agent banana hai~is voice ai included|voice~calling~agent~ai|Voice AI aur calling-agent systems business-focused program mein cover hote hain. Consent, clear scripts aur human handover essential hain 📞|Voice AI and calling-agent systems are covered in the business-focused program, with consent, scripts and human handover as essentials.|DEMO
crm-followup|BUSINESS_AI|COURSE_DETAILS|📋|crm sikhayenge~lead follow up automate kaise kare~is crm and lead follow up covered|crm~lead~follow~customer|CRM lead data, stage, notes aur follow-up ko organised rakhta hai. Memory achhi cheez hai, system better hai 😄|CRM systems organise lead data, stages, notes and follow-up so sales work does not depend on memory alone.|DEMO
agency-service-business|BUSINESS_AI|COURSE_DISCOVERY|🚀|ai agency kaise start kare~service business banana sikhayenge~how do i start an ai service agency|agency~service~business~offer|AI service business ke liye niche, clear offer, proof, delivery process aur lead system chahiye. Sab kuch karte hain usually customer ko kuch samajh nahi aata 😄|An AI service business needs a niche, clear offer, proof, a delivery process and a lead system.|CALL
beginner|ELIGIBILITY|ELIGIBILITY|✅|beginner join kar sakta hai~mujhe kuch nahi aata~is this suitable for beginners|beginner~basic~nothing~start|Haan, beginner join kar sakte hain. Learning basics se practical steps tak move karti hai - pehle din se expert hone ka pressure cancel ✅|Yes, beginners can join; learning moves from basics to practical steps.|DEMO
nontechnical|ELIGIBILITY|ELIGIBILITY|🙌|non technical join kar sakta hai~commerce arts student ai seekh sakta hai~can a non technical learner join|nontechnical~commerce~arts~background|Haan, non-technical, commerce ya arts background wale learners bhi join kar sakte hain. Goal aur practice degree-stream se zyada matter karte hain 🙌|Yes, learners from non-technical, commerce or arts backgrounds can join; goals and practice matter greatly.|DEMO
coding|ELIGIBILITY|ELIGIBILITY|👨‍💻|coding aana zaruri hai~without coding ai seekh sakte hain~is coding required|coding~programming~required~without|Become AI Expert ke liye pehle se coding compulsory nahi hai. AI se dosti ke liye coding ka rishta mandatory nahi 😄|Prior coding is not compulsory for Become AI Expert.|DEMO
english|ELIGIBILITY|ELIGIBILITY|🗣️|english weak hai join kar sakta hu~class hindi me hogi~can i join with weak english|english~hindi~hinglish~language|Learning Hindi aur Hinglish-friendly rakhi jaati hai. Basic tool terms English mein honge, unhe simple language mein explain kiya jaayega 🗣️|Learning is Hindi and Hinglish-friendly, with common English tool terms explained simply.|DEMO
device|ELIGIBILITY|ELIGIBILITY|💻|mobile se class kar sakte hain~laptop compulsory hai~can i learn on a phone|mobile~laptop~device~phone|Live class mobile ya laptop se join ho sakti hai. Practical design, editing aur assignments ke liye laptop zyada convenient rahega 💻|Live classes can be joined by phone or laptop, though a laptop is more convenient for practical work.|DEMO
age-education|ELIGIBILITY|ELIGIBILITY|🎓|age limit kya hai~qualification kya chahiye~what age or qualification is required|age~qualification~education~eligible|Suitability age se zyada learning goal, basic device use aur live classes attend karne ki ability par depend karti hai. Age aur education share kijiye, team fit confirm karegi.|Suitability depends more on learning goals, device use and live-class availability; share the age and education level for confirmation.|GOAL
online-offline|DELIVERY|BATCH_SCHEDULE|💻|class online hai ya offline~ghar se class kar sakte hain~are classes online or offline|online~offline~class~home|Classes live online hoti hain, isliye aap ghar se mobile ya laptop par join kar sakte hain. Travel zero, learning full 💻|Classes are live online, so you can join from home using a phone or laptop.|DEMO
duration|DELIVERY|BATCH_SCHEDULE|⏳|course kitne time ka hai~duration kya hai~how long is the program|duration~weeks~months~long|Become AI Expert program 10 weeks ka hai; business-focused program 10-12 weeks ka planned hai. Exact active batch masterclass mein confirm hoga ⏳|Become AI Expert runs for 10 weeks, while the business-focused program is planned for 10-12 weeks; confirm the active batch.|DEMO
timing|DELIVERY|BATCH_SCHEDULE|🕘|class timing kya hai~kitne baje class hogi~what are the class timings|timing~time~baje~schedule|Become AI Expert ki planned timing 8 PM se 10 PM IST hai, week mein 3 live classes. Active batch timing registration se pehle confirm hogi 🕘|The planned Become AI Expert schedule is 8 PM to 10 PM IST with three live classes per week; confirm the active batch.|DEMO
recordings|DELIVERY|BATCH_SCHEDULE|🎬|recording milegi~class miss ho jaye to~will recordings be provided|recording~miss~recorded~catchup|Core learning live online hai. Recording ya catch-up availability active batch policy ke according confirm hogi - promise wahi jo verify ho ✅|Core learning is live online; recording or catch-up availability is confirmed according to the active batch policy.|DEMO
assignments-support|DELIVERY|COURSE_DETAILS|📝|assignments milenge~doubt support hoga~are assignments and doubt support included|assignment~doubt~support~practice|Program practical tasks, guided practice aur batch-support process par focused hai. Skill video dekhne se nahi, kaam karne se pakki hoti hai 💪|The program focuses on practical tasks, guided practice and batch support.|DEMO
certificate|DELIVERY|CERTIFICATE|🏅|certificate milega~certificate valid hai~will i receive a certificate|certificate~certification~completion~valid|Applicable completion aur verification requirements poori hone ke baad digital program-completion certificate issue hota hai 🏅|A digital program-completion certificate is issued after the applicable completion and verification requirements are met.|DEMO
demo|CONVERSION|DEMO_CLASS|🎓|demo class chahiye~masterclass link bhejo~how can i join the free masterclass|demo~masterclass~free~link|Free masterclass mein course roadmap, learning outcomes, class process aur next step clear hoga. Trailer useful hai - decision aur useful ho jaata hai 🎓|The free masterclass explains the roadmap, learning outcomes, class process and next step.|DEMO
fees|CONVERSION|FEES|ℹ️|fees kya hai~course price kitna hai~what is the course fee|fee~fees~price~cost|Fee aur current offer ki verified details free demo aur masterclass process mein explain ki jaati hain. Pehle fit samajhiye, phir figure ✅|Verified fee and current-offer details are explained through the free demo and masterclass process.|DEMO
discount-emi|CONVERSION|FEES|💳|discount milega~emi available hai~is there a discount or payment plan|discount~emi~offer~installment|Current offer ya payment-plan availability admission cycle ke according counsellor confirm karega. Guess se better verified deal 💳|Current offers or payment-plan availability are confirmed by a counsellor for the active admission cycle.|DEMO
next-batch|CONVERSION|BATCH_SCHEDULE|📅|next batch kab start hoga~seat available hai~when does the next batch start|next~batch~start~seat|Batch start date aur seat status live change ho sakte hain. Free masterclass registration ke baad team current update confirm karegi 📅|Batch dates and seat availability can change; the team confirms the current update after masterclass registration.|DEMO
admission|CONVERSION|ENROLLMENT|📝|admission kaise hoga~course join karna hai~how do i enrol|admission~join~enrol~registration|Admission free masterclass registration se start hota hai; uske baad team course fit, batch aur verified next step guide karti hai 📝|Admission starts with masterclass registration, after which the team guides course fit, batch and the verified next step.|DEMO
call-request|CONVERSION|COUNSELOR_REQUEST|📞|mujhe call chahiye~counsellor se baat karni hai~please arrange a counsellor call|call~counsellor~talk~contact|Bilkul. Short counselling call par course fit aur next step clear ho jayega. Confirm karne ke liye YES CALL reply kijiye 📞|A short counselling call can clarify course fit and the next step. Reply YES CALL to confirm.|CALL
`;

function parseTopic(line: string): IndustryReplyTopic {
  const [id, category, intent, emoji, rawQuestions, rawKeywords, hinglish, en, action] = line.split("|");
  const questions = rawQuestions.split("~") as [string, string, string];
  return {
    id,
    category,
    intent: intent as AgentIntent,
    emoji,
    questions,
    keywords: rawKeywords.split("~"),
    answer: { en, hinglish },
    action: action as ConversionAction,
    minScore: 0.5,
  };
}

export const INDUSTRY_REPLY_TOPICS: readonly IndustryReplyTopic[] = RAW_TOPICS
  .trim()
  .split("\n")
  .map((line) => parseTopic(line.trim()));

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-IN")
    .replace(/offilne|ofline/g, "offline")
    .replace(/onine/g, "online")
    .replace(/cource|corse/g, "course")
    .replace(/grafhic|grapic/g, "graphic")
    .replace(/vedio/g, "video")
    .replace(/dizain|designe/g, "design")
    .replace(/markting/g, "marketing")
    .replace(/frilancing|freelacing/g, "freelancing")
    .replace(/caht/g, "chat")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return Array.from(new Set(normalize(value).split(" ").filter((token) => token.length > 1)));
}

function languageForQuery(query: string): AgentLanguage {
  if (/[\u0900-\u097F]/.test(query)) return "hi";
  return /\b(bhai|sir|ji|kya|hai|hain|kaise|kab|kitna|kitni|mujhe|chahiye|kar|sakta|sakti|mile|milega|batao|jaruri|aana|join|seekh|sikh|hoga|hogi)\b/i.test(query)
    ? "hinglish"
    : "en";
}

function validMasterclassUrl(): string | null {
  const value = process.env.SIKHADENGE_MASTERCLASS_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function actionText(action: ConversionAction, language: AgentLanguage): string | null {
  const hinglish = language !== "en";
  if (action === "NONE") return null;
  if (action === "GOAL") {
    return hinglish
      ? "🎯 Aap student, job, freelancing ya business mein se kis goal par focus kar rahe hain?"
      : "🎯 Are you focused on study, a job, freelancing or business?";
  }
  if (action === "CALL") {
    return hinglish
      ? "📞 Serious guidance ke liye YES CALL reply kijiye."
      : "📞 Reply YES CALL for focused guidance from a counsellor.";
  }
  const url = validMasterclassUrl();
  if (url) {
    return hinglish
      ? `🎓 Complete roadmap ke liye free masterclass join kijiye: ${url}`
      : `🎓 Join the free masterclass for the complete roadmap: ${url}`;
  }
  return hinglish
    ? "🎓 Free masterclass link ke liye DEMO reply kijiye."
    : "🎓 Reply DEMO to receive the free masterclass link.";
}

function topicVariants(entry: IndustryReplyTopic): string[] {
  return entry.questions.flatMap((question) => PREFIXES.map((prefix) => `${prefix}${question}`.trim()));
}

export const INDUSTRY_REPLY_TOPIC_COUNT = INDUSTRY_REPLY_TOPICS.length;
export const INDUSTRY_REPLY_VARIANT_COUNT = INDUSTRY_REPLY_TOPICS.reduce(
  (count, entry) => count + topicVariants(entry).length,
  0,
);

function scoreTopic(query: string, entry: IndustryReplyTopic): number {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  if (!normalizedQuery || queryTokens.length === 0) return 0;
  let phraseScore = 0;
  let tokenScore = 0;
  for (const variant of topicVariants(entry)) {
    const normalizedVariant = normalize(variant);
    if (normalizedQuery === normalizedVariant) phraseScore = Math.max(phraseScore, 1);
    else if (
      normalizedQuery.length >= 7 &&
      (normalizedQuery.includes(normalizedVariant) || normalizedVariant.includes(normalizedQuery))
    ) {
      phraseScore = Math.max(phraseScore, 0.93);
    }
    const variantTokens = tokens(variant);
    const matched = variantTokens.filter((token) => queryTokens.includes(token)).length;
    tokenScore = Math.max(tokenScore, matched / Math.max(variantTokens.length, queryTokens.length, 1));
  }
  const keywordHits = entry.keywords.filter((keyword) => normalizedQuery.includes(normalize(keyword))).length;
  const keywordScore = keywordHits / Math.max(2, Math.min(4, entry.keywords.length));
  if (phraseScore === 0 && keywordHits === 0) return 0;
  return Math.min(1, phraseScore * 0.66 + tokenScore * 0.23 + keywordScore * 0.11);
}

function renderTopic(entry: IndustryReplyTopic, language: AgentLanguage): string {
  const answer = language === "en" ? entry.answer.en : entry.answer.hinglish;
  const cta = actionText(entry.action, language);
  return cta ? `${entry.emoji} ${answer}\n\n${cta}` : `${entry.emoji} ${answer}`;
}

export function searchIndustrySalesHub(query: string, limit = 2): AgentKnowledgeReference[] {
  const language = languageForQuery(query);
  return INDUSTRY_REPLY_TOPICS.map((entry) => ({ entry, score: scoreTopic(query, entry) }))
    .filter(({ entry, score }) => score >= entry.minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 4)))
    .map(({ entry, score }) => ({
      chunkId: `industry-sales-hub:${entry.id}`,
      documentId: "sikhadenge-industry-sales-reply-hub-v1",
      title: "SikhaDenge Industry Sales Reply Hub",
      heading: entry.questions[0],
      content: renderTopic(entry, language),
      score: Number(Math.max(0.9, score).toFixed(4)),
    }));
}
