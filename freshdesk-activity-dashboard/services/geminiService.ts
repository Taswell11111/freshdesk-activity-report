
import type { DailyAgentActions } from "../types.ts";
import { ConcurrencyQueue } from "./apiUtils.ts";
import { debugService } from "./debugService.ts";

const geminiQueue = new ConcurrencyQueue();

async function callGeminiApi(prompt: string): Promise<string> {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 1000;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt }),
            });

            if (response.status === 429 && attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + (Math.random() * 1000);
                debugService.addLog('warning', `AI Rate Limit. Retrying in ${Math.round(delay/1000)}s...`, 'AI');
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.summary;

        } catch (error: any) {
             if (attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) + (Math.random() * 1000);
                debugService.addLog('warning', `AI Call failed. Retrying in ${Math.round(delay/1000)}s...`, 'AI');
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                debugService.addLog('error', `AI Analysis failed: ${error.message}`, 'AI');
                return `<SUMMARY_START>Error generating summary. ${error.message}</SUMMARY_START><TIME_ESTIMATE_START>Calculation Error</TIME_ESTIMATE_START><OUTCOME_START>Error</OUTCOME_START><SENTIMENT_START>Undetermined</SENTIMENT_START><CATEGORY_START>Other</CATEGORY_START>`;
            }
        }
    }
     return `<SUMMARY_START>Persistent AI service error.</SUMMARY_START><TIME_ESTIMATE_START>Calculation Error</TIME_ESTIMATE_START><OUTCOME_START>Error</OUTCOME_START><SENTIMENT_START>Undetermined</SENTIMENT_START><CATEGORY_START>Other</CATEGORY_START>`;
}


export async function summarizeTicketActivity(
    context: string,
    createdAt: string,
    agentName: string,
    dateRange: { from: string; to: string },
    lastMessageAuthor: string,
    lastMessageIsOutsideRange: boolean,
    dailyAgentActions: DailyAgentActions[]
): Promise<string> {
    return geminiQueue.add(async () => {
        debugService.addLog('info', `AI Summary Task: Analyzing activity for ${agentName}`, 'AI');
        
        const dailyActionsPromptBlock = dailyAgentActions.map(day => `
---
**[Key Agent Actions for ${agentName} on ${day.date}]**
${day.actionBlocks.map(block => `- Block ${block.blockNumber}: StatusChange=${block.isStatusChange}, Private=${block.privateNotesCount}, PublicCount=${block.publicReplies.length}`).join('\n')}
---`).join('\n');

        const prompt = `Analysing ticket activity for ${agentName} between ${dateRange.from} and ${dateRange.to}. Return structure: <SUMMARY_START>...</SUMMARY_END>, <TIME_ESTIMATE_START>...</TIME_ESTIMATE_START>, <OUTCOME_START>...</OUTCOME_END>, <SENTIMENT_START>...</SENTENTIMENT_END>, <CATEGORY_START>...</CATEGORY_START>. 
        
        ${context}
        ${dailyActionsPromptBlock}`;

        const resultText = await callGeminiApi(prompt);
        
        if (!resultText.includes('<SUMMARY_START>')) {
             debugService.addLog('error', `AI Analysis failed for ${agentName}: Invalid response format`, 'AI');
             return `<SUMMARY_START>Error generating summary. Invalid AI response.</SUMMARY_START><TIME_ESTIMATE_START>Calculation Error</TIME_ESTIMATE_START><OUTCOME_START>Error</OUTCOME_START><SENTIMENT_START>Undetermined</SENTIMENT_START><CATEGORY_START>Other</CATEGORY_START>`;
        }
        
        debugService.addLog('success', `AI Analysis complete for ${agentName}`, 'AI');
        return resultText;
    });
}

// New function for Group Summary
export async function summarizeGroupTickets(subjects: string[]): Promise<string> {
    try {
        const prompt = `Here is a list of support ticket subjects:
        ${subjects.join('\n')}
        
        Provide a 3-line summary identifying the common themes, major issues, or product trends found in this list. Be concise.`;

        const summary = await callGeminiApi(prompt);
        return summary || "Analysis unavailable.";

    } catch (e: any) {
        console.error("Group summary failed", e);
        return "Could not generate summary.";
    }
}
