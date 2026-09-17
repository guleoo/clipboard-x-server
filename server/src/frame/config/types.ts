export interface ConfigFieldNameMapper {
  readonly name: string;
  toTargetName(sourceName: string): string;
  toSourceName(targetName: string): string;
}

export type BuiltinFieldNameMapperName =
  | "identity"
  | "snake_case_to_camel_case"
  | "kebab_case_to_camel_case";

export type ConfigPrimitive = string | number | boolean | null;
export type ConfigValue = ConfigPrimitive | ConfigObject | ConfigValue[];
export type ConfigObject = { [key: string]: ConfigValue };
export type RawConfigObject = Record<string, unknown>;

export interface LoadYamlConfigOptions {
  readonly filePath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly mode?: string;
  /** Merge the sibling `<name>-<mode>.yaml` file when mode is set. Defaults to true. */
  readonly mergeModeFile?: boolean;
  /** Merge files declared by the YAML `import` field. Defaults to true. */
  readonly mergeImportFiles?: boolean;
  readonly context?: ConfigObject;
  readonly fieldNameMapper?:
    | BuiltinFieldNameMapperName
    | (string & {});
}

export interface LoadContext {
  readonly env: NodeJS.ProcessEnv;
  readonly stack: readonly string[];
  readonly mergeImportFiles: boolean;
  readonly fieldNameMapper: ConfigFieldNameMapper;
}
