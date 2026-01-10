

import React from 'react';

interface DateRangePickerProps {
    dateRange: { from: string; to: string };
    onChange: (newDateRange: { from: string; to: string }) => void;
    disabled?: boolean;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ dateRange, onChange, disabled = false }) => {
    // Fix: Define handleDateChange within the component scope
    const handleDateChange = (field: 'from' | 'to', value: string) => {
        onChange({ ...dateRange, [field]: value });
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label htmlFor="from-date" className="block text-sm font-medium text-gray-400 mb-2">
                    From
                </label>
                <input
                    type="date"
                    id="from-date"
                    value={dateRange.from}
                    onChange={(e) => handleDateChange('from', e.target.value)}
                    disabled={disabled}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-fd-blue focus:border-fd-blue disabled:bg-gray-600 disabled:cursor-not-allowed"
                />
            </div>
            <div>
                <label htmlFor="to-date" className="block text-sm font-medium text-gray-400 mb-2">
                    To
                </label>
                <input
                    type="date"
                    id="to-date"
                    value={dateRange.to}
                    onChange={(e) => handleDateChange('to', e.target.value)}
                    disabled={disabled}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-fd-blue focus:border-fd-blue disabled:bg-gray-600 disabled:cursor-not-allowed"
                />
            </div>
        </div>
    );
};

export default DateRangePicker;