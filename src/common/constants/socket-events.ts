/**
 * SOCKET_EVENTS — Single source of truth for ALL Socket.IO event names.
 *
 * Usage:
 *   Server emits: this.server.emit(SOCKET_EVENTS.NEW_MESSAGE, payload)
 *   Client listens: socket.on(SOCKET_EVENTS.NEW_MESSAGE, handler)
 *
 * Never use raw strings for event names — use this enum.
 */
export const SOCKET_EVENTS = {
    // ─── Presence ─────────────────────────────────────────────────────────────
    /** Server → Friends: user online/offline status changed */
    USER_PRESENCE_CHANGED: 'user_presence_changed',

    // ─── Chat / Messages ──────────────────────────────────────────────────────
    /** Client → Server: join a conversation room */
    JOIN_CONVERSATION: 'join_conversation',
    /** Client → Server: leave a conversation room */
    LEAVE_CONVERSATION: 'leave_conversation',
    /** Client → Server: user started typing */
    TYPING_START: 'typing_start',
    /** Client → Server: user stopped typing */
    TYPING_STOP: 'typing_stop',
    /** Server → Conversation room: typing indicator broadcast (start) */
    USER_TYPING_START: 'user_typing_start',
    /** Server → Conversation room: typing indicator broadcast (stop) */
    USER_TYPING_STOP: 'user_typing_stop',
    /** Server → Conversation room: new message delivered */
    NEW_MESSAGE: 'new_message',
    /** Server → Conversation room: message content edited */
    MESSAGE_UPDATED: 'message_updated',
    /** Server → Conversation room: message deleted */
    MESSAGE_DELETED: 'message_deleted',

    // ─── Notifications ────────────────────────────────────────────────────────
    /** Server → User room: new bell notification */
    NEW_NOTIFICATION: 'new_notification',

    // ─── Posts ────────────────────────────────────────────────────────────────
    /** Server → Feed: reaction count updated on a post */
    POST_REACTION_UPDATED: 'post:reaction_updated',
    /** Server → Feed: new comment on a post */
    POST_NEW_COMMENT: 'post:new_comment',

    // ─── Calls / WebRTC ───────────────────────────────────────────────────────
    /** Server → Callee: incoming call signal */
    CALL_INCOMING: 'call:incoming',
    /** Server → Participants: call was accepted */
    CALL_ACCEPTED: 'call:accepted',
    /** Server → Participants: call was rejected */
    CALL_REJECTED: 'call:rejected',
    /** Server → Participants: call ended */
    CALL_ENDED: 'call:ended',
    /** Client → Server: caller cancelled before pickup */
    CALL_CANCEL: 'call:cancel',
    /** Server → All: call was cancelled */
    CALL_CANCELED: 'call:canceled',
    /** Client ↔ Client (relayed): WebRTC SDP offer/answer */
    WEBRTC_SDP: 'webrtc_sdp',
    /** Client ↔ Client (relayed): WebRTC ICE candidate */
    WEBRTC_ICE: 'webrtc_ice',

    // ─── Admin / Moderation ───────────────────────────────────────────────────
    /** Server → Admin: new report filed (manual or auto-mod) */
    ADMIN_NEW_REPORT: 'admin:new_report',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
