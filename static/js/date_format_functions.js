function formatDateLabel(value) {
    if (!value) return '';
    const match = /^(
        \d{4})-(
        \d{2})-(
        \d{2})$/.exec(value.trim());
    if (match) {
        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    return value;
}

function formatDateTime(value) {
    if (!value) return '';
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value.trim());
    if (isoMatch) {
        const [, year, month, day, hour = '00', minute = '00'] = isoMatch;
        return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    return value;
}
