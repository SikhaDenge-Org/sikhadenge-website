export type InboxConversationSummary = {
  id: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    email: string | null;
  };
  status: string;
  agentMode: string;
  unreadCount: number;
  source: string | null;
  lastMessageAt: string | null;
  lastMessage: {
    text: string | null;
    type: string;
    direction: string;
    timestamp: string;
  } | null;
  lead: {
    stage: string;
    temperature: string;
    score: number;
    occupation: string | null;
    experienceLevel: string | null;
    goal: string | null;
    interestedCourse: string | null;
    joiningTimeline: string | null;
    classAvailability: string | null;
    feeUnderstood: boolean;
    counselorRequested: boolean;
    nextFollowUpAt: string | null;
  } | null;
  assignee: {
    id: string;
    name: string;
  } | null;
};

export type InboxMessage = {
  id: string;
  metaMessageId: string | null;
  direction: string;
  actor: string;
  type: string;
  status: string;
  text: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  filename: string | null;
  aiConfidence: number | null;
  messageTimestamp: string;
};

export type InboxConversationDetail = InboxConversationSummary & {
  campaign: string | null;
  currentIntent: string | null;
  detectedLanguage: string | null;
  aiConfidence: number | null;
  aiSummary: string | null;
  serviceWindowExpiresAt: string | null;
  messages: InboxMessage[];
  tags: Array<{ id: string; name: string; color: string | null }>;
};
