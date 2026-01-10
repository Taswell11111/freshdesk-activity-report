
export interface DebugLog {
    timestamp: string;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    context?: string;
}

export interface Agent {
    id: number;
    contact: {
        name: string;
        email: string;
    };
}

export interface Group {
    id: number;
    name: string;
    description: string;
}

export interface Ticket {
    id: number;
    requester_id: number;
    responder_id: number;
    group_id: number;
    subject: string;
    description_text: string;
    status: number;
    priority: number; // 1-Low, 2-Medium, 3-High, 4-Urgent
    created_at: string;
    updated_at: string;
    type?: string; 
    category?: string; 
    agent_name?: string; 
    requester?: { 
        id: number;
        name: string;
        email: string;
    };
    stats?: { 
        reopened_at: string | null;
        resolved_at: string | null;
        closed_at: string | null;
    };
}

export interface Conversation {
    id: number;
    user_id: number;
    body_text: string;
    created_at: string;
    private: boolean;
    source: number;
}

export interface TimeEntry {
    id: number;
    agent_id: number;
    ticket_id: number;
    time_spent: string; // "hh:mm"
    billable: boolean;
    executed_at: string;
    note: string;
    timer_running: boolean;
}

export interface TicketWithConversations extends Ticket {
    conversations: Conversation[];
}

export interface AgentActionBlock {
    blockNumber: number;
    isMerge: boolean;
    isSpam: boolean;
    isStatusChange: boolean;
    publicReplies: { text: string; length: number }[];
    privateNotesCount: number;
}

export interface DailyAgentActions {
    date: string;
    actionBlocks: AgentActionBlock[];
}

export interface ActivityReport {
    ticketId: number;
    requesterName: string;
    agentName: string;
    groupName: string;
    status: number;
    subject: string;
    type?: string; 
    category?: string;
    urgency?: string;
    lastUpdated: string;
    lastResponse: string;
    lastResponseTimestamp: Date | null;
    lastReplyBy: string; 
    lastResponseAuthorType?: 'Agent' | 'Requester';
    lastMessageContent?: string;
    agentResponseCount: number;
    agentActionCount: number;
    actionDetails?: string[]; 
    formattedActionDetails?: string; 
    summary: string;
    aiTimeEstimate: string;
    totalAiTimeEstimate?: string;
    createdAt: string; 
    customerSentiment?: string;
}

export interface GeminiSummaryResponse {
    summary: string;
    aiTimeEstimate: string;
    outcome: string;
    customerSentiment: string;
    category: string;
}

export interface DailyAgentStats {
    date: string;
    totalResponses: number;
    totalActions: number;
    totalClosed: number;
    totalAgentActivity: number;
    estimatedTimeRange: string;
    totalMin: number; 
    totalMax: number; 
}

export interface AgentGroupStat {
    groupName: string;
    total: number;
    worked: number;
    closed: number;
    percent: string;
}

export interface AgentActivitySummary {
    agentId: number; 
    agentName: string;
    ticketCount: number;
    estimatedTimeRange: string;
    totalResponses: number; 
    totalActions: number; 
    totalClosed: number; 
    totalAgentActivity: number; 
    activityRatio: string; 
    dailyBreakdown: DailyAgentStats[]; 
    groupStats: AgentGroupStat[]; 
}

export interface TicketStatusChoice {
    id: number; 
    label: string; 
}

export interface TicketField {
    id: number;
    name: string;
    label: string;
    choices?: { [key: string]: any } | TicketStatusChoice[]; 
}

export interface TicketGroupStat {
    groupId: number;
    groupName: string;
    count: number;
    percent: string;
    rawPercent: number;
    typeDistribution?: Record<string, number>; // Added for breakdown
}

export interface PieChartSegment {
    name: string;
    value: number;
    percent: number;
    color: string;
}

export interface CategoryStat {
    name: string;
    count: number;
    percent: number;
    color: string;
}

export interface GroupCategoryData {
    groupName: string;
    totalTickets: number;
    segments: PieChartSegment[];
}

export interface DashboardData {
    dateRange: { from: string; to: string };
    agentSummary: AgentActivitySummary[];
    ticketStats: { created: number; closed: number; worked: number; reopened: number; customerResponded: number };
    prevTicketStats: { created: number; closed: number; worked: number; reopened: number; customerResponded: number };
    _24hTicketStats: { created: number; closed: number; worked: number; reopened: number; customerResponded: number };
    ticketsClosedAndCreatedInPeriod: number; // Deprecated but kept for compatibility
    groupStats: {
        created: TicketGroupStat[];
        reopened: TicketGroupStat[];
        closed: TicketGroupStat[];
        worked: TicketGroupStat[];
        ticketsAtPeriodStart: TicketGroupStat[]; 
        ticketsAtPeriodEnd: TicketGroupStat[]; 
    };
    categoryStats: CategoryStat[]; // Deprecated/Unused
    groupCategoryStats: GroupCategoryData[]; // Deprecated/Unused
    ticketLists: {
        created: Ticket[];
        reopened: Ticket[];
        closed: Ticket[];
        worked: TicketWithConversations[];
        customerResponded: TicketWithConversations[];
        prevCreated?: Ticket[];
        prevClosed?: Ticket[];
        active?: Ticket[];
    };
    timeEntries: TimeEntry[];
    ticketsAtPeriodStartCount: number;
    ticketsAtPeriodEndCount: number; 
    reportGeneratedTimestamp: string;
}
