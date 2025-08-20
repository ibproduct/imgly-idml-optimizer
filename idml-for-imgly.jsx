/*
  InDesign → Img.ly one‑click exporter (Optimized for Minimal Processing)
  -------------------------------------------------------------
  What it does (focused approach):
    1) Packages the active INDD to a timestamped job folder
    2) Converts ONLY incompatible file formats in Links/:
         • AI/EPS → SVG (Illustrator via BridgeTalk)
         • PSD → PNG (Photoshop via BridgeTalk)
         • PDF → PNG (Photoshop via BridgeTalk - safer than vector detection)
         • Preserves all native InDesign elements (shapes, text, colors, gradients)
    3) Waits (polls) until conversions complete or time out
    4) Relinks converted files and embeds all assets
    5) Reports: overset text, threaded stories, missing fonts, multi-page warnings
    6) Exports clean IDML ready for seamless Img.ly import

  Key Changes:
    • REMOVED "Smart Bake" - preserves native vector elements
    • REMOVED PSD processing - natively supported by Img.ly
    • FOCUSED on AI/EPS → SVG, PSD/PDF → PNG conversion only
    • Maintains design fidelity by not rasterizing native elements

  Requirements:
    • InDesign + Illustrator + Photoshop installed (for PDF → PNG conversion)
    • InDesign Prefs: Scripting → Allow Scripts to Write Files and Access Network
    • Open the target INDD and run this script from the Scripts panel
*/

// =============================
// Configuration
// =============================
var CFG = {
  // Output root (choose via dialog if null)
  outputRoot: null, // e.g. "~/Desktop/Imgly-Exports"

  // Conversions - Focus on incompatible formats
  convert: {
    ai: true,          // AI → SVG
    eps: true,         // EPS → SVG
    psd: true,         // PSD → PNG
    pdf: true          // PDF → PNG (safer than trying to detect vector vs raster)
  },
  
  // PSD conversion format
  rasterFormat: "PNG",     // PNG or JPG for PSDs
  jpgQuality: 12,          // 1..12 (Photoshop quality)

  // SVG export (Illustrator)
  svg: {
    decimalPrecision: 3,    // typical 2–3
    embedRasterImages: true,
    responsive: false
  },

  // PDF processing
  pdfDPI: 200,              // PNG DPI for PDF rasterization

  // Packaging options
  includeHiddenLayers: true,

  // Timeout for conversions (seconds) - reduced for faster failure detection
  waitTimeoutSec: 30,
  pollIntervalMs: 2000,

  // Skip files by name pattern (regex strings)
  excludePatterns: [/*"^_ignore"*/],

  // IDML filename suffix
  idmlSuffix: "-imgly-optimized"
};

// =============================
// Helpers
// =============================
var logFile = null;
function msg(s){
  $.writeln(s);
  // Also write to log file if available
  if(logFile) {
    try {
      logFile.writeln(s);
    } catch(e) {}
  }
}
function panic(s){ alert("Img.ly Exporter:\n" + s); throw new Error(s); }
function ensureFolder(f){ if(!f.exists) f.create(); }
function basenameNoExt(f){ var n=f.displayName; var i=n.lastIndexOf('.'); return (i>0)? n.substring(0,i):n; }
function extLower(f){ var n=f.displayName; var i=n.lastIndexOf('.'); return (i>0)? n.substring(i+1).toLowerCase():""; }
function join(parent, name){ return File(parent.fsName + "/" + name); }
function nowISO(){
  var d = new Date();
  var year = d.getFullYear();
  var month = String(d.getMonth() + 1).replace(/^(\d)$/, '0$1');
  var day = String(d.getDate()).replace(/^(\d)$/, '0$1');
  var hour = String(d.getHours()).replace(/^(\d)$/, '0$1');
  var min = String(d.getMinutes()).replace(/^(\d)$/, '0$1');
  var sec = String(d.getSeconds()).replace(/^(\d)$/, '0$1');
  return year + '-' + month + '-' + day + 'T' + hour + '-' + min + '-' + sec;
}
function toJSON(obj){ try{ return JSON.stringify(obj, null, 2); }catch(e){ return String(obj); } }

function fileExists(path){ return (new File(path)).exists; }

function collectFilesRecursive(rootFolder){
  var out=[];
  (function walk(folder){
    var items = folder.getFiles();
    for(var i=0;i<items.length;i++){
      var it=items[i];
      if(it instanceof Folder){ walk(it); }
      else if(it instanceof File){ out.push(it); }
    }
  })(rootFolder);
  return out;
}

function pathMapByExt(files, newExt){
  var map={};
  for(var i=0;i<files.length;i++){
    var f=files[i];
    var out=f.fsName.replace(/\.[^.]+$/, '.'+newExt);
    map[f.fsName]=out;
  }
  return map;
}

function anyMatchPatterns(file, patterns){
  var name = file.displayName;
  for(var i=0;i<patterns.length;i++){
    try{ if(new RegExp(patterns[i]).test(name)) return true; }catch(e){}
  }
  return false;
}

// =============================
// Preconditions & folders
// =============================
if(app.documents.length === 0) panic("Open an InDesign document first.");
var doc = app.activeDocument;

if(!CFG.outputRoot){
  var outFolder = Folder.selectDialog("Choose output folder for packaged doc + IDML");
  if(!outFolder) panic("No output folder chosen.");
  CFG.outputRoot = outFolder.fsName;
}
var root = new Folder(CFG.outputRoot); ensureFolder(root);
var jobName = basenameNoExt(doc.fullName) + "_" + nowISO();
var jobFolder = new Folder(root.fsName + "/" + jobName); ensureFolder(jobFolder);

// Create log file for detailed debugging
logFile = new File(jobFolder.fsName + "/conversion-log.txt");
logFile.encoding = "UTF-8";
logFile.open("w");
msg("=== Img.ly Conversion Log Started ===");
msg("Job: " + jobName);
msg("Time: " + new Date().toString());

// =============================
// Step 1: Unembed AI/EPS/PSD/PDF files (so they get copied to Links folder)
// =============================
msg("Unembedding AI/EPS/PSD/PDF files…");
var unembedded = 0;
for(var i=0; i<doc.links.length; i++){
  try{
    var link = doc.links[i];
    var linkPath = link.filePath || "";
    var ext = "";
    if(linkPath){
      var lastDot = linkPath.lastIndexOf('.');
      if(lastDot > 0) ext = linkPath.substring(lastDot+1).toLowerCase();
    }
    
    // Unembed AI, EPS, PSD, PDF files so they get processed
    if((ext === 'ai' || ext === 'eps' || ext === 'psd' || ext === 'pdf') && link.status === LinkStatus.LINK_EMBEDDED){
      link.unembed();
      unembedded++;
    }
  }catch(e){}
}
if(unembedded > 0) msg("Unembedded " + unembedded + " AI/EPS/PSD/PDF files for processing");

// =============================
// Step 2: Package document
// =============================
msg("Packaging document…");
var packagedReport = new File(jobFolder.fsName + "/package-report.txt");
// packageForPrint returns void; side effects create INDD+Links
doc.packageForPrint(
  jobFolder,         // to
  true,              // copy fonts
  true,              // copy linked graphics
  true,              // copy profiles
  true,              // update graphics
  CFG.includeHiddenLayers, // include hidden layers
  false,             // ignore preflight errors
  true,              // create report
  true,              // force save
  false,             // include IDML
  "Packaged for Img.ly export" // version comments
);

var linksFolder = new Folder(jobFolder.fsName + "/Links");
if(!linksFolder.exists) panic("Package failed — no Links folder found.");

// Open packaged INDD
var packagedIndd = (function(){
  var files = jobFolder.getFiles(function(f){ return f instanceof File && /\.indd$/i.test(f.displayName); });
  if(files.length===0) panic("Packaged INDD not found.");
  return files[0];
})();
app.open(packagedIndd);
doc = app.activeDocument; // switch handle to packaged doc

// =============================
// Step 3: Collect links (recursive) + build conversion plan
// =============================
msg("Scanning Links recursively…");
var allFiles = collectFilesRecursive(linksFolder);
var aiFiles=[], epsFiles=[], psdFiles=[], pdfFiles=[], otherFiles=[];
for(var i=0;i<allFiles.length;i++){
  var f=allFiles[i], ext=extLower(f);
  if(anyMatchPatterns(f, CFG.excludePatterns)) continue;
  if(ext==='ai') aiFiles.push(f);
  else if(ext==='eps') epsFiles.push(f);
  else if(ext==='psd') psdFiles.push(f);
  else if(ext==='pdf') pdfFiles.push(f);
  else otherFiles.push(f);
}

var plan = {
  aiToSvg: CFG.convert.ai ? aiFiles.slice(0) : [],
  epsToSvg: CFG.convert.eps ? epsFiles.slice(0) : [],
  psdToPng: CFG.convert.psd ? psdFiles.slice(0) : [],
  pdfToPng: CFG.convert.pdf ? pdfFiles.slice(0) : []
};

var expectedOutputs = {};
function addExpected(map){ for(var k in map){ expectedOutputs[k]=map[k]; }
}
if(plan.aiToSvg.length) addExpected(pathMapByExt(plan.aiToSvg, 'svg'));
if(plan.epsToSvg.length) addExpected(pathMapByExt(plan.epsToSvg, 'svg'));
if(plan.psdToPng.length) addExpected(pathMapByExt(plan.psdToPng, (CFG.rasterFormat.toLowerCase()==='png'?'png':'jpg')));
if(plan.pdfToPng.length) addExpected(pathMapByExt(plan.pdfToPng, 'png'));

// =============================
// Step 4: BridgeTalk conversions (AI/PS)
// =============================
function runIn(target, code){
  var bt=new BridgeTalk(); bt.target=target; bt.body=code; bt.send(30);
}

// Illustrator SVG export script body
function buildIllustratorScript(files){
  if(!files.length) return null;
  var filePaths = "[";
  for(var i=0; i<files.length; i++){
    if(i > 0) filePaths += ",";
    filePaths += '"' + files[i].fsName.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  filePaths += "]";
  
  var js = "(function(){" +
    "var files=" + filePaths + "; " +
    "var dec=" + CFG.svg.decimalPrecision + "; " +
    "var embed=" + (CFG.svg.embedRasterImages?"true":"false") + "; " +
    "for(var i=0;i<files.length;i++){ " +
    "  try{ " +
    "    var f=new File(files[i]); " +
    "    var d=app.open(f); " +
    "    var out=new File(f.fsName.replace(/\\\\.[^.]+$/, '.svg')); " +
    "    var opt=new ExportOptionsSVG(); " +
    "    opt.coordinatePrecision=dec; " +
    "    opt.embedRasterImages=embed; " +
    "    d.exportFile(out, ExportType.SVG, opt); " +
    "    d.close(SaveOptions.DONOTSAVECHANGES); " +
    "  }catch(e){ alert('Illustrator conversion error: ' + e.message); } " +
    "} " +
    "})();";
  return js;
}

// Photoshop raster export script body (PSD → PNG/JPG, PDF → PNG)
function buildPhotoshopScript(psdFiles, pdfFiles){
  if(!psdFiles.length && !pdfFiles.length) return null;
  var fmt = CFG.rasterFormat.toUpperCase();
  var q = CFG.jpgQuality;
  var dpi = CFG.pdfDPI;
  
  var psdPaths = [];
  for(var i=0; i<psdFiles.length; i++){
    psdPaths.push(psdFiles[i].fsName);
  }
  
  var pdfPaths = [];
  for(var j=0; j<pdfFiles.length; j++){
    pdfPaths.push(pdfFiles[j].fsName);
  }
  
  var js = "(function(){" +
    "function savePNG(doc, out){ var o=new PNGSaveOptions(); doc.saveAs(new File(out), o, true); } " +
    "function saveJPG(doc, out, q){ var o=new JPEGSaveOptions(); o.quality=q; doc.saveAs(new File(out), o, true); } " +
    "function openPDF(file, dpi){ var opt=new PDFOpenOptions(); opt.antiAlias=true; opt.resolution=dpi; opt.page=1; return app.open(file, opt); } ";
    
  // Add PSD processing if needed
  if(psdFiles.length > 0) {
    js += "var psd=[";
    for(var i=0; i<psdPaths.length; i++){
      if(i > 0) js += ",";
      js += '"' + psdPaths[i].replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    js += "]; " +
      "for(var i=0;i<psd.length;i++){ " +
      "  try{ " +
      "    var f=new File(psd[i]); " +
      "    app.open(f); " +
      "    var d=app.activeDocument; " +
      "    var out=f.fsName.replace(/\\\\.[^.]+$/, '" + (fmt==='PNG'?'.png':'.jpg') + "'); " +
      "    if('" + fmt + "'==='PNG') savePNG(d,out); else saveJPG(d,out," + q + "); " +
      "    d.close(SaveOptions.DONOTSAVECHANGES); " +
      "  }catch(e){ alert('PSD conversion error: ' + e.message); } " +
      "} ";
  }
  
  // Add PDF processing if needed
  if(pdfFiles.length > 0) {
    js += "var pdf=[";
    for(var j=0; j<pdfPaths.length; j++){
      if(j > 0) js += ",";
      js += '"' + pdfPaths[j].replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    js += "]; " +
      "for(var j=0;j<pdf.length;j++){ " +
      "  try{ " +
      "    var f=new File(pdf[j]); " +
      "    var d=openPDF(f," + dpi + "); " +
      "    var out=f.fsName.replace(/\\\\.[^.]+$/, '.png'); " +
      "    savePNG(d,out); " +
      "    d.close(SaveOptions.DONOTSAVECHANGES); " +
      "  }catch(e){ alert('PDF conversion error: ' + e.message); } " +
      "} ";
  }
  
  js += "})();";
  return js;
}

// Illustrator handles AI and EPS → SVG
var aiList = [].concat(plan.aiToSvg, plan.epsToSvg);
var illyCode = buildIllustratorScript(aiList);
if(illyCode) {
  msg("Sending conversion script to Illustrator...");
  msg("Script: " + illyCode.substring(0, 200) + "...");
  runIn("illustrator", illyCode);
} else {
  msg("No AI/EPS files to convert");
}

// Photoshop handles PSD → PNG and PDF → PNG
var psCode = buildPhotoshopScript(plan.psdToPng, plan.pdfToPng);
if(psCode) {
  msg("Sending conversion script to Photoshop...");
  msg("Script: " + psCode.substring(0, 200) + "...");
  runIn("photoshop", psCode);
} else {
  msg("No PSD/PDF files to convert");
}

// =============================
// Step 5: Wait for conversions to complete (poll files)
// =============================
msg("Waiting for conversions to complete…");
var startTime = (new Date()).getTime();
function allOutputsPresent(){
  var missing = [];
  for(var src in expectedOutputs){
    if(!fileExists(expectedOutputs[src])) {
      missing.push(expectedOutputs[src]);
    }
  }
  if(missing.length > 0) {
    msg("Still waiting for: " + missing.join(", "));
  }
  return missing.length === 0;
}

var totalExpected = 0;
for(var k in expectedOutputs) totalExpected++;
msg("Expecting " + totalExpected + " converted files:");
for(var src in expectedOutputs) {
  msg("  " + src + " → " + expectedOutputs[src]);
}

var timedOut = false;
while(!allOutputsPresent()){
  $.sleep(CFG.pollIntervalMs);
  if(((new Date()).getTime()-startTime)/1000 > CFG.waitTimeoutSec) {
    msg("TIMEOUT: Some conversions did not complete within " + CFG.waitTimeoutSec + " seconds");
    msg("This usually means Illustrator/Photoshop failed to process the files");
    timedOut = true;
    break;
  }
}

// Check what actually got created
msg("Checking conversion results:");
var successfulConversions = {};
for(var src in expectedOutputs) {
  var exists = fileExists(expectedOutputs[src]);
  msg("  " + expectedOutputs[src] + " - " + (exists ? "✓ EXISTS" : "✗ MISSING"));
  if(exists) {
    successfulConversions[src] = expectedOutputs[src];
  }
}

if(timedOut) {
  msg("CONTINUING WITH PARTIAL/NO CONVERSIONS - Using only successful conversions");
  expectedOutputs = successfulConversions;
}

// =============================
// Step 6: Relink by full path mapping + Embed
// =============================
msg("Relinking and embedding…");
var relinked=0, skipped=0;
for(var iLink=0;iLink<doc.links.length;iLink++){
  try{
    var ln = doc.links[iLink];
    var srcPath = ln.filePath || ln.name;
    msg("Checking link: " + srcPath);
    
    // Try exact path match first
    if(expectedOutputs[srcPath] && fileExists(expectedOutputs[srcPath])){
      var tgt = new File(expectedOutputs[srcPath]);
      msg("  Relinking to: " + tgt.fsName);
      ln.relink(tgt); ln.update(); relinked++;
    } else {
      // Try to find conversion by filename match (for cases where paths don't match exactly)
      var linkName = (new File(srcPath)).displayName;
      var found = false;
      for(var origPath in expectedOutputs){
        var origName = (new File(origPath)).displayName;
        if(origName === linkName && fileExists(expectedOutputs[origPath])){
          var tgt = new File(expectedOutputs[origPath]);
          msg("  Relinking by filename match to: " + tgt.fsName);
          ln.relink(tgt); ln.update(); relinked++;
          found = true;
          break;
        }
      }
      if(!found){
        msg("  Skipping (no conversion found for: " + linkName + ")");
        skipped++;
      }
    }
  }catch(e){
    msg("  Error relinking: " + e.message);
    skipped++;
  }
}
msg("Relinked: " + relinked + ", Skipped: " + skipped);

// Embed all
msg("Embedding all links…");
for(var j=doc.links.length-1;j>=0;j--){ try{ doc.links[j].unlink(); }catch(e){} }

// =============================
// =============================
// Step 7: Skip frame processing - Let Img.ly handle native elements
// =============================
// All native InDesign shapes, text, and design elements are preserved
// Only file format conversions are performed above
var handled=0; // No frame processing needed
// =============================
// Step 8: Reports (overset, threaded, fonts, multipage) + manifest
// =============================
// Count converted files manually (Object.keys not available in InDesign JS)
var convertedCount = 0;
for(var k in expectedOutputs){ convertedCount++; }

var report = {
  relinked: relinked,
  skipped: skipped,
  convertedFiles: convertedCount,
  pages: doc.pages.length,
  warnings: [],
  oversetStories: [],
  threadedStories: [],
  fonts: {
    used: [],
    missing: []
  },
  conversions: expectedOutputs
};

if(doc.pages.length>1){ report.warnings.push("Document has "+doc.pages.length+" pages. Img.ly importer supports one page."); }

// Overset + threaded
for(var s=0;s<doc.stories.length;s++){
  var story = doc.stories[s];
  var threadCount = story.textContainers.length;
  if(story.overflows || (function(){ for(var t=0;t<threadCount;t++){ if(story.textContainers[t].overflows) return true; } return false; })()){
    report.oversetStories.push({ id: story.id, length: story.length, threadCount: threadCount });
  }
  if(threadCount>1){ report.threadedStories.push({ id: story.id, threadCount: threadCount }); }
}

// Fonts
try{
  var usedFonts = doc.fonts.everyItem().getElements();
  for(var f=0; f<usedFonts.length; f++){
    var fn = usedFonts[f];
    var rec = { name: fn.fullName, status: String(fn.status) };
    report.fonts.used.push(rec);
    if(fn.status != FontStatus.INSTALLED){ report.fonts.missing.push(rec); }
  }
}catch(e){}

// Write JSON report
var jsonFile = new File(jobFolder.fsName + "/manifest.json");
jsonFile.encoding = "UTF-8"; jsonFile.open("w"); jsonFile.write(toJSON(report)); jsonFile.close();

// Also write a simple human-readable .txt
var txt = new File(jobFolder.fsName + "/summary.txt");
txt.encoding = "UTF-8"; txt.open("w");
txt.write(
  "Relinked: "+report.relinked+"\n" +
  "Converted files: "+report.convertedFiles+" (AI/EPS → SVG, PSD/PDF → PNG)\n" +
  "Native elements preserved: All shapes, text, colors, gradients\n" +
  (report.warnings.length? ("Warnings:\n - "+report.warnings.join("\n - ")+"\n"): "")+
  (report.oversetStories.length? ("Overset stories: "+report.oversetStories.length+"\n"): "")+
  (report.threadedStories.length? ("Threaded stories: "+report.threadedStories.length+"\n"): "")+
  (report.fonts.missing.length? ("Missing fonts: "+report.fonts.missing.length+"\n"): "")
);
txt.close();

// =============================
// Step 9: Export IDML
// =============================
msg("Exporting IDML…");
var outIdml = new File(jobFolder.fsName + "/" + basenameNoExt(packagedIndd) + CFG.idmlSuffix + ".idml");
doc.exportFile(ExportFormat.INDESIGN_MARKUP, outIdml);

alert(
  "Done!\n\nFolder: " + jobFolder.fsName +
  "\nIDML: " + outIdml.fsName +
  "\n\nSee summary.txt and manifest.json for details."
);
