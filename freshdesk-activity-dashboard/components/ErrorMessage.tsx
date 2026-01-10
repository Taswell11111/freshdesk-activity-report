
import React from 'react';

interface ErrorMessageProps {
    message: string;
    onClose?: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onClose }) => {
    return (
        <div className="bg-red-500/10 border-l-4 border-red-500 text-red-200 px-6 py-4 rounded-r shadow-lg relative mb-6 animate-shake" role="alert">
            <div className="flex justify-between items-start">
                <div className="flex items-center">
                    <svg className="w-6 h-6 mr-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <strong className="font-bold block text-red-400">System Alert</strong>
                        <span className="block sm:inline text-sm mt-1">{message}</span>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-red-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

export default ErrorMessage;
