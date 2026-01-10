
import React, { useState } from 'react';
import DateRangePicker from './DateRangePicker.tsx';
import { debugService } from '../services/debugService.ts';

interface DateSelectionModalProps {
    onSave: (newDateRange: { from: string; to: string }) => void;
    onClose: () => void;
}

const getFormattedDate = (date: Date) => date.toISOString().split('T')[0];

const DateSelectionModal: React.FC<DateSelectionModalProps> = ({ onSave, onClose }) => {
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date();
        return { from: getFormattedDate(today), to: getFormattedDate(today) };
    });
    
    const [dateError, setDateError] = useState<string | null>(null);
    
    const handleDateChange = (newDateRange: { from: string; to: string }) => {
        setDateRange(newDateRange);
        const fromDate = new Date(newDateRange.from);
        const toDate = new Date(newDateRange.to);
        if (fromDate > toDate) {
            setDateError('The "From" date cannot be after the "To" date.');
            return;
        }
        const diffTime = toDate.getTime() - fromDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 5) {
            setDateError('The date range cannot exceed 5 days.');
        } else {
            setDateError(null);
        }
    };
    
    const handleSave = () => {
        if (!dateError) {
            debugService.addLog('info', `Fetch Clicked: Range ${dateRange.from} to ${dateRange.to}`, 'UI');
            onSave(dateRange); 
        } else {
             debugService.addLog('warning', `Fetch Blocked: ${dateError}`, 'UI');
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg transform transition-all">
                <div className="p-6">
                     <div className="text-left">
                        <h3 className="text-2xl font-bold text-white" id="modal-title">
                            Select Date Range
                        </h3>
                        <p className="text-base text-gray-400 mt-2">
                            Choose the date range for the activity report. You will select an agent on the next screen.
                        </p>
                        <p className="text-sm text-fd-blue mt-2 font-medium bg-blue-900/20 p-2 rounded border border-blue-900/50">
                            Note: Best to use for one day. Can extend to 5 days.
                        </p>
                    </div>
                    <div className="mt-4 space-y-4">
                       <DateRangePicker dateRange={dateRange} onChange={handleDateChange} />
                       {dateError && (
                           <p className="mt-2 text-sm text-yellow-400">{dateError}</p>
                       )}
                    </div>
                </div>
                <div className="bg-gray-700/50 px-6 py-3 flex justify-end items-center gap-3 rounded-b-lg">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex justify-center rounded-md border border-gray-500 shadow-sm px-4 py-2 bg-gray-600 text-lg font-medium text-white hover:bg-gray-500 focus:outline-none sm:text-base"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!!dateError} 
                        className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-fd-blue text-lg font-medium text-white hover:bg-blue-500 focus:outline-none disabled:bg-gray-500 disabled:cursor-not-allowed sm:text-base"
                    >
                        Fetch Date Range Activity
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DateSelectionModal;
