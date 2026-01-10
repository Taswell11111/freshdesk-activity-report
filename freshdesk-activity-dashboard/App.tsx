
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Agent, Group, Ticket, TicketWithConversations, TicketField, DashboardData, TicketGroupStat } from './types.ts';
import { getAgents, getGroups, getTicketsUpdatedInPeriod, getConversations, getTicketFields, getActiveTickets, updateTicket } from './services/freshdeskService.ts';
import { getCachedConversations, cacheConversations } from './services/cacheService.ts';
import { generateDashboardHtmlReport } from './utils/htmlGenerator.ts';
import { calculateAllAgentActivity, cleanGroupMap, ALLOWED_EMAILS, autoCategorizeTicket, toSATime, getGroupColor } from './utils/logicUtils.ts';
import { ACTIVE_TICKET_STATUSES } from './constants.ts';
import Spinner from './components/Spinner.tsx';
import ErrorMessage from './components/ErrorMessage.tsx';
import DateSelectionModal from './components/DateSelectionModal.tsx';
import AgentActivitySummaryTable from './components/AgentActivitySummaryTable.tsx';
import TicketStatList from './components/TicketStatList.tsx';
import AgentTicketList from './components/AgentTicketList.tsx';
import DebugBar from './components/DebugBar.tsx';
import { debugService } from './services/debugService.ts';
import ActivityTimelineChart from './components/ActivityTimelineChart.tsx';
import AgentActivityChart from './components/AgentActivityChart.tsx';
import Modal from './components/Modal.tsx';

// --- Chart Component ---
const DoughnutChart = ({ 
    data, 
    title, 
    showLegend = true, 
    onSegmentClick,
    onCenterClick
}: { 
    data: TicketGroupStat[], 
    title?: string, 
    showLegend?: boolean,
    onSegmentClick: (groupName: string) => void,
    onCenterClick?: () => void
}) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        if (chartInstance.current) {
            chartInstance.current.destroy();
            chartInstance.current = null;
        }

        const validData = data.filter(d => d.count > 0);
        if (validData.length === 0) return;

        const sortedData = [...validData].sort((a, b) => b.count - a.count);
        const labels = sortedData.map(d => d.groupName);
        const values = sortedData.map(d => d.count);
        const typeDistributions = sortedData.map(d => d.typeDistribution);
        
        // Generate colors based on group name using the shared logic
        const backgroundColors = labels.map(label => getGroupColor(label));

        const ctx = chartRef.current.getContext('2d');
        if (ctx) {
            chartInstance.current = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: backgroundColors,
                        borderWidth: 2,
                        borderColor: '#1f2937', // Match bg color for spacing effect
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onHover: (event, chartElement) => {
                        if (event.native && event.native.target) {
                            (event.native.target as HTMLElement).style.cursor = chartElement.length ? 'pointer' : 'default';
                        }
                    },
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const groupName = labels[index];
                            onSegmentClick(groupName);
                        } else if (onCenterClick) {
                            onCenterClick();
                        }
                    },
                    plugins: {
                        legend: {
                            display: showLegend,
                            position: 'right',
                            labels: {
                                color: '#FFFFFF', // Required: White font for legend
                                boxWidth: 10,
                                font: { size: 10 },
                                generateLabels: (chart: Chart) => {
                                    const data = chart.data;
                                    if (!data.labels || !data.datasets[0] || !data.datasets[0].data) return [];
                                    return data.labels.map((label, i) => {
                                        const dataset = data.datasets[0];
                                        const value = dataset.data[i] as number;
                                        const backgroundColor = (dataset.backgroundColor as string[])[i];
                                        return {
                                            text: `${label} [${value}]`,
                                            fillStyle: backgroundColor,
                                            strokeStyle: backgroundColor,
                                            lineWidth: 0,
                                            hidden: !chart.getDataVisibility(i),
                                            index: i,
                                            fontColor: '#FFFFFF'
                                        };
                                    });
                                }
                            }
                        },
                        tooltip: {
                            enabled: true,
                            callbacks: {
                                label: (context: any) => {
                                    const label = context.label || '';
                                    const rawValue = context.raw as number;
                                    const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
                                    const percentage = total > 0 ? ((rawValue / total) * 100).toFixed(1) : '0';
                                    return `${label}: ${rawValue} (${percentage}%)`; 
                                },
                                afterBody: (tooltipItems: any) => {
                                    const dataIndex = tooltipItems[0].dataIndex;
                                    const dist = typeDistributions[dataIndex];
                                    if (!dist) return [];
                                    const lines: string[] = [];
                                    lines.push('--- Types (Sorted) ---');
                                    const sortedTypes = Object.entries(dist).sort((a, b) => b[1] - a[1]);
                                    sortedTypes.forEach(([type, count]) => {
                                        lines.push(`${type}: ${count}`);
                                    });
                                    return lines;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [data, showLegend]);

    return (
        <div className="w-full h-full relative group">
            <canvas ref={chartRef} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            </div>
        </div>
    );
};

function App() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [ticketFields, setTicketFields] = useState<TicketField[]>([]);
    const [tickets, setTickets] = useState<TicketWithConversations[]>([]);
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Cloud Upload State
    const [reportUrl, setReportUrl] = useState<string | null>(null);

    // Global Date Filter for Charts (Timeline & Donuts)
    const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

    // Ticket List Modal State
    const [modalTicketList, setModalTicketList] = useState<Ticket[] | null>(null);
    const [modalType, setModalType] = useState<string | null>(null);

    // Agent Selection States
    const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
    const [selectedAgentDateFilter, setSelectedAgentDateFilter] = useState<string | null>(null);
    const [agentTickets, setAgentTickets] = useState<TicketWithConversations[]>([]);

    const abortControllerRef = useRef<AbortController | null>(null);
    const matrixRef = useRef<HTMLDivElement>(null);

    const groupMap = useMemo(() => cleanGroupMap(groups), [groups]);

    useEffect(() => {
        debugService.enableConsoleProxy();
        const controller = new AbortController();
        const fetchInitialData = async () => {
            try {
                setLoading(true); setLoadingMessage("Connecting to Freshdesk...");
                const [agentsData, groupsData, fieldsData] = await Promise.all([
                    getAgents(controller.signal), getGroups(controller.signal), getTicketFields(controller.signal)
                ]);
                const filteredAgents = agentsData.filter(agent => ALLOWED_EMAILS.has(agent.contact.email.toLowerCase()));
                setAgents(filteredAgents); setGroups(groupsData); setTicketFields(fieldsData);
            } catch (err: any) {
                if (err.name !== 'AbortError') setError(`Failed to load configuration: ${err.message}`);
            } finally {
                setLoading(false); setLoadingMessage(null);
            }
        };
        fetchInitialData();
        return () => controller.abort();
    }, []);

    const handleGenerateReport = async (range: { from: string; to: string }) => {
        setLoading(true); setError(null); setDashboardData(null); setSelectedAgentId(null);
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const rangeStartDateSAST = new Date(`${range.from}T00:00:00+02:00`);
            const rangeEndDateSAST = new Date(`${range.to}T23:59:59+02:00`);
            
            // Initialize selected days for filtering
            const daysInRange: string[] = [];
            try {
                const interval = eachDayOfInterval({ start: parseISO(range.from), end: parseISO(range.to) });
                interval.forEach(d => daysInRange.push(format(d, 'yyyy-MM-dd')));
            } catch (e) {
                daysInRange.push(range.from);
            }
            setSelectedDays(new Set(daysInRange));

            const prevRangeStartDateSAST = new Date(rangeStartDateSAST.getTime() - (7 * 24 * 60 * 60 * 1000));
            const prevRangeEndDateSAST = new Date(rangeEndDateSAST.getTime() - (7 * 24 * 60 * 60 * 1000));
            const _24hStart = new Date(rangeStartDateSAST.getTime() - (24 * 60 * 60 * 1000));

            setLoadingMessage(`Fetching ticket data...`);
            const [rawFetched, rawPrev, raw24h] = await Promise.all([
                getTicketsUpdatedInPeriod(rangeStartDateSAST, rangeEndDateSAST, controller.signal),
                getTicketsUpdatedInPeriod(prevRangeStartDateSAST, prevRangeEndDateSAST, controller.signal),
                getTicketsUpdatedInPeriod(_24hStart, rangeStartDateSAST, controller.signal)
            ]);

            const agentMap = new Map<number, string>(agents.map(a => [a.id, a.contact.name]));
            
            const fetchAndAugment = async (list: Ticket[], msgPrefix: string) => {
                const augmented: TicketWithConversations[] = [];
                const BATCH = 50;
                for (let i = 0; i < list.length; i += BATCH) {
                    setLoadingMessage(`${msgPrefix} (${i}/${list.length})...`);
                    const batch = list.slice(i, i + BATCH);
                    const results = await Promise.all(batch.map(async (t) => {
                        let convos = getCachedConversations(t.id, t.updated_at);
                        if (!convos) { try { convos = await getConversations(t.id, controller.signal); cacheConversations(t.id, t.updated_at, convos); } catch { convos = []; } }
                        return { ...t, conversations: convos, agent_name: agentMap.get(t.responder_id), category: t.category || autoCategorizeTicket(t) };
                    }));
                    augmented.push(...results);
                }
                return augmented;
            };

            const ticketsWithConvos = await fetchAndAugment(rawFetched, "Analyzing current period");
            const prevTicketsWithConvos = await fetchAndAugment(rawPrev, "Analyzing previous period");
            const tickets24h = await fetchAndAugment(raw24h, "Analyzing 24h lookback");

            const created = ticketsWithConvos.filter(t => new Date(t.created_at) >= rangeStartDateSAST && new Date(t.created_at) <= rangeEndDateSAST);
            const reopened = ticketsWithConvos.filter(t => t.stats?.reopened_at && new Date(t.stats.reopened_at) >= rangeStartDateSAST && new Date(t.stats.reopened_at) <= rangeEndDateSAST);
            const closed = ticketsWithConvos.filter(t => (t.status === 4 || t.status === 5) && new Date(t.stats?.closed_at || t.stats?.resolved_at || t.updated_at) >= rangeStartDateSAST && new Date(t.stats?.closed_at || t.stats?.resolved_at || t.updated_at) <= rangeEndDateSAST);
            
            const worked = ticketsWithConvos.filter(t => {
                const isNotClosed = t.status !== 4 && t.status !== 5;
                const isNotReopened = t.status !== 9; // Status 9 is Reopened
                const hasActivity = t.conversations.some(c => {
                    const d = new Date(c.created_at);
                    const isSystem = (c.body_text || '').toLowerCase().includes('system');
                    return d >= rangeStartDateSAST && d <= rangeEndDateSAST && c.user_id && !isSystem;
                });
                return isNotClosed && isNotReopened && hasActivity;
            });
            const customerResponded = worked.filter(t => t.conversations.some(c => new Date(c.created_at) >= rangeStartDateSAST && new Date(c.created_at) <= rangeEndDateSAST && !c.user_id && !c.private));

            const prevCreated = prevTicketsWithConvos.filter(t => new Date(t.created_at) >= prevRangeStartDateSAST && new Date(t.created_at) <= prevRangeEndDateSAST);
            const prevClosed = prevTicketsWithConvos.filter(t => (t.status === 4 || t.status === 5) && new Date(t.stats?.closed_at || t.stats?.resolved_at || t.updated_at) >= prevRangeStartDateSAST && new Date(t.stats?.closed_at || t.stats?.resolved_at || t.updated_at) <= prevRangeEndDateSAST);
            
            const calcPrevStats = (list: TicketWithConversations[], start: Date, end: Date) => ({
                created: list.filter(t => new Date(t.created_at) >= start && new Date(t.created_at) <= end).length,
                reopened: list.filter(t => t.stats?.reopened_at && new Date(t.stats.reopened_at) >= start && new Date(t.stats.reopened_at) <= end).length,
                closed: list.filter(t => (t.status===4||t.status===5) && new Date(t.stats?.closed_at||t.updated_at) >= start && new Date(t.stats?.closed_at||t.updated_at) <= end).length,
                worked: list.filter(t => (t.status!==4&&t.status!==5) && t.conversations.some(c => new Date(c.created_at) >= start && new Date(c.created_at) <= end && c.user_id)).length,
                customerResponded: 0
            });

            const prevStats = calcPrevStats(prevTicketsWithConvos, prevRangeStartDateSAST, prevRangeEndDateSAST);
            const _24hStats = calcPrevStats(tickets24h, _24hStart, rangeStartDateSAST);

            setLoadingMessage("Calculating active ticket snapshots...");
            const { tickets: allActive, total: activeCount } = await getActiveTickets(ACTIVE_TICKET_STATUSES, groups.map(g=>g.id), controller.signal);
            
            // Initial Group Stats Calculation (Full Data)
            const calcGroupStats = (list: Ticket[]) => {
                const counts = new Map<number, number>();
                const types = new Map<number, Record<string, number>>();

                list.forEach(t => {
                    counts.set(t.group_id, (counts.get(t.group_id) || 0) + 1);
                    if (!types.has(t.group_id)) types.set(t.group_id, {});
                    const typeKey = t.type || 'No Type';
                    const groupTypes = types.get(t.group_id)!;
                    groupTypes[typeKey] = (groupTypes[typeKey] || 0) + 1;
                });

                const total = list.length;
                return Array.from(counts.entries()).map(([gid, count]) => ({
                    groupId: gid, 
                    groupName: groupMap.get(gid) || 'Unknown', 
                    count,
                    percent: total > 0 ? ((count/total)*100).toFixed(1) + '%' : '0%',
                    rawPercent: total > 0 ? (count/total)*100 : 0,
                    typeDistribution: types.get(gid)
                })).sort((a,b) => b.count - a.count);
            };

            const endStats = calcGroupStats(allActive);
            const startCounts = new Map<number, number>();
            allActive.forEach(t => startCounts.set(t.group_id, (startCounts.get(t.group_id) || 0) + 1));
            created.forEach(t => startCounts.set(t.group_id, (startCounts.get(t.group_id) || 0) - 1));
            reopened.forEach(t => startCounts.set(t.group_id, (startCounts.get(t.group_id) || 0) - 1));
            closed.forEach(t => startCounts.set(t.group_id, (startCounts.get(t.group_id) || 0) + 1));

            const startStats = Array.from(startCounts.entries()).map(([gid, count]) => ({
                groupId: gid, groupName: groupMap.get(gid) || 'Unknown', count: Math.max(0, count), percent: '', rawPercent: 0
            })).filter(s => s.count > 0).sort((a,b) => b.count - a.count);
            
            const startTotal = startStats.reduce((sum, s) => sum + s.count, 0);
            startStats.forEach(s => { 
                s.percent = startTotal > 0 ? ((s.count/startTotal)*100).toFixed(1)+'%' : '0%'; 
                s.rawPercent = startTotal > 0 ? (s.count/startTotal)*100 : 0;
            });

            const agentSummaryData = calculateAllAgentActivity(ticketsWithConvos, agentMap, rangeStartDateSAST, rangeEndDateSAST, groupMap);

            setDashboardData({
                dateRange: range,
                agentSummary: agentSummaryData,
                ticketStats: { created: created.length, reopened: reopened.length, closed: closed.length, worked: worked.length, customerResponded: customerResponded.length },
                prevTicketStats: prevStats,
                _24hTicketStats: _24hStats,
                ticketsClosedAndCreatedInPeriod: closed.filter(t => new Date(t.created_at) >= rangeStartDateSAST).length,
                groupStats: { created: calcGroupStats(created), reopened: calcGroupStats(reopened), closed: calcGroupStats(closed), worked: calcGroupStats(worked), ticketsAtPeriodStart: startStats, ticketsAtPeriodEnd: endStats },
                categoryStats: [], groupCategoryStats: [],
                ticketLists: { created, reopened, closed, worked, customerResponded, prevCreated, prevClosed, active: allActive }, 
                timeEntries: [],
                ticketsAtPeriodStartCount: startTotal,
                ticketsAtPeriodEndCount: activeCount,
                reportGeneratedTimestamp: new Date().toLocaleString()
            });
            setTickets(ticketsWithConvos);

        } catch (err: any) {
            if (err.name !== 'AbortError') setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAgent = (agentId: number, dateFilter: string | null = null) => {
        if (!dashboardData) return;
        setSelectedAgentId(agentId);
        setSelectedAgentDateFilter(dateFilter);
        const rangeStartDateSAST = new Date(`${dashboardData.dateRange.from}T00:00:00+02:00`);
        const rangeEndDateSAST = new Date(`${dashboardData.dateRange.to}T23:59:59+02:00`);
        
        // Include tickets where:
        // 1. The agent has activity (conversations) in the period
        // 2. OR The agent is the responder AND the ticket was Closed/Resolved in the period (even if no specific conversation note)
        const relevantTickets = tickets.filter(ticket => {
            const hasActivity = ticket.conversations.some(c => {
                const activityDate = new Date(c.created_at);
                return c.user_id === agentId && activityDate >= rangeStartDateSAST && activityDate <= rangeEndDateSAST;
            });

            const isClosedByAgent = (ticket.status === 4 || ticket.status === 5) && ticket.responder_id === agentId;
            let closedInPeriod = false;
            if (isClosedByAgent) {
                const closedAtStr = ticket.stats?.closed_at || ticket.stats?.resolved_at || ticket.updated_at;
                if (closedAtStr) {
                    const closedAt = new Date(closedAtStr);
                    closedInPeriod = closedAt >= rangeStartDateSAST && closedAt <= rangeEndDateSAST;
                }
            }

            return hasActivity || (isClosedByAgent && closedInPeriod);
        });
        setAgentTickets(relevantTickets);
    };

    const handleBackFromAgent = () => {
        setSelectedAgentId(null);
        // Scroll to matrix
        setTimeout(() => {
            matrixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    const openTicketModal = (tickets: Ticket[], type: string) => {
        setModalTicketList(tickets);
        setModalType(type);
    };

    const handleChartClick = (metric: 'created' | 'reopened' | 'worked' | 'closed' | 'active', groupName?: string) => {
        if (!dashboardData?.ticketLists) return;
        // When clicking charts, use the filtered data sets logic to ensure consistency with what's viewed
        const { created, reopened, worked, closed, active } = filteredDashboardMetrics.ticketLists;
        
        let allTicketsForMetric: Ticket[] = [];
        if (metric === 'created') allTicketsForMetric = created;
        else if (metric === 'reopened') allTicketsForMetric = reopened;
        else if (metric === 'worked') allTicketsForMetric = worked;
        else if (metric === 'closed') allTicketsForMetric = closed;
        else if (metric === 'active') allTicketsForMetric = active || [];
        
        let ticketsToShow = allTicketsForMetric;
        let title = '';

        if (groupName) {
            // Find group ID
            const groupEntry = [...groupMap.entries()].find(([id, name]) => name === groupName);
            if (groupEntry) {
                ticketsToShow = allTicketsForMetric.filter(t => t.group_id === groupEntry[0]);
                title = `${metric.toUpperCase()} - ${groupName}`;
            }
        } else {
            title = `${metric.toUpperCase()} (ALL)`;
        }
        
        openTicketModal(ticketsToShow, title);
    };

    const toggleDay = (day: string) => {
        setSelectedDays(prev => {
            const newSet = new Set(prev);
            if (newSet.has(day)) {
                newSet.delete(day);
            } else {
                newSet.add(day);
            }
            return newSet;
        });
    };

    const handleCategoryUpdate = async (ticketId: number, category: string) => {
        // Helper to update a list of tickets
        const updateList = (list: Ticket[]) => list.map(t => t.id === ticketId ? { ...t, category } : t);

        // Update main tickets state
        setTickets(prev => updateList(prev) as TicketWithConversations[]);

        // Update agent tickets if active
        if (agentTickets.length > 0) {
            setAgentTickets(prev => updateList(prev) as TicketWithConversations[]);
        }

        // Update modal tickets if active
        if (modalTicketList) {
            setModalTicketList(prev => prev ? updateList(prev) : null);
        }

        // Update dashboard data ticket lists
        if (dashboardData) {
            setDashboardData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    ticketLists: {
                        ...prev.ticketLists,
                        created: updateList(prev.ticketLists.created),
                        reopened: updateList(prev.ticketLists.reopened),
                        closed: updateList(prev.ticketLists.closed),
                        worked: updateList(prev.ticketLists.worked) as TicketWithConversations[],
                        customerResponded: updateList(prev.ticketLists.customerResponded) as TicketWithConversations[],
                        active: prev.ticketLists.active ? updateList(prev.ticketLists.active) : undefined
                    }
                };
            });
        }

        try {
            // Attempt to persist to Freshdesk. 
            // We assume 'category' maps to a custom field in Freshdesk, as it's not a standard top-level field.
            await updateTicket(ticketId, { custom_fields: { category } });
        } catch (e: any) {
            console.error("Failed to update category remotely", e);
            setError(`Failed to save category: ${e.message}`);
        }
    };

    // Handler for Local Download
    const handleDownloadHtml = () => {
        if (!dashboardData) return;
        // Just trigger the local download, do not upload
        generateDashboardHtmlReport(dashboardData, true);
    };

    // Handler for Generating Link (Upload Only)
    const handleGenerateLink = async () => {
        if (!dashboardData) return;
        setLoading(true);
        setLoadingMessage("Generating and Uploading Report...");
        try {
            // Generate content but DO NOT download locally (pass false)
            const { htmlContent, fileName } = generateDashboardHtmlReport(dashboardData, false);
            
            // Upload to GCS via Backend
            const response = await fetch('/api/upload-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ htmlContent, fileName })
            });
            
            if (!response.ok) throw new Error("Upload failed");
            
            const result = await response.json();
            if (result.success && result.url) {
                setReportUrl(result.url);
            }
        } catch (e: any) {
            setError(`Report generation error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Dynamic Filtering for Charts based on Timeline Selection ---
    const filteredDashboardMetrics = useMemo(() => {
        if (!dashboardData) return null;

        const isDateInSelection = (dateStr: string | null | undefined, isTimeSAST = false) => {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            const dSAST = isTimeSAST ? d : toSATime(dateStr); 
            const dayStr = dSAST.toISOString().split('T')[0];
            return selectedDays.has(dayStr);
        };

        const filterTickets = (list: Ticket[], dateField: 'created' | 'updated' | 'closed') => {
            return list.filter(t => {
                let dToCheck = t.created_at;
                if (dateField === 'closed') dToCheck = t.stats?.closed_at || t.stats?.resolved_at || t.updated_at;
                if (dateField === 'updated') dToCheck = t.updated_at; // For Worked, logic is complex, handled below
                return isDateInSelection(dToCheck);
            });
        };

        // Special handling for 'Worked' which relies on conversation dates
        const filteredWorked = dashboardData.ticketLists.worked.filter(t => {
            return t.conversations.some(c => {
               const cDate = c.created_at;
               // Must be in date range AND in selected days
               return isDateInSelection(cDate); 
            });
        });

        const filteredCreated = filterTickets(dashboardData.ticketLists.created, 'created');
        const filteredReopened = dashboardData.ticketLists.reopened.filter(t => isDateInSelection(t.stats?.reopened_at));
        const filteredClosed = filterTickets(dashboardData.ticketLists.closed, 'closed');
        
        const calcGroupStats = (list: Ticket[]) => {
            const counts = new Map<number, number>();
            const types = new Map<number, Record<string, number>>();
            list.forEach(t => {
                counts.set(t.group_id, (counts.get(t.group_id) || 0) + 1);
                if (!types.has(t.group_id)) types.set(t.group_id, {});
                const typeKey = t.type || 'No Type';
                const groupTypes = types.get(t.group_id)!;
                groupTypes[typeKey] = (groupTypes[typeKey] || 0) + 1;
            });
            const total = list.length;
            return Array.from(counts.entries()).map(([gid, count]) => ({
                groupId: gid, groupName: groupMap.get(gid) || 'Unknown', count,
                percent: total > 0 ? ((count/total)*100).toFixed(1) + '%' : '0%',
                rawPercent: total > 0 ? (count/total)*100 : 0,
                typeDistribution: types.get(gid)
            })).sort((a,b) => b.count - a.count);
        };

        return {
            groupStats: {
                created: calcGroupStats(filteredCreated),
                reopened: calcGroupStats(filteredReopened),
                worked: calcGroupStats(filteredWorked),
                closed: calcGroupStats(filteredClosed),
                ticketsAtPeriodStart: dashboardData.groupStats.ticketsAtPeriodStart, // Keep static
                ticketsAtPeriodEnd: dashboardData.groupStats.ticketsAtPeriodEnd // Keep static
            },
            ticketStats: {
                created: filteredCreated.length,
                reopened: filteredReopened.length,
                worked: filteredWorked.length,
                closed: filteredClosed.length
            },
            ticketLists: {
                created: filteredCreated,
                reopened: filteredReopened,
                worked: filteredWorked,
                closed: filteredClosed,
                active: dashboardData.ticketLists.active
            }
        };

    }, [dashboardData, selectedDays, groupMap]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans pb-20">
            {(!dashboardData && !loading) && <DateSelectionModal onSave={handleGenerateReport} onClose={() => {}} />}
            
            {dashboardData && (
                 <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                     <header className="flex flex-col md:flex-row justify-between items-center mb-8 bg-gradient-to-r from-gray-900 to-blue-900 p-6 rounded-xl shadow-2xl border border-white/10 animate-slide-up backdrop-blur-md">
                        <div>
                            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-200 tracking-tight drop-shadow-sm">Freshdesk Activity Dashboard</h1>
                            <p className="text-blue-200/80 mt-2 flex items-center font-medium">
                                <span className="bg-white/10 px-3 py-1 rounded-md text-sm font-mono border border-white/10 shadow-inner">{dashboardData.dateRange.from}</span>
                                <span className="mx-3 opacity-60">to</span>
                                <span className="bg-white/10 px-3 py-1 rounded-md text-sm font-mono border border-white/10 shadow-inner">{dashboardData.dateRange.to}</span>
                            </p>
                        </div>
                        <div className="flex gap-4 mt-4 md:mt-0">
                            <button onClick={() => setDashboardData(null)} className="bg-fd-blue hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-blue-500/30 transition-all hover:scale-105">New Report</button>
                            <button onClick={handleDownloadHtml} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-gray-500/30 transition-all hover:scale-105 border border-gray-500">Download HTML</button>
                            <button onClick={handleGenerateLink} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-green-500/30 transition-all hover:scale-105">Generate Link</button>
                        </div>
                    </header>

                    {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                    {!selectedAgentId ? (
                        <div className="animate-fade-in">
                            <section className="mb-8">
                                <h2 className="text-xl font-bold text-white mb-4 uppercase tracking-wider text-center bg-gray-800/50 py-3 rounded-lg border border-gray-700">
                                    Activity Log built with {
                                        (filteredDashboardMetrics?.ticketStats.worked || 0) + 
                                        (filteredDashboardMetrics?.ticketStats.closed || 0) + 
                                        (filteredDashboardMetrics?.ticketStats.created || 0) + 
                                        (filteredDashboardMetrics?.ticketStats.reopened || 0)
                                    } tickets
                                </h2>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div className="bg-gray-800 p-6 rounded-xl shadow-xl border border-gray-700 flex flex-col min-h-[450px]">
                                    <h3 className="text-gray-400 text-lg font-bold uppercase mb-2 text-center tracking-widest">Tickets at Period Start</h3>
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <p className="text-7xl font-black text-white mb-6 drop-shadow-lg">{dashboardData.ticketsAtPeriodStartCount}</p>
                                        <div className="w-full h-80">
                                            <DoughnutChart 
                                                data={dashboardData.groupStats.ticketsAtPeriodStart} 
                                                showLegend={true} 
                                                onSegmentClick={(group) => {}} // No detail view for history calc
                                                onCenterClick={() => {}}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 text-center mt-4 border-t border-gray-700 pt-2">Calc: Active - Created - Reopened + Closed</div>
                                </div>

                                <div className="bg-gray-800 p-6 rounded-xl shadow-xl border border-gray-700 flex flex-col min-h-[450px]">
                                    <h3 className="text-blue-400 text-lg font-bold uppercase mb-2 text-center tracking-widest">CURRENT ACTIVE TICKETS (SNAPSHOT)</h3>
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <div 
                                            className="text-7xl font-black text-white mb-6 cursor-pointer hover:text-blue-400 transition-colors drop-shadow-lg"
                                            onClick={() => handleChartClick('active')}
                                            title="View All Active Tickets"
                                        >
                                            {dashboardData.ticketsAtPeriodEndCount}
                                        </div>
                                        <div className="w-full h-80">
                                            <DoughnutChart 
                                                data={dashboardData.groupStats.ticketsAtPeriodEnd} 
                                                showLegend={true} 
                                                onSegmentClick={(group) => handleChartClick('active', group)}
                                                onCenterClick={() => handleChartClick('active')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <ActivityTimelineChart 
                                createdTickets={dashboardData.ticketLists.created}
                                closedTickets={dashboardData.ticketLists.closed}
                                prevCreatedTickets={dashboardData.ticketLists.prevCreated}
                                prevClosedTickets={dashboardData.ticketLists.prevClosed}
                                dateRange={dashboardData.dateRange}
                                groupMap={cleanGroupMap(groups)}
                                selectedDays={selectedDays}
                                onToggleDay={toggleDay}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-4">
                                <div className="bg-gray-800 p-4 rounded-lg border-t-4 border-blue-500 shadow-lg hover:bg-gray-750 transition-transform hover:scale-[1.02]">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-blue-400 font-bold uppercase text-sm">CREATED</h3>
                                        <div className="text-right cursor-pointer" onClick={() => handleChartClick('created')}>
                                            <span className="text-2xl font-bold text-white block">{filteredDashboardMetrics?.ticketStats.created}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-48"><DoughnutChart data={filteredDashboardMetrics?.groupStats.created || []} showLegend={true} onSegmentClick={(group) => handleChartClick('created', group)} onCenterClick={() => handleChartClick('created')} /></div>
                                </div>

                                <div className="bg-gray-800 p-4 rounded-lg border-t-4 border-yellow-500 shadow-lg hover:bg-gray-750 transition-transform hover:scale-[1.02]">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-yellow-400 font-bold uppercase text-sm">REOPENED</h3>
                                        <div className="text-right cursor-pointer" onClick={() => handleChartClick('reopened')}>
                                            <span className="text-2xl font-bold text-white block">{filteredDashboardMetrics?.ticketStats.reopened}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-48"><DoughnutChart data={filteredDashboardMetrics?.groupStats.reopened || []} showLegend={true} onSegmentClick={(group) => handleChartClick('reopened', group)} onCenterClick={() => handleChartClick('reopened')} /></div>
                                </div>

                                <div className="bg-gray-800 p-4 rounded-lg border-t-4 border-purple-500 shadow-lg hover:bg-gray-750 transition-transform hover:scale-[1.02]">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-purple-400 font-bold uppercase text-sm">WORKED NOT CLOSED</h3>
                                        <div className="text-right cursor-pointer" onClick={() => handleChartClick('worked')}>
                                            <span className="text-2xl font-bold text-white block">{filteredDashboardMetrics?.ticketStats.worked}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-48"><DoughnutChart data={filteredDashboardMetrics?.groupStats.worked || []} showLegend={true} onSegmentClick={(group) => handleChartClick('worked', group)} onCenterClick={() => handleChartClick('worked')} /></div>
                                </div>

                                <div className="bg-gray-800 p-4 rounded-lg border-t-4 border-green-500 shadow-lg hover:bg-gray-750 transition-transform hover:scale-[1.02]">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-green-400 font-bold uppercase text-sm">WORKED AND CLOSED</h3>
                                        <div className="text-right cursor-pointer" onClick={() => handleChartClick('closed')}>
                                            <span className="text-2xl font-bold text-white block">{filteredDashboardMetrics?.ticketStats.closed}</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-48"><DoughnutChart data={filteredDashboardMetrics?.groupStats.closed || []} showLegend={true} onSegmentClick={(group) => handleChartClick('closed', group)} onCenterClick={() => handleChartClick('closed')} /></div>
                                </div>
                            </div>

                            <div className="bg-gray-900 border border-gray-800 p-4 rounded mb-8 text-xs text-gray-400">
                                <h4 className="font-bold text-gray-300 uppercase mb-2">Data Definitions</h4>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <li><span className="text-blue-400 font-bold">CREATED:</span> New tickets created within the selected period.</li>
                                    <li><span className="text-yellow-400 font-bold">REOPENED:</span> Tickets that moved from Resolved/Closed to Open.</li>
                                    <li><span className="text-purple-400 font-bold">WORKED NOT CLOSED:</span> Tickets updated by agents but not yet Resolved/Closed (Excludes Reopened status).</li>
                                    <li><span className="text-green-400 font-bold">WORKED AND CLOSED:</span> Tickets that were Resolved or Closed.</li>
                                </ul>
                            </div>
                            
                            <div className="my-8">
                                <AgentActivityChart data={dashboardData.agentSummary} />
                            </div>

                            <div ref={matrixRef}>
                                <AgentActivitySummaryTable 
                                    data={dashboardData.agentSummary}
                                    onSelectAgentForDetail={handleSelectAgent}
                                    onSelectDateForDetail={(agentId, date) => handleSelectAgent(agentId, date)}
                                    dateRange={dashboardData.dateRange}
                                    reportGeneratedTimestamp={dashboardData.reportGeneratedTimestamp}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            <AgentTicketList 
                                tickets={agentTickets}
                                agentName={agents.find(a => a.id === selectedAgentId)?.contact.name || 'Unknown'}
                                agentId={selectedAgentId}
                                dateRange={dashboardData.dateRange}
                                groupMap={cleanGroupMap(groups)}
                                agents={agents}
                                onUpdateCategory={handleCategoryUpdate}
                                dateFilter={selectedAgentDateFilter}
                                timeEntries={[]}
                                onBack={handleBackFromAgent}
                            />
                        </div>
                    )}

                    {modalTicketList && (
                        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fade-in">
                            <div className="w-full max-w-7xl h-[90vh] flex">
                                <TicketStatList 
                                    tickets={modalTicketList} 
                                    type={modalType as any} 
                                    onClose={() => setModalTicketList(null)}
                                    groupMap={cleanGroupMap(groups)}
                                    onUpdateCategory={handleCategoryUpdate}
                                />
                            </div>
                        </div>
                    )}

                    {reportUrl && (
                        <Modal 
                            title="Report Uploaded" 
                            message={`The executive report has been uploaded to the cloud storage bucket.`} 
                            onClose={() => setReportUrl(null)}
                        >
                            <div className="mt-4">
                                <p className="text-sm text-gray-400 mb-2">Public URL:</p>
                                <a 
                                    href={reportUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-fd-blue underline break-all text-sm block bg-gray-900 p-2 rounded border border-gray-700"
                                >
                                    {reportUrl}
                                </a>
                            </div>
                        </Modal>
                    )}
                 </div>
            )}

            {loading && <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 animate-fade-in"><Spinner message={loadingMessage} /></div>}
            <DebugBar />
        </div>
    );
}

export default App;
