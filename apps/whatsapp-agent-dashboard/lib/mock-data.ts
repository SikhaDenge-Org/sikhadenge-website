export type DashboardConversation = {
  id: string;
  name: string;
  phone: string;
  initials: string;
  lastMessage: string;
  time: string;
  unread: number;
  temperature: "Hot" | "Warm" | "Cold";
  aiEnabled: boolean;
  course: string;
  city: string;
  score: number;
  source: string;
  stage: string;
};

export const conversations: DashboardConversation[] = [
  {
    id: "lead-rahul",
    name: "Rahul Sharma",
    phone: "+91 98XXXXXX21",
    initials: "RS",
    lastMessage: "Mujhe freelancing ke liye AI seekhna hai.",
    time: "2 min",
    unread: 2,
    temperature: "Hot",
    aiEnabled: true,
    course: "Become AI Expert",
    city: "Lucknow",
    score: 82,
    source: "Instagram Ad",
    stage: "Qualified",
  },
  {
    id: "lead-neha",
    name: "Neha Verma",
    phone: "+91 87XXXXXX09",
    initials: "NV",
    lastMessage: "Demo class kis din hai?",
    time: "18 min",
    unread: 0,
    temperature: "Warm",
    aiEnabled: true,
    course: "Become AI Expert",
    city: "Delhi",
    score: 61,
    source: "Website",
    stage: "Demo Pending",
  },
  {
    id: "lead-aman",
    name: "Aman Gupta",
    phone: "+91 79XXXXXX44",
    initials: "AG",
    lastMessage: "Counselor se baat karni hai.",
    time: "1 hr",
    unread: 1,
    temperature: "Hot",
    aiEnabled: false,
    course: "AI Business Growth Architect",
    city: "Kanpur",
    score: 76,
    source: "Referral",
    stage: "Human Handoff",
  },
];

export const sampleMessages = [
  {
    id: "m1",
    direction: "inbound" as const,
    body: "Hello, mujhe AI course ke baare mein details chahiye.",
    time: "4:18 PM",
  },
  {
    id: "m2",
    direction: "outbound" as const,
    body: "Namaste Rahul! Aap AI career, freelancing, business ya office productivity mein se kis purpose ke liye seekhna chahte hain?",
    time: "4:18 PM",
    label: "AI Agent",
  },
  {
    id: "m3",
    direction: "inbound" as const,
    body: "Mujhe freelancing start karni hai. Main beginner hoon.",
    time: "4:19 PM",
  },
  {
    id: "m4",
    direction: "outbound" as const,
    body: "Aapke beginner profile aur freelancing goal ke basis par Become AI Expert program suitable hai. Main pehle aapka current profile aur joining timeline confirm kar leta hoon.",
    time: "4:19 PM",
    label: "AI Agent · 94% confidence",
  },
];
