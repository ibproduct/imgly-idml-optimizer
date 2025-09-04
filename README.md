# IB ECT IDML Optimizer

An InDesign script that optimizes IDML files for seamless import into IB ECT by converting incompatible file formats while preserving native design elements.

## Overview

This script addresses the key limitations of IB ECT's IDML importer by automatically converting problematic file formats:

- **AI/EPS files** → SVG (preserves vector quality)
- **PSD files** → PNG (raster conversion)
- **PDF files** → PNG (safe conversion)
- **Native InDesign elements** → Preserved as-is (shapes, text, colors, gradients)

## Key Features

### ✅ What It Does
- **Minimal Processing**: Only converts incompatible file formats
- **Preserves Design Fidelity**: Native InDesign shapes remain as editable vectors
- **Automated Workflow**: One-click processing from packaging to IDML export
- **Comprehensive Logging**: Detailed conversion logs for debugging
- **Error Recovery**: Graceful handling of conversion failures

### ❌ What It Doesn't Do (By Design)
- **No "Smart Bake"**: Doesn't rasterize native shapes
- **No Frame Processing**: Lets IB ECT handle native elements
- **No Unnecessary Conversions**: Preserves maximum design quality

## Requirements

- Adobe InDesign (with scripting permissions enabled)
- Adobe Illustrator (for AI/EPS → SVG conversion)
- Adobe Photoshop (for PSD/PDF → PNG conversion)
- InDesign Preferences: Scripting → Allow Scripts to Write Files and Access Network

## Installation

1. Download `idml-for-imgly.jsx`
2. Place in your InDesign Scripts folder:
   - **macOS**: `~/Library/Preferences/Adobe InDesign/Version XX.X/en_US/Scripts/Scripts Panel/`
   - **Windows**: `%APPDATA%\Adobe\InDesign\Version XX.X\en_US\Scripts\Scripts Panel\`
3. Restart InDesign
4. Open your INDD file
5. Run the script from Window → Utilities → Scripts

## Usage

1. **Open your InDesign document**
2. **Run the script** from the Scripts panel
3. **Choose output folder** when prompted
4. **Grant permissions** to Illustrator/Photoshop if prompted
5. **Wait for processing** (typically 30-60 seconds)
6. **Import the generated IDML** into IB ECT

## Output Files

The script creates a timestamped job folder containing:

- `[filename]-ib-ect-optimized.idml` - Optimized IDML file for IB ECT
- `Links/` - Converted SVG/PNG files (embedded in IDML)
- `conversion-log.txt` - Detailed processing log
- `summary.txt` - Human-readable summary
- `manifest.json` - Technical conversion details

## Configuration

Edit the `CFG` object in the script to customize:

```javascript
var CFG = {
  convert: {
    ai: true,   // AI → SVG
    eps: true,  // EPS → SVG
    psd: true,  // PSD → PNG
    pdf: true   // PDF → PNG
  },
  rasterFormat: "PNG",  // PNG or JPG for PSDs
  pdfDPI: 200,          // PNG resolution for PDFs
  waitTimeoutSec: 30    // Conversion timeout
};
```

## Troubleshooting

### Common Issues

**Script gets stuck "Still waiting for conversions"**
- Ensure Illustrator and Photoshop are running
- Grant automation permissions when prompted
- Check conversion-log.txt for specific errors

**"No conversions found" in results**
- Verify AI/EPS/PSD/PDF files are present in your document
- Check if files are embedded (script will unembed them automatically)
- Ensure file extensions are recognized (.ai, .eps, .psd, .pdf)

**Poor IB ECT import quality**
- This optimizer addresses file format issues
- For shape/path issues, consider the upcoming shape-to-SVG enhancement

## Development

This script was developed to solve real-world IB ECT import issues by:

1. **Analyzing IB ECT importer limitations** from documentation and code
2. **Identifying over-processing issues** in existing solutions
3. **Implementing minimal intervention** approach
4. **Preserving maximum design fidelity** while solving compatibility issues

## License

MIT License - Feel free to modify and distribute.

## Contributing

Issues and pull requests welcome! This is an active project addressing real IB ECT integration challenges.