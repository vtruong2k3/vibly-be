// Queue and job name constants — single source of truth
export const FEED_QUEUE = 'feed';

export const FEED_JOBS = {
    FAN_OUT_POST: 'fan_out_post',
} as const;

export interface FanOutPostJob {
    postId: string;
    authorUserId: string;
}
