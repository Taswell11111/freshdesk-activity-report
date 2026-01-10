
import React, { useState, useMemo, useEffect } from 'react';
import type { AgentActivitySummary } from '../types.ts';
import { eachDayOfInterval, format, parseISO } from 'date-fns';

interface AgentActivitySummaryTableProps {
    data: AgentActivitySummary[];
    onSelectAgentForDetail: (agentId: number) => void;
    onSelectDateForDetail: (agentId: number, date: string) => void;
    dateRange: { from: string; to: string };
    reportGeneratedTimestamp: Date | string | null;
}

const dayColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const AgentActivitySummaryTable: React.FC<AgentActivitySummaryTableProps> = ({ data, onSelectAgentForDetail, onSelectDateForDetail, dateRange, reportGeneratedTimestamp }) => {
    // State for local date filtering
    const [activeDateFilter, setActiveDateFilter] = useState<string | null>(null);

    // Calculate available days for the tabs
    const availableDays = useMemo(() => {
        try {
            return eachDayOfInterval({
                start: parseISO(dateRange.from),
                end: parseISO(dateRange.to),
            }).map(d => format(d, 'yyyy-MM-dd'));
        } catch { return []; }
    }, [dateRange]);

    // Reset filter if data changes
    useEffect(() => {
        setActiveDateFilter(null);
    }, [data]);

    // Derived data based on filter
    const filteredAgents = useMemo(() => {
        let processedData = data;

        if (activeDateFilter) {
            // Recalculate totals for the specific day
            processedData = data.map(agent => {
                const dayStats = agent.dailyBreakdown.find(d => d.date === activeDateFilter);
                if (!dayStats) return { ...agent, totalAgentActivity: 0, totalClosed: 0, totalResponses: 0, totalActions: 0, groupStats: [] }; // Hide groups for day filter as we lack granularity

                return {
                    ...agent,
                    totalAgentActivity: dayStats.totalAgentActivity,
                    totalResponses: dayStats.totalResponses,
                    totalActions: dayStats.totalActions,
                    totalClosed: dayStats.totalClosed,
                    estimatedTimeRange: dayStats.estimatedTimeRange,
                    // We hide group stats when filtering by day because data structure doesn't support daily group breakdown
                    groupStats: [] 
                };
            });
        }

        return processedData.filter(agent => agent.totalAgentActivity > 0 || agent.totalClosed > 0);
    }, [data, activeDateFilter]);


    if (filteredAgents.length === 0 && !activeDateFilter) {
        return (
            <div className="my-8 bg-gray-900 rounded-2xl border-2 border-dashed border-gray-800 p-12 text-center">
                <p className="text-gray-500 font-bold uppercase tracking-widest">No activity mapped for this period.</p>
            </div>
        );
    }

    const parseTimeRangeToMinutes = (timeRangeString: string): { min: number; max: number } => {
        const match = timeRangeString.match(/(\d+)h\s*(\d+)m\s*-\s*(\d+)h\s*(\d+)m/);
        if (match) {
            const minHours = parseInt(match[1], 10);
            const minMinutes = parseInt(match[2], 10);
            const maxHours = parseInt(match[3], 10);
            const maxMinutes = parseInt(match[4], 10);
            return {
                min: (minHours * 60) + minMinutes,
                max: (maxHours * 60) + maxMinutes,
            };
        }
        return { min: 0, max: 0 };
    };

    const formatMinutesToHours = (minutes: number) => {
        if (minutes < 0) minutes = 0;
        const hours = Math.floor(minutes / 60);
        const remainingMins = Math.round(minutes % 60);
        return `${hours}h ${remainingMins}m`;
    };

    const totalActivity = filteredAgents.reduce((sum, item) => sum + item.totalAgentActivity, 0);
    const totalResponses = filteredAgents.reduce((sum, item) => sum + item.totalResponses, 0);
    const totalActions = filteredAgents.reduce((sum, item) => sum + item.totalActions, 0);
    const totalClosed = filteredAgents.reduce((sum, item) => sum + item.totalClosed, 0);

    let totalEstMin = 0;
    let totalEstMax = 0;
    filteredAgents.forEach(summary => {
        const range = parseTimeRangeToMinutes(summary.estimatedTimeRange);
        totalEstMin += range.min;
        totalEstMax += range.max;
    });
    const totalEstStr = `${formatMinutesToHours(totalEstMin)} - ${formatMinutesToHours(totalEstMax)}`;

    const displayTimestamp = typeof reportGeneratedTimestamp === 'string' 
        ? reportGeneratedTimestamp 
        : reportGeneratedTimestamp?.toLocaleString() || '';

    return (
        <div className="my-8 bg-gray-900 border border-gray-800 shadow-2xl rounded-2xl overflow-hidden animate-slide-up relative">
            <div className="p-6 border-b border-gray-800 bg-gray-900/50 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                    <h3 className="text-2xl font-black uppercase text-white tracking-tighter italic">Resource Allocation Matrix</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <span className="text-blue-500 font-mono text-xs uppercase tracking-widest">{dateRange.from} to {dateRange.to}</span>
                        {displayTimestamp && <span className="text-gray-600 font-mono text-xs uppercase tracking-widest">Sync Point: {displayTimestamp}</span>}
                    </div>
                    <div className="mt-3 text-white text-sm font-medium">
                        Activity vs Assignment: This matrix counts activity performed by the agent. If Agent A replies to a ticket assigned to Agent B, Agent A gets the credit here.
                    </div>
                </div>
                
                {/* Date Tabs */}
                {availableDays.length > 1 && (
                    <div className="flex flex-wrap gap-2 mt-4 md:mt-0 justify-end">
                        <button
                            onClick={() => setActiveDateFilter(null)}
                            className={`px-3 py-1 text-xs font-bold rounded border-2 transition-all ${
                                activeDateFilter === null 
                                ? 'bg-blue-600 text-white border-blue-600' 
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                            }`}
                        >
                            ALL
                        </button>
                        {availableDays.map((day, i) => (
                            <button
                                key={day}
                                onClick={() => setActiveDateFilter(day)}
                                className={`px-3 py-1 text-xs font-bold rounded border-2 transition-all ${
                                    activeDateFilter === day
                                    ? 'text-white'
                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                }`}
                                style={{ 
                                    borderColor: activeDateFilter === day ? dayColors[i % dayColors.length] : undefined,
                                    backgroundColor: activeDateFilter === day ? dayColors[i % dayColors.length] : undefined
                                }}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-800">
                    <thead className="bg-gray-950">
                        <tr>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-black text-white uppercase tracking-[0.2em] w-1/3">Agent Entity</th>
                            <th scope="col" className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-[0.2em]">Total Vol.</th>
                            <th scope="col" className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-[0.2em]">Public</th>
                            <th scope="col" className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-[0.2em]">Internal</th>
                            <th scope="col" className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-[0.2em]">CLOSED</th>
                            <th scope="col" className="px-6 py-4 text-right text-xs font-black text-white uppercase tracking-[0.2em]">Load %</th>
                            <th scope="col" className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-[0.2em]">Est. Work Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-gray-900">
                        {filteredAgents.map((summary, index) => (
                            <React.Fragment key={summary.agentId}>
                                {/* Spacer row between agents (except first) */}
                                {index > 0 && <tr className="h-4 bg-gray-950/50 border-t border-gray-800"><td colSpan={7}></td></tr>}
                                
                                <tr className="hover:bg-gray-800/50 transition-all duration-150 group">
                                    <td className="px-6 py-4 whitespace-normal align-middle">
                                        <div 
                                            className="text-xl font-black text-fd-blue hover:text-white cursor-pointer uppercase tracking-tight transition-colors group-hover:translate-x-1 duration-300 inline-block"
                                            onClick={() => onSelectAgentForDetail(summary.agentId)}
                                        >
                                            {summary.agentName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center"><span className="text-xl font-black text-white">{summary.totalAgentActivity}</span></td>
                                    <td className="px-6 py-4 text-center text-sm font-bold text-gray-300">{summary.totalResponses}</td>
                                    <td className="px-6 py-4 text-center text-sm font-bold text-gray-300">{summary.totalActions}</td>
                                    <td className="px-6 py-4 text-center text-sm font-bold text-green-400">{summary.totalClosed}</td>
                                    <td className="px-6 py-4 text-right text-sm font-mono text-gray-400">{summary.activityRatio}</td>
                                    <td className="px-6 py-4 text-center text-xs font-mono text-fd-blue/80 font-bold bg-fd-blue/5">{summary.estimatedTimeRange}</td>
                                </tr>
                                
                                {!activeDateFilter && summary.groupStats && summary.groupStats.length > 0 && (
                                    <tr className="bg-gray-800/70">
                                        <td className="px-6 py-2 text-xs font-bold text-white uppercase tracking-wider pl-12 italic">Group Breakdown</td>
                                        <td className="px-6 py-2 text-center text-xs font-bold text-white uppercase tracking-wider italic">Tickets Worked</td>
                                        <td className="px-6 py-2 text-center text-xs font-bold text-white uppercase tracking-wider italic">--</td>
                                        <td className="px-6 py-2 text-center text-xs font-bold text-white uppercase tracking-wider italic">--</td>
                                        <td className="px-6 py-2 text-center text-xs font-bold text-white uppercase tracking-wider italic">--</td>
                                        <td className="px-6 py-2"></td>
                                    </tr>
                                )}
                                
                                {!activeDateFilter && summary.groupStats?.map((group) => (
                                     <tr key={`${summary.agentId}-${group.groupName}`} className="bg-black/20 hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-1 whitespace-nowrap text-xs text-gray-300 pl-12 font-mono italic">
                                            ↳ {group.groupName} <span className="text-gray-500 text-[10px]">({group.percent})</span>
                                        </td>
                                        <td className="px-6 py-1 text-center text-gray-400 text-xs">{group.worked}</td>
                                        <td className="px-6 py-1 text-center text-gray-500 text-xs">--</td>
                                        <td className="px-6 py-1 text-center text-gray-500 text-xs">--</td>
                                        <td className="px-6 py-1 text-center text-xs text-green-400">{group.closed}</td>
                                        <td className="px-6 py-1"></td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-950 font-black text-white border-t-2 border-gray-800">
                        <tr>
                            <td className="px-6 py-4 uppercase tracking-tighter italic text-gray-400">Total Aggregates</td>
                            <td className="px-6 py-4 text-center text-xl text-fd-blue">{totalActivity}</td>
                            <td className="px-6 py-4 text-center text-sm text-gray-300">{totalResponses}</td>
                            <td className="px-6 py-4 text-center text-sm text-gray-300">{totalActions}</td>
                            <td className="px-6 py-4 text-center text-sm text-green-400">{totalClosed}</td>
                            <td className="px-6 py-4 text-right text-sm text-gray-500">100%</td>
                            <td className="px-6 py-4 text-center text-xs font-mono bg-fd-blue/10 text-fd-blue">{totalEstStr}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            
            <div className="p-6 bg-black/40 text-xs text-gray-600 font-mono uppercase leading-relaxed tracking-widest">
                <p><span className="text-fd-blue font-black mr-2">&bull;</span> Total Vol: Combined public responses and internal system notes</p>
                <p><span className="text-fd-blue font-black mr-2">&bull;</span> Load %: Agent's activity relative to total team activity.</p>
                <p><span className="text-fd-blue font-black mr-2">&bull;</span> Est. Work Time: Algorithmic approximation based on character count and activity density</p>
                <p><span className="text-fd-blue font-black mr-2">&bull;</span> Internal: Private notes and system actions</p>
            </div>
        </div>
    );
};

export default AgentActivitySummaryTable;
