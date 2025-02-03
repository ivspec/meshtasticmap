/* ===================== GLOBAL CONSTANTS & VARIABLES ===================== */
// Mapbox access token & style
const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1Ijoic3BlYzUiLCJhIjoiY201aDg5M25mMGhtMjJxcHIzNXI2anhmdSJ9.GM8euMyGXDLcj0579AZZsg";
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
let currentStyle = "mapbox://styles/mapbox/dark-v11";

// DOM Elements
const coordinatesEl = document.getElementById("coordinates");
const menu = document.querySelector(".menu");
const toggleButton = document.querySelector(".toggle-button");
const styleToggleButton = document.querySelector(".style-toggle");
const elevationToggle = document.getElementById("elevationToggle");
const terrainToggle = document.getElementById("designModeToggle");
const connectivityRangeToggle = document.getElementById("connectivityToggle");
const connectivityToggleButton = document.querySelector(".connectivity-toggle");

// Global variables for markers, connectivity, and custom layers
let activeMarkers = [],
  activeConnectivityMarkers = [],
  customLayers = [],
  customSources = {},
  points = [],
  sources = {},
  connectivityEnabled = false;

// Measurement variables
let measureActive = false,
  measurePoints = [],
  measureMarkers = [];
const measureLayerId = "measurement-line",
  measureSourceId = "measurement-source",
  tempLineLayerId = "temp-measurement-line",
  tempLineSourceId = "temp-measurement-source";

// Ranges (in meters) for different node types
const RANGES = {
  "node-small": 6437.38,
  "node-medium": 16093.44,
  "node-large": 32186.88,
};

/* ===================== INITIALIZE THE MAP ===================== */
const map = new mapboxgl.Map({
  container: "map",
  style: currentStyle,
  center: [-97.7431, 30.2672],
  zoom: 11,
});

map.on("style.load", () => {
  console.log("Style loaded:", map.getStyle().name, currentStyle);
});
map.on("error", (e) => console.error("Mapbox error:", e.error));

// Set menu theme based on style
if (currentStyle === "mapbox://styles/mapbox/dark-v11")
  menu.classList.add("terrain");
else menu.classList.add("design");

/* ===================== MEASUREMENT FUNCTIONS ===================== */
function addMeasurePoint(e) {
  if (!measureActive) return;
  const lngLat = [e.lngLat.lng, e.lngLat.lat];
  measurePoints.push(lngLat);
  const marker = new mapboxgl.Marker({ color: "red" })
    .setLngLat(lngLat)
    .addTo(map);
  measureMarkers.push(marker);
  updateMeasurementLine(measurePoints);
}

function updateMeasurementLine(coords) {
  if (map.getSource(measureSourceId)) {
    map.getSource(measureSourceId).setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
    });
  } else {
    map.addSource(measureSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
      },
    });
    map.addLayer({
      id: measureLayerId,
      type: "line",
      source: measureSourceId,
      paint: {
        "line-color": "#FF5733",
        "line-width": 2,
      },
    });
  }
  if (coords.length > 1) {
    const totalDistance = calculateTotalDistance(coords);
    document.getElementById(
      "measurement-result"
    ).textContent = `Total Distance: ${totalDistance.toFixed(2)} miles`;
  }
}

function updateTemporaryLine(e) {
  if (!measureActive || measurePoints.length === 0) return;
  const lastPoint = measurePoints[measurePoints.length - 1];
  const cursorPoint = [e.lngLat.lng, e.lngLat.lat];
  if (map.getSource(tempLineSourceId)) {
    map.getSource(tempLineSourceId).setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [lastPoint, cursorPoint],
      },
    });
  } else {
    map.addSource(tempLineSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [lastPoint, cursorPoint],
        },
      },
    });
    map.addLayer({
      id: tempLineLayerId,
      type: "line",
      source: tempLineSourceId,
      paint: {
        "line-color": "#FF5733",
        "line-width": 2,
        "line-dasharray": [5, 5],
      },
    });
  }
}

function calculateTotalDistance(coords) {
  let totalDistance = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalDistance += calculateDistance(coords[i], coords[i + 1]);
  }
  return totalDistance / 1609.34; // convert meters to miles
}

function resetMeasurement() {
  measurePoints = [];
  measureActive = false;
  map.getCanvas().style.cursor = "";
  map.off("click", addMeasurePoint);
  map.off("mousemove", updateTemporaryLine);
  measureMarkers.forEach((marker) => marker.remove());
  measureMarkers = [];
  if (map.getLayer(measureLayerId)) {
    map.removeLayer(measureLayerId);
    map.removeSource(measureSourceId);
  }
  if (map.getLayer(tempLineLayerId)) {
    map.removeLayer(tempLineLayerId);
    map.removeSource(tempLineSourceId);
  }
  document.getElementById("measurement-result").textContent = "";
}

// Haversine Formula for distance between two coordinates
function calculateDistance(coord1, coord2) {
  const R = 6371e3;
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const deltaLng = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ===================== CUSTOM LAYER & CONNECTIVITY FUNCTIONS ===================== */
function storeCustomElements() {
  customLayers = [];
  customSources = {};
  const style = map.getStyle();
  style.layers.forEach((layer) => {
    if (
      layer.id.startsWith("hover-") ||
      layer.id.startsWith("connectivity-") ||
      layer.id.startsWith("circle-") ||
      layer.id.startsWith("line-") ||
      layer.id === "hillshade-layer"
    ) {
      customLayers.push(layer);
      const src = layer.source;
      if (src && style.sources[src]) customSources[src] = style.sources[src];
    }
  });
  console.log(customLayers);
}

function restoreCustomElements() {
  map.once("style.load", () => {
    const wasConnectivityEnabled = connectivityEnabled;
    if (wasConnectivityEnabled) hideConnectivityCircles();
    Object.entries(customSources).forEach(([id, src]) => {
      if (!map.getSource(id)) map.addSource(id, src);
    });
    customLayers.forEach((layer) => {
      if (!map.getLayer(layer.id)) {
        if (
          layer.id.startsWith("hover-") ||
          layer.id.startsWith("circle-") ||
          layer.id.startsWith("connectivity-")
        )
          map.addLayer({
            ...layer,
            paint: {
              "circle-color": layer.paint["circle-color"],
              "circle-opacity": layer.paint["circle-opacity"],
              "circle-radius": layer.paint["circle-radius"],
            },
          });
        else if (layer.id.startsWith("line-"))
          map.addLayer({
            ...layer,
            paint: {
              "line-color": layer.paint["line-color"] || "#FF5733",
              "line-width": layer.paint["line-width"] || 2,
            },
          });
      }
    });
    if (document.getElementById("elevationToggle").checked)
      showElevationLayer();
    updateLines();
    if (wasConnectivityEnabled)
      setTimeout(() => {
        showConnectivityCircles();
        document.getElementById("connectivityToggle").checked = true;
      }, 100);
    if (activeConnectivityMarkers.length > 0) {
      activeConnectivityMarkers.forEach((index) => {
        const point = points[index];
        if (point) {
          const circleId = `connectivity-circle-${index}`;
          const radiusInPixels = calculateRadiusInPixels(
            point.coords[1],
            map.getZoom(),
            point.type
          );
          if (!map.getSource(circleId)) {
            map.addSource(circleId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: point.coords },
              },
            });
            map.addLayer({
              id: circleId,
              type: "circle",
              source: circleId,
              paint: {
                "circle-radius": radiusInPixels,
                "circle-color": "#04FF85",
                "circle-opacity": 0.2,
              },
            });
          }
        }
      });
    }
  });
}

function calculateRadiusInPixels(lat, zoom, type) {
  const earthCirc = 40075017;
  const mPerPixel =
    (earthCirc * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  const ranges = {
    "node-small": 6437.38,
    "node-medium": 16093.44,
    "node-large": 32186.88,
  };
  return (ranges[type] || ranges["node-small"]) / mPerPixel;
}

function updateLines() {
  const existingLines = map
    .getStyle()
    .layers.filter((layer) => layer.id.startsWith("line-"));
  existingLines.forEach((line) => {
    if (map.getLayer(line.id)) map.removeLayer(line.id);
    if (map.getSource(line.id)) map.removeSource(line.id);
  });
  const ranges = {
    "node-small": 3218.69,
    "node-medium": 8046.72,
    "node-large": 16093.44,
  };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = calculateDistance(points[i].coords, points[j].coords),
        maxRange = Math.max(ranges[points[i].type], ranges[points[j].type]);
      if (distance <= maxRange) {
        const lineId = `line-${i}-${j}`;
        map.addSource(lineId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [points[i].coords, points[j].coords],
            },
          },
        });
        map.addLayer({
          id: lineId,
          type: "line",
          source: lineId,
          paint: {
            "line-opacity": 1,
            "line-width": 2,
            "line-color": "#FF5733",
          },
        });
      }
    }
  }
}

/* ===================== MARKER & HOVER EFFECT FUNCTIONS ===================== */
function getNodeType(el) {
  return Array.from(el.classList).find((cls) =>
    ["node-small", "node-medium", "node-large"].includes(cls)
  );
}

function calculateHoverRadius(meters, lat, zoom) {
  const earthCirc = 40075017;
  const mPerPixel =
    (earthCirc * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / mPerPixel;
}

function restoreLineLayers(lines) {
  lines.forEach((line) => {
    map.addLayer({
      id: line.id,
      type: "line",
      source: line.source,
      paint: {
        "line-opacity": 1,
        "line-width": 2,
        "line-color": "#FF5733",
      },
    });
  });
}

function toggleEffects(marker, markerEl, circleIds) {
  let clicked = markerEl.isClicked;
  if (connectivityEnabled) clicked = true;
  clicked
    ? createHoverCircle(marker, markerEl, circleIds)
    : hideEffects(markerEl, circleIds);
}

function setClicked(markerEl) {
  if (connectivityEnabled) return;
  markerEl.isClicked = !markerEl.isClicked;
}

function addMarkerHoverEffect(marker) {
  const markerEl = marker.getElement();
  const circleIds = { hoverCircleId: null };
  let zoomTimeout;
  map.on("zoom", () => {
    if (zoomTimeout) window.cancelAnimationFrame(zoomTimeout);
    zoomTimeout = window.requestAnimationFrame(() =>
      updateEffectsOnZoom(marker, circleIds)
    );
  });
  markerEl.addEventListener("click", () => {
    setClicked(markerEl);
    toggleEffects(marker, markerEl, circleIds);
  });
  markerEl.addEventListener("mouseenter", () => {
    if (connectivityEnabled) return;
    if (!markerEl.isClicked) createHoverCircle(marker, markerEl, circleIds);
    markerEl.style.cursor = "pointer";
  });
  markerEl.addEventListener("mouseleave", () => {
    if (connectivityEnabled) return;
    if (!markerEl.isClicked) hideEffects(markerEl, circleIds);
    markerEl.style.cursor = "";
  });
  marker.on("dragstart", () => {
    if (connectivityEnabled) return;
    let prev = !markerEl.isClicked;
    hideEffects(markerEl, circleIds);
    markerEl.isClicked = prev;
  });
  marker.on("dragend", () => {
    if (connectivityEnabled) return;
    if (markerEl.isClicked) createHoverCircle(marker, markerEl, circleIds);
  });
}

/* ===================== MARKER CREATION & DRAG/DROP ===================== */
function handleMarkerDrop(e) {
  e.preventDefault();
  const markerType = e.dataTransfer.getData("markerType");
  const { lng, lat } = map.unproject([e.clientX, e.clientY]);
  const el = createMarkerElement(markerType);
  const markerId = `marker-${generateUUID()}`;
  el.dataset.markerId = markerId;
  el.id = markerId;
  const marker = new mapboxgl.Marker({ element: el, draggable: true })
    .setLngLat([lng, lat])
    .addTo(map);
  attachMarkerEvents(marker, el);
  activeMarkers.push(marker);
  points.push({ coords: [lng, lat], type: markerType });
  sources[markerId] = points.length - 1;
  addMarkerHoverEffect(marker);
  refreshConnectivity();
}

function createMarkerElement(markerType) {
  const el = document.createElement("div");
  el.className = `map-marker ${markerType}`;
  el.addEventListener("wheel", (e) => e.stopPropagation(), true);
  el.addEventListener("mouseenter", () => el.classList.add("enlarged"));
  el.addEventListener("mouseleave", () => {
    if (!el.classList.contains("dragging")) el.classList.remove("enlarged");
  });
  return el;
}

function attachMarkerEvents(marker, el) {
  marker.on("dragstart", () => {
    el.classList.add("dragging", "enlarged");
  });
  marker.on("dragend", () => {
    el.classList.remove("dragging", "enlarged");
    const pos = marker.getLngLat();
    const index = sources[el.dataset.markerId];
    points[index].coords = [pos.lng, pos.lat];
    refreshConnectivity();
  });
}

function toggleConnectivity() {
  connectivityEnabled = !connectivityEnabled;
  connectivityToggleButton.textContent = connectivityEnabled
    ? "Disable Connectivity Range"
    : "Connectivity Range";
  refreshConnectivity();
}

function refreshConnectivity() {
  connectivityEnabled
    ? (hideConnectivityCircles(), showConnectivityCircles())
    : hideConnectivityCircles();
  updateLines();
}

function showConnectivityCircles() {
  const circleIds = { hoverCircleId: null };
  connectivityEnabled = true;
  activeMarkers.forEach((marker) =>
    toggleEffects(marker, marker.getElement(), circleIds)
  );
}

function hideConnectivityCircles() {
  const circleIds = { hoverCircleId: null };
  connectivityEnabled = false;
  activeMarkers.forEach((marker) =>
    toggleEffects(marker, marker.getElement(), circleIds)
  );
}

/* ===================== UTILITY FUNCTIONS ===================== */
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
    );
  else {
    let dt = new Date().getTime();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

/* ===================== ELEVATION LAYER FUNCTIONS ===================== */
function showElevationLayer() {
  if (!map.getSource("terrain-source")) {
    map.addSource("terrain-source", {
      type: "raster-dem",
      url: "mapbox://mapbox.terrain-rgb",
      tileSize: 512,
      maxzoom: 14,
    });
    map.addLayer({
      id: "hillshade-layer",
      type: "hillshade",
      source: "terrain-source",
      paint: { "hillshade-exaggeration": 0.6 },
    });
  }
  map.setLayoutProperty("hillshade-layer", "visibility", "visible");
}

function hideElevationLayer() {
  if (map.getLayer("hillshade-layer"))
    map.setLayoutProperty("hillshade-layer", "visibility", "none");
}

/* ===================== STYLE & DROPDOWN TOGGLES ===================== */
toggleButton.addEventListener("click", () => {
  menu.classList.toggle("visible");
  toggleButton.classList.toggle("active");
});

styleToggleButton.addEventListener("click", () => {
  storeCustomElements();
  const isDark = currentStyle === "mapbox://styles/mapbox/dark-v11";
  currentStyle = isDark
    ? "mapbox://styles/spec5/cm5lkyjq4007s01qodz7745x5"
    : "mapbox://styles/mapbox/dark-v11";
  styleToggleButton.textContent = isDark ? "Design Mode" : "Terrain Mode";
  map.setStyle(currentStyle);
  restoreCustomElements();
  menu.classList.toggle("terrain", !isDark);
  menu.classList.toggle("design", isDark);
});

elevationToggle.addEventListener("change", () => {
  elevationToggle.checked ? showElevationLayer() : hideElevationLayer();
});

terrainToggle.addEventListener("change", () => {
  storeCustomElements();
  const isTerrain = terrainToggle.checked;
  currentStyle = isTerrain
    ? "mapbox://styles/mapbox/outdoors-v11"
    : "mapbox://styles/mapbox/dark-v11";
  map.setStyle(currentStyle);
  restoreCustomElements();
  menu.classList.toggle("terrain", isTerrain);
  menu.classList.toggle("design", !isTerrain);
});

connectivityRangeToggle.addEventListener("change", () => {
  connectivityEnabled = connectivityRangeToggle.checked;
  if (connectivityEnabled) {
    showConnectivityCircles();
    connectivityRangeToggle.closest(".control-item").classList.add("active");
  } else {
    hideConnectivityCircles();
    connectivityRangeToggle.closest(".control-item").classList.remove("active");
  }
  menu.classList.toggle("connectivity-active", connectivityEnabled);
});

map.getCanvas().addEventListener("dragover", (e) => e.preventDefault());
document.querySelectorAll(".circle").forEach((circle) => {
  circle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("circleType", circle.className);
  });
});
document.querySelectorAll(".marker").forEach((marker) => {
  marker.addEventListener("dragstart", (e) => {
    const shapeClass = Array.from(marker.classList).find((cls) =>
      ["node-small", "node-medium", "node-large"].includes(cls)
    );
    e.dataTransfer.setData("markerType", shapeClass);
  });
});
map.getCanvas().addEventListener("drop", handleMarkerDrop);

/* ===================== PRODUCT MODAL & CAROUSEL ===================== */
const productData = {
  minitrekker: {
    name: "Spec5 MiniTrekker",
    price: "$69.99",
    images: [
      "Icons/ProductImages/MiniTrekker/Frame_3.png",
      "Icons/ProductImages/MiniTrekker/Frame_2_f88a997d-6d97-437e-83da-4240d75afcf9.png",
      "Icons/ProductImages/MiniTrekker/il_794xN.5905115400_qfh8 (1).jpg",
      "Icons/ProductImages/MiniTrekker/il_794xN.5953198465_9k62.jpg",
      "Icons/ProductImages/MiniTrekker/il_794xN_5905115500_aj23_jpg.jpg",
    ],
    description:
      "The Spec5 MiniTrekker is a compact LoRa radio device that delivers powerful off-grid communication capabilities in a pocket-sized form. Its durable PETG case and integrated clip make it easy to carry during hikes or outdoor missions. Designed for simplicity, it provides text messaging and GPS location sharing over a LoRa mesh network. The MiniTrekker is perfect for users who want a lightweight, efficient tool to stay connected without compromising portability or functionality.",
    shopifyId: "spec5-minitrekker",
  },

  spectre: {
    name: "Spec5 Spectre",
    price: "$79.99",
    images: [
      "Icons/ProductImages/spectre/Front.png",
      "Icons/ProductImages/spectre/Front-Right.png",
      "Icons/ProductImages/spectre/Right.png",
      "Icons/ProductImages/spectre/Back-Left.png",
      "Icons/ProductImages/spectre/Back.png",
      "Icons/ProductImages/spectre/Back-Right.png",
      "Icons/ProductImages/spectre/Left.png",
      "Icons/ProductImages/spectre/Front-Left.png",

      "Icons/ProductImages/spectre/Front_75f440ef-2528-401a-9af6-af9c64aef96f.png",
      "Icons/ProductImages/spectre/Front-Right_7c879769-1ae9-4d0e-b818-18c4b1681975.png",
      "Icons/ProductImages/spectre/Left_8c5b3459-3934-4cb7-80e9-030bfc083567.png",
      "Icons/ProductImages/spectre/Back-Left_cd465e05-6331-4a49-9859-e42db0b84382.png",
      "Icons/ProductImages/spectre/Back_a2c2607f-7a62-4e12-b29d-2e504b0574c9.png",
      "Icons/ProductImages/spectre/Back-Right_1997ec07-2371-44a7-8979-6df4d09261d6.png",
      "Icons/ProductImages/spectre/Right_3867a306-c12a-4643-ae7f-1f17c22734c2.png",
      "Icons/ProductImages/spectre/Front-Left_a72340de-d30a-43e6-86a3-93ccffd34a05.png",

      "Icons/ProductImages/spectre/Front_3e0c27cd-66da-4bc6-890a-e7cba52c1e9e.png",
      "Icons/ProductImages/spectre/Front-Right_06154fea-36c8-40bc-9f37-7cf3828a6f2f.png",
      "Icons/ProductImages/spectre/Right_96444966-eb12-4e5a-b84d-255547c536f2.png",
      "Icons/ProductImages/spectre/Back-Left_f71f5549-0cae-4c62-b2c2-aedaed59cb92.png",
      "Icons/ProductImages/spectre/Back_719838b1-c807-4472-ad31-694f2781d036.png",
      "Icons/ProductImages/spectre/Back-Right_3196b03e-7a35-46fc-a53b-e0812be429b1.png",
      "Icons/ProductImages/spectre/Left_7712f3c2-b8b3-4ae6-8ef9-65238a8a2529.png",
      "Icons/ProductImages/spectre/Front-Left_7a3db96d-ea66-47ea-b536-83dec13c6a7a.png",
    ],
    description:
      "The Spec5 Spectre is a versatile LoRa radio designed for secure communication and navigation. Featuring two-way voice communication, it allows real-time interaction with your group over off-grid channels. Its LoRa mesh network ensures reliable text messaging, enabling seamless coordination in remote areas. With an intuitive touch interface and extended battery life of up to 8 hours, the Spectre is a reliable companion for adventurers and network builders seeking advanced connectivity tools.",
    shopifyId: "spec5-spectre",
  },

  meshclip: {
    name: "Spec5 MeshClip",
    price: "$79.99",
    images: [
      "Icons/ProductImages/meshclip/Frame53 (2).png",
      "Icons/ProductImages/meshclip/Frame54.png",
    ],
    description:
      "The Spec5 MeshClip is a portable LoRa device designed for ultimate convenience and mobility. Its compact design includes a steel ring, allowing it to be magnetically attached to the back of your phone for seamless on-the-go communication. The MeshClip operates within a LoRa mesh network, enabling users to send text messages and share GPS locations. Perfect for hikers, campers, and preppers, the MeshClip provides essential connectivity without adding unnecessary bulk.",
    shopifyId: "spec5-meshclip-device",
  },

  trekker: {
    name: "Spec5 Trekker",
    price: "$119.99",
    images: [
      "Icons/ProductImages/trekker/Spec5Green-Trekker-Front (1).png",
      "Icons/ProductImages/trekker/Spec5Green_-_Trekker_-_Back.png",
      "Icons/ProductImages/trekker/Frame_59.png",
      "Icons/ProductImages/trekker/Frame_60.png",
      "Icons/ProductImages/trekker/Frame_57.png",
      "Icons/ProductImages/trekker/Frame_58.png",
      "Icons/ProductImages/trekker/Frame_61.png",
      "Icons/ProductImages/trekker/Frame_62.png",
      "Icons/ProductImages/trekker/Frame_63.png",
      "Icons/ProductImages/trekker/Frame_64.png",
    ],
    description:
      "The Spec5 Trekker is a portable LoRa radio designed for off-grid explorers and communication enthusiasts. It offers GPS location sharing and text messaging through a robust LoRa mesh network, providing reliable connectivity even in areas with no cellular coverage. The Trekker's lightweight design and intuitive interface make it easy to carry and use during outdoor activities. Whether you're coordinating with a team or mapping your journey, the Trekker is a versatile solution for staying connected beyond the grid.",
    shopifyId: "spec5-trekker-device",
  },

  trekkerbravo: {
    name: "Spec5 Trekker BRAVO",
    price: "$119.99",
    images: [
      "Icons/ProductImages/trekker bravo/Frame_35.png",
      "Icons/ProductImages/trekker bravo/Frame_36.png",
      "Icons/ProductImages/trekker bravo/Frame_49_7890065e-7303-44ec-8272-758b1ccef05b.png",
      "Icons/ProductImages/trekker bravo/Frame_50.png",
      "Icons/ProductImages/trekker bravo/Frame_105 (1).png",
      "Icons/ProductImages/trekker bravo/Frame_106.png",
      "Icons/ProductImages/trekker bravo/Frame_107.png",
      "Icons/ProductImages/trekker bravo/Frame_108.png",
      "Icons/ProductImages/trekker bravo/Frame_51_89d6a815-3a3e-4c9a-9968-aef3db2d46c6.png",
      "Icons/ProductImages/trekker bravo/Frame_52.png",
    ],
    description:
      "The Spec5 Trekker BRAVO takes the original Trekker to the next level with upgraded hardware and enhanced capabilities. It delivers reliable LoRa network integration for text messaging and precise GPS location sharing, ensuring effective communication even in the most remote areas. The BRAVO includes a high-gain antenna for extended range and improved signal clarity. With its rugged, lightweight design and advanced connectivity features, it’s the perfect device for adventurers seeking uncompromised performance.",
    shopifyId: "spec5-trekker-bravo",
  },

  trekkerutility: {
    name: "Spec5 Trekker Utility",
    price: "$139.99",
    images: [
      "Icons/ProductImages/trekker utility/Frame_1 (1).png",
      "Icons/ProductImages/trekker utility/IMG_5486.png",
      "Icons/ProductImages/trekker utility/IMG_5478.png",
      "Icons/ProductImages/trekker utility/IMG_5490 (1).png",
      "Icons/ProductImages/trekker utility/IMG_5476.png",
      "Icons/ProductImages/trekker utility/IMG_5455.png",
      "Icons/ProductImages/trekker utility/IMG_5426.png",
    ],
    description:
      "The Spec5 Trekker Utility is a high-performance LoRa radio built for users who demand extended functionality. With its enhanced battery life of up to 16 hours of active use or 48 hours on standby, it’s perfect for longer missions or adventures. The device features built-in environmental sensors that provide real-time temperature, pressure, and humidity data, helping users make informed decisions in the field. It also includes built-in speakers allowing for audible alerts. Its seamless integration with LoRa networks ensures reliable communication and coordination, making it a must-have for outdoor professionals and hobbyists alike.",
    shopifyId: "spec5-trekker-utility",
  },

  beacon: {
    name: "Spec5 Beacon",
    price: "$179.99",
    images: [
      "Icons/ProductImages/beacon/Frame_93.png",
      "Icons/ProductImages/beacon/Frame_94.png",
      "Icons/ProductImages/beacon/Frame_39.png",
      "Icons/ProductImages/beacon/Frame_40_5da501f9-fc51-4a24-9e92-3ab449edf8d4.png",
      "Icons/ProductImages/beacon/Frame_103 (1).png",
      "Icons/ProductImages/beacon/Frame_104 (1).png",
      "Icons/ProductImages/beacon/Frame_95.png",
      "Icons/ProductImages/beacon/Frame_96.png",
    ],
    description:
      "The Spec5 Beacon is a LoRa radio device tailored for extending mesh network coverage in outdoor or remote settings. Its integrated solar panel extends the battery life by 1 to 2 days in optimal sunlight, ensuring consistent operation during extended activities. The Beacon seamlessly integrates into your LoRa network, enabling long-range communication and enhancing connectivity with other devices. Perfect for building or expanding personal networks, it’s a key component for those passionate about off-grid communication systems.",
    shopifyId: "spec5-beacon",
  },

  beaconXL: {
    name: "Spec5 Beacon XL+",
    price: "$189.99",
    images: [
      "Icons/ProductImages/beacon XL+/Frame99 (1).png",
      "Icons/ProductImages/beacon XL+/Frame100 (2).png",
      "Icons/ProductImages/beacon XL+/Frame102 (2).png",
      "Icons/ProductImages/beacon XL+/Frame101 (2).png",
    ],
    description:
      "The Spec5 Beacon XL is a powerhouse LoRa radio designed to extend network coverage across larger areas. Equipped with dual high-efficiency solar panels, it significantly increases battery life, ensuring up to 2 additional days of operation under optimal sunlight conditions. The Beacon XL is perfect for users setting up permanent or semi-permanent nodes in their LoRa networks, offering enhanced range and reliability. Whether for emergency preparedness or outdoor expeditions, the Beacon XL is an essential component for building robust, long-range communication systems.",
    shopifyId: "spec5-beacon-device-xl",
  },

  pulse: {
    name: "Spec5 Pulse Pack",
    price: "$239.99",
    images: [
      "Icons/ProductImages/pulse/APC_0258-2.jpg",
      "Icons/ProductImages/pulse/APC_0234 (1).jpg",
      "Icons/ProductImages/pulse/APC_0236 (1).jpg",
      "Icons/ProductImages/pulse/APC_0249_3729713d-0d5f-4d5d-9d4a-ec524bdc1cfe.jpg",
      "Icons/ProductImages/pulse/APC_0242_af57af54-cfa5-4719-bbd7-3bf11a11b717.jpg",
    ],
    description:
      "The Spec5 Pulse Pack includes two Spec5 Pulses, compact devices designed to provide reliable, off-grid communication through secure LoRa mesh networks. Each device enables two-way voice communication, allowing real-time group interaction without the need for cellular coverage. The Spec5 Pulse also supports text messaging and GPS location sharing, ensuring precise coordination and tracking in remote environments. Its rugged design can endure harsh conditions, and with an 8-hour battery life, it’s built for extended missions. Perfect for adventurers, search-and-rescue operations, and industrial use, the Pulse Pack delivers dependable communication and location-sharing capabilities wherever traditional networks fail.",
    shopifyId: "spec5-pulse",
  },

  ranger: {
    name: "Spec5 Ranger",
    price: "$179.99",
    images: [
      "Icons/ProductImages/ranger/Frame_97 (1).png",
      "Icons/ProductImages/ranger/Frame_98.png",
      "Icons/ProductImages/ranger/Frame_43.png",
      "Icons/ProductImages/ranger/Frame_44.png",
      "Icons/ProductImages/ranger/Frame_7_86c3e183-a5f5-445e-82c5-8f405c3bbb30.png",
      "Icons/ProductImages/ranger/Frame_1_69fb7958-06b0-41f0-b031-b24c4588e0c1.png",
    ],
    description:
      "The Spec5 Ranger combines advanced LoRa communication with user-friendly hardware to meet the needs of outdoor enthusiasts and network builders. Featuring a touchscreen and a navigation ball for precise control, it allows users to manage their LoRa mesh networks with ease. It also comes with a full QWERTY keyboard allowing for use without the need to connect to your phone. Its GPS functionality supports real-time location sharing, and the device enables long-range text communication even in remote environments. The Ranger is ideal for users seeking a powerful, all-in-one device for creating and managing their custom networks.",
    shopifyId: "spec5-ranger-device",
  },

  rangermagnum: {
    name: "Spec5 Ranger Magnum",
    price: "$199.99",
    images: [
      "Icons/ProductImages/ranger magnum/APC_0312.jpg",
      "Icons/ProductImages/ranger magnum/APC_0309-2.jpg",
      "Icons/ProductImages/ranger magnum/APC_0315.jpg",
      "Icons/ProductImages/ranger magnum/APC_0311.jpg",
      "Icons/ProductImages/ranger magnum/APC_0308-2.jpg",
      "Icons/ProductImages/ranger magnum/APC_0316.jpg",
    ],
    description:
      "With double the battery life, the Spec5 Ranger Magnum is built for longer adventures and demanding use. This advanced LoRa communication device combines practical features with ease of use, including a touchscreen and navigation ball for intuitive control of your LoRa mesh networks. The full QWERTY keyboard allows for seamless operation without the need to connect to a phone, while the built-in GPS functionality supports real-time location sharing and long-range text communication, even in remote environments.",
    shopifyId: "spec5-ranger-magnum-2",
  },

  relay: {
    name: "Spec5 Relay",
    price: "$274.99",
    images: [
      "Icons/ProductImages/relay/Frame10_f40010ab-b64d-476e-9cee-2a1733426d25.webp",
      "Icons/ProductImages/relay/il_794xN_5870309442_5fdw_jpg_b66fc76d-6fed-4a39-982d-4c256bd9cbaf.webp",
      "Icons/ProductImages/relay/il_794xN_5870309476_dgjm_jpg_f63af1c4-8181-40a4-b336-06461b129ada.webp",
      "Icons/ProductImages/relay/il_794xN_5870309422_5zo2_jpg_e3d13bc3-11c7-4b6b-bfbd-fea223ca12c0.webp",
      "Icons/ProductImages/relay/IMG_5141_1.jpg",
      "Icons/ProductImages/relay/il_794xN_5870309846_3zkf_jpg_899dc991-6e65-4360-bbf5-e47c6c264f71.webp",
    ],
    description:
      "The Spec5 Relay is a solar-powered LoRa node designed to expand your network's reach effortlessly. Featuring a high-efficiency solar panel and internal battery, it can autonomously operate for extended periods, providing reliable communication coverage in remote areas. The Relay excels in enhancing the range of your LoRa mesh, making it a vital tool for building robust, long-distance communication networks. With its easy deployment, it’s an ideal choice for off-grid enthusiasts aiming to increase their network’s capabilities.",
    shopifyId: "spec5-meshtastic-relay",
  },

  copilot: {
    name: "Spec5 Copilot",
    price: "$139.99",
    images: [
      "Icons/ProductImages/copilot/Frame7 (1).jpg",
      "Icons/ProductImages/copilot/copilot_lightbox-e1708533105529.jpg",
      "Icons/ProductImages/copilot/copilot_grounded (1).jpg",
      "Icons/ProductImages/copilot/copilot_flying.jpg",
    ],
    description:
      "The Spec5 Copilot is a personal LoRa assistant designed to turn your drone or UAS into a mobile LoRa antenna tower, significantly extending the range of your network. Equipped with GPS tracking, the Copilot monitors the position of your UAS, ensuring you can track its location even if the drone's battery dies. Its integration with LoRa mesh networks enables seamless communication and real-time updates, making it a powerful tool for expanding your network's capabilities. Compact and lightweight, the Copilot is ideal for aerial applications, group expeditions, and emergency setups where reliable communication and tracking are essential.",
    shopifyId: "spec5-copilot",
  },
  // Add other products similarly
};

const modal = document.querySelector(".modal-backdrop");
const closeButton = document.querySelector(".modal-close");
const buyButton = document.querySelector(".buy-button");

function showProductModal(productId) {
  const product = productData[productId];
  if (!product) return;

  // Populate modal details
  modal.querySelector(".product-title").textContent = product.name;
  modal.querySelector(".product-price").textContent = product.price;
  modal.querySelector(".product-description").textContent = product.description;

  const slidesContainer = modal.querySelector(".carousel-slides");
  const dotsContainer = modal.querySelector(".carousel-dots");
  let currentSlide = 0;
  const slideWidth = 300; // pixels

  slidesContainer.innerHTML = "";
  dotsContainer.innerHTML = "";

  const modalBuyButton = modal.querySelector(".buy-button");
  modalBuyButton.onclick = () => {
    if (product.shopifyId) {
      const shopifyUrl = `https://specfive.com/products/${product.shopifyId}`;
      window.open(shopifyUrl, "_blank");
    } else {
      alert("Purchase link unavailable for this product.");
    }
  };

  const images = Array.isArray(product.images)
    ? product.images
    : [product.image];

  images.forEach((imgSrc, index) => {
    const img = document.createElement("img");
    img.src = imgSrc;
    img.alt = `${product.name} - Image ${index + 1}`;
    slidesContainer.appendChild(img);

    const dot = document.createElement("div");
    dot.className = `dot ${index === 0 ? "active" : ""}`;
    dot.addEventListener("click", () => goToSlide(index));
    dotsContainer.appendChild(dot);
  });

  modal.style.display = "flex";

  if (images.length > 1) {
    const prevBtn = modal.querySelector(".carousel-btn.prev");
    const nextBtn = modal.querySelector(".carousel-btn.next");

    const updateSlides = () => {
      slidesContainer.style.transform = `translateX(-${
        currentSlide * slideWidth
      }px)`;
      dotsContainer.querySelectorAll(".dot").forEach((dot, index) => {
        dot.classList.toggle("active", index === currentSlide);
      });
    };

    const goToSlide = (index) => {
      currentSlide = index;
      updateSlides();
    };

    prevBtn.onclick = () => {
      currentSlide = (currentSlide - 1 + images.length) % images.length;
      updateSlides();
    };

    nextBtn.onclick = () => {
      currentSlide = (currentSlide + 1) % images.length;
      updateSlides();
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".device-name").forEach((device) => {
    device.addEventListener("click", (e) => {
      e.preventDefault();
      const productId = device.getAttribute("data-product-id");
      showProductModal(productId);
    });
  });

  // Dropdown toggles for style and connectivity menus
  const styleToggle = document.querySelector(".style-toggle");
  const connectivityToggle = document.querySelector(".connectivity-toggle");

  styleToggle.addEventListener("click", () => {
    const dropdown = styleToggle.querySelector(".dropdown-menu");
    dropdown.classList.toggle("hidden");
  });

  connectivityToggle.addEventListener("click", () => {
    const dropdown = connectivityToggle.querySelector(".dropdown-menu");
    dropdown.classList.toggle("hidden");
  });

  document.querySelectorAll(".dropdown-menu .menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const selectedOption = e.target.textContent;
      console.log(`You selected: ${selectedOption}`);
    });
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".style-toggle") &&
      !e.target.closest(".connectivity-toggle")
    ) {
      document.querySelectorAll(".dropdown-menu").forEach((menu) => {
        menu.classList.add("hidden");
      });
    }
  });

  closeButton.onclick = () => {
    modal.style.display = "none";
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  buyButton.onclick = () => {
    // Add Shopify cart functionality here if needed.
  };
});

// Instead of generating a random UUID, use the marker's id to generate a consistent hover circle id.
function createHoverCircle(marker, markerEl, circleIds) {
  // Remove any existing hover circle for this marker.
  hideEffects(markerEl, circleIds);

  // Ensure the marker element has an id.
  let markerId = markerEl.id;
  if (!markerId) {
    markerId = generateUUID();
    markerEl.id = markerId;
  }
  // Create a consistent hover circle id.
  const hoverCircleId = `hover-circle-${markerId}`;

  const coords = marker.getLngLat().toArray();
  const nodeType = getNodeType(markerEl);
  const radius = calculateHoverRadius(
    RANGES[nodeType],
    coords[1],
    map.getZoom()
  );

  // Add the geojson source and layer for the hover circle.
  map.addSource(hoverCircleId, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
    },
  });

  map.addLayer({
    id: hoverCircleId,
    type: "circle",
    source: hoverCircleId,
    paint: {
      "circle-radius": radius,
      "circle-color": "#04FF85",
      "circle-opacity": 0.2,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#04FF85",
      "circle-stroke-opacity": 0.3,
    },
  });

  // Store the hover circle id on the marker element and in the circleIds object.
  markerEl.dataset.hoverCircleId = hoverCircleId;
  circleIds.hoverCircleId = hoverCircleId;
}

function hideEffects(markerEl, circleIds) {
  const hoverId = markerEl.dataset.hoverCircleId;
  if (hoverId) {
    if (map.getLayer(hoverId)) {
      map.removeLayer(hoverId);
    }
    if (map.getSource(hoverId)) {
      map.removeSource(hoverId);
    }
    delete markerEl.dataset.hoverCircleId;
  }
  circleIds.hoverCircleId = null;
}

// When zooming, update the radius for the marker's hover circle.
// This function now retrieves the hover circle id from the marker element’s dataset.
function updateEffectsOnZoom(marker, circleIds) {
  const hoverCircleId = marker.getElement().dataset.hoverCircleId;
  if (hoverCircleId && map.getSource(hoverCircleId)) {
    const coords = marker.getLngLat().toArray();
    const nodeType = getNodeType(marker.getElement());
    const radius = calculateHoverRadius(
      RANGES[nodeType],
      coords[1],
      map.getZoom()
    );
    if (map.getLayer(hoverCircleId)) {
      map.setPaintProperty(hoverCircleId, "circle-radius", radius);
    }
  }
}
