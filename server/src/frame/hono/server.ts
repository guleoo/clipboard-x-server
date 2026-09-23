import { Config, FrameConfig } from "../config";
import { Lifecycle, SystemError } from "../core";

export namespace Server {
  export interface Application {
    fetch(request: Request, ...rest: unknown[]): Response | Promise<Response>;
  }

  export interface Listener {
    readonly hostname: string;
    readonly port: number;
    readonly url: URL;
    stop(force?: boolean): Promise<void>;
  }

  interface ManagedServer {
    readonly server: Bun.Server<unknown>;
    unregister(): void;
    stopPromise?: Promise<void>;
  }

  let current: ManagedServer | undefined;
  export let url: URL | undefined;

  function stopManaged(target: ManagedServer, force = false): Promise<void> {
    if (target.stopPromise) return target.stopPromise;
    if (current !== target) return Promise.resolve();
    url = undefined;
    target.stopPromise = Promise.resolve(target.server.stop(force)).then(
      () => {
        target.unregister();
        if (current === target) current = undefined;
      },
      (error) => {
        target.stopPromise = undefined;
        if (current === target) url = target.server.url;
        throw error;
      },
    );
    return target.stopPromise;
  }

  export async function listen(application: Application): Promise<Listener> {
    if (current) throw new SystemError("Server is already listening");
    const { hostname, port: configuredPort, shutdownTimeoutMillis, tls } = FrameConfig.App;
    const server = Bun.serve({
      hostname,
      port: configuredPort,
      ...(tls?.certFile && tls.keyFile ? {
        tls: {
          cert: Bun.file(Config.resolvePath(tls.certFile)),
          key: Bun.file(Config.resolvePath(tls.keyFile)),
        },
      } : {}),
      fetch: application.fetch,
    });
    const port = server.port ?? configuredPort;
    const address = new URL(tls?.certFile ? "https://localhost" : "http://localhost");
    address.hostname = hostname;
    address.port = String(port);
    const target: ManagedServer = { server, unregister() {} };

    try {
      target.unregister = Lifecycle.register({
        name: "http-server",
        on: "shutdown",
        phase: "quiesce",
        order: 10,
        timeout: shutdownTimeoutMillis,
        event: () => stopManaged(target),
        onTimeout: () => {
          void server.stop(true);
          return true;
        },
      });
    } catch (error) {
      await server.stop(true);
      throw error;
    }

    current = target;
    url = address;
    return {
      hostname,
      port,
      url: address,
      stop: (force) => stopManaged(target, force),
    };
  }

  export function stop(force?: boolean): Promise<void> {
    return current ? stopManaged(current, force) : Promise.resolve();
  }
}
