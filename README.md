# Tango Fitter

A precise bike fit from your phone's camera. Film yourself pedalling on a trainer; Tango Fitter tracks your joints on the device, measures the angles a professional fitter uses, and tells you the one change to make next, then checks it with a retest.

- **Use it:** https://zooharris.github.io/fit/ (Safari or Chrome on iPhone, iPad or a laptop with a camera). On iPhone, Share → Add to Home Screen.
- **Your data stays on your device.** Fits live in a `.tango` file you export, keep and open anywhere; a file can hold a whole household.
- Beta 1: side view, saddle height and fore/aft advice. See `docs/TangoFitter.md` for how it works.

## Working on it

`index.html` at the root is the published app, generated from `src/` — don't edit it by hand.

```
node --test test/engine.test.mjs   # engine tests
python3 build.py                   # build dist/index.html (needs Python Playwright for the icon)
cp dist/index.html index.html      # publish: commit and push to main
python3 test/e2e.py                # full browser test (headless Chromium)
```

Pushing to `main` runs the engine tests and deploys to GitHub Pages.

Tango Fitter is a self-fit guide, not medical advice.
