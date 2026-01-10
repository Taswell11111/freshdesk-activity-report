
import { Ticket, Agent, Group, Conversation, TicketField } from '../types.ts';
import { debugService } from './debugService.ts';
import { fetchWithRetry, parseApiError } from './apiUtils.ts';
import { USE_PROXY, DIRECT_API_KEY, FRESHDESK_DOMAIN } from '../constants.ts';

/**
 * Helper to construct the full URL.
 * In Proxy mode: /api/v2/tickets
 * In Direct mode: https://ecomplete.freshdesk.com/api/v2/tickets
 */
function getTargetUrl(endpoint: string, params: Record<string, string> = {}): string {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // Determine base URL based on mode
    let baseUrl = USE_PROXY ? '/api' : `https://${FRESHDESK_DOMAIN}/api`;
    
    let url = `${baseUrl}${path}`;

    const queryParts: string[] = [];
    Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
            queryParts.push(`${key}=${encodeURIComponent(params[key])}`);
        }
    });
    
    if (queryParts.length > 0) {
        const separator = url.includes('?') ? '&' : '?';
        url += separator + queryParts.join('&');
    }
    return url;
}

/**
 * Headers configuration.
 * Direct mode manually adds the Authorization header.
 */
function getHeaders(method: string = 'GET'): HeadersInit {
    const headers: Record<string, string> = {
        'Accept': 'application/json'
    };

    if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
    }

    // BYPASS: Add auth directly if not using proxy
    if (!USE_PROXY) {
        if (!DIRECT_API_KEY) {
            console.error("DIRECT_API_KEY is missing in constants.ts while USE_PROXY is false.");
        }
        // Base64 encode API_KEY:X
        const auth = btoa(`${DIRECT_API_KEY}:X`);
        headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
}

/**
 * Standardized API Error Handler
 */
async function handleApiError(response: Response, context: string) {
    const errorMsg = await parseApiError(response);
    
    if (response.status === 401) {
        throw new Error(`Authentication Failed: Ensure your API Key is correct. (${context})`);
    }
    if (response.status === 403) {
        throw new Error(`Access Denied: You do not have permission to access ${context}.`);
    }
    if (response.status === 429) {
        throw new Error(`Rate Limit Exceeded: Freshdesk is busy. Please try again in a minute.`);
    }
    if (response.status === 404) {
         throw new Error(`Not Found: The requested ${context} could not be found.`);
    }
    if (response.status >= 500) {
        throw new Error(`Freshdesk System Error (${response.status}): Please try again later. (${errorMsg})`);
    }
    throw new Error(`API Error (${response.status}): ${errorMsg}`);
}

/**
 * Executes a request.
 */
async function executeRequest(endpoint: string, params: Record<string, string>, options: RequestInit, context: string): Promise<Response> {
    const fullUrl = getTargetUrl(endpoint, params);

    try {
        const headers = { ...getHeaders(options.method), ...(options.headers as Record<string, string>) };
        const response = await fetchWithRetry(fullUrl, { ...options, headers }, 1);
        
        // Handle Routing errors (HTML 404s) vs API errors (JSON 404s)
        if (response.status === 404) {
             const contentType = response.headers.get('content-type') || '';
             if (!contentType.includes('application/json')) {
                 debugService.addLog('error', `Route mismatch at ${fullUrl}. If using proxy, check server.js.`, 'FreshdeskService');
                 throw new Error(`Connectivity Error: The target endpoint ${endpoint} could not be reached.`);
             }
        }
        return response;
        
    } catch (e: any) {
        debugService.addLog('error', `Fetch Error: ${e.message}`, 'Network');
        throw e;
    }
}

/**
 * Generic paginator.
 */
async function fetchPaginatedFreshdeskAPI<T>(endpoint: string, signal?: AbortSignal, maxPages: number = 300): Promise<T[]> {
    let allResults: T[] = [];
    
    const isSearch = endpoint.includes('/search/');
    const pageSize = isSearch ? 30 : 100;
    
    // Step 1: Fetch first page
    const p1Params: Record<string, string> = { page: '1' };
    if (!isSearch) p1Params['per_page'] = pageSize.toString();

    const response = await executeRequest(endpoint, p1Params, { 
        method: 'GET', 
        signal 
    }, `Page 1`);

    if (!response.ok) {
         await handleApiError(response, endpoint);
    }

    const data = await response.json();
    
    // Handle Search API (Object with results & total)
    if (isSearch && data.results) {
        allResults = data.results;
        const total = data.total || 0;
        const searchMaxPages = Math.min(Math.ceil(total / pageSize), 10);
        
        if (total > allResults.length) {
            const pageNumbers = [];
            for (let i = 2; i <= searchMaxPages; i++) pageNumbers.push(i);

            const promises = pageNumbers.map(page => 
                executeRequest(endpoint, { page: page.toString() }, { 
                    method: 'GET', 
                    signal 
                }, `Page ${page}`)
                .then(async res => {
                    if (!res.ok) return []; 
                    return (await res.json()).results || [];
                })
                .catch(err => {
                    debugService.addLog('warning', `Page ${page} failed: ${err.message}`, 'Network');
                    return [];
                })
            );

            const pagesResults = await Promise.all(promises);
            pagesResults.forEach(results => allResults = [...allResults, ...results]);
        }
        return allResults;
    } 
    
    // Handle List API (Array)
    if (Array.isArray(data)) {
        allResults = data;
        if (data.length < pageSize) return allResults; 

        let page = 2;
        while (page <= maxPages) {
            const pParams = { page: page.toString(), per_page: pageSize.toString() };
            const res = await executeRequest(endpoint, pParams, { 
                method: 'GET', 
                signal 
            }, `Page ${page}`);

            if (!res.ok) break;
            
            const pageData = await res.json();
            if (Array.isArray(pageData) && pageData.length > 0) {
                allResults = [...allResults, ...pageData];
                if (pageData.length < pageSize) break; 
                page++;
            } else {
                break;
            }
        }
        return allResults;
    }

    return [];
}

/**
 * Service Methods
 */

export const getAuthenticatedAgent = async (): Promise<Agent> => {
    const response = await executeRequest('/v2/agents/me', {}, { method: 'GET' }, 'Auth Check');
    if (!response.ok) {
        await handleApiError(response, 'Agent Authentication');
    }
    return await response.json();
};

export const getAgents = async (signal?: AbortSignal): Promise<Agent[]> => {
    return fetchPaginatedFreshdeskAPI<Agent>('/v2/agents', signal);
};

export const getGroups = async (signal?: AbortSignal): Promise<Group[]> => {
    return fetchPaginatedFreshdeskAPI<Group>('/v2/groups', signal);
};

export const getTicketFields = async (signal?: AbortSignal): Promise<TicketField[]> => {
    const response = await executeRequest('/v2/ticket_fields', {}, { method: 'GET', signal }, 'Get Ticket Fields');
    if (!response.ok) await handleApiError(response, 'Ticket Fields');
    return await response.json();
};

export const getTicketsUpdatedInPeriod = async (fromDate: Date, toDate: Date, signal?: AbortSignal): Promise<Ticket[]> => {
    const fromStr = fromDate.toISOString().split('.')[0] + 'Z'; 
    
    const listEndpoint = `/v2/tickets`;
    const listParams = {
        updated_since: fromStr,
        include: 'description,stats,requester',
        order_by: 'updated_at',
        order_type: 'asc'
    };
    
    try {
        const queryParams = new URLSearchParams(listParams).toString();
        const tickets = await fetchPaginatedFreshdeskAPI<Ticket>(`${listEndpoint}?${queryParams}`, signal, 300);
        
        const filtered = tickets.filter(t => {
            const ticketDate = new Date(t.updated_at);
            return ticketDate <= toDate && ticketDate >= fromDate;
        });
        debugService.addLog('info', `Fetched ${tickets.length} tickets. Filtered to ${filtered.length}.`, 'Network');
        return filtered;
    } catch (e: any) {
        // Fallback for some plans or permissions
        const isFallbackError = (e.message && (e.message.includes('403') || e.message.includes('400'))) || e.status === 403;
        if (isFallbackError) {
            debugService.addLog('warning', `Primary List API failed. Attempting search fallback.`, 'Network');
            const fromSearch = fromDate.toISOString().split('.')[0] + 'Z';
            const toSearch = toDate.toISOString().split('.')[0] + 'Z';
            const query = `"updated_at:>'${fromSearch}' AND updated_at:<'${toSearch}'"`;
            const searchEndpoint = `/v2/search/tickets?query=${encodeURIComponent(query)}`;
            return await fetchPaginatedFreshdeskAPI<Ticket>(searchEndpoint, signal, 10);
        }
        throw e;
    }
};

export const getConversations = async (ticketId: number, signal?: AbortSignal): Promise<Conversation[]> => {
    try {
        return await fetchPaginatedFreshdeskAPI<Conversation>(`/v2/tickets/${ticketId}/conversations`, signal);
    } catch (e: any) {
        debugService.addLog('warning', `Failed to fetch conversations for ticket ${ticketId}: ${e.message}`, 'Network');
        return [];
    }
};

export const updateTicket = async (ticketId: number, payload: any): Promise<Ticket> => {
    const response = await executeRequest(`/v2/tickets/${ticketId}`, {}, {
        method: 'PUT',
        body: JSON.stringify(payload)
    }, `Update Ticket ${ticketId}`);
    
    if (!response.ok) await handleApiError(response, `Update Ticket ${ticketId}`);
    return await response.json();
};

export const getActiveTickets = async (
    openStatusIds?: number[], 
    groupIds?: number[], 
    signal?: AbortSignal
): Promise<{ tickets: Ticket[], total: number }> => {
    let statusQuery = "(status:2 OR status:3 OR status:6 OR status:7)"; 
    if (openStatusIds && openStatusIds.length > 0) {
        statusQuery = `(${openStatusIds.map(id => `status:${id}`).join(' OR ')})`;
    }

    const endpoint = `/v2/search/tickets`;

    if (groupIds && groupIds.length > 0) {
        const groupPromises = groupIds.map(async (gid) => {
            const groupQuery = ` AND group_id:${gid}`;
            const fullQuery = `"${statusQuery}${groupQuery}"`;
            try {
                const tickets = await fetchPaginatedFreshdeskAPI<Ticket>(`${endpoint}?query=${encodeURIComponent(fullQuery)}`, signal);
                return { tickets, total: tickets.length }; 
            } catch (e: any) {
                return { tickets: [], total: 0 };
            }
        });

        const results = await Promise.all(groupPromises);
        const allTickets = results.flatMap(r => r.tickets);
        const uniqueTickets = Array.from(new Map(allTickets.map(t => [t.id, t])).values());
        return { tickets: uniqueTickets, total: uniqueTickets.length };
    }

    const fullQuery = `"${statusQuery}"`;
    let totalCount = 0;
    
    try {
        const response = await executeRequest(endpoint, { 
            query: fullQuery, 
            page: '1' 
        }, { method: 'GET', signal }, 'Active Ticket Count');
        
        if (response.ok) {
            const countData = await response.json();
            totalCount = countData.total || 0;
        }
    } catch (e: any) {
        console.error("Count check failed", e);
    }

    try {
        const tickets = await fetchPaginatedFreshdeskAPI<Ticket>(`${endpoint}?query=${encodeURIComponent(fullQuery)}`, signal);
        return { 
            tickets, 
            total: totalCount || tickets.length 
        };
    } catch (e: any) {
        throw e;
    }
};
