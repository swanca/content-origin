# Origin

Drop an image and find out who signed it, what they claim it is, and whether it has changed since.
Reads C2PA Content Credentials entirely in the browser. Nothing is uploaded.

## Why this one

Every other "is this AI" tool guesses by staring at pixels, and they are wrong often enough to be
dangerous in both directions. This one does not guess. It reads a cryptographic record that cameras
and AI tools now attach to the files they produce, checks the signature, and reports what the signer
actually wrote.

That is a much narrower claim, which is exactly why it can be trusted.

## The honesty rules, which are the product

These are enforced in code and in tests, not just in the copy:

- **No credentials means no conclusion.** Most images have none. The result says so plainly rather
  than implying suspicion.
- **A claim is attributed, never asserted.** Every reading carries a `confidence` of `proven`,
  `claimed` or `unknown`, and the UI always shows it next to the verdict.
- **An unrecognised certificate is not tampering.** These are separate states. Conflating them
  accuses someone of altering a file they did not touch. Found by running a real signed sample
  through the tool, and now covered by tests.

## Running it

```bash
npm install
npm run dev
npm test          # 35 tests
npm run build
npm run deploy
```

## How it is put together

Astro with no adapter and no server output. The C2PA engine is an 8MB WebAssembly module served as a
static asset and loaded lazily, only when someone actually checks a file, so the page itself stays
light.

```
src/lib/provenance.ts   Manifest to verdict. Pure, and where all the honesty rules live.
src/pages/index.astro   The checker
src/pages/what-are-content-credentials.astro
src/pages/privacy.astro
public/c2pa/c2pa.wasm   The reader engine
public/samples/         A signed example, so the tool can be tried without one
```

`provenance.ts` takes a plain object and returns a plain object, so every verdict rule is tested
offline against fixture manifests. The browser only supplies the input.

### Notes for later

- `workerSrc` is deliberately not set. The library rejects any non https worker URL, which breaks
  local development, and the inline blob worker it falls back to works everywhere. Only set it if a
  Content Security Policy forbids blob workers.
- The sample image is a test fixture from the c2pa-rs project. It is signed with a test certificate,
  so it correctly shows as intact but not on the trust list, which makes it a useful demonstration of
  that distinction.

## Cost

No fixed cost. Static files on Cloudflare's free tier. A domain is the only thing to buy.
