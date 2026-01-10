
import type { Conversation, ActivityReport } from '../types.ts';

const CONV_PREFIX = 'fd_conv_';
const REPORT_PREFIX = 'fd_report_';

const cleanupCache = () => {
    try {
        console.warn("Storage quota exceeded. Clearing cache to make space.");
        localStorage.clear();
    } catch (e) {
        console.error("Error clearing cache:", e);
    }
};

export const getCachedConversations = (ticketId: number, ticketUpdatedAt: string): Conversation[] | null => {
    try {
        const key = `${CONV_PREFIX}${ticketId}`;
        const cached = localStorage.getItem(key);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            // Invalidate cache if ticket updated after cache was stored
            if (new Date(ticketUpdatedAt) > new Date(timestamp)) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        }
    } catch (e) {
        // Silent fail on read error
    }
    return null;
};

export const cacheConversations = (ticketId: number, ticketUpdatedAt: string, conversations: Conversation[]) => {
    try {
        const key = `${CONV_PREFIX}${ticketId}`;
        const dataToCache = JSON.stringify({ timestamp: new Date().toISOString(), data: conversations });
        localStorage.setItem(key, dataToCache);
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            cleanupCache();
            try {
                 // Try one more time after cleanup
                const key = `${CONV_PREFIX}${ticketId}`;
                const dataToCache = JSON.stringify({ timestamp: new Date().toISOString(), data: conversations });
                localStorage.setItem(key, dataToCache);
            } catch (retryError) {
                // If it still fails, just warn and continue without caching
                // console.warn("Cache quota exceeded even after cleanup. Skipping cache.");
            }
        } else {
            console.warn(`Error writing conversation cache for ticket ${ticketId}:`, e);
        }
    }
};


export const getCachedAnalysis = (ticketId: number, agentName: string, dateRange: {from: string; to: string}, ticketUpdatedAt: string): ActivityReport | null => {
    try {
        const key = `${REPORT_PREFIX}${ticketId}_${agentName}_${dateRange.from}_${dateRange.to}`;
        const cached = localStorage.getItem(key);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (new Date(ticketUpdatedAt) > new Date(timestamp)) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        }
    } catch (e) {
        // Silent fail
    }
    return null;
};

export const cacheAnalysis = (ticketId: number, agentName: string, dateRange: {from: string; to: string}, ticketUpdatedAt: string, report: ActivityReport) => {
    try {
        const key = `${REPORT_PREFIX}${ticketId}_${agentName}_${dateRange.from}_${dateRange.to}`;
        const dataToCache = JSON.stringify({ timestamp: new Date().toISOString(), data: report });
        localStorage.setItem(key, dataToCache);
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
             cleanupCache();
             try {
                const key = `${REPORT_PREFIX}${ticketId}_${agentName}_${dateRange.from}_${dateRange.to}`;
                const dataToCache = JSON.stringify({ timestamp: new Date().toISOString(), data: report });
                localStorage.setItem(key, dataToCache);
             } catch (retryError) {
                 // Silent fail on retry
             }
        }
    }
};
