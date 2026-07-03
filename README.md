# Tutorly

An AI tutor that writes every course on the fly. Tell it what you want to learn — it infers your goal, then generates lessons, quizzes, and hands-on projects one step at a time, powered by Claude (via Claude Code, the Anthropic API, or a local model).

## Install

### macOS (Apple Silicon) — Homebrew

```sh
brew install --cask oguzcankarakoc/tap/tutorly && xattr -dr com.apple.quarantine /Applications/Tutorly.app && open -a Tutorly
```

The `xattr` step clears macOS's quarantine flag. It's needed because the app isn't notarized yet — without it, macOS reports the app as "damaged" and refuses to open it. You only need it once per install or upgrade.

Update later with:

```sh
brew upgrade --cask tutorly && xattr -dr com.apple.quarantine /Applications/Tutorly.app
```

### Direct download

Grab the latest installer from [Releases](https://github.com/OguzcanKarakoc/tutorly/releases):

- **macOS (Apple Silicon):** `Tutorly-<version>-mac-arm64.dmg` — after copying to Applications, run the `xattr` line above.
- **Windows:** `Tutorly-<version>-win-x64.exe` — SmartScreen may warn; click **More info → Run anyway**.
- **Linux:** `Tutorly-<version>-linux-x86_64.AppImage`

## Connect a model

Tutorly needs Claude (or a local model) to write lessons. Open **Settings** and pick one:

- **Claude Code** — uses your existing Claude Code sign-in, no API key needed.
- **Anthropic API** — paste an API key (or use `ANTHROPIC_API_KEY` from your environment).
- **Local model** — any OpenAI-compatible server (Ollama, LM Studio, llama.cpp, …); models are read straight from the server.

## Development

```sh
npm install
npm run dev      # Vite dev server + Electron with hot reload
npm run build    # production renderer build
npm run pack     # build installers locally (no publish)
```

## Credits

Built on the [`/teach` skill](https://github.com/mattpocock/skills) by Matt Pocock.
