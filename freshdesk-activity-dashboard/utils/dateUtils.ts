
// Helper for South Africa Time (GMT+2)
export const toSATime = (dateStr: string | Date): Date => {
    const date = new Date(dateStr);
    return new Date(date.getTime() + (2 * 60 * 60 * 1000));
};

export const formatMinutesToHours = (minutes: number) => {
    if (minutes < 0) minutes = 0;
    const hours = Math.floor(minutes / 60);
    const remainingMins = Math.round(minutes % 60);
    return `${hours}h ${remainingMins}m`;
};

export const formatTimeRange = (min: number, max: number) => {
    return `${formatMinutesToHours(min)} - ${formatMinutesToHours(max)}`;
};
