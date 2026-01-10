
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import type { DashboardData, Ticket, TicketGroupStat, ActivityReport } from '../types.ts';
import { FRESHDESK_DOMAIN } from '../constants.ts';
import { getCachedAnalysis } from '../services/cacheService.ts';
import { getGroupColor, GROUP_COLOR_MAPPING } from '../utils/logicUtils.ts';

// declare var ChartDataLabels: any; // Removed

export const generateDashboardHtmlReport = (data: DashboardData, downloadLocally: boolean = true) => {
    const { dateRange, agentSummary, ticketStats, prevTicketStats, groupStats, ticketLists, ticketsAtPeriodEndCount, ticketsAtPeriodStartCount, reportGeneratedTimestamp, _24hTicketStats } = data;

    const totalBar = ticketStats.created + ticketStats.worked + ticketStats.closed + ticketStats.reopened;
    const activityLogTotal = totalBar; 
    const getW = (val: number) => totalBar > 0 ? (val / totalBar) * 100 : 0;
    
    const formatDiff = (curr: number, prev: number, invertColor: boolean = false) => {
        const diff = curr - prev;
        const sign = diff > 0 ? '+' : '';
        const color = diff > 0 ? (invertColor ? 'text-green-400' : 'text-red-400') : (diff < 0 ? (invertColor ? 'text-red-400' : 'text-green-400') : 'text-gray-400');
        return `<span class="text-2xl font-bold ${color}">${sign}${diff}</span>`;
    };

    const enrichedWorkedTickets = ticketLists.worked.map(t => {
        const cachedReport = getCachedAnalysis(t.id, t.agent_name || '', dateRange, t.updated_at);
        return {
            id: t.id,
            subject: t.subject,
            status: t.status,
            agent_name: t.agent_name,
            created_at: t.created_at,
            group_id: t.group_id,
            ai_summary: cachedReport ? cachedReport.summary : null,
            ai_estimate: cachedReport ? cachedReport.aiTimeEstimate : null
        };
    });

    const reportData = {
        created: ticketLists.created.map(t => ({ id: t.id, subject: t.subject, status: t.status, agent_name: t.agent_name, created_at: t.created_at, updated_at: t.updated_at, group_id: t.group_id })),
        reopened: ticketLists.reopened ? ticketLists.reopened.map(t => ({ id: t.id, subject: t.subject, status: t.status, agent_name: t.agent_name, created_at: t.created_at, updated_at: t.updated_at, group_id: t.group_id })) : [],
        worked: enrichedWorkedTickets,
        closed: ticketLists.closed.map(t => ({ id: t.id, subject: t.subject, status: t.status, agent_name: t.agent_name, created_at: t.created_at, updated_at: t.updated_at, group_id: t.group_id, stats: t.stats })),
        active: ticketLists.active ? ticketLists.active.map(t => ({ id: t.id, subject: t.subject, status: t.status, agent_name: t.agent_name, created_at: t.created_at, updated_at: t.updated_at, group_id: t.group_id })) : [],
        prevCreated: ticketLists.prevCreated?.map(t => ({ id: t.id, created_at: t.created_at })),
        prevClosed: ticketLists.prevClosed?.map(t => ({ id: t.id, created_at: t.created_at, updated_at: t.updated_at, stats: t.stats })),
        agentSummary: agentSummary,
        groups: groupStats.ticketsAtPeriodEnd.map(g => ({ id: g.groupId, name: g.groupName })) // Simplified group map
    };

    // Helper to generate consistent colors for chart data
    const generateDoughnutData = (stats: TicketGroupStat[]) => {
        if (!stats || !Array.isArray(stats)) {
            return { labels: [], data: [], backgroundColor: [], typeDistributions: [] };
        }
        const sorted = [...stats].sort((a,b) => b.count - a.count);
        const labels = sorted.map(s => s.groupName);
        const data = sorted.map(s => s.count);
        const backgroundColor = sorted.map(s => getGroupColor(s.groupName));
        const typeDistributions = sorted.map(s => s.typeDistribution || {});
        return { labels, data, backgroundColor, typeDistributions };
    };

    const doughnutCreated = generateDoughnutData(groupStats.created);
    const doughnutReopened = generateDoughnutData(groupStats.reopened);
    const doughnutWorked = generateDoughnutData(groupStats.worked);
    const doughnutClosed = generateDoughnutData(groupStats.closed);
    const doughnutActive = generateDoughnutData(groupStats.ticketsAtPeriodEnd);
    const doughnutStart = generateDoughnutData(groupStats.ticketsAtPeriodStart);

    // Filter agents with 0 activity
    const sortedAgents = [...agentSummary]
        .filter(a => a.totalAgentActivity > 0 || a.totalClosed > 0)
        .sort((a, b) => a.agentName.localeCompare(b.agentName));

    const generateAgentTableRows = () => {
        return sortedAgents.map(s => {
            let agentRowsHtml = `
                <tr class="hover:bg-gray-800 border-t border-gray-700 bg-gray-800/50 group">
                    <td class="px-2 py-2 text-fd-blue font-bold text-xl text-left cursor-pointer hover:underline" onclick="openAgentModal('${s.agentId}')">${s.agentName}</td>
                    <td class="px-2 py-2 text-center text-white font-bold text-lg">${s.totalAgentActivity}</td>
                    <td class="px-2 py-2 text-center text-gray-300 text-base">${s.totalResponses}</td>
                    <td class="px-2 py-2 text-center text-gray-300 text-base">${s.totalActions}</td>
                    <td class="px-2 py-2 text-center text-green-400 text-base">${s.totalClosed}</td>
                    <td class="px-2 py-2 text-right text-gray-400 text-base">${s.activityRatio}</td>
                    <td class="px-2 py-2 text-center text-gray-300 text-base">${s.estimatedTimeRange}</td>
                </tr>`;
    
            if (s.dailyBreakdown && s.dailyBreakdown.length > 1) {
                 s.dailyBreakdown.forEach(day => {
                     agentRowsHtml += `
                        <tr class="bg-gray-800/20 hover:bg-gray-800/40">
                            <td class="px-2 py-1 pl-8 text-gray-400 text-xs italic font-mono cursor-pointer" onclick="openAgentModal('${s.agentId}', '${day.date}')">↳ ${day.date}</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">${day.totalAgentActivity}</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">${day.totalResponses}</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">${day.totalActions}</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">${day.totalClosed}</td>
                            <td class="px-2 py-1 text-right text-gray-600 text-xs">-</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">${day.estimatedTimeRange}</td>
                        </tr>
                     `;
                 });
            }
            
            if (s.groupStats && s.groupStats.length > 0) {
                agentRowsHtml += `
                    <tr class="bg-gray-800/40">
                        <td class="px-2 py-1 pl-8 text-gray-300 text-xs font-bold uppercase tracking-wider italic">Group Breakdown</td>
                        <td class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider italic">Tickets Worked</td>
                        <td class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider italic">--</td>
                        <td class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider italic">--</td>
                        <td class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider italic">--</td>
                        <td class="px-2 py-1"></td>
                    </tr>
                `;
                s.groupStats.forEach(group => {
                     agentRowsHtml += `
                        <tr class="bg-gray-800/20 hover:bg-gray-800/40">
                            <td class="px-2 py-1 pl-8 text-gray-400 text-xs italic font-mono">
                                ↳ ${group.groupName} <span style="font-size:10px;color:#6B7280;">(${group.percent})</span>
                            </td>
                            <td class="px-2 py-1 text-center text-gray-400 text-xs">${group.worked}</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">--</td>
                            <td class="px-2 py-1 text-center text-gray-500 text-xs">--</td>
                            <td class="px-2 py-1 text-center text-green-500 text-xs">${group.closed}</td>
                            <td class="px-2 py-1"></td>
                        </tr>
                     `;
                });
            }
            return agentRowsHtml;
        }).join('');
    };

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Freshdesk Activity Dashboard Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>
    <style>
        body { background-color: #111827; color: #e5e7eb; font-family: sans-serif; font-size: 1rem; } 
        .bg-fd-blue { background-color: #0099ff; }
        .text-fd-blue { color: #0099ff; }
        .compact-table th { padding: 4px 8px; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; } 
        .compact-table td { padding: 4px 8px; font-size: 1rem; }
        .modal { display: none; position: fixed; z-index: 50; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.8); }
        .modal-content { background-color: #1f2937; margin: 5% auto; padding: 20px; border: 1px solid #374151; width: 90%; max-width: 1000px; border-radius: 8px; max-height: 80vh; display: flex; flex-direction: column; }
    </style>
</head>
<body class="p-8 pb-20">
    <div class="max-w-[95%] mx-auto">
        <header class="mb-8 border-b border-gray-700 pb-6 bg-gradient-to-r from-gray-900 to-blue-900 p-6 rounded-lg">
            <h1 class="text-5xl font-bold text-white">Freshdesk Agent Activity Dashboard</h1>
            <p class="text-xl text-gray-400 mt-2">Report for period: <span class="text-blue-500 font-bold">${dateRange.from} to ${dateRange.to}</span></p>
            <p class="text-base text-gray-500 mt-1">Generated on: ${reportGeneratedTimestamp}</p>
        </header>

        <section class="mb-10">
            <!-- Activity Log Bar Moved Up -->
            <h2 class="text-2xl font-bold text-white uppercase mb-4 text-center">Activity Log built with ${activityLogTotal} tickets</h2>
            <div class="mb-8 bg-gray-900 rounded-full h-10 flex overflow-hidden max-w-6xl mx-auto shadow-md border border-gray-700">
                ${getW(ticketStats.created) > 0 ? `<div style="width: ${getW(ticketStats.created)}%" class="bg-blue-600 h-full flex items-center justify-center text-sm font-bold text-white uppercase px-2 truncate">Created: ${ticketStats.created}</div>` : ''}
                ${getW(ticketStats.reopened) > 0 ? `<div style="width: ${getW(ticketStats.reopened)}%" class="bg-yellow-500 h-full flex items-center justify-center text-sm font-bold text-white uppercase px-2 truncate">Reopened: ${ticketStats.reopened}</div>` : ''}
                ${getW(ticketStats.worked) > 0 ? `<div style="width: ${getW(ticketStats.worked)}%" class="bg-purple-600 h-full flex items-center justify-center text-sm font-bold text-white uppercase px-2 truncate">Worked: ${ticketStats.worked}</div>` : ''}
                ${getW(ticketStats.closed) > 0 ? `<div style="width: ${getW(ticketStats.closed)}%" class="bg-green-600 h-full flex items-center justify-center text-sm font-bold text-white uppercase px-2 truncate">Closed: ${ticketStats.closed}</div>` : ''}
            </div>

            <!-- 1. SNAPSHOT ROW -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <!-- Start -->
                <div class="p-5 bg-gray-800 rounded-lg shadow-xl border border-gray-700 text-center min-h-[450px]">
                    <h3 class="text-gray-400 text-xl font-bold uppercase mb-1">Tickets at Period Start</h3>
                    <p class="text-7xl font-bold text-white mb-2">${ticketsAtPeriodStartCount}</p>
                    <div class="flex justify-center h-80">
                        <canvas id="doughnutStart"></canvas>
                    </div>
                    <div class="text-sm text-gray-500 mt-2">Calc: Active - Created - Reopened + Closed</div>
                </div>
                <!-- End -->
                <div class="p-5 bg-gray-800 rounded-lg shadow-xl border border-gray-700 text-center min-h-[450px]">
                    <h3 class="text-blue-500 text-xl font-bold uppercase mb-1">CURRENT ACTIVE TICKETS (SNAPSHOT)</h3>
                    <p class="text-7xl font-bold text-white mb-4 cursor-pointer hover:text-blue-400" onclick="openTicketList('active', 'ALL ACTIVE TICKETS')">${ticketsAtPeriodEndCount}</p>
                    <div class="flex justify-center h-80">
                        <canvas id="doughnutActive"></canvas>
                    </div>
                </div>
            </div>

            <!-- 3. Timeline Chart & Table -->
            <section class="mt-8 mb-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
                <h2 class="text-xl font-bold text-white uppercase mb-4 text-center tracking-wider">
                    Ticket Volume Timeline by Hour
                </h2>
                <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <div id="timeline-dataType-selector" class="flex bg-gray-900 p-1 rounded-lg text-sm font-bold">
                        <button data-type="created" class="timeline-tab active px-4 py-2 rounded-md bg-blue-600 text-white">Created</button>
                        <button data-type="closed" class="timeline-tab px-4 py-2 rounded-md text-gray-400 hover:bg-gray-700">Closed</button>
                    </div>
                </div>
                <div class="h-72 relative">
                    <canvas id="timelineChart"></canvas>
                </div>
                
                <div id="timelineTableContainer" class="mt-8 overflow-x-auto bg-gray-900 rounded-lg border border-gray-700">
                    <!-- Table injected by JS -->
                </div>
            </section>
            
            <!-- 4. Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8 mt-8">
                <!-- Created -->
                <div class="bg-gray-800 p-4 rounded-lg border-t-4 border-blue-500 shadow-xl hover:bg-gray-750 transition overflow-hidden">
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <h3 class="text-blue-400 text-sm font-bold uppercase tracking-widest">CREATED</h3>
                        <div class="text-right cursor-pointer" onclick="openTicketList('created', 'CREATED')">
                            <span class="text-3xl font-bold text-white block">${ticketStats.created}</span>
                            <div class="text-sm font-bold text-gray-400 mt-1 uppercase">Vs Prev</div>
                            ${formatDiff(ticketStats.created, prevTicketStats.created)}
                        </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-gray-700 flex justify-center h-48">
                        <canvas id="doughnutCreated"></canvas>
                    </div>
                </div>

                <!-- Reopened -->
                <div class="bg-gray-800 p-4 rounded-lg border-t-4 border-yellow-500 shadow-xl hover:bg-gray-750 transition overflow-hidden">
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <h3 class="text-yellow-400 text-sm font-bold uppercase tracking-widest">REOPENED</h3>
                        <div class="text-right cursor-pointer" onclick="openTicketList('reopened', 'REOPENED')">
                            <span class="text-3xl font-bold text-white block">${ticketStats.reopened}</span>
                            <div class="text-sm font-bold text-gray-400 mt-1 uppercase">Vs Prev</div>
                            ${formatDiff(ticketStats.reopened, prevTicketStats.reopened)}
                        </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-gray-700 flex justify-center h-48">
                        <canvas id="doughnutReopened"></canvas>
                    </div>
                </div>

                <!-- Worked Not Closed -->
                <div class="bg-gray-800 p-4 rounded-lg border-t-4 border-purple-500 shadow-xl hover:bg-gray-750 transition overflow-hidden">
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <h3 class="text-purple-400 text-sm font-bold uppercase tracking-widest">WORKED NOT CLOSED</h3>
                        <div class="text-right cursor-pointer" onclick="openTicketList('worked', 'WORKED NOT CLOSED')">
                            <span class="text-3xl font-bold text-white block">${ticketStats.worked}</span>
                            <div class="text-sm font-bold text-gray-400 mt-1 uppercase">Vs Prev</div>
                            ${formatDiff(ticketStats.worked, prevTicketStats.worked, true)}
                        </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-gray-700 flex justify-center h-48">
                        <canvas id="doughnutWorked"></canvas>
                    </div>
                </div>

                <!-- Worked And Closed -->
                <div class="bg-gray-800 p-4 rounded-lg border-t-4 border-green-500 shadow-xl hover:bg-gray-750 transition overflow-hidden">
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <h3 class="text-green-400 text-sm font-bold uppercase tracking-widest">WORKED AND CLOSED</h3>
                        <div class="text-right cursor-pointer" onclick="openTicketList('closed', 'WORKED AND CLOSED')">
                            <span class="text-3xl font-bold text-white block">${ticketStats.closed}</span>
                            <div class="text-sm font-bold text-gray-400 mt-1 uppercase">Vs Prev</div>
                            ${formatDiff(ticketStats.closed, prevTicketStats.closed, true)}
                        </div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-gray-700 flex justify-center h-48">
                        <canvas id="doughnutClosed"></canvas>
                    </div>
                </div>
            </div>
            
             <div class="mb-8 p-4 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-400">
                <h4 class="font-bold text-gray-300 uppercase mb-2">Data Definitions</h4>
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <li><span class="text-blue-400 font-bold">CREATED:</span> New tickets created within the selected period.</li>
                    <li><span class="text-yellow-400 font-bold">REOPENED:</span> Tickets that moved from Resolved/Closed to Open.</li>
                    <li><span class="text-purple-400 font-bold">WORKED NOT CLOSED:</span> Tickets updated by agents but not yet Resolved/Closed.</li>
                    <li><span class="text-green-400 font-bold">WORKED AND CLOSED:</span> Tickets that were Resolved or Closed.</li>
                </ul>
            </div>
        </section>

        <!-- New Agent Activity Visualization Section -->
        <section class="mb-12 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6">
            <h2 class="text-xl font-bold text-white uppercase mb-4 text-center tracking-wider">Agent Activity Visualisation</h2>
            <div class="h-80 relative">
                <canvas id="agentActivityChart"></canvas>
            </div>
        </section>

        <!-- Agent Summary Table -->
        <section class="mt-12">
            <h2 class="text-3xl font-bold text-white uppercase mb-4">Resource Allocation Matrix</h2>
            <div class="text-white text-sm font-medium mb-2">
                Activity vs Assignment: This matrix counts activity performed by the agent. If Agent A replies to a ticket assigned to Agent B, Agent A gets the credit here.
            </div>
            <div class="overflow-x-auto bg-gray-800 rounded-lg shadow-xl border border-gray-700">
                <table class="min-w-full divide-y divide-gray-700 compact-table">
                    <thead class="bg-gray-900">
                        <tr>
                            <th scope="col" class="text-left text-gray-200">Agent Entity</th>
                            <th scope="col" class="text-center text-gray-200">TOTAL VOL.</th>
                            <th scope="col" class="text-center text-gray-200">Public</th>
                            <th scope="col" class="text-center text-gray-200">Internal</th>
                            <th scope="col" class="text-center text-gray-200">CLOSED</th>
                            <th scope="col" class="text-right text-gray-200">Load %</th>
                            <th scope="col" class="text-center text-gray-200">Est Work Time</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        ${generateAgentTableRows()}
                    </tbody>
                </table>
            </div>
            
            <div class="p-6 bg-black/40 text-sm text-gray-600 font-mono uppercase leading-relaxed tracking-widest mt-4 rounded">
                <p><span class="text-fd-blue font-black mr-2">&bull;</span> Total Vol: Combined public responses and internal system notes</p>
                <p><span class="text-fd-blue font-black mr-2">&bull;</span> Load %: Agent's activity relative to total team activity.</p>
                <p><span class="text-fd-blue font-black mr-2">&bull;</span> Est Work Time: Algorithmic approximation based on character count and activity density</p>
                <p><span class="text-fd-blue font-black mr-2">&bull;</span> Internal: Private notes and system actions</p>
            </div>
        </section>
    </div>

    <!-- Modal Structure -->
    <div id="ticketModal" class="modal">
        <div class="modal-content text-gray-300">
            <div class="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                <h2 id="modalTitle" class="text-2xl font-bold text-white">Ticket Details</h2>
                <span class="text-4xl font-bold cursor-pointer hover:text-white" onclick="closeModal()">&times;</span>
            </div>
            <div id="modalBody" class="overflow-y-auto custom-scrollbar flex-1"></div>
        </div>
    </div>

    <!-- INJECT DATA SCRIPT -->
    <script>
        window.REPORT_DATA = ${JSON.stringify(reportData)};
        const GROUP_COLOR_MAPPING = ${JSON.stringify(GROUP_COLOR_MAPPING)};
        
        // Register DataLabels
        Chart.register(ChartDataLabels);
        Chart.defaults.set('plugins.datalabels', {
            color: '#fff',
            font: { weight: 'bold', size: 10 },
            display: 'auto',
            anchor: 'end',
            align: 'top',
            offset: -4
        });
        
        function renderTable(tickets) {
            let html = '<table class="min-w-full divide-y divide-gray-700 text-base text-left">';
            html += '<thead class="bg-gray-800 font-bold text-gray-400"><tr><th class="px-4 py-2">ID</th><th class="px-4 py-2">Subject</th><th class="px-4 py-2">Status</th><th class="px-4 py-2">Agent</th><th class="px-4 py-2">Created</th><th class="px-4 py-2">AI Summary</th></tr></thead>';
            html += '<tbody class="divide-y divide-gray-700">';
            
            if (!tickets || tickets.length === 0) {
                 html += '<tr><td colspan="6" class="px-4 py-4 text-center">No tickets found.</td></tr>';
            } else {
                tickets.forEach(t => {
                    const statusMap = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
                    html += '<tr class="hover:bg-gray-700">';
                    html += '<td class="px-4 py-2 font-bold text-blue-400"><a href="https://${FRESHDESK_DOMAIN}/a/tickets/' + t.id + '" target="_blank">#' + t.id + '</a></td>';
                    html += '<td class="px-4 py-2 truncate max-w-xs" title="' + t.subject.replace(/"/g, '&quot;') + '">' + t.subject + '</td>';
                    html += '<td class="px-4 py-2">' + (statusMap[t.status] || t.status) + '</td>';
                    html += '<td class="px-4 py-2">' + (t.agent_name || 'Unassigned') + '</td>';
                    html += '<td class="px-4 py-2">' + new Date(t.created_at).toLocaleDateString() + '</td>';
                    if (t.ai_summary) {
                         const summaryPreview = t.ai_summary.length > 50 ? t.ai_summary.substring(0, 50) + '...' : t.ai_summary;
                         html += '<td class="px-4 py-2 text-gray-400 text-sm" title="' + t.ai_summary.replace(/"/g, '&quot;') + '">' + summaryPreview + '</td>';
                    } else {
                        html += '<td class="px-4 py-2 text-gray-600 text-sm">-</td>';
                    }
                    html += '</tr>';
                });
            }
            html += '</tbody></table>';
            document.getElementById('modalBody').innerHTML = html;
        }

        function openTicketList(type, title, groupName = null) {
            document.getElementById('modalTitle').innerText = title;
            let tickets;
            
            if (window.REPORT_DATA[type]) {
                tickets = window.REPORT_DATA[type];
            } else {
                tickets = [];
            }

            if (groupName && tickets) {
                const group = window.REPORT_DATA.groups.find(g => g.name === groupName);
                if (group) {
                    tickets = tickets.filter(t => t.group_id === group.id);
                }
            }
            
            renderTable(tickets);
            document.getElementById('ticketModal').style.display = 'block';
        }

        function openAgentModal(agentId, date = null) {
            const agent = window.REPORT_DATA.agentSummary.find(a => a.agentId == agentId);
            if (!agent) return;
            const tickets = window.REPORT_DATA.worked.filter(t => t.agent_name === agent.agentName);
            
            let title = \`Activity for \${agent.agentName}\`;
            if (date) {
                title += \` on \${date}\`;
            }
            document.getElementById('modalTitle').innerText = title;
            renderTable(tickets);
            document.getElementById('ticketModal').style.display = 'block';
        }

        function closeModal() { document.getElementById('ticketModal').style.display = 'none'; }
        window.onclick = function(e) { if(e.target == document.getElementById('ticketModal')) closeModal(); }

        document.addEventListener('DOMContentLoaded', function() {
            // --- Agent Activity Visualisation Chart ---
            const agentActivityCtx = document.getElementById('agentActivityChart');
            if (agentActivityCtx) {
                const agentData = window.REPORT_DATA.agentSummary
                    .filter(a => a.totalAgentActivity > 0 || a.totalClosed > 0)
                    .sort((a, b) => a.agentName.localeCompare(b.agentName));
                
                const agentLabels = agentData.map(a => a.agentName);
                const responses = agentData.map(a => a.totalResponses);
                const actions = agentData.map(a => a.totalActions);
                const closed = agentData.map(a => a.totalClosed);

                new Chart(agentActivityCtx, {
                    type: 'bar',
                    data: {
                        labels: agentLabels,
                        datasets: [
                            { label: 'Responses', data: responses, backgroundColor: '#3B82F6' },
                            { label: 'Actions', data: actions, backgroundColor: '#8B5CF6' },
                            { label: 'Closed', data: closed, backgroundColor: '#10B981' }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9CA3AF' } },
                            x: { grid: { display: false }, ticks: { color: '#9CA3AF' } }
                        },
                        plugins: {
                            legend: { labels: { color: 'white' } },
                            datalabels: {
                                color: 'white',
                                anchor: 'end',
                                align: 'top',
                                font: { weight: 'bold' },
                                formatter: Math.round
                            }
                        }
                    }
                });
            }

            const createDoughnut = (id, labels, data, backgroundColor, typeDistributions, clickType) => {
                const ctx = document.getElementById(id);
                if (!ctx) return;
                new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{ 
                            data: data, 
                            backgroundColor: backgroundColor, 
                            borderWidth: 2, 
                            borderColor: '#1f2937', 
                            hoverOffset: 10 
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '60%',
                        layout: { padding: { top: 20, bottom: 20, left: 20, right: 20 } },
                        onClick: (evt, els) => {
                            if (els.length > 0) {
                                const idx = els[0].index;
                                const groupName = labels[idx];
                                openTicketList(clickType, \`\${clickType.toUpperCase()} - \${groupName}\`, groupName);
                            }
                        },
                        onHover: (e, els) => {
                            e.native.target.style.cursor = els.length ? 'pointer' : 'default';
                        },
                        plugins: { 
                            datalabels: { display: false }, // Disable values on donut slices to keep clean
                            legend: { 
                                position: 'bottom', // Move legend to bottom to prevent cutoff
                                labels: { 
                                    color: '#FFFFFF', 
                                    boxWidth: 10, 
                                    font: { size: 10 },
                                    generateLabels: (chart) => {
                                        const chartData = chart.data;
                                        if (!chartData.labels || !chartData.datasets[0] || !chartData.datasets[0].data) return [];
                                        return chartData.labels.map((label, i) => ({
                                            text: label + ' [' + chartData.datasets[0].data[i] + ']',
                                            fillStyle: chartData.datasets[0].backgroundColor[i],
                                            strokeStyle: chartData.datasets[0].backgroundColor[i],
                                            lineWidth: 0, hidden: !chart.getDataVisibility(i), index: i,
                                            fontColor: '#FFFFFF'
                                        }));
                                    }
                                } 
                            },
                            tooltip: { 
                                enabled: true, 
                                callbacks: {
                                    label: (c) => \`\${c.label || ''}: \${c.raw} (\${((c.raw / c.dataset.data.reduce((s,v)=>s+v,0))*100).toFixed(1)}%)\`,
                                    afterBody: (tooltipItems) => {
                                        const idx = tooltipItems[0].dataIndex;
                                        const dist = typeDistributions[idx];
                                        if (!dist) return [];
                                        const lines = ['--- Types (Sorted) ---'];
                                        const sorted = Object.entries(dist).sort((a,b) => b[1] - a[1]);
                                        for (const [k, v] of sorted) lines.push(\`\${k}: \${v}\`);
                                        return lines;
                                    }
                                }
                            }
                        }
                    }
                });
            };

            createDoughnut('doughnutCreated', ${JSON.stringify(doughnutCreated.labels)}, ${JSON.stringify(doughnutCreated.data)}, ${JSON.stringify(doughnutCreated.backgroundColor)}, ${JSON.stringify(doughnutCreated.typeDistributions)}, 'created');
            createDoughnut('doughnutReopened', ${JSON.stringify(doughnutReopened.labels)}, ${JSON.stringify(doughnutReopened.data)}, ${JSON.stringify(doughnutReopened.backgroundColor)}, ${JSON.stringify(doughnutReopened.typeDistributions)}, 'reopened');
            createDoughnut('doughnutWorked', ${JSON.stringify(doughnutWorked.labels)}, ${JSON.stringify(doughnutWorked.data)}, ${JSON.stringify(doughnutWorked.backgroundColor)}, ${JSON.stringify(doughnutWorked.typeDistributions)}, 'worked');
            createDoughnut('doughnutClosed', ${JSON.stringify(doughnutClosed.labels)}, ${JSON.stringify(doughnutClosed.data)}, ${JSON.stringify(doughnutClosed.backgroundColor)}, ${JSON.stringify(doughnutClosed.typeDistributions)}, 'closed');
            createDoughnut('doughnutActive', ${JSON.stringify(doughnutActive.labels)}, ${JSON.stringify(doughnutActive.data)}, ${JSON.stringify(doughnutActive.backgroundColor)}, ${JSON.stringify(doughnutActive.typeDistributions)}, 'active');
            createDoughnut('doughnutStart', ${JSON.stringify(doughnutStart.labels)}, ${JSON.stringify(doughnutStart.data)}, ${JSON.stringify(doughnutStart.backgroundColor)}, ${JSON.stringify(doughnutStart.typeDistributions)}, 'start');

            // Timeline Chart Logic
            const timelineCtx = document.getElementById('timelineChart');
            const timelineTableContainer = document.getElementById('timelineTableContainer');
            
            if(timelineCtx) {
                // ... (Timeline chart logic remains similar but relies on standard data provided)
                let timelineChartInstance = null;
                const tickets = window.REPORT_DATA;
                const groups = window.REPORT_DATA.groups; 
                // Need full group list for timeline
                
                const toSATime = (dateStr) => new Date(new Date(dateStr).getTime() + (2 * 60 * 60 * 1000));
                
                const calculateHourly = (ticketList, dateField) => {
                    const counts = Array(24).fill(0);
                    const groupDetails = {}; 
                    for(let i=0; i<24; i++) groupDetails[i] = {};
                    
                    if (!ticketList) return { counts, groupDetails };
                    
                    ticketList.forEach(t => {
                        const dateStr = dateField === 'created_at' ? t.created_at : (t.stats?.closed_at || t.stats?.resolved_at || t.updated_at);
                        if(!dateStr) return;
                        const date = new Date(dateStr);
                        const dateSA = toSATime(date);
                        const hour = dateSA.getUTCHours();
                        const gName = groups.find(g => g.id === t.group_id)?.name || 'Unknown';
                        
                        if (hour >= 0 && hour < 24) {
                            counts[hour]++;
                            groupDetails[hour][gName] = (groupDetails[hour][gName] || 0) + 1;
                        }
                    });
                    return { counts, groupDetails };
                };

                const createdData = calculateHourly(tickets.created, 'created_at');
                const closedData = calculateHourly(tickets.closed, 'closed_at');
                
                // Calculate Previous Data
                const prevCreatedData = calculateHourly(tickets.prevCreated, 'created_at');
                const prevClosedData = calculateHourly(tickets.prevClosed, 'closed_at');
                
                const renderTable = (details, totals) => {
                    const allGroups = new Set();
                    for(let h=0; h<24; h++) Object.keys(details[h]).forEach(g => allGroups.add(g));
                    const groupList = Array.from(allGroups).sort();
                    
                    let tbl = '<table class="min-w-full divide-y divide-gray-800"><thead class="bg-gray-950"><tr><th class="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-950 z-10 border-r border-gray-800">Group</th>';
                    for(let i=0; i<24; i++) tbl += \`<th class="px-2 py-3 text-center text-xs font-bold text-gray-400 uppercase">\${String(i).padStart(2,'0')}:00</th>\`;
                    tbl += '<th class="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-l border-gray-800">Total</th></tr></thead><tbody class="divide-y divide-gray-800">';
                    
                    groupList.forEach(g => {
                        let rowTotal = 0;
                        tbl += '<tr><td class="px-4 py-2 text-xs font-medium text-gray-300 whitespace-nowrap sticky left-0 bg-gray-900 border-r border-gray-800">' + g + '</td>';
                        for(let i=0; i<24; i++) {
                            const val = details[i][g] || 0;
                            rowTotal += val;
                            tbl += \`<td class="px-2 py-2 text-center text-xs \${val > 0 ? 'text-white font-bold' : 'text-gray-600'}">\${val > 0 ? val : '-'}</td>\`;
                        }
                        tbl += \`<td class="px-4 py-2 text-center text-xs font-bold text-fd-blue border-l border-gray-800">\${rowTotal}</td></tr>\`;
                    });
                    
                    // Footer
                    tbl += '<tr class="bg-gray-950 border-t-2 border-gray-800"><td class="px-4 py-3 text-xs font-bold text-white uppercase sticky left-0 bg-gray-950 border-r border-gray-800">Hourly Total</td>';
                    totals.forEach(t => tbl += \`<td class="px-2 py-3 text-center text-xs font-bold text-blue-400">\${t}</td>\`);
                    tbl += \`<td class="px-4 py-3 text-center text-xs font-black text-white border-l border-gray-800">\${totals.reduce((a,b)=>a+b,0)}</td></tr></tbody></table>\`;
                    
                    timelineTableContainer.innerHTML = tbl;
                }

                const renderTimelineChart = (dataType) => {
                    if (timelineChartInstance) timelineChartInstance.destroy();
                    
                    const data = dataType === 'created' ? createdData.counts : closedData.counts;
                    const prevData = dataType === 'created' ? prevCreatedData.counts : prevClosedData.counts;
                    const details = dataType === 'created' ? createdData.groupDetails : closedData.groupDetails;
                    
                    // Render Table
                    renderTable(details, data);

                    const gradient = timelineCtx.getContext('2d').createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, dataType === 'created' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(16, 185, 129, 0.5)');
                    gradient.addColorStop(1, 'rgba(22, 29, 45, 0)');
                    
                    timelineChartInstance = new Chart(timelineCtx, {
                        type: 'line', 
                        data: {
                            labels: Array.from({ length: 24 }, (_, i) => \`\${String(i).padStart(2, '0')}:00\`),
                            datasets: [
                                {
                                    label: dataType === 'created' ? 'Current Period' : 'Current Period',
                                    data: data,
                                    backgroundColor: gradient,
                                    borderColor: dataType === 'created' ? '#3B82F6' : '#10B981',
                                    borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4
                                },
                                {
                                    label: 'Previous Period',
                                    data: prevData,
                                    borderColor: '#6B7280', 
                                    borderWidth: 2, 
                                    borderDash: [5, 5],
                                    pointRadius: 0, 
                                    fill: false, 
                                    tension: 0.4
                                }
                            ]
                        },
                        options: { 
                            responsive: true, maintainAspectRatio: false, 
                            scales: {
                                x: { grid: { display: false }, ticks: { color: '#9CA3AF' } },
                                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9CA3AF' } }
                            },
                            plugins: {
                                datalabels: { display: false } // Disable values on line chart
                            }
                        }
                    });
                };
                
                document.querySelectorAll('.timeline-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelector('.timeline-tab.active').classList.remove('active', 'bg-blue-600', 'bg-green-600', 'text-white');
                        document.querySelector('.timeline-tab.active')?.classList.add('text-gray-400', 'hover:bg-gray-700');
                        tab.classList.add('active', 'text-white');
                        tab.classList.remove('text-gray-400', 'hover:bg-gray-700');
                        const type = tab.dataset.type;
                        if(type === 'created') tab.classList.add('bg-blue-600');
                        else tab.classList.add('bg-green-600');
                        renderTimelineChart(type);
                    });
                });
                renderTimelineChart('created');
            }
        });
    </script>
</body>
</html>`;

    const fileName = `Freshdesk_Dashboard_Report_${dateRange.from}_to_${dateRange.to}.html`;
    
    if (downloadLocally) {
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = fileName;
        a.href = url; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return { htmlContent, fileName };
};
