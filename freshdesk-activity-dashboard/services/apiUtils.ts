
import { debugService } from './debugService.ts';

// Freshdesk Enterprise Plan: 700 requests/minute.
const DEFAULT_MAX_CONCURRENT = 5; 
const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_MAX_PER_WINDOW = 10; 

export class RateLimiter {
  private queue: Array<{ task: () => Promise<any>, resolve: (value: any) => void, reject: (reason?: any) => void }> = [];
  private activeRequests = 0;
  private requestTimestamps: number[] = [];
  private globalRetryAfter = 0; 
  
  private maxConcurrent = DEFAULT_MAX_CONCURRENT;
  private windowMs = DEFAULT_WINDOW_MS;
  private maxPerWindow = DEFAULT_MAX_PER_WINDOW;

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  updateConfig(config: { maxConcurrent?: number; windowMs?: number; maxPerWindow?: number }) {
      if (config.maxConcurrent) this.maxConcurrent = config.maxConcurrent;
      if (config.windowMs) this.windowMs = config.windowMs;
      if (config.maxPerWindow) this.maxPerWindow = config.maxPerWindow;
      
      debugService.addLog('info', `Rate Limit Throttle Updated: ${this.maxConcurrent} concurrent, ${this.maxPerWindow} reqs/${this.windowMs}ms`, 'Limiter');
  }

  private async processQueue() {
    const now = Date.now();
    if (now < this.globalRetryAfter) {
      const waitTime = this.globalRetryAfter - now;
      setTimeout(() => this.processQueue(), waitTime + 500);
      return;
    }

    if (this.activeRequests >= this.maxConcurrent) return;

    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.windowMs);
    
    if (this.requestTimestamps.length >= this.maxPerWindow) {
        const oldest = this.requestTimestamps[0];
        const waitTime = this.windowMs - (now - oldest) + 50; 
        setTimeout(() => this.processQueue(), waitTime);
        return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeRequests++;
    this.requestTimestamps.push(Date.now());

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  setGlobalBackoff(seconds: number) {
    debugService.addLog('warning', `RATE LIMIT HIT: Pausing for ${seconds}s`, 'Limiter');
    this.globalRetryAfter = Date.now() + (seconds * 1000) + 1000; 
  }
}

export const limiter = new RateLimiter();

export class ConcurrencyQueue {
    add<T>(task: () => Promise<T>): Promise<T> {
        return limiter.schedule(task);
    }
}

export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 2
): Promise<Response> {
    let lastError: any = null;
    
    if (!options.mode) options.mode = 'cors';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const backoff = 1000 * Math.pow(2, attempt) + (Math.random() * 500); 
                await new Promise(r => setTimeout(r, backoff));
            }
            
            const response = await limiter.schedule(() => fetch(url, options));
            
            // Check for 404s that act like server errors (HTML response) vs API errors (JSON response)
            if (response.status === 404) {
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    // This is likely a proxy configuration error or route not found on the Node server
                    const text = await response.clone().text();
                    // Don't retry these, they are configuration errors
                    throw new Error(`Backend Error: The proxy server returned 404 for ${url}. Response: ${text.substring(0, 100)}... Ensure 'npm start' is running and server.js handles this route.`);
                }
            }

            if (response.status === 429 || response.status === 503) {
                const retryAfterHeader = response.headers.get('Retry-After');
                const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5; 
                
                limiter.setGlobalBackoff(retryAfter);
                
                if (attempt < maxRetries) continue;
                
                throw new Error(`Server is busy. Please try again in ${retryAfter} seconds.`);
            }
            
            return response;

        } catch (error: any) {
            lastError = error;
            const msg = error.message || '';
            const isNetworkError = error.name === 'TypeError' && (msg.includes('Failed to fetch') || msg.includes('NetworkError'));
            
            // Don't retry if it's our specific Backend Error
            if (msg.includes("Backend Error")) break;

            if (attempt < maxRetries && isNetworkError) {
                debugService.addLog('info', `Connection retry (${attempt + 1}/${maxRetries}): ${msg}`, 'Network');
                continue;
            }
            
            break;
        }
    }
    
    if (lastError) {
         if (lastError.message.includes("Backend Error")) {
             throw lastError;
         }
         if (lastError.message.includes('Failed to fetch') || lastError.name === 'TypeError') {
             if (url.includes('/api/freshdesk')) {
                 throw new Error(`Network Error: Cannot reach the local proxy at ${url}. Ensure the server is running on port 8080.`);
             }
             if (url.includes('run.app')) {
                 throw new Error(`Network Error: Cloud Proxy (${url}) connection rejected. This often means a CORS configuration issue on the server.`);
             }
             throw new Error(`Network Error: Unable to connect to the server (${url}). Please check your internet connection.`);
         }
    }
    throw lastError;
}

export const parseApiError = async (response: Response): Promise<string> => {
    try {
        const text = await response.text();
        
        // Check for common HTML errors from proxies/web servers
        if (text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html') || text.includes("File not found")) {
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                return `Server Error: ${titleMatch[1]}`;
            }
            if (text.includes("File not found")) {
                return "Server Error: Endpoint not found (404). Check server configuration.";
            }
            // Add a snippet of the body to debug log for context
            debugService.addLog('error', `Received HTML response instead of JSON: ${text.substring(0, 200)}`, 'Network');
            return `Server Error (${response.status}): The server returned an HTML page/text instead of JSON.`;
        }

        try {
            const data = JSON.parse(text);
            if (data.description) return data.description;
            if (data.message) return data.message;
            if (data.errors && Array.isArray(data.errors)) {
                return data.errors.map((e: any) => `${e.field}: ${e.message} (${e.code})`).join(', ');
            }
            if (data.code) return `Error Code: ${data.code}`;
        } catch (e) {
            // Fallback if JSON parse fails but it wasn't HTML
        }

        const cleanText = text.replace(/<[^>]*>?/gm, '').substring(0, 150).trim();
        if (cleanText) return cleanText;
        
        return response.statusText ? `${response.status} ${response.statusText}` : `HTTP Error ${response.status}`;
        
    } catch (e) {
        return `HTTP Error ${response.status}`;
    }
};
