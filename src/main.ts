import { Effect, Layer, Console, Context, Scope, Config } from "effect";
import * as OS from "node:os";
import * as Path from "node:path";
import * as FS from "node:fs/promises";
import * as FsSync from "node:fs";
import {
  AudioConfig,
  SpeechRecognizer,
  ResultReason,
  SpeechConfig as SpeechSDKConfig,
} from "microsoft-cognitiveservices-speech-sdk";
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
class CliArgs extends Effect.Service<CliArgs>()("CliArgs", {
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
        ).pipe(
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

/**
 * Service for Microsoft Cognitive Services Speech API configuration.
 * Provides API key and region settings from environment variables.
 */
class SpeechConfigService extends Effect.Service<SpeechConfigService>()("SpeechConfigService", {
  effect: Effect.gen(function* (_) {
    const key = yield* _(Config.string("SPEECH_KEY"));
    const region = yield* _(Config.string("SPEECH_REGION"));
    return { 
      /** Microsoft Speech API subscription key */
      key, 
      /** Azure region for the Speech service (e.g., "eastus", "westus2") */
      region 
    } as const;
  })
}) {}

/**
 * Service for transcribing audio files to subtitle tokens.
 * Uses Microsoft Cognitive Services Speech-to-Text API.
 */
class Transcription extends Effect.Service<Transcription>()("Transcription", {
  effect: Effect.gen(function* (_) {
    const speechCfg = yield* _(SpeechConfigService);

    return {
      /**
       * Transcribes an audio file to subtitle result with timing and confidence.
       * @param audioFilePath - Path to the WAV audio file to transcribe
       * @returns Effect that yields an array of subtitle tokens with timing and confidence scores
       */
      transcribe: (filePath: string) =>
        Effect.tryPromise({
          try: (signal: AbortSignal) =>
            new Promise<SubtitleResult[]>((resolve, reject) => {
              try {
                const sdkConfig = SpeechSDKConfig.fromSubscription(speechCfg.key, speechCfg.region);

                // Read .wav into a Buffer and pass to SDK
                const buffer = FsSync.readFileSync(filePath);
                const audioConfig = AudioConfig.fromWavFileInput(buffer as any);
                const recognizer = new SpeechRecognizer(sdkConfig, audioConfig);
                const results: Array<SubtitleToken> = [];

                /**
                 * Handle recognized speech events.
                 * Extracts text, timing, and confidence scores from Speech API results.
                 */
                recognizer.recognized = (_s: unknown, e: any) => {
                  if (e && e.result && e.result.reason === ResultReason.RecognizedSpeech) {
                    // Extract confidence score from the Speech API result
                    // The confidence score is typically available in the result properties
                    const confidence = e.result.properties?.getProperty("Speech.Phrase.Confidence") 
                      || e.result.confidence 
                      || 0.5; // fallback to moderate confidence if not available
                    
                    results.push({
                      id: results.length,
                      value: e.result.text,
                      startTimeMs: Number(e.result.offset / 10000), // Convert from 100ns ticks to ms
                      endTimeMs: Number((e.result.offset + e.result.duration) / 10000), // Convert from 100ns ticks to ms
                      score: Number(confidence),
                    });
                  }
                };

                /** Handle session stopped - complete transcription */
                recognizer.sessionStopped = () => {
                  try {
                    recognizer.stopContinuousRecognitionAsync();
                  } catch (_) {}
                  resolve(results as unknown as SubtitleResult[]);
                };

                /** Handle cancellation/errors during transcription */
                recognizer.canceled = (_s: unknown, e: any) => {
                  try {
                    recognizer.stopContinuousRecognitionAsync();
                  } catch (_) {}
                  reject(new TranscriptionError({ error: e }));
                };

                recognizer.startContinuousRecognitionAsync();

                /** Handle manual abortion via signal */
                signal.addEventListener("abort", () => {
                  try {
                    recognizer.stopContinuousRecognitionAsync();
                  } catch (_) {}
                  reject(new TranscriptionError({ error: new Error("aborted") }));
                });
              } catch (err) {
                reject(err);
              }
            }),
          catch: (error: unknown) => new TranscriptionError({ error }),
        }),
    } as const;
  }),
  dependencies: [SpeechConfigService.Default]
}) {}

// Effect.Service automatically provides layers, so no manual layer definitions needed

// -----------------------------
// Main program
// -----------------------------

/**
 * Main application program that orchestrates the subtitle generation process.
 * 
 * Process flow:
 * 1. Gets validated YouTube URL from CLI arguments
 * 2. Downloads and extracts audio from the YouTube video
 * 3. Transcribes the audio using Microsoft Speech API
 * 4. Outputs the subtitle results as JSON
 * 
 * Uses Effect's dependency injection to access required services.
 */
const program = Effect.gen(function* (_) {
  const args = yield* _(CliArgs);
  const downloader = yield* _(YouTubeDownloader);
  const transcriber = yield* _(Transcription);

  yield* _(Console.log(`Processing URL: ${args.url}`));

  const audioFile = yield* _(downloader.getAudio(args.url));

  yield* _(Console.log(`Audio downloaded to: ${audioFile}`));

  const subtitles = yield* _(transcriber.transcribe(audioFile));

  const jsonOutput = JSON.stringify(subtitles, null, 2);
  yield* _(Console.log(jsonOutput));
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
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}.*$/;
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
      CliArgsLive,
      SpeechConfigService.Default,
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
Effect.runPromise(cli(Bun.argv) as Effect.Effect<void>).catch(console.error);