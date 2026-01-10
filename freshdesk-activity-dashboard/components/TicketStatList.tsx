
import React, { useState, useMemo, useEffect } from 'react';
import type { Ticket } from '../types.ts';
import { FRESHDESK_DOMAIN } from '../constants.ts';
import { summarizeGroupTickets } from '../services/geminiService.ts';
import Spinner from './Spinner.tsx';

interface ExtraColumn {
    header: string;
    render: (ticket: Ticket) => React.ReactNode;
}

interface TicketStatListProps {
    tickets: Ticket[];
    type: 'created' | 'reopened' | 'closed' | 'worked' | 'start' | 'end' | 'customerResponded';
    onClose: () => void;
    groupMap: Map<number, string>;
    onUpdateCategory: (ticketId: number, category: string) => void;
    embedded?: boolean; // New prop to disable modal styling
    extraColumns?: ExtraColumn[]; // New prop to add AI columns
}

const formatDate = (dateStr: string | null | undefined, includeTime: boolean = true) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (!includeTime) return d.toLocaleDateString();
    return d.toLocaleString();
};

const getUrgencyText = (priority: number): string => {
    switch (priority) {
        case 1: return 'Low';
        case 2: return 'Medium';
        case 3: return 'High';
        case 4: return 'Urgent';
        default: return 'N/A';
    }
}

const getUrgencyColor = (priority: number): string => {
    switch (priority) {
        case 1: return 'text-green-400';
        case 2: return 'text-yellow-400';
        case 3: return 'text-orange-400';
        case 4: return 'text-red-500 font-bold';
        default: return 'text-gray-400';
    }
}

const CATEGORIES = [
    'Shipments', 'Returns', 'Refunds', 'Exchanges', 'Incorrect items',
    'Damages/defects', 'Discount/Voucher', 'Stock/product', 'Spam', 'Other'
];

const TicketStatList: React.FC<TicketStatListProps> = ({ tickets, type, onClose, groupMap, onUpdateCategory, embedded = false, extraColumns = [] }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<{ urgency: string, category: string, group: string }>({ urgency: '', category: '', group: '' });
    const [editingCategory, setEditingCategory] = useState<{ id: number, val: string } | null>(null);
    const [groupSummary, setGroupSummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    const titleMap: Record<string, string> = {
        created: 'Tickets Created in Period',
        reopened: 'Tickets Reopened in Period',
        customerResponded: 'Customer Responded Tickets',
        closed: 'Tickets Closed in Period',
        worked: 'All Tickets Worked in Period',
        start: 'Tickets at Start (N/A)',
        end: 'Tickets at End (N/A)'
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredTickets = useMemo(() => {
        return tickets.filter(t => {
            if (filters.urgency && getUrgencyText(t.priority) !== filters.urgency) return false;
            if (filters.category && (t.category || 'Other') !== filters.category) return false;
            if (filters.group && (groupMap.get(t.group_id) || 'Unknown Group') !== filters.group) return false;
            return true;
        }).sort((a, b) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            
            let valA: any = '';
            let valB: any = '';

            if (key === 'id') { valA = a.id; valB = b.id; }
            else if (key === 'urgency') { valA = a.priority; valB = b.priority; }
            else if (key === 'category') { valA = a.category || ''; valB = b.category || ''; }
            else if (key === 'group') { valA = groupMap.get(a.group_id) || ''; valB = groupMap.get(b.group_id) || ''; }
            else if (key === 'subject') { valA = a.subject; valB = b.subject; }
            else if (key === 'agent') { valA = a.agent_name || ''; valB = b.agent_name || ''; }
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [tickets, filters, sortConfig, groupMap]);

    const handleGenerateGroupSummary = async () => {
        setIsGeneratingSummary(true);
        // Take top 20 tickets for summary context to avoid token limits/cost
        const sampleTickets = filteredTickets.slice(0, 20);
        const subjects = sampleTickets.map(t => `${t.subject} (${t.type || 'General'})`);
        
        try {
            const summary = await summarizeGroupTickets(subjects);
            setGroupSummary(summary);
        } catch (error) {
            setGroupSummary("Unable to generate summary at this time.");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    // Reset pagination when data or filters change
    useEffect(() => {
        setCurrentPage(1);
        setGroupSummary(null); // Reset summary when filter changes
    }, [tickets.length, filters]);

    // Calculate Pagination
    const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);
    const paginatedTickets = filteredTickets.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Unique values for filters
    const uniqueUrgencies = Array.from(new Set(tickets.map(t => getUrgencyText(t.priority))));
    const uniqueCategories = Array.from(new Set(tickets.map(t => t.category || 'Other')));
    const uniqueGroups = Array.from(new Set(tickets.map(t => groupMap.get(t.group_id) || 'Unknown Group')));

    const containerClass = embedded 
        ? "bg-gray-800 rounded-lg border border-gray-700 overflow-hidden w-full flex flex-col"
        : "mt-6 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-2xl relative z-10 w-[98vw] h-full flex flex-col";

    return (
        <div className={containerClass}>
            {!embedded && (
                <div className="flex justify-between items-center p-6 bg-gray-900 border-b border-gray-700">
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase">{titleMap[type] || 'Ticket List'}</h3>
                        {/* Group Summary UI */}
                        {filteredTickets.length > 0 && (
                            <div className="mt-2">
                                {groupSummary ? (
                                    <div className="bg-blue-900/30 border border-blue-800 p-3 rounded-md text-sm text-gray-200 animate-fade-in">
                                        <p className="font-bold text-blue-300 mb-1">AI Group Summary:</p>
                                        <p className="whitespace-pre-line">{groupSummary}</p>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleGenerateGroupSummary} 
                                        disabled={isGeneratingSummary}
                                        className="text-xs bg-fd-blue/20 hover:bg-fd-blue/40 text-fd-blue border border-fd-blue/50 px-3 py-1 rounded transition-colors flex items-center gap-2"
                                    >
                                        {isGeneratingSummary ? <Spinner message="" /> : "✨ Analyse Group Context"}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 rounded hover:bg-gray-800" aria-label="Close list">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
            
            {/* Filter Bar */}
            <div className="bg-gray-850 p-4 flex flex-wrap gap-4 border-b border-gray-700 text-sm items-center">
                <select 
                    className="bg-gray-700 text-gray-300 rounded border-gray-600 focus:ring-1 focus:ring-fd-blue px-3 py-2"
                    value={filters.urgency}
                    onChange={e => setFilters(prev => ({ ...prev, urgency: e.target.value }))}
                >
                    <option value="">All Urgencies</option>
                    {uniqueUrgencies.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <select 
                    className="bg-gray-700 text-gray-300 rounded border-gray-600 focus:ring-1 focus:ring-fd-blue px-3 py-2"
                    value={filters.category}
                    onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
                >
                    <option value="">All Categories</option>
                    {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                    className="bg-gray-700 text-gray-300 rounded border-gray-600 max-w-xs focus:ring-1 focus:ring-fd-blue px-3 py-2"
                    value={filters.group}
                    onChange={e => setFilters(prev => ({ ...prev, group: e.target.value }))}
                >
                    <option value="">All Groups</option>
                    {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <span className="text-gray-500 ml-auto text-xs font-bold">
                    Showing {paginatedTickets.length} of {filteredTickets.length} records (Total: {tickets.length})
                </span>
            </div>

            <div className={`flex-1 overflow-auto custom-scrollbar bg-gray-900 ${embedded ? 'max-h-[600px]' : ''}`}>
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800 sticky top-0 z-10 shadow-md">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('id')}>
                                Ticket ID {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('urgency')}>
                                Urgency {sortConfig?.key === 'urgency' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('category')}>
                                Category {sortConfig?.key === 'category' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('subject')}>
                                Subject {sortConfig?.key === 'subject' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                             {extraColumns.map((col, idx) => (
                                <th key={idx} className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    {col.header}
                                </th>
                            ))}
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Requester</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('agent')}>
                                Agent {sortConfig?.key === 'agent' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('group')}>
                                Group {sortConfig?.key === 'group' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Created At</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Closed At</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {paginatedTickets.map(ticket => (
                            <tr key={ticket.id} className="hover:bg-gray-700/50 transition-colors duration-150">
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <a href={`https://${FRESHDESK_DOMAIN}/a/tickets/${ticket.id}`} target="_blank" rel="noopener noreferrer" className="text-fd-blue hover:underline font-bold">
                                        {ticket.id}
                                    </a>
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getUrgencyColor(ticket.priority)}`}>
                                    {getUrgencyText(ticket.priority)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {editingCategory?.id === ticket.id ? (
                                        <select 
                                            className="bg-gray-600 text-white text-xs p-1 rounded focus:ring-2 focus:ring-fd-blue outline-none"
                                            value={editingCategory.val}
                                            onChange={(e) => {
                                                const newVal = e.target.value;
                                                onUpdateCategory(ticket.id, newVal);
                                                setEditingCategory(null);
                                            }}
                                            onBlur={() => setEditingCategory(null)}
                                            autoFocus
                                        >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    ) : (
                                        <span 
                                            className="inline-block bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-xs border border-gray-600 cursor-pointer hover:bg-gray-600 hover:border-gray-500 transition-all font-medium"
                                            onClick={() => setEditingCategory({ id: ticket.id, val: ticket.category || 'Other' })}
                                            title="Click to edit"
                                        >
                                            {ticket.category || 'Other'}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate" title={ticket.subject}>
                                    {ticket.subject}
                                </td>
                                {extraColumns.map((col, idx) => (
                                    <td key={idx} className="px-6 py-4 text-sm text-gray-300">
                                        {col.render(ticket)}
                                    </td>
                                ))}
                                <td className="px-6 py-4 text-sm text-gray-300">
                                    {ticket.requester?.name || 'N/A'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-300">
                                    {ticket.agent_name || 'Unassigned'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-300">
                                    {groupMap.get(ticket.group_id) || 'Unknown Group'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-300 whitespace-nowrap">
                                    {formatDate(ticket.created_at)}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-300 whitespace-nowrap">
                                    {formatDate(ticket.stats?.closed_at || (ticket.status === 5 ? ticket.updated_at : null), type !== 'worked')}
                                </td>
                            </tr>
                        ))}
                        {filteredTickets.length === 0 && (
                            <tr>
                                <td colSpan={9 + extraColumns.length} className="px-6 py-12 text-center text-gray-500 text-sm">
                                    No tickets found matching current filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="bg-gray-850 border-t border-gray-700 p-4 flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                        Page <span className="font-bold text-white">{currentPage}</span> of <span className="font-bold text-white">{totalPages}</span>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium border border-gray-600"
                        >
                            Previous
                        </button>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium border border-gray-600"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TicketStatList;
