import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import type { ActivityReport, AgentActivitySummary, Agent, DashboardData } from '../types.ts';
import { FRESHDESK_DOMAIN } from '../constants.ts';

type jsPDFWithAutoTable = jsPDF & {
  autoTable: (options: any) => jsPDF;
};

// Removed local statusMap constant

const calculateAgeInDays = (createdAt: string): string => {
    const createdDate = new Date(createdAt);
    const today = new Date();
    createdDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
};

const calculateRelativeTime = (dateStr: string): string => {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'N/A';

    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays <= 1) return 'Today';
    return `${diffDays} days ago`;
}

// Logic duplicated from App.tsx/SummaryTotals.tsx for consistency
const parseAiEstimateToRange = (aiEstimateString: string): { min: number, max: number } => {
    let totalMin = 0;
    let totalMax = 0;
    const matches = aiEstimateString.matchAll(/(\d+)-(\d+)\s*minutes/gi);
    for (const match of matches) {
        totalMin += parseInt(match[1], 10);
        totalMax += parseInt(match[2], 10);
    }
    return { min: totalMin, max: totalMax };
};

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


export const generateActivityReportPdf = (
    data: ActivityReport[],
    selectedAgent: Agent, 
    dateRange: { from: string; to: string },
    reportGeneratedTimestamp: Date | null,
    agentActivitySummary: AgentActivitySummary[],
    statusMap: { [key: number]: string }, // Added prop
    dashboardMetrics: DashboardData // Add DashboardData for the snapshot
) => {
    const doc = new jsPDF({
        orientation: 'landscape',
    }) as jsPDFWithAutoTable;

    // Add header
    doc.setFontSize(20);
    doc.text('Freshdesk Agent Activity Report', 15, 20);
    doc.setFontSize(12);
    doc.text(`Agent: ${selectedAgent.contact.name}`, 15, 30);
    doc.text(`Date Range: ${dateRange.from} to ${dateRange.to}`, 15, 35);
    if (reportGeneratedTimestamp) {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Report Generated: ${reportGeneratedTimestamp.toLocaleString()}`, 15, 40);
        doc.setTextColor(0);
    }

    let currentY = 50;

    // --- All Agent Activity Summary Table ---
    if (agentActivitySummary.length > 0) {
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('ALL AGENT ACTIVITY FOR PERIOD', 15, currentY);
        doc.setFont(undefined, 'normal');
        
        const allAgentBody: any[][] = [];
        
        agentActivitySummary.forEach(summary => {
            // Main Agent Row
            allAgentBody.push([
                summary.agentName.toUpperCase(),
                summary.totalAgentActivity.toString(),
                summary.totalResponses.toString(),
                summary.totalActions.toString(),
                summary.totalClosed.toString(),
                summary.activityRatio,
                summary.estimatedTimeRange,
            ]);
            
            // Daily Breakdown Rows
            if (summary.dailyBreakdown && summary.dailyBreakdown.length > 1) {
                summary.dailyBreakdown.forEach(day => {
                    allAgentBody.push([
                        `  - ${day.date}`, // Indent date
                        day.totalAgentActivity.toString(),
                        day.totalResponses.toString(),
                        day.totalActions.toString(),
                        day.totalClosed.toString(),
                        '-',
                        day.estimatedTimeRange,
                    ]);
                });
            }
        });

        // Calculate Totals for Footer
        const totalResponses = agentActivitySummary.reduce((sum, item) => sum + item.totalResponses, 0);
        const totalActions = agentActivitySummary.reduce((sum, item) => sum + item.totalActions, 0);
        const totalClosed = agentActivitySummary.reduce((sum, item) => sum + item.totalClosed, 0);
        const totalActivity = agentActivitySummary.reduce((sum, item) => sum + item.totalAgentActivity, 0);
        
        // Calculate Total Estimate for Footer
        let totalEstMin = 0;
        let totalEstMax = 0;
        agentActivitySummary.forEach(summary => {
             const range = parseTimeRangeToMinutes(summary.estimatedTimeRange);
             totalEstMin += range.min;
             totalEstMax += range.max;
        });
        const totalEstStr = `${formatMinutesToHours(totalEstMin)} - ${formatMinutesToHours(totalEstMax)}`;


        doc.autoTable({
            startY: currentY + 5,
            head: [['Agent Name', 'TOTAL AGENT ACTIVITY', 'Total Responses', 'Total Actions', 'Total Closed', 'TOTAL ACTIVITY RATIO', 'AI ESTIMATED TOTAL WORK TIME']],
            body: allAgentBody,
            foot: [['TOTALS', totalActivity.toString(), totalResponses.toString(), totalActions.toString(), totalClosed.toString(), '100%', totalEstStr]],
            theme: 'striped',
            headStyles: { fillColor: [31, 41, 55], fontStyle: 'bold' },
            footStyles: { fillColor: [31, 41, 55], fontStyle: 'bold', textColor: 255 },
             columnStyles: {
                0: { cellWidth: 40 },
                1: { halign: 'center', cellWidth: 35 },
                2: { halign: 'center', cellWidth: 30 },
                3: { halign: 'center', cellWidth: 30 },
                4: { halign: 'center', cellWidth: 30 },
                5: { halign: 'center', cellWidth: 35 },
                6: { halign: 'center', cellWidth: 35 },
            },
            didParseCell: (data: any) => {
                 // Style daily breakdown rows differently (e.g., italics, lighter text)
                 if (data.section === 'body' && data.row.raw[0].startsWith('  -')) {
                     data.cell.styles.fontStyle = 'italic';
                     data.cell.styles.textColor = 100;
                 }
            }
        });
        
         currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- CURRENT ACTIVE TICKETS (SNAPSHOT) ---
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('CURRENT ACTIVE TICKETS (SNAPSHOT)', 15, currentY);
    doc.setFont(undefined, 'normal');

    const activeTicketsBody = dashboardMetrics.groupStats.ticketsAtPeriodEnd.map(g => [
        g.groupName,
        `${g.count} | ${g.percent}`
    ]);

    doc.autoTable({
        startY: currentY + 5,
        head: [['Group', 'Count | Percent']],
        body: activeTicketsBody,
        foot: [['Total', dashboardMetrics.ticketsAtPeriodEndCount.toString()]],
        theme: 'striped',
        headStyles: { fillColor: [31, 41, 55], fontStyle: 'bold' },
        footStyles: { fillColor: [31, 41, 55], fontStyle: 'bold', textColor: 255 },
        columnStyles: {
            0: { cellWidth: 70 },
            1: { halign: 'center' }
        },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;


    // --- Totals Summary Table ---
    
    // const totalTicketsHandled = data.length; // Removed
    const totalResponses = data.reduce((sum, item) => sum + item.agentResponseCount, 0);
    const totalActions = data.reduce((sum, item) => sum + item.agentActionCount, 0);
    const totalActivity = totalResponses + totalActions;
    const totalTicketsClosed = data.filter(item => item.status === 4 || item.status === 5).length;
    
    // Calculate Grand Total AI Time Estimate (summing Work Time column)
    let totalLowMinutes = 0;
    let totalHighMinutes = 0;

    data.forEach(item => {
        if (item.aiTimeEstimate && item.aiTimeEstimate !== 'N/A' && !item.aiTimeEstimate.includes('Calculation Error')) {
            const parsedRange = parseAiEstimateToRange(item.aiTimeEstimate);
            totalLowMinutes += parsedRange.min;
            totalHighMinutes += parsedRange.max;
        }
    });

    const totalEstimateString = `${formatMinutesToHours(totalLowMinutes)} - ${formatMinutesToHours(totalHighMinutes)}`;


    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`ACTIVITY SUMMARY FOR ${selectedAgent.contact.name.toUpperCase()}`, 15, currentY);
    doc.setFont(undefined, 'normal');

    const summaryBody = [
        ['TOTAL AGENT ACTIVITY', totalActivity.toString()],
        ['Total Responses', totalResponses.toString()],
        ['Total Actions', totalActions.toString()],
        ['Tickets "Resolved" or "Closed"', totalTicketsClosed.toString()],
        ['AI ESTIMATED TOTAL WORK TIME', totalEstimateString],
    ];

    doc.autoTable({
        startY: currentY + 5,
        head: [['Metric', 'Total']],
        body: summaryBody,
        theme: 'striped',
        headStyles: { fillColor: [31, 41, 55], fontStyle: 'bold' },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 70 },
            1: { halign: 'center' }
        },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // --- Main Activity Table ---
    
    const head = [
        [{ content: 'Ticket Details', colSpan: 11, styles: { halign: 'center', fillColor: [0, 153, 255], textColor: 255, fontStyle: 'bold' } },
         { content: 'Response/Action Details', colSpan: 7, styles: { halign: 'center', fillColor: [0, 153, 255], textColor: 255, fontStyle: 'bold' } }],
        [
            'No.', 'Ticket / Requester', 'Subject', 'Ticket Type', 'Initial Urgency', 'Agent', 'Group', 'Ticket Status', 'Days since created', 'Last Updated', 'Last Response', 
            'Last Reply', 'Responses', 'Actions', 'AI Summary', 'Customer sentiment', 'AI ESTIMATED WORK TIME', 'AI ESTIMATED TOTAL WORK TIME'
        ]
    ];

    const body = data.map((item, index) => {
        const formattedActionDetails = item.formattedActionDetails || 'N/A';
        const summaryParagraphs = item.summary ? item.summary.split('\n\n').map(p => p.replace(/\*\*/g, '')).join('\n') : '';
        const typeAndCat = `${item.type || 'N/A'} / ${item.category || 'Other'}`;
        
        let lastResponseVal = item.lastResponse !== 'N/A' ? calculateRelativeTime(item.lastResponse) : 'N/A';
        if (item.lastResponseAuthorType) {
            lastResponseVal += ` (${item.lastResponseAuthorType})`;
        }

        return [
            index + 1,
            `#${item.ticketId}`,
            item.subject,
            typeAndCat,
            item.urgency || 'N/A',
            item.agentName,
            item.groupName,
            statusMap[item.status] || 'Unknown', // Use dynamic status
            calculateAgeInDays(item.createdAt),
            calculateRelativeTime(item.lastUpdated), 
            lastResponseVal, 
            item.lastReplyBy,
            item.agentResponseCount,
            formattedActionDetails,
            summaryParagraphs,
            item.customerSentiment || 'Undetermined',
            item.aiTimeEstimate,
            item.totalAiTimeEstimate || 'N/A',
        ];
    });

    doc.autoTable({
        head,
        body,
        startY: currentY,
        theme: 'grid',
        headStyles: {
            fillColor: [31, 41, 55],
            textColor: 255,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' }, // No.
            1: { cellWidth: 16 }, // Ticket ID
            2: { cellWidth: 20 }, // Subject
            3: { cellWidth: 16 }, // Ticket Type
            4: { cellWidth: 10, halign: 'center' }, // Urgency
            5: { cellWidth: 14 }, // Agent
            6: { cellWidth: 14 }, // Group
            7: { cellWidth: 10, halign: 'center' }, // Status
            8: { cellWidth: 10, halign: 'center' }, // Age
            9: { cellWidth: 12 }, // Last Updated
            10: { cellWidth: 12 }, // Last Response
            11: { cellWidth: 20 }, // Last Reply
            12: { cellWidth: 8, halign: 'center' }, // Responses
            13: { cellWidth: 14 }, // Actions
            14: { cellWidth: 35 }, // AI Summary
            15: { cellWidth: 14 }, // Sentiment
            16: { cellWidth: 14 }, // Work time
            17: { cellWidth: 14 }, // Total time
        },
        didParseCell: (data: any) => {
            if (data.column.index === 1 && data.section === 'body') { 
                data.cell.styles.textColor = [0, 153, 255];
                data.cell.styles.fontStyle = 'bold';
            }
        },
        didDrawCell: function (data: any) {
            if (data.column.index === 1 && data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.startsWith('#')) {
                const ticketId = data.cell.raw.replace('#', '');
                const url = `${FRESHDESK_DOMAIN}/a/tickets/${ticketId}`;
                doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            }
            
            // Draw Vertical Separator Line after 'Last Response' (Index 10)
            if (data.column.index === 10) {
                 doc.setDrawColor(0, 153, 255); // FD Blue
                 doc.setLineWidth(0.5);
                 doc.line(data.cell.x + data.cell.width, data.cell.y, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
        }
    });

    doc.save(`Agent_Activity_Report_${selectedAgent.contact.name.replace(/\s/g, '_')}_${dateRange.from}_to_${dateRange.to}.pdf`);
};