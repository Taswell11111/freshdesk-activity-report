
import { DebugLog } from '../types.ts';

type Listener = (logs: DebugLog[]) => void;

class DebugService {
    private logs: DebugLog[] = [];
    private listeners: Set<Listener> = new Set();
    private maxLogs = 1000;
    private isInternal = false; // Guard to prevent infinite recursion when logging to console

    addLog(level: DebugLog['level'], message: string, context?: string) {
        // If the log comes from our own internal console write, ignore it to prevent recursion
        if (this.isInternal) return;

        const now = new Date();
        const timestamp = now.toLocaleTimeString('en-ZA', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            fractionalSecondDigits: 3 
        } as any);
        
        const dateStr = now.toISOString().split('T')[0];

        const log: DebugLog = {
            timestamp: `${dateStr} ${timestamp}`,
            level,
            message,
            context
        };
        
        this.logs = [log, ...this.logs].slice(0, this.maxLogs);
        this.notify();
        
        // Write to the actual browser console for DevTools, ensuring we don't trigger the proxy
        this.isInternal = true;
        const prefix = `[${log.timestamp}] [${level.toUpperCase()}]${context ? ` [${context}]` : ''}`;
        try {
            if (level === 'error') console.error(prefix, message);
            else if (level === 'warning') console.warn(prefix, message);
            else console.log(prefix, message);
        } catch (e) {
            // Fallback if console access fails
        } finally {
            this.isInternal = false;
        }
    }

    private notify() {
        this.listeners.forEach(l => l(this.logs));
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        listener(this.logs);
        return () => { this.listeners.delete(listener); };
    }

    clear() {
        this.logs = [];
        this.notify();
    }

    getLogs() {
        return this.logs;
    }

    /**
     * Captures browser console logs and window errors to display them in the app's Debug Bar.
     * Useful for debugging on devices/browsers where DevTools is not easily accessible.
     */
    enableConsoleProxy() {
        if ((window as any).__debugServiceProxyActive) return;
        (window as any).__debugServiceProxyActive = true;

        const formatArgs = (args: any[]) => args.map(arg => {
            if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg); } catch { return String(arg); }
            }
            return String(arg);
        }).join(' ');

        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog.apply(console, args);
            if (!this.isInternal) this.addLog('info', formatArgs(args), 'Console');
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            if (!this.isInternal) this.addLog('warning', formatArgs(args), 'Console');
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            if (!this.isInternal) this.addLog('error', formatArgs(args), 'Console');
        };

        window.onerror = (msg, url, line, col, error) => {
             this.addLog('error', `Uncaught Error: ${msg} (${url}:${line}:${col})`, 'Window');
             return false;
        };

        window.onunhandledrejection = (event) => {
             this.addLog('error', `Unhandled Promise Rejection: ${event.reason}`, 'Window');
        };
        
        this.addLog('success', 'Console Bridge Activated. Browser logs will appear here.', 'System');
    }
}

export const debugService = new DebugService();
