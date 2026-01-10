


import React, { useState, useEffect } from 'react';

interface TimeEstimateCellProps {
    ticketId: number;
    estimate: string;
    lastResponseTimestamp: Date | null; // Used for default date if AI estimate is missing
    onSave: (ticketId: number, newEstimate: string) => void;
}

const TimeEstimateCell: React.FC<TimeEstimateCellProps> = ({ ticketId, estimate, lastResponseTimestamp, onSave }) => {
    const isError = estimate.includes("Calculation Error");
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(estimate); // Use editText to hold the full multi-line string

    useEffect(() => {
        setEditText(estimate);
    }, [estimate]);

    const handleSave = () => {
        // The new estimate is the entire editText content, which can be multi-line
        onSave(ticketId, editText); 
        setIsEditing(false);
    };
    
    const handleCancel = () => {
        setEditText(estimate); // Revert to original estimate
        setIsEditing(false);
    }

    const renderContent = () => {
        if (isError && !isEditing) {
            const dateStr = lastResponseTimestamp 
                ? new Date(lastResponseTimestamp).toISOString().split('T')[0] 
                : new Date().toISOString().split('T')[0];
            
            // Provide a default editable value for calculation errors
            const defaultEstimate = `${dateStr}: 2-3 minutes`;
            return (
                <div>
                    <p className="text-yellow-400 text-sm">{estimate}</p>
                    <button 
                        onClick={() => {
                            setEditText(defaultEstimate); // Pre-fill with a reasonable default
                            setIsEditing(true);
                        }} 
                        className="text-sm text-fd-blue hover:underline mt-1"
                        aria-label={`Insert time estimate for ticket ${ticketId}`}
                    >
                        Insert estimation
                    </button>
                </div>
            );
        }

        if (isEditing) {
            return (
                <div className="flex flex-col items-start space-y-1">
                    <textarea 
                        value={editText} 
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="YYYY-MM-DD: L-H minutes"
                        className="w-full bg-gray-700 border border-gray-600 text-white rounded-md py-1 px-2 text-sm max-h-40 overflow-y-auto"
                        rows={Math.min(5, editText.split('\n').length || 1)} // Adjust rows dynamically
                        aria-label="Time estimate input"
                    />
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={handleSave} 
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-md text-sm"
                        >
                            Save
                        </button>
                        <button 
                            onClick={handleCancel} 
                            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-2 rounded-md text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            );
        }

        // Display mode for non-error, non-editing state
        return (
            <div>
                {estimate.split('\n').map((line, lIndex) => (
                    <p key={lIndex} className="text-sm">{line}</p>
                ))}
                <button 
                    onClick={() => setIsEditing(true)} 
                    className="text-sm text-gray-500 hover:text-fd-blue hover:underline mt-1"
                    aria-label={`Edit time estimate for ticket ${ticketId}`}
                >
                    Edit
                </button>
            </div>
        );
    }


    return (
        <div>
            {renderContent()}
        </div>
    );
};

export default TimeEstimateCell;
