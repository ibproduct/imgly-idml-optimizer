# InDesign Script Optimization Plan

## Problem Analysis
The current script is over-processing InDesign elements, converting native vector shapes into rasterized images, which destroys design fidelity when imported into Img.ly.

## Root Cause
- "Smart Bake" feature is too aggressive
- Script assumes Img.ly can't handle native InDesign elements
- Reality: Img.ly handles native shapes, text, colors, gradients perfectly

## Solution: Minimal Intervention Approach

### What to KEEP:
1. Document packaging
2. Format conversion for incompatible files only
3. Asset embedding
4. IDML export

### What to REMOVE:
1. All "Smart Bake" logic (`needsBake`, `bakeMode`, `fitMode`)
2. Frame processing and analysis
3. Scale/crop detection and correction
4. `cropHandling` configuration section

### What to IMPROVE:
1. Add PDF vector detection
2. Simplify conversion workflow
3. Better error handling

## Implementation Changes

### 1. Configuration Cleanup
Remove `cropHandling` section entirely:
```javascript
// REMOVE THIS ENTIRE SECTION:
cropHandling: {
  mode: "smart",
  bakeDPI: 200,
  diffTolerance: 0.5
}
```

### 2. Remove Baking Functions
Delete these functions entirely:
- `gbWidth()`
- `gbHeight()`
- `needsBake()`
- `fitMode()`
- `bakeMode()`

### 3. Remove Frame Processing
Delete "Step 6: Smart/fit/bake frames" section entirely.

### 4. Add PDF Vector Detection
Enhance PDF processing to detect vector vs raster content.

### 5. Simplify Conversion Logic
Focus only on file format conversion, not content analysis.

## Expected Results
- Preserve all native InDesign design elements
- Maintain vector fidelity for shapes, text, gradients
- Only convert incompatible file formats (.ai, .eps, .psd, .pdf)
- Faster processing with fewer operations
- Better Img.ly import results

## Testing Strategy
1. Test with complex vector designs
2. Verify native shapes remain untouched
3. Confirm only file formats are converted
4. Validate Img.ly import quality