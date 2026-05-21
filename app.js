(function () {
  var DEFAULT_CONFIG = {
    // Empty keeps the existing ./photos/... paths working from file:///.
    PHOTO_BASE_URL: "",
    siteTitle: "RunningMap",
    siteSubtitle: "Parcours de d\u00e9monstration",
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
      maxPhotosInPanel: 12
    },
    selection: {
      selectedColor: null,
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

  var PROJECT_GITHUB_URL = "https://github.com/rboman/running_map";
  var runtimeConfig = mergeConfig(DEFAULT_CONFIG, window.RUNNINGMAP_CONFIG || {});
  var config = mergeConfig(runtimeConfig, window.RUNNING_MAP_CONFIG || {});
  var map;
  var allRuns = [];
  var runLayers = {};
  var allRunStartMarkersLayer = null;
  var allRunStartMarkersByRunId = {};
  var selectedPhotoLayer = null;
  var selectedRunDirectionLayer = null;
  var selectedRunEndpointLayer = null;
  var selectedPhotoMarkersById = {};
  var selectedPhotoThumbsById = {};
  var activePhotoId = null;
  var sidebarSearchText = "";
  var sidebarYearFilter = "";
  var selectedRunId = null;
  var selectedRunPhotosExpanded = false;
  var isLeftPanelCollapsed = false;
  var isRightPanelCollapsed = false;
  var lightboxPhotos = [];
  var lightboxPhotoIndex = -1;
  var isLightboxOpen = false;
  var isAboutModalOpen = false;
  var aboutModalPreviousFocus = null;
  var photoThumbClickTimer = null;
  var isMobileLayoutActive = false;

  window.addEventListener("load", startApp);

  function startApp() {
    if (!window.L) {
      showStartupError();
      return;
    }

    applySiteHeader();

    allRuns = getConfiguredRuns();

    updateLayoutMode(false);
    initMap();
    createRunLayers();
    createAllRunStartMarkersLayer(allRuns);
    initSidebarControls();
    initPanelControls();
    initPhotoLightbox();
    initAboutModal();
    renderSidebar();
    renderSelectedRunPanel();
    fitMapToVisibleRuns();
  }

  function initMap() {
    var tileLayer = getConfiguredTileLayer();

    map = L.map("map").setView(config.map.initialCenter, config.map.initialZoom);

    L.tileLayer(tileLayer.url, tileLayer.options).addTo(map);
    createMapPanes();
    map.getContainer().addEventListener("click", handlePhotoPopupLightboxClick);
  }

  function createMapPanes() {
    map.createPane("run-start-markers");
    map.getPane("run-start-markers").style.zIndex = 430;

    map.createPane("run-direction-markers");
    map.getPane("run-direction-markers").style.zIndex = 450;
    map.getPane("run-direction-markers").style.pointerEvents = "none";
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
    });
  }

  function createSelectedPhotoLayer(run) {
    var group = L.layerGroup();

    if (!arePhotosEnabled() || !config.photos.showPhotoMarkers) {
      return group;
    }

    (run.photos || []).forEach(function (photo, index) {
      var photoId = getPhotoId(run, index);

      if (!hasPhotoCoordinates(photo)) {
        return;
      }

      var marker = L.marker([photo.lat, photo.lon], {
        icon: L.divIcon({
          className: "photo-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        }),
        title: photo.caption
      });

      marker.bindPopup(createPhotoPopup(photo, photoId));
      marker.on("click", function () {
        selectPhotoFromMarker(photoId);
      });
      marker.addTo(group);
      selectedPhotoMarkersById[photoId] = marker;
    });

    return group;
  }

  function createRunEndpointLayer(run) {
    var points = getRunTrackPoints(run);
    var group = L.layerGroup();

    if (points.length < 2) {
      return group;
    }

    L.marker(points[0], {
      icon: createEndpointIcon("start"),
      title: "D\u00e9part",
      zIndexOffset: 900
    }).bindTooltip("D\u00e9part", {
      direction: "top",
      offset: [0, -12]
    }).addTo(group);

    L.marker(points[points.length - 1], {
      icon: createEndpointIcon("end"),
      title: "Arriv\u00e9e",
      zIndexOffset: 901
    }).bindTooltip("Arriv\u00e9e", {
      direction: "top",
      offset: [0, -12]
    }).addTo(group);

    return group;
  }

  function createAllRunStartMarkersLayer(runs) {
    allRunStartMarkersLayer = L.layerGroup().addTo(map);
    allRunStartMarkersByRunId = {};

    runs.forEach(function (run) {
      var points = getRunTrackPoints(run);
      var marker;

      if (points.length < 1) {
        return;
      }

      marker = L.marker(points[0], {
        icon: createRunStartMarkerIcon(run),
        pane: "run-start-markers",
        title: "D\u00e9part de " + run.title,
        zIndexOffset: -600
      });

      marker.bindPopup(createRunStartPopup(run));
      allRunStartMarkersByRunId[run.id] = marker;

    });

    updateAllRunStartMarkersStyle();
  }

  function updateAllRunStartMarkersStyle() {
    var visibleRunIds = getFilteredRunIds();

    Object.keys(allRunStartMarkersByRunId).forEach(function (runId) {
      var marker = allRunStartMarkersByRunId[runId];
      var run = findRunById(runId);
      var isSelected = runId === selectedRunId;

      if (!marker || !run || !allRunStartMarkersLayer) {
        return;
      }

      if (visibleRunIds[runId] && !allRunStartMarkersLayer.hasLayer(marker)) {
        marker.addTo(allRunStartMarkersLayer);
      } else if (!visibleRunIds[runId] && allRunStartMarkersLayer.hasLayer(marker)) {
        marker.removeFrom(allRunStartMarkersLayer);
      }

      marker.setIcon(createRunStartMarkerIcon(run, isSelected));
      marker.setZIndexOffset(isSelected ? 1000 : -600);
    });
  }

  function createRunStartMarkerIcon(run, isSelected) {
    var className = "run-start-marker-icon";
    var markerClassName = "run-start-marker";

    if (isSelected) {
      className += " run-start-marker-icon--selected";
      markerClassName += " run-start-marker--selected";
    }

    return L.divIcon({
      className: className,
      html: '<span class="' + markerClassName + '" style="--run-color: ' + escapeHtml(run.color) + ';"></span>',
      iconSize: isSelected ? [32, 42] : [24, 32],
      iconAnchor: isSelected ? [16, 41] : [12, 31],
      popupAnchor: isSelected ? [0, -38] : [0, -28]
    });
  }

  function createRunStartPopup(run) {
    return [
      '<div class="track-popup">',
      "<h2>" + escapeHtml(run.title) + "</h2>",
      "<p><strong>D\u00e9part du parcours</strong></p>",
      "<p><strong>Date :</strong> " + escapeHtml(formatDate(run.date)) + "</p>",
      "<p><strong>Distance :</strong> " + escapeHtml(formatDistance(run.distanceKm)) + "</p>",
      "</div>"
    ].join("");
  }

  function createSelectedRunDirectionLayer(run) {
    var points = getRunTrackPoints(run);
    var group = L.layerGroup();
    var arrowPlacements = getDirectionArrowPlacements(points, run);

    if (points.length < 8 || arrowPlacements.length === 0) {
      return group;
    }

    arrowPlacements.forEach(function (placement) {
      L.marker(placement.point, {
        icon: createDirectionArrowIcon(placement.angle, run.color),
        interactive: false,
        keyboard: false,
        pane: "run-direction-markers",
        zIndexOffset: -300
      }).addTo(group);
    });

    return group;
  }

  function getDirectionArrowPlacements(points, run) {
    var placements = [];
    var pointCount = points.length;
    var arrowCount = getDirectionArrowCount(run, pointCount);
    var segments = [];
    var totalDistance = 0;
    var targetDistance;
    var segment;
    var segmentStartDistance = 0;
    var ratio;
    var angle;
    var i;

    if (pointCount < 8) {
      return placements;
    }

    for (i = 1; i < pointCount; i += 1) {
      segment = {
        start: points[i - 1],
        end: points[i],
        distance: map.distance(points[i - 1], points[i])
      };

      if (segment.distance > 0) {
        totalDistance += segment.distance;
        segment.endDistance = totalDistance;
        segments.push(segment);
      }
    }

    if (segments.length === 0 || totalDistance <= 0) {
      return placements;
    }

    segment = segments.shift();

    for (i = 0; i < arrowCount; i += 1) {
      targetDistance = totalDistance * ((i + 1) / (arrowCount + 1));

      while (segment && segment.endDistance < targetDistance) {
        segmentStartDistance = segment.endDistance;
        segment = segments.shift();
      }

      if (!segment) {
        break;
      }

      ratio = (targetDistance - segmentStartDistance) / segment.distance;
      angle = getDirectionAngle(segment.start, segment.end);

      if (isFiniteNumber(angle)) {
        placements.push({
          point: interpolateTrackPoint(segment.start, segment.end, ratio),
          angle: angle
        });
      }
    }

    return placements;
  }

  function interpolateTrackPoint(startPoint, endPoint, ratio) {
    var boundedRatio = Math.max(0, Math.min(1, ratio));

    return [
      startPoint[0] + (endPoint[0] - startPoint[0]) * boundedRatio,
      startPoint[1] + (endPoint[1] - startPoint[1]) * boundedRatio
    ];
  }

  function getDirectionArrowCount(run, pointCount) {
    if (run && isFiniteNumber(run.distanceKm) && run.distanceKm > 0) {
      return Math.min(40, Math.max(3, Math.round(run.distanceKm / 0.5)));
    }

    return Math.min(20, Math.max(3, Math.floor(pointCount / 40)));
  }

  function getDirectionAngle(previousPoint, nextPoint) {
    var previousLayerPoint = map.latLngToLayerPoint(previousPoint);
    var nextLayerPoint = map.latLngToLayerPoint(nextPoint);
    var deltaX = nextLayerPoint.x - previousLayerPoint.x;
    var deltaY = nextLayerPoint.y - previousLayerPoint.y;

    if (deltaX === 0 && deltaY === 0) {
      return null;
    }

    return Math.atan2(deltaY, deltaX) * 180 / Math.PI;
  }

  function createDirectionArrowIcon(angleDeg, color) {
    return L.divIcon({
      className: "run-direction-arrow-icon",
      html: '<span class="run-direction-arrow" style="--run-color: ' + escapeHtml(color) + '; transform: rotate(' + angleDeg + 'deg);">\u27a4</span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  function createEndpointIcon(type) {
    var isStart = type === "start";
    var label = isStart ? "D" : "A";
    var className = isStart ? "run-endpoint--start" : "run-endpoint--end";

    return L.divIcon({
      className: "run-endpoint-icon",
      html: '<span class="run-endpoint ' + className + '">' + label + "</span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      tooltipAnchor: [0, -16]
    });
  }

  function getRunTrackPoints(run) {
    var coordinates = getRunTrackCoordinates(run);

    return coordinates
      .filter(function (point) {
        return Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1]);
      })
      .map(function (point) {
        return [point[1], point[0]];
      });
  }

  function renderSidebar() {
    var list = document.getElementById("runs-list");
    var filteredRuns = getFilteredRuns();

    clearSelectionIfFilteredOut(filteredRuns);
    syncMapToFilteredRuns(filteredRuns);

    list.innerHTML = "";

    filteredRuns.forEach(function (run) {
      list.appendChild(createRunListItem(run));
    });

    if (filteredRuns.length === 0) {
      var emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-list";
      emptyMessage.textContent = "Aucune course ne correspond aux filtres.";
      list.appendChild(emptyMessage);
    }

    updateRunsCount(filteredRuns.length);
    updateRunsTotal(filteredRuns);
    applySelectionStyles();
  }

  function initSidebarControls() {
    var searchInput = document.getElementById("run-search");
    var yearSelect = document.getElementById("year-filter");
    var resetFiltersButton = document.getElementById("reset-run-filters");

    renderYearFilter();

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        sidebarSearchText = searchInput.value;
        closePhotoLightbox();
        renderSidebar();
        fitMapToVisibleRuns();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener("change", function () {
        sidebarYearFilter = yearSelect.value;
        closePhotoLightbox();
        renderSidebar();
        fitMapToVisibleRuns();
      });
    }

    if (resetFiltersButton) {
      resetFiltersButton.addEventListener("click", function () {
        sidebarSearchText = "";
        sidebarYearFilter = "";
        if (searchInput) {
          searchInput.value = "";
        }
        if (yearSelect) {
          yearSelect.value = "";
        }
        clearSelection();
        fitMapToVisibleRuns();
      });
    }
  }

  function initPhotoLightbox() {
    var lightbox = document.getElementById("photo-lightbox");
    var closeButton = lightbox ? lightbox.querySelector(".photo-lightbox__button--close") : null;
    var prevButton = lightbox ? lightbox.querySelector(".photo-lightbox__button--prev") : null;
    var nextButton = lightbox ? lightbox.querySelector(".photo-lightbox__button--next") : null;
    var backdrop = lightbox ? lightbox.querySelector(".photo-lightbox__backdrop") : null;

    if (!lightbox) {
      return;
    }

    if (closeButton) {
      closeButton.addEventListener("click", closePhotoLightbox);
    }
    if (prevButton) {
      prevButton.addEventListener("click", showPreviousLightboxPhoto);
    }
    if (nextButton) {
      nextButton.addEventListener("click", showNextLightboxPhoto);
    }
    if (backdrop) {
      backdrop.addEventListener("click", closePhotoLightbox);
    }

    document.addEventListener("keydown", handlePhotoLightboxKeydown);
  }

  function initAboutModal() {
    var button = document.getElementById("about-help-toggle");
    var modal = document.getElementById("about-modal");
    var closeButtons = modal ? modal.querySelectorAll("[data-about-close]") : [];
    var githubLink = document.getElementById("project-github-link");

    if (modal && modal.getAttribute("data-about-initialized") === "true") {
      return;
    }

    if (githubLink && PROJECT_GITHUB_URL) {
      githubLink.href = PROJECT_GITHUB_URL;
    }

    if (modal) {
      modal.setAttribute("data-about-initialized", "true");
    }

    if (button) {
      button.addEventListener("click", openAboutModal);
    }

    Array.prototype.forEach.call(closeButtons, function (closeButton) {
      closeButton.addEventListener("click", closeAboutModal);
    });

    document.addEventListener("keydown", handleAboutModalKeydown);
  }

  function openAboutModal() {
    var button = document.getElementById("about-help-toggle");
    var modal = document.getElementById("about-modal");
    var closeButton = modal ? modal.querySelector(".about-modal__close") : null;

    if (!modal || isAboutModalOpen) {
      return;
    }

    closePhotoLightbox();
    aboutModalPreviousFocus = document.activeElement;
    isAboutModalOpen = true;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
    if (closeButton) {
      closeButton.focus();
    }
  }

  function closeAboutModal() {
    var button = document.getElementById("about-help-toggle");
    var modal = document.getElementById("about-modal");

    if (!modal || !isAboutModalOpen) {
      return;
    }

    isAboutModalOpen = false;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
    if (aboutModalPreviousFocus && typeof aboutModalPreviousFocus.focus === "function") {
      aboutModalPreviousFocus.focus();
    }
    aboutModalPreviousFocus = null;
  }

  function handleAboutModalKeydown(event) {
    if (!isAboutModalOpen || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    closeAboutModal();
  }

  function initPanelControls() {
    var leftToggleButton = document.getElementById("mobile-left-panel-toggle");
    var rightToggleButton = document.getElementById("mobile-right-panel-toggle");
    var closeButtons = document.querySelectorAll("[data-mobile-panel-close]");

    if (leftToggleButton) {
      leftToggleButton.addEventListener("click", function () {
        togglePanel("left");
      });
    }

    if (rightToggleButton) {
      rightToggleButton.addEventListener("click", function () {
        togglePanel("right");
      });
    }

    Array.prototype.forEach.call(closeButtons, function (button) {
      button.addEventListener("click", closeMobilePanels);
    });

    document.addEventListener("keydown", handleMobilePanelKeydown);
    window.addEventListener("resize", handleLayoutResize);
    window.addEventListener("orientationchange", handleLayoutResize);

    updateDesktopPanelState(false);
    updatePanelControls();
  }

  function togglePanel(panelName) {
    if (isMobileLayout()) {
      openMobilePanel(panelName);
      return;
    }

    if (panelName === "left") {
      isLeftPanelCollapsed = !isLeftPanelCollapsed;
    } else if (panelName === "right") {
      isRightPanelCollapsed = !isRightPanelCollapsed;
    }

    updateDesktopPanelState(true);
  }

  function openMobilePanel(panelName) {
    var shell = document.querySelector(".app-shell");

    if (!shell || !isMobileLayout()) {
      return;
    }

    shell.classList.toggle("left-panel-open", panelName === "left");
    shell.classList.toggle("right-panel-open", panelName === "right");
    updatePanelControls();
    invalidateMapSoon();
  }

  function closeMobilePanels() {
    var shell = document.querySelector(".app-shell");
    var hadOpenPanel;

    if (!shell) {
      return;
    }

    hadOpenPanel = shell.classList.contains("left-panel-open") || shell.classList.contains("right-panel-open");
    shell.classList.remove("left-panel-open");
    shell.classList.remove("right-panel-open");
    updatePanelControls();

    if (hadOpenPanel) {
      invalidateMapSoon();
    }
  }

  function updateDesktopPanelState(shouldInvalidateMap) {
    var shell = document.querySelector(".app-shell");

    if (!shell) {
      return;
    }

    shell.classList.toggle("left-panel-collapsed", isLeftPanelCollapsed);
    shell.classList.toggle("right-panel-collapsed", isRightPanelCollapsed);
    updatePanelControls();

    if (shouldInvalidateMap) {
      invalidateMapSoon();
    }
  }

  function updatePanelControls() {
    var shell = document.querySelector(".app-shell");
    var leftToggleButton = document.getElementById("mobile-left-panel-toggle");
    var rightToggleButton = document.getElementById("mobile-right-panel-toggle");
    var mobileLayout = isMobileLayout();
    var isLeftPanelActive = mobileLayout ? shell && shell.classList.contains("left-panel-open") : !isLeftPanelCollapsed;
    var isRightPanelActive = mobileLayout ? shell && shell.classList.contains("right-panel-open") : !isRightPanelCollapsed;

    if (leftToggleButton) {
      leftToggleButton.classList.toggle("is-active", Boolean(isLeftPanelActive));
      leftToggleButton.setAttribute("aria-expanded", String(Boolean(isLeftPanelActive)));
      leftToggleButton.setAttribute("aria-pressed", String(Boolean(isLeftPanelActive)));
    }

    if (rightToggleButton) {
      rightToggleButton.classList.toggle("is-active", Boolean(isRightPanelActive));
      rightToggleButton.setAttribute("aria-expanded", String(Boolean(isRightPanelActive)));
      rightToggleButton.setAttribute("aria-pressed", String(Boolean(isRightPanelActive)));
    }
  }

  function handleMobilePanelKeydown(event) {
    var shell = document.querySelector(".app-shell");
    var hasOpenPanel = shell && (shell.classList.contains("left-panel-open") || shell.classList.contains("right-panel-open"));

    if (event.key !== "Escape" || isLightboxOpen || !isMobileLayout() || !hasOpenPanel) {
      return;
    }

    event.preventDefault();
    closeMobilePanels();
  }

  function handleLayoutResize() {
    updateLayoutMode(true);
  }

  function updateLayoutMode(shouldInvalidateMap) {
    var body = document.body;
    var shell = document.querySelector(".app-shell");
    var nextIsMobileLayout = shouldUseMobileLayout();
    var layoutChanged = nextIsMobileLayout !== isMobileLayoutActive;

    isMobileLayoutActive = nextIsMobileLayout;

    if (body) {
      body.classList.toggle("mobile-layout", isMobileLayoutActive);
    }

    if (shell) {
      shell.classList.toggle("mobile-layout", isMobileLayoutActive);

      if (!isMobileLayoutActive) {
        shell.classList.remove("left-panel-open");
        shell.classList.remove("right-panel-open");
      }
    }

    updatePanelControls();

    if (shouldInvalidateMap && (layoutChanged || map)) {
      invalidateMapSoon();
    }
  }

  function isMobileLayout() {
    return isMobileLayoutActive;
  }

  function shouldUseMobileLayout() {
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var fullDesktopPanelsWidth = getConfiguredPanelWidth("--left-panel-width") + getConfiguredPanelWidth("--right-panel-width");

    return viewportWidth <= viewportHeight + fullDesktopPanelsWidth;
  }

  function getConfiguredPanelWidth(propertyName) {
    var value = window.getComputedStyle(document.documentElement).getPropertyValue(propertyName);
    var width = parseFloat(value);

    return isFinite(width) ? width : 0;
  }

  function invalidateMapSoon() {
    if (!map || typeof map.invalidateSize !== "function") {
      return;
    }

    window.setTimeout(function () {
      map.invalidateSize();
    }, 100);
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
    return allRuns
      .filter(function (run) {
        return runMatchesFilters(run);
      })
      .sort(compareRunsByDateDesc);
  }

  function getFilteredRunIds(filteredRuns) {
    var visibleRunIds = {};

    (filteredRuns || getFilteredRuns()).forEach(function (run) {
      visibleRunIds[run.id] = true;
    });

    return visibleRunIds;
  }

  function compareRunsByDateDesc(a, b) {
    return getRunDateTime(b) - getRunDateTime(a);
  }

  function getRunDateTime(run) {
    var time = Date.parse(String(run.date || "") + "T00:00:00");
    return isNaN(time) ? 0 : time;
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

  function updateRunsCount(visibleCount) {
    var count = document.getElementById("runs-count");

    if (!count) {
      return;
    }

    count.textContent = visibleCount + " / " + allRuns.length + " courses visibles sur la carte";
  }

  function updateRunsTotal(filteredRuns) {
    var total = document.getElementById("runs-total");
    var distanceKm = 0;
    var elevationGainM = 0;

    if (!total) {
      return;
    }

    filteredRuns.forEach(function (run) {
      if (isFiniteNumber(run.distanceKm)) {
        distanceKm += run.distanceKm;
      }
      if (isFiniteNumber(run.elevationGainM)) {
        elevationGainM += run.elevationGainM;
      }
    });

    total.textContent = "Total affich\u00e9 : " + formatDistance(distanceKm) + " \u00b7 D+ " + formatElevation(Math.round(elevationGainM));
  }

  function createRunListItem(run) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "run-list-item";
    item.style.setProperty("--run-color", run.color);
    item.setAttribute("aria-pressed", String(run.id === selectedRunId));
    item.setAttribute("data-run-id", run.id);

    if (run.id === selectedRunId) {
      item.className += " is-selected";
    }

    item.addEventListener("click", function () {
      selectAndCenterRun(run.id);
      if (isMobileLayout()) {
        closeMobilePanels();
      }
    });

    var color = document.createElement("span");
    color.className = "run-list-item__color";
    color.setAttribute("aria-hidden", "true");

    var text = document.createElement("span");
    text.className = "run-list-item__text";

    var itemTitle = document.createElement("span");
    itemTitle.className = "run-list-item__title";
    itemTitle.textContent = run.title;

    var meta = document.createElement("span");
    meta.className = "run-list-item__meta";
    meta.textContent = [
      formatDate(run.date),
      formatDistance(run.distanceKm),
      "D+ " + formatElevation(run.elevationGainM)
    ].join(" \u00b7 ");

    text.appendChild(itemTitle);
    text.appendChild(meta);
    item.appendChild(color);
    item.appendChild(text);

    return item;
  }

  function centerOnRun(runId) {
    var layer = runLayers[runId];
    var run = findRunById(runId);

    if (!layer || !run || !runMatchesFilters(run)) {
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

    if (!run || !runMatchesFilters(run)) {
      return;
    }

    if (selectedRunId !== runId) {
      closePhotoLightbox();
    }

    clearSelectedPhotoMarkers();
    clearSelectedRunEndpoints();
    resetSelectedPhotoState();

    if (selectedRunId !== runId) {
      selectedRunPhotosExpanded = false;
    }

    selectedRunId = runId;

    applySelectionStyles();
    renderSidebar();
    renderSelectedRunPanel();
    renderSelectedRunDirection(run);
    renderSelectedRunEndpoints(run);
    renderSelectedPhotoMarkers(run);
  }

  function clearSelection() {
    closePhotoLightbox();
    clearSelectionState();
    applySelectionStyles();
    renderSidebar();
    renderSelectedRunPanel();
  }

  function clearSelectionState() {
    closePhotoLightbox();
    closeMapPopup();
    clearSelectedPhotoMarkers();
    clearSelectedRunDirection();
    clearSelectedRunEndpoints();
    resetSelectedPhotoState();
    selectedRunId = null;
    selectedRunPhotosExpanded = false;
  }

  function closeMapPopup() {
    if (map) {
      map.closePopup();
    }
  }

  function clearSelectionIfFilteredOut(filteredRuns) {
    var filteredRunIds;

    if (!selectedRunId) {
      return;
    }

    filteredRunIds = getFilteredRunIds(filteredRuns);
    if (!filteredRunIds[selectedRunId]) {
      closePhotoLightbox();
      clearSelectionState();
      renderSelectedRunPanel();
    }
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

    updateAllRunStartMarkersStyle();
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

  function setRunLayerVisible(runId, visible) {
    var trackLayer = runLayers[runId];

    if (trackLayer) {
      if (visible) {
        trackLayer.addTo(map);
      } else {
        trackLayer.removeFrom(map);
      }
    }
  }

  function syncMapToFilteredRuns(filteredRuns) {
    var visibleRunIds = getFilteredRunIds(filteredRuns);

    allRuns.forEach(function (run) {
      setRunLayerVisible(run.id, Boolean(visibleRunIds[run.id]));
    });

    updateAllRunStartMarkersStyle();
  }

  function renderSelectedRunPanel() {
    var panel = document.getElementById("selected-run-panel");
    var run = findRunById(selectedRunId);

    if (!panel) {
      return;
    }

    panel.innerHTML = "";
    selectedPhotoThumbsById = {};

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
    var downloadGpxButton = document.createElement("button");
    var centerButton = document.createElement("button");
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
    content.appendChild(renderElevationProfile(run));
    appendSelectedRunGallery(content, run);

    actions.className = "selection-actions";

    downloadGpxButton.type = "button";
    downloadGpxButton.textContent = "T\u00e9l\u00e9chargement GPX";
    downloadGpxButton.disabled = !hasDownloadableTrack(run);
    if (downloadGpxButton.disabled) {
      downloadGpxButton.title = "Aucune trace disponible pour cette course.";
    }
    downloadGpxButton.addEventListener("click", function () {
      downloadRunGpx(run);
    });

    centerButton.type = "button";
    centerButton.textContent = "Centrer";
    centerButton.addEventListener("click", function () {
      selectAndCenterRun(run.id);
    });

    clearButton.type = "button";
    clearButton.textContent = "Effacer s\u00e9lection";
    clearButton.addEventListener("click", clearSelection);

    actions.appendChild(downloadGpxButton);
    actions.appendChild(centerButton);
    actions.appendChild(clearButton);
    content.appendChild(actions);

    return content;
  }

  function appendSelectedRunGallery(content, run) {
    var photos = run.photos || [];
    var maxPhotos = getPositiveIntegerConfig(config.photos.maxPhotosInPanel);
    var visiblePhotoCount;
    var gallery;
    var heading;
    var list;
    var toggleButton;

    if (!arePhotosEnabled() || !config.photos.showPhotoGallery || photos.length === 0) {
      return;
    }

    visiblePhotoCount = selectedRunPhotosExpanded || maxPhotos === null ? photos.length : Math.min(photos.length, maxPhotos);

    gallery = document.createElement("section");
    gallery.className = "selected-photo-gallery";

    heading = document.createElement("h3");
    heading.textContent = "Photos";
    gallery.appendChild(heading);

    list = document.createElement("div");
    list.className = "photo-gallery-grid";

    photos.slice(0, visiblePhotoCount).forEach(function (photo, index) {
      list.appendChild(createPhotoThumbnailButton(photo, getPhotoId(run, index)));
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
        toggleButton.textContent = "+" + (photos.length - visiblePhotoCount) + " photos";
        toggleButton.addEventListener("click", function () {
          selectedRunPhotosExpanded = true;
          renderSelectedRunPanel();
        });
      }

      gallery.appendChild(toggleButton);
    }

    content.appendChild(gallery);
  }

  function createPhotoThumbnailButton(photo, photoId) {
    var button = document.createElement("button");
    var image = document.createElement("img");

    button.type = "button";
    button.className = "photo-thumb-button";
    if (!hasPhotoCoordinates(photo)) {
      button.className += " photo-thumb-button--no-gps";
    }
    if (photoId === activePhotoId) {
      button.className += " is-active";
    }
    button.title = photo.caption || photo.source || "Photo";
    button.addEventListener("click", function () {
      window.clearTimeout(photoThumbClickTimer);
      photoThumbClickTimer = window.setTimeout(function () {
        selectPhotoFromThumb(photo, photoId);
        photoThumbClickTimer = null;
      }, 180);
    });
    button.addEventListener("dblclick", function (event) {
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(photoThumbClickTimer);
      photoThumbClickTimer = null;
      openPhotoLightbox(photoId);
    });
    selectedPhotoThumbsById[photoId] = button;

    image.src = getPhotoUrl(photo, "thumb");
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

  function renderElevationProfile(run) {
    var section = document.createElement("section");
    var heading = document.createElement("h3");
    var series = buildElevationProfileSeries(run);

    section.className = "elevation-profile";
    section.style.setProperty("--run-color", run.color || config.selection.selectedColor || config.map.accent || "#176f75");

    heading.textContent = "Profil altim\u00e9trique";
    section.appendChild(heading);

    if (!series) {
      var emptyMessage = document.createElement("p");
      emptyMessage.className = "elevation-profile__empty";
      emptyMessage.textContent = "Profil altim\u00e9trique indisponible";
      section.appendChild(emptyMessage);
      return section;
    }

    section.appendChild(createElevationProfileChart(run, series));
    return section;
  }

  function buildElevationProfileSeries(run) {
    var coordinates = getRunTrackCoordinates(run);
    var series = [];
    var previousPoint = null;
    var distanceKm = 0;

    coordinates.forEach(function (point) {
      var longitude = point[0];
      var latitude = point[1];
      var elevation = point[2];

      if (!isFiniteNumber(longitude) || !isFiniteNumber(latitude) || !isFiniteNumber(elevation)) {
        return;
      }

      if (previousPoint) {
        distanceKm += haversineDistanceKm(previousPoint[0], previousPoint[1], longitude, latitude);
      }

      series.push({
        distanceKm: distanceKm,
        elevationM: elevation
      });
      previousPoint = point;
    });

    if (series.length < 2 || distanceKm <= 0) {
      return null;
    }

    return series;
  }

  function createElevationProfileChart(run, series) {
    var width = 320;
    var height = 150;
    var padding = {
      top: 16,
      right: 12,
      bottom: 24,
      left: 48
    };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var minElevation = getMinElevation(series);
    var maxElevation = getMaxElevation(series);
    var originalMinElevation = minElevation;
    var originalMaxElevation = maxElevation;
    var totalDistanceKm = series[series.length - 1].distanceKm;
    var displayDistanceKm = isFiniteNumber(run.distanceKm) && run.distanceKm > 0 ? run.distanceKm : totalDistanceKm;
    var elevationRange = maxElevation - minElevation;
    var svg = createSvgElement("svg");
    var axisGroup = createSvgElement("g");
    var frame = createSvgElement("rect");
    var area = createSvgElement("path");
    var line = createSvgElement("path");
    var labels = document.createElement("div");
    var startLabel = document.createElement("span");
    var endLabel = document.createElement("span");
    var chart = document.createElement("div");
    var pointsPath;
    var areaPath;

    if (elevationRange === 0) {
      minElevation -= 5;
      maxElevation += 5;
      elevationRange = maxElevation - minElevation;
    }

    function pointToX(point) {
      return padding.left + (point.distanceKm / totalDistanceKm) * chartWidth;
    }

    function pointToY(point) {
      return padding.top + ((maxElevation - point.elevationM) / elevationRange) * chartHeight;
    }

    pointsPath = series.map(function (point, index) {
      return (index === 0 ? "M " : "L ") + formatSvgNumber(pointToX(point)) + " " + formatSvgNumber(pointToY(point));
    }).join(" ");

    areaPath = pointsPath +
      " L " + formatSvgNumber(padding.left + chartWidth) + " " + formatSvgNumber(padding.top + chartHeight) +
      " L " + formatSvgNumber(padding.left) + " " + formatSvgNumber(padding.top + chartHeight) +
      " Z";

    chart.className = "elevation-profile__chart";

    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Profil altim\u00e9trique du parcours");
    svg.setAttribute("preserveAspectRatio", "none");

    axisGroup.setAttribute("class", "elevation-profile__axis");
    frame.setAttribute("x", formatSvgNumber(padding.left));
    frame.setAttribute("y", formatSvgNumber(padding.top));
    frame.setAttribute("width", formatSvgNumber(chartWidth));
    frame.setAttribute("height", formatSvgNumber(chartHeight));
    axisGroup.appendChild(frame);
    axisGroup.appendChild(createSvgText(
      padding.left - 8,
      padding.top + 4,
      Math.round(originalMaxElevation) + " m",
      "elevation-profile__axis-label elevation-profile__axis-label--max"
    ));
    axisGroup.appendChild(createSvgText(
      padding.left - 8,
      padding.top + chartHeight,
      Math.round(originalMinElevation) + " m",
      "elevation-profile__axis-label elevation-profile__axis-label--min"
    ));

    area.setAttribute("class", "elevation-profile__area");
    area.setAttribute("d", areaPath);

    line.setAttribute("class", "elevation-profile__line");
    line.setAttribute("d", pointsPath);

    svg.appendChild(area);
    svg.appendChild(axisGroup);
    svg.appendChild(line);
    chart.appendChild(svg);

    labels.className = "elevation-profile__labels";
    startLabel.textContent = "0 km";
    endLabel.textContent = formatDistance(displayDistanceKm);
    labels.appendChild(startLabel);
    labels.appendChild(endLabel);
    chart.appendChild(labels);

    return chart;
  }

  function createSvgElement(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  function createSvgText(x, y, text, className) {
    var label = createSvgElement("text");

    label.setAttribute("x", formatSvgNumber(x));
    label.setAttribute("y", formatSvgNumber(y));
    label.setAttribute("class", className);
    label.textContent = text;

    return label;
  }

  function getMinElevation(series) {
    return series.reduce(function (min, point) {
      return Math.min(min, point.elevationM);
    }, series[0].elevationM);
  }

  function getMaxElevation(series) {
    return series.reduce(function (max, point) {
      return Math.max(max, point.elevationM);
    }, series[0].elevationM);
  }

  function haversineDistanceKm(lon1, lat1, lon2, lat2) {
    var earthRadiusKm = 6371.0088;
    var lat1Rad = degreesToRadians(lat1);
    var lat2Rad = degreesToRadians(lat2);
    var deltaLat = degreesToRadians(lat2 - lat1);
    var deltaLon = degreesToRadians(lon2 - lon1);
    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  function degreesToRadians(value) {
    return value * Math.PI / 180;
  }

  function formatSvgNumber(value) {
    return Number(value).toFixed(2).replace(/\.?0+$/g, "");
  }

  function hasDownloadableTrack(run) {
    return getRunTrackCoordinates(run).length > 0;
  }

  function downloadRunGpx(run) {
    var gpx = createRunGpx(run);
    var urlApi = window.URL || window.webkitURL;
    var blob;
    var url;
    var link;

    if (!gpx || !urlApi) {
      return;
    }

    blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
    url = urlApi.createObjectURL(blob);
    link = document.createElement("a");
    link.href = url;
    link.download = getRunGpxFilename(run);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      urlApi.revokeObjectURL(url);
    }, 0);
  }

  function createRunGpx(run) {
    var coordinates = getRunTrackCoordinates(run);
    var lines;

    if (coordinates.length === 0) {
      return "";
    }

    lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="RunningMap" xmlns="http://www.topografix.com/GPX/1/1">',
      "  <metadata>",
      "    <name>" + escapeXml(run.title || run.id || "Trace RunningMap") + "</name>",
      "  </metadata>",
      "  <trk>",
      "    <name>" + escapeXml(run.title || run.id || "Trace RunningMap") + "</name>",
      "    <trkseg>"
    ];

    coordinates.forEach(function (point) {
      var line = '      <trkpt lat="' + formatGpxNumber(point[1], 7) + '" lon="' + formatGpxNumber(point[0], 7) + '">';

      if (isFiniteNumber(point[2])) {
        line += "<ele>" + formatGpxNumber(point[2], 1) + "</ele>";
      }

      line += "</trkpt>";
      lines.push(line);
    });

    lines.push(
      "    </trkseg>",
      "  </trk>",
      "</gpx>"
    );

    return lines.join("\n") + "\n";
  }

  function getRunTrackCoordinates(run) {
    var track = run && run.track;
    var coordinates;

    if (!track && run && run.trackRef && window.GENERATED_TRACKS) {
      track = window.GENERATED_TRACKS[run.trackRef];
    }

    if (!track && run && run.id && window.GENERATED_TRACKS) {
      track = window.GENERATED_TRACKS[run.id];
    }

    if (!track || !track.geometry || track.geometry.type !== "LineString") {
      return [];
    }

    coordinates = track.geometry.coordinates;

    if (!Array.isArray(coordinates)) {
      return [];
    }

    return coordinates.filter(function (point) {
      return Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1]);
    });
  }

  function getRunGpxFilename(run) {
    var filename = String(run.id || run.title || "trace-runningmap")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return (filename || "trace-runningmap") + ".gpx";
  }

  function formatGpxNumber(value, precision) {
    return Number(value).toFixed(precision).replace(/\.?0+$/g, "");
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
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

    selectedPhotoMarkersById = {};
  }

  function renderSelectedRunEndpoints(run) {
    clearSelectedRunEndpoints();

    if (!run) {
      return;
    }

    selectedRunEndpointLayer = createRunEndpointLayer(run);
    selectedRunEndpointLayer.addTo(map);
  }

  function clearSelectedRunEndpoints() {
    if (selectedRunEndpointLayer) {
      selectedRunEndpointLayer.removeFrom(map);
      selectedRunEndpointLayer = null;
    }
  }

  function renderSelectedRunDirection(run) {
    clearSelectedRunDirection();

    if (!run) {
      return;
    }

    selectedRunDirectionLayer = createSelectedRunDirectionLayer(run);
    selectedRunDirectionLayer.addTo(map);
  }

  function clearSelectedRunDirection() {
    if (selectedRunDirectionLayer) {
      selectedRunDirectionLayer.removeFrom(map);
      selectedRunDirectionLayer = null;
    }
  }

  function resetSelectedPhotoState() {
    activePhotoId = null;
    selectedPhotoThumbsById = {};
    selectedPhotoMarkersById = {};
  }

  function selectPhotoFromThumb(photo, photoId) {
    var marker = selectedPhotoMarkersById[photoId];

    activatePhotoThumb(photoId);

    if (!hasPhotoCoordinates(photo) || !marker) {
      return;
    }

    map.panTo([photo.lat, photo.lon], { animate: true });
    marker.openPopup();
  }

  function selectPhotoFromMarker(photoId) {
    activePhotoId = photoId;
    ensurePhotoThumbRendered(photoId);
    activatePhotoThumb(photoId);
    scrollPhotoThumbIntoView(photoId);
  }

  function openPhotoLightbox(photoId) {
    var run = findRunById(selectedRunId);
    var index;

    if (!run || !Array.isArray(run.photos) || run.photos.length === 0) {
      return;
    }

    lightboxPhotos = run.photos.slice();
    index = getPhotoIndexById(run, photoId);

    if (index < 0) {
      return;
    }

    isLightboxOpen = true;
    showLightboxPhoto(index);
  }

  function closePhotoLightbox() {
    var lightbox = document.getElementById("photo-lightbox");
    var image = lightbox ? lightbox.querySelector(".photo-lightbox__image") : null;
    var runTitle = lightbox ? lightbox.querySelector(".photo-lightbox__run-title") : null;

    if (photoThumbClickTimer) {
      window.clearTimeout(photoThumbClickTimer);
      photoThumbClickTimer = null;
    }

    if (!isLightboxOpen && !lightbox) {
      return;
    }

    isLightboxOpen = false;
    lightboxPhotoIndex = -1;
    lightboxPhotos = [];

    if (image) {
      image.removeAttribute("src");
      image.alt = "";
    }
    if (runTitle) {
      runTitle.textContent = "";
    }

    if (lightbox) {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
    }
  }

  function showLightboxPhoto(index) {
    var lightbox = document.getElementById("photo-lightbox");
    var image = lightbox ? lightbox.querySelector(".photo-lightbox__image") : null;
    var caption = lightbox ? lightbox.querySelector(".photo-lightbox__caption") : null;
    var runTitle = lightbox ? lightbox.querySelector(".photo-lightbox__run-title") : null;
    var run = findRunById(selectedRunId);
    var photo;
    var imagePath;
    var captionText;

    if (!lightbox || !image || index < 0 || index >= lightboxPhotos.length) {
      return;
    }

    photo = lightboxPhotos[index];
    imagePath = getPhotoUrl(photo, "full");

    if (!imagePath) {
      return;
    }

    captionText = getPhotoCaption(photo);
    lightboxPhotoIndex = index;
    image.src = imagePath;
    image.alt = captionText;

    if (caption) {
      caption.textContent = captionText;
    }
    if (runTitle) {
      renderLightboxRunTitle(runTitle, run, captionText);
    }

    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    updateLightboxControls();
    syncMapToLightboxPhoto(index);
  }

  function renderLightboxRunTitle(element, run, photoCaption) {
    var runTitleParts = [];
    var lines = [];

    element.innerHTML = "";

    if (run && run.title) {
      runTitleParts.push(run.title);
    }
    if (run && run.date) {
      runTitleParts.push(formatDate(run.date));
    }
    if (runTitleParts.length > 0) {
      lines.push(runTitleParts.join(" - "));
    }
    if (photoCaption) {
      lines.push(photoCaption);
    }

    lines.forEach(function (line) {
      var lineElement = document.createElement("span");
      lineElement.textContent = line;
      element.appendChild(lineElement);
    });
  }

  function syncMapToLightboxPhoto(index) {
    var run = findRunById(selectedRunId);
    var photo;
    var photoId;
    var marker;

    if (!run || !Array.isArray(run.photos) || index < 0 || index >= run.photos.length) {
      closeMapPopup();
      return;
    }

    photo = run.photos[index];
    photoId = getPhotoId(run, index);

    ensurePhotoThumbRendered(photoId);
    activatePhotoThumb(photoId);
    scrollPhotoThumbIntoView(photoId);

    marker = selectedPhotoMarkersById[photoId];

    if (!hasPhotoCoordinates(photo) || !marker) {
      closeMapPopup();
      return;
    }

    marker.openPopup();
  }

  function showPreviousLightboxPhoto() {
    if (!isLightboxOpen || lightboxPhotoIndex <= 0) {
      return;
    }

    showLightboxPhoto(lightboxPhotoIndex - 1);
  }

  function showNextLightboxPhoto() {
    if (!isLightboxOpen || lightboxPhotoIndex >= lightboxPhotos.length - 1) {
      return;
    }

    showLightboxPhoto(lightboxPhotoIndex + 1);
  }

  function updateLightboxControls() {
    var lightbox = document.getElementById("photo-lightbox");
    var prevButton = lightbox ? lightbox.querySelector(".photo-lightbox__button--prev") : null;
    var nextButton = lightbox ? lightbox.querySelector(".photo-lightbox__button--next") : null;

    if (prevButton) {
      prevButton.disabled = lightboxPhotoIndex <= 0;
    }
    if (nextButton) {
      nextButton.disabled = lightboxPhotoIndex >= lightboxPhotos.length - 1;
    }
  }

  function handlePhotoLightboxKeydown(event) {
    if (!isLightboxOpen) {
      return;
    }

    if (event.key === "Escape") {
      closePhotoLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousLightboxPhoto();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextLightboxPhoto();
    }
  }

  function getPhotoUrl(photo, variant) {
    var imagePath = getPhotoImagePath(photo, variant);
    var baseUrl = getPhotoBaseUrl();

    if (!imagePath || !baseUrl || isAbsolutePhotoUrl(imagePath)) {
      return imagePath;
    }

    return joinPhotoUrl(baseUrl, imagePath);
  }

  function getPhotoBaseUrl() {
    return String(config.PHOTO_BASE_URL || "").trim();
  }

  function getPhotoImagePath(photo, variant) {
    if (!photo) {
      return "";
    }

    if (variant === "thumb") {
      return photo.thumb || photo.web || photo.full || photo.url || photo.href || photo.src || "";
    }

    if (variant === "full") {
      return photo.full || photo.web || photo.url || photo.href || photo.src || photo.thumb || "";
    }

    return photo.web || photo.thumb || photo.full || photo.url || photo.href || photo.src || "";
  }

  function joinPhotoUrl(baseUrl, imagePath) {
    var normalizedBase = baseUrl.replace(/\/+$/, "");
    var normalizedPath = String(imagePath).replace(/^\.?\//, "");

    return normalizedBase + "/" + normalizedPath;
  }

  function isAbsolutePhotoUrl(imagePath) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(imagePath);
  }

  function getPhotoCaption(photo) {
    return photo.caption || photo.source || "Photo";
  }

  function ensurePhotoThumbRendered(photoId) {
    var run = findRunById(selectedRunId);
    var maxPhotos = getPositiveIntegerConfig(config.photos.maxPhotosInPanel);
    var photoIndex;

    if (selectedPhotoThumbsById[photoId] || selectedRunPhotosExpanded || maxPhotos === null || !run) {
      return;
    }

    photoIndex = getPhotoIndexById(run, photoId);

    if (photoIndex >= maxPhotos) {
      selectedRunPhotosExpanded = true;
      renderSelectedRunPanel();
    }
  }

  function activatePhotoThumb(photoId) {
    activePhotoId = photoId;

    Object.keys(selectedPhotoThumbsById).forEach(function (id) {
      selectedPhotoThumbsById[id].classList.toggle("is-active", id === photoId);
    });
  }

  function scrollPhotoThumbIntoView(photoId) {
    var thumb = selectedPhotoThumbsById[photoId];

    if (!thumb || isRightPanelCollapsed || typeof thumb.scrollIntoView !== "function") {
      return;
    }

    thumb.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function getPhotoId(run, index) {
    return run.id + "::photo-" + index;
  }

  function getPhotoIndexById(run, photoId) {
    var photos = run.photos || [];
    var foundIndex = -1;

    photos.forEach(function (photo, index) {
      if (getPhotoId(run, index) === photoId) {
        foundIndex = index;
      }
    });

    return foundIndex;
  }

  function hasPhotoCoordinates(photo) {
    return isFiniteNumber(photo.lat) && isFiniteNumber(photo.lon);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function fitMapToVisibleRuns() {
    var bounds = L.latLngBounds();
    var hasVisibleRun = false;
    var visibleRunIds = getFilteredRunIds();

    allRuns.forEach(function (run) {
      var layer = runLayers[run.id];
      if (visibleRunIds[run.id] && layer) {
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

  function createPhotoPopup(photo, photoId) {
    var caption = photo.caption || photo.source || "Photo";
    var webPath = getPhotoUrl(photo, "display");
    var popupClass = "photo-popup photo-popup--" + getPhotoOrientation(photo);

    return [
      '<div class="' + popupClass + '">',
      '<img class="photo-popup__image" src="' + escapeHtml(webPath) + '" alt="' + escapeHtml(caption) + '">',
      "<p>" + escapeHtml(caption) + "</p>",
      '<button class="photo-popup__lightbox-button" type="button" data-photo-lightbox-id="' + escapeHtml(photoId) + '">Voir en grand</button>',
      "</div>"
    ].join("");
  }

  function handlePhotoPopupLightboxClick(event) {
    var target = event.target;

    if (!target || !target.classList || !target.classList.contains("photo-popup__lightbox-button")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openPhotoLightbox(target.getAttribute("data-photo-lightbox-id"));
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

  function applySiteHeader() {
    var heading = document.querySelector(".sidebar-header h1");
    var subtitle = document.querySelector(".sidebar-header p");

    document.title = config.siteTitle;

    if (heading) {
      heading.textContent = config.siteTitle;
    }

    if (subtitle) {
      subtitle.textContent = config.siteSubtitle;
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
    selectRun: selectRun
  };
})();
