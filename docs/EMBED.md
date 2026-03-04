# Embedding TNWW Widget

## Plain HTML
```html
<link rel="stylesheet" href="https://example.org/tnww-widget.css" />
<div id="tnww"></div>
<script src="https://example.org/tnww-widget.js" data-api="https://api.example.org" data-target="tnww" defer></script>
```

## WordPress (Custom HTML block)
```html
<link rel="stylesheet" href="https://harpethconservancy.org/tnww/tnww-widget.css" />
<div id="tnww"></div>
<script src="https://harpethconservancy.org/tnww/tnww-widget.js" data-api="https://harpethconservancy.org/tnww-api" data-target="tnww" defer></script>
```

## Script Attributes
- `data-api`: base API URL (no trailing slash required)
- `data-target`: target div id where widget mounts
