
import React, { useState, useMemo, useEffect } from 'react';
import type { AgentActivitySummary } from '../types.ts';

interface AgentActivityChartProps {
    data: AgentActivitySummary[];
}

const dayColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const AgentActivityChart: React.FC<AgentActivityChartProps> = ({ data }) => {
    const [hoveredData, setHoveredData] = useState<{ x: number, y: number, value: number, label: string, agent: string } | null>(null);
    
    // Extract all unique dates from dailyBreakdown across all agents
    const availableDays = useMemo(() => {
        const days = new Set<string>();
        data.forEach(agent => {
            agent.dailyBreakdown.forEach(day => days.add(day.date));
        });
        return Array.from(days).sort();
    }, [data]);

    const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

    // Reset selected days when data changes
    useEffect(() => {
        setSelectedDays(new Set(availableDays));
    }, [availableDays]);

    const toggleDay = (day: string) => {
        setSelectedDays(prev => {
            const newSet = new Set(prev);
            if (newSet.has(day)) newSet.delete(day);
            else newSet.add(day);
            return newSet;
        });
    };

    // Calculate aggregated stats based on selected days
    const filteredData = useMemo(() => {
        return data.map(agent => {
            let responses = 0;
            let actions = 0;
            let closed = 0;

            agent.dailyBreakdown.forEach(day => {
                if (selectedDays.has(day.date)) {
                    responses += day.totalResponses;
                    actions += day.totalActions;
                    closed += day.totalClosed;
                }
            });

            return {
                ...agent,
                totalResponses: responses,
                totalActions: actions,
                totalClosed: closed,
                totalAgentActivity: responses + actions // Activity is Resp + Actions
            };
        }).filter(a => a.totalAgentActivity > 0 || a.totalClosed > 0).sort((a, b) => a.agentName.localeCompare(b.agentName));
    }, [data, selectedDays]);

    if (filteredData.length === 0) return null;

    // Dimensions
    const height = 300;
    const width = 1000;
    const margin = { top: 40, right: 20, bottom: 60, left: 60 };
    const chartHeight = height - margin.top - margin.bottom;
    const chartWidth = width - margin.left - margin.right;

    const metrics = [
        { key: 'totalResponses', label: 'Responses', color: '#3B82F6' },
        { key: 'totalActions', label: 'Actions', color: '#8B5CF6' },
        { key: 'totalClosed', label: 'Closed', color: '#10B981' }
    ];

    const maxValue = Math.max(...filteredData.flatMap(d => [d.totalResponses, d.totalActions, d.totalClosed]), 1);
    const yMax = Math.ceil(maxValue * 1.1);

    const groupWidth = chartWidth / filteredData.length;
    const barWidth = (groupWidth * 0.7) / 3;
    const spacing = (groupWidth * 0.3);

    const getY = (val: number) => chartHeight - (val / yMax) * chartHeight;
    const yTicks = Array.from({ length: 6 }).map((_, i) => {
        const val = Math.round((yMax / 5) * i);
        return { val, y: getY(val) };
    });

    return (
        <div className="w-full bg-gray-900 rounded-lg p-6 border border-gray-700 shadow-xl relative animate-fade-in">
            <h4 className="text-white font-bold uppercase mb-4 text-center tracking-wider text-sm">Agent Activity Visualisation</h4>
            
            {/* Date Filters */}
            <div className="flex gap-2 flex-wrap justify-center mb-6">
                {availableDays.map((day, i) => (
                    <button 
                        key={day} 
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold border-2 ${selectedDays.has(day) ? 'text-white' : 'text-gray-400 bg-gray-700 border-transparent hover:bg-gray-600'}`}
                        style={{ borderColor: selectedDays.has(day) ? dayColors[i % dayColors.length] : 'transparent' }}
                    >
                        {day}
                    </button>
                ))}
            </div>

            <div className="flex justify-center gap-6 mb-4 text-xs font-medium">
                {metrics.map(m => (
                    <div key={m.key} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }}></span>
                        <span className="text-gray-400">{m.label}</span>
                    </div>
                ))}
            </div>

            <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[600px]" preserveAspectRatio="none">
                    {yTicks.map(tick => (
                        <g key={tick.val}>
                            <line x1={margin.left} y1={tick.y + margin.top} x2={width - margin.right} y2={tick.y + margin.top} stroke="#374151" strokeDasharray="4 4" strokeWidth="1" />
                            <text x={margin.left - 10} y={tick.y + margin.top + 4} textAnchor="end" className="fill-gray-500 text-[10px]">{tick.val}</text>
                        </g>
                    ))}

                    {filteredData.map((agent, i) => {
                        const groupX = margin.left + (i * groupWidth) + (spacing / 2);
                        return (
                            <g key={agent.agentId}>
                                {metrics.map((metric, mIdx) => {
                                    const val = agent[metric.key as keyof AgentActivitySummary] as number;
                                    const barHeight = (val / yMax) * chartHeight;
                                    const x = groupX + (mIdx * barWidth);
                                    const y = margin.top + chartHeight - barHeight;

                                    return (
                                        <React.Fragment key={metric.key}>
                                            <rect
                                                x={x} y={y} width={barWidth - 4} height={barHeight} fill={metric.color} rx="2"
                                                className="transition-all duration-200 hover:opacity-80 cursor-pointer"
                                                onMouseEnter={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setHoveredData({ x: rect.left + rect.width / 2, y: rect.top, value: val, label: metric.label, agent: agent.agentName });
                                                }}
                                                onMouseLeave={() => setHoveredData(null)}
                                            />
                                            {val > 0 && <text x={x + (barWidth - 4) / 2} y={y - 4} textAnchor="middle" className="fill-white text-[10px] font-semibold pointer-events-none">{val}</text>}
                                        </React.Fragment>
                                    );
                                })}
                                <text x={groupX + (barWidth * 1.5)} y={height - margin.bottom + 20} textAnchor="middle" className="fill-gray-400 text-[10px] font-medium" transform={`rotate(0, ${groupX + (barWidth * 1.5)}, ${height - margin.bottom + 20})`} style={{ textTransform: 'capitalize' }}>
                                    {agent.agentName.split(' ')[0]}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {hoveredData && (
                <div className="fixed z-50 bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-xl border border-gray-600 pointer-events-none transform -translate-x-1/2 -translate-y-full" style={{ left: hoveredData.x, top: hoveredData.y - 8 }}>
                    <div className="font-bold">{hoveredData.agent}</div>
                    <div>{hoveredData.label}: <span className="font-mono text-fd-blue">{hoveredData.value}</span></div>
                </div>
            )}
        </div>
    );
};

export default AgentActivityChart;
