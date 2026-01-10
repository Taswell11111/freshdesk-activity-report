
import React, { useState, useRef, useMemo } from 'react';
import type { TicketWithConversations, ActivityReport, Agent, Conversation, DailyAgentActions, AgentActionBlock, TimeEntry } from '../types.ts';
import { summarizeTicketActivity } from '../services/geminiService.ts';
import { getCachedAnalysis, cacheAnalysis } from '../services/cacheService.ts';
import TicketStatList from './TicketStatList.tsx';
import Spinner from './Spinner.tsx';
import { toSATime } from '../utils/dateUtils.ts';

interface AgentTicketListProps {
    tickets: TicketWithConversations[];
    agentName: string;
    agentId: number;
    dateRange: { from: string; to: string };
    groupMap: Map<number, string>;
    agents: Agent[];
    onUpdateCategory: (ticketId: number, category: string) => void;
    dateFilter: string | null;
    timeEntries: TimeEntry[];
    onBack: () => void;
}

const MAX_CONTEXT_LENGTH = 30000; // Keep context manageable for the AI

// ... (buildAgentDailyActionBlocksForTicket helper remains the same, omitted for brevity but preserved in compilation) ...
const buildAgentDailyActionBlocksForTicket = (
    ticket: TicketWithConversations,
    agentId: number,
    startDate: Date,
    endDate: Date,
    dateFilter: string | null
): DailyAgentActions[] => {
    const dailyActionsMap = new Map<string, { conversations: Conversation[] }>();

    ticket.conversations.forEach(c => {
        const activityDateSA = toSATime(c.created_at);
        const dateStr = activityDateSA.toISOString().split('T')[0];

        // Filter by agent and date range (and optional daily filter)
        if (c.user_id !== agentId || !(activityDateSA >= startDate && activityDateSA <= endDate)) {
            return;
        }
        if (dateFilter && dateStr !== dateFilter) {
            return;
        }

        // Exclude specific system messages from AI analysis context as well
        const bodyTextLower = c.body_text?.toLowerCase() || '';
        if (
            bodyTextLower.includes('system executed an automation') ||
            bodyTextLower.includes('system performed automatic ticket assignment')
        ) {
            return;
        }

        if (!dailyActionsMap.has(dateStr)) {
            dailyActionsMap.set(dateStr, { conversations: [] });
        }
        dailyActionsMap.get(dateStr)!.conversations.push(c);
    });

    const result: DailyAgentActions[] = [];
    Array.from(dailyActionsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, { conversations }]) => {
        const actionBlocks: AgentActionBlock[] = [];
        let currentBlock: AgentActionBlock | null = null;

        // Sort conversations by creation time within the day
        conversations.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        conversations.forEach((c, idx) => {
            const bodyTextLower = c.body_text?.toLowerCase() || '';
            const isMerge = bodyTextLower.includes('merged tickets');
            const isSpam = bodyTextLower.includes('marked as spam');
            const isStatusChange = bodyTextLower.includes('status changed from'); // Heuristic for status change

            // Start a new block if it's the first conversation, or a significant action/time gap
            // A "significant" action might be a merge, spam, or a gap of more than 30 minutes
            const previousConversationTime = idx > 0 ? new Date(conversations[idx - 1].created_at).getTime() : 0;
            const currentConversationTime = new Date(c.created_at).getTime();
            const timeGapExceeded = currentConversationTime - previousConversationTime > 30 * 60 * 1000; // 30 min gap

            if (!currentBlock || isMerge || isSpam || isStatusChange || timeGapExceeded) {
                if (currentBlock) actionBlocks.push(currentBlock);
                currentBlock = {
                    blockNumber: actionBlocks.length + 1,
                    isMerge: false,
                    isSpam: false,
                    isStatusChange: false,
                    publicReplies: [],
                    privateNotesCount: 0,
                };
            }
            if (!currentBlock) return; // Should not happen after initialization

            if (isMerge) currentBlock.isMerge = true;
            if (isSpam) currentBlock.isSpam = true;
            if (isStatusChange) currentBlock.isStatusChange = true; // Mark if any conversation in block indicates status change

            if (c.private) {
                currentBlock.privateNotesCount++;
            } else {
                currentBlock.publicReplies.push({ text: c.body_text, length: c.body_text.length });
            }
        });
        if (currentBlock) actionBlocks.push(currentBlock);
        result.push({ date, actionBlocks });
    });
    return result;
};

const AgentTicketList: React.FC<AgentTicketListProps> = ({ tickets, agentName, agentId, dateRange, groupMap, agents, onUpdateCategory, dateFilter, timeEntries, onBack }) => {
    const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
    const [analyses, setAnalyses] = useState<Map<number, ActivityReport>>(new Map());
    const [analyzingAll, setAnalyzingAll] = useState(false);
    const [progress, setProgress] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);

    // Calculate group breakdown for this specific list of tickets
    const groupBreakdown = useMemo(() => {
        const counts = new Map<string, number>();
        tickets.forEach(t => {
            const gName = groupMap.get(t.group_id) || 'Unknown';
            counts.set(gName, (counts.get(gName) || 0) + 1);
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count desc
            .map(([name, count]) => `[${name}: ${count}]`)
            .join(' ');
    }, [tickets, groupMap]);

    const runAnalysis = async (ticket: TicketWithConversations) => {
        // ... (runAnalysis implementation remains identical, omitted for brevity) ...
        setAnalyzingIds(prev => new Set(prev).add(ticket.id));
        
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const agentMap = new Map<number, string>(agents.map(a => [a.id, a.contact.name]));
            const cachedReport = getCachedAnalysis(ticket.id, agentName, dateRange, ticket.updated_at);
            
            if (cachedReport) {
                setAnalyses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(ticket.id, cachedReport);
                    return newMap;
                });
                setAnalyzingIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
                return;
            }

            const contextRaw = ticket.conversations.map(c => `[${c.created_at}] ${agentMap.get(c.user_id) || 'Unknown'}: ${c.body_text}`).join('\n');
            const context = contextRaw.length > MAX_CONTEXT_LENGTH ? contextRaw.substring(0, MAX_CONTEXT_LENGTH) + "...[TRUNCATED]" : contextRaw;
            
            const sortedConvos = [...ticket.conversations].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const lastMsg = sortedConvos[0];
            const lastAuthor = lastMsg ? (agentMap.get(lastMsg.user_id) || 'Requester') : 'N/A';
            const lastMsgOutside = lastMsg ? new Date(lastMsg.created_at) > new Date(dateRange.to) : false;

            const startDate = toSATime(dateRange.from); startDate.setHours(0,0,0,0);
            const endDate = toSATime(dateRange.to); endDate.setHours(23,59,59,999);

            const dailyAgentActions = buildAgentDailyActionBlocksForTicket(
                ticket,
                agentId,
                startDate,
                endDate,
                dateFilter
            );

            const summaryRaw = await summarizeTicketActivity(context, ticket.created_at, agentName, dateRange, lastAuthor, lastMsgOutside, dailyAgentActions);
            
            const extractTag = (tag: string) => {
                const regex = new RegExp(`<${tag}_START>([\\s\\S]*?)<\/${tag}_END>`, 'i');
                const match = summaryRaw.match(regex);
                return match ? match[1].trim() : 'N/A';
            };

            const report: ActivityReport = {
                ticketId: ticket.id,
                requesterName: ticket.requester?.name || 'N/A',
                agentName: agentName,
                groupName: groupMap.get(ticket.group_id) || 'Other',
                status: ticket.status,
                subject: ticket.subject,
                type: ticket.type,
                category: ticket.category || extractTag('CATEGORY') || 'Other',
                urgency: ticket.priority ? ['Low','Medium','High','Urgent'][ticket.priority-1] : 'N/A',
                lastUpdated: ticket.updated_at,
                lastResponse: lastMsg ? lastMsg.created_at : 'N/A',
                lastResponseTimestamp: lastMsg ? new Date(lastMsg.created_at) : null,
                lastReplyBy: lastAuthor,
                lastResponseAuthorType: lastAuthor === agentName ? 'Agent' : 'Requester',
                lastMessageContent: lastMsg?.body_text?.substring(0, 150) || '',
                agentResponseCount: 0, 
                agentActionCount: 0,
                summary: extractTag('SUMMARY'),
                aiTimeEstimate: extractTag('TIME_ESTIMATE'),
                totalAiTimeEstimate: 'Calculating...', 
                createdAt: ticket.created_at,
                customerSentiment: extractTag('SENTIMENT')
            };
            
            cacheAnalysis(ticket.id, agentName, dateRange, ticket.updated_at, report);
            setAnalyses(prev => {
                const newMap = new Map(prev);
                newMap.set(ticket.id, report);
                return newMap;
            });

        } catch (e) {
            console.error(e);
        } finally {
            if (abortControllerRef.current === controller) {
                setAnalyzingIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
            }
        }
    };

    const handleAnalyzeAll = async () => {
        setAnalyzingAll(true);
        setProgress(0);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        const BATCH_SIZE = 5;
        for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
            const batch = tickets.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(t => runAnalysis(t)));
            setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / tickets.length) * 100)));
        }
        setAnalyzingAll(false);
    };

    const getActualTimeSpent = (ticketId: number) => {
        if (!timeEntries) return '-';
        const entries = timeEntries.filter(t => t.ticket_id === ticketId);
        if (entries.length === 0) return '-';
        
        let totalMinutes = 0;
        entries.forEach(entry => {
            if (entry.time_spent) {
                const [hours, minutes] = entry.time_spent.split(':').map(Number);
                if (!isNaN(hours) && !isNaN(minutes)) {
                    totalMinutes += (hours * 60) + minutes;
                }
            }
        });
        
        if (totalMinutes === 0) return '-';
        
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}h ${m}m`;
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white uppercase">Activity Report: {agentName}</h2>
                    <p className="text-gray-400">
                        {tickets.length} tickets with activity 
                        {dateFilter ? ` on ${dateFilter}` : ` between ${dateRange.from} and ${dateRange.to}`}
                    </p>
                    {/* NEW: Group Breakdown Line */}
                    <p className="text-white text-sm font-mono mt-1 opacity-90">
                        {groupBreakdown}
                    </p>
                </div>
                <div className="flex gap-4">
                     <button onClick={onBack} className="bg-gray-700/80 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded shadow transition-all">Back</button>
                     {analyzingAll ? (
                         <div className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded">
                             <Spinner /> <span className="text-sm text-gray-300">Analysing {progress}%...</span>
                         </div>
                     ) : (
                        <button 
                            onClick={handleAnalyzeAll} 
                            disabled={tickets.length === 0}
                            className="bg-fd-blue hover:bg-blue-600 text-white font-bold py-2 px-4 rounded shadow transition-transform transform active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            Analyse All (AI)
                        </button>
                     )}
                </div>
            </div>

            <TicketStatList 
                tickets={tickets} 
                type="worked" 
                onClose={() => {}} 
                groupMap={groupMap} 
                onUpdateCategory={onUpdateCategory}
                embedded={true}
                extraColumns={[
                    {
                        header: 'Analysis',
                        render: (ticket) => {
                            const report = analyses.get(ticket.id);
                            const isAnalyzing = analyzingIds.has(ticket.id);
                            
                            if (isAnalyzing) return <Spinner message="Analysing..." />;
                            
                            if (report) {
                                const isError = report.summary.includes('Error');
                                return (
                                    <div className="text-xs max-w-xs">
                                        <div className={`font-bold mb-1 ${isError ? 'text-red-400' : 'text-green-400'}`}>
                                            {isError ? 'AI Error' : 'Analyzed'}
                                        </div>
                                        <div className="text-gray-400 line-clamp-3 hover:line-clamp-none cursor-pointer" title={report.summary}>
                                            {report.summary}
                                        </div>
                                    </div>
                                );
                            }
                            
                            return (
                                <button 
                                    onClick={() => runAnalysis(ticket as TicketWithConversations)}
                                    className="text-xs bg-gray-700 hover:bg-gray-600 text-fd-blue px-2 py-1 rounded border border-gray-600"
                                >
                                    Analyse
                                </button>
                            );
                        }
                    },
                    {
                        header: 'AI Est.',
                        render: (ticket) => {
                            const report = analyses.get(ticket.id);
                            if (!report) return <span className="text-gray-500 text-xs">-</span>;
                            const totalEstimateMatch = report.aiTimeEstimate.match(/(\d+h\s*\d+m\s*-\s*\d+h\s*\d+m)/);
                            const displayEstimate = totalEstimateMatch ? totalEstimateMatch[1] : report.aiTimeEstimate.split('\n')[0];

                            return <span className="text-xs font-mono text-gray-300 whitespace-nowrap">{displayEstimate || report.aiTimeEstimate}</span>
                        }
                    },
                    {
                        header: 'Actual Time',
                        render: (ticket) => {
                            const time = getActualTimeSpent(ticket.id);
                            return <span className="text-xs font-bold font-mono text-fd-blue whitespace-nowrap">{time}</span>;
                        }
                    }
                ]}
            />
        </div>
    );
};

export default AgentTicketList;
