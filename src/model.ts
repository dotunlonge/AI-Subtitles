import * as S from "@effect/schema/Schema";

/**
 * Represents a single subtitle token with timing and confidence information.
 * 
 * This is the core data structure for subtitle entries, containing:
 * - Unique identifier within the subtitle sequence
 * - Transcribed text content
 * - Precise timing information in milliseconds
 * - Confidence score from the speech recognition API
 * 
 * @tsplus type SubtitleToken
 */
export type SubtitleToken = S.Schema.Type<typeof SubtitleTokenSchema>;

/**
 * Schema definition for subtitle token validation and type safety.
 * 
 * @property id - Sequential identifier starting from 0
 * @property value - The transcribed text content
 * @property startTimeMs - Start time in milliseconds from beginning of audio
 * @property endTimeMs - End time in milliseconds from beginning of audio  
 * @property score - Confidence score from speech API (0.0 to 1.0)
 */
export const SubtitleTokenSchema = S.Struct({
  id: S.Number,
  value: S.String,
  startTimeMs: S.Number,
  endTimeMs: S.Number,
  score: S.Number,
});

/**
 * Represents the complete subtitle result as an array of subtitle tokens.
 * 
 * This is the final output format containing all transcribed segments
 * from a video, ordered chronologically by timing.
 * 
 * @tsplus type SubtitleResult
 */
export type SubtitleResult = S.Schema.Type<typeof SubtitleResultSchema>;

/**
 * Schema definition for the complete subtitle result array.
 * Ensures type safety for the collection of subtitle tokens.
 */
export const SubtitleResultSchema = S.Array(SubtitleTokenSchema);

/**
 * Schema for validating YouTube URLs.
 * 
 * Supports both standard YouTube formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - HTTP and HTTPS protocols
 * - With or without www subdomain
 * 
 * @example
 * ```typescript
 * // Valid URLs:
 * // - "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 * // - "https://youtu.be/dQw4w9WgXcQ"
 * // - "http://youtube.com/watch?v=dQw4w9WgXcQ&t=30s"
 * ```
 */
export const YouTubeUrlSchema = S.String.pipe(
  S.pattern(/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}.*$/),
  S.brand("YouTubeUrl")
);

/**
 * Branded string type for validated YouTube URLs.
 * Provides compile-time type safety ensuring only validated URLs are used.
 */
export type YouTubeUrl = S.Schema.Type<typeof YouTubeUrlSchema>;
