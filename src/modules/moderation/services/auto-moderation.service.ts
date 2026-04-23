import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class AutoModerationService {
    private readonly logger = new Logger(AutoModerationService.name);
    private cachedKeywords: string[] = [];
    private lastFetchTime = 0;
    private readonly CACHE_TTL_MS = 60_000; // cache for 1 minute to avoid DB spam

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Scans content against the dynamic blacklist.
     * Returns true if a blacklisted keyword is found.
     */
    async containsBlacklistedKeyword(content: string): Promise<boolean> {
        if (!content) return false;

        await this.refreshCacheIfNeeded();
        if (this.cachedKeywords.length === 0) return false;

        // Normalize content for case-insensitive matching
        const normalizedContent = content.toLowerCase();

        // Check if any keyword exists in the content
        // We boundary-match if necessary in the future, for now simple substring match or word match
        for (const keyword of this.cachedKeywords) {
            // Regex word boundary matching \b to prevent partial matches like "spaceship" triggering on "space"
            // But some Vietnamese words might be multiple words so simple includes is sometimes safer/riskier.
            // We will use standard string.includes() for basic moderation.
            if (normalizedContent.includes(keyword)) {
                this.logger.debug(`Auto-moderation flag: content contained "${keyword}"`);
                return true;
            }
        }

        return false;
    }

    /**
     * Clears the cache to force a DB re-fetch on next scan.
     * Called by Admin Controller when a new keyword is added/removed.
     */
    invalidateCache() {
        this.lastFetchTime = 0;
    }

    private async refreshCacheIfNeeded() {
        const now = Date.now();
        if (now - this.lastFetchTime > this.CACHE_TTL_MS) {
            try {
                const keywords = await this.prisma.blacklistedKeyword.findMany({
                    select: { keyword: true },
                });
                // Normalize to lowercase for matching
                this.cachedKeywords = keywords.map((k) => k.keyword.toLowerCase());
                this.lastFetchTime = now;
            } catch (error) {
                this.logger.error('Failed to fetch blacklisted keywords for auto-moderation', error);
            }
        }
    }
}
