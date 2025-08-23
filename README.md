# AI Subtitles MVP

A TypeScript CLI application that generates AI-powered subtitles from YouTube videos using Microsoft Cognitive Services Speech-to-Text API, built with the Effect framework.

## Project Setup and Installation

### Prerequisites

- [Bun](https://bun.com) runtime (latest stable version)
- Microsoft Azure Cognitive Services Speech subscription

### Installation Steps

1. Clone the repository and install dependencies:
```bash
bun install
```

2. The postinstall script will automatically download yt-dlp binary.

## Environment Configuration

### Required API Keys

Create a `.env` file in the project root or set the following environment variables:

```bash
# Microsoft Cognitive Services Speech API
SPEECH_KEY=your_speech_api_key_here
SPEECH_REGION=your_region_here  # e.g., "eastus", "westus2"
```

### Getting Microsoft Speech API Keys

1. Go to the [Azure Portal](https://portal.azure.com)
2. Create a new "Speech Services" resource
3. Copy the API key and region from the resource overview
4. Set the `SPEECH_KEY` and `SPEECH_REGION` environment variables

## CLI Usage Examples

### Basic Usage

```bash
# Process a YouTube video and generate subtitles
bun run dev "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Sample Output

```json
[
  {
    "id": 0,
    "value": "Welcome to this tutorial on Effect framework.",
    "startTimeMs": 1200,
    "endTimeMs": 4800,
    "score": 0.92
  },
  {
    "id": 1,
    "value": "Today we'll learn about functional programming.",
    "startTimeMs": 5000,
    "endTimeMs": 8500,
    "score": 0.87
  }
]
```

### Alternative Scripts

```bash
# Using npm-style scripts
bun run dev <youtube-url>
bun run start <youtube-url>
```

## Architecture Overview

### Effect Framework Usage

This application demonstrates advanced Effect framework patterns:

- **Service Architecture**: Services defined using `Context.Tag` for dependency injection
- **Layer Composition**: Modular layer composition with `Layer.mergeAll`
- **Error Handling**: Tagged error types using `Data.TaggedError`
- **Configuration**: Environment variables managed with `Config` module
- **Resource Management**: Automatic cleanup using `Effect.acquireRelease`
- **Schema Validation**: Type-safe data validation with `@effect/schema`

### Core Services

- **YouTubeDownloader**: Extracts audio streams from YouTube URLs using yt-dlp
- **Transcription**: Processes audio through Microsoft Speech API
- **FileSystemService**: Manages temporary file creation and cleanup  
- **SpeechConfigService**: Handles API configuration from environment

### Data Flow

1. **Input Validation**: YouTube URL validated and parsed
2. **Audio Extraction**: Video downloaded and converted to WAV format
3. **Speech Recognition**: Audio processed through Microsoft Cognitive Services
4. **Output Generation**: Results formatted as JSON array of `SubtitleToken` objects

## Troubleshooting Guide

### Common Issues

#### "SPEECH_KEY or SPEECH_REGION not set"
- **Cause**: Missing or incorrect environment variables
- **Solution**: Verify `.env` file contains valid `SPEECH_KEY` and `SPEECH_REGION`

#### "yt-dlp exited with code 1"
- **Cause**: Invalid YouTube URL or video not accessible
- **Solutions**: 
  - Check URL format: `https://www.youtube.com/watch?v=VIDEO_ID`
  - Ensure video is public and not age-restricted
  - Try a different video

#### Audio format issues
- **Cause**: yt-dlp audio extraction problems
- **Solution**: Application automatically converts to WAV format required by Speech API

#### Network/API errors
- **Cause**: Network connectivity or API rate limits
- **Solution**: 
  - Check internet connection
  - Verify Azure Speech service quotas
  - Wait and retry for rate limit issues

### Debug Mode

Set environment variable for more detailed logging:
```bash
DEBUG=1 bun run dev <youtube-url>
```

### Checking Dependencies

Verify all dependencies are installed:
```bash
bun install --verbose
```

### File Permissions

If you encounter permission errors:
```bash
chmod +x ./yt-dlp
```

## Technical Details

- **Runtime**: Bun (ESNext modules)
- **Language**: TypeScript (strict mode)
- **Framework**: Effect with functional programming patterns
- **Audio Processing**: yt-dlp → WAV conversion → Microsoft Speech SDK
- **Output Format**: JSON conforming to `SubtitleToken` interface
# AI-Subtitles
