import { OverviewRepo } from "../repo/overview"

export class OverviewService {
  readonly #repo = new OverviewRepo()
  get(): Readonly<Record<string, unknown>> { return this.#repo.snapshot(Date.now()) }
}

export const overviewService = new OverviewService()
