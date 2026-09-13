import { OverviewRepo } from "./overview.repo"

export class OverviewService {
  constructor(private readonly repo: OverviewRepo) {}
  get(): Readonly<Record<string, unknown>> { return this.repo.snapshot(Date.now()) }
}
