
# Sahaja Yoga Leela Game — Static Template

This is a minimal template to deploy on Netlify quickly.

## Structure
```
public/
  index.html
  data/excerptdata.csv       # Put your CSV here (headers: Quote,Date)
  assets/
    img/hero.jpg             # Landing image (placeholder)
    smjm/                    # Put Shri Mataji images here
    smjm-manifest.json       # Array of filenames, e.g. ["0001.jpg", "0002.jpg"]
  styles/main.css
  scripts/app.js
```

## Deploy (Netlify)
- Publish directory: `public`

## Next steps
- Load CSV and parse quotes
- Seeded random (name + timestamp)
- Image random via smjm-manifest.json
- Optional: Translation (OpenRouter)
- Export result card to PNG
