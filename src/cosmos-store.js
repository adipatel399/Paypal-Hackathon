import { seed } from "./domain.js";
const ttl = 7 * 24 * 60 * 60;
const fail = (message, status = 503) =>
  Object.assign(new Error(message), { status });
const clean = (s) => {
  const { _storeEtag, ...state } = s;
  return state;
};
function checked(document) {
  if (Buffer.byteLength(JSON.stringify(document)) > 256 * 1024)
    throw fail(
      "Workspace record is too large. Export evidence and start a new workspace.",
      413,
    );
  return document;
}
export async function consumeBudget(container, kind, limit, now = new Date()) {
  const scope = "system-budgets",
    id = `${kind}-${now.toISOString().slice(0, 10)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    let resource;
    try {
      ({ resource } = await container.item(id, scope).read());
    } catch (e) {
      if (e.code !== 404) throw e;
    }
    if (!resource) {
      try {
        await container.items.create({
          id,
          scope,
          count: 1,
          ttl: 8 * 24 * 60 * 60,
        });
        return;
      } catch (e) {
        if (e.code === 409) continue;
        throw e;
      }
    }
    if (resource.count >= limit)
      throw fail(
        "The shared free-demo daily limit has been reached. Please try again tomorrow.",
        429,
      );
    try {
      await container
        .item(id, scope)
        .replace(
          { id, scope, count: resource.count + 1, ttl: 8 * 24 * 60 * 60 },
          { accessCondition: { type: "IfMatch", condition: resource._etag } },
        );
      return;
    } catch (e) {
      if (e.code === 412) continue;
      throw e;
    }
  }
  throw fail("The demo is busy. Wait briefly and try again.", 429);
}
export async function createCosmosStore(container, scope, mode = "demo") {
  if (mode !== "demo")
    throw fail(
      "Hosted sandbox payments require a separate verified deployment. Hosted workspaces currently simulate payments.",
    );
  let cache;
  async function refresh() {
    const { resource } = await container.item("state", scope).read();
    if (!resource)
      throw Object.assign(new Error("Workspace not found"), { code: 404 });
    cache = { ...resource.state, _storeEtag: resource._etag };
  }
  try {
    await refresh();
  } catch (e) {
    if (e.code !== 404) throw e;
    await consumeBudget(container, "new-workspaces", 1000);
    try {
      await container.items.create(
        checked({ id: "state", scope, state: seed(mode), ttl }),
      );
    } catch (e) {
      if (e.code !== 409) throw e;
    }
    await refresh();
  }
  return {
    refresh,
    read: () => structuredClone(cache),
    async save(state) {
      if (!state._storeEtag)
        throw fail("The workspace changed. Reload before trying again.", 409);
      try {
        const { resource } = await container
          .item("state", scope)
          .replace(checked({ id: "state", scope, state: clean(state), ttl }), {
            accessCondition: { type: "IfMatch", condition: state._storeEtag },
          });
        state._storeEtag = resource._etag;
        cache = structuredClone(state);
      } catch (e) {
        if (e.code === 412)
          throw fail(
            "The workspace changed in another request. Reload before trying again.",
            409,
          );
        throw e;
      }
    },
    async archive(state) {
      await consumeBudget(container, "archives", 1000);
      try {
        await container.items.create(
          checked({
            id: `archive-${state.id}`,
            scope,
            state: clean(state),
            ttl,
          }),
        );
      } catch (e) {
        if (e.code !== 409) throw e;
      }
    },
    async webhook() {
      throw fail("Hosted payment webhooks are not enabled.");
    },
  };
}
