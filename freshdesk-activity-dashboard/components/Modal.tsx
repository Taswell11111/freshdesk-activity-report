
import React from 'react';

interface ModalProps {
    title: string;
    message: string;
    onClose: () => void;
    children?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, message, onClose, children }) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md transform transition-all">
                <div className="p-6">
                    <div className="flex justify-between items-start">
                         <div className="text-left w-full">
                            <h3 className="text-2xl font-bold text-white" id="modal-title">
                                {title}
                            </h3>
                            <div className="mt-2">
                                <p className="text-base text-gray-300">
                                    {message}
                                </p>
                            </div>
                            {children && (
                                <div className="mt-4">
                                    {children}
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={onClose} 
                            className="text-gray-400 hover:text-white transition-colors ml-4"
                            aria-label="Close modal"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                           </svg>
                        </button>
                    </div>
                </div>
                <div className="bg-gray-700/50 px-6 py-3 text-right rounded-b-lg">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-fd-blue text-lg font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-fd-blue sm:text-base"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
