import { Temporal } from "temporal-polyfill";

export enum Zone {
  UTC = "UTC",
  China = "Asia/Shanghai",
  Taiwan = "Asia/Taipei",
  Vietnam = "Asia/Ho_Chi_Minh",
}

let defaultZone: string = Zone.UTC;
let zoneInitialized = false;
let serializationInstalled = false;

export class ZoneError extends RangeError {
  override readonly name = "ZoneError";
  constructor(readonly zone: string, message: string) {
    super(message);
  }
}

export function validZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function assertZone(value: string): void {
  if (!validZone(value)) throw new ZoneError(value, `Invalid time zone: ${value}`);
}

export function initZone(value: string): void {
  if (zoneInitialized) throw new ZoneError(value, "Time zone is already initialized");
  assertZone(value);
  defaultZone = value;
  zoneInitialized = true;
}

export function zone(): string {
  if (!zoneInitialized) throw new ZoneError("", "Time zone is not initialized");
  return defaultZone;
}

export type PlainDateTime = Temporal.PlainDateTime;
export type PlainDate = Temporal.PlainDate;
export type PlainTime = Temporal.PlainTime;
export type Instant = Temporal.Instant;
export type ZonedDateTime = Temporal.ZonedDateTime;

export const PlainDateTime = Temporal.PlainDateTime;
export const PlainDate = Temporal.PlainDate;
export const PlainTime = Temporal.PlainTime;
export const Instant = Temporal.Instant;
export const ZonedDateTime = Temporal.ZonedDateTime;

type DateValue = Instant | PlainDateTime | PlainDate | ZonedDateTime;

export interface DateFormatOptions {
  readonly precision?: 0 | 1 | 2 | 3;
}

export interface ZonedDateFormatOptions extends DateFormatOptions {
  readonly zone?: string;
}

export function withZone(value: DateValue, targetZone?: string): ZonedDateTime {
  const selected = targetZone ?? zone();
  if (targetZone !== undefined) assertZone(targetZone);
  if (value instanceof Instant) return value.toZonedDateTimeISO(selected);
  if (value instanceof PlainDateTime) return value.toZonedDateTime(selected);
  if (value instanceof PlainDate) {
    return value.toPlainDateTime(PlainTime.from("00:00:00")).toZonedDateTime(selected);
  }
  return value.withTimeZone(selected);
}

export function now(): ZonedDateTime {
  return Temporal.Now.instant().toZonedDateTimeISO(zone());
}

export function today(): PlainDate {
  return now().toPlainDate();
}

const OFFSET = /[+-]\d{2}:\d{2}$/;
const NAMED_ZONE = /\[[^\]]+\]$/;
const TOKENS = [
  "YYYY",
  "yyyy",
  "SSS",
  "XXX",
  "ZZ",
  "SS",
  "MM",
  "dd",
  "HH",
  "mm",
  "ss",
  "S",
] as const;
const TOKEN_PATTERN: Record<(typeof TOKENS)[number], string> = {
  YYYY: "(?<year>\\d{4})",
  yyyy: "(?<year>\\d{4})",
  MM: "(?<month>\\d{2})",
  dd: "(?<day>\\d{2})",
  HH: "(?<hour>\\d{2})",
  mm: "(?<minute>\\d{2})",
  ss: "(?<second>\\d{2})",
  SSS: "(?<millisecond>\\d{3})",
  SS: "(?<hundredths>\\d{2})",
  S: "(?<tenths>\\d)",
  XXX: "(?<offset>[+-]\\d{2}:\\d{2})",
  ZZ: "(?<offset>[+-]\\d{4})",
};

function hasZone(input: string): boolean {
  return input.endsWith("Z") || OFFSET.test(input) || NAMED_ZONE.test(input);
}

function parsePlainDate(input: string): PlainDate {
  return PlainDate.from(input);
}

function parsePlainTime(input: string): PlainTime {
  return PlainTime.from(input);
}

function parsePlainDateTime(input: string): PlainDateTime {
  return PlainDateTime.from(input.replace(" ", "T"));
}

function parseZonedDateTime(input: string): ZonedDateTime {
  if (input.endsWith("Z") || OFFSET.test(input)) return withZone(Instant.from(input));
  if (NAMED_ZONE.test(input)) return ZonedDateTime.from(input);
  throw new RangeError(`Time zone information is required: ${input}`);
}

function parseInstant(input: string): Instant {
  if (!hasZone(input)) throw new RangeError(`Time zone information is required: ${input}`);
  return NAMED_ZONE.test(input)
    ? ZonedDateTime.from(input).toInstant()
    : Instant.from(input);
}

function customPattern(format: string): RegExp {
  let pattern = "";
  for (let index = 0; index < format.length; ) {
    const token = TOKENS.find((candidate) => format.startsWith(candidate, index));
    if (token) {
      pattern += TOKEN_PATTERN[token];
      index += token.length;
    } else {
      pattern += format[index]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      index += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

function parseCustom(
  input: string,
  format: string,
  options?: ZonedDateFormatOptions,
): ZonedDateTime {
  const groups = customPattern(format).exec(input)?.groups;
  if (!groups) throw new RangeError(`Date value does not match format: ${input}`);
  const milliseconds = groups.millisecond
    ? Number(groups.millisecond)
    : groups.hundredths
      ? Number(groups.hundredths) * 10
      : groups.tenths
        ? Number(groups.tenths) * 100
        : undefined;
  const dateTime = [
    String(Number(groups.year ?? 0)).padStart(4, "0"),
    String(Number(groups.month ?? 1)).padStart(2, "0"),
    String(Number(groups.day ?? 1)).padStart(2, "0"),
  ].join("-") + `T${String(Number(groups.hour ?? 0)).padStart(2, "0")}:${String(Number(groups.minute ?? 0)).padStart(2, "0")}:${String(Number(groups.second ?? 0)).padStart(2, "0")}${milliseconds === undefined ? "" : `.${String(milliseconds).padStart(3, "0")}`}`;

  if (groups.offset) {
    const offset = groups.offset.includes(":")
      ? groups.offset
      : `${groups.offset.slice(0, 3)}:${groups.offset.slice(3)}`;
    return withZone(Instant.from(`${dateTime}${offset}`), options?.zone);
  }
  if (/HH|mm|ss|S{1,3}/.test(format)) {
    return withZone(PlainDateTime.from(dateTime), options?.zone);
  }
  return withZone(PlainDate.from(dateTime.slice(0, 10)), options?.zone);
}

function formatCustom(value: DateValue, format: string, targetZone?: string): string {
  const current = withZone(value, targetZone);
  const milliseconds = String(current.millisecond).padStart(3, "0");
  const replacements: Record<string, string> = {
    YYYY: String(current.year).padStart(4, "0"),
    yyyy: String(current.year).padStart(4, "0"),
    MM: String(current.month).padStart(2, "0"),
    dd: String(current.day).padStart(2, "0"),
    HH: String(current.hour).padStart(2, "0"),
    mm: String(current.minute).padStart(2, "0"),
    ss: String(current.second).padStart(2, "0"),
    SSS: milliseconds,
    SS: milliseconds.slice(0, 2),
    S: milliseconds.slice(0, 1),
    XXX: current.offset,
    ZZ: current.offset.replace(":", ""),
  };
  return format.replace(
    /YYYY|yyyy|SSS|XXX|ZZ|SS|MM|dd|HH|mm|ss|S/g,
    (token) => replacements[token] ?? token,
  );
}

function temporalStringOptions(precision?: 0 | 1 | 2 | 3) {
  return {
    smallestUnit: precision === undefined || precision === 0 ? "second" : "millisecond",
    fractionalSecondDigits:
      precision === undefined || precision === 0 ? undefined : precision,
  } as const;
}

function plainDateTimeString(value: DateValue, options?: DateFormatOptions): string {
  const stringOptions = temporalStringOptions(options?.precision);
  if (value instanceof ZonedDateTime) return value.toPlainDateTime().toString(stringOptions);
  if (value instanceof Instant) {
    return value.toZonedDateTimeISO(Zone.UTC).toPlainDateTime().toString(stringOptions);
  }
  if (value instanceof PlainDate) return `${value.toString()}T00:00:00`;
  return value.toString(stringOptions);
}

function plainTimeString(
  value: DateValue | PlainTime,
  options?: DateFormatOptions,
): string {
  const stringOptions = temporalStringOptions(options?.precision);
  if (value instanceof PlainTime) return value.toString(stringOptions);
  if (value instanceof ZonedDateTime) return value.toPlainTime().toString(stringOptions);
  if (value instanceof Instant) {
    return value.toZonedDateTimeISO(Zone.UTC).toPlainTime().toString(stringOptions);
  }
  if (value instanceof PlainDate) return PlainTime.from("00:00:00").toString(stringOptions);
  return value.toPlainTime().toString(stringOptions);
}

function zonedString(value: DateValue, options?: ZonedDateFormatOptions): string {
  return withZone(value, options?.zone).toString({
    ...temporalStringOptions(options?.precision),
    calendarName: "never",
    timeZoneName: "never",
  });
}

function dateString(value: DateValue, targetZone?: string): string {
  if (value instanceof PlainDate) return value.toString();
  if (value instanceof PlainDateTime) return value.toPlainDate().toString();
  if (value instanceof ZonedDateTime) {
    return (targetZone ? withZone(value, targetZone) : value).toPlainDate().toString();
  }
  return value.toZonedDateTimeISO(targetZone ?? Zone.UTC).toPlainDate().toString();
}

function ansiSqlString(value: DateValue, options?: ZonedDateFormatOptions): string {
  const precision = options?.precision;
  const pattern =
    precision === undefined || precision === 0
      ? "yyyy-MM-dd HH:mm:ss"
      : "yyyy-MM-dd HH:mm:ss.SSS".slice(0, 20 + precision);
  return formatCustom(value, pattern, options?.zone);
}

export const DateFormat = Object.freeze({
  custom: formatCustom,
  date: (value: DateValue, targetZone?: string) => dateString(value, targetZone ?? zone()),
  pdate: (value: DateValue) => dateString(value),
  ptime: plainTimeString,
  pdatetime: plainDateTimeString,
  pdatetime0: (value: DateValue) => plainDateTimeString(value, { precision: 0 }),
  pdatetime3: (value: DateValue) => plainDateTimeString(value, { precision: 3 }),
  utc: (value: DateValue) => zonedString(value, { zone: Zone.UTC }),
  zone: zonedString,
  zone0: (value: DateValue, targetZone?: string) =>
    zonedString(value, { ...(targetZone === undefined ? {} : { zone: targetZone }), precision: 0 }),
  zone3: (value: DateValue, targetZone?: string) =>
    zonedString(value, { ...(targetZone === undefined ? {} : { zone: targetZone }), precision: 3 }),
  trans: (value: DateValue, options?: DateFormatOptions) =>
    zonedString(value, { zone: zone(), ...(options?.precision === undefined ? {} : { precision: options.precision }) }),
  ansisql: ansiSqlString,
  human: (value: DateValue, targetZone?: string) =>
    value instanceof PlainDate
      ? formatCustom(value, "yyyy-MM-dd", targetZone)
      : formatCustom(value, "yyyy-MM-dd HH:mm:ss", targetZone),
});

export const DateParser = Object.freeze({
  custom: parseCustom,
  pdate: parsePlainDate,
  ptime: parsePlainTime,
  pdatetime: parsePlainDateTime,
  utc: (input: string) => withZone(parseInstant(input), Zone.UTC),
  zone: parseZonedDateTime,
  trans: parseZonedDateTime,
  timestamp: (milliseconds: number | string) =>
    Instant.fromEpochMilliseconds(Number(milliseconds)),
  ansisql: (input: string, options?: ZonedDateFormatOptions) =>
    withZone(parsePlainDateTime(input), options?.zone),
  human: (input: string, options?: ZonedDateFormatOptions) =>
    hasZone(input)
      ? withZone(parseInstant(input), options?.zone)
      : withZone(parsePlainDateTime(input), options?.zone),
});

export function installDateSerialization(): void {
  if (serializationInstalled) return;
  serializationInstalled = true;

  Temporal.Instant.prototype.toJSON = function () {
    return DateFormat.trans(this);
  };
  Temporal.ZonedDateTime.prototype.toJSON = function () {
    return DateFormat.trans(this);
  };
  Temporal.PlainDateTime.prototype.toJSON = function () {
    return DateFormat.trans(this);
  };
  Temporal.PlainDate.prototype.toJSON = function () {
    return DateFormat.trans(this);
  };
}

installDateSerialization();
