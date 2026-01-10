
import type { AgentActivitySummary, AgentGroupStat, Ticket, TicketWithConversations, Group, PieChartSegment } from '../types.ts';

export const ALLOWED_EMAILS = new Set([
    'adrian@ecomplete.co.za', 'daine@ecomplete.co.za', 'kaye-lynne@ecomplete.co.za',
    'luvuyo@ecomplete.co.za', 'malika@ecomplete.co.za', 
    'nureesa@ecomplete.co.za', 'taswell@ecomplete.co.za', 'alexander@ecomplete.co.za',
    'zakiera@ecomplete.co.za', 'kathleen@ecomplete.co.za' ,'aksel@ecomplete.co.za',
]);

export const CATEGORY_COLORS: {[key: string]: string} = {
    'Shipments': '#3B82F6', // blue-500
    'Returns': '#10B981', // green-500
    'Refunds': '#EF4444', // red-500
    'Exchanges': '#EAB308', // yellow-500
    'Incorrect items': '#F97316', // orange-500
    'Damages/defects': '#EC4899', // pink-500
    'Discount/Voucher': '#6366F1', // indigo-500
    'Stock/product': '#A855F7', // purple-500
    'Spam': '#6B7280', // gray-500
    'Other': '#14B8A6' // teal-500
};

// Consistent Group Colors
export const GROUP_COLOR_MAPPING: {[key: string]: string} = {
    "Diesel": "#EF4444", // Red
    "Hurley": "#3B82F6", // Blue
    "Jeep": "#10B981", // Emerald
    "Reebok": "#F59E0B", // Amber
    "Superdry": "#8B5CF6", // Violet
    "Levi's": "#EC4899", // Pink
    "Pick n Pay": "#6366F1", // Indigo
    "Bounty": "#14B8A6", // Teal
    "Other": "#9CA3AF" // Gray
};

export const getGroupColor = (groupName: string): string => {
    // Try exact match
    if (GROUP_COLOR_MAPPING[groupName]) return GROUP_COLOR_MAPPING[groupName];
    
    // Try partial match
    const foundKey = Object.keys(GROUP_COLOR_MAPPING).find(key => groupName.includes(key));
    if (foundKey) return GROUP_COLOR_MAPPING[foundKey];

    // Fallback deterministic color generation
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) {
        hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

// Helper for South Africa Time (GMT+2)
export const toSATime = (dateStr: string | Date): Date => {
    const date = new Date(dateStr);
    return new Date(date.getTime() + (2 * 60 * 60 * 1000));
};

const formatLocalDate = (d: Date) => {
    // This is timezone-agnostic and will format based on the date object's internal values
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatMinutesToHours = (minutes: number) => {
    if (minutes < 0) minutes = 0;
    const hours = Math.floor(minutes / 60);
    const remainingMins = Math.round(minutes % 60);
    return `${hours}h ${remainingMins}m`;
};

export const formatTimeRange = (min: number, max: number) => {
    return `${formatMinutesToHours(min)} - ${formatMinutesToHours(max)}`;
};

export const cleanGroupName = (name: string) => {
    const cleaned = name
        .replace(/Online South Africa/g, "")
        .replace(/Clothing Online/g, "")
        .replace(/South Africa Online/g, "")
        .trim();
    return (cleaned === 'Unknown' || cleaned === '') ? 'Other' : cleaned;
};

export const cleanGroupMap = (groups: Group[]): Map<number, string> => {
    const map = new Map<number, string>();
    groups.forEach(g => {
        map.set(g.id, cleanGroupName(g.name));
    });
    return map;
}

export const constrainTimeEstimate = (min: number, max: number) => {
    let newMax = max;
    if (newMax > min * 1.5) {
        newMax = Math.ceil(min * 1.5);
    }
    if (newMax < min) newMax = min;
    return { min, max: newMax };
};

export const autoCategorizeTicket = (ticket: Ticket): string => {
    const text = (ticket.subject + ' ' + (ticket.description_text || '')).toLowerCase();
    
    if (text.includes('shipping') || text.includes('delivery') || text.includes('courier') || text.includes('tracking') || text.includes('waybill') || text.includes('shipment')) return 'Shipments';
    if (text.includes('return') || text.includes('collection')) return 'Returns';
    if (text.includes('refund') || text.includes('money back') || text.includes('credit')) return 'Refunds';
    if (text.includes('exchange') || text.includes('swap')) return 'Exchanges';
    if (text.includes('wrong item') || text.includes('incorrect') || text.includes('received wrong')) return 'Incorrect items';
    if (text.includes('damaged') || text.includes('broken') || text.includes('defect') || text.includes('faulty')) return 'Damages/defects';
    if (text.includes('code') || text.includes('coupon') || text.includes('voucher') || text.includes('promo') || text.includes('discount')) return 'Discount/Voucher';
    if (text.includes('stock') || text.includes('availability') || text.includes('product info') || text.includes('size')) return 'Stock/product';
    if (text.includes('spam') || text.includes('seo') || text.includes('marketing')) return 'Spam';
    
    return 'Other';
};

export const calculateAllAgentActivity = (
    tickets: TicketWithConversations[],
    agentMap: Map<number, string>,
    startDate: Date,
    endDate: Date,
    groupMap: Map<number, string>
): AgentActivitySummary[] => {
    interface AgentData {
        agentName: string;
        ticketIds: Set<number>; // Tracks tickets the agent has ACTIVELY worked on
        totalMin: number;
        totalMax: number;
        totalResponses: number;
        totalActions: number;
        totalClosed: number;
        dailyStats: Map<string, { totalResponses: number; totalActions: number; totalClosed: number; totalMin: number; totalMax: number }>;
        groupStats: Map<number, { worked: number; closed: number }>;
    }

    const agentActivity = new Map<number, AgentData>();

    for (const [id, name] of agentMap.entries()) {
        agentActivity.set(id, { 
            agentName: name.toUpperCase(), 
            ticketIds: new Set(), 
            totalMin: 0, 
            totalMax: 0, 
            totalResponses: 0, 
            totalActions: 0, 
            totalClosed: 0,
            dailyStats: new Map(),
            groupStats: new Map()
        });
    }
    
    // Pass 1: Activity & Worked
    tickets.forEach(ticket => {
        const agentsWorked = new Set<number>();
        ticket.conversations.forEach(c => {
            const activityDate = new Date(c.created_at);
            
            // STRICT BOUNDARY CHECK: Ensure activity is actually within the user-selected range in SAST
            if (activityDate >= startDate && activityDate <= endDate) {
                const agentId = c.user_id;
                // Exclude system automations from "Activity"
                const isSystem = (c.body_text || '').toLowerCase().includes('system');
                
                if (agentMap.has(agentId) && agentActivity.has(agentId) && !isSystem) {
                    agentsWorked.add(agentId);
                    const agentData = agentActivity.get(agentId)!;
                    agentData.ticketIds.add(ticket.id);
                    
                    const activityDateSA = toSATime(c.created_at);
                    const dateStr = formatLocalDate(activityDateSA);
                    
                    if (!agentData.dailyStats.has(dateStr)) {
                        agentData.dailyStats.set(dateStr, { totalResponses: 0, totalActions: 0, totalClosed: 0, totalMin: 0, totalMax: 0 });
                    }
                    const dailyData = agentData.dailyStats.get(dateStr)!;
                    const bodyText = c.body_text?.trim().toLowerCase() || '';
                    let minAdd = 0; 
                    let maxAdd = 0;

                    if (c.private) {
                        agentData.totalActions++;
                        dailyData.totalActions++;
                        minAdd = bodyText.includes('marked as spam') ? 1 : 2;
                        maxAdd = bodyText.includes('marked as spam') ? 2 : 3;
                    } else {
                        agentData.totalResponses++;
                        dailyData.totalResponses++;
                        minAdd = bodyText.length < 50 ? 3 : 5;
                        maxAdd = bodyText.length < 50 ? 4 : 7;
                    }
                    
                    agentData.totalMin += minAdd;
                    agentData.totalMax += maxAdd;
                }
            }
        });

        agentsWorked.forEach(aid => {
             const ad = agentActivity.get(aid)!;
             if (!ad.groupStats.has(ticket.group_id)) ad.groupStats.set(ticket.group_id, { worked: 0, closed: 0 });
             ad.groupStats.get(ticket.group_id)!.worked++;
        });
    });

    // Pass 2: Closed
    tickets.forEach(ticket => {
        if (ticket.status === 4 || ticket.status === 5) {
            const closedAtStr = ticket.stats?.closed_at || ticket.stats?.resolved_at || ticket.updated_at;
            const closedAt = new Date(closedAtStr);
            if (closedAt >= startDate && closedAt <= endDate) {
                 const closerId = ticket.responder_id;
                 
                 if (agentMap.has(closerId) && agentActivity.has(closerId)) {
                     const ad = agentActivity.get(closerId)!;
                     
                     // IMPORTANT FIX: Only count closure if the agent has actually contributed to the ticket.
                     // This filters out System Automations that assign and close tickets without agent intervention.
                     if (ad.ticketIds.has(ticket.id)) {
                         ad.totalClosed++;
                         const closedAtSA = toSATime(closedAtStr);
                         const dateStr = formatLocalDate(closedAtSA);

                         // Add a small time estimate for the action of closing a ticket
                         const minAdd = 1;
                         const maxAdd = 2;
                         ad.totalMin += minAdd;
                         ad.totalMax += maxAdd;

                         if (!ad.dailyStats.has(dateStr)) {
                              ad.dailyStats.set(dateStr, { totalResponses: 0, totalActions: 0, totalClosed: 1, totalMin: minAdd, totalMax: maxAdd });
                         } else {
                              const dailyData = ad.dailyStats.get(dateStr)!;
                              dailyData.totalClosed++;
                              dailyData.totalMin += minAdd;
                              dailyData.totalMax += maxAdd;
                         }

                         if (!ad.groupStats.has(ticket.group_id)) ad.groupStats.set(ticket.group_id, { worked: 0, closed: 0 });
                         ad.groupStats.get(ticket.group_id)!.closed++;
                     }
                 }
            }
        }
    });
    
    const totalTicketsHandledAcrossAgents = Array.from(agentActivity.values()).reduce((sum, data) => sum + data.ticketIds.size, 0);

    return Array.from(agentActivity.entries())
        .map(([agentId, data]) => {
            const totalAgentActivity = data.totalResponses + data.totalActions;
            const ratio = totalTicketsHandledAcrossAgents > 0 
                ? ((data.ticketIds.size / totalTicketsHandledAcrossAgents) * 100).toFixed(1) + '%' 
                : '0%';

            const constrainedDaily = Array.from(data.dailyStats.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, stats]) => {
                    const c = constrainTimeEstimate(stats.totalMin, stats.totalMax);
                    return {
                        date,
                        totalResponses: stats.totalResponses,
                        totalActions: stats.totalActions,
                        totalClosed: stats.totalClosed,
                        totalAgentActivity: stats.totalResponses + stats.totalActions,
                        estimatedTimeRange: formatTimeRange(c.min, c.max),
                        totalMin: c.min,
                        totalMax: c.max
                    };
                });
            
            const cTotal = constrainTimeEstimate(data.totalMin, data.totalMax);
            const totalForAgent = data.ticketIds.size;
            const agentGroupStats: AgentGroupStat[] = Array.from(data.groupStats.entries())
                .map(([gid, stats]) => ({
                    groupName: groupMap.get(gid) || 'Other',
                    total: stats.worked + stats.closed,
                    worked: stats.worked,
                    closed: stats.closed,
                    percent: totalForAgent > 0 ? ((stats.worked/totalForAgent) * 100).toFixed(1) + '%' : '0%'
                }))
                .sort((a,b) => b.worked - a.worked);

            return {
                agentId,
                agentName: data.agentName,
                ticketCount: data.ticketIds.size,
                estimatedTimeRange: formatTimeRange(cTotal.min, cTotal.max),
                totalResponses: data.totalResponses,
                totalActions: data.totalActions,
                totalClosed: data.totalClosed,
                totalAgentActivity: totalAgentActivity,
                activityRatio: ratio,
                dailyBreakdown: constrainedDaily,
                groupStats: agentGroupStats
            };
        })
        .filter(summary => summary.ticketCount > 0 || summary.totalClosed > 0)
        .sort((a, b) => b.ticketCount - a.ticketCount);
};
