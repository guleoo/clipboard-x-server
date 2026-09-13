import { SystemError, pageSchema, successResultSchema } from "../core";
import { zz } from "../zod";
import {
  describeRoute,
  generateSpecs as generateHonoSpecs,
  openAPIRouteHandler as honoOpenAPIRouteHandler,
  resolver,
  type DescribeRouteOptions,
} from "hono-openapi";

export { describeRoute, resolver } from "hono-openapi";

export const standardOpenApiErrorStatuses = [400, 401, 403, 429, 500] as const;
export type StandardOpenApiErrorStatus =
  (typeof standardOpenApiErrorStatuses)[number];
type Responses = NonNullable<DescribeRouteOptions["responses"]>;
type ResponseMode = "data" | "page" | "ok" | "raw";

export interface OpenApiBaseOptions
  extends Omit<
    DescribeRouteOptions,
    "operationId" | "responses" | "summary" | "tags"
  > {
  readonly tags: string[];
  readonly summary: string;
  readonly operationId: string;
  readonly auth: boolean;
  readonly errors?: false | readonly StandardOpenApiErrorStatus[];
}

export interface OpenApiDataOptions extends OpenApiBaseOptions {
  readonly schema: zz.ZodType;
  readonly responseDescription?: string;
}

export interface OpenApiPageOptions extends OpenApiDataOptions {}

export interface OpenApiOkOptions extends OpenApiBaseOptions {
  readonly responseDescription?: string;
}

export interface OpenApiRawOptions extends OpenApiBaseOptions {
  readonly responses: Responses;
}

const errorDescription: Record<StandardOpenApiErrorStatus, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  429: "Too many requests",
  500: "Internal server error",
};

const errorSchemas = Object.fromEntries(
  standardOpenApiErrorStatuses.map((status) => [
    status,
    zz
      .object({ code: zz.literal(status), msg: zz.string() })
      .meta({ $id: `HttpError${status}Result` }),
  ]),
) as unknown as Record<StandardOpenApiErrorStatus, zz.ZodType>;

const okSchema = zz
  .object({ code: zz.literal(200), msg: zz.string() })
  .meta({ $id: "HttpOkResult" });

const publicErrorStatuses = [400, 500] as const;

function extensions(mode: ResponseMode, auth: boolean) {
  return { "x-response-mode": mode, "x-auth-required": auth };
}

function errorResponses(
  errors: false | readonly StandardOpenApiErrorStatus[] | undefined,
  defaults: readonly StandardOpenApiErrorStatus[],
): Responses {
  const statuses = errors === false ? [] : (errors ?? defaults);
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: errorDescription[status],
        content: { "application/json": { schema: resolver(errorSchemas[status]) } },
      },
    ]),
  );
}

function jsonResponse(schema: zz.ZodType, description: string) {
  return {
    description,
    content: { "application/json": { schema: resolver(schema) } },
  };
}

function data(options: OpenApiDataOptions) {
  const {
    schema,
    responseDescription = "Request succeeded",
    errors,
    auth,
    ...operation
  } = options;
  return describeRoute({
    ...operation,
    ...extensions("data", auth),
    responses: {
      ...errorResponses(
        errors,
        auth ? standardOpenApiErrorStatuses : publicErrorStatuses,
      ),
      200: jsonResponse(successResultSchema(schema), responseDescription),
    },
  });
}

function page(options: OpenApiPageOptions) {
  const {
    schema,
    responseDescription = "Query succeeded",
    errors,
    auth,
    ...operation
  } = options;
  return describeRoute({
    ...operation,
    ...extensions("page", auth),
    responses: {
      ...errorResponses(
        errors,
        auth ? standardOpenApiErrorStatuses : publicErrorStatuses,
      ),
      200: jsonResponse(
        successResultSchema(pageSchema(schema)),
        responseDescription,
      ),
    },
  });
}

function ok(options: OpenApiOkOptions) {
  const {
    responseDescription = "Operation succeeded",
    errors,
    auth,
    ...operation
  } = options;
  return describeRoute({
    ...operation,
    ...extensions("ok", auth),
    responses: {
      ...errorResponses(
        errors,
        auth ? standardOpenApiErrorStatuses : publicErrorStatuses,
      ),
      200: jsonResponse(okSchema, responseDescription),
    },
  });
}

function raw(options: OpenApiRawOptions) {
  const { responses, errors, auth, ...operation } = options;
  return describeRoute({
    ...operation,
    ...extensions("raw", auth),
    responses: { ...errorResponses(errors, []), ...responses },
  });
}

export const openapi = Object.freeze({ data, page, ok, raw });

function assertUniqueOperationIds(
  specs: Awaited<ReturnType<typeof generateHonoSpecs>>,
): void {
  const seen = new Map<string, string>();
  for (const [path, item] of Object.entries(specs.paths)) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (
        !operation ||
        typeof operation !== "object" ||
        !("operationId" in operation) ||
        typeof operation.operationId !== "string"
      ) {
        continue;
      }
      const location = `${method.toUpperCase()} ${path}`;
      const previous = seen.get(operation.operationId);
      if (previous) {
        throw new SystemError(
          `Duplicate OpenAPI operationId "${operation.operationId}": ${previous} and ${location}`,
        );
      }
      seen.set(operation.operationId, location);
    }
  }
}

type SchemaObject = Record<string, unknown>;

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function normalizeRequestBodies(
  specs: Awaited<ReturnType<typeof generateHonoSpecs>>,
): Promise<void> {
  const components = (specs.components ??= {});
  const schemas = (components.schemas ??= {});
  for (const pathItem of Object.values(specs.paths)) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (!isSchemaObject(operation) || !isSchemaObject(operation.requestBody)) continue;
      const requestBody = operation.requestBody;
      requestBody.required ??= true;
      if (!isSchemaObject(requestBody.content)) continue;
      for (const media of Object.values(requestBody.content)) {
        if (!isSchemaObject(media) || !isSchemaObject(media.schema)) continue;
        const schema = media.schema;
        if (typeof schema.toOpenAPISchema !== "function") continue;
        const resolved = (await schema.toOpenAPISchema()) as {
          readonly schema: unknown;
          readonly components?: { readonly schemas?: Record<string, unknown> };
        };
        media.schema = resolved.schema;
        if (resolved.components?.schemas) Object.assign(schemas, resolved.components.schemas);
      }
    }
  }
}

function localDefinitionName(reference: string): string | undefined {
  for (const prefix of ["#/$defs/", "#/components/schemas/"]) {
    if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  }
  return undefined;
}

function normalizeLocalDefinitions(
  specs: Awaited<ReturnType<typeof generateHonoSpecs>>,
): void {
  const components = (specs.components ??= {});
  const schemas = (components.schemas ??= {}) as Record<string, SchemaObject>;
  const normalized = new Set<string>();

  function visit(
    node: unknown,
    aliases: ReadonlyMap<string, string>,
    scope: string,
  ): void {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, aliases, scope);
      return;
    }
    if (!isSchemaObject(node)) return;

    let scopedAliases = aliases;
    const definitions = isSchemaObject(node.$defs) ? node.$defs : undefined;
    if (definitions) {
      const mutable = new Map(aliases);
      scopedAliases = mutable;
      for (const [name, definition] of Object.entries(definitions)) {
        const directReference =
          isSchemaObject(definition) && typeof definition.$ref === "string"
            ? definition.$ref
            : undefined;
        const componentName = `${scope}_${name}`.replace(/[^A-Za-z0-9_.-]/g, "_");
        const reference = directReference ?? `#/components/schemas/${componentName}`;
        mutable.set(name, reference);
        if (!directReference) {
          if (
            schemas[componentName] &&
            JSON.stringify(schemas[componentName]) !== JSON.stringify(definition)
          ) {
            throw new SystemError(`OpenAPI local schema name conflict: ${componentName}`);
          }
          schemas[componentName] = definition as SchemaObject;
        }
      }
      delete node.$defs;
    }

    if (typeof node.$ref === "string") {
      const name = localDefinitionName(node.$ref);
      const replacement = name ? scopedAliases.get(name) : undefined;
      if (replacement) node.$ref = replacement;
      const componentName = localDefinitionName(String(node.$ref));
      if (
        componentName &&
        schemas[componentName] &&
        !normalized.has(componentName)
      ) {
        normalized.add(componentName);
        visit(schemas[componentName], scopedAliases, componentName);
      }
    }
    for (const value of Object.values(node)) visit(value, scopedAliases, scope);
  }

  for (const [path, pathItem] of Object.entries(specs.paths)) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!isSchemaObject(operation)) continue;
      const scope =
        typeof operation.operationId === "string"
          ? operation.operationId
          : `${method}_${path}`;
      visit(operation, new Map(), scope);
    }
  }
}

function assertResolvableReferences(
  specs: Awaited<ReturnType<typeof generateHonoSpecs>>,
): void {
  const schemas = specs.components?.schemas ?? {};
  function inspect(node: unknown, location: string): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) => inspect(item, `${location}[${index}]`));
      return;
    }
    if (!isSchemaObject(node)) return;
    if (
      typeof node.$ref === "string" &&
      node.$ref.startsWith("#/components/schemas/")
    ) {
      const name = node.$ref.slice("#/components/schemas/".length);
      if (!(name in schemas)) {
        throw new SystemError(
          `Unresolved OpenAPI schema reference: ${node.$ref} at ${location}`,
        );
      }
    }
    for (const [key, value] of Object.entries(node)) {
      inspect(value, `${location}.${key}`);
    }
  }
  inspect(specs.paths, "paths");
  inspect(schemas, "components.schemas");
}

async function generateCheckedSpecs(...args: Parameters<typeof generateHonoSpecs>) {
  const specs = await generateHonoSpecs(...args);
  await normalizeRequestBodies(specs);
  normalizeLocalDefinitions(specs);
  assertUniqueOperationIds(specs);
  assertResolvableReferences(specs);
  return specs;
}

export const generateSpecs = generateCheckedSpecs as typeof generateHonoSpecs;

export const openAPIRouteHandler = ((
  ...args: Parameters<typeof honoOpenAPIRouteHandler>
) => {
  const [application, options] = args;
  let specs: Awaited<ReturnType<typeof generateHonoSpecs>> | undefined;
  return async (
    context: Parameters<ReturnType<typeof honoOpenAPIRouteHandler>>[0],
  ) => {
    specs ??= await generateSpecs(application, options, context);
    return context.json(specs);
  };
}) as typeof honoOpenAPIRouteHandler;
