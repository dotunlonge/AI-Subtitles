import { Effect, Layer, Console, Config } from "effect";
import * as S from "@effect/schema/Schema";
import * as OS from "node:os";
import * as Path from "node:path";
import * as FS from "node:fs/promises";
import * as FsSync from "node:fs";
import { BunContext } from "@effect/platform-bun";

import { Command, Args } from "@effect/cli";

import { YoutubeDownloadError, TranscriptionError, InvalidUrlError } from "./errors";
import type { SubtitleResult, SubtitleToken, YouTubeUrl } from "./model";
import YtDlpWrap from "yt-dlp-wrap";

// -----------------------------
// Services (Effect.Service style)
// -----------------------------

/**
 * Service for providing CLI arguments to the application.
 * Contains the validated YouTube URL from command line input.
 */
export class CliArgs extends Effect.Service<CliArgs>()("CliArgs", {
  succeed: { url: "" as YouTubeUrl }
}) {}

/**
 * Service for file system operations including temporary file management.
 * Handles creation and cleanup of temporary files for audio processing.
 */
class FileSystemService extends Effect.Service<FileSystemService>()("FileSystemService", {
  succeed: {
    /**
     * Creates a temporary file with the specified extension.
     * @param extension - File extension (e.g., "wav", "mp3")
     * @returns Effect that yields the path to the created temporary file
     */
    makeTempFile: (extension: string) =>
      Effect.tryPromise({
        try: async () => Path.join(await FS.realpath(OS.tmpdir()), `fluent-ai-subtitles-${Date.now()}.${extension}`),
        catch: (error: unknown) => new YoutubeDownloadError({ error }),
      }),

    /**
     * Cleans up a temporary file by deleting it from the filesystem.
     * @param path - Path to the file to delete
     * @returns Effect that completes when file is deleted (or silently succeeds if file doesn't exist)
     */
    cleanupFile: (path: string) =>
      Effect.tryPromise({
        try: () => FS.unlink(path),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)))
  }
}) {}

/**
 * Service for downloading audio from YouTube videos.
 * Handles video extraction and conversion to audio format using yt-dlp.
 */
class YouTubeDownloader extends Effect.Service<YouTubeDownloader>()("YouTubeDownloader", {
  effect: Effect.gen(function* (_) {
    const fs = yield* _(FileSystemService);
    const ytDlpWrap = new YtDlpWrap("./yt-dlp");

    return {
      /**
       * Downloads and extracts audio from a YouTube URL.
       * @param url - The YouTube URL to download audio from
       * @returns Effect that yields the path to the downloaded audio file
       */
      getAudio: (url: string) =>
        Effect.acquireRelease(
          fs.makeTempFile("wav"),
          (file) => fs.cleanupFile(file)
        )
        .pipe(
          Effect.flatMap((file) =>
            Effect.tryPromise({
              try: (signal: AbortSignal) =>
                new Promise<void>((resolve, reject) => {
                  // yt-dlp-wrap starts a child process; `exec` returns child in some versions
                  const proc = ytDlpWrap.exec([
                    url,
                    "-x",
                    "--audio-format",
                    "wav",
                    "-o",
                    file,
                  ]);

                  // Listen for process events
                  // If the wrapped API gives us a promise instead, adapt accordingly.
                  if (typeof (proc as any).on === "function") {
                    (proc as any).on("error", (e: unknown) => {
                      console.error("yt-dlp process error:", e);
                      reject(e);
                    });
                    (proc as any).on("close", (code: number | null) => {
                      if (code === 0) resolve();
                      else {
                        console.error(`yt-dlp process failed with exit code: ${code}`);
                        reject(new YoutubeDownloadError({ error: new Error(`yt-dlp exited with code ${code}`) }));
                      }
                    });
                  } else if ((proc as any).then) {
                    // some versions return a Promise
                    (proc as any).then(() => resolve()).catch((e: unknown) => reject(e));
                  } else {
                    // fallback: resolve immediately (best-effort)
                    resolve();
                  }

                  signal.addEventListener("abort", () => {
                    // Best-effort: we can't reliably kill child across versions here
                    reject(new YoutubeDownloadError({ error: new Error("aborted") }));
                  });
                }),
              catch: (error: unknown) => new YoutubeDownloadError({ error }),
            }).pipe(Effect.map(() => file))
          )
        ),
    } as const;
  }),
  dependencies: [FileSystemService.Default]
}) {}


// -----------------------------
// AssemblyAI Config Service
// -----------------------------
class AssemblyAIConfigService extends Effect.Service<AssemblyAIConfigService>()("AssemblyAIConfigService", {
  effect: Effect.gen(function* (_) {
    const key = yield* _(Config.string("ASSEMBLYAI_KEY"));
    return { key } as const;
  }),
}) {}

// -----------------------------
// Transcription Service via AssemblyAI
// -----------------------------
class Transcription extends Effect.Service<Transcription>()("Transcription", {
  effect: Effect.gen(function* (_) {
    const config = yield* _(AssemblyAIConfigService);

    return {
      transcribe: (filePath: string) =>
        Effect.tryPromise({
          try: async (signal: AbortSignal) => {
            
            console.log("Reading audio file...");
            const audioBuffer = await FS.readFile(filePath);
            // const audioBlob = new Blob([audioBuffer]);
            console.log("Uploading audio to AssemblyAI...");
            
            const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
              method: "POST",
              headers: { "authorization": config.key, "Content-Type": "application/octet-stream" },
              body: audioBuffer,
            });
            
            const uploadData = await uploadResp.json() as { upload_url: string };
            console.log("Upload complete:", uploadData.upload_url);
            console.log("Requesting transcription...");
            
            const transcriptResp = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: { "authorization": config.key },
            body: JSON.stringify({
                audio_url: uploadData.upload_url,
                speech_model: "universal",
            }),
            });

            const transcriptData = await transcriptResp.json() as { id: string };
            const transcriptId = transcriptData.id;
            console.log("Polling for transcription completion...");
            let completed = false;
            let transcriptText = "";
            const MAX_POLL_TIME = 20 * 60 * 1000; // 20 minutes
            const POLL_INTERVAL = 3000; // 3 seconds
            let elapsed = 0;

            while (!completed) {
            if (signal.aborted) throw new Error("Transcription aborted");
            if (elapsed > MAX_POLL_TIME) throw new Error("Transcription timed out");

            const statusResp = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { authorization: config.key },
            });

            const statusData = await statusResp.json() as {
                status: string;
                text?: string;
                words?: Array<{ text: string; start: number; end: number; confidence: number }>;
                error?: string;
            };
              
             if (statusData.status === "completed") {
                completed = true;
                transcriptText = statusData.text || "";
                // Map words into SubtitleResult tokens
                const subtitles = (statusData.words || []).map((w, i) => ({
                    id: i,
                    value: w.text,
                    startTimeMs: w.start,
                    endTimeMs: w.end,
                    score: w.confidence,
                }));

                return subtitles;
            } else if (statusData.status === "error") {
                throw new Error(`AssemblyAI transcription failed: ${statusData.error}`);
            } else {                                                     
                await new Promise((r) => setTimeout(r, POLL_INTERVAL));
                elapsed += POLL_INTERVAL;
            }
        }
        },
          catch: (error: unknown) => {
            console.error("Transcription failed:", error);
            return new TranscriptionError({ error: error instanceof Error ? error : new Error(String(error)) });
          },
        }),
    } as const;
  }),
  dependencies: [AssemblyAIConfigService.Default],
}) {}

// -----------------------------
// Main program
// -----------------------------

/**
 * Main application program that orchestrates the subtitle generation process.
 * 
 * Process flow:
 * 1. Gets validated YouTube URL from CLI arguments
 * 2. Downloads and extracts audio from the YouTube video
 * 3. Transcribes the audio using AssemblyAI
 * 4. Outputs the subtitle results as JSON
 * 
 * Uses Effect's dependency injection to access required services.
 */
export const program = Effect.gen(function* (_) {
  const args = yield* _(CliArgs);
  const downloader = yield* _(YouTubeDownloader);
  const transcriber = yield* _(Transcription);

  yield* _(Console.log(`Processing URL: ${args.url}`));
  const audioFile = yield* _(downloader.getAudio(args.url));
  yield* _(Console.log(`Audio downloaded to: ${audioFile}`));

  const subtitles = yield* _(transcriber.transcribe(audioFile));
  yield* _(Console.log(JSON.stringify(subtitles, null, 2)));
});
// -----------------------------
// CLI wiring
// -----------------------------

/** Command line argument definition for YouTube URL */
const urlArg = Args.text({ name: "url" });

/**
 * Main CLI command definition.
 * Handles URL validation and dependency injection setup.
 * 
 * @param url - YouTube URL provided via command line
 * @returns Effect that runs the complete subtitle generation pipeline
 */
const command = Command.make("dev", { url: urlArg }, ({ url }) => {
  /**
   * Validates if a string is a proper YouTube URL.
   * Supports both youtube.com and youtu.be formats.
   * 
   * @param url - URL string to validate
   * @returns Type guard indicating if URL is a valid YouTube URL
   */
  const isValidYouTubeUrl = (url: string): url is YouTubeUrl => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})$/; // Corrected regex escaping
  return youtubeRegex.test(url);
};


  const validateUrl = isValidYouTubeUrl(url)
    ? Effect.succeed(url as YouTubeUrl)
    : Effect.fail(new InvalidUrlError({ url }));

  return Effect.gen(function* (_) {
    const validatedUrl = yield* _(validateUrl);
    
    const CliArgsLive = Layer.succeed(CliArgs, CliArgs.make({ url: validatedUrl }));

    /** Complete application layer with all service implementations */
    const appLayer = Layer.mergeAll(
      BunContext.layer,
      CliArgsLive,
      AssemblyAIConfigService.Default,
      FileSystemService.Default,
      YouTubeDownloader.Default,
      Transcription.Default
    );

    return yield* _(Effect.provide(program, appLayer), Effect.scoped);
  });
});

/** CLI runner configuration with application metadata */
const cli = Command.run(command, {
  name: "subtitle-generator",
  version: "1.0.0",
});

// Execute the CLI with Bun runtime arguments
if (import.meta.main) {
  Effect.runPromise(cli(Bun.argv) as Effect.Effect<void>).catch(console.error);
}
