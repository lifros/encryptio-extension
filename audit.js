/**
 * ENCRYPTIO - Audit Logging Module
 * Logs critical security events for user review
 */

const AUDIT_LOG_KEY = 'encryptio_audit_log';
const MAX_AUDIT_ENTRIES = 1000; // Keep last 1000 events

/**
 * Event types for audit logging
 */
const AuditEventType = {
    LOGIN: 'login',
    LOGOUT: 'logout',
    VAULT_ACCESS: 'vault_access',
    AUTOFILL: 'autofill',
    PASSWORD_GENERATE: 'password_generate',
    SESSION_EXPIRED: 'session_expired',
    AUTH_FAILURE: 'auth_failure',
    RATE_LIMIT_HIT: 'rate_limit_hit',
    INTEGRITY_FAILURE: 'integrity_failure',
    CERT_VALIDATION_FAILURE: 'cert_validation_failure'
};

/**
 * Logs an audit event
 * @param {string} eventType - Type of event (from AuditEventType)
 * @param {object} details - Additional details about the event
 */
async function logAuditEvent(eventType, details = {}) {
    try {
        const timestamp = new Date().toISOString();
        const userAgent = navigator.userAgent;

        const event = {
            timestamp,
            eventType,
            userAgent,
            details,
            id: generateEventId()
        };

        // Get existing log
        const result = await chrome.storage.local.get([AUDIT_LOG_KEY]);
        let auditLog = result[AUDIT_LOG_KEY] || [];

        // Add new event
        auditLog.push(event);

        // Keep only last MAX_AUDIT_ENTRIES
        if (auditLog.length > MAX_AUDIT_ENTRIES) {
            auditLog = auditLog.slice(-MAX_AUDIT_ENTRIES);
        }

        // Save updated log
        await chrome.storage.local.set({ [AUDIT_LOG_KEY]: auditLog });

        console.log('[Audit]', eventType, details);
    } catch (error) {
        console.error('[Audit] Failed to log event:', error);
    }
}

/**
 * Gets audit log entries
 * @param {object} filters - Optional filters (eventType, startDate, endDate)
 * @returns {Promise<Array>} Array of audit events
 */
async function getAuditLog(filters = {}) {
    try {
        const result = await chrome.storage.local.get([AUDIT_LOG_KEY]);
        let auditLog = result[AUDIT_LOG_KEY] || [];

        // Apply filters
        if (filters.eventType) {
            auditLog = auditLog.filter(e => e.eventType === filters.eventType);
        }

        if (filters.startDate) {
            const startDate = new Date(filters.startDate);
            auditLog = auditLog.filter(e => new Date(e.timestamp) >= startDate);
        }

        if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            auditLog = auditLog.filter(e => new Date(e.timestamp) <= endDate);
        }

        return auditLog;
    } catch (error) {
        console.error('[Audit] Failed to get log:', error);
        return [];
    }
}

/**
 * Exports audit log as JSON
 * @returns {Promise<string>} JSON string of audit log
 */
async function exportAuditLog() {
    const auditLog = await getAuditLog();
    return JSON.stringify(auditLog, null, 2);
}

/**
 * Clears audit log (user-controlled)
 */
async function clearAuditLog() {
    try {
        await chrome.storage.local.remove([AUDIT_LOG_KEY]);
        console.log('[Audit] Log cleared');
    } catch (error) {
        console.error('[Audit] Failed to clear log:', error);
    }
}

/**
 * Generates unique event ID
 */
function generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets audit log statistics
 * @returns {Promise<object>} Statistics about audit log
 */
async function getAuditStats() {
    const auditLog = await getAuditLog();

    const stats = {
        totalEvents: auditLog.length,
        eventTypes: {},
        firstEvent: auditLog[0]?.timestamp,
        lastEvent: auditLog[auditLog.length - 1]?.timestamp
    };

    // Count events by type
    auditLog.forEach(event => {
        stats.eventTypes[event.eventType] = (stats.eventTypes[event.eventType] || 0) + 1;
    });

    return stats;
}
