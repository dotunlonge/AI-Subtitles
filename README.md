# AI Subtitles MVP

A TypeScript CLI application that generates AI-powered subtitles from YouTube videos using AssemblyAI Speech-to-Text API, built with the Effect framework.

## Project Setup and Installation


### Prerequisites

- [Bun](https://bun.com) runtime (latest stable version)
- AssemblyAI API key (free tier available)
- **FFmpeg** - Required for YouTube audio extraction and conversion

#### Installing FFmpeg

FFmpeg is essential for converting YouTube audio to the WAV format required by AssemblyAI Speech-to-Text API.

**macOS:**
```bash
# Using Homebrew (recommended)
brew install ffmpeg

# Or download from official site
# https://ffmpeg.org/download.html#build-mac
```

**Windows:**
```bash
# Using Windows Package Manager
winget install ffmpeg

# Or download from official site
# https://ffmpeg.org/download.html#build-windows
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# RHEL/CentOS/Fedora
sudo yum install ffmpeg
# or
sudo dnf install ffmpeg
```

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
# AssemblyAI API Key
ASSEMBLYAI_KEY=your_assemblyai_api_key_here
```


### Getting AssemblyAI API Keys

1. Go to the [AssemblyAI website](https://www.assemblyai.com/)
2. Sign up or log in.
3. Navigate to your dashboard or API settings to find your API key.
4. Set the `ASSEMBLYAI_KEY` environment variable.

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

## Development

### Running Tests

To run the unit and integration tests:

```bash
bun test
```

### Linting

To run the linter and check for code style issues:

```bash
bun run lint
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
- **Transcription**: Processes audio through AssemblyAI API
- **FileSystemService**: Manages temporary file creation and cleanup
- **AssemblyAIConfigService**: Handles API configuration from environment

### Data Flow

1. **Input Validation**: YouTube URL validated and parsed
2. **Audio Extraction**: Video downloaded and converted to WAV format
3. **Speech Recognition**: Audio processed through AssemblyAI
4. **Output Generation**: Results formatted as JSON array of `SubtitleToken` objects

## Troubleshooting Guide

### Common Issues



#### "yt-dlp exited with code 1"
- **Cause**: Invalid YouTube URL or video not accessible
- **Solutions**: 
  - Check URL format: `https://www.youtube.com/watch?v=VIDEO_ID`
  - Ensure video is public and not age-restricted
  - Try a different video

#### "FFmpeg is required but not found" 
- **Cause**: FFmpeg is not installed or not available in system PATH
- **Solutions**:
  - Install FFmpeg using the instructions in Prerequisites section
  - Restart your terminal after installation
  - Verify installation: `ffmpeg -version`
  - On macOS, ensure Homebrew's bin directory is in your PATH

#### Audio format issues
- **Cause**: yt-dlp audio extraction problems or FFmpeg conversion failures
- **Solutions**: 
  - Ensure FFmpeg is properly installed and accessible
  - Application automatically converts to WAV format required by AssemblyAI
  - Check video accessibility (not private/age-restricted)

#### Network/API errors
- **Cause**: Network connectivity or API rate limits
- **Solution**: 
  - Check internet connection
  - Verify AssemblyAI API quotas
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
- **Audio Processing**: yt-dlp → WAV conversion → AssemblyAI
- **Output Format**: JSON conforming to `SubtitleToken` interface
