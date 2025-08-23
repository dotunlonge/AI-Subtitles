import { Data } from "effect";

/**
 * Error thrown when an invalid YouTube URL is provided.
 * 
 * This error occurs during URL validation when the provided string
 * doesn't match the expected YouTube URL format.
 * 
 * @example
 * ```typescript
 * // Invalid URLs that would trigger this error:
 * // - "https://vimeo.com/123456"
 * // - "not-a-url"
 * // - "https://youtube.com/invalid"
 * ```
 */
export class InvalidUrlError extends Data.TaggedError("InvalidUrlError")<{ url: string }> {}

/**
 * Error thrown during YouTube video download and audio extraction process.
 * 
 * This error can occur due to various reasons:
 * - Network connectivity issues
 * - Video is private, deleted, or age-restricted
 * - yt-dlp process failures
 * - File system permission issues
 * - Temporary file creation failures
 * 
 * The `error` property contains the underlying cause for debugging.
 */
export class YoutubeDownloadError extends Data.TaggedError("YoutubeDownloadError")<{ error: unknown }> {}

/**
 * Error thrown during audio transcription process.
 * 
 * This error can occur due to various reasons:
 * - Invalid or missing Microsoft Speech API credentials
 * - Network connectivity issues with Azure services
 * - Audio file format incompatibility
 * - Speech recognition service limits/quotas exceeded
 * - Audio file corruption or unreadable content
 * 
 * The `error` property contains the underlying cause for debugging.
 */
export class TranscriptionError extends Data.TaggedError("TranscriptionError")<{ error: unknown }> {}
