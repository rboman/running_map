(function () {
  var DEFAULT_CONFIG = {
    siteTitle: "running-map",
    map: {
      initialCenter: [50.53, 5.75],
      initialZoom: 10,
      tileLayer: "osm",
      defaultFitPadding: [36, 36]
    },
    tracks: {
      defaultOpacity: 0.85,
      defaultWeight: 5
    },
    sidebar: {
      showDemoRuns: true,
      showGeneratedRuns: true
    },
    photos: {
      enabled: true,
      showPhotoGallery: true,
      showPhotoMarkers: true,
      maxPhotosInPanel: 12,
      maxPhotoMarkers: 20
    },
    selection: {
      selectedColor: "#ffcc00",
      selectedWeight: 8,
      selectedOpacity: 1.0,
      dimOtherRuns: true,
      dimmedOpacity: 0.45
    }
  };

  var TILE_LAYERS = {
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    },
    opentopomap: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
      }
    }
  };

  var config = mergeConfig(DEFAULT_CONFIG, window.RUNNING_MAP_CONFIG || {});
  var map;
  var allRuns = [];
  var runLayers = {};
  var selectedPhotoLayer = null;
  var sidebarSearchText = "";
  var sidebarYearFilter = "";
  var selectedRunId = null;
  var selectedRunPhotosExpanded = false;

  window.addEventListener("load", startApp);

  function startApp() {
    if (!window.L) {
      showStartupError();
      return;
    }

    applySiteTitle();

    allRuns = getConfiguredRuns();

    initMap();
    createRunLayers();
    initSidebarControls();
    renderSidebar();
    renderSelectedRunPanel();
    fitMapToVisibleRuns();
  }

  function initMap() {
    var tileLayer = getConfiguredTileLayer();

    map = L.map("map").setView(config.map.initialCenter, config.map.initialZoom);

    L.tileLayer(tileLayer.url, tileLayer.options).addTo(map);
  }

  function createRunLayers() {
    allRuns.forEach(function (run) {
      var trackLayer = L.geoJSON(run.track, {
        style: getTrackStyle(run),
        onEachFeature: function (feature, layer) {
          layer.bindPopup(createRunPopup(run));
          layer.on("click", function () {
            selectRun(run.id);
          });
        }
      });

      runLayers[run.id] = trackLayer;

      if (run.visible) {
        trackLayer.addTo(map);
      }
    });
  }

  function createSelectedPhotoLayer(run) {
    var group = L.layerGroup();
    var photos = getPhotosWithCoordinates(run);
    var maxPhotos = getPositiveIntegerConfig(config.photos.maxPhotoMarkers);

    if (!arePhotosEnabled() || !config.photos.showPhotoMarkers) {
      return group;
    }

    if (maxPhotos !== null) {
      photos = photos.slice(0, maxPhotos);
    }

    photos.forEach(function (photo) {
      var marker = L.marker([photo.lat, photo.lon], {
        icon: L.divIcon({
          className: "photo-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        }),
        title: photo.caption
      });

      marker.bindPopup(createPhotoPopup(photo));
      marker.addTo(group);
    });

    return group;
  }

  function renderSidebar() {
    var list = document.getElementById("runs-list");
    var filteredRuns = getFilteredRuns();

    list.innerHTML = "";

    filteredRuns.forEach(function (run) {
      list.appendChild(createRunCard(run));
    });

    if (filteredRuns.length === 0) {
      var emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-list";
      emptyMessage.textContent = "Aucune course ne correspond aux filtres.";
      list.appendChild(emptyMessage);
    }

    updateRunsCount();
  }

  function initSidebarControls() {
    var searchInput = document.getElementById("run-search");
    var yearSelect = document.getElementById("year-filter");
    var showAllButton = document.getElementById("show-all-runs");
    var hideAllButton = document.getElementById("hide-all-runs");

    renderYearFilter();

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        sidebarSearchText = searchInput.value;
        renderSidebar();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener("change", function () {
        sidebarYearFilter = yearSelect.value;
        renderSidebar();
      });
    }

    if (showAllButton) {
      showAllButton.addEventListener("click", function () {
        setAllRunsVisibleOnMap(true);
      });
    }

    if (hideAllButton) {
      hideAllButton.addEventListener("click", function () {
        clearSelection();
        setAllRunsVisibleOnMap(false);
      });
    }
  }

  function renderYearFilter() {
    var yearSelect = document.getElementById("year-filter");
    var years;

    if (!yearSelect) {
      return;
    }

    years = getAvailableYears();
    yearSelect.innerHTML = "";
    yearSelect.appendChild(createYearOption("", "Toutes les ann\u00e9es"));

    years.forEach(function (year) {
      yearSelect.appendChild(createYearOption(year, year));
    });
  }

  function createYearOption(value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function getAvailableYears() {
    var yearsByName = {};

    allRuns.forEach(function (run) {
      var year = getRunYear(run);
      if (year) {
        yearsByName[year] = true;
      }
    });

    return Object.keys(yearsByName).sort(function (a, b) {
      return b.localeCompare(a);
    });
  }

  function getFilteredRuns() {
    return allRuns.filter(function (run) {
      return runMatchesFilters(run);
    });
  }

  function runMatchesFilters(run) {
    var search = normalizeText(sidebarSearchText);
    var year = getRunYear(run);
    var searchableText;

    if (sidebarYearFilter && year !== sidebarYearFilter) {
      return false;
    }

    if (!search) {
      return true;
    }

    searchableText = normalizeText([
      run.title,
      run.date,
      run.id,
      formatDate(run.date)
    ].join(" "));

    return searchableText.indexOf(search) !== -1;
  }

  function getRunYear(run) {
    if (!run.date) {
      return "";
    }

    return String(run.date).slice(0, 4);
  }

  function normalizeText(value) {
    var text = String(value || "").toLowerCase();

    if (text.normalize) {
      text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    return text;
  }

  function updateRunsCount() {
    var count = document.getElementById("runs-count");
    var visibleCount;

    if (!count) {
      return;
    }

    visibleCount = getVisibleRunsCount();
    count.textContent = visibleCount + " / " + allRuns.length + " courses visibles sur la carte";
  }

  function getVisibleRunsCount() {
    var visibleCount = 0;

    allRuns.forEach(function (run) {
      if (run.visible) {
        visibleCount += 1;
      }
    });

    return visibleCount;
  }

  function createRunCard(run) {
    var card = document.createElement("article");
    card.className = "run-card";
    if (run.id === selectedRunId) {
      card.className += " is-selected";
    }
    card.style.setProperty("--run-color", run.color);

    var header = document.createElement("div");
    header.className = "run-card-header";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(run.visible);
    checkbox.setAttribute("data-run-id", run.id);
    checkbox.setAttribute("aria-label", "Afficher ou masquer " + run.title);
    checkbox.addEventListener("change", function () {
      toggleRunVisibility(run.id, checkbox.checked);
    });

    var titleBlock = document.createElement("div");
    titleBlock.className = "run-title-block";

    var titleButton = document.createElement("button");
    titleButton.type = "button";
    titleButton.className = "run-title-button";
    titleButton.addEventListener("click", function () {
      selectRun(run.id);
    });

    var title = document.createElement("span");
    title.className = "run-title";
    title.textContent = run.title;

    var date = document.createElement("p");
    date.className = "run-date";
    date.textContent = formatDate(run.date);

    titleButton.appendChild(title);
    titleBlock.appendChild(titleButton);
    titleBlock.appendChild(date);
    header.appendChild(checkbox);
    header.appendChild(titleBlock);

    var stats = document.createElement("div");
    stats.className = "run-stats";
    stats.appendChild(createStat("Distance", formatDistance(run.distanceKm)));
    stats.appendChild(createStat("Dénivelé +", formatElevation(run.elevationGainM)));

    var button = document.createElement("button");
    button.type = "button";
    button.className = "center-button";
    button.textContent = "Centrer";
    button.addEventListener("click", function () {
      selectAndCenterRun(run.id);
    });

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(button);

    return card;
  }

  function createStat(label, value) {
    var stat = document.createElement("div");
    stat.className = "run-stat";

    var labelNode = document.createElement("span");
    labelNode.textContent = label;

    var valueNode = document.createElement("strong");
    valueNode.textContent = value;

    stat.appendChild(labelNode);
    stat.appendChild(valueNode);

    return stat;
  }

  function toggleRunVisibility(runId, visible) {
    var trackLayer = runLayers[runId];

    if (!trackLayer) {
      return;
    }

    if (visible) {
      trackLayer.addTo(map);
    } else {
      if (selectedRunId === runId) {
        clearSelection();
      }
      trackLayer.removeFrom(map);
    }

    setRunVisible(runId, visible);
    updateRunsCount();
    updateVisibleSidebarCheckboxes();
    applySelectionStyles();
    fitMapToVisibleRuns();
  }

  function setAllRunsVisibleOnMap(visible) {
    allRuns.forEach(function (run) {
      run.visible = visible;
      setRunVisibilityOnMap(run.id, visible);
    });

    updateVisibleSidebarCheckboxes();
    updateRunsCount();
    applySelectionStyles();
    fitMapToVisibleRuns();
  }

  function updateVisibleSidebarCheckboxes() {
    var checkboxes = document.querySelectorAll('#runs-list input[type="checkbox"]');

    Array.prototype.forEach.call(checkboxes, function (checkbox) {
      var run = findRunById(checkbox.getAttribute("data-run-id"));
      if (run) {
        checkbox.checked = Boolean(run.visible);
      }
    });
  }

  function centerOnRun(runId) {
    var layer = runLayers[runId];

    if (!layer) {
      return;
    }

    var bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: config.map.defaultFitPadding, maxZoom: 15 });
    }
  }

  function selectAndCenterRun(runId) {
    selectRun(runId);
    centerOnRun(runId);
  }

  function selectRun(runId) {
    var run = findRunById(runId);

    if (!run) {
      return;
    }

    if (selectedRunId !== runId) {
      selectedRunPhotosExpanded = false;
    }

    selectedRunId = runId;

    if (!run.visible) {
      setRunVisibilityOnMap(runId, true);
      setRunVisible(runId, true);
      updateVisibleSidebarCheckboxes();
      updateRunsCount();
    }

    applySelectionStyles();
    renderSidebar();
    renderSelectedRunPanel();
    renderSelectedPhotoMarkers(run);
  }

  function clearSelection() {
    selectedRunId = null;
    selectedRunPhotosExpanded = false;
    applySelectionStyles();
    renderSidebar();
    renderSelectedRunPanel();
    clearSelectedPhotoMarkers();
  }

  function applySelectionStyles() {
    allRuns.forEach(function (run) {
      var layer = runLayers[run.id];

      if (!layer) {
        return;
      }

      layer.setStyle(getTrackStyle(run));

      if (run.id === selectedRunId) {
        bringLayerToFront(layer);
      }
    });
  }

  function getTrackStyle(run) {
    var isSelected = run.id === selectedRunId;
    var shouldDim = Boolean(selectedRunId) && !isSelected && config.selection.dimOtherRuns;

    if (isSelected) {
      return {
        color: config.selection.selectedColor === null ? run.color : config.selection.selectedColor,
        weight: config.selection.selectedWeight,
        opacity: config.selection.selectedOpacity
      };
    }

    return {
      color: run.color,
      weight: config.tracks.defaultWeight,
      opacity: shouldDim ? config.selection.dimmedOpacity : config.tracks.defaultOpacity
    };
  }

  function bringLayerToFront(layer) {
    if (typeof layer.bringToFront === "function") {
      layer.bringToFront();
      return;
    }

    if (typeof layer.eachLayer === "function") {
      layer.eachLayer(function (childLayer) {
        if (typeof childLayer.bringToFront === "function") {
          childLayer.bringToFront();
        }
      });
    }
  }

  function setRunVisibilityOnMap(runId, visible) {
    var trackLayer = runLayers[runId];

    if (trackLayer) {
      if (visible) {
        trackLayer.addTo(map);
      } else {
        trackLayer.removeFrom(map);
      }
    }
  }

  function renderSelectedRunPanel() {
    var panel = document.getElementById("selected-run-panel");
    var run = findRunById(selectedRunId);

    if (!panel) {
      return;
    }

    panel.innerHTML = "";

    if (!run) {
      var emptyMessage = document.createElement("p");
      emptyMessage.className = "selection-empty";
      emptyMessage.textContent = "Aucune course s\u00e9lectionn\u00e9e.";
      panel.appendChild(emptyMessage);
      return;
    }

    panel.appendChild(createSelectedRunContent(run));
  }

  function createSelectedRunContent(run) {
    var content = document.createElement("div");
    var heading = document.createElement("h2");
    var meta = document.createElement("dl");
    var actions = document.createElement("div");
    var centerButton = document.createElement("button");
    var hideButton = document.createElement("button");
    var clearButton = document.createElement("button");

    content.className = "selected-run-content";

    heading.textContent = "Course s\u00e9lectionn\u00e9e";
    content.appendChild(heading);
    content.appendChild(createSelectedRunTitle(run));

    meta.className = "selected-run-meta";
    appendMeta(meta, "Date", formatDate(run.date));
    appendMeta(meta, "Distance", formatDistance(run.distanceKm));
    appendMeta(meta, "D\u00e9nivel\u00e9 +", formatElevation(run.elevationGainM));
    appendMeta(meta, "ID", run.id);
    appendMeta(meta, "Photos", formatPhotoCount(run));
    content.appendChild(meta);
    appendSelectedRunGallery(content, run);

    actions.className = "selection-actions";

    centerButton.type = "button";
    centerButton.textContent = "Centrer";
    centerButton.addEventListener("click", function () {
      selectAndCenterRun(run.id);
    });

    hideButton.type = "button";
    hideButton.textContent = "Masquer";
    hideButton.addEventListener("click", function () {
      toggleRunVisibility(run.id, false);
    });

    clearButton.type = "button";
    clearButton.textContent = "Effacer s\u00e9lection";
    clearButton.addEventListener("click", clearSelection);

    actions.appendChild(centerButton);
    actions.appendChild(hideButton);
    actions.appendChild(clearButton);
    content.appendChild(actions);

    return content;
  }

  function appendSelectedRunGallery(content, run) {
    var photos = run.photos || [];
    var maxPhotos = getPositiveIntegerConfig(config.photos.maxPhotosInPanel);
    var visiblePhotos;
    var gallery;
    var heading;
    var list;
    var toggleButton;

    if (!arePhotosEnabled() || !config.photos.showPhotoGallery || photos.length === 0) {
      return;
    }

    visiblePhotos = selectedRunPhotosExpanded || maxPhotos === null ? photos : photos.slice(0, maxPhotos);

    gallery = document.createElement("section");
    gallery.className = "selected-photo-gallery";

    heading = document.createElement("h3");
    heading.textContent = "Photos";
    gallery.appendChild(heading);

    list = document.createElement("div");
    list.className = "photo-gallery-grid";

    visiblePhotos.forEach(function (photo) {
      list.appendChild(createPhotoThumbnailButton(photo));
    });

    gallery.appendChild(list);

    if (maxPhotos !== null && photos.length > maxPhotos) {
      toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "photo-gallery-toggle";

      if (selectedRunPhotosExpanded) {
        toggleButton.textContent = "R\u00e9duire";
        toggleButton.addEventListener("click", function () {
          selectedRunPhotosExpanded = false;
          renderSelectedRunPanel();
        });
      } else {
        toggleButton.textContent = "+" + (photos.length - visiblePhotos.length) + " photos";
        toggleButton.addEventListener("click", function () {
          selectedRunPhotosExpanded = true;
          renderSelectedRunPanel();
        });
      }

      gallery.appendChild(toggleButton);
    }

    content.appendChild(gallery);
  }

  function createPhotoThumbnailButton(photo) {
    var button = document.createElement("button");
    var image = document.createElement("img");

    button.type = "button";
    button.className = "photo-thumb-button";
    button.title = photo.caption || photo.source || "Photo";
    button.addEventListener("click", function () {
      window.open(photo.web || photo.thumb, "_blank", "noopener");
    });

    image.src = photo.thumb;
    image.alt = photo.caption || photo.source || "Photo";
    image.loading = "lazy";

    button.appendChild(image);
    return button;
  }

  function createSelectedRunTitle(run) {
    var title = document.createElement("p");
    title.className = "selected-run-title";
    title.textContent = run.title;
    title.style.setProperty("--run-color", run.color);
    return title;
  }

  function appendMeta(list, label, value) {
    var term = document.createElement("dt");
    var detail = document.createElement("dd");

    term.textContent = label;
    detail.textContent = value;

    list.appendChild(term);
    list.appendChild(detail);
  }

  function formatPhotoCount(run) {
    var count = (run.photos || []).length;

    if (count === 0) {
      return "0";
    }

    if (count === 1) {
      return "1 photo";
    }

    return count + " photos";
  }

  function renderSelectedPhotoMarkers(run) {
    clearSelectedPhotoMarkers();

    if (!run || !arePhotosEnabled() || !config.photos.showPhotoMarkers) {
      return;
    }

    selectedPhotoLayer = createSelectedPhotoLayer(run);
    selectedPhotoLayer.addTo(map);
  }

  function clearSelectedPhotoMarkers() {
    if (selectedPhotoLayer) {
      selectedPhotoLayer.removeFrom(map);
      selectedPhotoLayer = null;
    }
  }

  function getPhotosWithCoordinates(run) {
    return (run.photos || []).filter(function (photo) {
      return isFiniteNumber(photo.lat) && isFiniteNumber(photo.lon);
    });
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function fitMapToVisibleRuns() {
    var bounds = L.latLngBounds();
    var hasVisibleRun = false;

    allRuns.forEach(function (run) {
      var layer = runLayers[run.id];
      if (run.visible && layer) {
        var layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          bounds.extend(layerBounds);
          hasVisibleRun = true;
        }
      }
    });

    if (hasVisibleRun) {
      map.fitBounds(bounds, { padding: config.map.defaultFitPadding });
    } else {
      map.setView(config.map.initialCenter, config.map.initialZoom);
    }
  }

  function setRunVisible(runId, visible) {
    allRuns.forEach(function (run) {
      if (run.id === runId) {
        run.visible = visible;
      }
    });
  }

  function findRunById(runId) {
    var foundRun = null;

    allRuns.forEach(function (run) {
      if (run.id === runId) {
        foundRun = run;
      }
    });

    return foundRun;
  }

  function createRunPopup(run) {
    return [
      '<div class="track-popup">',
      "<h2>" + escapeHtml(run.title) + "</h2>",
      "<p><strong>Date :</strong> " + escapeHtml(formatDate(run.date)) + "</p>",
      "<p><strong>Distance :</strong> " + escapeHtml(formatDistance(run.distanceKm)) + "</p>",
      "<p><strong>Dénivelé + :</strong> " + escapeHtml(formatElevation(run.elevationGainM)) + "</p>",
      "</div>"
    ].join("");
  }

  function createPhotoPopup(photo) {
    var caption = photo.caption || photo.source || "Photo";
    var webPath = photo.web || photo.thumb;
    var popupClass = "photo-popup photo-popup--" + getPhotoOrientation(photo);

    return [
      '<div class="' + popupClass + '">',
      '<a href="' + escapeHtml(webPath) + '" target="_blank" rel="noopener">',
      '<img src="' + escapeHtml(webPath) + '" alt="' + escapeHtml(caption) + '">',
      "</a>",
      "<p>" + escapeHtml(caption) + "</p>",
      '<a href="' + escapeHtml(webPath) + '" target="_blank" rel="noopener">Ouvrir l\u2019image</a>',
      "</div>"
    ].join("");
  }

  function getPhotoOrientation(photo) {
    if (isFiniteNumber(photo.webWidth) && isFiniteNumber(photo.webHeight)) {
      return photo.webHeight > photo.webWidth ? "portrait" : "landscape";
    }

    return "landscape";
  }

  function formatDate(value) {
    var date = new Date(value + "T00:00:00");
    return date.toLocaleDateString("fr-BE", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function formatDistance(value) {
    return value.toFixed(1).replace(".", ",") + " km";
  }

  function formatElevation(value) {
    return value + " m";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showStartupError() {
    var list = document.getElementById("runs-list");
    list.innerHTML = '<div class="app-error">Impossible de démarrer la carte. Vérifiez que Leaflet, les traces et data/runs.js sont chargés avant app.js.</div>';
  }

  function mergeConfig(defaults, overrides) {
    var merged = {};

    Object.keys(defaults).forEach(function (key) {
      var defaultValue = defaults[key];
      var overrideValue = overrides[key];

      if (isPlainObject(defaultValue)) {
        merged[key] = mergeConfig(defaultValue, isPlainObject(overrideValue) ? overrideValue : {});
      } else if (overrideValue !== undefined) {
        merged[key] = overrideValue;
      } else {
        merged[key] = copyConfigValue(defaultValue);
      }
    });

    return merged;
  }

  function isPlainObject(value) {
    return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
  }

  function copyConfigValue(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }

    return value;
  }

  function applySiteTitle() {
    var heading = document.querySelector(".sidebar-header h1");

    document.title = config.siteTitle;

    if (heading) {
      heading.textContent = config.siteTitle;
    }
  }

  function getConfiguredRuns() {
    var demoRuns = config.sidebar.showDemoRuns ? window.RUNS || [] : [];
    var generatedRuns = config.sidebar.showGeneratedRuns ? window.GENERATED_RUNS || [] : [];

    return [].concat(demoRuns).concat(generatedRuns);
  }

  function getConfiguredTileLayer() {
    var tileLayerName = config.map.tileLayer;

    if (TILE_LAYERS[tileLayerName]) {
      return TILE_LAYERS[tileLayerName];
    }

    if (window.console && console.warn) {
      console.warn("Fond de carte inconnu: " + tileLayerName + ". Utilisation de osm.");
    }

    return TILE_LAYERS.osm;
  }

  function arePhotosEnabled() {
    return config.photos && config.photos.enabled !== false;
  }

  function getPositiveIntegerConfig(value) {
    if (typeof value === "number" && isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    return null;
  }

  window.runningMap = {
    centerOnRun: centerOnRun,
    clearSelection: clearSelection,
    fitMapToVisibleRuns: fitMapToVisibleRuns,
    selectAndCenterRun: selectAndCenterRun,
    selectRun: selectRun,
    setAllRunsVisibleOnMap: setAllRunsVisibleOnMap,
    toggleRunVisibility: toggleRunVisibility
  };
})();
