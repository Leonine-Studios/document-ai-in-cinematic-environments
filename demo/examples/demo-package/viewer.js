/* DAICE-Chain Viewer — display-only. Loads, validates, and renders a package;
 * never edits, re-exports, or converts it. See docs/planning/03-viewer.md
 * and spec/glossary.md ("Viewer" vs. "Editor") for the scope this enforces.
 *
 * It also only ever renders the one package it ships inside — see the
 * "Load strategies" comment below — never a general "open any DAICE-Chain
 * package" tool.
 *
 * Every asset with no incoming reference (nothing else in the package
 * references it) is a root row; each asset's own references are nested
 * beneath it as collapsible child rows, so this single table doubles as
 * the lineage view too (see spec/conformance.md §4). A shared asset
 * (referenced by more than one parent) legitimately appears once per
 * parent, exactly as it would in a lineage tree.
 *
 * Validation, lineage resolution, and table flattening are plain JS below
 * (no Zod, no @leoninestudios/daice-chain-core dependency) so this stays a single small file
 * with no build step to copy/paste. @leoninestudios/daice-chain-core (packages/core/src/) is
 * still the canonical, tested implementation used by the editor and
 * this repo's own tests — keep this section in sync with schema.ts and
 * validate.ts by hand whenever the spec changes.
 */
(function () {
  "use strict";

  // Version of this generic viewer template, not of the DAICE-Chain spec
  // (daiceVersion) or of any particular package. Bump this when you change
  // index.html/viewer.css/viewer.js as a set. Shown in the UI (see the
  // .js-viewer-version tags in index.html) so anyone who copy/pasted this
  // template into their own pipeline can tell which revision they're on.
  var VIEWER_VERSION = "0.1.0";

  // --- Validation ----------------------------------------------------
  // Plain-JS mirror of DAICE-Chain v0.1.0 (see spec/README.md and
  // spec/schema/daice.schema.json). Never throws; always returns
  // { valid, errors } or { valid: true, errors: [], package }, with
  // structured, path-scoped errors like "assets[2].prompt".

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  var TIMECODE_PATTERN = /^\d{2}:\d{2}:\d{2}:\d{2}$/;

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function joinPath(base, segment) {
    return base ? base + "." + segment : segment;
  }

  function fieldName(path) {
    var segments = path.split(".");
    return segments[segments.length - 1];
  }

  function rejectUnknownKeys(value, path, allowed, errors) {
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) === -1) {
        errors.push({ path: joinPath(path, key), message: 'unrecognized property "' + key + '"' });
      }
    });
  }

  function requireNonEmptyString(value, path, errors) {
    if (typeof value !== "string" || value.length === 0) {
      errors.push({ path: path, message: fieldName(path) + " is required" });
    }
  }

  function requireEmail(value, path, errors) {
    if (typeof value !== "string" || !EMAIL_PATTERN.test(value)) {
      errors.push({ path: path, message: fieldName(path) + " must be a valid email address" });
    }
  }

  function requireDateTime(value, path, errors) {
    if (typeof value !== "string" || !DATETIME_PATTERN.test(value)) {
      errors.push({ path: path, message: fieldName(path) + " must be an ISO 8601 date-time with a timezone offset" });
    }
  }

  function requireTimecode(value, path, errors) {
    if (typeof value !== "string" || !TIMECODE_PATTERN.test(value)) {
      errors.push({ path: path, message: fieldName(path) + " must match HH:MM:SS:FF" });
    }
  }

  function validateContact(contact, path, errors) {
    if (!isPlainObject(contact)) {
      errors.push({ path: path, message: fieldName(path) + " must be an object" });
      return;
    }
    rejectUnknownKeys(contact, path, ["name", "email"], errors);
    requireNonEmptyString(contact.name, joinPath(path, "name"), errors);
    if (contact.email !== undefined) requireEmail(contact.email, joinPath(path, "email"), errors);
  }

  function validateReference(ref, path, errors) {
    if (!isPlainObject(ref)) {
      errors.push({ path: path, message: "reference must be an object" });
      return;
    }
    rejectUnknownKeys(ref, path, ["assetId", "label"], errors);
    requireNonEmptyString(ref.assetId, joinPath(path, "assetId"), errors);
    if (ref.label !== undefined && typeof ref.label !== "string") {
      errors.push({ path: joinPath(path, "label"), message: "label must be a string" });
    }
  }

  function validatePackageMetadata(pkg, path, errors) {
    if (!isPlainObject(pkg)) {
      errors.push({ path: path, message: "package must be an object" });
      return;
    }
    rejectUnknownKeys(pkg, path, ["id", "packageName", "description", "createdAt", "createdBy", "metadata"], errors);
    requireNonEmptyString(pkg.id, joinPath(path, "id"), errors);
    requireNonEmptyString(pkg.packageName, joinPath(path, "packageName"), errors);
    if (pkg.description !== undefined && typeof pkg.description !== "string") {
      errors.push({ path: joinPath(path, "description"), message: "description must be a string" });
    }
    requireDateTime(pkg.createdAt, joinPath(path, "createdAt"), errors);
    validateContact(pkg.createdBy, joinPath(path, "createdBy"), errors);
    if (pkg.metadata !== undefined && !isPlainObject(pkg.metadata)) {
      errors.push({ path: joinPath(path, "metadata"), message: "metadata must be an object" });
    }
  }

  function validateAsset(asset, path, errors) {
    if (!isPlainObject(asset)) {
      errors.push({ path: path, message: "asset must be an object" });
      return;
    }
    var allowed = [
      "id", "aiGenerated", "provider", "model", "prompt", "generatedBy", "generatedAt", "seed",
      "mediaPath", "mediaMimeType", "references", "timecodeIn", "timecodeOut", "metadata",
    ];
    rejectUnknownKeys(asset, path, allowed, errors);

    requireNonEmptyString(asset.id, joinPath(path, "id"), errors);
    if (typeof asset.aiGenerated !== "boolean") {
      errors.push({ path: joinPath(path, "aiGenerated"), message: "aiGenerated must be a boolean" });
    }
    if (asset.provider !== undefined) requireNonEmptyString(asset.provider, joinPath(path, "provider"), errors);
    if (asset.model !== undefined) requireNonEmptyString(asset.model, joinPath(path, "model"), errors);
    if (asset.prompt !== undefined && typeof asset.prompt !== "string") {
      errors.push({ path: joinPath(path, "prompt"), message: "prompt must be a string" });
    }
    if (asset.generatedBy !== undefined) validateContact(asset.generatedBy, joinPath(path, "generatedBy"), errors);
    if (asset.generatedAt !== undefined) requireDateTime(asset.generatedAt, joinPath(path, "generatedAt"), errors);
    if (asset.seed !== undefined && (typeof asset.seed !== "number" || !Number.isInteger(asset.seed))) {
      errors.push({ path: joinPath(path, "seed"), message: "seed must be an integer" });
    }
    if (asset.mediaPath !== undefined) {
      if (typeof asset.mediaPath !== "string" || !/^assets\//.test(asset.mediaPath)) {
        errors.push({ path: joinPath(path, "mediaPath"), message: 'mediaPath must start with "assets/"' });
      }
    }
    if (asset.mediaMimeType !== undefined) requireNonEmptyString(asset.mediaMimeType, joinPath(path, "mediaMimeType"), errors);

    if (!Array.isArray(asset.references)) {
      errors.push({ path: joinPath(path, "references"), message: "references must be an array" });
    } else {
      asset.references.forEach(function (ref, index) {
        validateReference(ref, joinPath(path, "references[" + index + "]"), errors);
      });
    }

    if (asset.timecodeIn !== undefined) requireTimecode(asset.timecodeIn, joinPath(path, "timecodeIn"), errors);
    if (asset.timecodeOut !== undefined) requireTimecode(asset.timecodeOut, joinPath(path, "timecodeOut"), errors);
    var hasIn = asset.timecodeIn !== undefined;
    var hasOut = asset.timecodeOut !== undefined;
    if (hasIn !== hasOut) {
      var missing = hasIn ? "timecodeOut" : "timecodeIn";
      errors.push({ path: joinPath(path, missing), message: missing + " is required when the other timecode is present" });
    }

    if (asset.metadata !== undefined && !isPlainObject(asset.metadata)) {
      errors.push({ path: joinPath(path, "metadata"), message: "metadata must be an object" });
    }

    if (asset.aiGenerated === true) {
      if (!asset.provider) errors.push({ path: joinPath(path, "provider"), message: "provider is required when aiGenerated is true" });
      if (!asset.model) errors.push({ path: joinPath(path, "model"), message: "model is required when aiGenerated is true" });
      if (!asset.generatedBy) errors.push({ path: joinPath(path, "generatedBy"), message: "generatedBy is required when aiGenerated is true" });
      if (!asset.generatedAt) errors.push({ path: joinPath(path, "generatedAt"), message: "generatedAt is required when aiGenerated is true" });
    }
  }

  // Referential integrity: unique ids, resolvable references, no reference
  // cycles. Ported from packages/core/src/validate.ts — keep in sync.
  // Only called once shape validation above has already passed.
  function checkReferentialIntegrity(assets) {
    var errors = [];
    var idCounts = new Map();
    assets.forEach(function (asset) {
      idCounts.set(asset.id, (idCounts.get(asset.id) || 0) + 1);
    });
    var idToIndex = new Map();
    assets.forEach(function (asset, index) {
      if (!idToIndex.has(asset.id)) idToIndex.set(asset.id, index);
    });

    assets.forEach(function (asset, assetIndex) {
      if ((idCounts.get(asset.id) || 0) > 1) {
        errors.push({
          path: "assets[" + assetIndex + "].id",
          message: 'duplicate asset id "' + asset.id + '" — asset ids must be unique within a package',
        });
      }
      asset.references.forEach(function (ref, refIndex) {
        if (!idToIndex.has(ref.assetId)) {
          errors.push({
            path: "assets[" + assetIndex + "].references[" + refIndex + "].assetId",
            message: 'references[' + refIndex + '].assetId "' + ref.assetId + '" does not match any asset id in this package',
          });
        }
      });
    });

    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = new Map(assets.map(function (a) { return [a.id, WHITE]; }));
    var cyclesReported = new Set();

    function visit(assetId, path) {
      color.set(assetId, GRAY);
      var index = idToIndex.get(assetId);
      var asset = index !== undefined ? assets[index] : undefined;
      if (asset) {
        asset.references.forEach(function (ref) {
          if (!idToIndex.has(ref.assetId)) return; // dangling, already reported
          var nextColor = color.get(ref.assetId);
          if (nextColor === GRAY) {
            var cycleKey = path.concat([assetId, ref.assetId]).slice().sort().join(">");
            if (!cyclesReported.has(cycleKey)) {
              cyclesReported.add(cycleKey);
              var assetIdx = idToIndex.get(assetId);
              errors.push({
                path: "assets[" + assetIdx + "]",
                message: "reference cycle detected: " + path.concat([assetId, ref.assetId]).join(" -> "),
              });
            }
          } else if (nextColor === WHITE) {
            visit(ref.assetId, path.concat([assetId]));
          }
        });
      }
      color.set(assetId, BLACK);
    }

    assets.forEach(function (asset) {
      if (color.get(asset.id) === WHITE) visit(asset.id, []);
    });

    return errors;
  }

  function validatePackage(input) {
    if (!isPlainObject(input)) {
      return { valid: false, errors: [{ path: "(root)", message: "A DAICE-Chain package must be a JSON object." }] };
    }

    var errors = [];
    rejectUnknownKeys(input, "", ["daiceVersion", "package", "assets"], errors);

    if (input.daiceVersion !== "0.1.0") {
      errors.push({
        path: "daiceVersion",
        message: "unrecognized daiceVersion: " + JSON.stringify(input.daiceVersion) + '. This implementation only supports "0.1.0".',
      });
    }

    validatePackageMetadata(input.package, "package", errors);

    var assets = Array.isArray(input.assets) ? input.assets : null;
    if (!assets) {
      errors.push({ path: "assets", message: "assets must be an array" });
    } else {
      assets.forEach(function (asset, index) {
        validateAsset(asset, "assets[" + index + "]", errors);
      });
    }

    if (errors.length > 0) {
      return { valid: false, errors: errors };
    }

    var referentialErrors = checkReferentialIntegrity(assets);
    if (referentialErrors.length > 0) {
      return { valid: false, errors: referentialErrors };
    }

    return { valid: true, errors: [], package: input };
  }

  // --- Lineage + table flattening -------------------------------------
  // Ported from packages/core/src/lineage.ts and flatten.ts — keep in
  // sync. Only ever called on a package that already passed
  // validatePackage above.

  function resolveLineage(assetId, pkg, seen) {
    seen = seen || new Set();
    var asset = pkg.assets.find(function (a) { return a.id === assetId; });
    if (!asset) {
      throw new Error('resolveLineage: no asset with id "' + assetId + '" in this package');
    }
    if (seen.has(assetId)) {
      return { asset: asset, children: [] };
    }
    var nextSeen = new Set(seen);
    nextSeen.add(assetId);
    var children = asset.references.map(function (ref) {
      var childAsset = pkg.assets.find(function (a) { return a.id === ref.assetId; });
      if (!childAsset) {
        var placeholder = { id: ref.assetId, aiGenerated: false, references: [] };
        return { asset: placeholder, children: [] };
      }
      return resolveLineage(ref.assetId, pkg, nextSeen);
    });
    return { asset: asset, children: children };
  }

  function flattenForTable(pkg) {
    var PROMPT_EXCERPT_LENGTH = 80;
    return pkg.assets.map(function (asset) {
      var prompt = asset.prompt || "";
      return {
        id: asset.id,
        aiGenerated: asset.aiGenerated,
        provider: asset.provider || "",
        model: asset.model || "",
        promptExcerpt: prompt.length > PROMPT_EXCERPT_LENGTH ? prompt.slice(0, PROMPT_EXCERPT_LENGTH) + "\u2026" : prompt,
        generatedByEmail: (asset.generatedBy && asset.generatedBy.email) || "",
        referenceCount: asset.references.length,
      };
    });
  }

  // --- Media integrity (viewer-only convenience, not a spec requirement) --
  // Every mediaPath is a writer obligation (spec/README.md §3, "MUST
  // resolve to a real file") — a package that fails this check is still
  // valid DAICE-Chain JSON, so this never blocks rendering. It only surfaces a
  // non-blocking warning banner plus a per-thumbnail indicator, in
  // whichever load mode can actually see the package's files:
  //   - directory picker: check against the files the user selected
  //   - served over HTTP(S): HEAD-request each distinct mediaPath
  //   - inline data / daice.json-only picker: no files available, skipped

  var mediaCheckMode = "none"; // "none" | "directory" | "http"
  var mediaContext = null; // { byRelPath, byBasename, baseDir } for "directory" mode

  function mediaPathAvailable(mediaPath) {
    var fullPath = mediaContext.baseDir + mediaPath;
    return mediaContext.byRelPath.has(fullPath) || mediaContext.byBasename.has(mediaPath.split("/").pop());
  }

  function runMediaIntegrityCheck(pkg) {
    if (mediaCheckMode === "directory") {
      var missing = [];
      pkg.assets.forEach(function (asset, index) {
        if (asset.mediaPath && !mediaPathAvailable(asset.mediaPath)) {
          missing.push({ path: "assets[" + index + "].mediaPath", message: "file not found: " + asset.mediaPath, assetId: asset.id });
        }
      });
      applyMediaWarnings(missing);
      return;
    }

    if (mediaCheckMode === "http") {
      var checks = pkg.assets.map(function (asset, index) {
        if (!asset.mediaPath) return Promise.resolve(null);
        return fetch(asset.mediaPath, { method: "HEAD", cache: "no-store" })
          .then(function (res) {
            return res.ok ? null : { path: "assets[" + index + "].mediaPath", message: "file not found: " + asset.mediaPath, assetId: asset.id };
          })
          .catch(function () {
            return { path: "assets[" + index + "].mediaPath", message: "file not found: " + asset.mediaPath, assetId: asset.id };
          });
      });
      Promise.all(checks).then(function (results) {
        applyMediaWarnings(results.filter(Boolean));
      });
      return;
    }

    applyMediaWarnings([]);
  }

  // Accumulates across both sources of missing-media evidence: the
  // upfront directory/HTTP checks above, and the onerror fallback below
  // (for "none" mode, where no upfront check is possible at all — see
  // markThumbMissing). Reset per-package so a freshly loaded package
  // starts from a clean slate.
  var currentMissingWarnings = [];

  function resetMediaWarnings() {
    currentMissingWarnings = [];
    renderMediaWarnings(currentMissingWarnings);
  }

  function addMissingWarning(item) {
    if (currentMissingWarnings.some(function (m) { return m.assetId === item.assetId; })) return;
    currentMissingWarnings.push(item);
    renderMediaWarnings(currentMissingWarnings);
  }

  function applyMediaWarnings(missing) {
    missing.forEach(addMissingWarning);
    var missingIds = new Set(missing.map(function (m) { return m.assetId; }));
    currentRows.forEach(function (row) {
      if (!missingIds.has(row.asset.id) || !row.tr) return;
      var thumb = row.tr.querySelector('[data-col="thumb"] .thumb');
      if (thumb) {
        thumb.innerHTML = ""; // drop any broken <img> already resolved before this check completed
        thumb.classList.remove("thumb--path", "thumb--empty");
        thumb.classList.add("thumb--missing");
        thumb.title = "Media file not found: " + row.asset.mediaPath;
      }
    });
  }

  // Fallback for load modes that can't verify mediaPath ahead of time
  // (inline data, or a plain daice.json-only pick — mediaCheckMode
  // "none", see the comment above). There, resolveMedia optimistically
  // returns every mediaPath as-is and we just try to load it; if the
  // browser can't, that failed <img> load is itself the only evidence
  // we'll ever get that the file is missing, so fold it into the same
  // banner + thumbnail treatment as the proactive checks above.
  function markThumbMissing(asset, thumbEl, imgEl) {
    imgEl.remove();
    thumbEl.classList.remove("thumb--path", "thumb--empty");
    thumbEl.classList.add("thumb--missing");
    thumbEl.title = "Media file not found: " + asset.mediaPath;
    var assetIndex = currentPackage.assets.indexOf(asset);
    addMissingWarning({
      path: "assets[" + assetIndex + "].mediaPath",
      message: "file not found: " + asset.mediaPath,
      assetId: asset.id,
    });
  }

  function renderMediaWarnings(missing) {
    var container = document.getElementById("package-warnings");
    var list = document.getElementById("package-warnings-list");
    list.innerHTML = "";
    if (missing.length === 0) {
      container.hidden = true;
      return;
    }
    missing.forEach(function (item) {
      var li = document.createElement("li");
      var code = document.createElement("code");
      code.textContent = item.path;
      li.appendChild(code);
      li.appendChild(document.createTextNode(" " + item.message));
      list.appendChild(li);
    });
    container.hidden = false;
  }

  // --- Screens / chrome -------------------------------------------------

  var screens = {
    picker: document.getElementById("picker-screen"),
    error: document.getElementById("error-screen"),
    viewer: document.getElementById("viewer-screen"),
  };

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = key !== name;
    });
  }

  function renderViewerVersion() {
    var tags = document.querySelectorAll(".js-viewer-version");
    for (var i = 0; i < tags.length; i++) {
      tags[i].textContent = "v" + VIEWER_VERSION;
    }
  }

  // Resolves an asset's mediaPath to something usable as an <img src>, or
  // null if it can't be resolved in the current load mode. Reassigned by
  // whichever load path succeeds.
  var resolveMedia = function () {
    return null;
  };

  var currentPackage = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderErrors(errors) {
    var list = document.getElementById("error-list");
    list.innerHTML = "";
    errors.forEach(function (err) {
      var li = document.createElement("li");
      var code = document.createElement("code");
      code.textContent = err.path;
      li.appendChild(code);
      li.appendChild(document.createTextNode(err.message));
      list.appendChild(li);
    });
    showScreen("error");
  }

  function loadPackage(data) {
    var result = validatePackage(data);
    if (!result.valid) {
      renderErrors(result.errors);
      return;
    }
    currentPackage = result.package;
    resetMediaWarnings();
    renderHeader(currentPackage.package);
    renderTable(currentPackage);
    runMediaIntegrityCheck(currentPackage);
    showScreen("viewer");
  }

  function renderHeader(pkg) {
    document.getElementById("pkg-title").textContent = pkg.packageName;
    document.getElementById("pkg-id").textContent = pkg.id;
    var descriptionEl = document.getElementById("pkg-description");
    descriptionEl.textContent = pkg.description || "";
    descriptionEl.hidden = !pkg.description;
    document.getElementById("pkg-createdby").textContent =
      pkg.createdBy.name + (pkg.createdBy.email ? " (" + pkg.createdBy.email + ")" : "");
    document.getElementById("pkg-createdat").textContent = formatDate(pkg.createdAt);
    document.getElementById("pkg-assetcount").textContent = String(currentPackage.assets.length);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // --- Column definitions ------------------------------------------------
  // "asset" and "kind" are core identity columns and always shown. Every
  // other column can be hidden/shown from the "Columns" menu; generatedAt
  // and mimeType default to hidden to keep the table lean at a glance.

  var COLUMNS = [
    { key: "asset", label: "Asset", toggleable: false, defaultVisible: true },
    { key: "thumb", label: "Thumbnail", toggleable: true, defaultVisible: true },
    { key: "kind", label: "Kind", toggleable: false, defaultVisible: true },
    { key: "provider", label: "Provider", toggleable: true, defaultVisible: true },
    { key: "model", label: "Model", toggleable: true, defaultVisible: true },
    { key: "seed", label: "Seed", toggleable: true, defaultVisible: false },
    { key: "prompt", label: "Prompt", toggleable: true, defaultVisible: true },
    { key: "generatedBy", label: "Generated by", toggleable: true, defaultVisible: true },
    { key: "generatedAt", label: "Generated at", toggleable: true, defaultVisible: false },
    { key: "references", label: "References", toggleable: true, defaultVisible: true },
    { key: "tcIn", label: "TC In", toggleable: true, defaultVisible: false },
    { key: "tcOut", label: "TC Out", toggleable: true, defaultVisible: false },
    { key: "mimeType", label: "Mime type", toggleable: true, defaultVisible: false },
  ];

  function setupColumns() {
    var table = document.getElementById("assets-table");
    var headRow = document.getElementById("table-head-row");
    var panel = document.getElementById("columns-menu-panel");
    headRow.innerHTML = "";
    panel.innerHTML = "";

    COLUMNS.forEach(function (col) {
      var th = document.createElement("th");
      th.scope = "col";
      th.setAttribute("data-col", col.key);
      th.textContent = col.label;
      headRow.appendChild(th);
      table.classList.toggle("hide-col-" + col.key, !col.defaultVisible);

      if (!col.toggleable) return;

      var label = document.createElement("label");
      label.className = "columns-menu__item";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = col.defaultVisible;
      input.setAttribute("data-col-toggle", col.key);
      input.addEventListener("change", function () {
        table.classList.toggle("hide-col-" + col.key, !input.checked);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + col.label));
      panel.appendChild(label);
    });
  }

  function cell(colKey, innerHtml) {
    var td = document.createElement("td");
    td.setAttribute("data-col", colKey);
    if (innerHtml !== undefined) td.innerHTML = innerHtml;
    return td;
  }

  // --- Hierarchical rows ---------------------------------------------
  // Roots are assets nothing else in the package references. Each root's
  // own reference chain (via resolveLineage) is flattened into a
  // depth-ordered row list; a row is visible only while every ancestor
  // along its path is both visible and expanded. Everything starts
  // collapsed except the roots themselves.
  //
  // Each row also carries `guideFlags` (whether each ancestor level above
  // its own connector should draw a continuing trunk line) and `isLast`
  // (whether it's the last child among its own siblings, which decides
  // its own connector's shape — "├" vs "└") — see renderRow's tree guides.

  function computeRootIds(pkg) {
    var referenced = new Set();
    pkg.assets.forEach(function (asset) {
      asset.references.forEach(function (ref) {
        referenced.add(ref.assetId);
      });
    });
    return pkg.assets.filter(function (asset) {
      return !referenced.has(asset.id);
    });
  }

  function buildRows(pkg) {
    var rowDataById = new Map(flattenForTable(pkg).map(function (row) {
      return [row.id, row];
    }));
    var rows = [];

    function visit(node, depth, parentKey, pathPrefix, guideFlags, isLast) {
      var key = pathPrefix ? pathPrefix + ">" + node.asset.id : node.asset.id;
      rows.push({
        key: key,
        parentKey: parentKey,
        depth: depth,
        asset: node.asset,
        flat: rowDataById.get(node.asset.id),
        hasChildren: node.children.length > 0,
        guideFlags: guideFlags,
        isLast: isLast,
      });
      node.children.forEach(function (child, index) {
        var childIsLast = index === node.children.length - 1;
        var childGuideFlags = depth === 0 ? [] : guideFlags.concat([!isLast]);
        visit(child, depth + 1, key, key, childGuideFlags, childIsLast);
      });
    }

    var roots = computeRootIds(pkg);
    roots.forEach(function (rootAsset, index) {
      visit(resolveLineage(rootAsset.id, pkg), 0, null, "", [], index === roots.length - 1);
    });

    return rows;
  }

  var expandedKeys = new Set();
  var currentRows = [];

  function renderTable(pkg) {
    setupColumns();
    expandedKeys.clear();

    currentRows = buildRows(pkg);
    var tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    currentRows.forEach(function (row) {
      row.tr = renderRow(row);
      tbody.appendChild(row.tr);
    });

    applyVisibility(currentRows);
  }

  function applyVisibility(rows) {
    var visible = new Set();
    rows.forEach(function (row) {
      var isVisible = row.depth === 0 || (visible.has(row.parentKey) && expandedKeys.has(row.parentKey));
      if (isVisible) visible.add(row.key);
      row.tr.hidden = !isVisible;
      if (row.toggleBtn) {
        var isOpen = expandedKeys.has(row.key);
        row.toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        row.toggleBtn.textContent = isOpen ? "\u25be" : "\u25b8";
      }
    });
    updateExpandCollapseAllButton();
  }

  // --- Expand all / collapse all -------------------------------------
  // A single toggle button (next to the Columns menu) that expands every
  // row with children, or collapses back to just the roots. Its own
  // label always reflects the current state, kept in sync from
  // applyVisibility so it also updates after any individual row toggle.

  function expandableKeys() {
    return currentRows.filter(function (row) { return row.hasChildren; }).map(function (row) { return row.key; });
  }

  function setAllExpanded(expand) {
    if (expand) {
      expandableKeys().forEach(function (key) { expandedKeys.add(key); });
    } else {
      expandedKeys.clear();
    }
    applyVisibility(currentRows);
  }

  function updateExpandCollapseAllButton() {
    var btn = document.getElementById("expand-collapse-all-btn");
    if (!btn) return;
    var keys = expandableKeys();
    if (keys.length === 0) {
      btn.disabled = true;
      btn.textContent = "Expand all";
      return;
    }
    btn.disabled = false;
    var allExpanded = keys.every(function (key) { return expandedKeys.has(key); });
    btn.textContent = allExpanded ? "Collapse all" : "Expand all";
  }

  // Builds the per-row connector guides shown to the left of the
  // expand/collapse toggle: a continuing vertical line for every ancestor
  // level that still has more siblings below, then this row's own elbow
  // ("├" if it has following siblings, "└" if it's the last one).
  function buildTreeGuides(row) {
    if (row.depth === 0) return null;
    var wrap = document.createElement("span");
    wrap.className = "tree-guides";
    wrap.setAttribute("aria-hidden", "true");
    row.guideFlags.forEach(function (continues) {
      var guide = document.createElement("span");
      guide.className = "tree-guide" + (continues ? " tree-guide--line" : "");
      wrap.appendChild(guide);
    });
    var elbow = document.createElement("span");
    elbow.className = "tree-guide tree-guide--elbow" + (row.isLast ? " tree-guide--elbow-last" : "");
    wrap.appendChild(elbow);
    return wrap;
  }

  function renderRow(row) {
    var asset = row.asset;
    var flat = row.flat;
    var tr = document.createElement("tr");
    tr.className = asset.aiGenerated ? "row-ai" : "row-nonai";
    tr.setAttribute("data-depth", String(row.depth));

    // Asset cell: tree guides + expand/collapse toggle + id. The flex
    // layout lives on this inner wrapper, not the <td> itself — see the
    // comment above td.asset-cell in viewer.css for why.
    var assetTd = cell("asset");
    assetTd.className = "asset-cell";
    var assetCellInner = document.createElement("span");
    assetCellInner.className = "asset-cell-inner";
    assetTd.appendChild(assetCellInner);

    var guides = buildTreeGuides(row);
    if (guides) assetCellInner.appendChild(guides);

    var assetInner = document.createElement("span");
    assetInner.className = "tree-cell";

    if (row.hasChildren) {
      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "tree-toggle";
      toggleBtn.setAttribute("aria-label", "Toggle references");
      toggleBtn.addEventListener("click", function () {
        if (expandedKeys.has(row.key)) {
          expandedKeys.delete(row.key);
        } else {
          expandedKeys.add(row.key);
        }
        applyVisibility(currentRows);
      });
      assetInner.appendChild(toggleBtn);
      row.toggleBtn = toggleBtn;
    } else {
      var spacer = document.createElement("span");
      spacer.className = "tree-toggle tree-toggle--spacer";
      assetInner.appendChild(spacer);
    }

    var idSpan = document.createElement("span");
    idSpan.className = "asset-id";
    idSpan.textContent = asset.id;
    assetInner.appendChild(idSpan);
    assetCellInner.appendChild(assetInner);
    tr.appendChild(assetTd);

    // Thumbnail cell.
    var thumbTd = cell("thumb");
    thumbTd.appendChild(renderThumb(asset));
    tr.appendChild(thumbTd);

    tr.appendChild(
      cell(
        "kind",
        asset.aiGenerated
          ? '<span class="badge badge--ai">AI generated</span>'
          : '<span class="badge badge--nonai">Non-AI source</span>'
      )
    );
    tr.appendChild(cell("provider", escapeHtml(flat.provider || "\u2014")));
    tr.appendChild(cell("model", escapeHtml(flat.model || "\u2014")));
    tr.appendChild(cell("seed", asset.seed !== undefined ? String(asset.seed) : "\u2014"));

    var promptTd = cell("prompt", escapeHtml(flat.promptExcerpt || "\u2014"));
    promptTd.className = "prompt-cell";
    promptTd.title = flat.promptExcerpt || "";
    tr.appendChild(promptTd);

    tr.appendChild(cell("generatedBy", escapeHtml(flat.generatedByEmail || "\u2014")));
    tr.appendChild(cell("generatedAt", escapeHtml(asset.generatedAt ? formatDate(asset.generatedAt) : "\u2014")));
    tr.appendChild(cell("references", String(flat.referenceCount)));

    tr.appendChild(cell("tcIn", escapeHtml(asset.timecodeIn || "\u2014")));
    tr.appendChild(cell("tcOut", escapeHtml(asset.timecodeOut || "\u2014")));

    tr.appendChild(cell("mimeType", escapeHtml(asset.mediaMimeType || "\u2014")));

    return tr;
  }

  function renderThumb(asset) {
    var thumb = document.createElement("div");
    thumb.className = "thumb";
    var mediaPath = asset.mediaPath;
    var src = mediaPath ? resolveMedia(mediaPath) : null;
    if (src) {
      var img = document.createElement("img");
      img.src = src;
      img.alt = asset.id;
      img.addEventListener("error", function () {
        markThumbMissing(asset, thumb, img);
      });
      thumb.appendChild(img);
    } else if (mediaPath) {
      thumb.classList.add("thumb--path");
    } else {
      thumb.classList.add("thumb--empty");
    }
    return thumb;
  }

  // --- Load strategies -------------------------------------------------
  // This viewer only ever renders the single package it ships inside —
  // never a general "open any DAICE-Chain package" tool. Strategies 1 and 2 load
  // automatically, with no user interaction. Strategy 3 is a narrow
  // exception for file://, where browsers block a page from reading local
  // files on its own; it asks the user to (re-)select this same package's
  // own files, not to browse to an unrelated one. See spec/README.md §3
  // and spec/conformance.md §4.
  //
  // 1. Inline #daice-chain-data script block (what a future packaging tool emits
  //    for a zero-interaction package).
  // 2. fetch('./daice.json') when served over http(s).
  // 3. File-picker fallback for this package only (required for file://
  //    since fetch of local files is blocked by browsers there).

  function tryInlineData() {
    var el = document.getElementById("daice-chain-data");
    if (!el || !el.textContent || !el.textContent.trim()) return null;
    try {
      var data = JSON.parse(el.textContent);
      resolveMedia = function (path) {
        return path;
      };
      mediaCheckMode = "none"; // no filesystem access to verify media against
      return data;
    } catch (err) {
      return null;
    }
  }

  function tryFetch() {
    if (window.location.protocol === "file:") return Promise.resolve(null);
    return fetch("./daice.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data) {
          resolveMedia = function (path) {
            return path;
          };
          mediaCheckMode = "http";
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function setupPicker() {
    var dirInput = document.getElementById("picker-input-dir");
    var fileInput = document.getElementById("picker-input-file");

    dirInput.addEventListener("change", function (event) {
      handleDirectorySelection(Array.prototype.slice.call(event.target.files || []));
    });

    fileInput.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      handleSingleFileSelection(file);
    });
  }

  function handleDirectorySelection(files) {
    if (files.length === 0) return;

    var byRelPath = new Map();
    var byBasename = new Map();
    files.forEach(function (file) {
      var rel = file.webkitRelativePath || file.name;
      byRelPath.set(rel, file);
      var basename = rel.split("/").pop();
      if (!byBasename.has(basename)) byBasename.set(basename, file);
    });

    var jsonEntry = null;
    byRelPath.forEach(function (file, rel) {
      if (!jsonEntry && /(^|\/)daice-chain\.json$/i.test(rel)) {
        jsonEntry = { file: file, rel: rel };
      }
    });
    if (!jsonEntry && byBasename.has("daice.json")) {
      var f = byBasename.get("daice.json");
      jsonEntry = { file: f, rel: f.webkitRelativePath || f.name };
    }

    if (!jsonEntry) {
      renderErrors([{ path: "(root)", message: "No daice.json file was found in the selected folder." }]);
      return;
    }

    var baseDir = jsonEntry.rel.replace(/[^/]*$/, "");

    jsonEntry.file
      .text()
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          renderErrors([{ path: "(root)", message: "daice.json is not valid JSON: " + err.message }]);
          return;
        }

        var objectUrlCache = new Map();
        resolveMedia = function (mediaPath) {
          if (objectUrlCache.has(mediaPath)) return objectUrlCache.get(mediaPath);
          var fullPath = baseDir + mediaPath;
          var file = byRelPath.get(fullPath) || byBasename.get(mediaPath.split("/").pop());
          var url = file ? URL.createObjectURL(file) : null;
          objectUrlCache.set(mediaPath, url);
          return url;
        };
        mediaCheckMode = "directory";
        mediaContext = { byRelPath: byRelPath, byBasename: byBasename, baseDir: baseDir };

        loadPackage(data);
      })
      .catch(function (err) {
        renderErrors([{ path: "(root)", message: "Could not read daice.json: " + err.message }]);
      });
  }

  function handleSingleFileSelection(file) {
    file
      .text()
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          renderErrors([{ path: "(root)", message: "This file is not valid JSON: " + err.message }]);
          return;
        }
        resolveMedia = function () {
          return null;
        };
        mediaCheckMode = "none"; // no folder selected, so media presence can't be checked
        loadPackage(data);
      })
      .catch(function (err) {
        renderErrors([{ path: "(root)", message: "Could not read this file: " + err.message }]);
      });
  }

  document.getElementById("error-retry").addEventListener("click", function () {
    showScreen("picker");
  });

  document.getElementById("expand-collapse-all-btn").addEventListener("click", function () {
    var keys = expandableKeys();
    var allExpanded = keys.length > 0 && keys.every(function (key) { return expandedKeys.has(key); });
    setAllExpanded(!allExpanded);
  });

  function init() {
    renderViewerVersion();
    setupPicker();

    var inline = tryInlineData();
    if (inline) {
      loadPackage(inline);
      return;
    }

    tryFetch().then(function (fetched) {
      if (fetched) {
        loadPackage(fetched);
        return;
      }
      showScreen("picker");
    });
  }

  init();
})();
