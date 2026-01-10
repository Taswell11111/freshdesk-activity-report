
import React, { useState } from 'react';
import { getAuthenticatedAgent } from '../services/freshdeskService.ts';
import { debugService } from '../services/debugService.ts';

interface LoginScreenProps {
    onLogin: (apiKey: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    // Default values for ecomplete domain
    const [domain] = useState('ecomplete.freshdesk.com');
    
    // Status states
    const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // No client-side key used. Proxy handles auth.
        const keyToUse = ''; 
        
        setStatus('validating');
        setStatusMessage('Establishing secure connection to Server Proxy...');
        debugService.addLog('info', 'Starting proxy handshake...', 'Auth');

        try {
            // This calls /api/freshdesk/api/v2/agents/me via the proxy.
            const agent = await getAuthenticatedAgent();
            
            setStatus('success');
            setStatusMessage(`Proxy Connected. Welcome, ${agent.contact.name}. Redirecting...`);
            debugService.addLog('success', `Proxy Authenticated as ${agent.contact.name}`, 'Auth');

            setTimeout(() => {
                onLogin(keyToUse);
            }, 800);

        } catch (err: any) {
            console.error("Login verification failed:", err);
            setStatus('error');
            
            let detailedError = err.message;
            if (err.message.includes('Authentication Failed')) {
                 detailedError = 'Server Proxy failed to authenticate with Freshdesk. Check SERVER_API_KEY in server.js/env.';
            } else if (err.message.includes('Backend Error') || err.message.includes('404')) {
                 detailedError = 'Proxy endpoint not found. Ensure server.js is running and routing /api/freshdesk correctly.';
            } else if (err.message.includes('Failed to fetch')) {
                 detailedError = 'Network error. Unable to reach the Node server.';
            }
            
            setStatusMessage(`FAILED: ${detailedError}`);
            debugService.addLog('error', `Authentication failure: ${err.message}`, 'Auth');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center justify-center p-4 font-sans">
            <div className="w-full max-w-md">
                <div className="bg-gray-800 shadow-2xl rounded-lg p-8 border border-gray-700 animate-scale-in">
                    <div className="text-center mb-8">
                        <div className="bg-fd-blue/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-fd-blue/30 shadow-[0_0_15px_rgba(0,153,255,0.2)]">
                            <span className="text-2xl">⚡</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight mb-1">eComplete Dashboard</h1>
                        <p className="text-gray-400 text-xs uppercase tracking-wider">Helpdesk Connectivity Portal</p>
                    </div>
                    
                    <form onSubmit={handleLogin}>
                        <div className="mb-5">
                            <label className="block text-gray-400 text-xs font-bold mb-2 uppercase tracking-wide" htmlFor="domain">
                                Freshdesk Domain
                            </label>
                            <input
                                id="domain"
                                type="text"
                                value={domain}
                                readOnly
                                className="w-full bg-gray-700 border border-gray-600 text-gray-500 text-sm rounded-md py-3 px-4 focus:outline-none cursor-not-allowed"
                            />
                        </div>

                         <div className="mb-6 bg-blue-900/20 p-4 rounded border border-blue-800/50">
                            <h4 className="text-blue-300 font-bold text-sm mb-1">Managed Authentication</h4>
                            <p className="text-[13px] text-blue-200/70">
                                This dashboard uses a server-side proxy for secure authentication. 
                                No API Key is required on this client.
                            </p>
                        </div>

                        {statusMessage && (
                            <div className={`p-4 mb-6 rounded text-sm font-medium border-l-4 animate-fade-in ${
                                status === 'error' ? 'bg-red-900/30 border-red-500 text-red-200' : 
                                status === 'success' ? 'bg-green-900/30 border-green-500 text-green-200' :
                                'bg-blue-900/30 border-blue-500 text-blue-200'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <p className="flex items-center">
                                        {status === 'validating' && (
                                            <svg className="animate-spin h-4 w-4 mr-2 text-blue-300" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        )}
                                        {statusMessage}
                                    </p>
                                    {status === 'error' && (
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const debugBar = document.getElementById('debug-trigger');
                                                if (debugBar) debugBar.click();
                                            }}
                                            className="ml-2 text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded font-black uppercase tracking-tighter transition-colors"
                                        >
                                            Logs
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <button
                            type="submit"
                            disabled={status === 'validating' || status === 'success'}
                            className="w-full bg-fd-blue hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md transition-all active:scale-95 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg"
                        >
                            {status === 'validating' ? 'Connecting...' : 'Connect to Dashboard'}
                        </button>
                    </form>
                </div>
                <div className="mt-8 p-4 bg-gray-800/50 rounded border border-gray-700 text-[10px] text-gray-500 text-center uppercase tracking-widest">
                    Proxy Mode Active | v2.6.0
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;