// Generate trial meshes using the public RayDIY generator module (v1.2.3).
// The generated geometry is attributed in README.md.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [modulePath, output] = process.argv.slice(2);
if (!modulePath || !output) {
  throw new Error('Usage: node generate.mjs PATH_TO_CLIP_MODULE OUTPUT');
}
const { buildTriangles, validate, toSTL } = await import(
  pathToFileURL(resolve(modulePath))
);
await mkdir(output, { recursive: true });

const trials = [
  { name: 'SHT41', width: 10.5, length: 13 },
  { name: 'RAK', width: 29, length: 40 },
];

for (const { name, width, length } of trials) {
  for (const allowance of [0.25, 0.4, 0.55]) {
    const opening = width + allowance;
    const generatorWidth = Math.max(15, opening);
    const params = {
      pcbSize: generatorWidth,
      pcbThickness: 1 + allowance,
      distance: 5,
      clipThickness: 4,
      supportA: 0,
      supportB: 0,
    };
    const errors = validate(params);
    if (errors.length) throw new Error(JSON.stringify(errors));

    const triangles = buildTriangles(params);
    // Narrow only the span between the jaws. Keep the original hook and
    // outside wall widths. Transform into a side-down print pose.
    const right = 1.5 + generatorWidth;
    for (let i = 0; i < triangles.length; i += 3) {
      const x = triangles[i];
      const height = triangles[i + 1] + 9 + params.pcbThickness;
      const depth = triangles[i + 2];
      const across =
        x < 1.5 ? x :
        x > right ? x - generatorWidth + opening :
        1.5 + (x - 1.5) * opening / generatorWidth;
      triangles[i] = across;
      triangles[i + 1] = height;
      triangles[i + 2] = depth;
    }
    const tag = `${name}_${Math.round(allowance * 100)}`;
    await writeFile(join(output, `${tag}_clip.stl`), Buffer.from(toSTL(triangles)));
    await writeFile(join(output, `${tag}.json`), JSON.stringify({
      name, width, length, allowance, opening,
      anchorStart: 1.5 + (3 + generatorWidth / 3) * opening / generatorWidth,
      anchorEnd: opening + 3.5,
    }, null, 2));
  }
}
