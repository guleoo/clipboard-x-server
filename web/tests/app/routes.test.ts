import { describe, expect, test } from "bun:test";
import { Engine } from "../../src/frame/router/core";
import { application } from "../../src/routes/app";

describe("application routes", () => {
  test("publishes activity as a settings route and redirects the legacy transfer path", () => {
    const snapshot = Engine.create(application()).get()
    expect(snapshot.routes.find((route) => route.id === "app.activity")).toMatchObject({
      path: "/activity",
      target: { kind: "component", component: "transfers" },
    })
    expect(snapshot.routes.find((route) => route.id === "legacy.transfers")).toMatchObject({
      path: "/transfers",
      target: { kind: "redirect", redirect: "/activity" },
    })
    expect(snapshot.routes.find((route) => route.id === "app.configuration")).toMatchObject({
      path: "/configuration",
      target: { kind: "component", component: "configuration" },
    })
    expect(snapshot.routes.find((route) => route.id === "legacy.retention")).toMatchObject({
      path: "/retention",
      target: { kind: "redirect", redirect: "/configuration" },
    })
  })
});
