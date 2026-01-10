


import React from 'react';
import type { ActivityReport } from '../types.ts';

interface SummaryTotalsProps {
    data: ActivityReport[];
    dateRange: { from: string; to: string };
    selectedAgentName: string;
}

// Helper to parse the AI string output into numbers (moved here to share logic if needed or reused)
const parseAiEstimateToRange = (aiEstimateString: string): { min: number, max: number } => {
    let totalMin = 0;
    let totalMax = 0;
    // Robust regex to find all 'L-H minutes' patterns
    const matches = aiEstimateString.matchAll(/(\d+)-(\d+)\s*minutes/gi);
    for (const match of matches) {
        totalMin += parseInt(match[1], 10);
        totalMax += parseInt(match[2], 10);
    }
    return { min: totalMin, max: totalMax };
};

const formatMinutesToHours = (minutes: number) => {
    if (minutes < 0) minutes = 0;
    const hours = Math.floor(minutes / 60);
    const remainingMins = Math.round(minutes % 60);
    return `${hours}h ${remainingMins}m`;
};


const SummaryTotals: React.FC<SummaryTotalsProps> = ({ data, dateRange, selectedAgentName }) => {
    // Calculate totals that don't rely on AI estimates first
    const totalResponses = data.reduce((sum, item) => sum + item.agentResponseCount, 0);
    const totalActions = data.reduce((sum, item) => sum + item.agentActionCount, 0);
    const totalActivity = totalResponses + totalActions;
    const totalTicketsClosed = data.filter(item => item.status === 4 || item.status === 5).length;

    // Calculate TOTAL WORK TIME by summing the 'Work Time' column (aiTimeEstimate) of each ticket
    let grandTotalMinMinutes = 0;
    let grandTotalMaxMinutes = 0;

    data.forEach(item => {
        if (item.aiTimeEstimate && item.aiTimeEstimate !== 'N/A' && !item.aiTimeEstimate.includes('Calculation Error')) {
            const parsedRange = parseAiEstimateToRange(item.aiTimeEstimate);
            grandTotalMinMinutes += parsedRange.min;
            grandTotalMaxMinutes += parsedRange.max;
        }
    });

    const grandTotalEstimateString = `${formatMinutesToHours(grandTotalMinMinutes)} - ${formatMinutesToHours(grandTotalMaxMinutes)}`;

    const summaryItems = [
        { label: 'TOTAL AGENT ACTIVITY', value: totalActivity.toString() },
        { label: 'Total Agent Responses', value: totalResponses.toString() },
        { label: 'Total Agent Actions', value: totalActions.toString() },
        { label: 'Tickets "Resolved" or "Closed"', value: totalTicketsClosed.toString() },
        { label: 'AI ESTIMATED TOTAL WORK TIME', value: grandTotalEstimateString }, 
    ];

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
            <div className="flex flex-col md:flex-row justify-between items-baseline mb-4">
                <h3 className="text-2xl font-bold uppercase text-white">ACTIVITY SUMMARY FOR <span className="text-fd-blue">{selectedAgentName}</span></h3>
                <span className="text-gray-400 text-sm">Period: {dateRange.from} to {dateRange.to}</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {summaryItems.map(item => (
                    <div key={item.label} className="bg-gray-900 p-4 rounded-lg text-center border border-gray-700">
                        <p className="text-base font-medium text-gray-400">{item.label}</p>
                        <p className="text-3xl font-bold text-white mt-1">{item.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SummaryTotals;
