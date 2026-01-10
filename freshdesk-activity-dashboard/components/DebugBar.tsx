
import React, { useState, useEffect, useRef } from 'react';
import { debugService } from '../services/debugService.ts';
import { DebugLog } from '../types.ts';

const DebugBar: React.FC = () => {
    const [logs, setLogs] = useState<DebugLog[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        return debugService.subscribe(setLogs);
    }, []);

    // Scroll to bottom when expanded or logs change
    useEffect(() => {
        if (isExpanded && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isExpanded, logs]);

    const lastLog = logs[0];

    const getLevelColor = (level: DebugLog['level']) => {
        switch (level) {
            case 'info': return 'text-blue-400';
            case 'success': return 'text-green-400';
            case 'warning': return 'text-yellow-400';
            case 'error': return 'text-red-400 font-bold';
            default: return 'text-gray-400';
        }
    };

    const copyAllLogs = () => {
        const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.context || 'System'}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text).then(() => alert('System logs copied to clipboard.'));
    };

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-[100] bg-black border-t border-gray-800 shadow-2xl transition-all duration-300 ease-in-out flex flex-col ${isExpanded ? 'h-96' : 'h-10'}`}>
            <style>{`
                .debug-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .debug-scrollbar::-webkit-scrollbar-track {
                    background: #111827; 
                }
                .debug-scrollbar::-webkit-scrollbar-thumb {
                    background: #374151; 
                    border-radius: 4px;
                }
                .debug-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4B5563; 
                }
            `}</style>

            {/* Summary Bar - Fixed Height */}
            <div 
                id="debug-trigger"
                className="h-10 flex-none flex items-center justify-between px-4 cursor-pointer hover:bg-gray-900 transition-colors border-b border-gray-800/50"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <span className="text-xxs font-black text-white bg-red-600 px-1.5 rounded mr-2 animate-pulse select-none">DEBUG</span>
                    {lastLog ? (
                        <p className={`text-xs truncate ${getLevelColor(lastLog.level)}`}>
                            <span className="font-mono text-gray-600 mr-2">[{lastLog.timestamp.split(' ')[1]}]</span>
                            {lastLog.context && <span className="font-bold mr-2 uppercase text-xxs opacity-70">[{lastLog.context}]</span>}
                            {lastLog.message}
                        </p>
                    ) : (
                        <p className="text-xs text-gray-600 italic">Listening for system events...</p>
                    )}
                </div>
                <div className="flex items-center gap-4 ml-4 shrink-0">
                    <span className="text-xs text-gray-500 font-bold uppercase hidden sm:inline">{logs.length} EVENTS</span>
                    {isExpanded && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); copyAllLogs(); }}
                            className="text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 px-2 py-1 rounded font-bold uppercase transition-colors"
                        >
                            Copy Log
                        </button>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); debugService.clear(); }}
                        className="text-xs text-gray-600 hover:text-red-400 font-bold uppercase transition-colors"
                    >
                        Clear
                    </button>
                    <svg 
                        className={`w-4 h-4 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                </div>
            </div>

            {/* Terminal View - Flex Grow to fill remaining height */}
            {isExpanded && (
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-scroll px-4 py-4 font-mono text-xs leading-relaxed debug-scrollbar bg-gray-950"
                >
                    <div className="text-gray-500 mb-6 pb-2 border-b border-gray-800 flex justify-between">
                        <div>
                            SYSTEM ARCHITECTURE: STANDALONE DASHBOARD V2.5.22
                            <br />
                            ENVIRONMENT: {window.location.hostname === 'localhost' ? 'LOCAL' : 'PRODUCTION/PROXY'}
                        </div>
                        <div className="text-xxs text-right">
                            {new Date().toDateString()}
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        {[...logs].reverse().map((log, i) => (
                            <div key={i} className="flex gap-4 border-b border-gray-900/30 py-1 hover:bg-gray-900/50 transition-colors group">
                                <span className="text-gray-700 shrink-0 select-none">[{log.timestamp}]</span>
                                <div className="flex flex-col flex-1">
                                    <p className={`${getLevelColor(log.level)} break-all`}>
                                        {log.context && <span className="font-bold mr-2 opacity-70 underline tracking-tighter">[{log.context}]</span>}
                                        {log.message}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {logs.length === 0 && (
                        <div className="h-40 flex flex-col items-center justify-center text-gray-700 italic space-y-2">
                            <div className="text-4xl">📡</div>
                            <p>Network logs will appear here as you interact with the dashboard.</p>
                        </div>
                    )}
                    
                    <div className="h-10"></div> {/* Spacer for scroll buffer */}
                </div>
            )}
        </div>
    );
};

export default DebugBar;
