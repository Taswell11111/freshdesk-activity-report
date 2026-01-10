
import React, { useState, useEffect } from 'react';

interface SummaryCellProps {
    ticketId: number;
    summary: string;
    onSave: (ticketId: number, newSummary: string) => void;
}

const SummaryCell: React.FC<SummaryCellProps> = ({ ticketId, summary, onSave }) => {
    const isError = summary.toLowerCase().includes("error") || summary.toLowerCase().includes("failed");
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(summary);

    useEffect(() => {
        setEditText(summary);
    }, [summary]);

    const handleSave = () => {
        onSave(ticketId, editText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditText(summary);
        setIsEditing(false);
    }

    if (isEditing) {
        return (
            <div>
                <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-md py-2 px-3 text-sm"
                    rows={5}
                    aria-label={`Edit summary for ticket ${ticketId}`}
                />
                <div className="flex items-center space-x-2 mt-2">
                    <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-md text-sm">Save</button>
                    <button onClick={handleCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-2 rounded-md text-sm">Cancel</button>
                </div>
            </div>
        );
    }
    
    return (
        <div>
            {summary.split('\n\n').map((paragraph, pIndex) => (
                <p key={pIndex} className="mb-2 last:mb-0">{paragraph}</p>
            ))}
            {isError && (
                <button 
                    onClick={() => setIsEditing(true)} 
                    className="text-sm text-fd-blue hover:underline mt-2"
                    aria-label={`Edit failed summary for ticket ${ticketId}`}
                >
                    Edit Summary
                </button>
            )}
        </div>
    );
};

export default SummaryCell;
