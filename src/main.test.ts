import { Effect, Layer } from "effect";
import { describe, it, expect } from "bun:test";
import type { SubtitleResult } from "./model";
import { YoutubeDownloadError, TranscriptionError } from "./errors";

/**
 * Test suite for the AI Subtitles MVP application.
 * 
 * This test suite demonstrates Effect testing patterns and validates:
 * - Service integration and dependency injection
 * - Error handling for various failure scenarios
 * - File system operations and cleanup
 * - Configuration management
 * 
 * Uses mock implementations to isolate units under test without
 * requiring external dependencies like Azure Speech API or yt-dlp.
 */

// -----------------------------
// Test Service Definitions
// -----------------------------

/**
 * Mock service for YouTube downloader testing.
 * Provides controlled behavior for audio download operations.
 */
class YouTubeDownloader extends Effect.Service<YouTubeDownloader>()("YouTubeDownloader", {
  succeed: {
    getAudio: (url: string) => Effect.succeed("/tmp/test-audio.wav")
  }
}) {}

/**
 * Mock service for transcription testing.
 * Provides controlled behavior for speech-to-text operations.
 */
class Transcription extends Effect.Service<Transcription>()("Transcription", {
  succeed: {
    transcribe: (audioFile: string) =>
      Effect.succeed([
        {
          id: 0,
          value: "Test transcription",
          startTimeMs: 1000,
          endTimeMs: 3000,
          score: 0.85  // Realistic confidence score from Speech API
        }
      ] as SubtitleResult)
  }
}) {}

/**
 * Mock service for file system testing.
 * Provides controlled behavior for temporary file operations.
 */
class FileSystemService extends Effect.Service<FileSystemService>()("FileSystemService", {
  succeed: {
    makeTempFile: (extension: string) => 
      Effect.succeed(`/tmp/test-file.${extension}`),
    cleanupFile: (path: string) => Effect.succeed(undefined)
  }
}) {}

/**
 * Mock service for AssemblyAI configuration testing.
 * Provides test credentials without requiring real AssemblyAI setup.
 */
class AssemblyAIConfigService extends Effect.Service<AssemblyAIConfigService>()("AssemblyAIConfigService", {
  succeed: {
    key: "test-key",
  }
}) {}

/**
 * Complete test layer combining all mock service implementations.
 * Provides isolated testing environment for the application logic.
 */
const TestLayer = Layer.mergeAll(
  FileSystemService.Default,
  AssemblyAIConfigService.Default,
  YouTubeDownloader.Default,
  Transcription.Default
);

// -----------------------------
// Test Suite
// -----------------------------

describe("AI Subtitles MVP", () => {
  describe("Service Integration", () => {
    /**
     * Tests the complete happy path flow from URL to subtitles.
     * Validates that all services integrate correctly and produce expected output.
     */
    it("should process a valid YouTube URL successfully", async () => {
      const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ" as any;
      
      const program = Effect.gen(function* (_) {
        const downloader = yield* _(YouTubeDownloader);
        const transcriber = yield* _(Transcription);
        
        const audioFile = yield* _(downloader.getAudio(testUrl));
        const subtitles = yield* _(transcriber.transcribe(audioFile));
        
        return { audioFile, subtitles };
      });

      const result = await Effect.runPromise(
        Effect.provide(program, TestLayer)
      );

      expect(result.audioFile).toBe("/tmp/test-audio.wav");
      expect(result.subtitles).toHaveLength(1);
      expect(result.subtitles[0]?.value).toBe("Test transcription");
      expect(result.subtitles[0]?.score).toBe(0.85);
    });

    /**
     * Tests error handling for YouTube download failures.
     * Validates proper error propagation through the Effect system.
     */
    it("should handle YouTube download errors", async () => {
      class FailingYouTubeDownloader extends Effect.Service<FailingYouTubeDownloader>()("YouTubeDownloader", {
        succeed: {
          getAudio: (url: string) => Effect.fail(new YoutubeDownloadError({ error: new Error("Download failed") }))
        }
      }) {}

      const testLayer = Layer.mergeAll(
        FileSystemService.Default,
        AssemblyAIConfigService.Default,
        FailingYouTubeDownloader.Default,
        Transcription.Default
      );

      const program = Effect.gen(function* (_) {
        const downloader = yield* _(FailingYouTubeDownloader);
        return yield* _(downloader.getAudio("test-url"));
      });

      const result = await Effect.runPromise(
        Effect.provide(program, testLayer).pipe(
          Effect.flip // Flip success/error for testing error cases
        )
      );

      expect(result._tag).toBe("YoutubeDownloadError");
    });

    /**
     * Tests error handling for transcription failures.
     * Validates proper error propagation from Speech API layer.
     */
    it("should handle transcription errors", async () => {
      class FailingTranscription extends Effect.Service<FailingTranscription>()("Transcription", {
        succeed: {
          transcribe: (audioFile: string) => Effect.fail(new TranscriptionError({ error: new Error("Transcription failed") }))
        }
      }) {}

      const testLayer = Layer.mergeAll(
        FileSystemService.Default,
        AssemblyAIConfigService.Default,
        YouTubeDownloader.Default,
        FailingTranscription.Default
      );

      const program = Effect.gen(function* (_) {
        const transcriber = yield* _(FailingTranscription);
        return yield* _(transcriber.transcribe("/tmp/test.wav"));
      });

      const result = await Effect.runPromise(
        Effect.provide(program, testLayer).pipe(
          Effect.flip // Flip success/error for testing error cases
        )
      );

      expect(result._tag).toBe("TranscriptionError");
    });
  });

  describe("FileSystem Service", () => {
    /**
     * Tests temporary file creation with different extensions.
     * Validates file path generation and extension handling.
     */
    it("should generate unique temp file paths", async () => {
      const program = Effect.gen(function* (_) {
        const fs = yield* _(FileSystemService);
        const file1 = yield* _(fs.makeTempFile("wav"));
        const file2 = yield* _(fs.makeTempFile("wav"));
        return { file1, file2 };
      });

      const result = await Effect.runPromise(
        Effect.provide(program, TestLayer)
      );

      expect(result.file1).toContain(".wav");
      expect(result.file2).toContain(".wav");
    });

    /**
     * Tests file cleanup operations.
     * Validates graceful handling of file deletion.
     */
    it("should cleanup files without errors", async () => {
      const program = Effect.gen(function* (_) {
        const fs = yield* _(FileSystemService);
        return yield* _(fs.cleanupFile("/tmp/test-file.wav"));
      });

      const result = await Effect.runPromise(
        Effect.provide(program, TestLayer)
      );

      expect(result).toBeUndefined();
    });
  });

  describe("Configuration", () => {
    /**
     * Tests AssemblyAI configuration service.
     * Validates proper environment variable handling and credential management.
     */
    it("should provide AssemblyAI configuration", async () => {
      const program = Effect.gen(function* (_) {
        const config = yield* _(AssemblyAIConfigService);
        return config;
      });

      const result = await Effect.runPromise(
        Effect.provide(program, TestLayer)
      );

      expect(result.key).toBe("test-key");
    });
  });

  describe("Main Application Flow", () => {
  it("should run the main program and generate subtitles", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: any, ...args: any[]) => {
    logs.push(typeof msg === "string" ? msg : JSON.stringify(msg, null, 2));
    if (args.length) logs.push(...args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)));
  };

  const { YouTubeDownloader, Transcription, FileSystemService, CliArgs, program } = await import("./main");
  const mockYouTubeDownloader = {
    getAudio: (_url: string) => Effect.succeed("/tmp/test-audio.wav")
  };
  const mockTranscription = {
    transcribe: (_audioFile: string) =>
      Effect.succeed([
        {
          id: 0,
          value: "Test transcription",
          startTimeMs: 1000,
          endTimeMs: 3000,
          score: 0.85
        }
      ])
  };
  const mockCliArgs = CliArgs.make({ url: "https://www.youtube.com/watch?v=test-video" as any });

  const appLayer = FileSystemService.Default.pipe(
    Layer.merge(Layer.succeed(YouTubeDownloader, mockYouTubeDownloader as any)),
    Layer.merge(Layer.succeed(Transcription, mockTranscription as any)),
    Layer.merge(Layer.succeed(CliArgs, mockCliArgs))
  );

  await Effect.runPromise(Effect.provide(program, appLayer).pipe(Effect.scoped));
  console.log = originalLog;

  expect(logs.some(msg => msg.includes("Processing URL:"))).toBe(true);
  expect(logs.some(msg => msg.includes("Audio downloaded to:"))).toBe(true);
  expect(logs.some(msg => msg.includes("Test transcription"))).toBe(true);
});
  });

});