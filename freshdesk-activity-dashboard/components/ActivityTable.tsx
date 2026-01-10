
import React, { useState } from 'react';
import type { ActivityReport } from '../types.ts';
import { FRESHDESK_DOMAIN } from '../constants.ts';
import TimeEstimateCell from './TimeEstimateCell.tsx';
import SummaryCell from './SummaryCell.tsx';

interface ActivityTableProps {
    data: ActivityReport[];
    onUpdateTimeEstimate: (ticketId: number, newEstimate: string) => void;
    onUpdateSummary: (ticketId: number, newSummary: string) => void;
    statusMap: { [key: number]: string }; // Updated prop
}

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

// Helper to determine status color based on label (safeguarded against non-string inputs)
const getStatusColor = (label: any) => {
    // Ensure label is treated as a string to prevent .toLowerCase() crashes
    const l = String(label || '').toLowerCase();
    
    if (l.includes('open')) return 'bg-blue-500';
    if (l.includes('pending') || l.includes('waiting')) return 'bg-yellow-500';
    if (l.includes('resolved')) return 'bg-green-500';
    if (l.includes('closed')) return 'bg-gray-500';
    return 'bg-gray-600';
};


const ActivityTable: React.FC<ActivityTableProps> = ({ data, onUpdateTimeEstimate, onUpdateSummary, statusMap }) => {
    
    return (
        <div className="flex flex-col gap-4">
            <div className="hidden md:flex bg-gray-900 border-b border-gray-700 text-gray-400 text-xs font-bold uppercase tracking-wider sticky top-0 z-20">
                <div className="w-[300px] p-3 flex-shrink-0 bg-gray-800/50 border-r border-gray-700">
                    Ticket Details Section
                </div>
                {/* Updated grid cols for wider Last Reply (first column) and removed Last Updated/Response */}
                <div className="flex-1 grid grid-cols-[1.2fr_80px_100px_3fr_100px_80px_100px] gap-4 p-3 items-center">
                    <div>Last Reply</div>
                    <div className="text-center">Responses</div>
                    <div>Actions</div>
                    <div>AI Summary</div>
                    <div>Sentiment</div>
                    <div>Work Time</div>
                    <div>TOTAL TIME WORKED ON TICKET</div>
                </div>
            </div>

            {data.map((item, index) => (
                <div key={item.ticketId} className="flex flex-col md:flex-row bg-gray-800 border border-gray-700 rounded-md shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    
                    {/* Left Section: Ticket Details */}
                    <div className="w-full md:w-[300px] bg-gray-850 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-600 p-4 flex flex-col gap-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500 font-medium">No.</span>
                            <span className="text-gray-300 font-bold">{index + 1}</span>
                        </div>
                        
                        <div>
                            <span className="block text-gray-500 font-medium mb-1">Ticket / Requester</span>
                             <a href={`${FRESHDESK_DOMAIN}/a/tickets/${item.ticketId}`} target="_blank" rel="noopener noreferrer" className="text-fd-blue hover:underline font-bold text-base">
                                #{item.ticketId}
                            </a>
                            <div className="text-gray-300 truncate">{item.requesterName}</div>
                        </div>

                        <div>
                            <span className="block text-gray-500 font-medium mb-1">Subject</span>
                            <div className="text-gray-300 break-words text-xs">{item.subject}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="block text-gray-500 font-medium text-xs">Initial Urgency</span>
                                <span className="text-gray-300 text-sm">{item.urgency || 'N/A'}</span>
                            </div>
                             <div>
                                <span className="block text-gray-500 font-medium text-xs">Days since created</span>
                                <span className="text-gray-300 text-sm">{calculateAgeInDays(item.createdAt)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <span className="block text-gray-500 font-medium text-xs">Ticket Type</span>
                                <span className="text-gray-300 text-sm">{item.type || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 font-medium text-xs">Status</span>
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(statusMap[item.status] || 'Unknown')} text-white`}>
                                    {statusMap[item.status] || 'Unknown'}
                                </span>
                            </div>
                        </div>
                        
                         {/* Moved Last Updated and Last Response here */}
                         <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="block text-gray-500 font-medium text-xs">Last Updated</span>
                                <span className="text-gray-300 text-xs">{calculateRelativeTime(item.lastUpdated)}</span>
                            </div>
                             <div>
                                <span className="block text-gray-500 font-medium text-xs">Last Response</span>
                                <div className="flex flex-col">
                                    <span className="text-gray-300 text-xs">{item.lastResponse !== 'N/A' ? calculateRelativeTime(item.lastResponse) : 'N/A'}</span>
                                    {item.lastResponse !== 'N/A' && item.lastResponseAuthorType && (
                                        <span className={`text-xxs font-bold ${item.lastResponseAuthorType === 'Agent' ? 'text-green-500' : 'text-orange-500'}`}>
                                            ({item.lastResponseAuthorType})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <span className="block text-gray-500 font-medium mb-1">Ticket Category</span>
                            <span className="inline-block bg-gray-700 text-gray-200 px-2 py-1 rounded text-xs font-semibold border border-gray-600">
                                {item.category || 'Other'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-gray-700">
                            <div>
                                <span className="block text-gray-500 font-medium text-xs">Agent</span>
                                <span className="text-gray-300 text-xs truncate block" title={item.agentName}>{item.agentName}</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 font-medium text-xs">Group</span>
                                <span className="text-gray-300 text-xs truncate block" title={item.groupName}>{item.groupName}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Section: Response Details - Grid Layout to match Header */}
                    {/* Updated grid cols to remove LastUpdated/Response columns and widen Last Reply */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.2fr_80px_100px_3fr_100px_80px_100px] gap-4 p-4 items-start text-sm">
                        
                        {/* Last Reply - Widened */}
                        <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">Last Reply:</span>
                            <div className="text-gray-300 text-xs max-h-[150px] overflow-y-auto pr-1 break-words border-l-2 border-gray-700 pl-2">
                                <span className="font-semibold text-fd-blue block mb-1">{item.lastReplyBy}:</span>
                                {item.lastMessageContent}
                            </div>
                        </div>

                        {/* Responses Count */}
                        <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">Responses:</span>
                            <div className="text-gray-300 text-center">{item.agentResponseCount}</div>
                        </div>

                        {/* Actions */}
                        <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">Actions:</span>
                            <div className="text-gray-300 text-xs">
                                {item.formattedActionDetails}
                            </div>
                        </div>

                        {/* AI Summary */}
                        <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">AI Summary:</span>
                            <div className="text-gray-300 text-sm">
                                <SummaryCell 
                                    ticketId={item.ticketId}
                                    summary={item.summary}
                                    onSave={onUpdateSummary}
                                />
                            </div>
                        </div>

                         {/* Sentiment */}
                         <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">Sentiment:</span>
                            <div className="text-gray-300 text-xs font-medium bg-gray-900/30 p-1 rounded text-center">
                                {item.customerSentiment || 'Undetermined'}
                            </div>
                        </div>

                        {/* Work Time Estimation */}
                        <div className="md:contents">
                             <span className="md:hidden font-bold text-gray-500 block mb-1">Work Time:</span>
                             <div className="text-gray-300 text-sm">
                                <TimeEstimateCell 
                                    ticketId={item.ticketId}
                                    estimate={item.aiTimeEstimate}
                                    lastResponseTimestamp={item.lastResponseTimestamp}
                                    onSave={onUpdateSummary}
                                />
                             </div>
                        </div>

                        {/* Total Time */}
                        <div className="md:contents">
                            <span className="md:hidden font-bold text-gray-500 block mb-1">TOTAL TIME WORKED ON TICKET:</span>
                            <div className="text-fd-blue font-bold whitespace-nowrap text-sm">
                                {item.totalAiTimeEstimate || 'N/A'}
                            </div>
                        </div>

                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActivityTable;
