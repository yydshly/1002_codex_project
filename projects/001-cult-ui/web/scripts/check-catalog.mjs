import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = await read("../src/catalog.json");
const audit = await read("../../notes/full-catalog-audit.json");
const previews = await read("../src/upstream/manifest.json");
const examples = await read("../src/upstream/examples.json");
const aliases = await read("../src/upstream/aliases.json");
const expected = [...audit.components, ...audit.appendix.unlistedComponents];
assert.equal(catalog.capabilities.length, expected.length);
assert.equal(
  new Set(catalog.capabilities.map((item) => item.id)).size,
  expected.length,
);
assert.equal(Object.keys(previews).length, expected.length);
assert.equal(
  examples.filter((item) => item.kind === "official").length,
  audit.counts.canonicalExampleEntries,
);
assert.equal(examples.filter((item) => item.kind === "integration").length, 2);
assert.equal(
  Object.keys(aliases).length,
  audit.counts.deprecatedExampleAliases,
);
const names = new Set(examples.map((item) => item.name));
assert.equal(names.size, examples.length);
for (const component of expected) {
  const item = catalog.capabilities.find((item) => item.id === component.id);
  assert.ok(item, `Catalog omits ${component.id}`);
  for (const field of [
    "name",
    "description",
    "mechanism",
    "scenario",
    "source",
    "registryName",
  ])
    assert.ok(item[field]?.length, `${component.id}: missing ${field}`);
  assert.equal(item.registryName, component.registryName);
  assert.ok(previews[item.id]?.examples.length, `No local preview: ${item.id}`);
  for (const example of previews[item.id].examples)
    assert.ok(names.has(example.name), `Unknown example: ${example.name}`);
}
const used = new Set(
  Object.values(previews).flatMap((item) =>
    item.examples.map((example) => example.name),
  ),
);
assert.equal(
  used.size,
  examples.length,
  "Some non-alias examples are inaccessible from the catalog",
);
for (const example of examples) {
  assert.ok(
    !aliases[example.name],
    `Deprecated alias incorrectly counted: ${example.name}`,
  );
  if (example.kind === "official")
    await access(
      new URL(`../src/upstream/vendor/${example.path}`, import.meta.url),
    );
}
console.log(
  `Catalog complete: ${expected.length} components, ${examples.length} local examples (${audit.counts.canonicalExampleEntries} official + 2 integrations), aliases excluded.`,
);
