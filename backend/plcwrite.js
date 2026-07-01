const http = require("http");
const { URL } = require("url");
const {
  AREA_START,
  STATION_OFFSETS,
  dateTimeToWords,
  floatToWords,
  makeConfig,
  setWords,
  stringToWords,
  uint32ToWords,
  uint64ToWords,
  writeWordsInChunks,
} = require("./plc-layout");

const MODEL_END = 10699;
const WRITE_COUNT = MODEL_END - AREA_START + 1;
const DEFAULT_WRITE_INTERVAL_MS = 3000;
const DEFAULT_ERROR_DELAY_MS = 10000;
const WRITE_UI_PORT = Number(process.env.PLC_WRITE_UI_PORT || 1012);
const DEFAULT_WRITE_PLC_PORT = 5012;
const MODEL_NUMBERS = [0, 6630865, 6630867, 6630862];
const PLUG_ACTUAL = 14.493;
const STATUS_VALUES = [0, 1, 2, 3, 4, 5];
const STATION_WRITE_RANGES = {
  common: { label: "Common Area", start: 10000, count: 33 },
  1: { label: "Station 1", start: 10100, count: 37 },
  2: { label: "Station 2", start: 10200, count: 21 },
  3: { label: "Station 3", start: 10300, count: 20 },
  4: { label: "Station 4 Reset", start: 10400, count: 100 },
  5: { label: "Station 5", start: 10500, count: 12 },
  6: { label: "Station 6", start: 10600, count: 24 },
};
const SPECS = {
  outerDiameter: { min: 34.975, max: 35.025 },
  overallLength: { min: 465.900, max: 466.100 },
  dowelLength: { min: 458.900, max: 459.100 },
  apg122Diameter: { min: 12.175, max: 12.225 },
  gaugeDowelToDowel: { min: 445.134, max: 445.135 },
  plug: { min: 14.285, max: 14.311 },
  dowel: { min: 4.967, max: 4.993 },
  ball: { min: 6.285, max: 6.310 },
};

const FLOAT_FIELDS = [
  ["outerDiameterLeft", "Station 1 / Outer Diameter Left", 1, 0, "outerDiameter", 34.981],
  ["outerDiameterRight", "Station 1 / Outer Diameter Right", 1, 6, "outerDiameter", 34.992],
  ["overallLength", "Station 1 / Overall Length", 1, 12, "overallLength", 466.085],
  ["dowelLength", "Station 1 / Dowel Length", 1, 18, "dowelLength", 459.000],
  ["apg122Diameter", "Station 1 / APG 12.2 Diameter", 1, 24, "apg122Diameter", 12.176],
  ["gaugeDowelToDowel", "Station 1 / Gauge Dowel to Dowel", 1, 31, "gaugeDowelToDowel", 445.134],
  ["plugLeft", "Station 5 / Plug Left", 5, 0, "plug", PLUG_ACTUAL],
  ["plugRight", "Station 5 / Plug Right", 5, 6, "plug", PLUG_ACTUAL],
  ["dowelLeft", "Station 6 / Dowel Left", 6, 0, "dowel", 4.980],
  ["dowelRight", "Station 6 / Dowel Right", 6, 6, "dowel", 4.980],
  ["ballLeft", "Station 6 / Ball Left", 6, 12, "ball", 6.285],
  ["ballRight", "Station 6 / Ball Right", 6, 18, "ball", 6.285],
];

const BOOL_FIELDS = [
  ...Array.from({ length: 15 }, (_, index) => ({
    key: `hole${index + 1}`,
    label: `Station 2 / 3 mm Hole ${index + 1}`,
    station: 2,
    offset: index,
    defaultValue: 0,
  })),
  { key: "holeA", label: "Station 2 / 3 mm Hole A", station: 2, offset: 15, defaultValue: 0 },
  { key: "holeB", label: "Station 2 / 3 mm Hole B", station: 2, offset: 16, defaultValue: 0 },
  { key: "holeC", label: "Station 2 / 3 mm Hole C", station: 2, offset: 17, defaultValue: 0 },
  { key: "special4mm51", label: "Station 2 / Special 4 mm / 51", station: 2, offset: 18, defaultValue: 0 },
  { key: "hole12213", label: "Station 2 / 12.2-13", station: 2, offset: 19, defaultValue: 0 },
  { key: "slot", label: "Station 2 / Slot", station: 2, offset: 20, defaultValue: 0 },
  { key: "marking2d", label: "Station 3 / 2D Marking", station: 3, offset: 0, defaultValue: 0 },
  { key: "topEngraving", label: "Station 3 / Top Engraving", station: 3, offset: 1, defaultValue: 0 },
  { key: "sideEngraving", label: "Station 3 / Side Engraving", station: 3, offset: 2, defaultValue: 0 },
  { key: "presence3d", label: "Station 1 / 3D Presence", station: 1, offset: 30, defaultValue: 0 },
];

let nextComponentNo = BigInt(process.env.PLC_WRITE_COMPONENT_START || 2000001);
let lastManualValues = makeDefaultManualValues();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randBool() {
  return Math.random() >= 0.2 ? 4 : 5;
}

function randFloat(min, max, decimals = 3) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function stationBase(stationNo) {
  return AREA_START + STATION_OFFSETS[stationNo];
}

function writeCommonArea(area, modelNo) {
  const total = randInt(90, 140);
  const notOk = randInt(0, 12);

  setWords(area, 10000, [randInt(1, 3)]);
  setWords(area, 10001, stringToWords(`OP-${randInt(1000, 9999)}`, 10));
  setWords(area, 10011, uint32ToWords(modelNo));
  setWords(area, 10013, uint64ToWords(randInt(1000000, 9999999)));
  setWords(area, 10020, dateTimeToWords(new Date()));
  setWords(area, 10030, [total]);
  setWords(area, 10031, [total - notOk]);
  setWords(area, 10032, [notOk]);
}

function writeFloatValue(area, address, actual) {
  setWords(area, address, floatToWords(actual));
}

function writeFloatParameter(area, address, spec, actual) {
  writeFloatValue(area, address, spec.min);
  writeFloatValue(area, address + 2, spec.max);
  writeFloatValue(area, address + 4, actual);
}

function writeStation1(area, base) {
  writeFloatParameter(area, base + 0, SPECS.outerDiameter, randFloat(34.960, 35.040));
  writeFloatParameter(area, base + 6, SPECS.outerDiameter, randFloat(34.960, 35.040));
  writeFloatParameter(area, base + 12, SPECS.overallLength, randFloat(465.850, 466.150));
  writeFloatParameter(area, base + 18, SPECS.dowelLength, randFloat(458.850, 459.150));
  writeFloatParameter(area, base + 24, SPECS.apg122Diameter, randFloat(12.160, 12.240));
  setWords(area, base + 30, [randBool()]);
  writeFloatParameter(area, base + 31, SPECS.gaugeDowelToDowel, randFloat(SPECS.gaugeDowelToDowel.min, SPECS.gaugeDowelToDowel.max, 3));
}

function writeStation2(area, base) {
  for (let offset = 0; offset <= 20; offset += 1) {
    setWords(area, base + offset, [randBool()]);
  }
}

function writeStation3(area, base, modelNo) {
  setWords(area, base + 0, [randBool()]);
  setWords(area, base + 1, [randBool()]);
  setWords(area, base + 2, [randBool()]);
  setWords(area, base + 10, stringToWords(`QR${modelNo}-${randInt(100, 999)}`, 10));
}

function writeStation5(area, base) {
  writeFloatParameter(area, base + 0, SPECS.plug, PLUG_ACTUAL);
  writeFloatParameter(area, base + 6, SPECS.plug, PLUG_ACTUAL);
}

function writeStation6(area, base) {
  writeFloatParameter(area, base + 0, SPECS.dowel, randFloat(4.950, 5.010));
  writeFloatParameter(area, base + 6, SPECS.dowel, randFloat(4.950, 5.010));
  writeFloatParameter(area, base + 12, SPECS.ball, randFloat(SPECS.ball.min, SPECS.ball.max));
  writeFloatParameter(area, base + 18, SPECS.ball, randFloat(SPECS.ball.min, SPECS.ball.max));
}

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeWriteConfig() {
  const config = makeConfig();
  return {
    ...config,
    port: envNumber("PLC_WRITE_PORT", DEFAULT_WRITE_PLC_PORT),
  };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toStatusWord(value) {
  const status = Number(value);
  return STATUS_VALUES.includes(status) ? status : 0;
}

function makeDefaultManualValues() {
  const values = {
    shift: 1,
    operator: "OP-1001",
    modelNo: 6630865,
    componentNo: nextComponentNo.toString(),
    autoComponentNo: true,
    total: 1,
    ok: 1,
    notOk: 0,
    qrVerifierValue: "QR6630865-001",
    floats: {},
    bools: {},
  };

  FLOAT_FIELDS.forEach(([key, , , , , defaultValue]) => {
    values.floats[key] = defaultValue;
  });
  BOOL_FIELDS.forEach(field => {
    values.bools[field.key] = field.defaultValue;
  });

  return values;
}

function makeZeroManualValues() {
  const values = {
    shift: 0,
    operator: "",
    modelNo: 0,
    componentNo: "0",
    autoComponentNo: false,
    total: 0,
    ok: 0,
    notOk: 0,
    qrVerifierValue: "",
    floats: {},
    bools: {},
  };

  FLOAT_FIELDS.forEach(([key]) => {
    values.floats[key] = 0;
  });
  BOOL_FIELDS.forEach(field => {
    values.bools[field.key] = 0;
  });

  return values;
}

function normalizeManualValues(input = {}) {
  const values = makeDefaultManualValues();
  values.shift = toNumber(input.shift, values.shift);
  values.operator = String(input.operator || values.operator).slice(0, 20);
  values.modelNo = toNumber(input.modelNo, values.modelNo);
  values.autoComponentNo = input.autoComponentNo !== false;
  values.componentNo = values.autoComponentNo
    ? nextComponentNo.toString()
    : String(input.componentNo || values.componentNo).replace(/\D/g, "") || values.componentNo;
  values.total = toNumber(input.total, values.total);
  values.ok = toNumber(input.ok, values.ok);
  values.notOk = toNumber(input.notOk, values.notOk);
  values.qrVerifierValue = String(input.qrVerifierValue || `QR${values.modelNo}-${values.componentNo}`).slice(0, 20);

  FLOAT_FIELDS.forEach(([key, , , , , defaultValue]) => {
    values.floats[key] = toNumber(input.floats?.[key], defaultValue);
  });
  BOOL_FIELDS.forEach(field => {
    values.bools[field.key] = input.bools?.[field.key] === undefined
      ? field.defaultValue
      : toStatusWord(input.bools[field.key]);
  });

  return values;
}

function writeCommonAreaFromValues(area, values) {
  setWords(area, 10000, [values.shift]);
  setWords(area, 10001, stringToWords(values.operator, 10));
  setWords(area, 10011, uint32ToWords(values.modelNo));
  setWords(area, 10013, uint64ToWords(values.componentNo));
  setWords(area, 10020, dateTimeToWords(new Date()));
  setWords(area, 10030, [values.total]);
  setWords(area, 10031, [values.ok]);
  setWords(area, 10032, [values.notOk]);
}

function buildManualInspectionArea(values) {
  const area = Array.from({ length: WRITE_COUNT }, () => 0);
  writeCommonAreaFromValues(area, values);

  FLOAT_FIELDS.forEach(([key, , stationNo, offset, specKey]) => {
    writeFloatParameter(area, stationBase(stationNo) + offset, SPECS[specKey], values.floats[key]);
  });

  BOOL_FIELDS.forEach(field => {
    setWords(area, stationBase(field.station) + field.offset, [toStatusWord(values.bools[field.key])]);
  });

  setWords(area, stationBase(3) + 10, stringToWords(values.qrVerifierValue, 10));
  return area;
}

async function writeManualInspection(config, values, verbose = false) {
  const area = buildManualInspectionArea(values);
  await writeWordsInChunks(config, AREA_START, area, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function writeManualRange(config, values, rangeKey, verbose = false) {
  const range = STATION_WRITE_RANGES[rangeKey];
  if (!range) throw new Error(`Unknown write range ${rangeKey}`);
  const area = buildManualInspectionArea(values);
  const offset = range.start - AREA_START;
  const words = area.slice(offset, offset + range.count);
  await writeWordsInChunks(config, range.start, words, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function resetAllRegisters(config, verbose = false) {
  const words = Array.from({ length: WRITE_COUNT }, () => 0);
  await writeWordsInChunks(config, AREA_START, words, verbose
    ? (chunkStart, count) => console.log(`Resetting ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error("Invalid JSON request body"));
      }
    });
    request.on("error", reject);
  });
}

function renderWriteUi(config) {
  const fieldJson = JSON.stringify({ floats: FLOAT_FIELDS, bools: BOOL_FIELDS, models: MODEL_NUMBERS });
  const stateJson = JSON.stringify(lastManualValues);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PLC Write Panel</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #eef3f8; color: #102033; }
    header { height: 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; background: #ffffff; border-bottom: 1px solid #cfd8e3; position: sticky; top: 0; z-index: 2; }
    h1 { margin: 0; font-size: 18px; letter-spacing: .04em; }
    main { padding: 16px; display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; }
    section { background: #ffffff; border: 1px solid #ccd6e2; border-radius: 8px; overflow: hidden; }
    h2 { margin: 0; padding: 10px 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; background: #e6edf4; border-bottom: 1px solid #ccd6e2; }
    .body { padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    label { display: grid; gap: 5px; font-size: 12px; font-weight: 700; color: #34465c; }
    input, select { width: 100%; height: 36px; border: 1px solid #b9c5d4; border-radius: 6px; padding: 0 10px; font-size: 14px; background: #fff; color: #102033; }
    .check-row { display: grid; grid-template-columns: minmax(0,1fr) 104px; align-items: center; gap: 10px; min-height: 34px; padding: 7px 8px; border: 1px solid #d7e0ea; border-radius: 6px; background: #f8fafc; }
    .check-row span { font-size: 12px; font-weight: 700; color: #34465c; }
    .actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
    .station-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px; }
    .station-actions button { background: #0f4c8a; color: white; }
    .reset { background: #b91c1c !important; color: white; }
    button { height: 38px; border: 0; border-radius: 7px; padding: 0 14px; font-size: 14px; font-weight: 800; cursor: pointer; }
    #submit { background: #12853c; color: white; }
    #resetAll { background: #b91c1c; color: white; }
    #randomize { background: #24364c; color: white; }
    #status { font-size: 13px; font-weight: 700; color: #4b5f76; }
    .muted { color: #64748b; font-size: 12px; }
    .span2 { grid-column: 1 / -1; }
    .status-0 { border-color: #cbd5e1; color: #64748b; }
    .status-1 { border-color: #2563eb; color: #1d4ed8; }
    .status-2 { border-color: #f97316; color: #ea580c; }
    .status-3, .status-5 { border-color: #dc2626; color: #b91c1c; }
    .status-4 { border-color: #16a34a; color: #15803d; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>PLC Write Panel</h1>
      <div class="muted">HTTP :${WRITE_UI_PORT} -> PLC ${config.host}:${config.port} / ${config.device}${AREA_START}-${config.device}${MODEL_END}</div>
    </div>
    <button id="submit" type="button">Write Common</button>
  </header>
  <main>
    <section>
      <h2>Common Area</h2>
      <div class="body grid">
        <label>Model No
          <select id="modelNo"></select>
        </label>
        <label>Component No
          <input id="componentNo" inputmode="numeric" pattern="[0-9]*" />
        </label>
        <label class="check-row span2"><span>Auto unique component number after each submit</span><input id="autoComponentNo" type="checkbox" /></label>
        <label>Shift
          <input id="shift" type="number" min="1" max="3" step="1" />
        </label>
        <label>Operator
          <input id="operator" maxlength="20" />
        </label>
        <label>Total
          <input id="total" type="number" min="0" step="1" />
        </label>
        <label>OK
          <input id="ok" type="number" min="0" step="1" />
        </label>
        <label>NOT OK
          <input id="notOk" type="number" min="0" step="1" />
        </label>
        <label class="span2">QR Verifier Value
          <input id="qrVerifierValue" maxlength="20" />
        </label>
        <div class="actions span2">
          <button id="randomize" type="button">Randomize Actuals</button>
          <button id="resetAll" type="button">Reset All 0</button>
          <span id="status">Ready</span>
        </div>
      </div>
    </section>
    <section>
      <h2>Station Wise Write</h2>
      <div class="body station-actions">
        <button type="button" data-write-range="1">Write Station 1</button>
        <button type="button" data-write-range="2">Write Station 2</button>
        <button type="button" data-write-range="3">Write Station 3</button>
        <button type="button" data-write-range="4">Reset Station 4</button>
        <button type="button" data-write-range="5">Write Station 5</button>
        <button type="button" data-write-range="6">Write Station 6</button>
      </div>
    </section>
    <section>
      <h2>Float Actual Values</h2>
      <div id="floatFields" class="body grid"></div>
    </section>
    <section class="span2">
      <h2>Boolean Results</h2>
      <div id="boolFields" class="body grid"></div>
    </section>
  </main>
  <script>
    const meta = ${fieldJson};
    let state = ${stateJson};
    const $ = (id) => document.getElementById(id);
    const status = $("status");

    function numberValue(id) {
      const value = Number($(id).value);
      return Number.isFinite(value) ? value : 0;
    }

    function statusOptions(selected) {
      const options = [
        [0, "0 - None"],
        [1, "1 - Ready"],
        [2, "2 - Loading"],
        [3, "3 - Fail"],
        [4, "4 - Pass"],
        [5, "5 - Fail"],
      ];
      return options.map(([value, label]) => {
        return '<option value="' + value + '"' + (Number(selected) === value ? " selected" : "") + ">" + label + "</option>";
      }).join("");
    }

    function refreshStatusClass(input) {
      input.className = "status-" + input.value;
    }

    function fillForm() {
      $("modelNo").innerHTML = meta.models.map(model => '<option value="' + model + '">' + (model === 0 ? "0 - None" : model) + '</option>').join("");
      ["shift", "operator", "componentNo", "total", "ok", "notOk", "qrVerifierValue"].forEach(id => { $(id).value = state[id]; });
      $("modelNo").value = state.modelNo;
      $("autoComponentNo").checked = state.autoComponentNo;
      $("floatFields").innerHTML = meta.floats.map(([key, label, station, offset, spec]) => {
        return '<label>' + label + '<input data-float="' + key + '" type="number" step="0.001" value="' + state.floats[key] + '" /><span class="muted">D' + (10000 + ({1:100,2:200,3:300,4:400,5:500,6:600}[station]) + offset + 4) + ' actual</span></label>';
      }).join("");
      $("boolFields").innerHTML = meta.bools.map(field => {
        const value = Number(state.bools[field.key] || 0);
        return '<label class="check-row"><span>' + field.label + '</span><select data-bool="' + field.key + '" class="status-' + value + '">' + statusOptions(value) + '</select></label>';
      }).join("");
      document.querySelectorAll("[data-bool]").forEach(input => {
        input.addEventListener("change", () => refreshStatusClass(input));
        refreshStatusClass(input);
      });
    }

    function collectForm() {
      const floats = {};
      const bools = {};
      document.querySelectorAll("[data-float]").forEach(input => floats[input.dataset.float] = Number(input.value));
      document.querySelectorAll("[data-bool]").forEach(input => bools[input.dataset.bool] = Number(input.value));
      return {
        shift: numberValue("shift"),
        operator: $("operator").value,
        modelNo: numberValue("modelNo"),
        componentNo: $("componentNo").value.replace(/\\D/g, ""),
        autoComponentNo: $("autoComponentNo").checked,
        total: numberValue("total"),
        ok: numberValue("ok"),
        notOk: numberValue("notOk"),
        qrVerifierValue: $("qrVerifierValue").value,
        floats,
        bools,
      };
    }

    function randomBetween(min, max) {
      return Number((Math.random() * (max - min) + min).toFixed(3));
    }

    $("randomize").addEventListener("click", () => {
      const ranges = {
        outerDiameter: [34.960, 35.040],
        overallLength: [465.850, 466.150],
        dowelLength: [458.850, 459.150],
        apg122Diameter: [12.160, 12.240],
        gaugeDowelToDowel: [445.134, 445.135],
        plug: [14.285, 14.311],
        dowel: [4.950, 5.010],
        ball: [6.285, 6.310],
      };
      document.querySelectorAll("[data-float]").forEach(input => {
        const field = meta.floats.find(item => item[0] === input.dataset.float);
        const range = ranges[field[4]];
        input.value = randomBetween(range[0], range[1]);
      });
    });

    async function postWrite(path, payload, successPrefix) {
      status.textContent = successPrefix + "...";
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Write failed");
        if (data.values) {
          state = data.values;
          fillForm();
        }
        status.textContent = successPrefix + " OK at " + new Date(data.updatedAt).toLocaleTimeString();
      } catch (error) {
        status.textContent = error.message;
      }
    }

    $("submit").addEventListener("click", async () => {
      await postWrite("/api/write-range/common", collectForm(), "Common write");
    });

    document.querySelectorAll("[data-write-range]").forEach(button => {
      button.addEventListener("click", async () => {
        await postWrite("/api/write-range/" + button.dataset.writeRange, collectForm(), button.textContent);
      });
    });

    $("resetAll").addEventListener("click", async () => {
      if (!confirm("Reset all PLC registers D10000-D10699 to 0?")) return;
      await postWrite("/api/reset", {}, "Reset all");
    });

    fillForm();
  </script>
</body>
</html>`;
}

async function handleWriteUiRequest(request, response, config) {
  const url = new URL(request.url, `http://${request.headers.host || `localhost:${WRITE_UI_PORT}`}`);

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(renderWriteUi(config));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    jsonResponse(response, 200, { values: lastManualValues, updatedAt: new Date().toISOString() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/write") {
    try {
      const payload = await readJsonBody(request);
      const values = normalizeManualValues(payload);
      await writeManualInspection(config, values, process.argv.includes("--verbose"));
      lastManualValues = values;
      if (values.autoComponentNo) {
        nextComponentNo = BigInt(values.componentNo) + 1n;
        lastManualValues = { ...values, componentNo: nextComponentNo.toString() };
      }
      jsonResponse(response, 200, {
        ok: true,
        message: "PLC write complete",
        values: lastManualValues,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(response, 500, { ok: false, message, updatedAt: new Date().toISOString() });
    }
    return;
  }

  const rangeMatch = url.pathname.match(/^\/api\/write-range\/([^/]+)$/);
  if (request.method === "POST" && rangeMatch) {
    try {
      const payload = await readJsonBody(request);
      const rangeKey = rangeMatch[1];
      const values = normalizeManualValues(payload);
      await writeManualRange(config, values, rangeKey, process.argv.includes("--verbose"));
      lastManualValues = values;
      if (values.autoComponentNo && rangeKey === "common") {
        nextComponentNo = BigInt(values.componentNo) + 1n;
        lastManualValues = { ...values, componentNo: nextComponentNo.toString() };
      }
      jsonResponse(response, 200, {
        ok: true,
        message: `${STATION_WRITE_RANGES[rangeKey]?.label || rangeKey} write complete`,
        values: lastManualValues,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(response, 500, { ok: false, message, updatedAt: new Date().toISOString() });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    try {
      await resetAllRegisters(config, process.argv.includes("--verbose"));
      lastManualValues = makeZeroManualValues();
      jsonResponse(response, 200, {
        ok: true,
        message: `Reset ${config.device}${AREA_START}-${config.device}${MODEL_END} complete`,
        values: lastManualValues,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonResponse(response, 500, { ok: false, message, updatedAt: new Date().toISOString() });
    }
    return;
  }

  jsonResponse(response, 404, { ok: false, message: "Not found" });
}

function startWriteUiServer() {
  const config = makeWriteConfig();
  const server = http.createServer((request, response) => {
    handleWriteUiRequest(request, response, config).catch(error => {
      jsonResponse(response, 500, { ok: false, message: error.message });
    });
  });

  server.listen(WRITE_UI_PORT, () => {
    console.log(`PLC write UI: http://localhost:${WRITE_UI_PORT}`);
    console.log(`Writing to PLC ${config.host}:${config.port}, device ${config.device}, range ${config.device}${AREA_START}-${config.device}${MODEL_END}`);
  });
}

function buildRandomInspectionArea() {
  const runningModels = MODEL_NUMBERS.filter(modelNo => modelNo !== 0);
  const modelNo = runningModels[randInt(0, runningModels.length - 1)];
  const area = Array.from({ length: WRITE_COUNT }, () => 0);

  writeCommonArea(area, modelNo);

  writeStation1(area, stationBase(1));
  writeStation2(area, stationBase(2));
  writeStation3(area, stationBase(3), modelNo);
  writeStation5(area, stationBase(5));
  writeStation6(area, stationBase(6));

  return area;
}

async function writeOnce(config, cycleNo, verbose) {
  const area = buildRandomInspectionArea();
  const startAddress = AREA_START;
  const endAddress = startAddress + area.length - 1;

  console.log(`[${new Date().toISOString()}] Cycle ${cycleNo}: writing ${config.device}${startAddress}-${config.device}${endAddress}`);

  await writeWordsInChunks(config, startAddress, area, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function main() {
  const config = makeWriteConfig();
  const probeOnly = process.argv.includes("--probe");
  const once = process.argv.includes("--once") || probeOnly;
  const verbose = process.argv.includes("--verbose") || probeOnly;
  const intervalMs = envNumber("PLC_WRITE_INTERVAL_MS", DEFAULT_WRITE_INTERVAL_MS);
  const errorDelayMs = envNumber("PLC_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);

  console.log(`Writing random inspection data to ${config.host}:${config.port}`);
  console.log(`Protocol: MC 3E binary, device ${config.device}, universal layout, range ${config.device}${AREA_START}-${config.device}${MODEL_END}`);
  console.log(`Chunk size: ${config.chunkSize} registers, chunk delay: ${config.chunkDelayMs}ms, retries: ${config.chunkRetries}`);
  console.log(once ? "Mode: one write" : `Mode: continuous write every ${intervalMs}ms`);

  if (probeOnly) console.log("Probe mode: writing only SHIFT at D10000.");

  if (probeOnly) {
    await writeWordsInChunks(config, AREA_START, [randInt(1, 3)], (chunkStart, count) => {
      console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`);
    });
    console.log("Probe write complete.");
    return;
  }

  let cycleNo = 1;
  while (true) {
    try {
      await writeOnce(config, cycleNo, verbose);
      console.log(`[${new Date().toISOString()}] Cycle ${cycleNo}: write complete`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] Cycle ${cycleNo}: PLC write failed: ${message}`);
      if (once) throw error;
      console.error(`[${new Date().toISOString()}] Waiting ${errorDelayMs}ms before retry`);
      await sleep(errorDelayMs);
    }

    if (once) return;
    cycleNo += 1;
    await sleep(intervalMs);
  }
}

if (process.argv.includes("--server") || process.argv.includes("--ui")) {
  startWriteUiServer();
} else {
  main().catch(error => {
    console.error("PLC write failed:", error.message);
    process.exitCode = 1;
  });
}
