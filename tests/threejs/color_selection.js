import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

// ===============================================
// ===============================================
// ===============================================
// ===============================================
// ===============================================

//  SETUP AND TOGGLES

// ===============================================
// ===============================================
// ===============================================
// ===============================================
// ===============================================

// stores all the data in the format [time][latitude][longitude][gpp/obs_gpp]
let DATA_STORAGE = {};
// array of datetime strings (primary index into DATA_STORAGE)
let DATA_TIME_MAP = [];

// array of continents for clicking
let CONTINENT_MAP = [];
// array of arrays of points for each of the continent map 
let CONTINENT_MAP_POINTS = [];

// timer to prevent continuous draw calls
// count increases by fractions each time animate() is called
let count = 0;
// timestep indexes into DATA_STORAGE/DATA_TIME_MAP to determine which data to render
let timestep = 0;
// flag for determining when to actually draw the data again
// if timestep != previousTimestep, then the animate() function will redraw with the new data
let previousTimestep = -1;

// max loop before returning to 0 (set to -1 for full dataset)
// if this is not -1, it will iterate through X many indexes of DATA_TIME_MAP before looping back to DATA_TIME_MAP[0]
let TIME_LOOP = -1;

// Which order to show the variables in (layers) from bottom to top
let GPP = 0;
let OBS_GPP = 1;

// Variables (this order needs to match the above order)
let vars = ["gpp", "obs_gpp"];

// min/max values for each variable (gpp, obs_gpp)
let minMaxs = [];
for (let i = 0; i < vars.length; i++) {
  // [min, max]
  minMaxs.push([0, 0]);
}


// Playing/paused the animation in the animate() function
let RUN_ANIMATION = true;

// Bool for forcing a redraw of the scene (bypassing optimizations for not unnecessarily redrawing the scene)
let SHOULD_FORCE_UPDATE = false;
// Bool for determining whether to update the plane geometry (world map object) shader
let SHOULD_UPDATE_SHADER = false;

// Swap between blue/green color scheme and blue/pink/green/yellow color scheme
let USE_CANDY_COLOR_SCHEME = false;

// Toggle for whether to reduce alpha when values tend toward their minimum value
let USE_ALPHA_FOR_MIN_VALUES = true;




// track the scene objects
let RENDERED_LINES = {};

// Set the background color of the scene
let USE_WHITE_BACKGROUND = true;
let BACKGROUND_COLOR = USE_WHITE_BACKGROUND
  ? new THREE.Color(255, 255, 255, 255)
  : new THREE.Color(0, 0, 0, 255);

// Whether the time value in the CSV file is formatted as a datetime object or an interger
// This should be true if it's an int.
let TIME_IS_NUMBER = false;


// CSV filename and location
let FILENAME = "datafiles/6_yr_equator_gpp.csv";

// Toggle for printing information to the console on the first draw call
let print_once = true;


let highlightCheckbox = document.getElementById("blackOutNonHightlight");
let BLACK_NON_HIGHLIGHT_PIXELS = highlightCheckbox.checked;
highlightCheckbox.onclick = function (e) {
  BLACK_NON_HIGHLIGHT_PIXELS = highlightCheckbox.checked;
  SHOULD_FORCE_UPDATE = true;
};

let disableRegionSelectionCheckbox = document.getElementById("disableRegionSelection");
let DISABLE_REGION_SELECTION = disableRegionSelectionCheckbox.checked;
disableRegionSelectionCheckbox.onclick = function (e) {
  DISABLE_REGION_SELECTION = disableRegionSelectionCheckbox.checked;
  SHOULD_FORCE_UPDATE = true;
};


let mapContextCheckbox = document.getElementById("showMapContext");
let SHOW_MAP_CONTEXT_ON_SELECT = mapContextCheckbox.checked;
mapContextCheckbox.onclick = function (e) {
  SHOW_MAP_CONTEXT_ON_SELECT = mapContextCheckbox.checked;
  SHOULD_UPDATE_SHADER = true;
  SHOULD_FORCE_UPDATE = true;
};


// creates a texture to display for the colormapscene.
// 4 (r, g, b, a) * 200 pixels (width) * 200 pixels (height)
let colorMapData = new Uint8Array(4 * 200 * 200);
const colorMapTexture = new THREE.DataTexture(
  colorMapData,
  200,
  200,
  THREE.RGBAFormat,
  THREE.UnsignedByteType
);

// Difference checkbox
let showDifferenceCheckbox = document.getElementById("showDiff");
let SHOW_VAR_DIFFERENCE = showDifferenceCheckbox.checked;

// When the box is toggled, update the colormap for the respective color scheme (red/blue for difference and blue/green otherwise)
showDifferenceCheckbox.onclick = function (e) {
  SHOW_VAR_DIFFERENCE = showDifferenceCheckbox.checked;
  // Force the scene to redraw
  SHOULD_FORCE_UPDATE = true;
  
  // recolor the map
  for (let i = 0; i < 200; i++) {
    let ni = map(i, 0, 200, 0.0, 1.0);
    for (let j = 0; j < 200; j++) {
      let nj = map(j, 0, 200, 0.0, 1.0);
      let thiscolor = indexColorMap(ni, nj);
      setPixel(
        colorMapData,
        200,
        i,
        j,
        thiscolor.r,
        thiscolor.g,
        thiscolor.b,
        thiscolor.a
      );
    }
  }
  // Tell three.js that the texture needs to be updated
  colorMapTexture.needsUpdate = true;
};

// Slider to control what timestamp of data to display
let timelineSlider = document.getElementById("timeLineSlider");
timelineSlider.onchange = function(e) {
  // Map the slider of values 0-1000 onto the actual times available.
  timestep = Math.round(map(timelineSlider.value, 0, 1000, 0, DATA_TIME_MAP.length));
  count = timestep;
  SHOULD_FORCE_UPDATE = true;
}


// Playback speed controls
// 1x
let onexSpeed = document.getElementById("onex");
// 5x
let fivexSpeed = document.getElementById("fivex");
// 10x
let tenxSpeed = document.getElementById("tenx");

// Controls how much to update the count variable at each iteration of the animate() function
let LOOP_AMOUNT = onexSpeed.value ? 1/60 : (fivexSpeed.value ? 5/60 : 10/60);

// On change, update the LOOP_AMOUNT variable
onexSpeed.onchange = function(e) {
  if (onexSpeed.value) {
    LOOP_AMOUNT = 1/60;
  }
}
fivexSpeed.onchange = function(e) {
  if (fivexSpeed.value) {
    LOOP_AMOUNT = 5/60;
  }
}
tenxSpeed.onchange = function(e) {
  if (tenxSpeed.value) {
    LOOP_AMOUNT = 10/60;
  }
}

// Play/pause button
let playPauseButton = document.getElementById("playPauseButton");
playPauseButton.onclick = function(e) {
  togglePlayPause();
}

// Space bar or button click will play or pause the animation
function togglePlayPause() {
  RUN_ANIMATION = !RUN_ANIMATION;
  playPauseButton.innerHTML = RUN_ANIMATION ? "Playing" : "Paused";
}

// Vertex shader
var DISCRETE_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment shader
var DISCRETE_FRAGMENT_SHADER = `
uniform sampler2D dataTexture;
uniform vec2 points[100]; // Adjust size to the maximum number of points expected
uniform int numPoints;

varying vec2 vUv;

bool isPointInPolygon(vec2 p, vec2 polygon[100], int pointCount) {
  bool inside = false;
  for (int i = 0, j = pointCount - 1; i < pointCount; j = i++) {
      vec2 pi = polygon[i];
      vec2 pj = polygon[j];
      if (((pi.y > p.y) != (pj.y > p.y)) && (p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x)) {
          inside = !inside;
      }
  }
  return inside;
}

void main() {
  vec4 color = texture2D(dataTexture, vUv);
  
  if (numPoints < 3 || isPointInPolygon(vUv, points, numPoints)) {
      gl_FragColor = color;
  } else if (${SHOW_MAP_CONTEXT_ON_SELECT}) { 
    if (color[3] > 0.0) {
      color[3] = 0.25;
    }
    gl_FragColor = color;
  } else {
   discard;
  }
}
`;

let PRIOR_HIGHLIGHT = [];
let HIGHLIGHTED_COLOR_RANGE = [];
let MOUSE_POSITION_TRACKER = [];
let COLOR_MAP_BOX = null;
let INTERMEDIATE_COLOR_MAP_BOX = null;

let CONTINENT_MAP_BASE;
let INTERSECTING = null;
let SELECTED_REGION = null;

// Tracker for the mouse position when the left-mouse button is pressed
// This is used in the color map scene
let mouseDownPos = null;
// Tracker for the mouse position
// This is used in the color map scene
let mousePOS = null;
// Tracker for the mouse position
let globalMousePosition = new THREE.Vector2();


// This is the width/height resolution of the map texture. Based on CliMA's data, this spacing works best to ensure there aren't blank pixels in the continents
const width = (1920 * 3) / 8; // Set your desired width
const height = (1080 * 3) / 9; // Set your desired height
const size = width * height;


// ===============================================
// ===============================================
// ===============================================
// ===============================================
// ===============================================

//  THREE JS SCENE

// ===============================================
// ===============================================
// ===============================================
// ===============================================
// ===============================================

// Create a base scene for the map
const scene = new THREE.Scene();
// Set the scene background color
scene.background = BACKGROUND_COLOR;
// Add a camera in to the scene
const camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  0.1,
  5000
);
// Set the camera position
camera.position.x = 0;
camera.position.y = 0;
// Setting this to 800, so the camera doesn't clip the plane geometry of the map
camera.position.z = 800;
// Adjust the camera's up direction and what it's looking at.
camera.lookAt(new THREE.Vector3(0, 0, 0));
camera.up.set(0, 0, 1);

// create the renderer and set to the size of the window
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// add orbiting controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;


// Create a raycaster to track what the mouse interacts with (in the 3D scene)
const raycaster = new THREE.Raycaster();
// Store the position of the mouse cursor
const pointer = new THREE.Vector2();

// ===============================
//  COLOR MINIMAP
// ===============================
// Create an additional scene for the color map
const colorMapScene = new THREE.Scene();
// Create a camera object for the color map scene
const colorMapCamera = new THREE.OrthographicCamera(
  -100,
  100,
  100,
  -100,
  0.1,
  400
);
const colorMapRenderer = new THREE.WebGLRenderer({ alpha: true });
// Set render size to 200 pixels by 200 pixels
colorMapRenderer.setSize(200, 200);
// Add a div to the scene to house the color map components
let colorMapComponentsDIV = document.createElement("div");
colorMapComponentsDIV.className = "minimap-holder";

// Add a label for the GPP
let gppText = document.createElement("p");
gppText.textContent = "GPP";

// Position the GPP label
gppText.style.position = "absolute";
gppText.style.left = "130px";
gppText.style.bottom = "10px";

// Create a label for the obersational (OBS) GPP
let obsGPPText = document.createElement("p");
obsGPPText.textContent = "OBS.\nGPP";
// Position the OBS GPP label
obsGPPText.style.position = "absolute";
obsGPPText.style.left = "5px";
obsGPPText.style.bottom = "130px";
// Rotate it
obsGPPText.style.transform = "rotate(-90deg)";

// Create a div to place the color map in.
let colorMapDIV = document.createElement("div");
colorMapDIV.className = "minimap-holder-inside";

// Add everything to the document 
colorMapComponentsDIV.appendChild(colorMapDIV);
colorMapComponentsDIV.appendChild(gppText);
colorMapComponentsDIV.appendChild(obsGPPText);
colorMapDIV.appendChild(colorMapRenderer.domElement);
document.body.appendChild(colorMapComponentsDIV);




// Set the position and orientation of the color map camera
colorMapCamera.position.set(0, 0, 1);
colorMapCamera.lookAt(new THREE.Vector3(0, 0, 0));

// Tell three.js the colormap texture needs to be updated
colorMapTexture.needsUpdate = true;

// Iterate over the 200x200 pixel grid and set the color value
for (let i = 0; i < 200; i++) {
  // map the 0-200 index into a 0.0-1.0 value
  let ni = map(i, 0, 200, 0.0, 1.0);
  for (let j = 0; j < 200; j++) {
    // map the 0-200 index into a 0.0-1.0 value
    let nj = map(j, 0, 200, 0.0, 1.0);
    
    // ni, nj act as gpp, obs_gpp standins, so get the color of this region
    let thiscolor = indexColorMap(ni, nj);
    
    // set the pixel color based on this data
    setPixel(
      colorMapData,
      200,
      i,
      j,
      thiscolor.r,
      thiscolor.g,
      thiscolor.b,
      thiscolor.a
    );
  }
}

// Tell three.js to update the texture
colorMapTexture.needsUpdate = true;

// Create a plane using the color data and display it to the user.
let m = new THREE.MeshBasicMaterial({ map: colorMapTexture, transparent: true });
let g = new THREE.PlaneGeometry(200, 200);
let t = new THREE.Mesh(g, m);
colorMapScene.add(t);

// ===============================
// ===============================

// Takes in csv text data and formats it into a dictionary
function parseCSV(data) {
  // Split by rows
  const rows = data.split("\n");

  // Extract headers
  const headers = rows[0].split(",");

  // Create an array of javascrip objects
  const result = rows.slice(1).map((row) => {
    // Split elements from rows
    const values = row.split(",");

    // Create javascript object indexed by the headers extracted
    return headers.reduce((object, header, index) => {
      let newHeader = header.replace("\r", "");
      if (newHeader === "time" && !TIME_IS_NUMBER) {
        object[newHeader] = values[index];
      } else {
        object[newHeader] = Number(values[index]);

        // Convert NaN to 0s
        if (isNaN(object[newHeader])) {
          object[newHeader] = 0;
        }
      }
      return object;
    }, {});
  });

  return result;
}

// Map a value from one scale to another
function map(value, fromLow, fromHigh, toLow, toHigh) {
  return ((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow;
}

// Track the maximum value found for a specific variable
function checkMax(index, value) {
  let checkUnit = minMaxs;
  if (!checkUnit[index][1] && !isNaN(value)) {
    checkUnit[index][1] = value;
  } else if (value > checkUnit[index][1] && !isNaN(value)) {
    checkUnit[index][1] = value;
  }
}

// Track the minimum value found for a specific variable
function checkMin(index, value) {
  let checkUnit = minMaxs;
  if (!checkUnit[index][0] && !isNaN(value)) {
    checkUnit[index][0] = value;
  } else if (value < checkUnit[index][0] && !isNaN(value)) {
    checkUnit[index][0] = value;
  }
}

// Sets up the RENDERED_LINES
function setupSceneTrackers(lat) {
  for (let i = 0; i < vars.length; i++) {
    if (!RENDERED_LINES[i]) {
      RENDERED_LINES[i] = {};
      RENDERED_LINES[i][lat] = undefined;
    } else if (!RENDERED_LINES[i][lat]) {
      RENDERED_LINES[i][lat] = undefined;
    } 
  }
}

// Takes an array of Vector3 points and creates a convex geometry from it
function buildConvexGeometry(points) {
  // Create the geometry
  const geometry = new ConvexGeometry(points);

  // Create a material that is not seen by the user.
  const material = new THREE.MeshBasicMaterial({
    opacity: 0,
    transparent: true,
  });

  // Create the mesh
  const mesh = new THREE.Mesh(geometry, material);

  // Add the mesh to the scene
  CONTINENT_MAP_BASE.add(mesh);

  return mesh;
}

// Load continents
fetch("datafiles/countries.json")
  .then((response) => response.json())
  .then((json) => {
    let allFeatures = json["features"];
    // Iterate over continents
    for (let i = 0; i < allFeatures.length; i++) {
      let allPointsForContinents = allFeatures[i]["geometry"]["coordinates"];

      // Stores all x,y,z points for the boundary of the continent
      let points = [];

      // Create a three.js group to parent all continents to
      CONTINENT_MAP_BASE = new THREE.Group();
      // Add it to the scene
      scene.add(CONTINENT_MAP_BASE);

      // Iterate over each point within the continent's bounds
      for (let j = 0; j < allPointsForContinents.length; j++) {
        let t = [];
        for (let k = 0; k < allPointsForContinents[j].length; k++) {
          // Map that lat/long point onto the canvas width/height
          let x = map(
            allPointsForContinents[j][k][0],
            -90,
            90,
            -height / 2,
            height / 2
          );
          let y = map(
            allPointsForContinents[j][k][1],
            -180,
            180,
            -width / 2,
            width / 2
          );
          // Store the point at -0.1 z to prevent z-index fighting.
          points.push(new THREE.Vector3(x, y, -0.1));
        }
      }

      // Add the convex geometry bounding box of the points.
      CONTINENT_MAP.push(buildConvexGeometry(points));
      // Store the points at the same index as the continent
      CONTINENT_MAP_POINTS.push(points);
    }
  });


function loadAndFormatData(text) {
  // Get a dictionary from the csv data (should have time, lat, lon [long], gpp, and obs_gpp)
  let data = parseCSV(text);

  // counter used for determine mean
  let tmpCount = 0;

  // Iterate through the data
  for (var i = 0; i < data.length; i++) {
    // Skip times not counted within the loop
    if (TIME_IS_NUMBER && TIME_LOOP > -1 && data[i].time > TIME_LOOP) {
      continue;
    } else if (TIME_LOOP > -1 && data[i].time > TIME_LOOP) {
      continue;
    }
    
    tmpCount += 1;

    // Get the values from the javascript object for the ith row in the csv (array)
    let timeVal = data[i].time;
    let lat = data[i].lat;
    let long = data[i].lon;
    let gpp = data[i].gpp;
    let obs_gpp = data[i].obs_gpp;

    // Check for NaN
    if (isNaN(gpp)) {
      gpp = 0;
    }
    if (isNaN(obs_gpp)) {
      obs_gpp = 0;
    }

    // update min/max values
    checkMax(GPP, gpp);
    checkMin(GPP, gpp);
    checkMax(OBS_GPP, obs_gpp);
    checkMin(OBS_GPP, obs_gpp);

    // add time to map if unique
    let timeMap = DATA_TIME_MAP;
    if (!timeMap.includes(timeVal)) {
      timeMap.push(timeVal);
    }

    // 
    setupSceneTrackers(lat, long);


    let timeIndex = timeMap.length - 1;
    let storageUnit = DATA_STORAGE;

    // add data to DATA_STORAGE
    if (!storageUnit[timeIndex]) {
      storageUnit[timeIndex] = {};
      storageUnit[timeIndex][lat] = {};
      storageUnit[timeIndex][lat][long] = {};
      storageUnit[timeIndex][lat][long]["gpp"] = gpp;
      storageUnit[timeIndex][lat][long]["obs_gpp"] = obs_gpp;
    } else if (!storageUnit[timeIndex][lat]) {
      storageUnit[timeIndex][lat] = {};
      storageUnit[timeIndex][lat][long] = {};
      storageUnit[timeIndex][lat][long]["gpp"] = gpp;
      storageUnit[timeIndex][lat][long]["obs_gpp"] = obs_gpp;
    } else if (!storageUnit[timeIndex][lat][long]) {
      storageUnit[timeIndex][lat][long] = {};
      storageUnit[timeIndex][lat][long]["gpp"] = gpp;
      storageUnit[timeIndex][lat][long]["obs_gpp"] = obs_gpp;
    }
  }

  // update timeloop if initially set to -1
  if (TIME_LOOP == -1) {
    TIME_LOOP = DATA_TIME_MAP.length;
  }

}

// Load model data
fetch(FILENAME)
  .then((response) => response.text())
  .then((text) => {
    loadAndFormatData(text);
  });

// takes a x-value 0.0-1.0 and a y-value 0.0-1.0, and returns the color that corresponds to that point
function indexColorMap(normalizedX, normalizedY) {
  let r, g, b, a;

  // For difference mode, diagonal line is white, and blue/red shifts based on which variable is stronger
  if (SHOW_VAR_DIFFERENCE) {
    let distance, red, white, blue, color;

    // Initialize the gradient colors
    red = [255, 0, 0];
    white = [255, 255, 255];
    blue = [0, 0, 255];

    // Calculate the distance from the center
    distance = normalizedX - normalizedY;

    // Determine the color based on the distance
    if (distance < 0) {
      color = white.map((c, i) => c + Math.abs(distance) * (red[i] - c));
    } else {
      color = white.map((c, i) => c + Math.abs(distance) * (blue[i] - c));
    }

    // Assign the calculated color values
    r = Math.round(color[0]);
    g = Math.round(color[1]);
    b = Math.round(color[2]);

    return { r, g, b, a: 255 };
  }

  // Check which color scheme to use
  if (USE_CANDY_COLOR_SCHEME) {
    r = normalizedX * 255;
    g = normalizedY * 255;
    b = (1 - normalizedX) * 255 * (1 - normalizedY);
    // Reduce the alpha as values tend toward their minimum value
    a = 1 / (1 + Math.pow(Math.E, 6-20*map(normalizedX+normalizedY, 0.0, 2.0, 0.0, 1.0))) * 255;
  } else {
    r = 0.0;
    g = normalizedX * 255;
    b = normalizedY * 255;
    // Reduce the alpha as values tend toward their minimum value
    a = 1 / (1 + Math.pow(Math.E, 6-20*map(normalizedX+normalizedY, 0.0, 2.0, 0.0, 1.0))) * 255;
  }
  return {r, g, b, a: USE_ALPHA_FOR_MIN_VALUES ? a : 255};
}

// takes in a color, and returns a x-value 0.0-1.0 and a y-value 0.0-1.0
function colorMapIndex(color) {
  let nx, ny;

  // TODO: do this for difference condition

  if (USE_CANDY_COLOR_SCHEME) {
    nx = color.r / 255;
    ny = color.g / 255;
  } else {
    nx = color.g / 255;
    ny = color.b / 255;
  }
  return [nx, ny];
}

// sets the pixel value of an rgba array (1D uint 8 array) 
// where thisWidth is the width of the dataTexture (image)
// y is the row number for the pixel
// x is the column number for the pixel
function setPixel(someData, thisWidth, x, y, r, g, b, a) {
  // Get the index
  const index = (y * thisWidth + x) * 4;

  // Set the red, green, blue, and alpha channels
  someData[index] = r;
  someData[index + 1] = g;
  someData[index + 2] = b;
  someData[index + 3] = a;
}

function drawPoints(time, storageUnit) {
  // ensure DATA_STORAGE is created
  if (storageUnit[time]) {
    // collectors for the points/pixels to render
    let points = [];
    let points_locs = [];


    var lats = Object.keys(storageUnit[time]);
    for (let i = 0; i < lats.length; i++) {
      var longs = Object.keys(storageUnit[time][lats[i]]);
      for (let j = 0; j < longs.length; j++) {

        // Map the gpp/obs_gpp from it's min/max to 0.0/1.0
        let x = storageUnit[time][lats[i]][longs[j]]["gpp"];
        let y = storageUnit[time][lats[i]][longs[j]]["obs_gpp"];
        let minMaxToUse = minMaxs;
        x = map(x, minMaxToUse[GPP][0], minMaxToUse[GPP][1], 0.0, 1.0);
        y = map(y, minMaxToUse[OBS_GPP][0], minMaxToUse[OBS_GPP][1], 0.0, 1.0);

        // Select a color based on the 0.0-1.0 values (gpp/obs_gpp)
        let selectedColor = indexColorMap(x, y);

        // Map the lap/long onto pixels
        let locx = map(longs[j], -180, 180, 0, width);
        let locy = map(lats[i], -90, 90, 0, height);

        // Store the values for rendering
        points.push({ locx: locx, locy: locy, color: selectedColor });
        points_locs.push(new THREE.Vector2(locx, locy));
      }
    }

    // Create a uint8 array of rgba values (pixels) based on the size (width/height) of the texture
    let data = new Uint8Array(4 * size);
    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );

    // Tell three.js to update the texture
    texture.needsUpdate = true;

    // Iterate over each pixel and set it blank
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        setPixel(data, width, i, j, 0, 0, 0, 0);
      }
    }

    // Iterate over the points we have data for
    for (let i = 0; i < points.length; i++) {
      // Get an x,y in the color map space based on the color for the pixel
      let pointIndex = colorMapIndex(points[i].color);

      // Determine if the x,y is outside the tresholded region
      if (
        HIGHLIGHTED_COLOR_RANGE.length > 0 &&
        !(
          pointIndex[0] >= HIGHLIGHTED_COLOR_RANGE[0].x &&
          pointIndex[0] <= HIGHLIGHTED_COLOR_RANGE[1].x &&
          pointIndex[1] <= HIGHLIGHTED_COLOR_RANGE[0].y &&
          pointIndex[1] >= HIGHLIGHTED_COLOR_RANGE[1].y
        )
      ) {
        // Check if background pixels are highlighted
        if (BLACK_NON_HIGHLIGHT_PIXELS) {
          setPixel(
            data,
            width,
            Math.round(points[i].locx),
            Math.round(points[i].locy),
            USE_WHITE_BACKGROUND ? 0.0 : 255.0,
            USE_WHITE_BACKGROUND ? 0.0 : 255.0,
            USE_WHITE_BACKGROUND ? 0.0 : 255.0,
            255
          );
        } else {
          continue;
        }
      } else {
        // Otherwise the color is in the thresholded region


        // Get the x,y location and set the pixel's color
        let someI = Math.round(points[i].locx);
        let someJ = Math.round(points[i].locy);
        setPixel(
          data,
          width,
          someI,
          someJ,
          points[i].color.r,
          points[i].color.g,
          points[i].color.b,
          points[i].color.a
        );
      }
    }
    // Tell three.js to update the texture
    texture.needsUpdate = true;

    // Add the plane geometory (map) to the scene if it's not already there
    let renderIndex = 0;
    if (!RENDERED_LINES[renderIndex][0]) {
      // Create a material with the vertex and fragement shader, passing in the information about the texture to render, the points for clipping bounds (such as continents), the number of points to iterate over, and the resolution of the window
      const material = new THREE.ShaderMaterial({
        uniforms: {
          dataTexture: { value: texture },
          points: { value: new Array(100).fill(new THREE.Vector2()) },
          numPoints: { value: 0 },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        },
        vertexShader: DISCRETE_VERTEX_SHADER,
        fragmentShader:DISCRETE_FRAGMENT_SHADER,
        transparent: true
      });

      // Build the plane geometry and add it to the scene
      let boxGeo = new THREE.PlaneGeometry(width, height, width, height);
      RENDERED_LINES[renderIndex][0] = new THREE.Mesh(boxGeo, material);
      scene.add(RENDERED_LINES[renderIndex][0]);
    } else {
      // Update the plane geometry if it already exists

      // Update the texture
      RENDERED_LINES[renderIndex][0].material.uniforms.dataTexture.value = texture;

      // If the user toggled the context toggle, be sure to update the shader
      if (SHOULD_UPDATE_SHADER) {
        RENDERED_LINES[renderIndex][0].material.fragmentShader =
          RENDERED_LINES[renderIndex][0].material.fragmentShader.replace(
            /\} else if \((true|false)\) \{ \/\//,
            `} else if (${SHOW_MAP_CONTEXT_ON_SELECT}) { //`
          );
      }

      // Tell three.js to update the material
      RENDERED_LINES[renderIndex][0].material.needsUpdate = true;
    }
  }
}

function updateClippingRegion(points) {
  for (let layer = 0; layer < 2; layer++ ) {
    if (!RENDERED_LINES[layer][0]) {
      continue;
    }
    const uniforms = RENDERED_LINES[layer][0].material.uniforms;
    for (let i = 0; i < points.length; i++) {
      uniforms.points.value[i] = new THREE.Vector2(
        (points[i].x + width / 2) / width,
        (points[i].y + height / 2) / height
      );
    }
    uniforms.numPoints.value = Math.min(points.length, 100);
    RENDERED_LINES[layer][0].material.needsUpdate = true;
  }
}


function animate() {
  // Update the loop variables and timesteps
  if (RUN_ANIMATION) {
    count = count + LOOP_AMOUNT;
    timestep = Math.floor(count) % TIME_LOOP;
  }

  // Check if a new time has been reached
  if (
    Object.keys(DATA_STORAGE).length > 0 &&
    (timestep !== previousTimestep ||
      PRIOR_HIGHLIGHT !== HIGHLIGHTED_COLOR_RANGE ||
      SHOULD_FORCE_UPDATE)
  ) {
    timelineSlider.value = Math.round(map(timestep, 0, DATA_TIME_MAP.length, 0, 1000));
    // reset force update tracker
    SHOULD_FORCE_UPDATE = false;

    // Only print (1 time) once there is data to display
    if (print_once) {
      print_once = false;
      console.log(DATA_STORAGE);
      console.log(DATA_TIME_MAP);
      console.log(minMaxs);
      console.log(CONTINENT_MAP);
    }

    // Update timestep tracker
    previousTimestep = timestep;

    // update color tracker
    PRIOR_HIGHLIGHT = HIGHLIGHTED_COLOR_RANGE;

    // Draw data for new time
    drawPoints(timestep, DATA_STORAGE);

    // be sure to reset update/swap shader values
    if (SHOULD_UPDATE_SHADER) {
      SHOULD_UPDATE_SHADER = false;
    }
    
  }

  // Draw the resizable box as the user select makes a color selection
  drawHighlightingRegion();

  // Draw the bounding box of the selected color zone
  drawColorRestrictedZone();

  // Use ray casting to determine which continent is being hovered over by the mouse
  if (CONTINENT_MAP_BASE) {
    raycaster.setFromCamera(pointer, camera);
    // calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects(CONTINENT_MAP);
    if (intersects.length > 0) {
      for (let c = 0; c < CONTINENT_MAP.length; c++) {
        if (CONTINENT_MAP[c].uuid === intersects[0]["object"].uuid) {
          INTERSECTING = c;
        }
      }
    } else {
      INTERSECTING = null;
    }
  }

  // Update the camera position, rotation, etc, and render
  controls.update();
  renderer.render(scene, camera);
  colorMapRenderer.render(colorMapScene, colorMapCamera);
}

// Set the animation loop function to be animate
renderer.setAnimationLoop(animate);





// Function for drawing the highlighting region (mouse not released)
function drawHighlightingRegion() {
  if (mousePOS) {
    // if there already is a region box, delete it before drawing the new one
    if (INTERMEDIATE_COLOR_MAP_BOX) {
      colorMapScene.remove(INTERMEDIATE_COLOR_MAP_BOX);
    }

    // Determine direction of the box
    let minx = Math.min(mousePOS.x, globalMousePosition.x);
    let maxx = Math.max(mousePOS.x, globalMousePosition.x);
    let miny = Math.min(mousePOS.y, globalMousePosition.y);
    let maxy = Math.max(mousePOS.y, globalMousePosition.y);

    // Get the bounding box of the color map
    const rect = colorMapRenderer.domElement.getBoundingClientRect();

    // Create a semi-transparent black material to display the (non-released) region
    let m = new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0.65,
      transparent: true,
    });

    // Determine the region width/height
    let windowWidth = rect.right - rect.left;
    let windowHeight = rect.top - rect.bottom;
    let width = maxx - minx;
    let height = Math.abs(
      maxy - miny
    );

    // Create a plane geometry for the region and add it to the scene
    let g = new THREE.PlaneGeometry(width, height);
    INTERMEDIATE_COLOR_MAP_BOX = new THREE.Mesh(g, m);
    colorMapScene.add(INTERMEDIATE_COLOR_MAP_BOX);

    // Position the region
    INTERMEDIATE_COLOR_MAP_BOX.position.x =
      -windowWidth / 2 + (minx - rect.left) + width / 2;
    INTERMEDIATE_COLOR_MAP_BOX.position.y =
      -windowHeight / 2 - (miny - rect.top) - height / 2;

  } else if (INTERMEDIATE_COLOR_MAP_BOX) {
    // if there already is a region box, delete it before drawing the new one
    colorMapScene.remove(INTERMEDIATE_COLOR_MAP_BOX);
    INTERMEDIATE_COLOR_MAP_BOX = null;
  }
}

// Draw restriction zone (mouse released)
function drawColorRestrictedZone() {
  if (HIGHLIGHTED_COLOR_RANGE.length > 0) {

    // If the region already exists, delete it before updating
    if (COLOR_MAP_BOX) {
      colorMapScene.remove(COLOR_MAP_BOX);
    }

    // Get a bounding box of the color map scene
    const rect = colorMapRenderer.domElement.getBoundingClientRect();

    // Create a semi-transparent material for the region being selected
    let m = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.65,
      transparent: true,
    });

    // determine the width/height of the selected region
    let windowWidth = rect.right - rect.left;
    let windowHeight = rect.top - rect.bottom;
    let width = MOUSE_POSITION_TRACKER[1].x - MOUSE_POSITION_TRACKER[0].x;
    let height = Math.abs(
      MOUSE_POSITION_TRACKER[0].y - MOUSE_POSITION_TRACKER[1].y
    );

    // Create the region being selected as a plane
    let g = new THREE.PlaneGeometry(width, height);
    // Update the map box tracker and add to scene
    COLOR_MAP_BOX = new THREE.Mesh(g, m);
    colorMapScene.add(COLOR_MAP_BOX);

    // Set the position to be the correct region
    COLOR_MAP_BOX.position.x =
      -windowWidth / 2 + (MOUSE_POSITION_TRACKER[0].x - rect.left) + width / 2;
    COLOR_MAP_BOX.position.y =
      -windowHeight / 2 - (MOUSE_POSITION_TRACKER[0].y - rect.top) - height / 2;

  } else if (COLOR_MAP_BOX) {
    // If the box already exists, delete it
    colorMapScene.remove(COLOR_MAP_BOX);
    COLOR_MAP_BOX = null;
  }
}






// ==============================
// ==============================
// ==============================
// LISTENER FUNCTIONS
// ==============================
// ==============================
// ==============================

// Add listener for pressing any mouse buttons
document.addEventListener("mousedown", (event) => {
  // Verify left click only
  if (event.button !== 0) {
    return;
  }

  // get the bounding box of the color map scene/region
  const rect = colorMapRenderer.domElement.getBoundingClientRect();

  // Check if mouse is within the bounds of the colorMap scene
  if (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  ) {
    // Update trackers
    // mouseDownPos is proportional to the size of the scene
    mouseDownPos = {
      x: (event.clientX - rect.left) / (rect.right - rect.left),
      y: (event.clientY - rect.bottom) / (rect.top - rect.bottom),
    };
    // mousePOS is just the position of the mouse.
    mousePOS = { x: event.clientX, y: event.clientY };
  } else {
    // clicked on bigger canvas

    // Check if toggle is enabled for disabling continent selection
    if (!DISABLE_REGION_SELECTION) {
      // Check if the mouse is currently intersecting (hovering over) a selectable continent
      if (INTERSECTING !== null) {
        // Check if a region is already selected and if the mouse is over a different region
        if (SELECTED_REGION !== null && INTERSECTING !== SELECTED_REGION) {
          // Clear current selection
          updateClippingRegion([]);
          SELECTED_REGION = null;
        } else {
          // Select region
          updateClippingRegion(CONTINENT_MAP_POINTS[INTERSECTING]);
          SELECTED_REGION = INTERSECTING; 
        }
      } else {
        // Clear current selection
        updateClippingRegion([]);
        SELECTED_REGION = null;
      }
    } else {
      // Clear current selection
      if (INTERSECTING !== null) {
        updateClippingRegion([]);
        SELECTED_REGION = null;
      }
    }
  } 
});

// Find the distance between 2 points
function mouseDist(points) {
  return Math.sqrt(
    Math.pow(points[0].x - points[1].x, 2) +
      Math.pow(points[0].y - points[1].y, 2)
  );
}

// Add a listener for mouse release
document.addEventListener("mouseup", (event) => {
  // Check if we stored a mouse position for mouse click
  if (mouseDownPos) {
    // Grab the bounding box of the color map
    const rect = colorMapRenderer.domElement.getBoundingClientRect();

    // Update the highlight tracker, storing the prior highlighted region
    PRIOR_HIGHLIGHT = HIGHLIGHTED_COLOR_RANGE;
    
    // Update the position tracker to be the beginning location and the current location
    MOUSE_POSITION_TRACKER = [
      { ...mousePOS },
      { x: event.clientX, y: event.clientY },
    ];

    // If the distance is greater than 2 pixels (avoid single mouse click/release)
    if (mouseDist(MOUSE_POSITION_TRACKER) > 2) {
      // temp vars of mouse position
      let tmpMouse = [{ ...mousePOS }, { x: event.clientX, y: event.clientY }];
      let tmpPosition = [
        mouseDownPos,
        {
          x: (event.clientX - rect.left) / (rect.right - rect.left),
          y: (event.clientY - rect.bottom) / (rect.top - rect.bottom),
        },
      ];

      // Update the range
      HIGHLIGHTED_COLOR_RANGE = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ];

      // Do min/maxes to allow for dragging the box/region selection in any direction
      HIGHLIGHTED_COLOR_RANGE[0].x = Math.min(
        tmpPosition[0].x,
        tmpPosition[1].x
      );
      HIGHLIGHTED_COLOR_RANGE[1].x = Math.max(
        tmpPosition[0].x,
        tmpPosition[1].x
      );
      HIGHLIGHTED_COLOR_RANGE[0].y = Math.max(
        tmpPosition[0].y,
        tmpPosition[1].y
      );
      HIGHLIGHTED_COLOR_RANGE[1].y = Math.min(
        tmpPosition[0].y,
        tmpPosition[1].y
      );

      MOUSE_POSITION_TRACKER[0].x = Math.min(tmpMouse[0].x, tmpMouse[1].x);
      MOUSE_POSITION_TRACKER[1].x = Math.max(tmpMouse[0].x, tmpMouse[1].x);
      MOUSE_POSITION_TRACKER[0].y = Math.min(tmpMouse[0].y, tmpMouse[1].y);
      MOUSE_POSITION_TRACKER[1].y = Math.max(tmpMouse[0].y, tmpMouse[1].y);
    } else {
      // Clear trackers
      MOUSE_POSITION_TRACKER = [];
      PRIOR_HIGHLIGHT = [];
      HIGHLIGHTED_COLOR_RANGE = [];
    }

    // Reset mouse down variables
    mouseDownPos = null;
    mousePOS = null;
  }
});

// Add listener for moving the cursor
window.addEventListener("pointermove", onPointerMove);
function onPointerMove(event) {
  // Update global position tracker
  globalMousePosition.x = event.clientX;
  globalMousePosition.y = event.clientY;
  // Update pointer relative to the canvas size
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Add listener for keystrokes
document.addEventListener("keydown", onDocumentKeyDown, false);
function onDocumentKeyDown(event) {
    switch(event.code) {
        // Play/pause the animation
        case "Space": 
            togglePlayPause();
            break;
    }
};