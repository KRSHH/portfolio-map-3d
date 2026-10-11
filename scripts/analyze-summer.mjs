// One-off analysis: decode SummerTime .bin files (Draco) via draco3d and report
// bounds, counts and instance positions, so map overlays can be placed in town coordinates.
// Usage: node scripts/analyze-summer.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import draco3d from "draco3d";

const GEO = "public/summer/geometries";
const asJson = process.argv.includes("--json");

const readBin = (file) => {
  const buf = fs.readFileSync(path.join(GEO, file));
  const headerLen = parseInt(buf.subarray(0, 10).toString("ascii"), 10);
  const header = JSON.parse(buf.subarray(10, 10 + headerLen).toString("utf8"));
  return { header, payload: buf.subarray(10 + headerLen) };
};

const TYPED = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array"];

async function main() {
  const decoderModule = await draco3d.createDecoderModule({});
  const decoder = new decoderModule.Decoder();
  const out = {};
  for (const file of fs.readdirSync(GEO).filter((f) => f.endsWith(".bin")).sort()) {
    const { header, payload } = readBin(file);
    const buffer = new decoderModule.DecoderBuffer();
    buffer.Init(new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength), payload.length);
    const gtype = decoder.GetEncodedGeometryType(buffer);
    const isMesh = gtype === decoderModule.TRIANGULAR_MESH;
    const geo = isMesh ? new decoderModule.Mesh() : new decoderModule.PointCloud();
    const ok = isMesh ? decoder.DecodeBufferToMesh(buffer, geo) : decoder.DecodeBufferToPointCloud(buffer, geo);
    if (!ok) {
      out[file] = { error: "decode failed", header };
      continue;
    }
    const attrs = {};
    const n = geo.num_attributes();
    let positions = null;
    for (let i = 0; i < n; i++) {
      const att = decoder.GetAttributeByUniqueId(geo, i);
      const name = header.attributes[i]?.[0] ?? `attr${i}`;
      const count = geo.num_points();
      const size = att.num_components();
      attrs[name] = { count, size, type: TYPED[header.attributes[i]?.[1] ?? 7] };
      if (name === "position") {
        const arr = new Float32Array(count * size);
        // draco3d JS: GetAttributeFloatForAllPoints
        decoderModule._malloc ? null : null;
        const tmp = new decoderModule.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(geo, att, tmp);
        for (let v = 0; v < count * size; v++) arr[v] = tmp.GetValue(v);
        decoderModule.destroy(tmp);
        positions = { arr, count, size };
      }
    }
    const entry = { type: header.type, kind: isMesh ? "mesh" : "points", attrs, userData: header.userData ?? null };
    if (positions && positions.size >= 3) {
      const { arr, count } = positions;
      let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
      for (let v = 0; v < count; v++) {
        const x = arr[v * 3], y = arr[v * 3 + 1], z = arr[v * 3 + 2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
      }
      entry.bounds = { min: [minX, minY, minZ].map((n) => +n.toFixed(2)), max: [maxX, maxY, maxZ].map((n) => +n.toFixed(2)) };
      // For instance-data files, list every position (they are few).
      if (header.type === 1 || file.includes("instances")) {
        const pts = [];
        for (let v = 0; v < count; v++) pts.push([+arr[v * 3].toFixed(2), +arr[v * 3 + 1].toFixed(2), +arr[v * 3 + 2].toFixed(2)]);
        entry.instances = pts;
      }
    }
    // Terrain height samples on a coarse grid for placement (nearest vertex).
    if (file === "terrain.bin" && positions) {
      const { arr, count } = positions;
      const heights = {};
      for (let gx = -70; gx <= 70; gx += 5) {
        for (let gz = -70; gz <= 70; gz += 5) {
          let best = 1e12, by = 0;
          for (let v = 0; v < count; v++) {
            const dx = arr[v * 3] - gx, dz = arr[v * 3 + 2] - gz;
            const d = dx * dx + dz * dz;
            if (d < best) { best = d; by = arr[v * 3 + 1]; }
          }
          heights[`${gx},${gz}`] = +by.toFixed(2);
        }
      }
      entry.heightGrid = heights;
    }
    decoderModule.destroy(geo);
    decoderModule.destroy(buffer);
    out[file] = entry;
  }
  decoderModule.destroy(decoder);
  if (asJson) fs.writeFileSync("C:/Users/Krish/AppData/Local/Temp/opencode/summer-geo.json", JSON.stringify(out, null, 1));
  // Human-readable summary
  for (const [f, e] of Object.entries(out)) {
    if (e.error) { console.log(`${f}: ERROR ${e.error}`); continue; }
    const names = Object.entries(e.attrs).map(([k, v]) => `${k}x${v.size}[${v.count}]`).join(" ");
    const b = e.bounds ? ` bounds x[${e.bounds.min[0]},${e.bounds.max[0]}] y[${e.bounds.min[1]},${e.bounds.max[1]}] z[${e.bounds.min[2]},${e.bounds.max[2]}]` : "";
    console.log(`${f}: ${e.kind} ${names}${b}`);
    if (e.instances) console.log(`   instances(${e.instances.length}): ${JSON.stringify(e.instances)}`);
  }
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
