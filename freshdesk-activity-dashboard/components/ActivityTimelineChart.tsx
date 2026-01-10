
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Ticket } from '../types.ts';
import { getGroupColor } from '../utils/logicUtils.ts';

interface ActivityTimelineChartProps {
    createdTickets: Ticket[];
    closedTickets: Ticket[];
    prevCreatedTickets?: Ticket[];
    prevClosedTickets?: Ticket[];
    dateRange: { from: string; to: string };
    groupMap: Map<number, string>;
    selectedDays: Set<string>;
    onToggleDay: (day: string) => void;
}

const dayColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const toSATime = (dateStr: string | Date): Date => {
    const date = new Date(dateStr);
    return new Date(date.getTime() + (2 * 60 * 60 * 1000));
};

const ActivityTimelineChart: React.FC<ActivityTimelineChartProps> = ({ 
    createdTickets, 
    closedTickets, 
    prevCreatedTickets, 
    prevClosedTickets, 
    dateRange, 
    groupMap,
    selectedDays,
    onToggleDay
}) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    const [dataType, setDataType] = useState<'created' | 'closed'>('created');
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

    const availableDays = useMemo(() => {
        try {
            return eachDayOfInterval({
                start: parseISO(dateRange.from),
                end: parseISO(dateRange.to),
            }).map(d => format(d, 'yyyy-MM-dd'));
        } catch { return []; }
    }, [dateRange]);

    // Extract all unique group names available in the dataset
    const allGroupNames = useMemo(() => {
        const groups = new Set<string>();
        [createdTickets, closedTickets].forEach(list => {
            list.forEach(t => {
                const gName = groupMap.get(t.group_id) || 'Unknown';
                groups.add(gName);
            });
        });
        return Array.from(groups).sort();
    }, [createdTickets, closedTickets, groupMap]);

    // Initialize all groups as selected by default
    useEffect(() => {
        setSelectedGroups(new Set(allGroupNames));
    }, [allGroupNames]);

    const toggleGroup = (groupName: string) => {
        setSelectedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupName)) {
                newSet.delete(groupName);
            } else {
                newSet.add(groupName);
            }
            return newSet;
        });
    };

    // Calculate both current and previous period totals
    const { hourlyTotals, prevHourlyTotals, hourlyGroupDetails, groupNames } = useMemo(() => {
        const tickets = dataType === 'created' ? createdTickets : closedTickets;
        const prevTickets = dataType === 'created' ? prevCreatedTickets : prevClosedTickets;
        
        const hourlyCounts = Array(24).fill(0);
        const prevHourlyCounts = Array(24).fill(0);
        const hourlyDetails: { [hour: number]: { [groupName: string]: number } } = {};
        const distinctGroups = new Set<string>();
        
        for (let i = 0; i < 24; i++) hourlyDetails[i] = {};

        // Process Current Period
        tickets.forEach(ticket => {
            const groupName = groupMap.get(ticket.group_id) || 'Unknown';
            // Apply Group Filter
            if (!selectedGroups.has(groupName)) return;

            const dateStr = dataType === 'created' ? ticket.created_at : (ticket.stats?.closed_at || ticket.stats?.resolved_at || ticket.updated_at);
            if (!dateStr) return;

            const date = new Date(dateStr);
            const dateSA = toSATime(date);
            const dayStr = dateSA.toISOString().split('T')[0];

            if (selectedDays.has(dayStr)) {
                const hour = dateSA.getUTCHours();
                if (hour >= 0 && hour < 24) {
                    distinctGroups.add(groupName);
                    
                    hourlyCounts[hour]++;
                    hourlyDetails[hour][groupName] = (hourlyDetails[hour][groupName] || 0) + 1;
                }
            }
        });

        // Process Previous Period (Simple aggregation, ignores day selection logic for simplicity or assumes full range compare)
        if (prevTickets) {
            prevTickets.forEach(ticket => {
                const groupName = groupMap.get(ticket.group_id) || 'Unknown';
                // Apply Group Filter to previous data as well for fair comparison
                if (!selectedGroups.has(groupName)) return;

                const dateStr = dataType === 'created' ? ticket.created_at : (ticket.stats?.closed_at || ticket.stats?.resolved_at || ticket.updated_at);
                if (!dateStr) return;
                const date = new Date(dateStr);
                const dateSA = toSATime(date);
                const hour = dateSA.getUTCHours();
                if (hour >= 0 && hour < 24) {
                    prevHourlyCounts[hour]++;
                }
            });
        }

        return { 
            hourlyTotals: hourlyCounts, 
            prevHourlyTotals: prevHourlyCounts,
            hourlyGroupDetails: hourlyDetails,
            groupNames: Array.from(distinctGroups).sort() 
        };
    }, [dataType, selectedDays, selectedGroups, createdTickets, closedTickets, prevCreatedTickets, prevClosedTickets, groupMap]);

    useEffect(() => {
        if (!chartRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (ctx) {
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, dataType === 'created' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(16, 185, 129, 0.5)');
            gradient.addColorStop(1, 'rgba(22, 29, 45, 0)');

            chartInstance.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
                    datasets: [
                        {
                            label: dataType === 'created' ? 'Current Period' : 'Current Period',
                            data: hourlyTotals,
                            backgroundColor: gradient,
                            borderColor: dataType === 'created' ? '#3B82F6' : '#10B981',
                            borderWidth: 2,
                            pointRadius: 3,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Previous 7 Days',
                            data: prevHourlyTotals,
                            borderColor: '#6B7280', // Gray
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: {
                            labels: { color: 'white' }
                        }
                    }
                }
            });
        }

        return () => { if(chartInstance.current) chartInstance.current.destroy(); };
    }, [hourlyTotals, prevHourlyTotals, dataType]);

    // Total displayed for selected filters
    const currentTotal = hourlyTotals.reduce((a, b) => a + b, 0);

    return (
        <section className="mt-8 mb-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6 animate-slide-up">
            <h2 className="text-2xl font-bold text-white uppercase mb-4 text-center tracking-wider">
                Ticket Volume Timeline by Hour
            </h2>
            
            {/* Top Controls: Date Type and Days */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex bg-gray-900 p-1 rounded-lg text-sm font-bold">
                    <button onClick={() => setDataType('created')} className={`px-4 py-2 rounded-md transition-colors ${dataType === 'created' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Created</button>
                    <button onClick={() => setDataType('closed')} className={`px-4 py-2 rounded-md transition-colors ${dataType === 'closed' ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Closed</button>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                    {availableDays.map((day, i) => (
                        <button 
                            key={day} 
                            onClick={() => onToggleDay(day)}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold border-2 ${selectedDays.has(day) ? 'text-white' : 'text-gray-400 bg-gray-700 border-transparent hover:bg-gray-600'}`}
                            style={{ borderColor: selectedDays.has(day) ? dayColors[i % dayColors.length] : 'transparent' }}
                        >
                            {format(parseISO(day), 'MMM d')}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="h-72 relative mb-6">
                <canvas ref={chartRef}></canvas>
            </div>

            {/* Bottom Controls: Group Filters */}
            <div className="mb-8 border-t border-gray-700 pt-4">
                <div className="flex justify-center items-center gap-4 mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filter Groups</h4>
                    <span className="text-xs font-bold text-white bg-gray-700 px-2 py-1 rounded">
                        Total: {currentTotal}
                    </span>
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center">
                    {allGroupNames.map(group => {
                        const isSelected = selectedGroups.has(group);
                        const groupColor = getGroupColor(group);
                        return (
                            <button
                                key={group}
                                onClick={() => toggleGroup(group)}
                                className={`
                                    px-3 py-1 text-xs font-bold rounded-full transition-all border
                                    ${isSelected 
                                        ? 'text-white shadow-md' 
                                        : 'bg-gray-700 text-gray-400 border-transparent hover:bg-gray-600'
                                    }
                                `}
                                style={{
                                    backgroundColor: isSelected ? groupColor : undefined,
                                    borderColor: isSelected ? groupColor : 'transparent',
                                    boxShadow: isSelected ? `0 0 10px ${groupColor}66` : 'none' // Add 40% opacity hex
                                }}
                            >
                                {group}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Hourly Volume Table */}
            <div className="overflow-x-auto bg-gray-900 rounded-lg border border-gray-700">
                <table className="min-w-full divide-y divide-gray-800">
                    <thead className="bg-gray-950">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-950 z-10 border-r border-gray-800">Group</th>
                            {Array.from({ length: 24 }).map((_, i) => (
                                <th key={i} className="px-2 py-3 text-center text-xs font-bold text-gray-400 uppercase">{String(i).padStart(2, '0')}:00</th>
                            ))}
                            <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-l border-gray-800">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {groupNames.map(group => {
                            let rowTotal = 0;
                            return (
                                <tr key={group} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-2 text-xs font-medium text-gray-300 whitespace-nowrap sticky left-0 bg-gray-900 border-r border-gray-800">{group}</td>
                                    {Array.from({ length: 24 }).map((_, i) => {
                                        const val = hourlyGroupDetails[i][group] || 0;
                                        rowTotal += val;
                                        return (
                                            <td key={i} className={`px-2 py-2 text-center text-xs ${val > 0 ? 'text-white font-bold' : 'text-gray-600'}`}>
                                                {val > 0 ? val : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-2 text-center text-xs font-bold text-fd-blue border-l border-gray-800">{rowTotal}</td>
                                </tr>
                            );
                        })}
                        {/* Totals Row */}
                        <tr className="bg-gray-950 border-t-2 border-gray-800">
                            <td className="px-4 py-3 text-xs font-bold text-white uppercase sticky left-0 bg-gray-950 border-r border-gray-800">Hourly Total</td>
                            {hourlyTotals.map((val, i) => (
                                <td key={i} className="px-2 py-3 text-center text-xs font-bold text-blue-400">{val}</td>
                            ))}
                            <td className="px-4 py-3 text-center text-xs font-black text-white border-l border-gray-800">{hourlyTotals.reduce((a,b)=>a+b,0)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ActivityTimelineChart;
