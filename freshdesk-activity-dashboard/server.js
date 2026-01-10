
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean domain string just in case
const FRESHDESK_DOMAIN = (process.env.FRESHDESK_DOMAIN || 'ecomplete.freshdesk.com')
    .replace(/^https?:\/\//, '').replace(/\/$/, '');
const SERVER_API_KEY = process.env.FRESHDESK_API_KEY;

// Configure GCS
const storage = new Storage({ keyFilename: path.join(__dirname, 'freshdesk_service_account.json') });
const BUCKET_NAME = 'freshdesk_executive_report';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
    // Only log API requests to keep console clean
    if (req.path.startsWith('/api')) {
        console.log(`[Incoming] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// --- 1. Report Upload Endpoint ---
// Defined *before* the generic /api proxy to ensure it's not proxied
app.post('/api/upload-report', async (req, res) => {
    try {
        const { htmlContent, fileName } = req.body;
        
        if (!htmlContent || !fileName) {
            return res.status(400).json({ error: "Missing htmlContent or fileName" });
        }

        const bucket = storage.bucket(BUCKET_NAME);
        const file = bucket.file(fileName);

        await file.save(htmlContent, {
            contentType: 'text/html',
            resumable: false,
            public: true,
            metadata: { cacheControl: 'public, max-age=31536000' }
        });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;
        console.log(`[Upload] Success: ${publicUrl}`);
        res.json({ success: true, url: publicUrl });

    } catch (error) {
        console.error("[Upload] Error:", error);
        res.status(500).json({ error: "Failed to upload report", details: error.message });
    }
});

// --- 2. The Freshdesk Proxy ---
// Using app.use('/api') automatically strips '/api' from req.url
// Example: Request to '/api/v2/agents' becomes '/v2/agents' in req.url here
app.use('/api', async (req, res) => {
    try {
        // Prevent fall-through for root API call if it happens
        if (req.url === '/' || req.url === '') {
            return res.status(404).json({ error: 'API root not implemented' });
        }

        const freshdeskPath = req.url; 
        const targetUrl = `https://${FRESHDESK_DOMAIN}/api${freshdeskPath}`;

        console.log(`[Proxy] Routing ${req.method} ${req.originalUrl} -> ${targetUrl}`);

        const authHeader = `Basic ${Buffer.from((SERVER_API_KEY || '') + ':X').toString('base64')}`;

        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Only send body for non-GET/HEAD requests
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });

        // Handle 404 from Freshdesk specifically (JSON)
        if (response.status === 404) {
             console.warn(`[Proxy] 404 from Freshdesk Target: ${targetUrl}`);
             // If Freshdesk returns HTML (e.g. generic 404 page), don't pass it as JSON
             const contentType = response.headers.get('content-type') || '';
             if (contentType.includes('application/json')) {
                 const data = await response.json();
                 return res.status(404).json(data);
             } else {
                 return res.status(404).json({ 
                     error: 'Resource not found at Freshdesk', 
                     target: targetUrl 
                 });
             }
        }

        // Forward status
        res.status(response.status);
        
        // Forward content-type
        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('content-type', contentType);

        const data = await response.arrayBuffer();
        return res.send(Buffer.from(data));

    } catch (error) {
        console.error('[Proxy Error]', error);
        return res.status(502).json({ error: 'Proxy Connection Failed', details: error.message });
    }
});

// --- 3. Static Files (Served AFTER API routes to prevent shadowing) ---
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA - Anything not matched above goes to index.html
app.get('*', (req, res) => {
    // If client asks for JSON, it likely meant to hit an API that doesn't exist
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ error: 'Endpoint not found on server' });
    }

    res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
        if (err) {
            console.error('[Static] index.html not found. Ensure build is run.');
            res.status(404).send("Dashboard App Not Found (Build missing?)");
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server Active on Port ${PORT}`);
    console.log(`🔗 Proxy Target: https://${FRESHDESK_DOMAIN}`);
});
