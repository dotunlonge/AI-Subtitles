
import YTDlpWrap from "yt-dlp-wrap";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await YTDlpWrap.downloadFromGithub(path.join(__dirname, "yt-dlp"));
