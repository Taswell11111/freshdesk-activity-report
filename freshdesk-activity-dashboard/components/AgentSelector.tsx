
import React from 'react';
import type { Agent } from '../types.ts';

interface AgentSelectorProps {
    agents: Agent[];
    selectedAgentId: number | null;
    onSelectAgent: (agentId: number | null) => void;
    disabled?: boolean;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ agents, selectedAgentId, onSelectAgent, disabled = false }) => {
    return (
        <div className="mb-6">
            <label htmlFor="agent-select" className="block text-sm font-medium text-gray-400 mb-2">
                Select Agent
            </label>
            <select
                id="agent-select"
                value={selectedAgentId || ''}
                onChange={(e) => onSelectAgent(Number(e.target.value))}
                disabled={disabled}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-fd-blue focus:border-fd-blue disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                <option value="" disabled>-- Select an Agent --</option>
                {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                        {agent.contact.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default AgentSelector;
